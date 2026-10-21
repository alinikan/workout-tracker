import { sameData } from "./syncMerge.ts";

/** Undo only fields still equal to this action's result. A later weight edit or
 * another device's change must not be overwritten by an old Undo notification.
 * Objects/sets are visited field by field, including newly created set rows. */
export function undoUnchangedFields<T>(before: T, after: T, current: T): T {
  if (sameData(before, after)) return current;
  if (sameData(current, after)) return before;
  if (Array.isArray(after) && Array.isArray(current)) {
    const previous = Array.isArray(before) ? before : [];
    return current.map((value, index) => undoUnchangedFields(previous[index], after[index], value)) as T;
  }
  if (after && current && typeof after === "object" && typeof current === "object" &&
      !Array.isArray(after) && !Array.isArray(current)) {
    const previous = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
    const result = { ...current } as Record<string, unknown>;
    for (const key of new Set([...Object.keys(previous), ...Object.keys(after)])) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      const value = undoUnchangedFields(previous[key], (after as Record<string, unknown>)[key], result[key]);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result as T;
  }
  return current;
}

export type SavePresentation = { label: string; detail: string; tone: "calm" | "working" | "attention" };

/** Saving to this browser and syncing to an account are separate guarantees.
 * Never say 'Synced' during auth restoration, an offline edit, or a failed save. */
export function savePresentation({ localError, online, signedIn, status, saved }: {
  localError: string; online: boolean; signedIn: boolean; status: string; saved: boolean;
}): SavePresentation {
  if (localError) return { label: "Device save failed", detail: localError, tone: "attention" };
  if (!saved) return { label: "Preparing device save", detail: "Your device copy is being prepared.", tone: "working" };
  if (!online) return { label: "Saved on this device", detail: "Offline - waiting to sync when connected.", tone: "attention" };
  if (!signedIn) return { label: "Saved on this device", detail: "Sign in from Coach to sync between devices.", tone: "calm" };
  if (status === "loading" || status === "saving") return { label: "Syncing", detail: "Your device copy is saved; cloud sync is in progress.", tone: "working" };
  if (status === "error") return { label: "Saved on this device", detail: "Cloud sync needs attention. Open Coach for details.", tone: "attention" };
  if (status !== "synced") return { label: "Saved on this device", detail: "Waiting for account sync.", tone: "working" };
  return { label: "Synced", detail: "Saved on this device and your account.", tone: "calm" };
}
