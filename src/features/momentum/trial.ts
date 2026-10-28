import { isCalendarDate } from "../../lib/programLifecycle.ts";
import {
  addDays,
  currentJourney,
  dayPlan,
  isStrength,
  makeJourney,
  sortedSlots,
} from "./plan.ts";
import type { ActivityLog, Journey, MomentumData, Slot } from "./types.ts";

export const isHomePlan = (j?: Journey) => j?.planVersion === "home-trial-90";
export const hasActualWork = (log?: ActivityLog) =>
  Boolean(
    log &&
    (log.outcome ||
      Number(log.minutes) > 0 ||
      Object.values(log.sets).some(
        (s) => s.done || s.skipped || s.weight || s.reps,
      )),
  );

/** Retain actual history, not the old automatically recurring class assumption.
 * This is a plan migration, not a reset: IDs, dates, meals and attendance survive. */
export function adoptHomePlan(data: MomentumData, today: string): MomentumData {
  const j = currentJourney(data);
  if (!j || isHomePlan(j)) return data;
  const fresh = makeHomeJourney(j.startedOn, j.id, j.createdAt);
  const slots = { ...fresh.slots, ...j.slots };
  const logs = { ...j.logs };
  for (const [id, slot] of Object.entries(slots)) {
    const old = j.slots[id];
    if (old && (slot.date < today || hasActualWork(logs[id])))
      slots[id] = {
        ...slot,
        originalPlan:
          j.planVersion === "titan-90" && !slot.legacy
            ? "titan-90"
            : "legacy-30",
      };
    else {
      const { legacy: _legacy, templateDay: _template, ...plain } = slot;
      slots[id] = plain;
      if (logs[id]?.booked) logs[id] = { ...logs[id], booked: false };
    }
  }
  return {
    ...data,
    profile: {
      ...data.profile,
      environment: "home",
      classTime: "",
      nextClassDate: "",
    },
    journeys: {
      ...data.journeys,
      [j.id]: {
        ...j,
        planVersion: "home-trial-90",
        homeFrom: today,
        slots,
        logs,
      },
    },
  };
}

export function makeHomeJourney(
  start: string,
  id?: string,
  now?: string,
): Journey {
  const j = makeJourney(start, id, now);
  return {
    ...j,
    planVersion: "home-trial-90",
    homeFrom: start,
    slots: Object.fromEntries(
      Object.entries(j.slots).map(([key, slot]) => {
        const { templateDay: _template, ...plain } = slot;
        return [key, plain];
      }),
    ),
  };
}

export function trialFor(data: MomentumData) {
  const trial = currentJourney(data)?.trial;
  return trial &&
    isCalendarDate(trial.date) &&
    typeof trial.id === "string" &&
    Number.isFinite(Date.parse(trial.updatedAt)) &&
    typeof trial.time === "string" &&
    (!trial.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(trial.time))
    ? trial
    : null;
}

/** Save one confirmed date, never a weekly recurrence or an automatic booking.
 * A tombstone choice cancels it without letting a stale device bring it back. */
export function chooseTrial(
  data: MomentumData,
  date: string | null,
  time: string,
  today: string,
  now = new Date().toISOString(),
): MomentumData {
  const j = currentJourney(data);
  if (!j || !isHomePlan(j))
    throw new Error("Start your home routine before choosing a trial date.");
  const old = trialFor(data);
  if (
    old &&
    sortedSlots(j).some(
      (s) =>
        s.date === old.date &&
        j.logs[s.id]?.outcome !== "missed" &&
        hasActualWork(j.logs[s.id]),
    )
  )
    throw new Error(
      "This trial already has an activity record. Keep its history; do not move or cancel a performed session.",
    );
  if (date !== null) {
    if (
      !isCalendarDate(date) ||
      date < today ||
      date < j.startedOn ||
      !sortedSlots(j).some((s) => s.date === date)
    )
      throw new Error(
        "Choose today or a future date within your current journey.",
      );
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      throw new Error(
        "Choose a valid class time, or leave it blank until confirmed.",
      );
    if (
      sortedSlots(j).some((s) => s.date === date && hasActualWork(j.logs[s.id]))
    )
      throw new Error(
        "There is already work recorded on that date. Choose another date so its workout is not overwritten.",
      );
    if (
      Object.values(j.pauses).some(
        (p) => p.from <= date && (!p.to || p.to >= date),
      )
    )
      throw new Error(
        "That date is paused. Resume the routine or choose another date.",
      );
  }
  // Monotonic timestamps make repeated changes deterministic, even if a device clock drifts back.
  const at = new Date(
    Math.max(Date.parse(now), Date.parse(j.trial?.updatedAt ?? "") + 1 || 0),
  ).toISOString();
  return {
    ...data,
    profile: { ...data.profile, nextClassDate: date ?? "" },
    journeys: {
      ...data.journeys,
      [j.id]: {
        ...j,
        trial: {
          id: crypto.randomUUID(),
          updatedAt: at,
          date,
          time: date ? time : "",
        },
      },
    },
  };
}

