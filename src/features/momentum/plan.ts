import { isCalendarDate } from "../../lib/programLifecycle.ts";
import type {
  Activity,
  DayPlan,
  Journey,
  MomentumData,
  Slot,
} from "./types.ts";

// UTC noon arithmetic works on date-only strings across DST. Rendering uses the
// device's local date; class exports explicitly use the Vancouver time zone.
export const addDays = (date: string, count: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000)
    .toISOString()
    .slice(0, 10);
export const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).getUTCDay();
export const firstMondayAfter = (date: string) =>
  addDays(date, (8 - weekday(date)) % 7 || 7);
export function suggestedStart(assessedOn: string, today: string) {
  const first = firstMondayAfter(
    isCalendarDate(assessedOn) ? assessedOn : today,
  );
  return first >= today
    ? first
    : weekday(today) === 1
      ? today
      : firstMondayAfter(today);
}
export const phase = (day: number) =>
  day <= 7
    ? "Just begin"
    : day <= 14
      ? "Repeat"
      : day <= 21
        ? "Build carefully"
        : day <= 28
          ? "Make it a routine"
          : "Reflect and continue";
export const weekOf = (day: number) => Math.min(5, Math.ceil(day / 7));
const p = (
  day: number,
  activity: Activity,
  title: string,
  minutes: string,
  steps: string[],
  task: string,
  enough: string,
  minimum: string,
): DayPlan => ({ day, activity, title, minutes, steps, task, enough, minimum });
export const starterPlan: DayPlan[] = [
  p(
    1,
    "walk",
    "Start the habit",
    "5-8",
    [
      "Walk comfortably, slowly enough to speak normally. No speed, incline or calorie target.",
    ],
    "Plan Wednesday's home practice and contact Friday's beginner class. Optional starting measurements.",
    "A short permitted walk and a realistic schedule.",
    "A few comfortable minutes, or preparation only if exercise is not permitted.",
  ),
  p(
    2,
    "walk",
    "Easy movement",
    "8",
    ["One relaxed walk. Keep the pace conversational."],
    "Prepare tomorrow's food. Confirm the gym address, transport and trial terms.",
    "Eight comfortable minutes or a medically appropriate alternative.",
    "A few easy minutes if permitted.",
  ),
  p(
    3,
    "strength-a",
    "First home Strength A",
    "15-25",
    [
      "Warm up gently for 3-5 minutes.",
      "One very easy set per exercise; generous rests. Finish with two gentle minutes.",
    ],
    "Log only what you actually did, effort and any symptoms.",
    "One to three comfortable exercises is a successful attempt, recorded as modified.",
    "Warm-up and one permitted easy exercise.",
  ),
  p(
    4,
    "recovery",
    "Recovery and preparation",
    "0",
    [
      "No required workout. Optional 5-8-minute comfortable walk only if permitted.",
    ],
    "Set out clothes and water. Ask the instructor for a light, non-contact introduction with breaks.",
    "Rest and class preparation.",
    "Rest.",
  ),
  p(
    5,
    "boxing",
    "First boxing introduction",
    "10-20",
    [
      "Instructor-approved light technique with breaks: stance, guard and basic movement.",
      "Observe the rest if needed. No sparring, hard intervals, burpees or conditioning circuits.",
    ],
    "Keep regular meals and a tolerable pre-class snack. Record enjoyment and comfort.",
    "Attend and learn something; observing counts as a modified visit, not a full workout.",
    "Attend and observe with the coach's agreement.",
  ),
  p(
    6,
    "recovery",
    "Recovery",
    "0",
    ["Rest. Optional 5-10-minute easy walk only if recovered and permitted."],
    "Check fatigue and soreness. No compensation for missed activity.",
    "Appropriate recovery.",
    "Rest.",
  ),
  p(
    7,
    "review",
    "Weekly planning",
    "10 planning",
    ["No required workout. Spend ten minutes planning."],
    "Book the next class, schedule one light strength practice and make a short grocery list.",
    "A realistic Week 2 plan.",
    "Choose the next appointment.",
  ),
  p(
    8,
    "strength-a",
    "Strength A",
    "15-25",
    [
      "Gentle 3-5-minute warm-up; one easy set each. Keep familiar loads; two-minute cool-down.",
    ],
    "Record effort and schedule the next class.",
    "Comfortable strength practice.",
    "Warm-up and one easy movement.",
  ),
  p(
    9,
    "walk",
    "Easy walk",
    "10",
    ["One conversational walk, or two five-minute walks."],
    "Prepare regular meals and choose a repeatable walking time.",
    "One easy walk.",
    "A short comfortable walk.",
  ),
  p(
    10,
    "recovery",
    "Rest and skill review",
    "0",
    [
      "No required workout. Optionally review your instructor's stance/guard notes without conditioning.",
    ],
    "Five minutes of preparation. Notice lingering fatigue or joint discomfort.",
    "Recovery and preparation.",
    "Rest and read one coach note.",
  ),
  p(
    11,
    "walk",
    "Easy movement",
    "10-12",
    ["Walk only if recovered and permitted. No hills or intervals."],
    "Confirm tomorrow's class and transport.",
    "Comfortable movement or medically advised rest.",
    "A few easy minutes or rest.",
  ),
  p(
    12,
    "boxing",
    "Boxing session two",
    "15-25",
    [
      "Low-intensity technique only if the previous visit was tolerated. Rest or observe as needed.",
      "No sparring or intense circuits.",
    ],
    "Ask the coach for one technique correction. Protect your pre-class snack.",
    "Attend and practise at a safe level.",
    "A short introduction or observation.",
  ),
  p(
    13,
    "recovery",
    "Recovery",
    "0",
    ["No required workout. Optional ten-minute easy walk if recovered."],
    "Check whether the schedule is realistic; do not make it harder when struggling.",
    "Appropriate recovery.",
    "Rest.",
  ),
  p(
    14,
    "review",
    "Two-week checkpoint",
    "10 planning",
    [
      "No training requirement. Review real attendance, recovery and enjoyment.",
    ],
    "Prepare meals and appointments. Repeat this level if it was not comfortable.",
    "A realistic progression decision, including no increase.",
    "Choose one manageable appointment.",
  ),
  p(
    15,
    "strength-a",
    "Strength A",
    "15-25",
    [
      "3-5-minute warm-up; one easy set per exercise. Keep loads steady.",
      "A second set of ONE movement is optional only after the review and permission checks.",
    ],
    "Log actual work; never increase load and volume together.",
    "Controlled, comfortable practice.",
    "Warm-up plus one easy movement.",
  ),
  p(
    16,
    "walk",
    "Comfortable walking",
    "12-15",
    [
      "An easy conversational walk; split it if necessary. Stop before exhaustion.",
    ],
    "Prepare Wednesday's clothes.",
    "An easy walk.",
    "A few comfortable minutes.",
  ),
  p(
    17,
    "strength-b",
    "Introduce Strength B",
    "15-25",
    [
      "3-5-minute warm-up, one very light set per exercise, generous rests and comfortable ranges.",
      "This extra day is replaced by recovery unless explicitly enabled after a comfortable fortnight.",
    ],
    "Choose recovery if the second day is not yet sustainable.",
    "Two or three comfortable exercises can be enough, logged as modified.",
    "Recovery, or one permitted movement if this session was enabled.",
  ),
  p(
    18,
    "recovery",
    "Full recovery",
    "0",
    ["No required training. Everyday mobility only if comfortable."],
    "Prepare food and water; confirm the class.",
    "Rest and recover.",
    "Rest.",
  ),
  p(
    19,
    "boxing",
    "Beginner boxing",
    "20-30",
    [
      "Light technique with breaks only after comfortable previous visits.",
      "Focus on one instructor-taught skill, not exhausting rounds.",
    ],
    "Confirm fuel, transport and one learning focus.",
    "Attend safely and learn one skill.",
    "Observe or repeat a shorter introduction.",
  ),
  p(
    20,
    "recovery",
    "Walk or recovery",
    "0",
    [
      "Optional 12-15-minute comfortable walk if recovered; otherwise rest. No calorie target.",
    ],
    "Prepare some food for the following days.",
    "Appropriate activity or recovery.",
    "Rest.",
  ),
  p(
    21,
    "review",
    "Weekly reset",
    "10 planning",
    ["No required exercise. Review the week's real participation."],
    "Reserve the next class, plan manageable strength appointments and remove one practical barrier.",
    "A realistic Week 4 schedule.",
    "Choose one next appointment.",
  ),
  p(
    22,
    "strength-a",
    "Strength A",
    "15-25",
    [
      "Warm up 3-5 minutes. One set with the same comfortable loads.",
      "Optional extra volume requires an explicit eligible review; no personal records.",
    ],
    "Repeat safely and log actual work.",
    "A comfortable repeat.",
    "One easy movement after warming up.",
  ),
  p(
    23,
    "walk",
    "Easy walking",
    "15",
    [
      "Only extend the walk if previous walks were comfortable. Stop while comfortable.",
    ],
    "Prepare tomorrow's food and workout time.",
    "One easy walk.",
    "A shorter comfortable walk.",
  ),
  p(
    24,
    "strength-b",
    "Strength B",
    "15-25",
    [
      "3-5-minute warm-up; one easy set per exercise. Rest as needed.",
      "This extra session needs an explicitly accepted, eligible adaptation.",
    ],
    "Use recovery instead if adding a session is not appropriate.",
    "Controlled practice or appropriate recovery.",
    "Recovery or one permitted easy exercise.",
  ),
  p(
    25,
    "recovery",
    "Recovery",
    "0",
    ["No scheduled training."],
    "Set out equipment and water; confirm class and transportation.",
    "Recovery and preparation.",
    "Rest.",
  ),
  p(
    26,
    "boxing",
    "Fourth boxing visit",
    "25-40",
    [
      "Only after consistently comfortable visits and coach agreement: light technique, interrupted by rests.",
      "The full class is not required. No sparring or hard conditioning.",
    ],
    "Ask about a sustainable ongoing beginner class.",
    "Continue learning with your instructor.",
    "Observe or repeat a shorter visit.",
  ),
  p(
    27,
    "recovery",
    "Optional walking",
    "0",
    ["Optional 15-20-minute easy walk if recovered; otherwise rest."],
    "Notice whether movement feels less intimidating.",
    "Appropriate activity or recovery.",
    "Rest.",
  ),
  p(
    28,
    "review",
    "Monthly reflection",
    "10 planning",
    ["No required exercise. Review attendance, recovery and enjoyment."],
    "Decide whether to keep the gym. Avoid a long contract to manufacture motivation.",
    "A realistic Month 2 recommendation.",
    "Choose what you want to repeat.",
  ),
  p(
    29,
    "strength-a",
    "Easy Strength A",
    "15-25",
    [
      "Repeat easy, familiar Strength A only if recovered and permitted. No maximum testing.",
    ],
    "Keep regular meals and familiar loads.",
    "A comfortable repeat.",
    "One permitted movement or recovery.",
  ),
  p(
    30,
    "review",
    "Reflect and decide",
    "10 planning",
    [
      "Optional 15-minute comfortable walk. No strenuous test.",
      "Review averages, not a single weigh-in. An optional waist update is enough for the month.",
    ],
    "Book the next class and review your Month 2 recommendation.",
    "A realistic continuation plan, whatever the scale says.",
    "Plan one next appointment.",
  ),
];
export const strengthTemplates = {
  "strength-a": [
    { id: "leg-press", reps: "8" },
    { id: "incline-db-press", reps: "8" },
    { id: "lat-pulldown", reps: "8" },
    { id: "dead-bug", reps: "5 per side" },
  ],
  "strength-b": [
    { id: "leg-press", reps: "8" },
    { id: "single-arm-row", reps: "8 per side" },
    { id: "glute-bridge", reps: "8-10" },
    { id: "incline-push-up", reps: "6-8" },
  ],
} as const;
export function makeJourney(
  start: string,
  id = crypto.randomUUID(),
  now = new Date().toISOString(),
): Journey {
  if (!isCalendarDate(start) || weekday(start) !== 1)
    throw new Error("Choose a Monday.");
  return {
    id,
    createdAt: now,
    startedOn: start,
    slots: Object.fromEntries(
      starterPlan.map((p) => [
        `day-${p.day}`,
        { id: `day-${p.day}`, day: p.day, date: addDays(start, p.day - 1) },
      ]),
    ),
    logs: {},
    reviews: {},
    adaptations: {},
    pauses: {},
  };
}
export const sortedSlots = (journey: Journey) =>
  Object.values(journey.slots).sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
