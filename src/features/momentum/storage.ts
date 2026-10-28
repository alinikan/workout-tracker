import { mergeProgressChanges, sameData } from "../../lib/syncMerge.ts";
import { emptyMomentum, newLog, type MomentumData } from "./types.ts";
import { newerSharedStart } from "./sharedStart.ts";
import {
  isCalendarDate,
  normalizeProgram,
} from "../../lib/programLifecycle.ts";
import { isHomePlan } from "./trial.ts";

const prefix = "momentum-private-v1:";
type Envelope = { owner: string; iv: number[]; ciphertext: number[] };
type Cached = { base: MomentumData; local: MomentumData; revision: number };
export function normalizeMomentum(value: unknown): MomentumData {
  const empty = emptyMomentum();
  if (!value || typeof value !== "object" || !Object.keys(value).length)
    return empty;
  const { clearance: _removed, ...v } = value as Partial<MomentumData> & {
    clearance?: unknown;
  };
  if (![1, 2].includes(Number(v.schemaVersion)) || !v.profile || !v.journeys)
    throw new Error(
      "Unsupported private record. Do not overwrite it; update the app or contact the administrator.",
    );
  return {
    ...empty,
    ...v,
    schemaVersion: 2,
    sharedProgram:
      v.sharedProgram && isCalendarDate(v.sharedProgram.startedOn)
        ? normalizeProgram(v.sharedProgram, v.sharedProgram.startedOn)
        : undefined,
    profile: { ...empty.profile, ...v.profile },
    // Upgrade old records without erasing attendance, notes, meals or history.
    // Removed setup fields never return through a cache or a conflict response.
    journeys: Object.fromEntries(
      Object.entries(v.journeys).map(([id, j]) => [
        id,
        {
          ...j,
          logs: Object.fromEntries(
            Object.entries(j.logs).map(([key, log]) => [
              key,
              {
                ...log,
                ...(String(log.outcome) === "medical"
                  ? { outcome: "stopped" as const }
                  : {}),
              },
            ]),
          ),
          pauses: Object.fromEntries(
            Object.entries(j.pauses).map(([key, p]) => [
              key,
              {
                ...p,
                reason: "personal" as const,
              },
            ]),
          ),
        },
      ]),
    ),
  };
}
export { sameData };
export function mergeMomentum(
  base: MomentumData,
  local: MomentumData,
  remote: MomentumData,
) {
  // Both devices can create the first log for the same session while offline.
  // An untouched default (note="", comfortable=false) is not a deliberate edit
  // from "undefined". Seed the SAME baseline shape on all three sides so only
  // actual changes compete; explicit later clearing still wins normally.
  const logsByJourney = new Map<string, Map<string, Set<string>>>();
  for (const document of [base, local, remote])
    for (const [id, j] of Object.entries(document.journeys)) {
      const keys = logsByJourney.get(id) ?? new Map<string, Set<string>>();
      for (const [key, entry] of Object.entries(j.logs)) {
        const sets = keys.get(key) ?? new Set<string>();
        Object.keys(entry.sets).forEach((set) => sets.add(set));
        keys.set(key, sets);
      }
      logsByJourney.set(id, keys);
    }
  const withDefaults = (document: MomentumData): MomentumData => ({
    ...document,
    journeys: Object.fromEntries(
      Object.entries(document.journeys).map(([id, j]) => [
        id,
        {
          ...j,
          logs: Object.fromEntries(
            Array.from(logsByJourney.get(id) ?? []).map(([key, sets]) => [
              key,
              {
                ...newLog(),
                ...j.logs[key],
                sets: Object.fromEntries(
                  Array.from(sets).map((set) => [
                    set,
                    Object.assign(
                      {
                        weight: "",
                        reps: "",
                        done: false,
                        skipped: false,
                      },
                      j.logs[key]?.sets[set],
                    ),
                  ]),
                ),
              },
            ]),
          ),
        },
      ]),
    ),
  });
  const merged = mergeProgressChanges(
    withDefaults(base),
    withDefaults(local),
    withDefaults(remote),
  );
  const resetWinner = newerSharedStart(local, remote);
  for (const [id, journey] of Object.entries(merged.journeys)) {
    const a = local.journeys[id],
      b = remote.journeys[id];
    if (isHomePlan(a) || isHomePlan(b)) {
      journey.planVersion = "home-trial-90";
      const choices = [a?.trial, b?.trial].filter(
        (t): t is NonNullable<typeof t> =>
          Boolean(t && Number.isFinite(Date.parse(t.updatedAt))),
      );
      choices.sort(
        (x, y) =>
          Date.parse(y.updatedAt) - Date.parse(x.updatedAt) ||
          (x.id < y.id ? 1 : x.id > y.id ? -1 : 0),
      );
      // Never merge a date from one edit with the time or cancellation from another.
      if (choices[0]) journey.trial = choices[0];
    }
  }
  if (resetWinner) {
    merged.sharedProgram = resetWinner.sharedProgram;
    merged.activeJourneyId = resetWinner.activeJourneyId;
    merged.meals = resetWinner.meals;
    merged.preparation = resetWinner.preparation;
    merged.profile.nextClassDate = resetWinner.profile.nextClassDate;
  }
  const active = merged.activeJourneyId
    ? merged.journeys[merged.activeJourneyId]
    : null;
  if (active?.planVersion === "home-trial-90")
    merged.profile.nextClassDate = active.trial?.date ?? "";
  // A device checking the original meal does not confirm that it ate a new
  // recipe selected by another device. Keep a checkmark only if one side
  // actually checked that final recipe; never count the wrong food as eaten.
  for (const [date, meal] of Object.entries(merged.meals))
    for (const slot of ["breakfast", "lunch", "snack", "dinner"] as const)
      if (
        meal.eaten[slot] &&
        ![local, remote].some(
          (d) =>
            d.meals[date]?.eaten[slot] &&
            (d.meals[date]?.recipes?.[slot] ?? d.meals[date]?.swaps[slot]) ===
              (meal.recipes?.[slot] ?? meal.swaps[slot]),
        )
      )
        meal.eaten[slot] = false;
  return merged;
}

