import { isCalendarDate } from "../../lib/programLifecycle.ts";
import { addDays, homeStrengthTemplates } from "../momentum/plan.ts";

export type ClassChoice = {
  id: string;
  updatedAt: string;
  effectiveOn: string;
  mode: "home" | "trial" | "regular";
  date: string;
  time: string;
  weekdays: number[];
  minutes: number;
  stage: "introduction" | "beginner";
  scheduledOn?: string;
  rhythm?:
    | { kind: "twice-weekly" }
    | { kind: "every-other-day"; anchor: string };
};
export type CoachSchedule = {
  version: 1;
  homeFrom: string | null;
  legacyImported: boolean;
  // Append-only choices merge safely across devices. Each complete choice has
  // its own ID, so sync cannot combine one device's date with another's time.
  choices: Record<string, ClassChoice>;
  // Cancellations refer to immutable choice IDs so a stale device cannot
  // bring a canceled switch back by syncing its copy of the choice.
  canceledSwitches?: Record<string, true>;
};
export const emptyCoaching = (): CoachSchedule => ({
  version: 1,
  homeFrom: null,
  legacyImported: false,
  choices: {},
});
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const distance = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${a}T12:00Z`) - Date.parse(`${b}T12:00Z`)) / 86400000,
  );
const validTime = (time: unknown): time is string =>
  typeof time === "string" && (!time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export function validChoice(value: unknown): value is ClassChoice {
  if (!object(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    isCalendarDate(value.effectiveOn) &&
    ["home", "trial", "regular"].includes(String(value.mode)) &&
    (value.rhythm === undefined ||
      (value.mode === "home" &&
        object(value.rhythm) &&
        (value.rhythm.kind === "twice-weekly" ||
          (value.rhythm.kind === "every-other-day" &&
            isCalendarDate(value.rhythm.anchor))))) &&
    (value.scheduledOn === undefined ||
      (isCalendarDate(value.scheduledOn) &&
        value.scheduledOn < value.effectiveOn &&
        value.effectiveOn <= addDays(value.scheduledOn, 365) &&
        object(value.rhythm) &&
        value.rhythm.kind === "every-other-day" &&
        value.rhythm.anchor === value.effectiveOn)) &&
    (value.mode === "home"
      ? value.date === ""
      : isCalendarDate(value.date) && value.date >= value.effectiveOn) &&
    validTime(value.time) &&
    Array.isArray(value.weekdays) &&
    value.weekdays.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
    new Set(value.weekdays).size === value.weekdays.length &&
    (value.mode !== "regular" ||
      (value.weekdays.length >= 1 &&
        value.weekdays.length <= 2 &&
        (value.weekdays.length === 1 ||
          ![1, 6].includes(
            Math.abs(Number(value.weekdays[0]) - Number(value.weekdays[1])),
          )))) &&
    Number.isInteger(value.minutes) &&
    Number(value.minutes) >= 15 &&
    Number(value.minutes) <= 90 &&
    ["introduction", "beginner"].includes(String(value.stage))
  );
}

export function normalizeCoaching(value: unknown): CoachSchedule {
  if (!object(value) || value.version !== 1) return emptyCoaching();
  return {
    version: 1,
    homeFrom: isCalendarDate(value.homeFrom) ? value.homeFrom : null,
    legacyImported: value.legacyImported === true,
    ...(object(value.canceledSwitches)
      ? {
          canceledSwitches: Object.fromEntries(
            Object.entries(value.canceledSwitches).flatMap(([id, canceled]) =>
              id && canceled === true ? [[id, true] as const] : [],
            ),
          ),
        }
      : {}),
    choices: object(value.choices)
      ? Object.entries(value.choices).reduce<Record<string, ClassChoice>>(
          (result, [id, choice]) => {
            if (validChoice(choice) && id === choice.id) result[id] = choice;
            return result;
          },
          {},
        )
      : {},
  };
}

const newestFirst = (a: ClassChoice, b: ClassChoice) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id);

function availableChoices(state: CoachSchedule) {
  const choices = Object.values(state.choices);
  const deferred = choices.filter((choice) => choice.scheduledOn !== undefined);
  // Offline devices may schedule different dates without seeing each other's
  // draft. A newer booking replaces an older one only if it was still pending.
  return choices.filter(
    (choice) =>
      state.canceledSwitches?.[choice.id] !== true &&
      (!choice.scheduledOn ||
        !deferred.some(
          (other) =>
            other.scheduledOn! < choice.effectiveOn &&
            newestFirst(other, choice) < 0,
        )),
  );
}

function choicesThrough(state: CoachSchedule, date: string): ClassChoice[] {
  return availableChoices(state)
    .filter((choice) => choice.effectiveOn <= date)
    .sort(
      (a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || newestFirst(a, b),
    );
}

export function pendingAlternatingSwitch(state: CoachSchedule, date: string) {
  return availableChoices(state).find(
    (choice) => choice.scheduledOn && choice.effectiveOn > date,
  );
}

export function cancelPendingAlternatingSwitch(
  state: CoachSchedule,
  date: string,
) {
  const pending = Object.values(state.choices).filter(
    (choice) => choice.scheduledOn && choice.effectiveOn > date,
  );
  if (!pending.length) return state;
  return {
    ...state,
    canceledSwitches: {
      ...state.canceledSwitches,
      ...Object.fromEntries(
        pending.map((choice) => [choice.id, true as const]),
      ),
    },
  };
}

export function homeProjectionStart(state: CoachSchedule) {
  return (
    [
      state.homeFrom,
      ...availableChoices(state)
        .filter((choice) => choice.scheduledOn)
        .map((choice) => choice.effectiveOn),
    ]
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null
  );
}

export function choiceForDate(
  state: CoachSchedule,
  date: string,
): ClassChoice | null {
  return choicesThrough(state, date)[0] ?? null;
}

// Class edits do not silently turn off the previously chosen home rhythm.
export function homeRhythmChoice(state: CoachSchedule, date: string) {
  return choicesThrough(state, date).find((item) => item.rhythm !== undefined);
}

export function alternatingChoice(state: CoachSchedule, date: string) {
  const choice = homeRhythmChoice(state, date);
  return choice?.rhythm?.kind === "every-other-day" &&
    choice.rhythm.anchor <= date
    ? { anchor: choice.rhythm.anchor, effectiveOn: choice.effectiveOn }
    : null;
}

type ChoiceInput = Omit<
  ClassChoice,
  "id" | "updatedAt" | "effectiveOn" | "scheduledOn"
>;

// Preview and Save share the effective-date and replacement logic.
export function applyCoachChoice(
  state: CoachSchedule,
  input: ChoiceInput,
  first: string,
  start: string,
  identity: { id: string; updatedAt: string },
): CoachSchedule {
  const anchor =
    input.rhythm?.kind === "every-other-day" ? input.rhythm.anchor : null;
  if (
    anchor !== null &&
    (!isCalendarDate(anchor) || anchor < start || anchor > addDays(first, 365))
  )
    throw new Error(
      "Choose a valid switch date within the next year and no earlier than your program start.",
    );
  const deferred = anchor !== null && anchor > first;
  const choice: ClassChoice = {
    ...input,
    ...identity,
    effectiveOn: deferred ? anchor : first,
    ...(deferred ? { scheduledOn: first } : {}),
  };
  if (!validChoice(choice))
    throw new Error(
      "Choose today or a future class date, a valid time, and one or two non-consecutive weekly class days. Duration must be 15–90 minutes.",
    );
  const next = anchor ? cancelPendingAlternatingSwitch(state, first) : state;
  const homeFrom = homeProjectionStart(next);
  return {
    ...next,
    homeFrom: deferred
      ? next.homeFrom
      : homeFrom && homeFrom < first
        ? homeFrom
        : first,
    choices: { ...next.choices, [choice.id]: choice },
  };
}

export function saveCoachChoice(
  state: CoachSchedule,
  input: ChoiceInput,
  today: string,
  start: string,
  now = new Date().toISOString(),
): CoachSchedule {
  if (
    !isCalendarDate(today) ||
    !isCalendarDate(start) ||
    !Number.isFinite(Date.parse(now))
  )
    throw new Error("Choose a valid date.");
  const timestamp = Math.max(
    Date.parse(now),
    ...Object.values(state.choices).map((c) => Date.parse(c.updatedAt) + 1),
  );
  const updatedAt = new Date(timestamp).toISOString();
  // This is a sync identity, not a secret. HTTP phone-to-Mac previews may not
  // expose randomUUID; production HTTPS uses it when available.
  const token =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${timestamp.toString(36)}-${Math.random().toString(36).slice(2)}`;
  const id = `${updatedAt}-${token}`;
  return applyCoachChoice(state, input, today > start ? today : start, start, {
    id,
    updatedAt,
  });
}

