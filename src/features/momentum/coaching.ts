import {
  addDays,
  currentJourney,
  dayPlan,
  isStrength,
  sortedSlots,
  strengthTemplates,
  weekOf,
} from "./plan.ts";
import {
  activePause,
  concerning,
  exerciseGate,
  hasRecentSymptoms,
  wasPaused,
} from "./safety.ts";
import { isCalendarDate } from "../../lib/programLifecycle.ts";
import { sessionSets } from "./flow.ts";
import { classFor } from "./titan.ts";
import type {
  ActivityLog,
  Adaptation,
  Journey,
  MomentumData,
  Slot,
} from "./types.ts";

const participated = (l?: ActivityLog) =>
  l?.outcome === "planned" || l?.outcome === "modified";
const comfortable = (l: ActivityLog) =>
  participated(l) &&
  !l.observed &&
  (l.effort === "easy" || l.effort === "manageable") &&
  l.recovery === "good" &&
  l.comfortable &&
  !concerning(l.readiness);
export const loggedActivity = (j: Journey, slot: Slot) =>
  j.logs[slot.id]?.plannedActivity ?? dayPlan(j, slot).activity;
export function attendance(j: Journey, before: string) {
  return sortedSlots(j).filter((s) => {
    const log = j.logs[s.id],
      activity = loggedActivity(j, s);
    return (
      (log?.performedOn ?? s.date) <= before &&
      participated(log) &&
      (isStrength(activity) || activity === "boxing" || Number(log.minutes) > 0)
    );
  });
}
export function progressionEligible(data: MomentumData, before: string) {
  const j = currentJourney(data);
  if (!j || exerciseGate(data, before) || hasRecentSymptoms(data, before))
    return false;
  if (j.planVersion === "titan-90") return earnedLevel(data, before) >= 1;
  const recent = sortedSlots(j).filter(
    (s) =>
      (j.logs[s.id]?.performedOn ?? s.date) < before &&
      (j.logs[s.id]?.performedOn ?? s.date) >= addDays(before, -21),
  );
  if (
    recent.filter((s) => j.logs[s.id]?.outcome === "missed").length >= 2 ||
    recent.some(
      (s) =>
        j.logs[s.id]?.effort === "hard" || j.logs[s.id]?.recovery === "poor",
    )
  )
    return false;
  const lifts = recent.filter((s) => {
    const activity = loggedActivity(j, s);
    return (
      isStrength(activity) &&
      j.logs[s.id]?.outcome === "planned" &&
      strengthTemplates[activity].every(
        (e) => j.logs[s.id]?.sets[e.id]?.done,
      ) &&
      comfortable(j.logs[s.id])
    );
  });
  const classes = recent.filter(
    (s) => loggedActivity(j, s) === "boxing" && comfortable(j.logs[s.id]),
  );
  const latestReview = Object.entries(j.reviews)
    .sort(([a], [b]) => Number(a) - Number(b))
    .at(-1)?.[1];
  const latest = [...lifts, ...classes]
    .map((s) => j.logs[s.id].performedOn ?? s.date)
    .sort()
    .at(-1);
  return (
    lifts.length >= 2 &&
    classes.length >= 2 &&
    Boolean(latest && latest >= addDays(before, -10)) &&
    Boolean(latestReview?.manageable && latestReview.body === "comfortable")
  );
}
export function resolveDay(data: MomentumData, slot: Slot, today: string) {
  const j = currentJourney(data);
  const base = dayPlan(j, slot);
  const adaptation = j?.adaptations[String(weekOf(slot.day))];
  const history = j?.logs[slot.id];
  let activity = base.activity;
  let minutes = base.minutes;
  let reason = slot.note ?? "";
  // B is an opt-in extra session, not an automatic calendar progression.
  const eligible = progressionEligible(data, slot.date);
  const titanPlan = j?.planVersion === "titan-90" && !slot.legacy;
  const level = titanPlan ? earnedLevel(data, slot.date) : 0;
  const choices = j
    ? Object.entries(j.adaptations)
        .filter(([w]) => Number(w) <= weekOf(slot.day))
        .sort(([a], [b]) => Number(b) - Number(a))
    : [];
  const choice = titanPlan ? choices[0]?.[1] : adaptation;
  if (
    activity === "strength-b" &&
    !(
      eligible &&
      (choice?.mode === "second-session" || choice?.mode === "two-sets")
    )
  ) {
    activity = "recovery";
    minutes = "0";
    reason =
      "Recovery replaces the optional second strength day. Enable it only after comfortable attendance, recovery and a weekly review.";
  }
  if (choice?.mode === "lighter" && isStrength(activity)) {
    reason =
      "Lighter week: warm-up plus one easy movement, or recovery. No catch-up sessions.";
  }
  const previous = j
    ? sortedSlots(j).filter(
        (s) =>
          (j.logs[s.id]?.performedOn ?? s.date) < slot.date &&
          loggedActivity(j, s) === activity &&
          comfortable(j.logs[s.id] ?? ({} as ActivityLog)),
      )
    : [];
  if (titanPlan) {
    if (activity === "walk")
      minutes =
        previous.length >= 8 ? "20-30" : previous.length >= 4 ? "15-20" : "10";
    if (activity === "boxing")
      minutes =
        previous.length >= 6
          ? "30-45"
          : previous.length >= 3
            ? "20-30"
            : "10-20";
  }
  if (
    !titanPlan &&
    activity === "boxing" &&
    previous.length < Math.min(3, weekOf(slot.day) - 1)
  ) {
    minutes = "10-20";
    reason =
      "Repeat the short introduction: later class duration is not earned by the calendar alone.";
  }
  if (
    !titanPlan &&
    activity === "walk" &&
    previous.length < 2 &&
    slot.day > 2
  ) {
    minutes = "5-8";
    reason =
      "Keep walks short until at least two previous walks were comfortable and recovered.";
  }
  const lastAttempt = j
    ? sortedSlots(j)
        .filter(
          (s) =>
            (j.logs[s.id]?.performedOn ?? s.date) < slot.date &&
            loggedActivity(j, s) === activity &&
            participated(j.logs[s.id]),
        )
        .sort((a, b) =>
          (j.logs[a.id].performedOn ?? a.date).localeCompare(
            j.logs[b.id].performedOn ?? b.date,
          ),
        )
        .at(-1)
    : undefined;
  if (
    lastAttempt &&
    j &&
    (j.logs[lastAttempt.id].effort === "hard" ||
      j.logs[lastAttempt.id].recovery === "poor") &&
    ["walk", "boxing"].includes(activity)
  ) {
    minutes = activity === "walk" ? "5-8" : "10-20";
    reason =
      "Your latest comparable attempt was demanding or recovery was poor. Repeat a shorter comfortable option or rest; do not increase duration.";
  }
  const extraId =
    eligible && adaptation?.mode === "extra-set" && isStrength(activity)
      ? adaptation.exerciseId
      : undefined;
  const setsPerExercise: 1 | 2 =
    history?.plannedSets ??
    (titanPlan && level >= 2 && choice?.mode === "two-sets" ? 2 : 1);
  if (titanPlan && isStrength(activity) && setsPerExercise === 2)
    minutes = "30-40";
  if (history?.outcome && history.plannedActivity) {
    activity = history.plannedActivity;
    minutes = history.plannedMinutes ?? minutes;
  }
  const replaced = activity === "recovery" && isStrength(base.activity);
  const available: string[] = isStrength(activity)
    ? strengthTemplates[activity].map((e) => e.id)
    : [];
  const exerciseIds =
    history?.outcome && history.plannedExerciseIds
      ? history.plannedExerciseIds.filter((id) => available.includes(id))
      : choice?.mode === "lighter"
        ? available.slice(0, 1)
        : available;
  return {
    ...base,
    activity,
    title: replaced
      ? base.activity === "strength-b"
        ? "Recovery instead of extra strength"
        : "Recovery"
      : titanPlan && activity === "boxing"
        ? (history?.className ?? classFor(data, slot.date).name)
        : base.title,
    exerciseIds,
    steps: replaced
      ? [
          "No additional strength session today. Rest and prepare the next suitable appointment. Do not make up skipped work.",
        ]
      : choice?.mode === "lighter" && isStrength(activity)
        ? [
            "Gentle warm-up, then only the one easy movement shown below. Rest or stop whenever needed. Nothing else is owed.",
          ]
        : titanPlan && isStrength(activity) && setsPerExercise === 2
          ? [
              "Warm up gently, then do clearly lighter practice sets for the first two movements.",
              "Do two controlled working sets per movement, using familiar loads and resting 90-180 seconds. Do not increase the weight at the same time.",
            ]
          : base.steps,
    enough: replaced
      ? "Recovery. No strength quota is required today."
      : choice?.mode === "lighter" && isStrength(activity)
        ? "A warm-up and one comfortable movement, or recovery."
        : titanPlan && isStrength(activity) && setsPerExercise === 2
          ? "Two controlled sets of each movement at familiar loads. A smaller version is still an option."
          : base.enough,
    minimum: replaced ? "Rest." : base.minimum,
    minutes,
    modifiedReason: reason,
    extraId: history?.outcome ? history.extraExercise : extraId,
    setsPerExercise,
    level,
    lighter: choice?.mode === "lighter",
    gate: exerciseGate(data, today, activity, slot.date),
  };
}
export function completionError(
  data: MomentumData,
  slot: Slot,
  log: ActivityLog,
  outcome: string,
  today: string,
) {
  const plan = resolveDay(data, slot, today);
  if (outcome === "stopped" || outcome === "missed") return null;
  if (plan.gate) return plan.gate;
  const performed = log.performedOn ?? slot.date;
  const start = currentJourney(data)?.startedOn;
  if (
    !isCalendarDate(performed) ||
    performed > today ||
    (start && performed < start)
  )
    return "Choose a valid actual date within this journey, not a future attendance date.";
  if (concerning(log.readiness))
    return "Stop and seek care; this is not an ordinary training completion.";
  if (isStrength(plan.activity)) {
    const ids: string[] = plan.exerciseIds;
    const validSets = sessionSets(ids, plan.extraId, plan.setsPerExercise);
    const done = validSets.filter((id) => log.sets[id]?.done).length;
    if (!done)
      return "Record at least one actual set, or choose Did not do it / Stop session. Nothing is completed automatically.";
    if (
      validSets
        .map((id) => log.sets[id])
        .filter(Boolean)
        .some(
          (s) =>
            s.done && !(Number.isInteger(Number(s.reps)) && Number(s.reps) > 0),
        )
    )
      return "Record actual repetitions for the sets you checked. Do not invent missing work.";
    if (outcome === "planned" && !validSets.every((id) => log.sets[id]?.done))
      return "Some sets are unfinished. Record a smaller version, or finish only if comfortable.";
  }
  if (plan.activity === "walk" && !(Number(log.minutes) > 0))
    return "Record your actual comfortable walking minutes first.";
  if (plan.activity === "boxing" && !log.observed && !(Number(log.minutes) > 0))
    return "Enter actual technique minutes, or record that you attended and observed.";
  if (plan.activity === "boxing" && log.observed && outcome === "planned")
    return "Observation is a valuable modified visit, not the full planned session.";
  return null;
}
export function outcomeLabel(data: MomentumData, slot: Slot, today: string) {
  const l = currentJourney(data)?.logs[slot.id];
  if (l?.outcome)
    return {
      planned: "Completed as planned",
      modified: "Smaller version",
      missed: "Did not do it",
      stopped: "Session stopped",
    }[l.outcome];
  if (wasPaused(data, slot.date)) return "Paused";
  if (slot.date < today && !exerciseGate(data, today))
    return "No entry - next opportunity ahead";
  return "Not recorded";
}
export function coachNote(data: MomentumData, today: string) {
  if (activePause(data))
    return "Your journey is paused. Resume in Settings when the next appointment feels achievable.";
  const j = currentJourney(data);
  if (!j)
    return "Choose a realistic start Monday. Nothing starts automatically.";
  const missed = sortedSlots(j).filter(
    (s) => s.date <= today && j.logs[s.id]?.outcome === "missed",
  );
  const last = missed.at(-1);
  const reason = last ? j.logs[last.id].reason : "";
  if (missed.length >= 3)
    return "Several appointments did not fit. Choose a lighter week with fewer demands; do not make up missed workouts.";
  if (/work|time/i.test(reason))
    return "Keep the next class as your anchor. Try an earlier preparation cue or a less demanding workday.";
  if (/transport/i.test(reason))
    return "Check the route and a backup before booking again. No extra session is owed.";
  if (last)
    return "Return at the next suitable appointment. Do not double the next session.";
  return "Repeat what feels manageable. A smaller version is useful attendance, not a failed full workout.";
}
export function monthTwo(data: MomentumData, today: string) {
  if (hasRecentSymptoms(data, today))
    return "Keep the next block familiar or lighter. Recent stopped sessions are not a reason to add more work.";
  const j = currentJourney(data);
  if (!j)
    return "Build a manageable first month before considering the next one.";
  const entries = attendance(j, today);
  const classes = entries.filter((s) => loggedActivity(j, s) === "boxing");
  const lifts = entries.filter((s) => isStrength(loggedActivity(j, s)));
  if (classes.some((s) => j.logs[s.id].enjoyment === "no"))
    return "Try a different beginner coach or environment. Keep the movement you enjoy; do not abandon all activity because one class was not a fit.";
  if (classes.length >= 2 && lifts.length < 2)
    return "Keep one beginner class as the anchor. Offer a shorter or coached strength practice instead of forcing the original program.";
  if (
    entries.length < 6 ||
    Object.values(j.logs).some((l) => l.recovery === "poor")
  )
    return "Repeat a simpler month: one manageable class and one short strength practice, with optional walks. Reduce the barriers before adding work.";
  return "Continue one adapted class and one comfortable strength session. Up to two short strength sessions is an option only after good recovery and an explicit choice, never a requirement. No automatic sparring.";
}
export function adaptationAllowed(
  data: MomentumData,
  mode: Adaptation["mode"],
  before: string,
) {
  return (
    mode === "steady" ||
    mode === "lighter" ||
    (mode === "two-sets"
      ? earnedLevel(data, before) >= 2
      : progressionEligible(data, before))
  );
}