/** Ciphertext survives a page reload; the key is limited to this tab's session.
 * Never load/decrypt until BOTH the current auth user and live allowlist match.
 * Closing the session can lose an offline draft: the UI tells the user to sync
 * before closing. This is intentional rather than keeping readable health data. */
export async function cachePrivate(owner: string, value: Cached) {
  if (!crypto.subtle)
    throw new Error(
      "Private offline saving needs HTTPS or localhost. Keep this page open until synced.",
    );
  let raw = sessionStorage.getItem(`${prefix}key:${owner}`);
  if (!raw) {
    raw = JSON.stringify(
      Array.from(crypto.getRandomValues(new Uint8Array(32))),
    );
    sessionStorage.setItem(`${prefix}key:${owner}`, raw);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(JSON.parse(raw)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  localStorage.setItem(
    `${prefix}data:${owner}`,
    JSON.stringify({
      owner,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
    }),
  );
}
export async function readPrivate(owner: string): Promise<Cached | null> {
  const raw = sessionStorage.getItem(`${prefix}key:${owner}`),
    saved = localStorage.getItem(`${prefix}data:${owner}`);
  if (!raw || !saved) return null;
  const envelope = JSON.parse(saved) as Envelope;
  if (envelope.owner !== owner) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(JSON.parse(raw)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decoded = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(envelope.iv),
      additionalData: new TextEncoder().encode(owner),
    },
    key,
    new Uint8Array(envelope.ciphertext),
  );
  const value = JSON.parse(new TextDecoder().decode(decoded)) as Cached;
  return {
    base: normalizeMomentum(value.base),
    local: normalizeMomentum(value.local),
    revision: value.revision,
  };
}
export function clearPrivateCache(owner?: string) {
  for (const storage of [localStorage, sessionStorage])
    for (const key of Object.keys(storage))
      if (
        owner
          ? key === `${prefix}key:${owner}` || key === `${prefix}data:${owner}`
          : key.startsWith(prefix)
      )
        storage.removeItem(key);
}
