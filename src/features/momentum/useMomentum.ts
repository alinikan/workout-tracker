import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  cachePrivate,
  clearPrivateCache,
  mergeMomentum,
  normalizeMomentum,
  readPrivate,
  sameData,
} from "./storage";
import type { MomentumData } from "./types";

type State = {
  owner: string | null;
  access: "checking" | "allowed" | "denied" | "unavailable";
  data: MomentumData | null;
  status: string;
  error: string;
};
const initial = (owner: string | null): State => ({
  owner,
  access: owner ? "checking" : "denied",
  data: null,
  status: "Checking private access",
  error: "",
});

/** Independent sync document + account epoch. A response for account A can
 * never update account B's state. Revision conflicts use the existing three-way
 * merge, then retry CAS; auth failures fail closed instead of showing a cache. */
export function useMomentum(userId: string | null) {
  const [state, setState] = useState<State>(() => initial(userId));
  const current = useRef<State>(state),
    base = useRef<MomentumData | null>(null),
    revision = useRef(0);
  const epoch = useRef(0),
    running = useRef(false),
    pendingCache = useRef(Promise.resolve());
  const liveOwner = useRef(userId);
  liveOwner.current = userId;
  const commit = useCallback((next: State) => {
    current.current = next;
    setState(next);
  }, []);
  const persist = useCallback(
    (owner: string, ticket: number) => {
      pendingCache.current = pendingCache.current
        .catch(() => {})
        .then(async () => {
          if (
            ticket !== epoch.current ||
            liveOwner.current !== owner ||
            !current.current.data ||
            !base.current
          )
            return;
          try {
            await cachePrivate(owner, {
              base: base.current,
              local: current.current.data,
              revision: revision.current,
            });
          } catch {
            if (ticket === epoch.current)
              commit({
                ...current.current,
                error:
                  "Private device cache unavailable. Keep this session open until the server confirms saving.",
              });
          }
          if (ticket !== epoch.current || liveOwner.current !== owner) {
            try {
              clearPrivateCache(owner);
            } catch {
              /* Old account memory is already inaccessible. */
            }
          }
        });
      return pendingCache.current;
    },
    [commit],
  );
  const refresh = useCallback(async () => {
    const owner = liveOwner.current,
      ticket = epoch.current;
    if (!owner || !supabase || running.current) return;
    running.current = true;
    const stillHere = () =>
      ticket === epoch.current && liveOwner.current === owner;
    try {
      if (!navigator.onLine) {
        if (stillHere())
          commit({
            ...current.current,
            status: "Offline draft - keep this session open until synced",
          });
        return;
      }
      const permission = await supabase.rpc("momentum_access");
      if (!stillHere()) return;
      if (permission.error || permission.data !== true) {
        if (permission.data === false || permission.error?.code === "42501") {
          clearPrivateCache();
          base.current = null;
          commit({
            ...initial(owner),
            access: "denied",
            status: "Private access unavailable",
          });
        } else
          commit({
            ...current.current,
            access: current.current.data ? "allowed" : "unavailable",
            status: "Private sync needs attention",
            error:
              "Could not verify private access. Check connection or the administrator migration.",
          });
        return;
      }
      const loaded = await supabase
        .from("momentum_progress")
        .select("data,revision")
        .eq("user_id", owner)
        .maybeSingle();
      if (loaded.error) throw loaded.error;
      if (!stillHere()) return;
      let remote = normalizeMomentum(loaded.data?.data),
        rev = Number(loaded.data?.revision ?? 0);
      if (!base.current) {
        const cached = await readPrivate(owner).catch(() => null);
        if (!stillHere()) return;
        base.current = remote;
        const local = cached
          ? mergeMomentum(cached.base, cached.local, remote)
          : remote;
        commit({
          owner,
          access: "allowed",
          data: local,
          status: sameData(local, remote)
            ? "Private data synced"
            : "Saving private draft",
          error: "",
        });
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        const local = current.current.data;
        if (!local || !base.current || !stillHere()) return;
        const merged = mergeMomentum(base.current, local, remote);
        // Edits made while the write is in flight are merged after acknowledgement.
        if (sameData(merged, remote)) {
          base.current = remote;
          revision.current = rev;
          commit({
            ...current.current,
            data: merged,
            status: "Private data synced",
            error: "",
          });
          break;
        }
        const beforeWrite = local;
        const saved = await supabase.rpc("momentum_save", {
          p_expected_revision: rev,
          p_data: merged,
        });
        if (saved.error) throw saved.error;
        if (!stillHere()) return;
        const response = saved.data as {
          conflict: boolean;
          data: unknown;
          revision: number;
        };
        remote = normalizeMomentum(response.data);
        rev = Number(response.revision);
        if (response.conflict) continue;
        const after = mergeMomentum(beforeWrite, current.current.data!, remote);
        base.current = remote;
        revision.current = rev;
        commit({
          ...current.current,
          data: after,
          status: sameData(after, remote)
            ? "Private data synced"
            : "Saving newer edits",
          error: "",
        });
        if (sameData(after, remote)) break;
      }
      if (stillHere() && current.current.data && base.current) {
        if (!sameData(current.current.data, base.current))
          commit({
            ...current.current,
            status: "Private edits still waiting to sync",
            error:
              "Another save is in progress or new edits are pending. Retry before closing; your session draft is retained.",
          });
        await persist(owner, ticket);
      }
    } catch (error) {
      if (!stillHere()) return;
      if ((error as { code?: string }).code === "42501") {
        clearPrivateCache();
        base.current = null;
        commit({
          ...initial(owner),
          access: "denied",
          status: "Private access revoked",
        });
      } else
        commit({
          ...current.current,
          status: "Private sync failed - retry before closing",
          error:
            "Your latest edit is not confirmed on the server. Keep this session open and retry.",
        });
    } finally {
      if (ticket === epoch.current) running.current = false;
    }
  }, [commit, persist]);
  useEffect(() => {
    epoch.current++;
    running.current = false;
    base.current = null;
    revision.current = 0;
    const previous = current.current.owner;
    if (previous && previous !== userId) {
      try {
        clearPrivateCache();
      } catch {
        /* Memory is still dropped below. */
      }
    }
    commit(initial(userId));
    void refresh();
    const online = () => void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("focus", online);
    document.addEventListener("visibilitychange", visible);
    const interval = window.setInterval(online, 30000);
    return () => {
      epoch.current++;
      running.current = false;
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("focus", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, refresh, commit]);
  const edit = useCallback(
    (update: (data: MomentumData) => MomentumData) => {
      const s = current.current,
        owner = liveOwner.current,
        ticket = epoch.current;
      if (!owner || s.owner !== owner || s.access !== "allowed" || !s.data)
        return;
      const data = update(s.data);
      commit({
        ...s,
        data,
        status: "Private draft saved in this session",
        error: "",
      });
      // Serialize encryption too: a slow older encryption may not overwrite a
      // newer cache. Recheck the account after awaiting each queued operation.
      void persist(owner, ticket);
    },
    [commit, persist],
  );
  useEffect(() => {
    if (
      state.owner !== userId ||
      state.access !== "allowed" ||
      !state.data ||
      sameData(state.data, base.current)
    )
      return;
    const timer = window.setTimeout(() => void refresh(), 500);
    return () => window.clearTimeout(timer);
  }, [state.data, state.owner, state.access, userId, refresh]);
  useEffect(() => {
    // iOS may not fire beforeunload when an app is swiped away. The persistent
    // status message remains the primary instruction to sync before closing.
    const warn = (event: BeforeUnloadEvent) => {
      if (
        current.current.owner === liveOwner.current &&
        current.current.data &&
        !sameData(current.current.data, base.current)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  // Render-time filtering prevents a one-frame leak before effects clear state.
  return {
    ...(state.owner === userId ? state : initial(userId)),
    edit,
    retry: refresh,
  };
}
