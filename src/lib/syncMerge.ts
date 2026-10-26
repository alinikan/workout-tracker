import { resolveResetConflict } from "./programLifecycle.ts";

/**
 * Three-way merging compares the last synced copy with this device and the server.
 * Unlike an OR merge, it preserves deliberate unchecking, clearing a weight, and
 * reverting a swap. Independent edits on two devices survive together. When both
 * devices edit the same field, the device currently saving wins that field only.
 */
export function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameData(item, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  // PostgreSQL jsonb can reorder keys. Compare values, not serialized order, to
  // avoid rewriting an unchanged account on every background refresh.
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  const otherKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  return keys.length === otherKeys.length && keys.every((key) =>
    Object.hasOwn(right, key) && sameData(left[key], right[key]),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeProgressChanges<T>(base: T, local: T, remote: T): T {
  const resetWinner = resolveResetConflict(base, local, remote);
  if (resetWinner !== undefined) return resetWinner;
  if (sameData(local, base)) return remote;
  if (sameData(remote, base) || sameData(local, remote)) return local;

  // Set numbers are stable array positions. Merging each row lets one device edit
  // set 1 while another completes set 2 without replacing the whole exercise.
  if (Array.isArray(local) && Array.isArray(remote)) {
    const before = Array.isArray(base) ? base : [];
    return Array.from({ length: Math.max(local.length, remote.length) }, (_, index) =>
      mergeProgressChanges(before[index], local[index], remote[index]),
    ) as T;
  }

  if (isObject(local) && isObject(remote)) {
    const before: Record<string, unknown> = isObject(base) ? base : {};
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      const value = mergeProgressChanges(before[key], local[key], remote[key]);
      // Missing fields represent deletions, such as "Revert to original".
      if (value !== undefined) result[key] = value;
    }
    // A preparation record is a physical fact. A second device may still have
    // the old uncooked menu and swap it while the first device cooks. Merging
    // each field would attach chicken's timestamp/portions to a beef choice.
    // Keep a newly recorded cooked block as one atomic choice. An intentional
    // unprepare is still allowed when the baseline already contains that record.
    if (local.version === 1 && remote.version === 1 &&
      isObject(local.schedules) && isObject(remote.schedules) &&
      isObject(local.blocks) && isObject(remote.blocks) && isObject(result.blocks)) {
      const oldBlocks = isObject(before.blocks) ? before.blocks : {};
      for (const key of new Set([...Object.keys(local.blocks), ...Object.keys(remote.blocks)])) {
        const a = local.blocks[key], b = remote.blocks[key], old = oldBlocks[key];
        const newlyCooked = (choice: unknown) => isObject(choice) &&
          typeof choice.preparedSignature === "string" && choice.preparedSignature.length > 0 &&
          typeof choice.preparedAt === "string" && Number.isFinite(Date.parse(choice.preparedAt)) &&
          (!isObject(old) || choice.preparedAt !== old.preparedAt || choice.preparedSignature !== old.preparedSignature);
        const aCooked = newlyCooked(a), bCooked = newlyCooked(b);
        if (aCooked !== bCooked) result.blocks[key] = aCooked ? a : b;
        else if (aCooked && bCooked && !sameData(a, b)) {
          // Two explicitly recorded preparations resolve consistently on both
          // devices. Keep the other physical record for review, never discard it.
          const aKey = `${(a as Record<string, unknown>).preparedAt}:${(a as Record<string, unknown>).preparedSignature}`;
          const bKey = `${(b as Record<string, unknown>).preparedAt}:${(b as Record<string, unknown>).preparedSignature}`;
          const winner = aKey >= bKey ? a : b;
          const other = aKey >= bKey ? b : a;
          result.blocks[key] = { ...(winner as object), conflictingPreparation: other };
        }
      }
    }
    return result as T;
  }

  return local;
}

/** Only data owned by this account (or an unclaimed guest copy) may be uploaded. */
export function canClaimLocalProgress(previousUserId: string | undefined, userId: string) {
  return !previousUserId || previousUserId === userId;
}
