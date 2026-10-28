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
export function suggestedStart(today: string) {
  return today;
}
export const phase = (day: number) =>
  day <= 28
    ? "Arrive & repeat"
    : day <= 56
      ? "Build your base"
      : "Own the routine";
export const weekOf = (day: number) => Math.ceil(day / 7);
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
export const legacyPlan: DayPlan[] = [
  p(
    1,
    "walk",
    "Start the habit",
    "5-8",
    [
      "Walk comfortably, slowly enough to speak normally. No speed, incline or calorie target.",
    ],
    "Plan Wednesday's home practice and contact Friday's beginner class. Optional starting measurements.",
    "A short comfortable walk and a realistic schedule.",
    "A few comfortable minutes, or preparation only.",
  ),
  p(
    2,
    "walk",
    "Easy movement",
    "8",
    ["One relaxed walk. Keep the pace conversational."],
    "Prepare tomorrow's food. Confirm the gym address, transport and trial terms.",
    "Eight comfortable minutes, or a shorter walk.",
    "A few easy minutes.",
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
    "Warm-up and one easy exercise.",
  ),
  p(
    4,
    "recovery",
    "Recovery and preparation",
    "0",
    ["No required workout. Optional 5-8-minute comfortable walk."],
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
    ["Rest. Optional 5-10-minute easy walk if recovered."],
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
    ["Walk if recovered. No hills or intervals."],
    "Confirm tomorrow's class and transport.",
    "Comfortable movement or rest.",
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
      "A second set of ONE movement is optional only after comfortable attendance and a weekly review.",
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
    "Recovery, or one easy movement if this session was enabled.",
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
    "Recovery or one easy exercise.",
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
    ["Repeat easy, familiar Strength A if recovered. No maximum testing."],
    "Keep regular meals and familiar loads.",
    "A comfortable repeat.",
    "One comfortable movement or recovery.",
  ),
  p(
    30,
    "review",
    "Reflect and decide",
    "10 planning",
    [
      "Optional 15-minute comfortable walk. No strenuous test.",
      "Review weight averages, not a single weigh-in.",
    ],
    "Book the next class and review your Month 2 recommendation.",
    "A realistic continuation plan, whatever the scale says.",
    "Plan one next appointment.",
  ),
];
/** The calendar supplies appointments, NOT earned volume. resolveDay applies
 * attendance/recovery gates each time, so a missed month never unlocks harder work. */
