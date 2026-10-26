import {
  isCalendarDate,
  type ProgramState,
} from "../../lib/programLifecycle.ts";
import { currentJourney, makeJourney } from "./plan.ts";
import { firstWednesday } from "./titan.ts";
import type { MomentumData } from "./types.ts";

/** The public reset marker contains dates/IDs only, never private fitness data.
 * Each section acknowledges the same generation. A deterministic journey ID
 * makes offline devices recreate ONE new journey, rather than competing copies. */
export function reconcileSharedStart(
  data: MomentumData,
  program: ProgramState,
): MomentumData {
  if (
    !program.resetAt ||
    program.resetId === "initial" ||
    !isCalendarDate(program.startedOn)
  )
    return data;
  const applied = data.sharedProgram;
  if (applied?.resetId === program.resetId) return data;
  if (applied?.resetAt) {
    const difference =
      Date.parse(applied.resetAt) - Date.parse(program.resetAt);
    if (
      difference > 0 ||
      (difference === 0 && applied.resetId > program.resetId)
    )
      return data;
  }
  const previous = currentJourney(data);
  // Adoption is not an unrequested restart. Only an actual Start Fresh after
  // this journey was created repairs older installations automatically.
  if (
    !previous ||
    !data.onboarded ||
    (!applied && Date.parse(program.resetAt) <= Date.parse(previous.createdAt))
  )
    return { ...data, sharedProgram: { ...program } };

  const id = `program-${program.resetId}`;
  if (data.activeJourneyId === id)
    return { ...data, sharedProgram: { ...program } };
  const next =
    data.journeys[id] ?? makeJourney(program.startedOn, id, program.resetAt);
  return {
    ...data,
    sharedProgram: { ...program },
    activeJourneyId: id,
    journeys: {
      ...data.journeys,
      [previous.id]: {
        ...previous,
        // Keep the previous private food/preparation records with their journey.
        // A clean active calendar must not inherit old eaten checkmarks.
        archivedMeals: data.meals,
        archivedPreparation: data.preparation,
      },
      [id]: next,
    },
    meals: {},
    preparation: {},
    profile: {
      ...data.profile,
      nextClassDate: firstWednesday(program.startedOn),
    },
  };
}

/** Keep reset-scoped maps on the winning generation, but merge old journeys
 * normally so a stale device's last historical notes can still be archived. */
export function newerSharedStart(
  local: MomentumData,
  remote: MomentumData,
): MomentumData | null {
  const a = local.sharedProgram,
    b = remote.sharedProgram;
  if (a?.resetId === b?.resetId) return null;
  if (!a?.resetAt) return b?.resetAt ? remote : null;
  if (!b?.resetAt) return local;
  const difference = Date.parse(a.resetAt) - Date.parse(b.resetAt);
  return difference === 0
    ? a.resetId > b.resetId
      ? local
      : remote
    : difference > 0
      ? local
      : remote;
}
