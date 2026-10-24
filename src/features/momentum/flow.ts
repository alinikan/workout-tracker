import type { ActivityLog, Outcome } from "./types.ts";

export type SessionStep = "plan" | "practice" | "finish" | "saved";

/** Derive resume position from real work, never from a calendar day or a visit.
 * These helpers do not write attendance or change the training prescription. */
export function sessionSets(ids: string[], extraId?: string) {
  return ids.flatMap((id) => (id === extraId ? [id, `${id}-2`] : [id]));
}
export function initialSessionStep(
  log: ActivityLog,
  ids: string[],
  extraId?: string,
): SessionStep {
  if (log.outcome) return "saved";
  const sets = sessionSets(ids, extraId);
  if (
    (sets.length > 0 && sets.every((id) => log.sets[id]?.done)) ||
    Number(log.minutes) > 0
  )
    return "finish";
  return Object.values(log.sets).some(
    (s) => s.done || s.skipped || s.weight || s.reps,
  )
    ? "practice"
    : "plan";
}
export function firstUnfinishedMovement(
  log: ActivityLog,
  ids: string[],
  extraId?: string,
) {
  const index = ids.findIndex((id) =>
    sessionSets([id], extraId).some((key) => {
      const set = log.sets[key];
      return !set?.done && !set?.skipped;
    }),
  );
  return Math.max(0, index);
}
export function suggestedOutcome(
  log: ActivityLog,
  ids: string[],
  extraId?: string,
): Exclude<Outcome, "stopped"> {
  if (log.outcome && log.outcome !== "stopped") return log.outcome;
  const sets = sessionSets(ids, extraId);
  return sets.some((id) => log.sets[id]?.done) &&
    !sets.every((id) => log.sets[id]?.done)
    ? "modified"
    : "planned";
}