export const starterPlan: DayPlan[] = Array.from({ length: 90 }, (_, i) => {
  const day = i + 1,
    position = i % 7;
  const weekly: Array<Omit<DayPlan, "day">> = [
    {
      activity: "strength-a",
      title: "Home Strength A",
      minutes: "20-30",
      steps: [
        "Warm up for 3-5 easy minutes, then a clearly lighter practice set of the first two movements.",
        "Work through the movements in order. Use a comfortable range, leave several repetitions in reserve and rest 90-180 seconds.",
      ],
      task: "Keep familiar loads. Log actual sets, not intended sets.",
      enough: "One controlled set of each movement. More is earned, not owed.",
      minimum:
        "Warm up and do one comfortable movement; record a smaller session.",
    },
    {
      activity: "walk",
      title: "An easy walk",
      minutes: "10",
      steps: [
        "Walk at a pace that lets you speak in full sentences. Split it into shorter walks if useful.",
      ],
      task: "Prepare clothes, water and a familiar snack for tomorrow's class.",
      enough: "Ten comfortable minutes, or less if needed.",
      minimum: "A few easy minutes or rest.",
    },
    {
      activity: "boxing",
      title: "Titan Muay Thai",
      minutes: "10-20",
      steps: [
        "Your class appointment is one hour; active technique time can be shorter. Tell the instructor you are building up and take breaks.",
        "Follow the instructor's introduction: stance, guard, balance and controlled technique. No automatic sparring or hard conditioning.",
      ],
      task: "Eat a normal meal 2-3 hours before class, or a familiar small carbohydrate snack 30-60 minutes before if needed. Bring water; avoid a large meal just before class.",
      enough: "Show up, learn one thing and finish at a manageable effort.",
      minimum:
        "Ask to observe or do a shorter technique practice. Record what actually happened.",
    },
    {
      activity: "recovery",
      title: "Make room for recovery",
      minutes: "0",
      steps: [
        "No scheduled training. Everyday movement is fine if comfortable.",
      ],
      task: "Notice how yesterday felt. Record recovery when you know, not in advance.",
      enough: "Rest. No compensating for food or missed sessions.",
      minimum: "Rest.",
    },
    {
      activity: "walk",
      title: "Walk & reset",
      minutes: "10",
      steps: [
        "Choose an easy route and a conversational pace. Duration only increases after comfortable recorded walks.",
      ],
      task: "Keep regular meals. Prepare the weekend's groceries.",
      enough: "An easy walk that you could repeat.",
      minimum: "A shorter walk or recovery.",
    },
    {
      activity: "strength-b",
      title: "Home Strength B",
      minutes: "20-30",
      steps: [
        "Only add this second strength day after it is earned and you choose it.",
        "Use the same gentle warm-up and an easy set of each movement. Do not increase load and sets together.",
      ],
      task: "Recovery is the default until a second session fits comfortably.",
      enough:
        "Controlled practice, or recovery if the extra session is not enabled.",
      minimum: "Rest, or warm up and do one easy movement.",
    },
    {
      activity: "review",
      title: "Reset for the week",
      minutes: "5 planning",
      steps: [
        "Look at actual attendance and recovery. Keep, simplify or repeat the routine; no catch-up sessions.",
      ],
      task: "Confirm Wednesday's class with Titan, prepare a few meals and choose the next realistic appointment.",
      enough: "One realistic next week, not a perfect one.",
      minimum: "Choose the next appointment.",
    },
  ];
  return day === 90
    ? {
        day,
        ...weekly[6],
        title: "Your 90-day reflection",
        task: "Review actual attendance, recovery, enjoyment and weight averages. Choose a repeatable next block; no maximum test or promised scale result.",
      }
    : { day, ...weekly[position] };
});
export function dayPlan(journey: Journey | undefined, slot: Slot): DayPlan {
  if (journey?.planVersion === "home-trial-90" && !slot.originalPlan) {
    const activity = (
      [
        "strength-a",
        "walk",
        "recovery",
        "strength-b",
        "walk",
        "recovery",
        "review",
      ] as const
    )[(slot.day - 1) % 7];
    const strength = isStrength(activity);
    return {
      day: slot.day,
      activity,
      title:
        activity === "strength-a"
          ? "Home Strength A"
          : activity === "strength-b"
            ? "Home Strength B"
            : activity === "walk"
              ? "Easy home walk"
              : activity === "review"
                ? "Plan the next week"
                : "Recovery day",
      minutes: strength
        ? "25-40"
        : activity === "walk"
          ? "10-15"
          : activity === "review"
            ? "5 planning"
            : "0",
      steps: strength
        ? [
            "Walk easily for 5-7 minutes. Before the first two movements, practise 5-8 repetitions with a clearly lighter weight than your working weight.",
            "Do two controlled working sets of the listed movements. Rest 90-180 seconds, breathe normally and finish with several comfortable repetitions still available.",
            "Use only a comfortable knee and hip range. Do not force squats or improvise a leg-curl setup on your multi-gym.",
          ]
        : activity === "walk"
          ? [
              "Walk at an easy, conversational pace. A shorter walk is fine; no hard finisher is required.",
            ]
          : [
              "Rest or do optional easy movement. Prepare the next meals without making up missed workouts.",
            ],
      task: strength
        ? "Familiar equipment, comfortable range, steady technique."
        : "Keep the day manageable.",
      enough: strength
        ? "Two controlled sets per movement; choose a lighter day when needed."
        : activity === "walk"
          ? "10-15 easy minutes, or less if needed."
          : "Recovery or a few minutes of planning.",
      minimum: strength
        ? "Warm up and do one comfortable movement, or rest."
        : "Rest is an option.",
    };
  }
  if (slot.originalPlan) {
    const source = slot.originalPlan === "titan-90" ? starterPlan : legacyPlan;
    return {
      ...(source[(slot.templateDay ?? slot.day) - 1] ?? source[0]),
      day: slot.day,
    };
  }
  if (journey?.planVersion !== "titan-90" || slot.legacy)
    return legacyPlan[slot.day - 1] ?? starterPlan[Math.min(89, slot.day - 1)];
  // Prescription identity survives moved appointments; day remains the ordinal.
  const templateDay = slot.templateDay ?? slot.day;
  return {
    ...(starterPlan[templateDay - 1] ??
      starterPlan[Math.min(89, templateDay - 1)]),
    day: slot.day,
  };
}
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
export const homeStrengthTemplates = {
  "strength-a": [
    { id: "mi6-leg-extension", reps: "8-12 per leg" },
    { id: "machine-chest-press", reps: "8-12" },
    { id: "mi6-seated-row", reps: "8-12" },
    { id: "mi6-cable-curl", reps: "10-12" },
    { id: "glute-bridge", reps: "8-12" },
    { id: "dead-bug", reps: "5 per side" },
  ],
  "strength-b": [
    { id: "mi6-leg-extension", reps: "8-12 per leg" },
    { id: "machine-chest-press", reps: "8-12" },
    { id: "mi6-seated-row", reps: "8-12" },
    { id: "mi6-bar-pressdown", reps: "10-12" },
    { id: "glute-bridge", reps: "8-12" },
    { id: "dead-bug", reps: "5 per side" },
  ],
} as const;
export function movementsFor(
  journey: Journey | undefined,
  activity: "strength-a" | "strength-b",
  slot?: Slot,
) {
  if (journey?.planVersion !== "home-trial-90" || slot?.originalPlan) return strengthTemplates[activity];
  const log = slot ? journey.logs[slot.id] : undefined;
  // An equipment correction applies to unstarted sessions, not to actual old
  // machine work. Preserve the old prescription AND its earned training credit.
  const recordedMachine = log && (log.plannedExerciseIds?.includes("seated-leg-extension") || log.sets["seated-leg-extension"])
    && (log.outcome === "planned" || log.outcome === "modified" || Object.values(log.sets).some(s => s.done || s.weight || s.reps));
  return homeStrengthTemplates[activity].map(row => recordedMachine && row.id === "mi6-leg-extension"
    ? { id: "seated-leg-extension", reps: "8-12" } : row);
}
export function makeJourney(
  start: string,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
  version: "legacy-30" | "titan-90" = "titan-90",
): Journey {
  if (!isCalendarDate(start)) throw new Error("Choose a valid start date.");
  if (version === "legacy-30" && weekday(start) !== 1)
    throw new Error("Choose a Monday.");
  return {
    planVersion: version,
    id,
    createdAt: now,
    startedOn: start,
    slots: Object.fromEntries(
      (version === "legacy-30" ? legacyPlan : starterPlan).map((p) => {
        const slot: Slot = {
          id: `day-${p.day}`,
          day: p.day,
          date: addDays(start, p.day - 1),
        };
        if (version === "titan-90" && weekday(start) !== 1) {
          const position = (weekday(slot.date) + 6) % 7,
            templateDay = Math.floor((p.day - 1) / 7) * 7 + position + 1;
          // The final template is a saved Monday-start reflection, not Saturday's
          // normal session. Reuse week one for that Saturday or the missing Sunday.
          slot.templateDay = templateDay >= 90 ? position + 1 : templateDay;
        }
        return [slot.id, slot];
      }),
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
// Repeated weeks keep their original prescription day, but their navigation
// belongs to a new calendar week. Do not group fourteen rows under one week.
export const calendarWeekOf = (journey: Journey, slot: Slot) =>
  Math.max(
    1,
    Math.floor(
      (Date.parse(`${slot.date}T12:00:00Z`) -
        Date.parse(`${journey.startedOn}T12:00:00Z`)) /
        (7 * 86400000),
    ) + 1,
  );
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
    dayPlan(journey, slot).activity !== "boxing" ||
    journey.logs[id]?.outcome
  )
    throw new Error("Only an unrecorded boxing appointment can move.");
  if (target < today || !isCalendarDate(target))
    throw new Error("Choose a future or current date.");
  if (
    journey.planVersion === "titan-90" &&
    !slot.legacy &&
    ![1, 3].includes(weekday(target))
  )
    throw new Error(
      "Titan publishes these Introduction/Beginner classes on Monday and Wednesday at 6:15 pm. Confirm another suitable appointment with Titan; do not assume a different day's class is equivalent.",
    );
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
    (structured(dayPlan(journey, other).activity) ||
      journey.logs[other.id]?.outcome)
  )
    throw new Error(
      "That day already has a workout or record. Choose a recovery or walking day.",
    );
  if (
    Object.values(journey.slots).some(
      (s) =>
        s.id !== id &&
        structured(dayPlan(journey, s).activity) &&
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
      ...s,
      id,
      date: addDays(afterDate, index + 1),
      note: "Repeated week: familiar level, new attendance record.",
    };
  });
  return { ...j, slots };
}
