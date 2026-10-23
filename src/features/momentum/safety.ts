import { isCalendarDate } from "../../lib/programLifecycle.ts";
import { currentJourney, starterPlan } from "./plan.ts";
import type { Activity, Clearance, MomentumData, Readiness } from "./types.ts";

export const safetyMessage =
  "Near-fainting during exertion needs prompt professional assessment before strenuous activity. The cause cannot be established by this app. Do not assume it was hunger, dehydration or fitness level.";
export const urgentMessage =
  "Stop exercising. Call 911 for fainting during exertion, chest pain, severe breathlessness, or other alarming symptoms. For recurrent dizziness or near-fainting without emergency symptoms, stop and seek prompt medical advice before resuming. HealthLink BC: 811 for non-emergency advice.";
export function clearanceValid(c: Clearance, today: string) {
  return (
    c.assessed &&
    c.understood &&
    isCalendarDate(c.assessedOn) &&
    c.assessedOn <= today &&
    Boolean(c.recordedAt) &&
    c.walk &&
    c.strength &&
    c.boxing
  );
}
export const concerning = (r: Readiness) =>
  r.dizzy === true || r.pain === "concerning";
export function activePause(data: MomentumData) {
  const j = currentJourney(data);
  // Safety is account-wide: starting another month on a second device must not
  // hide an unresolved medical pause in the archived journey.
  const medical = Object.values(data.journeys)
    .flatMap((journey) =>
      Object.values(journey.pauses).filter(
        (p) => p.reason === "medical" && !p.to,
      ),
    )
    .sort((a, b) => b.from.localeCompare(a.from))[0];
  return (
    medical ?? (j ? Object.values(j.pauses).find((p) => !p.to) : undefined)
  );
}
export function exerciseGate(
  data: MomentumData,
  today: string,
  activity?: Activity,
  date = today,
) {
  if (!clearanceValid(data.clearance, today))
    return "Preparation only: record clinician assessment and guidance for walking, light strength and adapted non-contact classes first. A checkbox records your report; it is not medical clearance.";
  const j = currentJourney(data);
  if (!j)
    return "Choose and explicitly start a future Monday after assessment.";
  if (j.startedOn > today)
    return `Preparation until ${j.startedOn}. Your exercise calendar has not started.`;
  if (activePause(data))
    return "Journey paused. Prepare meals and appointments; no missed-workout penalty. Medical pauses require follow-up guidance before resuming.";
  if (date > today)
    return "This is a future plan, not today's attendance. You can prepare or book now.";
  if (activity && !["recovery", "review"].includes(activity)) {
    if (
      (activity === "boxing" && !data.clearance.boxing) ||
      (activity.startsWith("strength") && !data.clearance.strength) ||
      (activity === "walk" && !data.clearance.walk)
    )
      return "This activity is outside the permissions you recorded. Follow your clinician's guidance.";
  }
  return null;
}
export function startJourneyAllowed(
  data: MomentumData,
  start: string,
  today: string,
) {
  if (
    !clearanceValid(data.clearance, today) ||
    activePause(data)?.reason === "medical"
  )
    return false;
  // Strictly after assessment; later Mondays are allowed, never retroactive starts.
  return (
    isCalendarDate(start) &&
    start >= today &&
    start > data.clearance.assessedOn &&
    new Date(`${start}T12:00:00Z`).getUTCDay() === 1
  );
}
export function pauseForSymptoms(
  data: MomentumData,
  today: string,
  id: string,
): MomentumData {
  const j = currentJourney(data);
  return {
    ...data,
    clearance: {
      ...data.clearance,
      assessed: false,
      understood: false,
      walk: false,
      strength: false,
      boxing: false,
      progression: false,
    },
    journeys: j
      ? {
          ...data.journeys,
          [j.id]: {
            ...j,
            pauses: { ...j.pauses, [id]: { from: today, reason: "medical" } },
          },
        }
      : data.journeys,
  };
}
export function wasMedicalHold(data: MomentumData, date: string) {
  const j = currentJourney(data);
  return Boolean(
    j &&
    Object.values(j.pauses).some(
      (p) =>
        p.reason === "medical" && date >= p.from && (!p.to || date <= p.to),
    ),
  );
}
export function hasRecentSymptoms(data: MomentumData, before: string) {
  const j = currentJourney(data);
  return Boolean(
    j &&
    Object.entries(j.logs).some(
      ([id, l]) =>
        j.slots[id]?.date <= before &&
        (l.outcome === "medical" || concerning(l.readiness)),
    ),
  );
}
export function planIsGeneric() {
  return starterPlan.length === 30;
}
