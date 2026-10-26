import { isCalendarDate } from "../../lib/programLifecycle.ts";
import { addDays, currentJourney, starterPlan } from "./plan.ts";
import type { Activity, MomentumData, Readiness } from "./types.ts";

// A stopped session is a record for that day, not a permanent account lock.
// Keep ordinary stop guidance independent of onboarding and access permissions.
export const urgentMessage =
  "Stop this session if you feel dizzy, faint or have concerning pain. Do not push through symptoms. Get urgent help for fainting, chest pain or severe breathlessness.";
export const concerning = (r: Readiness) =>
  r.dizzy === true || r.pain === "concerning";
export function activePause(data: MomentumData) {
  const j = currentJourney(data);
  return j ? Object.values(j.pauses).find((p) => !p.to) : undefined;
}
export function exerciseGate(
  data: MomentumData,
  today: string,
  _activity?: Activity,
  date = today,
) {
  const j = currentJourney(data);
  if (!j)
    return "Choose your start date in Settings. Nothing starts automatically.";
  if (j.startedOn > today)
    return `Preparation until ${j.startedOn}. Your exercise calendar has not started.`;
  if (activePause(data))
    return "Journey paused. Resume in Settings whenever you are ready; no catch-up work is added.";
  if (date > today)
    return "This is a future plan, not today's attendance. You can prepare or book now.";
  return null;
}
export function startJourneyAllowed(
  _data: MomentumData,
  start: string,
  today: string,
) {
  return isCalendarDate(start) && start >= today;
}
export function wasPaused(data: MomentumData, date: string) {
  const j = currentJourney(data);
  return Boolean(
    j && Object.values(j.pauses).some(
      (p) => date >= p.from && (!p.to || date <= p.to),
    ),
  );
}
export function hasRecentSymptoms(data: MomentumData, before: string) {
  const j = currentJourney(data);
  return Boolean(
    j && Object.entries(j.logs).some(([id, l]) => {
      const date = l.performedOn ?? j.slots[id]?.date;
      return date >= addDays(before, -21) && date <= before &&
        (l.outcome === "stopped" || concerning(l.readiness));
    }),
  );
}
export function planIsGeneric() {
  return starterPlan.length === 90;
}