export function classOn(state: CoachSchedule, date: string) {
  const c = choiceForDate(state, date);
  if (!c || c.mode === "home" || date < c.date) return null;
  return (
    c.mode === "trial" ? date === c.date : c.weekdays.includes(weekday(date))
  )
    ? c
    : null;
}

/** Recovery spacing is an explicit conservative product rule, not a diagnosis
 * or a claim that calendar-day spacing guarantees individual recovery. Classes
 * replace home work; this planner never creates make-up workouts. */
export function coachActivity(
  state: CoachSchedule,
  start: string,
  date: string,
) {
  // A later edit must not move a lift that belonged to an earlier date, even
  // when this date shares a week with the new class configuration.
  state = {
    ...state,
    choices: Object.fromEntries(
      availableChoices(state)
        .filter((c) => c.effectiveOn <= date)
        .map((choice) => [choice.id, choice]),
    ),
  };
  const ownClass = classOn(state, date);
  if (ownClass)
    return {
      activity: "class" as const,
      title:
        ownClass.mode === "trial"
          ? "Muay Thai trial"
          : `Muay Thai · ${ownClass.stage === "introduction" ? "Introduction" : "Beginners / Intermediate"}`,
      minutes: ownClass.minutes,
      class: ownClass,
    };
  const adjacent =
    classOn(state, addDays(date, -1)) || classOn(state, addDays(date, 1));
  if (adjacent)
    return {
      activity: "recovery" as const,
      title: "Recovery around Muay Thai",
      minutes: 0,
      class: null,
    };
  const alternating = alternatingChoice(state, date);
  if (alternating) {
    const offset = distance(date, alternating.anchor);
    if (offset % 2 !== 0)
      return {
        activity: "recovery" as const,
        title: "Recovery day",
        minutes: 0,
        class: null,
      };
    const a = offset % 4 === 0;
    return {
      activity: a ? ("strength-a" as const) : ("strength-b" as const),
      title: `Home Strength ${a ? "A" : "B"}`,
      minutes: 30,
      class: null,
    };
  }
  const index = distance(date, start),
    weekStart = addDays(start, Math.floor(index / 7) * 7);
  // Keep the familiar A/B anchors when possible. Otherwise fit at most two
  // well-spaced lifts into this program week, leaving class buffers intact.
  const candidates = Array.from({ length: 7 }, (_, n) =>
    addDays(weekStart, n),
  ).filter(
    (d) => d >= start && ![-1, 0, 1].some((n) => classOn(state, addDays(d, n))),
  );
  const pairs = candidates.flatMap((a, i) =>
    candidates
      .slice(i + 1)
      .filter((b) => distance(b, a) >= 3)
      .map((b) => [a, b]),
  );
  const cost = (pair: string[]) =>
    Math.abs(distance(pair[0], weekStart)) +
    Math.abs(distance(pair[1], addDays(weekStart, 3)));
  const selected =
    pairs.sort(
      (a, b) => cost(a) - cost(b) || a.join().localeCompare(b.join()),
    )[0] ?? candidates.slice(0, 1);
  const lift = selected.indexOf(date);
  if (lift >= 0)
    return {
      activity: lift === 0 ? ("strength-a" as const) : ("strength-b" as const),
      title: `Home Strength ${lift === 0 ? "A" : "B"}`,
      minutes: 30,
      class: null,
    };
  const rest = [2, 5].includes(((index % 7) + 7) % 7);
  return {
    activity: rest ? ("recovery" as const) : ("walk" as const),
    title: rest ? "Rest day" : "Easy home walk",
    minutes: rest ? 0 : 10,
    class: null,
  };
}