export const currentJourney = (data: MomentumData) =>
  data.activeJourneyId ? data.journeys[data.activeJourneyId] : undefined;
export const isStrength = (
  activity: Activity,
): activity is keyof typeof strengthTemplates =>
  activity === "strength-a" || activity === "strength-b";
export const structured = (activity: Activity) =>
  isStrength(activity) || activity === "boxing";

/** Moving a booking never rewrites a performed date or another recorded session.
 * Keep at least 48 calendar hours between structured appointments. */
export function rescheduleClass(
  journey: Journey,
  id: string,
  target: string,
  today: string,
): Journey {
  const slot = journey.slots[id];
  if (
    !slot ||
    starterPlan[slot.day - 1].activity !== "boxing" ||
    journey.logs[id]?.outcome
  )
    throw new Error("Only an unrecorded boxing appointment can move.");
  if (target < today || !isCalendarDate(target))
    throw new Error("Choose a future or current date.");
  const sameWeek = (d: string) => addDays(d, -((weekday(d) + 6) % 7));
  if (sameWeek(target) !== sameWeek(slot.date))
    throw new Error(
      "Choose a day in the same week so the rest of the plan stays understandable.",
    );
  const other = Object.values(journey.slots).find(
    (s) => s.id !== id && s.date === target,
  );
  if (
    other &&
    (structured(starterPlan[other.day - 1].activity) ||
      journey.logs[other.id]?.outcome)
  )
    throw new Error(
      "That day already has a workout or record. Choose a recovery or walking day.",
    );
  if (
    Object.values(journey.slots).some(
      (s) =>
        s.id !== id &&
        structured(starterPlan[s.day - 1].activity) &&
        Math.abs(
          Date.parse(`${s.date}T12:00Z`) - Date.parse(`${target}T12:00Z`),
        ) <
          2 * 86400000,
    )
  )
    throw new Error(
      "Keep 48 hours between strength and boxing. Choose another class day.",
    );
  return {
    ...journey,
    logs: {
      ...journey.logs,
      ...(journey.logs[id]
        ? { [id]: { ...journey.logs[id], booked: false } }
        : {}),
    },
    slots: {
      ...journey.slots,
      [id]: {
        ...slot,
        date: target,
        note: `Class moved from ${slot.date}; recovery spacing preserved. Confirm the new booking with the gym.`,
      },
      ...(other
        ? {
            [other.id]: {
              ...other,
              date: slot.date,
              note: "Moved to preserve the class appointment and recovery.",
            },
          }
        : {}),
    },
  };
}

