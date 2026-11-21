import { coachTargets } from "./plan.ts";

export type AlternatingStage = 1 | 2 | 3 | 4;
export const isAlternatingStage = (value: unknown): value is AlternatingStage =>
  value === 1 || value === 2 || value === 3 || value === 4;

export const alternatingStageFor = (
  qualifyingSessions: number,
): AlternatingStage =>
  qualifyingSessions >= 20
    ? 4
    : qualifyingSessions >= 12
      ? 3
      : qualifyingSessions >= 6
        ? 2
        : 1;

export const alternatingStages = {
  1: {
    label: "Ease in",
    detail:
      "One working set per movement. Get comfortable with the new schedule first.",
  },
  2: {
    label: "Build a base",
    detail:
      "Two sets for chest press and row. Keep the other movements at one set.",
  },
  3: {
    label: "Build lower-body work",
    detail:
      "Two sets for wall sits and A-day glute bridges. B introduces one light dumbbell hinge set in place of the bridge. Core reps increase slightly.",
  },
  4: {
    label: "Build and maintain",
    detail:
      "Press and row use three sets on both days, and B uses two hinge sets. Continue earning weight increases separately.",
  },
} satisfies Record<AlternatingStage, { label: string; detail: string }>;

export function alternatingTargets(
  activity: "strength-a" | "strength-b",
  stage: AlternatingStage,
) {
  const moves = coachTargets(activity).map((move) => {
    if (stage >= 3 && move.id === "glute-bridge" && activity === "strength-b")
      return { id: "db-rdl", reps: "8-10 reps" };
    if (stage >= 3 && move.id === "dead-bug")
      return { ...move, reps: "6-8 per side" };
    return move;
  });
  // On B days, learn the new compound hinge while fresh, before direct arms.
  const hinge = moves.findIndex((move) => move.id === "db-rdl");
  const pressdown = moves.findIndex((move) => move.id === "mi6-bar-pressdown");
  if (hinge > pressdown && pressdown >= 0) {
    const [move] = moves.splice(hinge, 1);
    moves.splice(pressdown, 0, move);
  }
  return moves;
}

/** Volume belongs to the slot, so choosing a swap does not bypass a stage. */
export function alternatingSets(stage: AlternatingStage, id: string) {
  // Keep A/B upper-body volume comparable for the Smart Load history rule.
  if (["machine-chest-press", "single-arm-row"].includes(id))
    return stage >= 4 ? 3 : stage >= 2 ? 2 : 1;
  if (stage >= 3 && ["wall-sit", "glute-bridge"].includes(id)) return 2;
  if (stage >= 4 && id === "db-rdl") return 2;
  return 1;
}