export function coachTargets(activity: "strength-a" | "strength-b") {
  // The live home plan favors the user's comfortable wall-sit option on both
  // days. Leave the retired template untouched: importing an older B session
  // must still identify its Reverse Nordic work, not relabel it as a hold.
  // App.tsx also preserves started sessions through their saved snapshots.
  return homeStrengthTemplates[activity].map((move) =>
    move.id === "reverse-nordic"
      ? { id: "wall-sit", reps: "10-20 sec comfortable hold" }
      : move,
  );
}

/** Small walking increases use actual completed walks, not future appointments.
 * A break longer than three weeks starts the evidence count again. */
export function walkingMinutes(completed: string[], before: string) {
  let count = 0,
    last = "";
  for (const date of [...new Set(completed)].filter((d) => d < before).sort()) {
    count = last && distance(date, last) <= 21 ? count + 1 : 1;
    last = date;
  }
  return last && distance(before, last) <= 21
    ? Math.min(30, 10 + Math.floor(count / 4) * 5)
    : 10;
}

export function classFuel(state: CoachSchedule, date: string) {
  const c = classOn(state, date);
  if (!c) return null;
  const morning = Boolean(c.time && Number(c.time.slice(0, 2)) < 12);
  return {
    title: `Fuel for ${c.mode === "trial" ? "your trial" : "Muay Thai"}${c.time ? ` · ${c.time}` : ""}`,
    timings: {
      breakfast: morning
        ? "Breakfast before or after your morning class"
        : "Morning",
      lunch: morning ? "Midday, after class" : "Midday",
      snack: morning
        ? "Afternoon"
        : "Small snack 1–3 hours before class, if needed",
      dinner:
        morning || !c.time ? "Evening" : "After class, or 3–4 hours before",
    },
    detail:
      "Use a familiar main meal about 3–4 hours before class, or a smaller meal/snack 1–3 hours before. Move your planned snack rather than adding another full meal. Keep water available and take breaks; stop if you feel faint.",
    prepared:
      "Already cooked? Keep your containers as portioned. Move the planned snack before class; no recooking is needed.",
  };
}