/** Repeat an unstarted future week, not its logs. Distinct IDs preserve history.
 * Existing future outcomes/bookings block shifts rather than silently moving them. */
export function repeatWeek(
  j: Journey,
  afterDate: string,
  today: string,
  token: string,
): Journey {
  if (afterDate < today || weekday(afterDate) !== 0)
    throw new Error("Repeat after this or a future Sunday.");
  const future = Object.values(j.slots).filter((s) => s.date > afterDate);
  if (future.some((s) => j.logs[s.id]?.outcome || j.logs[s.id]?.booked))
    throw new Error(
      "Review future recorded/booked appointments before shifting the calendar.",
    );
  const week = sortedSlots(j).filter(
    (s) => s.date >= addDays(afterDate, -6) && s.date <= afterDate,
  );
  if (week.length !== 7)
    throw new Error("Choose a complete seven-day week to repeat.");
  const slots = { ...j.slots };
  for (const s of future) slots[s.id] = { ...s, date: addDays(s.date, 7) };
  week.forEach((s, index) => {
    const id = `repeat-${token}-${index}`;
    slots[id] = {
      id,
      day: s.day,
      date: addDays(afterDate, index + 1),
      note: "Repeated week: familiar level, new attendance record.",
    };
  });
  return { ...j, slots };
}
