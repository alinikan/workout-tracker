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
};
export type CoachSchedule = {
  version: 1;
  homeFrom: string | null;
  legacyImported: boolean;
  // Append-only choices merge safely across devices. Each complete choice has
  // its own ID, so sync cannot combine one device's date with another's time.
  choices: Record<string, ClassChoice>;
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

export function choiceForDate(
  state: CoachSchedule,
  date: string,
): ClassChoice | null {
  return (
    Object.values(state.choices)
      .filter((choice) => choice.effectiveOn <= date)
      .sort(
        (a, b) =>
          b.effectiveOn.localeCompare(a.effectiveOn) ||
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
          b.id.localeCompare(a.id),
      )[0] ?? null
  );
}

/** A choice takes effect today, or on a not-yet-started program's first day.
 * Past choices remain available to historical dates; removing a class is a new
 * home choice rather than deleting a record a stale device might resurrect. */
export function saveCoachChoice(
  state: CoachSchedule,
  input: Omit<ClassChoice, "id" | "updatedAt" | "effectiveOn">,
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
  const choice = {
    ...input,
    id,
    updatedAt,
    effectiveOn: today > start ? today : start,
  };
  if (!validChoice(choice))
    throw new Error(
      "Choose today or a future class date, a valid time, and one or two non-consecutive weekly class days. Duration must be 15–90 minutes.",
    );
  return {
    ...state,
    homeFrom: state.homeFrom ?? choice.effectiveOn,
    choices: { ...state.choices, [id]: choice },
  };
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
      Object.entries(state.choices).filter(([, c]) => c.effectiveOn <= date),
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
  return homeStrengthTemplates[activity];
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
