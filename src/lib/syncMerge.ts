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
    return result as T;
  }

  return local;
}

/** Only data owned by this account (or an unclaimed guest copy) may be uploaded. */
export function canClaimLocalProgress(previousUserId: string | undefined, userId: string) {
  return !previousUserId || previousUserId === userId;
}