/** A day-before/day-after buffer is a conservative product rule for an unfamiliar
 * class, not a promise about recovery. Displaced lifts are NOT piled elsewhere. */
export function trialAdjustment(data: MomentumData, slot: Slot) {
  const j = currentJourney(data),
    trial = trialFor(data),
    base = dayPlan(j, slot);
  if (
    !isHomePlan(j) ||
    slot.originalPlan ||
    hasActualWork(j?.logs[slot.id]) ||
    !trial
  )
    return { ...base, trial: false, reason: "" };
  if (slot.date === trial.date)
    return {
      ...base,
      activity: "boxing" as const,
      title: "Muay Thai / Kickboxing trial",
      minutes: "10-20",
      steps: [
        "Confirm the class with Titan. Tell the coach this is your first trial and keep the technique easy, with breaks or observation whenever needed.",
        "This replaces today's workout. Do not add a home strength session or hard finisher.",
      ],
      task: "One trial only. No recurring classes are scheduled.",
      enough:
        "An easy introduction with breaks; observation or a shorter visit is fine.",
      minimum: "Observe, take breaks or stop.",
      trial: true,
      reason:
        "Your chosen trial replaces today's home workout; it is not an extra session.",
    };
  if (slot.date === addDays(trial.date!, 1))
    return {
      ...base,
      activity: "recovery" as const,
      title: "Recover after the trial",
      minutes: "0",
      steps: [
        "Rest or walk easily if comfortable. Use how you actually feel before your next home session.",
      ],
      enough: "Recovery, not a make-up lift.",
      minimum: "Rest.",
      trial: false,
      reason:
        "The day after your trial stays light. No displaced workout is owed.",
    };
  if (slot.date === addDays(trial.date!, -1) && isStrength(base.activity))
    return {
      ...base,
      activity: "walk" as const,
      title: "Easy movement before the trial",
      minutes: "5-10",
      steps: [
        "Keep movement easy and conversational. Leave the lifting for the next planned home session.",
      ],
      enough: "A short easy walk, or rest.",
      minimum: "Rest.",
      trial: false,
      reason:
        "The home lift is replaced, not moved, so the trial does not create a crowded training week.",
    };
  return { ...base, trial: false, reason: "" };
}

export function trialFuel(data: MomentumData, date: string) {
  const trial = trialFor(data);
  if (!trial || trial.date !== date) return null;
  const morning = Boolean(trial.time && Number(trial.time.slice(0, 2)) < 12);
  return {
    timings: {
      breakfast: morning
        ? "Small breakfast before class, or afterwards if it is soon"
        : "Morning",
      lunch: morning
        ? "Midday, after the morning trial"
        : "Midday; keep your usual meal",
      snack: morning
        ? "Afternoon snack"
        : "Small snack 1-3 hours before trial, if needed",
      dinner:
        morning || !trial.time
          ? "Your usual evening meal"
          : "After the trial, or 3-4 hours before if that fits",
    },
    title: `Fuel for your trial${trial.time ? ` · ${trial.time}` : ""}`,
    detail:
      "Have a familiar main meal about 3-4 hours before, or a smaller meal/snack 1-3 hours before. Use your planned banana/yogurt snack rather than adding a second full meal. Keep water available and take breaks. Food cannot guarantee you will not feel faint; stop if you do.",
    prepared:
      "Already cooked? Keep your containers as portioned. Place your planned snack before class; do not reweigh or recook the whole batch.",
  };
}