/** Workload unlocks use actual successful work, recent recovery and repeatable
 * attendance. Unknown feedback is not treated as good recovery. Counts here
 * are conservative product guardrails, not a validated medical protocol. */
export function earnedLevel(data: MomentumData, before: string): 0 | 1 | 2 {
  const j = currentJourney(data);
  if (!j || exerciseGate(data, before) || hasRecentSymptoms(data, before))
    return 0;
  const attempts = sortedSlots(j).filter(
    (s) =>
      (j.logs[s.id]?.performedOn ?? s.date) < before &&
      participated(j.logs[s.id]),
  );
  const recent = sortedSlots(j).filter(
    (s) =>
      (j.logs[s.id]?.performedOn ?? s.date) < before &&
      (j.logs[s.id]?.performedOn ?? s.date) >= addDays(before, -21) &&
      (isStrength(loggedActivity(j, s)) || loggedActivity(j, s) === "boxing") &&
      Boolean(j.logs[s.id]?.outcome),
  );
  if (
    !recent.length ||
    recent.filter((s) => j.logs[s.id]?.outcome === "missed").length >= 2 ||
    recent.some(
      (s) => j.logs[s.id].effort === "hard" || j.logs[s.id].recovery === "poor",
    )
  )
    return 0;
  const good = attempts.filter((s) => comfortable(j.logs[s.id]));
  const lifts = good.filter((s) => {
    const activity = loggedActivity(j, s),
      log = j.logs[s.id];
    if (!isStrength(activity) || log.outcome !== "planned") return false;
    // A deliberately lighter one-movement day is useful, but is not evidence
    // that all four movements were tolerated. Require actual repetitions too.
    return sessionSets(
      strengthTemplates[activity].map((e) => e.id),
      log.extraExercise,
      log.plannedSets ?? 1,
    ).every(
      (id) =>
        log.sets[id]?.done &&
        Number.isInteger(Number(log.sets[id].reps)) &&
        Number(log.sets[id].reps) > 0,
    );
  });
  const classes = good.filter(
    (s) =>
      loggedActivity(j, s) === "boxing" && Number(j.logs[s.id].minutes) > 0,
  );
  const latest = [...lifts, ...classes]
    .map((s) => j.logs[s.id].performedOn ?? s.date)
    .sort()
    .at(-1)!;
  if (!latest || latest < addDays(before, -10)) return 0;
  if (
    lifts.length >= 8 &&
    classes.length >= 6 &&
    lifts.filter((s) => loggedActivity(j, s) === "strength-b").length >= 2
  )
    return 2;
  return lifts.length >= 4 && classes.length >= 3 ? 1 : 0;
}
