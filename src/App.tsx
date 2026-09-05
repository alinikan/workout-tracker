import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "./lib/supabaseClient";
import { canClaimLocalProgress, mergeProgressChanges, sameData } from "./lib/syncMerge";

/**
 * App.tsx is intentionally the main "product brain" for this personal tracker.
 *
 * Tutorial map:
 * 1. Types describe the shape of workout, diet, progress, and sync data.
 * 2. Static data defines the exercise library, recipes, weekly schedule, and meal plan.
 * 3. Pure helper functions calculate dates, phases, progressive targets, swaps, and summaries.
 * 4. Storage helpers normalize/merge localStorage and Supabase data so old saves keep working.
 * 5. React components render the coach hub, workout tracker, diet tracker, modals, and Gym Mode.
 *
 * Keeping those layers in one file makes the app easy to customize for a single-person project:
 * change an exercise, recipe, or schedule in one place, then run the tests to make sure the main
 * behaviors are still present.
 */

// These union types keep navigation, day labels, movement categories, and statuses typo-proof.
// When TypeScript sees a value like "strength" or "diet", it can verify that the UI and helpers
// only use the values this app actually understands.
type SessionType = "strength" | "cardio" | "movement" | "recovery";
type AppMode = "hub" | "workout" | "diet";
type AppSection = "today" | "gym" | "week" | "progress" | "library";
type PlanWeekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
type IconName =
  | "activity"
  | "calendar"
  | "cart"
  | "check"
  | "chevronLeft"
  | "chevronRight"
  | "cloud"
  | "dumbbell"
  | "library"
  | "mail"
  | "play"
  | "progress"
  | "scale"
  | "search"
  | "spark"
  | "swap"
  | "trophy"
  | "user"
  | "video"
  | "x";

type Resource = {
  label: string;
  url: string;
};

type MotionDemo = {
  workoutXId: string;
  label: string;
  match: "exact" | "reference";
};

type TrainingLocation = "upstairs" | "downstairs" | "downstairs-outside" | "either";
type SkipReason = "time" | "pain" | "equipment" | "fatigue" | "other";
type MoveStatus = "pending" | "done" | "skipped";
type DayStatus = "incomplete" | "complete" | "finished-with-skips" | "skipped";
type DietMealSlot = "breakfast" | "lunch" | "snack" | "dinner";
type DietDayType = "strength" | "cardio" | "recovery";
type ExercisePriority = "main" | "accessory" | "optional";
type EffortFeedback = "too-easy" | "about-right" | "very-hard";
type ReadinessStatus = "green" | "yellow" | "red";
type EnergyLevel = "low" | "normal" | "great";
type SorenessLevel = "none" | "mild" | "high";
type JointPainLevel = "none" | "mild" | "concerning";
type SleepLevel = "poor" | "okay" | "good";
type MonthlyRecovery = "easy" | "about-right" | "very-hard";
type CalorieMode = "calculated" | "lower" | "higher";

type ExerciseTiming = {
  minRestSeconds: number;
  maxRestSeconds: number;
  setSeconds: number;
  setupSeconds: number;
};

type ReadinessLog = {
  energy?: EnergyLevel;
  soreness?: SorenessLevel;
  jointPain?: JointPainLevel;
  sleep?: SleepLevel;
};

type UserSettings = {
  calorieMode: CalorieMode;
};

type SkipRequest = {
  date: string;
  // null selects a whole workout day; the captured date is always the write target.
  originalExerciseId: string | null;
  source: "today" | "gym" | "detail";
};

type DietRecipe = {
  id: string;
  slot: DietMealSlot;
  title: string;
  shortTitle: string;
  photo: string;
  calories: string;
  protein: string;
  tags: string[];
  ingredients: string[];
  prep: string[];
  plate: string[];
};

type ShoppingCategory = "Protein & dairy" | "Produce" | "Carbs" | "Pantry";

type ShoppingItem = {
  name: string;
  category: ShoppingCategory;
  portions: string[];
  recipeNames: string[];
};

type WeightWeekSummary = {
  week: number;
  startIso: string;
  endIso: string;
  loggedDays: number;
  missingDays: number;
  average: number | null;
};

type WeightEntry = {
  date: string;
  dayNumber: number;
  weight: number;
  note: string;
};

type ProteinReference = {
  weight: number | null;
  label: string;
  detail: string;
};

type AdaptiveDietTone = "logging" | "hold" | "fuel" | "tighten" | "consistency";

type WeightTrendSignal = {
  status: "waiting" | "fast-loss" | "on-track-loss" | "steady" | "stalled" | "gaining";
  label: string;
  detail: string;
  deltaKg: number | null;
};

type TrainingAdherenceSignal = {
  completed: number;
  total: number;
  percent: number;
  enough: boolean;
  label: string;
};

type AdaptiveDietCoach = {
  tone: AdaptiveDietTone;
  label: string;
  headline: string;
  detail: string;
  trend: WeightTrendSignal;
  adherence: TrainingAdherenceSignal;
};

type SmartPortionAdvice = {
  tone: AdaptiveDietTone;
  title: string;
  detail: string;
  items: string[];
};

// The app uses a tiny inline icon system instead of a larger icon dependency. That keeps the bundle
// small and makes every icon available offline after the PWA shell is cached.
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  return (
    <svg {...commonProps}>
      {name === "activity" && <path d="M3 12h4l3-8 4 16 3-8h4" />}
      {name === "calendar" && (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      )}
      {name === "cart" && <path d="M5 6h2l2 10h8l2-7H8M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />}
      {name === "check" && <path d="M5 13l4 4L19 7" />}
      {name === "chevronLeft" && <path d="M15 18l-6-6 6-6" />}
      {name === "chevronRight" && <path d="M9 6l6 6-6 6" />}
      {name === "cloud" && <path d="M6 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 6 18Z" />}
      {name === "dumbbell" && <path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8" />}
      {name === "library" && <path d="M5 4v16M10 6v14M15 4l4 16" />}
      {name === "mail" && (
        <>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </>
      )}
      {name === "play" && <path d="M8 5v14l11-7Z" />}
      {name === "progress" && <path d="M4 17 9 12l4 4 7-9M4 21h16" />}
      {name === "scale" && <path d="M12 3v18M7 6h10M5 6l-3 7h6L5 6ZM19 6l-3 7h6l-3-7ZM8 21h8" />}
      {name === "search" && (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </>
      )}
      {name === "spark" && <path d="m12 3 1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16ZM19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9L19 15Z" />}
      {name === "swap" && <path d="M7 7h11l-3-3M17 17H6l3 3M18 7l-4 4M6 17l4-4" />}
      {name === "trophy" && <path d="M8 4h8v3a4 4 0 0 1-8 0V4ZM6 6H4a4 4 0 0 0 4 4M18 6h2a4 4 0 0 1-4 4M12 12v5M9 20h6" />}
      {name === "user" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </>
      )}
      {name === "video" && (
        <>
          <rect x="4" y="6" width="12" height="12" rx="2" />
          <path d="m16 10 4-2v8l-4-2" />
        </>
      )}
      {name === "x" && <path d="M18 6 6 18M6 6l12 12" />}
    </svg>
  );
}

type Exercise = {
  id: string;
  name: string;
  shortName: string;
  family: "legs" | "push" | "pull" | "hinge" | "core" | "arms" | "warmup" | "cardio";
  equipment: string;
  target: string;
  reps: string;
  rest: string;
  cues: string[];
  avoid: string[];
  progression: string;
  priority?: ExercisePriority;
  timing?: Partial<ExerciseTiming>;
  motionDemo?: MotionDemo;
  youtubeId?: string;
  logType?: "weight" | "done";
  loadLabel?: string;
  trainingLocation?: TrainingLocation;
  locationNote?: string;
  swapIds?: string[];
  resources: Resource[];
};

type SessionTemplate = {
  title: string;
  type: SessionType;
  code: string;
  time: string;
  summary: string;
  accent: string;
  exerciseIds: string[];
  tasks: string[];
  finisher?: string;
};

type SetLog = {
  weight: string;
  reps: string;
  effort?: EffortFeedback;
  done: boolean;
};

type DayLog = {
  completed: boolean;
  daySkipReason?: SkipReason;
  warmup: Record<string, boolean>;
  tasks: Record<string, boolean>;
  exercises: Record<string, SetLog[]>;
  skips: Record<string, SkipReason>;
  swaps: Record<string, string>;
  readiness: ReadinessLog;
  monthlyRecovery?: MonthlyRecovery;
  notes: string;
};

type MetricLog = {
  weight: string;
  weightKg: string;
  photoReminderDone: boolean;
  note: string;
};

type DietDayLog = {
  completed: boolean;
  meals: Record<DietMealSlot, boolean>;
  swaps: Partial<Record<DietMealSlot, string>>;
  notes: string;
};

type TrackerStore = {
  days: Record<string, DayLog>;
  dietDays: Record<string, DietDayLog>;
  metrics: Record<string, MetricLog>;
  settings: UserSettings;
};

type StoreMeta = {
  localUpdatedAt?: string;
  lastCloudSyncedAt?: string;
  cloudUpdatedAt?: string;
  lastUserId?: string;
};

type CloudStatus = "local-only" | "signed-out" | "loading" | "saving" | "synced" | "error";

type PlanDay = {
  iso: string;
  index: number;
  week: number;
  trainingWeek?: number;
  dayName: string;
  planDayName: PlanWeekday;
  session: SessionTemplate;
};

// Storage keys are versioned. If the saved data shape ever needs a hard migration, changing these
// names is the simple escape hatch; otherwise the normalizers below keep older saved rows readable.
const STORAGE_KEY = "body-recomp-gym-tracker-v1";
const STORAGE_META_KEY = "body-recomp-gym-tracker-meta-v1";

// The program calendar starts on a Monday and runs for 26 weeks. The real calendar date and the
// program weekday are both stored on each PlanDay so the app can show "today" while still following
// the Monday-through-Sunday training rhythm.
const START_DATE = "2026-08-31";
const PROGRAM_DAYS = 182;
const STRENGTH_SESSIONS_PER_WEEK = 3;
const EARNED_WEEK_ADHERENCE_GATE = 0.75;

// Strength sessions start with a short, repeatable warm-up. The extra squat, hinge, push-up, and
// plank drills stay in the library, but Month 1 should not feel like a long circuit before lifting.
const strengthWarmupIds = [
  "warmup-treadmill-walk",
  "seated-knee-extension-warmup",
  "standing-supported-hip-abduction",
];

const skipReasonOptions: Array<{ id: SkipReason; label: string }> = [
  { id: "time", label: "Time" },
  { id: "pain", label: "Pain" },
  { id: "equipment", label: "Equipment" },
  { id: "fatigue", label: "Fatigue" },
  { id: "other", label: "Other" },
];

const effortOptions: Array<{ id: EffortFeedback; label: string; detail: string }> = [
  {
    id: "too-easy",
    label: "Too easy",
    detail: "The set finished with more reps available than planned.",
  },
  {
    id: "about-right",
    label: "About right",
    detail: "The set matched the target effort and form stayed clean.",
  },
  {
    id: "very-hard",
    label: "Very hard",
    detail: "Form slowed down or the set felt close to failure.",
  },
];

const readinessQuestions = {
  energy: [
    { id: "low", label: "Low" },
    { id: "normal", label: "Normal" },
    { id: "great", label: "Great" },
  ],
  soreness: [
    { id: "none", label: "None" },
    { id: "mild", label: "Mild" },
    { id: "high", label: "High" },
  ],
  jointPain: [
    { id: "none", label: "None" },
    { id: "mild", label: "Mild" },
    { id: "concerning", label: "Concerning" },
  ],
  sleep: [
    { id: "poor", label: "Poor" },
    { id: "okay", label: "Okay" },
    { id: "good", label: "Good" },
  ],
} satisfies {
  energy: Array<{ id: EnergyLevel; label: string }>;
  soreness: Array<{ id: SorenessLevel; label: string }>;
  jointPain: Array<{ id: JointPainLevel; label: string }>;
  sleep: Array<{ id: SleepLevel; label: string }>;
};

const monthlyRecoveryOptions: Array<{ id: MonthlyRecovery; label: string }> = [
  { id: "easy", label: "Easy" },
  { id: "about-right", label: "About right" },
  { id: "very-hard", label: "Very hard" },
];

// These accessories were added to the lower-body days and scale separately from the main compound
// lifts so quads and hamstrings get direct machine work without making early weeks overwhelming.
const lowerMachineAccessoryIds = ["seated-leg-extension", "seated-leg-curl"];

// Meal slots are defined once and reused by logs, UI cards, swap filtering, and completion checks.
const dietMealSlots: Array<{ id: DietMealSlot; label: string }> = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "snack", label: "Snack" },
  { id: "dinner", label: "Dinner" },
];

// Macro targets are intentionally presented as ranges. A beginner can follow the meals without
// micromanaging, while still understanding why strength days carry more carbs than recovery days.
const dietTargets: Record<DietDayType, { label: string; calories: string; protein: string; carbs: string; fat: string }> = {
  strength: {
    label: "Strength day",
    calories: "~2,050 kcal",
    protein: "150-165 g protein",
    carbs: "205-230 g carbs",
    fat: "55-65 g fat",
  },
  cardio: {
    label: "Cardio day",
    calories: "~1,950 kcal",
    protein: "150-165 g protein",
    carbs: "175-205 g carbs",
    fat: "55-65 g fat",
  },
  recovery: {
    label: "Recovery day",
    calories: "~1,850 kcal",
    protein: "150-165 g protein",
    carbs: "135-165 g carbs",
    fat: "60-75 g fat",
  },
};

const defaultDietCalories: Record<DietDayType, number> = {
  strength: 2050,
  cardio: 1950,
  recovery: 1850,
};

const emptyStore = (): TrackerStore => ({
  days: {},
  dietDays: {},
  metrics: {},
  settings: createEmptySettings(),
});

// The to-buy list groups recipe ingredients into a small number of store sections. It is not tied
// to one store, so it works for Costco, a normal grocery store, or whatever is convenient.
const shoppingCategories: ShoppingCategory[] = ["Protein & dairy", "Produce", "Carbs", "Pantry"];

// Unsplash image URLs are generated from stable photo IDs so recipe cards feel visual without
// shipping large image files inside the repository.
const foodPhoto = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=900&q=80`;

// Factory helpers create fresh log objects. Returning a new object each time avoids accidentally
// sharing nested state between days, which is a common React bug in trackers.
const emptySet = (): SetLog => ({
  weight: "",
  reps: "",
  done: false,
});

const createEmptySettings = (): UserSettings => ({
  calorieMode: "calculated",
});

const createEmptyDay = (): DayLog => ({
  completed: false,
  warmup: {},
  tasks: {},
  exercises: {},
  skips: {},
  swaps: {},
  readiness: {},
  notes: "",
});

const createEmptyMetric = (): MetricLog => ({
  weight: "",
  weightKg: "",
  photoReminderDone: false,
  note: "",
});

const createEmptyDietDay = (): DietDayLog => ({
  completed: false,
  meals: {
    breakfast: false,
    lunch: false,
    snack: false,
    dinner: false,
  },
  swaps: {},
  notes: "",
});

function isEffortFeedback(value: unknown): value is EffortFeedback {
  return effortOptions.some((option) => option.id === value);
}

function isMonthlyRecovery(value: unknown): value is MonthlyRecovery {
  return monthlyRecoveryOptions.some((option) => option.id === value);
}

function isCalorieMode(value: unknown): value is CalorieMode {
  return value === "calculated" || value === "lower" || value === "higher";
}

function normalizeSetLogShape(row: Partial<SetLog> | undefined): SetLog {
  return {
    weight: typeof row?.weight === "string" ? row.weight : "",
    reps: typeof row?.reps === "string" ? row.reps : "",
    effort: isEffortFeedback(row?.effort) ? row.effort : undefined,
    done: Boolean(row?.done),
  };
}

function normalizeExerciseRows(value: unknown): Record<string, SetLog[]> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, SetLog[]>>((merged, [exerciseId, rows]) => {
    if (Array.isArray(rows)) {
      merged[exerciseId] = rows.map((row) => normalizeSetLogShape(row as Partial<SetLog> | undefined));
    }
    return merged;
  }, {});
}

function normalizeReadiness(value: unknown): ReadinessLog {
  if (!isRecord(value)) return {};

  return {
    energy:
      value.energy === "low" || value.energy === "normal" || value.energy === "great"
        ? value.energy
        : undefined,
    soreness:
      value.soreness === "none" || value.soreness === "mild" || value.soreness === "high"
        ? value.soreness
        : undefined,
    jointPain:
      value.jointPain === "none" || value.jointPain === "mild" || value.jointPain === "concerning"
        ? value.jointPain
        : undefined,
    sleep:
      value.sleep === "poor" || value.sleep === "okay" || value.sleep === "good"
        ? value.sleep
        : undefined,
  };
}

function normalizeSettings(value: unknown): UserSettings {
  const base = createEmptySettings();
  if (!isRecord(value)) return base;

  return {
    calorieMode: isCalorieMode(value.calorieMode) ? value.calorieMode : base.calorieMode,
  };
}

// Normalizers act like small migrations. They protect the UI when localStorage or Supabase contains
// older data from before diet tracking, kg weigh-ins, skips, or swaps existed.
function normalizeDayLog(log: DayLog | undefined): DayLog {
  return {
    ...createEmptyDay(),
    ...log,
    completed: !isSkipReason(log?.daySkipReason) && Boolean(log?.completed),
    daySkipReason: isSkipReason(log?.daySkipReason) ? log.daySkipReason : undefined,
    warmup: log?.warmup ?? {},
    tasks: log?.tasks ?? {},
    exercises: normalizeExerciseRows(log?.exercises),
    skips: normalizeSkips(log?.skips),
    swaps: log?.swaps ?? {},
    readiness: normalizeReadiness(log?.readiness),
    monthlyRecovery: isMonthlyRecovery(log?.monthlyRecovery) ? log.monthlyRecovery : undefined,
    notes: log?.notes ?? "",
  };
}

function normalizeMetricLogShape(metric: Partial<MetricLog> | undefined): MetricLog {
  return {
    weight: typeof metric?.weight === "string" ? metric.weight : "",
    weightKg: typeof metric?.weightKg === "string" ? metric.weightKg : "",
    photoReminderDone: Boolean(metric?.photoReminderDone),
    note: typeof metric?.note === "string" ? metric.note : "",
  };
}

function normalizeDietMeals(value: unknown): Record<DietMealSlot, boolean> {
  const base = createEmptyDietDay().meals;
  if (!isRecord(value)) return base;

  return dietMealSlots.reduce<Record<DietMealSlot, boolean>>((merged, slot) => {
    merged[slot.id] = Boolean(value[slot.id]);
    return merged;
  }, base);
}

function normalizeDietSwaps(value: unknown): Partial<Record<DietMealSlot, string>> {
  if (!isRecord(value)) return {};

  return dietMealSlots.reduce<Partial<Record<DietMealSlot, string>>>((merged, slot) => {
    const recipeId = value[slot.id];
    if (typeof recipeId === "string") merged[slot.id] = recipeId;
    return merged;
  }, {});
}

function normalizeDietDayLog(log: DietDayLog | undefined): DietDayLog {
  return {
    completed: Boolean(log?.completed),
    meals: normalizeDietMeals(log?.meals),
    swaps: normalizeDietSwaps(log?.swaps),
    notes: log?.notes ?? "",
  };
}

function isSkipReason(value: unknown): value is SkipReason {
  return skipReasonOptions.some((reason) => reason.id === value);
}

function normalizeSkips(value: unknown): Record<string, SkipReason> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, SkipReason>>((merged, [exerciseId, reason]) => {
    if (isSkipReason(reason)) merged[exerciseId] = reason;
    return merged;
  }, {});
}

function skipReasonLabel(reason: SkipReason) {
  return skipReasonOptions.find((option) => option.id === reason)?.label ?? "Other";
}

// Exercise library data powers every workout surface: Today, Gym Mode, detail sheets, library
// search, swaps, YouTube embeds, optional GIF demos, and progress calculations.
const exerciseMap: Record<string, Exercise> = {
  "warmup-treadmill-walk": {
    id: "warmup-treadmill-walk",
    name: "Treadmill Easy Walk",
    shortName: "Easy walk",
    family: "warmup",
    equipment: "Treadmill",
    trainingLocation: "downstairs",
    locationNote: "Do this on the downstairs treadmill so you finish warm and can start the equipment ramp sets right away.",
    target: "General warm-up",
    reps: "10 min easy",
    rest: "None",
    cues: [
      "Start at an easy pace that raises body temperature without making you breathe hard.",
      "Keep posture tall, arms relaxed, and steps quiet.",
      "Step off feeling warmer and more awake, not tired.",
    ],
    avoid: [
      "Do not turn the warm-up into cardio training.",
      "Do not hold the treadmill rails unless you need balance.",
    ],
    progression: "Build from 10 minutes toward 12-15 minutes as fitness improves, but keep it easy enough that the lifting still feels sharp.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "reference",
    },
    logType: "done",
    loadLabel: "easy pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "treadmill-walk": {
    id: "treadmill-walk",
    name: "Treadmill Brisk Walk",
    shortName: "Treadmill",
    family: "cardio",
    equipment: "Treadmill or outdoor route",
    trainingLocation: "downstairs-outside",
    locationNote: "Use the downstairs treadmill or an outdoor route; keep the effort at the planned talk-test pace.",
    target: "Moderate cardio",
    reps: "Talk test pace",
    rest: "As needed",
    cues: [
      "Start easy, then settle into a pace where breathing is elevated but controlled.",
      "Use speed first, then add incline only if your joints feel good.",
      "Keep shoulders relaxed, ribs stacked, and steps quiet.",
    ],
    avoid: [
      "Do not turn every walk into a max-effort test.",
      "Do not hold the treadmill rails unless you need balance.",
    ],
    progression: "Add 5 minutes per week or a small incline before chasing speed.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "exact",
    },
    logType: "done",
    loadLabel: "pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "cardio-cooldown-walk": {
    id: "cardio-cooldown-walk",
    name: "Treadmill Cool-Down Walk",
    shortName: "Cool-down",
    family: "cardio",
    equipment: "Treadmill or outdoor route",
    trainingLocation: "downstairs-outside",
    locationNote: "Cool down downstairs on the treadmill, or outside if the whole cardio session was outdoors.",
    target: "Cool-down",
    reps: "5 min easy",
    rest: "Done after cardio",
    cues: [
      "Reduce speed and incline until breathing settles.",
      "Keep walking until your heart rate feels clearly lower.",
      "Finish with relaxed shoulders and normal breathing.",
    ],
    avoid: [
      "Do not stop abruptly after a brisk walk unless you need to.",
      "Do not use the cool-down as extra hard cardio.",
    ],
    progression: "Keep this easy; the goal is recovery between sessions.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "reference",
    },
    logType: "done",
    loadLabel: "easy pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "long-cardio-walk": {
    id: "long-cardio-walk",
    name: "Long Brisk Walk",
    shortName: "Long walk",
    family: "cardio",
    equipment: "Treadmill or outdoor route",
    trainingLocation: "downstairs-outside",
    locationNote: "Use the downstairs treadmill or an outdoor route. This is not an upstairs-in-the-unit item unless you have enough walking space.",
    target: "Long moderate cardio",
    reps: "45-60 min",
    rest: "As needed",
    cues: [
      "Use the talk test: you can talk in short sentences, but you cannot sing.",
      "Keep the pace purposeful and sustainable for the whole session.",
      "Use incline only if joints feel good and your stride stays smooth.",
    ],
    avoid: [
      "Do not turn the long walk into intervals.",
      "Do not chase incline if it changes your posture or bothers your knees.",
    ],
    progression: "Build duration first, then add a small incline if recovery is good.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "exact",
    },
    logType: "done",
    loadLabel: "pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "seated-knee-extension-warmup": {
    id: "seated-knee-extension-warmup",
    name: "Seated Knee Extension Warm-Up",
    shortName: "Knee extension",
    family: "warmup",
    equipment: "Chair or bench",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs before you go down. It warms the quads without asking you to squat or sit into a deep knee bend.",
    target: "Quadriceps activation without deep knee bend",
    reps: "8-12 each side",
    rest: "Easy",
    cues: [
      "Sit tall near the front of a chair or bench with both feet flat.",
      "Straighten one knee slowly until the thigh feels lightly active, then hold for one calm count.",
      "Lower with control, switch sides, and keep the range pain-free instead of forcing the knee fully locked.",
    ],
    avoid: [
      "Do not kick or swing the lower leg.",
      "Do not force a locked knee if the front of the knee or hip pinches.",
      "Do not treat this as a heavy leg-extension set; it is joint-friendly prep.",
    ],
    progression: "Add reps and a longer top hold only when the motion feels smooth and pain-free.",
    motionDemo: {
      workoutXId: "0585",
      label: "Leg extension pattern reference",
      match: "reference",
    },
    youtubeId: "AmpUL3sOz5g",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "CUH early knee exercises",
        url: "https://www.cuh.nhs.uk/our-services/physiotherapy-outpatients/outpatient-physio-resources/resources/knee/early-knee-exercises/",
      },
      {
        label: "NHS knee osteoarthritis exercises",
        url: "https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/leg-and-foot-problems-and-conditions/exercises-for-osteoarthritis-of-the-knee",
      },
      {
        label: "Mayo patellofemoral pain overview",
        url: "https://www.mayoclinic.org/diseases-conditions/patellofemoral-pain-syndrome/symptoms-causes/syc-20350792",
      },
    ],
  },
  "standing-supported-hip-abduction": {
    id: "standing-supported-hip-abduction",
    name: "Standing Supported Hip Abduction",
    shortName: "Hip abduction",
    family: "warmup",
    equipment: "Wall, counter, or stable post",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs if you have a stable counter or wall. It wakes up the side hip without squatting.",
    target: "Side hip and knee-control prep",
    reps: "8-12 each side",
    rest: "Easy",
    cues: [
      "Hold a stable support, stand tall, and keep the working-side toes pointing mostly forward.",
      "Move the leg out to the side from the hip, leading gently with the heel instead of twisting the foot open.",
      "Pause briefly when the side hip tightens, then lower slowly without leaning your torso.",
    ],
    avoid: [
      "Do not swing the leg or use momentum.",
      "Do not lean your upper body away to make the leg go higher.",
      "Do not force a big range if the hip or outside knee feels blocked.",
    ],
    progression: "Move from 8 to 12 clean reps, then add a two-second side hold before considering a light band.",
    motionDemo: {
      workoutXId: "1427",
      label: "Straight leg outer hip abductor reference",
      match: "reference",
    },
    youtubeId: "oKzLYBh4Ui0",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "South Tees hip abduction",
        url: "https://www.southtees.nhs.uk/resources/hip-abduction-in-standing/",
      },
      {
        label: "AAOS knee conditioning program",
        url: "https://www.orthoinfo.org/recovery/knee-conditioning-program",
      },
      {
        label: "Hip strengthening meta-analysis",
        url: "https://pubmed.ncbi.nlm.nih.gov/35988215/",
      },
    ],
  },
  "bodyweight-squat": {
    id: "bodyweight-squat",
    name: "Bodyweight Squat",
    shortName: "Squat",
    family: "warmup",
    equipment: "Bodyweight",
    trainingLocation: "upstairs",
    locationNote: "Optional only. Use this upstairs only if a squat pattern feels natural and pain-free; otherwise use the seated knee-extension and supported hip-abduction warm-ups.",
    target: "Optional squat-pattern practice",
    reps: "8-12 warm-up reps",
    rest: "Easy",
    cues: [
      "Feet about hip to shoulder width, chest tall, weight balanced across the full foot.",
      "Use only the range that feels available; a small comfortable bend is enough for practice.",
      "Let knees track in the same direction as your toes instead of forcing them into a textbook line.",
    ],
    avoid: [
      "Do not force a deep sit-down position.",
      "Do not use this if the hips or knees feel physically blocked.",
      "Do not round the low back at the bottom.",
    ],
    progression: "Keep this as optional skill practice. The main plan no longer depends on squats for lower-body progress.",
    motionDemo: {
      workoutXId: "1685",
      label: "Squat to overhead reach",
      match: "reference",
    },
    youtubeId: "UYbsgiiZgao",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM prisoner squat",
        url: "https://www.nasm.org/resource-center/exercise-library/prisoner-squat",
      },
    ],
  },
  "hip-hinge-drill": {
    id: "hip-hinge-drill",
    name: "Hip-Hinge Drill",
    shortName: "Hip hinge",
    family: "warmup",
    equipment: "Bodyweight",
    trainingLocation: "upstairs",
    locationNote: "Good to do upstairs before heading down; keep the transition short so you do not cool off before lifting.",
    target: "Hinge pattern",
    reps: "8-12 warm-up reps",
    rest: "Easy",
    cues: [
      "Soften the knees, push hips back, and keep ribs and pelvis stacked.",
      "You should feel hamstrings load without your spine rounding.",
      "Imagine closing a car door with your hips.",
    ],
    avoid: ["Squatting the drill.", "Reaching down by rounding your back."],
    progression: "Add reps first, then use a slower hinge and brief hamstring stretch in later phases.",
    motionDemo: {
      workoutXId: "0044",
      label: "Hip-hinge pattern reference",
      match: "reference",
    },
    youtubeId: "sinpFajtRPw",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "Mayo hip hinge video",
        url: "https://www.youtube.com/watch?v=sinpFajtRPw",
      },
      {
        label: "NASM dumbbell RDL",
        url: "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift",
      },
    ],
  },
  "incline-push-up": {
    id: "incline-push-up",
    name: "Incline Push-Up",
    shortName: "Incline push-up",
    family: "warmup",
    equipment: "Bench",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs if you have a stable counter, bench, or sturdy surface; otherwise do it downstairs.",
    target: "Pressing warm-up",
    reps: "6-10 warm-up reps",
    rest: "Easy",
    cues: [
      "Hands on a bench, body in one line, elbows roughly 45 degrees from your body.",
      "Lower chest toward the bench and press away smoothly.",
      "Choose a higher surface if the rep slows or your hips sag.",
    ],
    avoid: ["Sagging hips.", "Elbows flaring straight out."],
    progression: "Add reps first, then use a slightly lower bench only if shoulder position stays clean.",
    motionDemo: {
      workoutXId: "0493",
      label: "Incline push-up",
      match: "exact",
    },
    youtubeId: "0JUrOH--Kdk",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM incline push-up",
        url: "https://www.nasm.org/resource-center/exercise-library/incline-push-up",
      },
    ],
  },
  "warmup-front-plank": {
    id: "warmup-front-plank",
    name: "Warm-Up Front Plank",
    shortName: "Warm-up plank",
    family: "warmup",
    equipment: "Mat or floor",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs on a mat or floor before you go down to the gym.",
    target: "Core brace rehearsal",
    reps: "20-30 sec",
    rest: "Easy",
    cues: [
      "Elbows under shoulders, ribs down, glutes lightly squeezed.",
      "Hold only long enough to wake up your brace.",
      "Stop before your hips sag or shoulders shrug.",
    ],
    avoid: ["Holding your breath.", "Sagging hips.", "Turning it into a max plank test."],
    progression: "Build the warm-up hold gradually, but stop before it turns into fatigue.",
    motionDemo: {
      workoutXId: "0464",
      label: "Front plank reference",
      match: "reference",
    },
    youtubeId: "GgOnCjmyTfY",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "ACE plank",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/",
      },
      {
        label: "Mayo plank video",
        url: "https://www.youtube.com/watch?v=GgOnCjmyTfY",
      },
    ],
  },
  "warmup-ramp-leg-press": {
    id: "warmup-ramp-leg-press",
    name: "Warm-Up Ramp: Leg Press",
    shortName: "Leg press ramp",
    family: "warmup",
    equipment: "Leg press machine",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the leg press immediately before your working Leg Press sets.",
    target: "Specific warm-up for the first working lift",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the same seat, foot position, and pain-free range of motion planned for your Leg Press.",
      "Set 1 should feel very easy and teach the path.",
      "Set 2 should feel closer to working weight but still clearly lighter.",
    ],
    avoid: [
      "Do not count ramp sets as working sets.",
      "Do not tire out your legs before the real Leg Press work.",
      "Do not force a deeper knee bend in warm-ups than you can repeat in working sets.",
    ],
    progression: "As your working weight rises, let the ramp weights rise too, but keep both sets crisp and non-fatiguing.",
    motionDemo: {
      workoutXId: "0739",
      label: "Sled 45 degree leg press",
      match: "reference",
    },
    youtubeId: "cDGOn-yfKJA",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "ACSM progression model",
        url: "https://pubmed.ncbi.nlm.nih.gov/11828249/",
      },
    ],
  },
  "warmup-ramp-incline-db-press": {
    id: "warmup-ramp-incline-db-press",
    name: "Warm-Up Ramp: Incline Dumbbell Press",
    shortName: "Incline ramp",
    family: "warmup",
    equipment: "Incline bench and lighter dumbbells",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the bench immediately before your working Incline Dumbbell Press sets.",
    target: "Specific warm-up for the second working lift",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the same bench angle and shoulder setup planned for Incline Dumbbell Press.",
      "Set 1 should feel like rehearsal with very light dumbbells.",
      "Set 2 should move smoothly while still leaving your chest and shoulders fresh.",
    ],
    avoid: [
      "Do not turn these into hard pressing sets.",
      "Do not bounce the dumbbells or change the bench angle.",
      "Do not use warm-up weight that makes the first working set weaker.",
    ],
    progression: "Use slightly heavier ramp dumbbells only when the working sets have clearly moved up.",
    motionDemo: {
      workoutXId: "0314",
      label: "Dumbbell incline bench press",
      match: "reference",
    },
    youtubeId: "JKnpHchOWPU",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "NSCA dynamic warm-up",
        url: "https://www.nsca.com/education/articles/kinetic-select/introduction-to-dynamic-warm-up/",
      },
    ],
  },
  "warmup-ramp-goblet-squat": {
    id: "warmup-ramp-goblet-squat",
    name: "Warm-Up Ramp: Goblet Squat",
    shortName: "Goblet ramp",
    family: "warmup",
    equipment: "Bodyweight, light dumbbell, or light kettlebell",
    trainingLocation: "downstairs",
    locationNote: "Optional only. Use this downstairs only if you intentionally swap into Goblet Squat and the squat pattern feels comfortable.",
    target: "Optional squat-specific warm-up",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the same comfortable stance and depth planned for Goblet Squat.",
      "Start with bodyweight or a very light weight, then use a second light set only if the first feels natural.",
      "Treat both sets as skill practice for bracing and knee tracking, not as a required deep squat.",
    ],
    avoid: [
      "Do not force a deep squat position.",
      "Do not use this if the hips or knees feel blocked.",
      "Do not make the second warm-up set feel like a working set.",
    ],
    progression: "Use this only as a swap-specific rehearsal. The default plan uses supported lower-body work instead.",
    motionDemo: {
      workoutXId: "1760",
      label: "Dumbbell goblet squat",
      match: "reference",
    },
    youtubeId: "nfX7IFK9UNI",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "NSCA dynamic warm-up",
        url: "https://www.nsca.com/education/articles/kinetic-select/introduction-to-dynamic-warm-up/",
      },
    ],
  },
  "warmup-ramp-single-arm-row": {
    id: "warmup-ramp-single-arm-row",
    name: "Warm-Up Ramp: Single-Arm Dumbbell Row",
    shortName: "Row ramp",
    family: "warmup",
    equipment: "Bench and lighter dumbbell",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the bench right before Single-Arm Dumbbell Row.",
    target: "Specific warm-up for the second working lift",
    reps: "2 lighter sets each side",
    rest: "45-60 sec",
    cues: [
      "Use the same bench support and torso angle planned for Single-Arm Dumbbell Row.",
      "Do one light set each side, then one slightly heavier but still easy set each side.",
      "Feel the shoulder blade move before the working sets begin.",
    ],
    avoid: [
      "Do not twist your torso to lift the warm-up dumbbell.",
      "Do not shrug the shoulder toward your ear.",
      "Do not use these sets to test strength.",
    ],
    progression: "Let the ramp dumbbell rise only after the main row loads rise and the movement stays controlled.",
    motionDemo: {
      workoutXId: "0292",
      label: "Dumbbell one-arm bent-over row",
      match: "reference",
    },
    youtubeId: "k0cTJCfxa0Y",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "ACSM progression model",
        url: "https://pubmed.ncbi.nlm.nih.gov/11828249/",
      },
    ],
  },
  "treadmill-finisher": {
    id: "treadmill-finisher",
    name: "Brisk Treadmill Finisher",
    shortName: "Finisher",
    family: "cardio",
    equipment: "Treadmill",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs after lifting and before the final floor core block, so you can head upstairs afterward if you want.",
    target: "Post-lift moderate cardio",
    reps: "10 min brisk",
    rest: "After lifting",
    cues: [
      "Use a purposeful walk after the weights are done.",
      "Keep intensity moderate: breathing is elevated, but you can still talk.",
      "Choose speed first, then add incline only if it feels smooth.",
    ],
    avoid: [
      "Do not sprint after a full-body lift.",
      "Do not hold the rails to force a higher incline.",
    ],
    progression: "Start at 10 minutes, build toward 12-15 minutes in later phases, and add incline only if recovery stays good.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "exact",
    },
    logType: "done",
    loadLabel: "pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "mobility-flow": {
    id: "mobility-flow",
    name: "Light Mobility Flow",
    shortName: "Mobility",
    family: "warmup",
    equipment: "Open floor space",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs on recovery or movement days if you have enough open floor space.",
    target: "Light mobility and stretching",
    reps: "5-10 min",
    rest: "Easy",
    cues: [
      "Move slowly through hips, upper back, shoulders, and ankles.",
      "Use pain-free ranges and breathe normally.",
      "Finish feeling looser, not stretched to the limit.",
    ],
    avoid: [
      "Do not force deep stretches.",
      "Do not bounce into painful positions.",
      "Do not turn recovery work into a hard workout.",
    ],
    progression: "Add a few minutes only if it helps you feel better for the next lift.",
    motionDemo: {
      workoutXId: "1604",
      label: "World's greatest stretch",
      match: "reference",
    },
    logType: "done",
    loadLabel: "easy",
    resources: [
      {
        label: "ACE flexibility guide",
        url: "https://www.acefitness.org/resources/everyone/blog/6646/6-flexibility-exercises-for-beginners/",
      },
    ],
  },
  "leg-press": {
    id: "leg-press",
    name: "Leg Press",
    shortName: "Leg press",
    family: "legs",
    equipment: "Leg press machine",
    target: "Quadriceps, glutes, hamstrings in a supported pain-free range",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Set the seat so your hips and knees feel comfortable, with back and tailbone flat on the pad.",
      "Use the foot angle that matches your natural hip and knee line; a slight toe-out position is fine if it feels better.",
      "Lower only as far as you can control without knee or hip pinching, then press through the whole foot without locking the knees.",
    ],
    avoid: [
      "Do not force a 90-degree knee bend or deep position just because a demo shows it.",
      "Do not let knees collapse inward or twist away from the toe line.",
      "Do not let hips lift off the pad.",
    ],
    progression: "When all sets hit the top of the rep range with the same comfortable depth and no knee or hip discomfort, add the smallest available load next time.",
    motionDemo: {
      workoutXId: "0739",
      label: "Sled 45 degree leg press",
      match: "exact",
    },
    youtubeId: "cDGOn-yfKJA",
    swapIds: ["seated-leg-extension", "glute-bridge"],
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/leg-press",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/",
      },
      {
        label: "Mayo demo",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/leg-press/vid-20084684",
      },
    ],
  },
  "seated-leg-extension": {
    id: "seated-leg-extension",
    name: "Seated Leg Extension",
    shortName: "Leg extension",
    family: "legs",
    equipment: "Leg extension machine",
    target: "Quadriceps",
    reps: "10-15",
    rest: "60-75 sec",
    cues: [
      "Set the seat so your knees line up with the machine pivot and the shin pad sits just above your ankles.",
      "Keep hips and back pressed into the pad, hold the handles, and extend smoothly.",
      "Pause with quads squeezed, then lower under control without letting the stack slam.",
    ],
    avoid: [
      "Do not kick the weight up with momentum.",
      "Do not lock the knees hard at the top.",
      "Do not let hips lift or your back arch away from the pad.",
    ],
    progression: "Treat this as a quad accessory: add load only after every set reaches 15 controlled reps without knee discomfort.",
    motionDemo: {
      workoutXId: "0585",
      label: "Lever leg extension",
      match: "exact",
    },
    youtubeId: "m0FOpMEgero",
    resources: [
      {
        label: "GoodLife machine guide",
        url: "https://blog.goodlifefitness.com/video/how-to-use-the-leg-extension-and-curl-machines",
      },
      {
        label: "REP Fitness guide",
        url: "https://repfitness.com/blogs/training/leg-extensions",
      },
      {
        label: "Gym.com demo",
        url: "https://gym.com/exercises/leg-extension-machine",
      },
    ],
  },
  "glute-bridge": {
    id: "glute-bridge",
    name: "Glute Bridge",
    shortName: "Glute bridge",
    family: "hinge",
    equipment: "Mat or floor",
    trainingLocation: "either",
    locationNote: "Can be done upstairs or downstairs. If it appears after downstairs lifting, stay downstairs unless you are already finished with the gym floor.",
    target: "Glutes, hamstrings, and posterior hip without a squat",
    reps: "10-15",
    rest: "60-75 sec",
    cues: [
      "Lie on your back with knees bent, feet flat, and feet placed where your knees and hips feel comfortable.",
      "Brace lightly, squeeze the glutes, and lift until hips feel extended without arching the low back.",
      "Pause for one count, then lower with control and keep the knees tracking naturally over the feet.",
    ],
    avoid: [
      "Do not push so high that the low back arches.",
      "Do not let the knees collapse or flare into a painful position.",
      "Do not load this with weight until the bodyweight version feels smooth.",
    ],
    progression: "Add reps first, then a longer top hold. Add a light dumbbell across the hips only when bodyweight reps feel easy and pain-free.",
    motionDemo: {
      workoutXId: "3013",
      label: "Low glute bridge on floor",
      match: "exact",
    },
    youtubeId: "wPM8icPu6H8",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "WorkoutX barbell glute bridge guide",
        url: "https://workoutxapp.com/exercises/barbell-glute-bridge.html",
      },
      {
        label: "NHS knee exercises",
        url: "https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/leg-and-foot-problems-and-conditions/exercises-for-osteoarthritis-of-the-knee",
      },
      {
        label: "Mayo bridge with fitness ball demo",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/bridge-with-fitness-ball/vid-20084672",
      },
    ],
  },
  "incline-db-press": {
    id: "incline-db-press",
    name: "Incline Dumbbell Press",
    shortName: "Incline press",
    family: "push",
    equipment: "Incline bench and dumbbells",
    target: "Upper chest, shoulders, triceps",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Set bench around 30 to 45 degrees, feet planted, shoulder blades pulled down and back.",
      "Lower the dumbbells under control toward the upper chest.",
      "Press up and slightly inward without banging the dumbbells together.",
    ],
    avoid: [
      "Do not set the bench so steep that it turns into a shoulder press.",
      "Do not arch the low back to chase heavier weight.",
    ],
    progression: "Add load only after every set reaches 12 clean reps with stable shoulders.",
    motionDemo: {
      workoutXId: "0314",
      label: "Dumbbell incline bench press",
      match: "exact",
    },
    youtubeId: "JKnpHchOWPU",
    swapIds: ["machine-chest-press", "push-up"],
    resources: [
      {
        label: "NASM two-arm guide",
        url: "https://www.nasm.org/resource-center/exercise-library/two-arm-incline-dumbbell-chest-press",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/25/incline-chest-press/",
      },
    ],
  },
  "lat-pulldown": {
    id: "lat-pulldown",
    name: "Seated Lat Pulldown",
    shortName: "Lat pulldown",
    family: "pull",
    equipment: "Lat pulldown machine",
    target: "Lats, upper back, biceps",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Anchor thighs, brace torso, and begin by pulling shoulder blades down.",
      "Drive elbows toward your sides until they stop moving downward.",
      "Return with control and let the lats stretch without shrugging.",
    ],
    avoid: [
      "Do not lean far back to turn it into a row.",
      "Do not pull behind the neck.",
      "Do not yank with momentum.",
    ],
    progression: "Add load only when the bar path stays smooth and your chest stays proud.",
    motionDemo: {
      workoutXId: "2330",
      label: "Cable lat pulldown",
      match: "exact",
    },
    youtubeId: "NbHnnvHkajg",
    swapIds: ["assisted-pull-up", "seated-cable-row"],
    resources: [
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/",
      },
      {
        label: "Mayo lat pull video",
        url: "https://www.youtube.com/watch?v=NbHnnvHkajg",
      },
      {
        label: "NASM form article",
        url: "https://www.nasm.org/resource-center/blog/training/the-biomechanics-of-the-lat-pulldown-muscles-grip-and-form",
      },
    ],
  },
  "db-rdl": {
    id: "db-rdl",
    name: "Dumbbell Romanian Deadlift",
    shortName: "DB RDL",
    family: "hinge",
    equipment: "Dumbbells",
    target: "Hamstrings, glutes, posterior chain",
    reps: "8-12",
    rest: "90-120 sec",
    cues: [
      "Soft knees, long spine, shoulders down, dumbbells close to your legs.",
      "Push hips back until hamstrings feel stretched.",
      "Stand by driving hips forward, not by leaning backward.",
    ],
    avoid: [
      "Do not turn it into a squat.",
      "Do not chase the floor if your back rounds.",
      "Do not let dumbbells drift away from your legs.",
    ],
    progression: "When 12s are crisp at the same depth, move up one dumbbell size.",
    motionDemo: {
      workoutXId: "1459",
      label: "Dumbbell Romanian deadlift",
      match: "exact",
    },
    youtubeId: "V8Hdl1FiNt4",
    swapIds: ["barbell-rdl"],
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/",
      },
    ],
  },
  "seated-leg-curl": {
    id: "seated-leg-curl",
    name: "Seated Leg Curl Machine",
    shortName: "Seated leg curl",
    family: "hinge",
    equipment: "Seated leg curl machine",
    target: "Hamstrings, calves",
    reps: "10-15",
    rest: "60-75 sec",
    cues: [
      "Adjust the seat so your knees line up with the machine pivot and the ankle pad sits just above your heels.",
      "Pin your thighs with the top pad, brace, and keep your back against the seat.",
      "Curl down by squeezing hamstrings, pause briefly, then return slowly with tension.",
    ],
    avoid: [
      "Do not lift hips or arch your lower back to finish the rep.",
      "Do not let the weight snap back on the return.",
      "Do not use a setup that pulls your knees away from the machine pivot.",
    ],
    progression: "Use controlled accessory reps. Add load only after every set reaches 15 clean reps with hips pinned and no knee irritation.",
    motionDemo: {
      workoutXId: "0599",
      label: "Lever seated leg curl",
      match: "exact",
    },
    youtubeId: "_2Kd0d-JEUM",
    resources: [
      {
        label: "NASM seated leg curl",
        url: "https://www.nasm.org/resource-center/exercise-library/seated-leg-curl",
      },
      {
        label: "NASM setup guide",
        url: "https://www.nasm.org/workout-exercise-guidance/how-to-seated-leg-curl",
      },
      {
        label: "ACE hamstrings blueprint",
        url: "https://www.acefitness.org/resources/pros/expert-articles/9015/the-hamstrings-blueprint-evidence-based-exercises-for-better-function/",
      },
    ],
  },
  "cable-crunch": {
    id: "cable-crunch",
    name: "Kneeling Cable Crunch",
    shortName: "Cable crunch",
    family: "core",
    equipment: "Cable machine and rope attachment",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the cable stack. Start light enough that the abs move the torso, not the arms or hips.",
    target: "Progressively loadable abs and obliques",
    reps: "10-15",
    rest: "45-60 sec",
    cues: [
      "Attach a rope high, kneel 1-2 feet from the stack, and keep the rope near the sides of your head.",
      "Exhale and curl ribs toward pelvis while hips stay mostly still.",
      "Return slowly to a stretch without letting the cable yank your low back into extension.",
    ],
    avoid: [
      "Do not pull the rope down with your arms.",
      "Do not turn the movement into a hip hinge.",
      "Do not chase heavy plates before you can feel the abs control every rep.",
    ],
    progression: "Use this as the loadable ab movement from Month 3 onward. Add reps first, then one small cable-stack jump when every set reaches 15 controlled reps.",
    motionDemo: {
      workoutXId: "0175",
      label: "Cable kneeling crunch",
      match: "exact",
    },
    youtubeId: "2-qTH6z6j28",
    resources: [
      {
        label: "WorkoutX cable crunch",
        url: "https://workoutxapp.com/exercises/cable-standing-crunch-with-rope-attachment.html",
      },
      {
        label: "Weight Training Guide video",
        url: "https://weighttraining.guide/exercises/kneeling-cable-crunch/",
      },
      {
        label: "NASM core programming",
        url: "https://www.nasm.org/resource-center/blog/training/best-abs-exercises",
      },
    ],
  },
  "front-plank": {
    id: "front-plank",
    name: "Front Plank",
    shortName: "Plank",
    family: "core",
    equipment: "Mat or floor",
    trainingLocation: "either",
    locationNote: "Either place is fine. If you go upstairs after lifting, keep the transition short and finish before you cool down.",
    target: "Core stability",
    reps: "20-45 sec",
    rest: "45-60 sec",
    cues: [
      "Elbows under shoulders, legs long, body in one line from head to heels.",
      "Ribs down, glutes gently squeezed, breathe behind the brace.",
      "Stop the set when hips sag or the low back takes over.",
    ],
    avoid: ["Holding your breath.", "Letting hips sag.", "Shrugging shoulders into ears."],
    progression: "Add 5 seconds only when the current hold is clean.",
    motionDemo: {
      workoutXId: "0464",
      label: "Front plank reference",
      match: "reference",
    },
    youtubeId: "mwlp75MS6Rg",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/plank",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/",
      },
      {
        label: "Mayo plank video",
        url: "https://www.youtube.com/watch?v=GgOnCjmyTfY",
      },
    ],
  },
  "dead-bug": {
    id: "dead-bug",
    name: "Dead Bug",
    shortName: "Dead bug",
    family: "core",
    equipment: "Mat or open floor",
    trainingLocation: "either",
    locationNote: "Either place is fine. Upstairs is practical if you have a mat and go there right after the lifting block.",
    target: "Dynamic abs, deep core, anti-extension control",
    reps: "8-12 each side",
    rest: "45-60 sec",
    cues: [
      "Lie on your back with arms up and hips and knees bent to 90 degrees.",
      "Exhale, bring ribs down, and keep the low back gently connected to the floor.",
      "Extend one arm and the opposite leg slowly, then return and alternate sides.",
    ],
    avoid: [
      "Do not let the low back arch away from the floor.",
      "Do not rush the reps or twist through the hips.",
      "Do not extend farther than you can control.",
    ],
    progression: "Add reps first, then slow the tempo or reach longer only while your ribs stay down.",
    motionDemo: {
      workoutXId: "0276",
      label: "Dead bug",
      match: "exact",
    },
    youtubeId: "bxn9FBrt4-A",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM dead bug",
        url: "https://www.nasm.org/resource-center/exercise-library/dead-bug",
      },
      {
        label: "NASM core programming",
        url: "https://www.nasm.org/resource-center/blog/training/best-abs-exercises",
      },
    ],
  },
  "dumbbell-biceps-curl": {
    id: "dumbbell-biceps-curl",
    name: "Dumbbell Biceps Curl",
    shortName: "DB curl",
    family: "arms",
    equipment: "Dumbbells",
    target: "Biceps, brachialis, forearms",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Stand or sit tall with dumbbells at your sides and palms facing forward.",
      "Keep elbows close to your body and curl smoothly without swinging.",
      "Lower under control until the arms are long and wrists stay straight.",
    ],
    avoid: [
      "Do not lean back or swing the dumbbells to start the rep.",
      "Do not let elbows drift far forward before the curl finishes.",
      "Do not bend the wrists to force extra range.",
    ],
    progression: "Use small load jumps only after every set reaches 15 clean reps without swinging.",
    motionDemo: {
      workoutXId: "0416",
      label: "Dumbbell standing biceps curl",
      match: "exact",
    },
    youtubeId: "2k9co4UIlEw",
    resources: [
      {
        label: "FITTR dumbbell curl video",
        url: "https://coaching.fittr.com/exercise-video/dumbbell-bicep-curls-192/",
      },
      {
        label: "ACE seated biceps curl",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/",
      },
      {
        label: "Mayo biceps curl",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675",
      },
      {
        label: "NASM arm exercise guide",
        url: "https://www.nasm.org/resource-center/blog/training/9-of-the-best-arm-sculpting-exercises-to-tone-and-strengthen",
      },
    ],
  },
  "rope-triceps-pressdown": {
    id: "rope-triceps-pressdown",
    name: "Cable Rope Triceps Pressdown",
    shortName: "Rope pressdown",
    family: "arms",
    equipment: "Cable machine and rope attachment",
    target: "Triceps",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Set the pulley high, stand tall, and pin elbows near your ribs.",
      "Press the rope down until arms are straight without leaning over the cable.",
      "Let the rope return under control until forearms rise, then repeat.",
    ],
    avoid: [
      "Do not let the elbows flare or drift forward.",
      "Do not use bodyweight to slam the rope down.",
      "Do not let the weight stack bounce between reps.",
    ],
    progression: "Add load only when elbows stay pinned and the return stays quiet for every rep.",
    motionDemo: {
      workoutXId: "0200",
      label: "Cable pushdown with rope attachment",
      match: "exact",
    },
    youtubeId: "4GHNbhQS-Zw",
    resources: [
      {
        label: "FITTR rope pressdown video",
        url: "https://www.fittr.com/exercise-video/cable-pushdown-with-rope-attachment-2/",
      },
      {
        label: "ACE tricep pressdown",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/333/tricep-pressdown/",
      },
      {
        label: "NASM arm exercise guide",
        url: "https://www.nasm.org/resource-center/blog/training/9-of-the-best-arm-sculpting-exercises-to-tone-and-strengthen",
      },
    ],
  },
  "goblet-squat": {
    id: "goblet-squat",
    name: "Goblet Squat",
    shortName: "Goblet squat",
    family: "legs",
    equipment: "Dumbbell or kettlebell",
    target: "Optional squat-pattern swap for quads, glutes, and core",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Hold one weight vertically at chest height with elbows near the ribs.",
      "Brace, use only the squat depth your hips and knees clearly allow, and keep the chest tall.",
      "Stand by driving through the floor and keeping knees tracking in the same direction as the toes.",
    ],
    avoid: [
      "Do not let the weight drift away from your chest.",
      "Do not force a deep sit-down position if your hips or knees feel blocked.",
      "Do not use this as your default lower-body move unless it feels natural and pain-free.",
    ],
    progression: "Use this only as an optional swap. Add weight after every set reaches 12 with the same comfortable depth and posture.",
    motionDemo: {
      workoutXId: "1760",
      label: "Dumbbell goblet squat",
      match: "exact",
    },
    youtubeId: "nfX7IFK9UNI",
    swapIds: ["leg-press", "seated-leg-extension", "glute-bridge"],
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/goblet-squat",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/",
      },
    ],
  },
  "single-arm-row": {
    id: "single-arm-row",
    name: "Single-Arm Dumbbell Row",
    shortName: "1-arm row",
    family: "pull",
    equipment: "Bench and dumbbell",
    target: "Lats, rhomboids, traps, rear delts",
    reps: "8-12 each side",
    rest: "75-90 sec",
    cues: [
      "Support one hand on the bench, brace, and keep hips square.",
      "Row the dumbbell toward your hip with elbow close to your side.",
      "Lower under control until the arm is long without twisting the torso.",
    ],
    avoid: [
      "Do not rotate your chest open to finish the rep.",
      "Do not shrug the working shoulder.",
      "Do not throw the weight upward.",
    ],
    progression: "Increase when both sides hit 12 reps without torso rotation.",
    motionDemo: {
      workoutXId: "0292",
      label: "Dumbbell one-arm bent-over row",
      match: "exact",
    },
    youtubeId: "k0cTJCfxa0Y",
    swapIds: ["seated-cable-row"],
    resources: [
      {
        label: "ACE single-arm row",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/",
      },
      {
        label: "PureGym row demo",
        url: "https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/",
      },
    ],
  },
  "push-up": {
    id: "push-up",
    name: "Push-Up",
    shortName: "Push-up",
    family: "push",
    equipment: "Bodyweight or bench",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs when it appears in Strength B because it sits inside the main lifting block.",
    target: "Chest, shoulders, triceps, core",
    reps: "6-15",
    rest: "60-75 sec",
    cues: [
      "Start from a rigid plank, hands slightly wider than shoulders.",
      "Lower chest toward the floor with elbows about 45 degrees from your body.",
      "Use a bench incline or knees if full reps lose shape.",
    ],
    avoid: ["Sagging hips.", "Flaring elbows straight out.", "Half reps just to add reps."],
    progression: "First earn 15 clean incline reps, then lower the surface or move to floor reps.",
    motionDemo: {
      workoutXId: "0662",
      label: "Push-up",
      match: "exact",
    },
    youtubeId: "WDIpL0pjun0",
    logType: "done",
    loadLabel: "body",
    swapIds: ["incline-db-press", "machine-chest-press"],
    resources: [
      {
        label: "NASM push-up",
        url: "https://www.nasm.org/resource-center/exercise-library/push-up",
      },
      {
        label: "ACE push-up",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/",
      },
      {
        label: "Mayo knee option",
        url: "https://www.youtube.com/watch?v=WcHtt6zT3Go",
      },
    ],
  },
  "seated-db-overhead": {
    id: "seated-db-overhead",
    name: "Seated Dumbbell Overhead Press",
    shortName: "DB shoulder press",
    family: "push",
    equipment: "Bench and dumbbells",
    target: "Shoulders, triceps, upper chest",
    reps: "8-12",
    rest: "75-90 sec",
    cues: [
      "Sit tall with back supported and feet flat.",
      "Brace abs, start dumbbells between shoulders and ears, wrists neutral.",
      "Press overhead without leaning back or turning it into an incline press.",
    ],
    avoid: [
      "Do not overarch the low back.",
      "Do not force elbows directly out to the side if shoulders complain.",
      "Do not lock out hard at the top.",
    ],
    progression: "Add load only when every rep has a stable rib cage and smooth descent.",
    motionDemo: {
      workoutXId: "0405",
      label: "Dumbbell seated shoulder press",
      match: "exact",
    },
    swapIds: ["machine-shoulder-press"],
    resources: [
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/",
      },
      {
        label: "PureGym shoulder press",
        url: "https://www.puregym.com/exercises/arms-and-shoulders/shoulder-press/seated-shoulder-press/",
      },
    ],
  },
  "incline-reverse-fly": {
    id: "incline-reverse-fly",
    name: "Incline Reverse Fly",
    shortName: "Reverse fly",
    family: "pull",
    equipment: "Incline bench and dumbbells",
    target: "Rear delts, upper back",
    reps: "12-15",
    rest: "60 sec",
    cues: [
      "Chest supported on an incline bench, arms long with a slight elbow bend.",
      "Raise dumbbells out to the sides to about shoulder height.",
      "Move with the rear shoulders and shoulder blades, not momentum.",
    ],
    avoid: [
      "Do not fling the weights behind your head.",
      "Do not shrug up.",
      "Do not use a weight that turns the set into swinging.",
    ],
    progression: "Progress slowly; clean 15s matter more than heavier dumbbells here.",
    motionDemo: {
      workoutXId: "0326",
      label: "Dumbbell incline rear lateral raise",
      match: "exact",
    },
    resources: [
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/34/incline-reverse-fly/",
      },
    ],
  },
  "barbell-rdl": {
    id: "barbell-rdl",
    name: "Barbell or Dumbbell Romanian Deadlift",
    shortName: "RDL",
    family: "hinge",
    equipment: "Barbell or dumbbells",
    target: "Hamstrings, glutes, posterior chain",
    reps: "8-10",
    rest: "90-120 sec",
    cues: [
      "Use the same hinge pattern as the dumbbell RDL.",
      "Keep the bar close to your legs and brace before every rep.",
      "If bar setup feels awkward, use dumbbells without guilt.",
    ],
    avoid: [
      "Do not pull from the floor like a conventional deadlift.",
      "Do not round the low back.",
      "Do not add load faster than your hinge skill improves.",
    ],
    progression: "Use dumbbells until the hinge is automatic; then try the bar if setup is safe.",
    motionDemo: {
      workoutXId: "0085",
      label: "Barbell Romanian deadlift",
      match: "exact",
    },
    youtubeId: "V8Hdl1FiNt4",
    swapIds: ["db-rdl"],
    resources: [
      {
        label: "NASM dumbbell RDL",
        url: "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift",
      },
      {
        label: "ACE RDL guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/",
      },
    ],
  },
  "cable-chest-fly": {
    id: "cable-chest-fly",
    name: "Standing Cable Chest Fly",
    shortName: "Cable fly",
    family: "push",
    equipment: "Cable machine",
    target: "Chest, front shoulders",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Set handles around shoulder height, step forward, and keep a slight elbow bend.",
      "Bring hands together in front of the chest and pause briefly.",
      "Return slowly until hands line up around the chest, not far behind you.",
    ],
    avoid: [
      "Do not overload and turn it into a press.",
      "Do not let shoulders roll forward.",
      "Do not stretch beyond control.",
    ],
    progression: "Add reps first; increase weight only when the arc stays smooth.",
    motionDemo: {
      workoutXId: "0227",
      label: "Cable standing fly",
      match: "exact",
    },
    youtubeId: "XY6JrX1wyxk",
    swapIds: ["pec-deck-fly"],
    resources: [
      {
        label: "NASM cable crossover",
        url: "https://www.nasm.org/resource-center/exercise-library/cable-crossover",
      },
      {
        label: "ACE standing fly",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/160/standing-chest-fly/",
      },
      {
        label: "PureGym cable fly",
        url: "https://www.puregym.com/exercises/chest/chest-fly/cable-flyes/",
      },
    ],
  },
  "machine-chest-press": {
    id: "machine-chest-press",
    name: "Machine Chest Press",
    shortName: "Machine press",
    family: "push",
    equipment: "Chest press machine",
    target: "Chest, front shoulders, triceps",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Set the seat so the handles begin around mid-chest height.",
      "Brace, keep shoulder blades lightly back, and press the handles forward smoothly.",
      "Return under control until the chest is stretched without shoulders rolling forward.",
    ],
    avoid: [
      "Do not let the handles snap back into the stack.",
      "Do not shrug or let shoulders drift toward the ears.",
      "Do not chase a longer range if the front of the shoulder complains.",
    ],
    progression: "Use this as the stable press swap. Add the smallest load jump after all sets hit the top of the range cleanly.",
    motionDemo: {
      workoutXId: "0577",
      label: "Lever chest press",
      match: "exact",
    },
    youtubeId: "lRo9zZ7EwpM",
    resources: [
      {
        label: "NASM chest press machine",
        url: "https://www.nasm.org/resource-center/exercise-library/chest-press-machine",
      },
      {
        label: "Mayo chest press",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/chest-press/vid-20084687",
      },
    ],
  },
  "assisted-pull-up": {
    id: "assisted-pull-up",
    name: "Band-Assisted Pull-Up",
    shortName: "Assisted pull-up",
    family: "pull",
    equipment: "Pull-up bar and band, or assisted pull-up machine",
    target: "Lats, upper back, biceps",
    reps: "6-10",
    rest: "90 sec",
    cues: [
      "Use enough assistance that every rep is smooth and controlled.",
      "Start from a long-arm hang, pull shoulder blades down, then drive elbows toward your ribs.",
      "Lower slowly until arms are long again without dropping into the shoulders.",
    ],
    avoid: [
      "Do not kick, swing, or shorten the bottom range.",
      "Do not use so much assistance that the set feels like cardio.",
      "Do not crane the neck to clear the bar.",
    ],
    progression: "Reduce band or machine assistance gradually while keeping clean vertical pulling mechanics.",
    motionDemo: {
      workoutXId: "0017",
      label: "Assisted pull-up",
      match: "exact",
    },
    youtubeId: "B_VkNQS5YLs",
    resources: [
      {
        label: "NASM band-assisted pull-up",
        url: "https://www.nasm.org/resource-center/exercise-library/band-assisted-pull-up",
      },
      {
        label: "Macros machine assisted pull-up",
        url: "https://macrosinc.net/exercises/back/assisted-machine-pull-up/",
      },
    ],
  },
  "seated-cable-row": {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    shortName: "Seated row",
    family: "pull",
    equipment: "Seated cable row machine",
    target: "Lats, rhomboids, traps, biceps",
    reps: "8-12",
    rest: "75-90 sec",
    cues: [
      "Sit tall with ribs down, knees softly bent, and arms long at the start.",
      "Row the handle toward the lower ribs while keeping shoulders away from ears.",
      "Return with control until the back stretches without rounding forward.",
    ],
    avoid: [
      "Do not lean back and turn each rep into a body swing.",
      "Do not shrug before the handle moves.",
      "Do not let the cable pull you into a rounded spine.",
    ],
    progression: "Add load only when the torso stays still and every rep finishes with elbows moving behind the body.",
    motionDemo: {
      workoutXId: "0861",
      label: "Cable seated row",
      match: "exact",
    },
    youtubeId: "k0cTJCfxa0Y",
    resources: [
      {
        label: "NASM seated machine row",
        url: "https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip",
      },
      {
        label: "PureGym seated row machine",
        url: "https://www.puregym.com/lets-get-started/workout-builder/equipment-how-tos/",
      },
    ],
  },
  "machine-shoulder-press": {
    id: "machine-shoulder-press",
    name: "Machine Shoulder Press",
    shortName: "Machine shoulder",
    family: "push",
    equipment: "Shoulder press machine",
    target: "Shoulders, triceps, upper chest",
    reps: "8-12",
    rest: "75-90 sec",
    cues: [
      "Set the seat so handles begin around shoulder or ear height.",
      "Keep ribs down and press up through a comfortable shoulder path.",
      "Lower slowly until the handles return to the start without bouncing the stack.",
    ],
    avoid: [
      "Do not arch the low back to finish reps.",
      "Do not force elbows directly out to the sides if shoulders feel pinched.",
      "Do not lock out hard or lose control at the bottom.",
    ],
    progression: "Use this as the stable vertical press swap. Add load after the same smooth path is repeatable for every set.",
    motionDemo: {
      workoutXId: "0603",
      label: "Lever shoulder press",
      match: "exact",
    },
    youtubeId: "jUB9xk16y5M",
    resources: [
      {
        label: "Muscle & Strength machine shoulder press",
        url: "https://www.muscleandstrength.com/exercises/machine-shoulder-press",
      },
      {
        label: "PureGym shoulder press machine",
        url: "https://www.puregym.com/lets-get-started/workout-builder/equipment-how-tos/",
      },
    ],
  },
  "pec-deck-fly": {
    id: "pec-deck-fly",
    name: "Pec Deck Fly",
    shortName: "Pec deck",
    family: "push",
    equipment: "Pec deck or chest fly machine",
    target: "Chest, front shoulders",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Set the seat so elbows and hands move around chest height.",
      "Keep chest tall and bring the pads or handles together without turning it into a press.",
      "Open slowly until the chest stretches while shoulders stay controlled.",
    ],
    avoid: [
      "Do not let shoulders roll forward at the finish.",
      "Do not overload and shorten the arc.",
      "Do not bounce out of the stretched position.",
    ],
    progression: "Add reps first; increase load only when the fly arc stays smooth and chest-led.",
    motionDemo: {
      workoutXId: "0596",
      label: "Lever seated fly",
      match: "exact",
    },
    youtubeId: "Lw6A9NCwReU",
    resources: [
      {
        label: "FITTR pec deck fly",
        url: "https://www.fittr.com/exercise-video/lever-pec-deck-fly-13/",
      },
      {
        label: "Live Lean pec deck fly",
        url: "https://www.liveleantv.com/how-to-do-a-pec-deck-fly/",
      },
    ],
  },
};

// Diet recipes are the nutrition equivalent of the exercise library: each recipe needs a slot,
// portioned ingredients, a photo, and plate guidance so the daily plan can rotate variety while
// still staying aligned with fat-loss targets.
const dietRecipes: DietRecipe[] = [
  {
    id: "oats-yogurt-berries",
    slot: "breakfast",
    title: "Oats, Greek Yogurt, Berries",
    shortTitle: "Oats + yogurt",
    photo: foodPhoto("photo-1511690743698-d9d85f2fbf38"),
    calories: "~470 kcal",
    protein: "~39 g",
    tags: ["fruit", "oats", "whole grain", "lifting friendly"],
    ingredients: ["200 g Greek yogurt", "50 g oats", "15 g whey", "100 g berries", "10 g chia (optional; skip to save calories)"],
    prep: ["Mix yogurt, oats, whey, berries, and optional chia.", "Add water for texture and refrigerate overnight if you want."],
    plate: ["One bowl", "Use the full yogurt/oat mix", "Berries on top"],
  },
  {
    id: "egg-wrap-orange",
    slot: "breakfast",
    title: "Egg Wrap With Orange",
    shortTitle: "Egg wrap",
    photo: foodPhoto("photo-1525351484163-7529414344d8"),
    calories: "~430-500 kcal",
    protein: "~36 g",
    tags: ["fruit", "whole grain", "hot meal"],
    ingredients: ["2 eggs", "150 g egg whites", "1 whole-wheat wrap", "100-150 g peppers or spinach", "Salsa (optional; choose a low-sugar salsa)", "1 orange"],
    prep: ["Cook vegetables first, then add egg whites and eggs.", "Wrap with optional salsa and eat the orange on the side."],
    plate: ["One filled wrap", "One orange", "Keep added oil measured or use spray"],
  },
  {
    id: "cottage-bowl-kiwi",
    slot: "breakfast",
    title: "Cottage Cheese Oat Bowl",
    shortTitle: "Cottage bowl",
    photo: foodPhoto("photo-1494597564530-871f2b93ac55"),
    calories: "~460 kcal",
    protein: "~36 g",
    tags: ["fruit", "oats", "no cook"],
    ingredients: ["250 g cottage cheese", "40 g oats", "1 apple or kiwi", "Cinnamon (optional)"],
    prep: ["Add cottage cheese to a bowl.", "Stir in oats, fruit, and optional cinnamon."],
    plate: ["One bowl", "Use one fruit serving", "No extra nuts unless planned"],
  },
  {
    id: "yogurt-muesli-pear",
    slot: "breakfast",
    title: "Greek Yogurt Muesli Bowl",
    shortTitle: "Yogurt muesli",
    photo: foodPhoto("photo-1488477181946-6428a0291777"),
    calories: "~430 kcal",
    protein: "~36-38 g",
    tags: ["fruit", "whole grain", "no cook"],
    ingredients: ["300 g Greek yogurt", "45 g unsweetened whole-grain muesli", "1 kiwi or pear"],
    prep: ["Spoon yogurt into a bowl.", "Add muesli and sliced fruit."],
    plate: ["One bowl", "Check muesli added sugar", "Keep fruit to one serving"],
  },
  {
    id: "yogurt-oat-pear",
    slot: "breakfast",
    title: "Greek Yogurt Oat Pear Bowl",
    shortTitle: "Yogurt oat pear",
    photo: foodPhoto("photo-1488477181946-6428a0291777"),
    calories: "~430 kcal",
    protein: "~37-40 g",
    tags: ["fruit", "oats", "no cook", "easy groceries"],
    ingredients: ["300 g Greek yogurt", "45 g oats", "1 kiwi or pear", "Cinnamon (optional)"],
    prep: ["Spoon yogurt into a bowl.", "Stir in oats, then add sliced fruit and optional cinnamon."],
    plate: ["One bowl", "45 g oats", "One fruit serving"],
  },
  {
    id: "egg-potato-citrus",
    slot: "breakfast",
    title: "Egg and Potato Plate",
    shortTitle: "Egg + potato",
    photo: foodPhoto("photo-1533089860892-a7c6f0a88666"),
    calories: "~445 kcal",
    protein: "~37 g",
    tags: ["fruit", "potato", "hot meal"],
    ingredients: ["2 eggs", "180 g egg whites", "200 g potato", "150 g tomatoes or mushrooms", "1 citrus fruit"],
    prep: ["Cook potato ahead or microwave it.", "Cook vegetables, add whites and eggs, then plate with fruit."],
    plate: ["Eggs and whites", "200 g potato", "Moderate vegetables"],
  },
  {
    id: "yogurt-bowl-kiwi",
    slot: "breakfast",
    title: "Yogurt Bowl With Kiwi",
    shortTitle: "Yogurt bowl",
    photo: foodPhoto("photo-1490474418585-ba9bad8fd0ea"),
    calories: "~390 kcal",
    protein: "~39 g",
    tags: ["fruit", "oats", "recovery friendly"],
    ingredients: ["250 g Greek yogurt", "40 g oats", "10 g whey", "100 g berries or 1 kiwi"],
    prep: ["Mix yogurt, oats, and whey.", "Top with berries or sliced kiwi."],
    plate: ["One bowl", "Keep oats at 40 g on recovery days", "Use one fruit serving"],
  },
  {
    id: "chicken-rice-bowl",
    slot: "lunch",
    title: "Chicken Rice Bowl",
    shortTitle: "Chicken rice",
    photo: foodPhoto("photo-1546069901-ba9599a7e63c"),
    calories: "~500-600 kcal",
    protein: "~37-40 g",
    tags: ["lean protein", "rice", "vegetables", "lifting friendly"],
    ingredients: ["100 g cooked chicken", "150-180 g cooked rice", "180-220 g mixed vegetables", "5-10 g olive oil (optional; use spray to save calories)", "Salsa (optional; choose a low-sugar salsa)"],
    prep: ["Warm chicken, rice, and vegetables.", "Add optional salsa and use measured olive oil only if planned."],
    plate: ["100 g chicken", "150-180 g cooked rice", "About 200 g vegetables"],
  },
  {
    id: "chicken-quinoa-veg-bowl",
    slot: "lunch",
    title: "Chicken Quinoa Veg Bowl",
    shortTitle: "Chicken quinoa",
    photo: foodPhoto("photo-1546069901-ba9599a7e63c"),
    calories: "~520 kcal",
    protein: "~40-43 g",
    tags: ["lean protein", "whole grain", "vegetables", "easy groceries"],
    ingredients: ["115 g cooked chicken", "140 g cooked quinoa", "200 g vegetables", "Yogurt sauce (optional; keep it light)"],
    prep: ["Warm chicken, quinoa, and vegetables.", "Finish with optional light yogurt sauce."],
    plate: ["115 g chicken", "140 g quinoa", "200 g vegetables"],
  },
  {
    id: "tuna-quinoa-cucumber-bowl",
    slot: "lunch",
    title: "Tuna Quinoa Cucumber Bowl",
    shortTitle: "Tuna quinoa",
    photo: foodPhoto("photo-1547496502-affa22d38842"),
    calories: "~490 kcal",
    protein: "~39-42 g",
    tags: ["lean protein", "whole grain", "no cook", "vegetables"],
    ingredients: ["100 g light tuna", "150 g cooked quinoa", "200 g cucumber and salad vegetables", "5 g olive oil (optional; use lemon or vinegar to save calories)"],
    prep: ["Drain tuna and add it to a bowl.", "Toss with quinoa, cucumber, salad vegetables, and optional measured oil."],
    plate: ["100 g tuna", "150 g quinoa", "200 g vegetables"],
  },
  {
    id: "lean-beef-rice-bowl",
    slot: "lunch",
    title: "Lean Beef Rice Bowl",
    shortTitle: "Beef rice",
    photo: foodPhoto("photo-1559847844-5315695dadae"),
    calories: "~520-570 kcal",
    protein: "~39-44 g",
    tags: ["lean protein", "rice", "vegetables", "meal prep", "lifting friendly"],
    ingredients: ["120 g cooked extra-lean beef", "150 g cooked rice", "220 g mixed vegetables", "Salsa or crushed tomatoes (optional; choose low-sugar)", "5 g olive oil (optional; use spray to save calories)"],
    prep: ["Cook extra-lean beef and drain visible fat.", "Serve with measured rice, vegetables, and optional salsa or crushed tomatoes."],
    plate: ["120 g beef", "150 g rice", "220 g vegetables", "0-5 g oil"],
  },
  {
    id: "turkey-lentil-rice",
    slot: "lunch",
    title: "Turkey Lentil Rice Bowl",
    shortTitle: "Turkey lentil",
    photo: foodPhoto("photo-1512621776951-a57141f2eefd"),
    calories: "~560 kcal",
    protein: "~39-41 g",
    tags: ["legumes", "rice", "vegetables"],
    ingredients: ["90 g cooked extra-lean turkey", "120 g cooked lentils", "120 g cooked rice", "180 g peppers and tomatoes", "Yogurt sauce (optional; keep it light)"],
    prep: ["Warm turkey, lentils, rice, and vegetables.", "Finish with optional light yogurt sauce."],
    plate: ["90 g turkey", "120 g lentils", "120 g rice", "180 g vegetables"],
  },
  {
    id: "tuna-chickpea-quinoa",
    slot: "lunch",
    title: "Tuna Chickpea Quinoa Bowl",
    shortTitle: "Tuna chickpea",
    photo: foodPhoto("photo-1547496502-affa22d38842"),
    calories: "~500 kcal",
    protein: "~38-40 g",
    tags: ["legumes", "whole grain", "no cook", "vegetables"],
    ingredients: ["80-90 g light tuna", "100 g chickpeas", "120 g cooked quinoa", "180 g salad vegetables"],
    prep: ["Rinse chickpeas and drain tuna.", "Toss with quinoa and salad vegetables."],
    plate: ["One large bowl", "100 g chickpeas", "180 g vegetables"],
  },
  {
    id: "tofu-edamame-stir-fry",
    slot: "lunch",
    title: "Tofu Edamame Stir-Fry",
    shortTitle: "Tofu edamame",
    photo: foodPhoto("photo-1512058564366-18510be2db19"),
    calories: "~600 kcal",
    protein: "~35-40 g",
    tags: ["plant protein", "legumes", "brown rice", "vegetables"],
    ingredients: ["180 g firm tofu", "100 g shelled edamame", "120 g cooked brown rice", "200 g mixed vegetables"],
    prep: ["Pan-cook tofu and vegetables.", "Add edamame and serve over brown rice."],
    plate: ["180 g tofu", "100 g edamame", "120 g rice", "200 g vegetables"],
  },
  {
    id: "beef-whole-grain-pasta",
    slot: "dinner",
    title: "Beef Whole-Grain Pasta",
    shortTitle: "Beef pasta",
    photo: foodPhoto("photo-1551183053-bf91a1d81141"),
    calories: "~560 kcal",
    protein: "~38-40 g",
    tags: ["whole grain", "red meat", "vegetables"],
    ingredients: ["100 g extra-lean beef", "150 g cooked whole-grain pasta", "100 g marinara (optional; use crushed tomatoes to save calories)", "180 g mushrooms or zucchini"],
    prep: ["Cook beef, vegetables, and optional marinara or crushed tomatoes together.", "Serve over measured pasta."],
    plate: ["100 g beef", "150 g cooked pasta", "180 g vegetables"],
  },
  {
    id: "lean-beef-potato-plate",
    slot: "dinner",
    title: "Lean Beef Potato Plate",
    shortTitle: "Beef potato",
    photo: foodPhoto("photo-1544025162-d76694265947"),
    calories: "~540-600 kcal",
    protein: "~40-45 g",
    tags: ["lean protein", "potato", "vegetables", "post-workout", "easy groceries"],
    ingredients: ["120 g cooked extra-lean beef", "300 g potato", "220 g vegetables", "Salsa or crushed tomatoes (optional; choose low-sugar)", "5 g olive oil (optional; use spray to save calories)"],
    prep: ["Cook extra-lean beef and drain visible fat.", "Plate with potatoes, vegetables, and optional salsa or crushed tomatoes."],
    plate: ["120 g beef", "300 g potato", "220 g vegetables", "0-5 g oil"],
  },
  {
    id: "egg-lentil-quinoa",
    slot: "lunch",
    title: "Egg Lentil Quinoa Bowl",
    shortTitle: "Egg lentil",
    photo: foodPhoto("photo-1511690656952-34342bb7c2f2"),
    calories: "~565 kcal",
    protein: "~38 g",
    tags: ["legumes", "whole grain", "vegetables"],
    ingredients: ["2 eggs", "150 g cooked lentils", "100 g cooked quinoa", "200 g vegetables", "30 g feta (optional; skip to save calories)"],
    prep: ["Warm lentils, quinoa, and vegetables.", "Top with eggs and optional measured feta."],
    plate: ["2 eggs", "150 g lentils", "100 g quinoa", "200 g vegetables"],
  },
  {
    id: "egg-quinoa-veg-bowl",
    slot: "lunch",
    title: "Egg Quinoa Veg Bowl",
    shortTitle: "Egg quinoa",
    photo: foodPhoto("photo-1511690656952-34342bb7c2f2"),
    calories: "~520 kcal",
    protein: "~38-41 g",
    tags: ["eggs", "whole grain", "vegetables", "easy groceries"],
    ingredients: ["2 eggs", "200 g egg whites", "130 g cooked quinoa", "200 g vegetables", "30 g feta (optional; skip to save calories)"],
    prep: ["Warm quinoa and vegetables.", "Cook eggs and egg whites, then plate with optional measured feta."],
    plate: ["2 eggs plus whites", "130 g quinoa", "200 g vegetables"],
  },
  {
    id: "turkey-bean-chili-lunch",
    slot: "lunch",
    title: "Turkey Bean Chili Bowl",
    shortTitle: "Turkey chili",
    photo: foodPhoto("photo-1528712306091-ed0763094c98"),
    calories: "~560 kcal",
    protein: "~39-42 g",
    tags: ["legumes", "rice", "vegetables"],
    ingredients: ["90 g cooked extra-lean turkey", "140 g kidney or black beans", "180 g tomatoes and peppers", "100 g cooked rice"],
    prep: ["Simmer turkey, beans, tomatoes, and peppers.", "Serve with measured rice."],
    plate: ["90 g turkey", "140 g beans", "100 g rice", "180 g vegetables"],
  },
  {
    id: "chicken-tomato-rice-bowl",
    slot: "lunch",
    title: "Chicken Tomato Rice Bowl",
    shortTitle: "Chicken tomato rice",
    photo: foodPhoto("photo-1512621776951-a57141f2eefd"),
    calories: "~540 kcal",
    protein: "~40-43 g",
    tags: ["lean protein", "rice", "vegetables", "meal prep"],
    ingredients: ["120 g cooked chicken", "150 g cooked rice", "200 g tomatoes and peppers", "Salsa (optional; choose a low-sugar salsa)"],
    prep: ["Warm chicken, rice, tomatoes, and peppers.", "Add optional salsa for flavor."],
    plate: ["120 g chicken", "150 g rice", "200 g vegetables"],
  },
  {
    id: "cottage-banana",
    slot: "snack",
    title: "Cottage Cheese and Banana",
    shortTitle: "Cottage banana",
    photo: foodPhoto("photo-1505253716362-afaea1d3d1af"),
    calories: "~330 kcal",
    protein: "~31 g",
    tags: ["fruit", "lifting carb", "pre-workout"],
    ingredients: ["250 g cottage cheese", "1 medium banana"],
    prep: ["Add cottage cheese to a bowl.", "Slice banana on top or eat it beside the bowl."],
    plate: ["250 g cottage cheese", "1 banana", "No extra toppings unless planned"],
  },
  {
    id: "yogurt-rice-cakes",
    slot: "snack",
    title: "Greek Yogurt, Rice Cakes, Jam",
    shortTitle: "Yogurt cakes",
    photo: foodPhoto("photo-1505576399279-565b52d4ac71"),
    calories: "~315 kcal",
    protein: "~27 g",
    tags: ["low fibre", "lifting carb", "pre-workout"],
    ingredients: ["250 g Greek yogurt", "2 rice cakes", "15 g jam (optional; skip to save calories)"],
    prep: ["Spoon yogurt into a bowl.", "Add optional jam to rice cakes and eat together."],
    plate: ["250 g yogurt", "2 rice cakes", "15 g jam only if planned"],
  },
  {
    id: "after-work-yogurt-banana-toast",
    slot: "snack",
    title: "After-Work Yogurt Banana Toast",
    shortTitle: "Yogurt banana toast",
    photo: foodPhoto("photo-1494597564530-871f2b93ac55"),
    calories: "~380-430 kcal",
    protein: "~31-35 g",
    tags: ["fruit", "lifting carb", "pre-workout", "easy groceries"],
    ingredients: ["250 g Greek yogurt", "1 banana", "1 slice whole-grain bread", "10 g jam (optional; skip to save calories)"],
    prep: ["Eat yogurt with the banana.", "Toast the bread and add optional measured jam if you need extra quick carbs."],
    plate: ["250 g yogurt", "1 banana", "1 slice toast", "10 g jam only if planned"],
  },
  {
    id: "yogurt-oats-bowl",
    slot: "snack",
    title: "Greek Yogurt Oats Bowl",
    shortTitle: "Yogurt oats",
    photo: foodPhoto("photo-1488477304112-4944851de03d"),
    calories: "~410 kcal",
    protein: "~39 g",
    tags: ["fruit", "oats", "filling"],
    ingredients: ["250 g Greek yogurt", "40 g oats", "100 g berries", "10 g whey"],
    prep: ["Mix yogurt, oats, berries, and whey.", "Let it sit if you want softer oats."],
    plate: ["One bowl", "40 g oats", "100 g berries"],
  },
  {
    id: "turkey-sandwich-fruit",
    slot: "snack",
    title: "Turkey Sandwich and Fruit",
    shortTitle: "Turkey sandwich",
    photo: foodPhoto("photo-1528735602780-2552fd46c7af"),
    calories: "~420 kcal",
    protein: "~35-39 g",
    tags: ["fruit", "whole grain", "portable", "lifting carb"],
    ingredients: ["100 g turkey slices", "2 slices whole-grain bread", "Mustard (optional)", "1 orange or apple"],
    prep: ["Build sandwich with turkey and optional mustard.", "Eat fruit on the side."],
    plate: ["One sandwich", "100 g turkey", "One fruit serving"],
  },
  {
    id: "chicken-sandwich-fruit",
    slot: "snack",
    title: "Chicken Sandwich and Fruit",
    shortTitle: "Chicken sandwich",
    photo: foodPhoto("photo-1528735602780-2552fd46c7af"),
    calories: "~420 kcal",
    protein: "~36-40 g",
    tags: ["fruit", "whole grain", "portable", "lifting carb"],
    ingredients: ["100 g cooked chicken", "2 slices whole-grain bread", "Mustard (optional)", "1 orange or apple"],
    prep: ["Build sandwich with chicken and optional mustard.", "Eat fruit on the side."],
    plate: ["One sandwich", "100 g chicken", "One fruit serving"],
  },
  {
    id: "savoury-tuna-plate",
    slot: "snack",
    title: "Savoury Tuna Plate",
    shortTitle: "Tuna plate",
    photo: foodPhoto("photo-1512621776951-a57141f2eefd"),
    calories: "~390 kcal",
    protein: "~36-39 g",
    tags: ["legumes", "portable", "recovery friendly"],
    ingredients: ["100 g light tuna", "60 g hummus (optional; use 30 g to save calories)", "Whole-grain crackers (optional; skip to save calories)", "Cucumber"],
    prep: ["Drain tuna and plate with optional measured hummus.", "Add crackers only if planned, plus cucumber."],
    plate: ["100 g tuna", "30-60 g hummus if used", "One measured cracker serving if used"],
  },
  {
    id: "emergency-shake-meal",
    slot: "snack",
    title: "Emergency Shake Meal",
    shortTitle: "Shake meal",
    photo: foodPhoto("photo-1553530666-ba11a7da3888"),
    calories: "~420 kcal",
    protein: "~36-40 g",
    tags: ["emergency", "fruit", "lifting carb"],
    ingredients: ["30 g whey", "300 mL milk or water (use water to save calories)", "1 banana", "20 g oats"],
    prep: ["Blend whey, milk or water, banana, and oats.", "Use when solid food is impractical."],
    plate: ["One shake", "Do not add another routine shake afterward"],
  },
  {
    id: "greek-yogurt-melon",
    slot: "snack",
    title: "Greek Yogurt and Melon",
    shortTitle: "Yogurt melon",
    photo: foodPhoto("photo-1505252585461-04db1eb84625"),
    calories: "~400 kcal",
    protein: "~36 g",
    tags: ["fruit", "oats", "cardio friendly"],
    ingredients: ["300 g Greek yogurt", "30 g oats", "150 g melon or berries", "10 g nuts (optional; skip to save calories)"],
    prep: ["Add yogurt and oats to a bowl.", "Top with fruit and optional measured nuts."],
    plate: ["300 g yogurt", "30 g oats", "150 g fruit", "10 g nuts only if planned"],
  },
  {
    id: "cottage-apple",
    slot: "snack",
    title: "Cottage Cheese and Apple",
    shortTitle: "Cottage apple",
    photo: foodPhoto("photo-1568702846914-96b305d2aaeb"),
    calories: "~365 kcal",
    protein: "~36 g",
    tags: ["fruit", "no cook", "recovery friendly"],
    ingredients: ["300 g cottage cheese", "1 apple"],
    prep: ["Add cottage cheese to a bowl.", "Slice apple and add cinnamon if you want."],
    plate: ["300 g cottage cheese", "One apple"],
  },
  {
    id: "salmon-potato-dinner",
    slot: "dinner",
    title: "Salmon Potato Plate",
    shortTitle: "Salmon potato",
    photo: foodPhoto("photo-1467003909585-2f8a72700288"),
    calories: "~650 kcal",
    protein: "~41 g",
    tags: ["fatty fish", "potato", "vegetables", "post-workout"],
    ingredients: ["125-150 g cooked salmon", "250 g potato", "200 g vegetables", "40 g avocado (optional; halve or skip to save calories)"],
    prep: ["Cook salmon close to dinner.", "Plate with potato, vegetables, and optional avocado."],
    plate: ["125-150 g salmon", "250 g potato", "200 g vegetables", "0-40 g avocado"],
  },
  {
    id: "chicken-potato-apple",
    slot: "dinner",
    title: "Chicken Potato Plate With Apple",
    shortTitle: "Chicken potato",
    photo: foodPhoto("photo-1543352634-a1c51d9f1fa7"),
    calories: "~550 kcal",
    protein: "~39 g",
    tags: ["fruit", "potato", "lean protein", "vegetables"],
    ingredients: ["100 g cooked chicken", "250 g potato", "200 g vegetables", "60 g avocado (optional; halve or skip to save calories)", "1 apple"],
    prep: ["Warm chicken, potato, and vegetables.", "Add optional avocado and eat apple on the side."],
    plate: ["100 g chicken", "250 g potato", "200 g vegetables", "0-60 g avocado"],
  },
  {
    id: "chicken-sweet-potato",
    slot: "dinner",
    title: "Chicken Sweet Potato Plate",
    shortTitle: "Chicken sweet potato",
    photo: foodPhoto("photo-1504674900247-0877df9cc836"),
    calories: "~510 kcal",
    protein: "~40 g",
    tags: ["lean protein", "potato", "vegetables"],
    ingredients: ["105 g cooked chicken", "250 g sweet potato", "200 g vegetables", "5 g olive oil (optional; use spray to save calories)"],
    prep: ["Warm chicken and sweet potato.", "Add vegetables and measured olive oil only if planned."],
    plate: ["105 g chicken", "250 g sweet potato", "200 g vegetables", "5 g oil only if planned"],
  },
  {
    id: "white-fish-plate",
    slot: "dinner",
    title: "White Fish Plate",
    shortTitle: "White fish",
    photo: foodPhoto("photo-1519708227418-c8fd9a32b7a2"),
    calories: "~520 kcal",
    protein: "~40 g",
    tags: ["lean protein", "potato", "vegetables"],
    ingredients: ["150 g white fish", "250 g potato", "200 g vegetables", "10 g olive oil (optional; use spray to save calories)"],
    prep: ["Bake or pan-cook fish gently.", "Serve with potato, vegetables, and measured oil only if planned."],
    plate: ["150 g white fish", "250 g potato", "200 g vegetables"],
  },
  {
    id: "salmon-quinoa",
    slot: "dinner",
    title: "Salmon Quinoa Plate",
    shortTitle: "Salmon quinoa",
    photo: foodPhoto("photo-1467003909585-2f8a72700288"),
    calories: "~550 kcal",
    protein: "~39-41 g",
    tags: ["fatty fish", "whole grain", "vegetables"],
    ingredients: ["130 g cooked salmon", "140 g cooked quinoa", "180 g red or green vegetables"],
    prep: ["Cook salmon and vegetables.", "Serve over measured quinoa."],
    plate: ["130 g salmon", "140 g quinoa", "180 g vegetables"],
  },
  {
    id: "turkey-bean-chili",
    slot: "dinner",
    title: "Turkey Bean Chili",
    shortTitle: "Turkey chili",
    photo: foodPhoto("photo-1528712306091-ed0763094c98"),
    calories: "~560 kcal",
    protein: "~39-42 g",
    tags: ["legumes", "rice", "vegetables"],
    ingredients: ["90 g cooked extra-lean turkey", "140 g kidney or black beans", "180 g tomatoes and peppers", "100 g cooked rice"],
    prep: ["Simmer turkey, beans, tomatoes, and peppers.", "Serve with measured rice."],
    plate: ["90 g turkey", "140 g beans", "100 g rice", "180 g vegetables"],
  },
  {
    id: "egg-fried-rice",
    slot: "dinner",
    title: "Egg Fried Rice",
    shortTitle: "Egg fried rice",
    photo: foodPhoto("photo-1603133872878-684f208fb84b"),
    calories: "~560 kcal",
    protein: "~39-41 g",
    tags: ["whole grain", "vegetables", "hot meal"],
    ingredients: ["2 eggs", "180 g egg whites", "150 g cooked brown rice", "200 g peas and carrots"],
    prep: ["Cook eggs, whites, vegetables, and rice in a pan.", "Use measured oil or spray."],
    plate: ["2 eggs plus whites", "150 g brown rice", "200 g vegetables"],
  },
  {
    id: "tofu-lentil-curry",
    slot: "dinner",
    title: "Tofu Lentil Curry",
    shortTitle: "Tofu curry",
    photo: foodPhoto("photo-1585937421612-70a008356fbe"),
    calories: "~600 kcal",
    protein: "~35-40 g",
    tags: ["plant protein", "legumes", "rice", "vegetables"],
    ingredients: ["200 g firm tofu", "120 g lentils", "150 g vegetables", "100 g cooked rice", "Light curry sauce (optional; keep it light)"],
    prep: ["Warm tofu, lentils, vegetables, and optional light curry sauce.", "Serve over measured rice."],
    plate: ["200 g tofu", "120 g lentils", "100 g rice", "150 g vegetables"],
  },
];

// The recipe cards stay compact by default. These step lists are shown only when the user expands
// "Make It", which keeps the daily diet page clean while still helping a beginner cook the meal.
const recipeHowToSteps: Record<string, string[]> = {
  "oats-yogurt-berries": [
    "Add 200 g Greek yogurt to a bowl.",
    "Stir in 15 g whey until the yogurt looks smooth and there are no dry powder pockets.",
    "Add 50 g oats and mix again. If it feels too thick, stir in 1-2 tbsp cold water.",
    "Fold in 100 g berries. Add 10 g chia only if you want the higher-calorie, thicker version.",
    "Eat right away for chewy oats, or cover and refrigerate overnight for a softer bowl.",
  ],
  "egg-wrap-orange": [
    "Slice the peppers or spinach into small pieces so they cook quickly.",
    "Heat a nonstick pan on medium, add spray or a tiny measured amount of oil, then cook the vegetables for 2-3 minutes.",
    "Whisk 2 eggs with 150 g egg whites in a bowl, pour them into the pan, and stir slowly until the eggs are fully set.",
    "Warm the whole-wheat wrap for 15-20 seconds, then place the cooked eggs in the center.",
    "Add salsa if using it, fold the sides in, roll the wrap tightly, and eat the orange on the side.",
  ],
  "cottage-bowl-kiwi": [
    "Add 250 g cottage cheese to a bowl.",
    "Stir in 40 g oats until they are evenly mixed through the cottage cheese.",
    "Dice the apple or kiwi into small bite-size pieces.",
    "Add the fruit on top and sprinkle cinnamon if you want more sweetness without extra calories.",
    "Let it sit for 5 minutes if you want the oats softer, or eat it immediately.",
  ],
  "yogurt-muesli-pear": [
    "Spoon 300 g Greek yogurt into a bowl.",
    "Add 45 g unsweetened whole-grain muesli and stir until every spoonful has yogurt and grains.",
    "Slice the kiwi or pear thinly so it spreads across the whole bowl.",
    "Place the fruit on top and let the bowl sit for 3-5 minutes if you want the grains softer.",
    "Keep the fruit to one serving and skip extra toppings unless you intentionally planned them.",
  ],
  "yogurt-oat-pear": [
    "Spoon 300 g Greek yogurt into a bowl.",
    "Add 45 g oats and stir until the oats are coated in yogurt.",
    "Slice the kiwi or pear into small pieces and add it on top.",
    "Add cinnamon if you want it sweeter without adding calories.",
    "Let the bowl sit for 5 minutes for softer oats, or cover and refrigerate it overnight.",
  ],
  "egg-potato-citrus": [
    "Poke the potato with a fork and microwave it for 5-8 minutes, until a fork slides through the center.",
    "Slice tomatoes or mushrooms while the potato rests.",
    "Cook the vegetables in a nonstick pan for 2-3 minutes.",
    "Whisk 2 eggs with 180 g egg whites, add them to the pan, and cook on low-medium until fully set.",
    "Cut the potato open, plate it beside the eggs, and eat the citrus fruit on the side.",
  ],
  "yogurt-bowl-kiwi": [
    "Add 250 g Greek yogurt to a bowl.",
    "Stir in 10 g whey first so the powder disappears into the yogurt.",
    "Mix in 40 g oats.",
    "Top with 100 g berries or one sliced kiwi.",
    "Eat now for more texture, or chill it for a softer recovery-day bowl.",
  ],
  "chicken-rice-bowl": [
    "Warm 150-180 g cooked rice in a bowl or pan.",
    "Warm 100 g cooked chicken until it is hot all the way through.",
    "Heat 180-220 g mixed vegetables in the same pan, or microwave them until hot.",
    "Add the rice, chicken, and vegetables to one bowl.",
    "Add salsa if using it. Add olive oil only if you measured 5-10 g and want that version.",
  ],
  "chicken-quinoa-veg-bowl": [
    "Warm 140 g cooked quinoa until hot.",
    "Warm 115 g cooked chicken until hot all the way through.",
    "Cook or microwave 200 g vegetables until tender but not mushy.",
    "Add quinoa first, chicken second, and vegetables around the side of the bowl.",
    "Add a light yogurt sauce only if using it; keep it thin and measured.",
  ],
  "tuna-quinoa-cucumber-bowl": [
    "Drain 100 g light tuna and flake it with a fork.",
    "Add 150 g cooked quinoa to a bowl. Use it cold or warm, whichever you prefer.",
    "Chop 200 g cucumber and salad vegetables into small pieces.",
    "Mix tuna, quinoa, cucumber, and salad vegetables together.",
    "Use lemon or vinegar for the lower-calorie version; add 5 g olive oil only if you measured it.",
  ],
  "lean-beef-rice-bowl": [
    "Warm 150 g cooked rice in a bowl or pan.",
    "Cook 120 g extra-lean beef in a nonstick pan over medium heat, breaking it into small pieces as it browns.",
    "Drain or blot away visible fat if any collects in the pan.",
    "Add 220 g mixed vegetables to the pan and cook for 3-5 minutes, until hot and tender.",
    "Put rice in the bowl first, spoon beef and vegetables over it, then add salsa or crushed tomatoes if using them.",
    "Use spray for the leanest version; add 5 g olive oil only if you measured it.",
  ],
  "turkey-lentil-rice": [
    "Warm 90 g cooked extra-lean turkey in a pan.",
    "Add 120 g cooked lentils, 120 g cooked rice, and 180 g peppers and tomatoes.",
    "Stir everything together over medium heat for 3-5 minutes until hot.",
    "Add a small spoon of light yogurt sauce if using it.",
    "Serve as one bowl with turkey and lentils spread evenly through the rice.",
  ],
  "tuna-chickpea-quinoa": [
    "Drain the tuna and flake it with a fork.",
    "Rinse 100 g chickpeas, drain them well, and add them to a bowl.",
    "Add 120 g cooked quinoa and 180 g salad vegetables.",
    "Stir in the tuna until the protein is spread through the bowl.",
    "Season with lemon, vinegar, pepper, or herbs instead of adding unplanned oil.",
  ],
  "tofu-edamame-stir-fry": [
    "Drain 180 g firm tofu and cut it into cubes.",
    "Cook the tofu in a nonstick pan over medium heat until several sides are lightly golden.",
    "Add 200 g mixed vegetables and cook for 3-5 minutes.",
    "Add 100 g shelled edamame and stir until hot.",
    "Serve the tofu, edamame, and vegetables over 120 g cooked brown rice.",
  ],
  "beef-whole-grain-pasta": [
    "Cook or warm 150 g cooked whole-grain pasta and set it aside.",
    "Cook 100 g extra-lean beef in a pan over medium heat, breaking it into small pieces.",
    "Add 180 g mushrooms or zucchini and cook until softened.",
    "Stir in 100 g marinara, or use crushed tomatoes for the lower-calorie version.",
    "Spoon the beef and vegetable sauce over the measured pasta.",
  ],
  "lean-beef-potato-plate": [
    "Cook 300 g potato until soft: microwave it, boil it, or roast it without unmeasured oil.",
    "Cook 120 g extra-lean beef in a nonstick pan over medium heat, breaking it apart until no pink remains.",
    "Drain or blot visible fat from the beef before plating.",
    "Cook 220 g vegetables in the same pan or microwave them until hot.",
    "Plate potato on one side, beef on the other, and vegetables in the largest section of the plate.",
    "Add salsa or crushed tomatoes if using them. Use spray for the leanest version; add 5 g olive oil only if measured.",
  ],
  "egg-lentil-quinoa": [
    "Warm 150 g cooked lentils, 100 g cooked quinoa, and 200 g vegetables together in a pan or microwave-safe bowl.",
    "Cook 2 eggs in a nonstick pan until the whites and yolks are set.",
    "Put the lentil-quinoa vegetable mix into a bowl.",
    "Place the eggs on top.",
    "Add 30 g feta only if using the higher-calorie version.",
  ],
  "egg-quinoa-veg-bowl": [
    "Warm 130 g cooked quinoa and 200 g vegetables together.",
    "Whisk 2 eggs with 200 g egg whites.",
    "Cook the egg mixture in a nonstick pan on low-medium, stirring slowly until fully set.",
    "Add the quinoa and vegetables to a bowl, then place the eggs on top.",
    "Add 30 g feta only if you want that optional version.",
  ],
  "turkey-bean-chili-lunch": [
    "Add 90 g cooked extra-lean turkey to a small pot or pan.",
    "Add 140 g kidney or black beans plus 180 g tomatoes and peppers.",
    "Simmer for 8-10 minutes, stirring sometimes, until the chili thickens.",
    "Warm 100 g cooked rice separately.",
    "Serve the chili over the measured rice.",
  ],
  "chicken-tomato-rice-bowl": [
    "Warm 150 g cooked rice.",
    "Warm 120 g cooked chicken until hot.",
    "Heat 200 g tomatoes and peppers in a pan until softened.",
    "Combine rice, chicken, tomatoes, and peppers in one bowl.",
    "Add low-sugar salsa if you want more flavor without adding much fat.",
  ],
  "cottage-banana": [
    "Add 250 g cottage cheese to a bowl.",
    "Slice one medium banana into coins.",
    "Place the banana on top of the cottage cheese or eat it beside the bowl.",
    "Stir only if you like a sweeter mixed texture.",
    "Do not add extra granola, nuts, honey, or peanut butter unless you planned those calories.",
  ],
  "yogurt-rice-cakes": [
    "Spoon 250 g Greek yogurt into a bowl.",
    "Place 2 rice cakes on a plate.",
    "Spread 15 g jam on the rice cakes only if you want the extra quick carbs.",
    "Take bites of rice cake with spoonfuls of yogurt, or break the rice cakes into the yogurt for crunch.",
    "Skip the jam for the lower-calorie version.",
  ],
  "after-work-yogurt-banana-toast": [
    "Spoon 250 g Greek yogurt into a bowl.",
    "Slice one banana and eat it with the yogurt.",
    "Toast 1 slice whole-grain bread until lightly crisp.",
    "Add 10 g jam to the toast only if you need extra quick carbs before the gym.",
    "Eat this 60-120 minutes before lifting so it has time to settle.",
  ],
  "yogurt-oats-bowl": [
    "Add 250 g Greek yogurt to a bowl.",
    "Stir in 10 g whey until smooth.",
    "Add 40 g oats and mix until evenly coated.",
    "Fold in 100 g berries.",
    "Let it sit for 5-10 minutes if you want the oats softer.",
  ],
  "turkey-sandwich-fruit": [
    "Lay 2 slices whole-grain bread on a plate.",
    "Add 100 g turkey slices evenly across one slice.",
    "Spread mustard if using it.",
    "Close the sandwich and cut it in half if that makes it easier to eat.",
    "Eat one orange or apple on the side.",
  ],
  "chicken-sandwich-fruit": [
    "Lay 2 slices whole-grain bread on a plate.",
    "Add 100 g cooked chicken evenly across one slice.",
    "Spread mustard if using it.",
    "Close the sandwich and press it gently so it holds together.",
    "Eat one orange or apple on the side.",
  ],
  "savoury-tuna-plate": [
    "Drain 100 g light tuna and flake it with a fork.",
    "Add the tuna to a plate beside sliced cucumber.",
    "Add 30-60 g hummus only if using it; choose 30 g for the lower-calorie version.",
    "Add whole-grain crackers only if planned.",
    "Eat the tuna with cucumber slices, hummus, and crackers as one measured snack plate.",
  ],
  "emergency-shake-meal": [
    "Pour 300 mL milk or water into the blender first. Use water for the lower-calorie version.",
    "Add 30 g whey, 1 banana, and 20 g oats.",
    "Blend for 20-30 seconds.",
    "Stop and scrape the sides if powder sticks, then blend again until smooth.",
    "Drink it as the meal replacement and do not add another routine shake afterward.",
  ],
  "greek-yogurt-melon": [
    "Add 300 g Greek yogurt to a bowl.",
    "Stir in 30 g oats.",
    "Cut 150 g melon or berries into bite-size pieces and add them on top.",
    "Add 10 g nuts only if using the higher-calorie version.",
    "Let it sit briefly if you want the oats softer.",
  ],
  "cottage-apple": [
    "Add 300 g cottage cheese to a bowl.",
    "Slice one apple into thin pieces or small cubes.",
    "Place the apple on top of the cottage cheese.",
    "Add cinnamon if you want more flavor.",
    "Eat it as one bowl; skip extra nuts, granola, or honey unless planned.",
  ],
  "salmon-potato-dinner": [
    "Cook or warm 250 g potato until soft.",
    "Cook salmon gently in a pan or oven until it flakes with a fork, or warm 125-150 g cooked salmon.",
    "Cook 200 g vegetables until hot and tender.",
    "Plate potato, salmon, and vegetables in separate sections.",
    "Add 40 g avocado only if using that optional version; halve or skip it to save calories.",
  ],
  "chicken-potato-apple": [
    "Cook or warm 250 g potato until soft.",
    "Warm 100 g cooked chicken until hot.",
    "Cook 200 g vegetables until tender.",
    "Plate the chicken, potato, and vegetables together.",
    "Add 60 g avocado only if using it, and eat the apple on the side.",
  ],
  "chicken-sweet-potato": [
    "Cook or warm 250 g sweet potato until soft.",
    "Warm 105 g cooked chicken until hot.",
    "Cook 200 g vegetables until tender.",
    "Plate chicken, sweet potato, and vegetables together.",
    "Use spray for the lowest-calorie version; add 5 g olive oil only if measured.",
  ],
  "white-fish-plate": [
    "Cook or warm 250 g potato until soft.",
    "Pat 150 g white fish dry and season it simply.",
    "Bake or pan-cook the fish gently until it flakes easily with a fork.",
    "Cook 200 g vegetables until hot.",
    "Plate fish, potato, and vegetables; use spray instead of 10 g olive oil if saving calories.",
  ],
  "salmon-quinoa": [
    "Warm 140 g cooked quinoa.",
    "Cook salmon gently until it flakes with a fork, or warm 130 g cooked salmon.",
    "Cook 180 g red or green vegetables until tender.",
    "Put quinoa on the plate first, then salmon, then vegetables.",
    "Keep sauce light so this stays close to the planned calories.",
  ],
  "turkey-bean-chili": [
    "Add 90 g cooked extra-lean turkey to a small pot.",
    "Add 140 g kidney or black beans plus 180 g tomatoes and peppers.",
    "Simmer for 8-10 minutes, stirring sometimes, until thick and hot.",
    "Warm 100 g cooked rice separately.",
    "Serve the chili over the rice as one measured dinner bowl.",
  ],
  "egg-fried-rice": [
    "Warm 150 g cooked brown rice so it separates easily.",
    "Cook 200 g peas and carrots in a nonstick pan for 2-3 minutes.",
    "Whisk 2 eggs with 180 g egg whites.",
    "Push the vegetables to one side, add the eggs, and stir until fully set.",
    "Add the rice, mix everything together, and season lightly.",
  ],
  "tofu-lentil-curry": [
    "Cut 200 g firm tofu into cubes.",
    "Cook the tofu in a nonstick pan until lightly golden.",
    "Add 120 g lentils, 150 g vegetables, and light curry sauce if using it.",
    "Simmer for 5-8 minutes until hot and slightly thick.",
    "Serve the curry over 100 g cooked rice.",
  ],
};

function detailedRecipeHowTo(recipe: DietRecipe) {
  return recipeHowToSteps[recipe.id] ?? recipe.prep;
}

// Maps turn arrays into lookup tables. This is faster and less error-prone than repeatedly scanning
// the whole recipe list when rendering swaps or restoring saved diet choices.
const dietRecipeMap = dietRecipes.reduce<Record<string, DietRecipe>>((map, recipe) => {
  map[recipe.id] = recipe;
  return map;
}, {});

// This weekly meal map is the default nutrition calendar. Swaps are stored separately per day, so
// changing a meal here updates future defaults without erasing a user's saved swap history.
const weeklyDietMealMap: Record<PlanWeekday, Record<DietMealSlot, string>> = {
  Monday: {
    breakfast: "oats-yogurt-berries",
    lunch: "chicken-rice-bowl",
    snack: "cottage-banana",
    dinner: "salmon-potato-dinner",
  },
  Tuesday: {
    breakfast: "egg-wrap-orange",
    lunch: "tuna-quinoa-cucumber-bowl",
    snack: "yogurt-oats-bowl",
    dinner: "chicken-potato-apple",
  },
  Wednesday: {
    breakfast: "cottage-bowl-kiwi",
    lunch: "chicken-quinoa-veg-bowl",
    snack: "after-work-yogurt-banana-toast",
    dinner: "beef-whole-grain-pasta",
  },
  Thursday: {
    breakfast: "yogurt-oat-pear",
    lunch: "lean-beef-rice-bowl",
    snack: "chicken-sandwich-fruit",
    dinner: "white-fish-plate",
  },
  Friday: {
    breakfast: "oats-yogurt-berries",
    lunch: "chicken-rice-bowl",
    snack: "cottage-banana",
    dinner: "salmon-quinoa",
  },
  Saturday: {
    breakfast: "egg-potato-citrus",
    lunch: "chicken-tomato-rice-bowl",
    snack: "greek-yogurt-melon",
    dinner: "chicken-sweet-potato",
  },
  Sunday: {
    breakfast: "yogurt-bowl-kiwi",
    lunch: "egg-quinoa-veg-bowl",
    snack: "cottage-apple",
    dinner: "lean-beef-potato-plate",
  },
};

// The weekly schedule is the source of truth for workout order. Every exercise ID appears exactly
// where the user should do it: warm-ups, ramp sets, working lifts, accessories, cardio, then core.
const weeklySchedule: Record<string, SessionTemplate> = {
  Monday: {
    title: "Strength A",
    type: "strength",
    code: "A",
    time: "45-85 min",
    summary: "Beginner-friendly full-body strength: short treadmill warm-up, knee/hip prep, ramp sets, four main lifts, core, and optional finisher as capacity improves.",
    accent: "strength-a",
    exerciseIds: [
      ...strengthWarmupIds,
      "warmup-ramp-leg-press",
      "warmup-ramp-incline-db-press",
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "db-rdl",
      "seated-leg-extension",
      "seated-leg-curl",
      "treadmill-finisher",
      "front-plank",
      "cable-crunch",
      "dead-bug",
    ],
    tasks: ["Follow every move in order", "Use the planned RIR target instead of training to failure", "Use pain-free knee and hip ranges; never force a deep squat"],
    finisher: "Optional brisk treadmill walk at talk-test pace; duration progresses by month.",
  },
  Tuesday: {
    title: "Cardio Base",
    type: "cardio",
    code: "CB",
    time: "30-60 min",
    summary: "Treadmill walk: easy warm-up, progressive talk-test walking block, and easy cool-down.",
    accent: "cardio",
    exerciseIds: ["warmup-treadmill-walk", "treadmill-walk", "cardio-cooldown-walk"],
    tasks: ["Complete the easy warm-up", "Complete the brisk walking block", "Complete the easy cool-down"],
  },
  Wednesday: {
    title: "Strength B",
    type: "strength",
    code: "B",
    time: "45-85 min",
    summary: "Beginner-friendly Strength B: supported legs, row, glute bridge, push-up path, seated shoulder press, and dead bug before later accessories appear.",
    accent: "strength-b",
    exerciseIds: [
      ...strengthWarmupIds,
      "warmup-ramp-leg-press",
      "warmup-ramp-single-arm-row",
      "leg-press",
      "single-arm-row",
      "glute-bridge",
      "push-up",
      "seated-db-overhead",
      "incline-reverse-fly",
      "dumbbell-biceps-curl",
      "rope-triceps-pressdown",
      "treadmill-finisher",
      "front-plank",
      "dead-bug",
      "cable-crunch",
    ],
    tasks: ["Follow every move in order", "Use the planned RIR target instead of training to failure", "Use pain-free knee and hip ranges; never force a deep squat"],
    finisher: "Optional brisk treadmill walk at talk-test pace; duration progresses by month.",
  },
  Thursday: {
    title: "Easy Movement",
    type: "movement",
    code: "EM",
    time: "20-35 min",
    summary: "Easy/moderate walk plus light mobility. Optional movement practice appears later only if it helps recovery.",
    accent: "movement",
    exerciseIds: ["treadmill-walk", "mobility-flow", "hip-hinge-drill", "incline-push-up", "warmup-front-plank"],
    tasks: ["Easy/moderate walk", "5-10 min light mobility", "Keep intensity easy enough that Friday feels better"],
  },
  Friday: {
    title: "Strength C",
    type: "strength",
    code: "C",
    time: "45-85 min",
    summary: "Beginner-friendly Strength C repeats important lifts, keeps the RDL pattern, adds leg curl early, and brings in fly/arms/core only after the base is earned.",
    accent: "strength-c",
    exerciseIds: [
      ...strengthWarmupIds,
      "warmup-ramp-leg-press",
      "warmup-ramp-incline-db-press",
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "barbell-rdl",
      "seated-leg-curl",
      "seated-leg-extension",
      "cable-chest-fly",
      "dumbbell-biceps-curl",
      "rope-triceps-pressdown",
      "treadmill-finisher",
      "dead-bug",
      "front-plank",
      "cable-crunch",
    ],
    tasks: ["Follow every move in order", "Use the planned RIR target instead of training to failure", "Use pain-free knee and hip ranges; never force a deep squat"],
    finisher: "Optional brisk treadmill walk at talk-test pace; duration progresses by month.",
  },
  Saturday: {
    title: "Long Cardio",
    type: "cardio",
    code: "LC",
    time: "35-75 min",
    summary: "Longer talk-test treadmill walk or outdoor walk that builds gradually across six months.",
    accent: "cardio-long",
    exerciseIds: ["long-cardio-walk"],
    tasks: ["Complete the planned longer walk", "Use talk-test intensity", "Outdoor route is fine if joints feel good"],
  },
  Sunday: {
    title: "Recovery",
    type: "recovery",
    code: "R",
    time: "15-30 min",
    summary: "Rest from hard training; easy walk if you want; review weight average, meal prep optional.",
    accent: "recovery",
    exerciseIds: [],
    tasks: ["Review weekly average weight", "Meal prep optional", "Easy walk optional"],
  },
};

// The calendar builder loops through this order for 182 days, which is why Day 1 can stay Monday
// even though the app still knows the user's actual calendar date.
const scheduleOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const sessionTypeLabels: Record<SessionType, string> = {
  strength: "Strength",
  cardio: "Cardio",
  movement: "Movement",
  recovery: "Recovery",
};

// Library order mirrors a beginner's mental flow: warm-ups first, then major movement patterns,
// accessories, cardio, and mobility.
const libraryOrder = [
  "warmup-treadmill-walk",
  "seated-knee-extension-warmup",
  "standing-supported-hip-abduction",
  "hip-hinge-drill",
  "incline-push-up",
  "warmup-front-plank",
  "bodyweight-squat",
  "warmup-ramp-leg-press",
  "warmup-ramp-incline-db-press",
  "warmup-ramp-goblet-squat",
  "warmup-ramp-single-arm-row",
  "leg-press",
  "seated-leg-extension",
  "seated-leg-curl",
  "glute-bridge",
  "incline-db-press",
  "machine-chest-press",
  "lat-pulldown",
  "assisted-pull-up",
  "seated-cable-row",
  "db-rdl",
  "barbell-rdl",
  "goblet-squat",
  "front-plank",
  "dead-bug",
  "cable-crunch",
  "dumbbell-biceps-curl",
  "rope-triceps-pressdown",
  "single-arm-row",
  "push-up",
  "seated-db-overhead",
  "machine-shoulder-press",
  "incline-reverse-fly",
  "cable-chest-fly",
  "pec-deck-fly",
  "treadmill-finisher",
  "treadmill-walk",
  "cardio-cooldown-walk",
  "long-cardio-walk",
  "mobility-flow",
];

// Date helpers always work from noon local time instead of midnight. That avoids daylight-saving
// edge cases where adding a day at midnight can accidentally cross an hour boundary.
function dateFromIso(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function isoFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, amount: number) {
  const next = dateFromIso(iso);
  next.setDate(next.getDate() + amount);
  return isoFromDate(next);
}

function diffDays(fromIso: string, toIso: string) {
  const from = dateFromIso(fromIso).getTime();
  const to = dateFromIso(toIso).getTime();
  return Math.round((to - from) / 86_400_000);
}

function dayName(iso: string) {
  return dateFromIso(iso).toLocaleDateString("en-US", { weekday: "long" });
}

function formatDate(iso: string, style: "short" | "long" = "long") {
  return dateFromIso(iso).toLocaleDateString("en-US", {
    weekday: style === "long" ? "long" : "short",
    month: "short",
    day: "numeric",
  });
}

// Training phases are monthly so a true beginner can adapt before the app adds meaningful work.
// Calendar week and earned training week can differ; the UI uses earned training week for targets.
function coachingWeek(planDay: PlanDay) {
  return planDay.trainingWeek ?? planDay.week;
}

function withTrainingWeek(planDay: PlanDay, trainingWeek: number): PlanDay {
  return {
    ...planDay,
    trainingWeek: Math.max(1, Math.min(26, trainingWeek)),
  };
}

function trainingMonthForWeek(week: number) {
  if (week <= 4) return 1;
  if (week <= 8) return 2;
  if (week <= 12) return 3;
  if (week <= 16) return 4;
  if (week <= 20) return 5;
  if (week <= 24) return 6;
  return 7;
}

function phaseForWeek(week: number) {
  if (week <= 4) {
    return {
      label: "Weeks 1-4",
      title: "Foundation",
      sets: "Mostly 2 working sets",
      timeCap: "45-60 min",
      rir: "3-4 RIR",
      note: "Quality first: learn setup, breathing, bracing, pain-free range, logging, and finish feeling able to train again in two days.",
    };
  }
  if (week <= 8) {
    return {
      label: "Weeks 5-8",
      title: "Build",
      sets: "Main lifts 3 sets, accessories 2",
      timeCap: "50-65 min",
      rir: "2-3 RIR",
      note: "Consistency earns more work. Use double progression: build reps with clean form, then increase the smallest available weight.",
    };
  }
  if (week <= 12) {
    return {
      label: "Weeks 9-12",
      title: "Progress",
      sets: "Main lifts 3 sets, selected accessories 2-3",
      timeCap: "55-70 min",
      rir: "2-3 RIR",
      note: "Training now looks like training: direct arms, loadable core, stronger walks, and a Month 3 checkpoint without max testing.",
    };
  }
  if (week <= 16) {
    return {
      label: "Weeks 13-16",
      title: "Build Again",
      sets: "Main lifts 3 sets; one main lift may use 4",
      timeCap: "60-75 min",
      rir: "2-3 RIR",
      note: "Add useful volume cautiously. Week 16 can be lighter if recovery, soreness, or adherence says the block was hard.",
    };
  }
  if (week <= 20) {
    return {
      label: "Weeks 17-20",
      title: "Stronger Training",
      sets: "Major lifts 3 quality sets, one or two may use 4",
      timeCap: "65-80 min",
      rir: "1-3 RIR",
      note: "Push performance without marathon workouts. Difficulty comes from load, reps, control, and cardio capacity.",
    };
  }
  if (week <= 24) {
    return {
      label: "Weeks 21-24",
      title: "Consolidate and Perform",
      sets: "Hold volume, improve quality",
      timeCap: "65-85 min",
      rir: "1-3 RIR",
      note: "Month 6 is not about endless extra exercises. Use the fitness you built: better reps, better loads, better pace.",
    };
  }
  return {
    label: "Weeks 25-26",
    title: "Final Comparison",
    sets: "Compare without maxing",
    timeCap: "60-75 min",
    rir: "2-3 RIR",
    note: "Compare body-weight average, optional photos, strength trends, cardio duration, and consistency against the start.",
  };
}

function isRampWarmup(exercise: Exercise) {
  return exercise.id.startsWith("warmup-ramp-");
}

function isConsolidationWeek(week: number) {
  return week === 8 || week === 16 || week === 24 || week === 25;
}

function rirTargetForWeek(week: number) {
  if (week <= 4) return "3-4 RIR";
  if (week <= 16) return "2-3 RIR";
  if (week <= 24) return "1-3 RIR";
  return "2-3 RIR";
}

function rirExplanationForWeek(week: number) {
  return `${rirTargetForWeek(week)} means you stop while you still have that many clean reps left. 4 RIR = about 4 more reps possible; 1 RIR = maybe 1 more; 0 RIR = no more reps, which this plan does not require.`;
}

function readinessStatusFor(readiness: ReadinessLog): ReadinessStatus {
  if (readiness.jointPain === "concerning") return "red";
  if (readiness.energy === "low" && readiness.sleep === "poor") return "red";
  if (readiness.soreness === "high" && readiness.jointPain === "mild") return "red";
  if (
    readiness.energy === "low" ||
    readiness.soreness === "high" ||
    readiness.jointPain === "mild" ||
    readiness.sleep === "poor"
  ) {
    return "yellow";
  }
  return "green";
}

function readinessCopy(status: ReadinessStatus) {
  if (status === "red") {
    return {
      label: "Red day",
      detail:
        "Switch to recovery work, stop painful movements, and seek assessment if pain is concerning, new, swollen, unstable, locking, or weight-bearing is difficult.",
    };
  }
  if (status === "yellow") {
    return {
      label: "Yellow day",
      detail: "Keep the main lifts, remove optional work, and let the app trim one set from non-main work.",
    };
  }
  return {
    label: "Green day",
    detail: "Do the normal workout with the planned RIR target and full rest.",
  };
}

function exercisePriorityFor(exercise: Exercise, planDay: PlanDay): ExercisePriority {
  if (exercise.priority) return exercise.priority;
  if (planDay.session.type === "cardio" && exercise.family === "cardio") return "main";
  if (isRampWarmup(exercise) || exercise.family === "warmup") return "accessory";
  if (exercise.id === "treadmill-finisher") return "optional";
  if (exercise.family === "arms" || exercise.id === "cable-chest-fly") return "optional";
  if (
    [
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "db-rdl",
      "barbell-rdl",
      "single-arm-row",
      "glute-bridge",
      "push-up",
      "seated-db-overhead",
    ].includes(exercise.id)
  ) {
    return "main";
  }
  return "accessory";
}

function exercisePriorityLabel(priority: ExercisePriority) {
  return {
    main: "Main",
    accessory: "Accessory",
    optional: "Optional",
  }[priority];
}

function exerciseIntroductionWeek(planDay: PlanDay, exerciseId: string) {
  if (planDay.session.type === "cardio" || planDay.session.type === "recovery") return 1;

  if (planDay.session.type === "movement") {
    if (["treadmill-walk", "mobility-flow"].includes(exerciseId)) return 1;
    return 5;
  }

  const title = planDay.session.title;
  if (
    strengthWarmupIds.includes(exerciseId) ||
    exerciseId.startsWith("warmup-ramp-") ||
    ["leg-press", "incline-db-press", "lat-pulldown", "db-rdl", "barbell-rdl"].includes(exerciseId)
  ) {
    return 1;
  }
  if (title === "Strength B" && ["single-arm-row", "glute-bridge", "push-up", "seated-db-overhead", "dead-bug"].includes(exerciseId)) {
    return 1;
  }
  if (title === "Strength C" && ["seated-leg-curl", "dead-bug"].includes(exerciseId)) {
    return 1;
  }
  if (title === "Strength A" && ["front-plank", "treadmill-finisher"].includes(exerciseId)) {
    return 1;
  }
  if (lowerMachineAccessoryIds.includes(exerciseId) || exerciseId === "warmup-front-plank") return 5;
  if (
    [
      "incline-reverse-fly",
      "dumbbell-biceps-curl",
      "rope-triceps-pressdown",
      "cable-crunch",
      "dead-bug",
      "front-plank",
      "treadmill-finisher",
    ].includes(exerciseId)
  ) {
    return 9;
  }
  if (exerciseId === "cable-chest-fly") return 13;
  return 1;
}

function scheduledExercisesForDay(planDay: PlanDay, log?: DayLog) {
  const readiness = log ? readinessStatusFor(log.readiness) : "green";

  if (readiness === "red" && planDay.session.type === "strength") {
    return ["warmup-treadmill-walk", "mobility-flow"].flatMap((id) =>
      exerciseMap[id] ? [exerciseMap[id]] : [],
    );
  }

  const week = coachingWeek(planDay);
  return planDay.session.exerciseIds
    .flatMap((id) => (exerciseMap[id] ? [exerciseMap[id]] : []))
    .filter((exercise) => exerciseIntroductionWeek(planDay, exercise.id) <= week)
    .filter((exercise) => {
      if (readiness !== "yellow") return true;
      return exercisePriorityFor(exercise, planDay) !== "optional";
    });
}

function mainLiftIndex(planDay: PlanDay, exercise: Exercise) {
  const mainIds = planDay.session.exerciseIds
    .flatMap((id) => (exerciseMap[id] ? [exerciseMap[id]] : []))
    .filter((item) => exerciseIntroductionWeek(planDay, item.id) <= coachingWeek(planDay))
    .filter((item) => exercisePriorityFor(item, planDay) === "main")
    .map((item) => item.id);
  return mainIds.indexOf(exercise.id);
}

// This is the volume progression engine. It adds work month by month, then lets completion and
// readiness decide whether today receives normal, reduced, or recovery-focused work.
function recommendedSets(
  planDay: PlanDay,
  exercise: Exercise,
  index: number,
  readinessStatus: ReadinessStatus = "green",
) {
  const week = coachingWeek(planDay);
  const priority = exercisePriorityFor(exercise, planDay);
  const mainIndex = mainLiftIndex(planDay, exercise);
  let sets = 1;

  if (isRampWarmup(exercise)) sets = week <= 4 ? 1 : 2;
  else if (exercise.family === "warmup" || exercise.family === "cardio") sets = 1;
  else if (planDay.session.type !== "strength") sets = 1;
  else if (week <= 4) sets = 2;
  else if (isConsolidationWeek(week)) sets = priority === "main" ? 2 : 1;
  else if (week <= 8) sets = priority === "main" && mainIndex < 4 ? 3 : 2;
  else if (week <= 12) sets = priority === "main" ? 3 : exercise.family === "core" ? 3 : 2;
  else if (week <= 16) sets = priority === "main" && mainIndex === 0 ? 4 : priority === "main" ? 3 : 2;
  else if (week <= 20) sets = priority === "main" && mainIndex >= 0 && mainIndex < 2 ? 4 : priority === "main" ? 3 : 3;
  else if (week <= 24) sets = priority === "main" && mainIndex === 0 ? 4 : priority === "main" ? 3 : 2;
  else sets = priority === "main" ? 3 : 2;

  if (readinessStatus === "yellow" && priority !== "main" && exercise.family !== "warmup") {
    sets = Math.max(1, sets - 1);
  }
  if (readinessStatus === "red") sets = 1;

  return Math.max(1, sets + Math.min(0, index) * 0);
}

// Warm-up targets progress just enough to prepare the user. They do not become a long workout
// before the actual workout.
function warmupTarget(planDay: PlanDay, exercise: Exercise) {
  const week = coachingWeek(planDay);
  if (exercise.id === "warmup-treadmill-walk") {
    if (week <= 4) return "5-7 min easy";
    if (week <= 8) return "6-8 min easy";
    if (week <= 16) return "7-9 min easy";
    if (week <= 24) return "8-10 min easy";
    return "6-8 min easy comparison week";
  }

  if (exercise.id === "seated-knee-extension-warmup") {
    if (week <= 4) return "8 each side with 1-sec hold";
    if (week <= 12) return "10 each side controlled";
    return "10-12 each side controlled";
  }

  if (exercise.id === "standing-supported-hip-abduction") {
    if (week <= 4) return "8 each side, slow";
    if (week <= 12) return "10 each side, slow";
    return "10-12 each side with quiet torso";
  }

  if (exercise.id === "bodyweight-squat") return "Optional only: 6-10 comfortable reps";
  if (exercise.id === "hip-hinge-drill") return week <= 4 ? "Optional: 8 smooth reps" : "8-10 smooth reps";
  if (exercise.id === "incline-push-up") return week <= 4 ? "Optional: 6 clean reps" : "6-10 clean reps";
  if (exercise.id === "warmup-front-plank") return week <= 4 ? "Optional: 15-20 sec" : "20-30 sec";
  if (exercise.id === "mobility-flow") return week <= 4 ? "5-10 min light" : "8-12 min light";

  return exercise.reps;
}

// Ramp warm-ups are expressed as percentages of working pounds. They prepare the lift and never
// count as working sets.
function rampWarmupTarget(planDay: PlanDay, exercise: Exercise) {
  const week = coachingWeek(planDay);
  const isUpperBody = exercise.id.includes("press") || exercise.id.includes("row");
  if (week <= 4) {
    return isUpperBody
      ? "1-2 practice sets: 40-60% working lbs"
      : "1-2 practice sets: 50-65% working lbs";
  }
  if (isConsolidationWeek(week)) {
    return isUpperBody
      ? "1-2 easy sets: 40-55% working lbs"
      : "1-2 easy sets: 45-60% working lbs";
  }
  if (week <= 12) {
    return isUpperBody
      ? "2 ramp sets: 50-70% working lbs"
      : "2 ramp sets: 55-75% working lbs";
  }
  if (week <= 20) {
    return isUpperBody
      ? "2 ramp sets: 55-75% working lbs"
      : "2 ramp sets: 60-80% working lbs";
  }
  return isUpperBody
    ? "2 ramp sets: 60-80% working lbs"
    : "2 ramp sets: 65-85% working lbs";
}

function warmupProgressionForExercise(planDay: PlanDay, exercise: Exercise) {
  if (isRampWarmup(exercise)) {
    return "Ramp sets are practice/preparation and do not count as working sets. They rise only when your working pounds rise.";
  }

  if (exercise.id === "warmup-treadmill-walk") {
    return "Use 5-7 easy minutes in Month 1, then nudge duration up only when lifting still feels sharp.";
  }

  if (exercise.family === "warmup") {
    return `${exercise.progression} Keep this short and pain-free; it should help the lifts, not tire you out.`;
  }

  return exercise.progression;
}

// Most exercises start with a broad rep range in the library. This function narrows or advances
// that range by month so the same exercise becomes more demanding without adding endless exercises.
function rangedTarget(base: string, week: number) {
  const month = trainingMonthForWeek(week);

  if (base.includes("20-45 sec")) {
    if (month === 1) return "20-30 sec";
    if (month === 2) return "25-40 sec";
    if (month === 3) return "30-45 sec";
    if (month <= 5) return "35-55 sec";
    return "40-60 sec";
  }

  if (base.includes("6-15")) {
    if (month === 1) return "6-10 reps";
    if (month === 2) return "8-12 reps";
    return "8-15 reps";
  }

  if (base.includes("12-15")) {
    if (month === 1) return "12 reps";
    return "12-15 reps";
  }

  if (base.includes("10-15")) {
    if (month === 1) return "10-12 reps";
    return "10-15 reps";
  }

  if (base.includes("8-10")) {
    if (month === 1) return "8 reps";
    return "8-10 reps";
  }

  if (base.includes("8-12")) {
    if (month === 1) return "8-10 reps";
    return "8-12 reps";
  }

  return base;
}

function cardioMinutesRange(planDay: PlanDay, exercise: Exercise): [number, number] | null {
  const week = coachingWeek(planDay);
  const month = trainingMonthForWeek(week);

  if (exercise.id === "warmup-treadmill-walk") {
    if (month === 1) return [5, 7];
    if (month === 2) return [6, 8];
    if (month <= 4) return [7, 9];
    return [8, 10];
  }

  if (exercise.id === "cardio-cooldown-walk") return [5, 5];

  if (exercise.id === "treadmill-walk" && planDay.session.title === "Cardio Base") {
    if (month === 1) return [20, 30];
    if (month === 2) return [25, 35];
    if (month === 3) return [30, 40];
    if (month === 4) return [35, 45];
    if (month === 5) return [40, 45];
    return [40, 50];
  }

  if (exercise.id === "treadmill-walk" && planDay.session.title === "Easy Movement") {
    if (month === 1) return [20, 30];
    if (month === 2) return [25, 30];
    return [25, 35];
  }

  if (exercise.id === "long-cardio-walk") {
    if (month === 1) return [35, 45];
    if (month === 2) return [40, 50];
    if (month === 3) return [45, 55];
    if (month === 4) return [50, 60];
    if (month === 5) return [55, 65];
    return [60, 75];
  }

  if (exercise.id === "treadmill-finisher") {
    if (month === 1) return [5, 10];
    if (month === 2) return [8, 10];
    if (month === 3) return [10, 12];
    return [10, 12];
  }

  return null;
}

// Cardio targets are calculated because walking duration should build from sedentary-friendly
// amounts toward serious six-month conditioning without becoming punishing HIIT.
function cardioTarget(planDay: PlanDay, exercise: Exercise) {
  const range = cardioMinutesRange(planDay, exercise);
  if (!range) return exercise.reps;

  const [low, high] = range;
  const minutes = low === high ? `${low} min` : `${low}-${high} min`;
  if (exercise.id === "warmup-treadmill-walk") return `${minutes} easy`;
  if (exercise.id === "cardio-cooldown-walk") return `${minutes} easy cool-down`;
  if (exercise.id === "treadmill-finisher") return `${minutes} optional brisk`;
  if (planDay.session.title === "Easy Movement") return `${minutes} easy/moderate walk`;
  return `${minutes} talk-test moderate`;
}

function exerciseTimingFor(planDay: PlanDay, exercise: Exercise): ExerciseTiming {
  const priority = exercisePriorityFor(exercise, planDay);
  const base: ExerciseTiming =
    isRampWarmup(exercise)
      ? { minRestSeconds: 45, maxRestSeconds: 60, setSeconds: 40, setupSeconds: 75 }
      : exercise.family === "warmup"
        ? { minRestSeconds: 0, maxRestSeconds: 0, setSeconds: 45, setupSeconds: 45 }
        : exercise.family === "cardio"
          ? { minRestSeconds: 0, maxRestSeconds: 0, setSeconds: 60, setupSeconds: 60 }
          : exercise.family === "core"
            ? { minRestSeconds: 45, maxRestSeconds: 60, setSeconds: 45, setupSeconds: 45 }
            : priority === "main"
              ? { minRestSeconds: 90, maxRestSeconds: 120, setSeconds: 45, setupSeconds: 90 }
              : priority === "accessory"
                ? { minRestSeconds: 60, maxRestSeconds: 75, setSeconds: 40, setupSeconds: 60 }
                : { minRestSeconds: 60, maxRestSeconds: 75, setSeconds: 35, setupSeconds: 45 };

  return {
    ...base,
    ...exercise.timing,
  };
}

function restTimerSecondsFor(planDay: PlanDay, exercise: Exercise) {
  return exerciseTimingFor(planDay, exercise).maxRestSeconds;
}

function restForExercise(planDay: PlanDay, exercise: Exercise) {
  const timing = exerciseTimingFor(planDay, exercise);
  if (timing.maxRestSeconds === 0) return exercise.rest;
  if (timing.minRestSeconds === timing.maxRestSeconds) return `${timing.maxRestSeconds} sec`;
  return `${timing.minRestSeconds}-${timing.maxRestSeconds} sec`;
}

function sessionTimeEstimateForDay(planDay: PlanDay, log?: DayLog) {
  const readiness = log ? readinessStatusFor(log.readiness) : "green";
  const exercises = scheduledExercisesForDay(planDay, log);
  const totals = exercises.reduce(
    (sum, exercise, index) => {
      const timing = exerciseTimingFor(planDay, exercise);
      const cardioRange = cardioMinutesRange(planDay, exercise);
      const setCount = recommendedSets(planDay, exercise, index, readiness);
      const restCount = Math.max(0, setCount - 1);
      const transitionSeconds = timing.setupSeconds;

      if (cardioRange) {
        sum.min += cardioRange[0] * 60 + transitionSeconds;
        sum.max += cardioRange[1] * 60 + transitionSeconds;
        return sum;
      }

      sum.min += setCount * timing.setSeconds + restCount * timing.minRestSeconds + transitionSeconds;
      sum.max += setCount * timing.setSeconds + restCount * timing.maxRestSeconds + transitionSeconds;
      return sum;
    },
    { min: 0, max: 0 },
  );

  return {
    min: Math.max(0, Math.round(totals.min / 60)),
    max: Math.max(0, Math.round(totals.max / 60)),
    count: exercises.length,
  };
}

function sessionTimeForDay(planDay: PlanDay, log?: DayLog) {
  if (planDay.session.type === "recovery" && planDay.session.exerciseIds.length === 0) {
    return "Estimated total gym time: 0-20 min";
  }

  const estimate = sessionTimeEstimateForDay(planDay, log);
  if (!estimate.count) return planDay.session.time;
  return `Estimated total gym time: ${estimate.min}-${estimate.max} min`;
}

function sessionTimeDetailForDay(planDay: PlanDay, log?: DayLog) {
  const estimate = sessionTimeEstimateForDay(planDay, log);
  if (!estimate.count) return "Includes optional easy walking, weekly review, and meal prep if you choose them.";
  return "Includes warm-up, working sets, rest between sets, setup, transitions, cardio, and core work.";
}

function sessionSummaryForDay(planDay: PlanDay) {
  if (planDay.session.type === "strength") {
    const scheduled = scheduledExercisesForDay(planDay);
    const finisher = scheduled.some((exercise) => exercise.id === "treadmill-finisher")
      ? cardioTarget(planDay, exerciseMap["treadmill-finisher"])
      : "no required finisher";
    const hasDirectArms = scheduled.some((exercise) => exercise.family === "arms");
    const hasLowerMachines = lowerMachineAccessoryIds.some((id) =>
      scheduled.some((exercise) => exercise.id === id),
    );
    const hasCableCore = scheduled.some((exercise) => exercise.id === "cable-crunch");
    const lowerMachineText = hasLowerMachines ? "quad/hamstring machine accessories, " : "";
    const armText = hasDirectArms ? "direct arms, " : "";
    const coreText = hasCableCore ? "plank/dead bug plus loadable core, " : "simple core, ";
    return `Short warm-up, lift-specific ramp warm-ups, full-body weights, ${lowerMachineText}${armText}${coreText}and ${finisher}.`;
  }

  if (planDay.session.title === "Cardio Base") {
    return `Treadmill walk: ${warmupTarget(planDay, exerciseMap["warmup-treadmill-walk"])}, ${cardioTarget(
      planDay,
      exerciseMap["treadmill-walk"],
    )}, then 5 min easy cool-down.`;
  }

  if (planDay.session.title === "Easy Movement") {
    return `Easy/moderate walk, ${warmupTarget(planDay, exerciseMap["mobility-flow"])}, and optional movement practice only if it makes Friday feel better.`;
  }

  if (planDay.session.title === "Long Cardio") {
    return `${cardioTarget(planDay, exerciseMap["long-cardio-walk"])} at talk-test pace.`;
  }

  return planDay.session.summary;
}

function dietDayTypeForPlanDay(planDay: PlanDay): DietDayType {
  if (planDay.session.type === "strength") return "strength";
  if (planDay.session.type === "cardio") return "cardio";
  return "recovery";
}

function dietSlotLabel(slot: DietMealSlot) {
  return dietMealSlots.find((item) => item.id === slot)?.label ?? slot;
}

// Meal timing is intentionally relative instead of exact clock time. That keeps the app useful for
// workdays, weekends, and after-work gym sessions without pretending everyone eats on one schedule.
function dietTimingForSlot(planDay: PlanDay, slot: DietMealSlot) {
  if (slot === "breakfast") return "Morning";
  if (slot === "lunch") {
    return planDay.session.type === "strength" ? "Midday · 3-4 hr pre-gym" : "Midday";
  }
  if (slot === "dinner") {
    return planDay.session.type === "strength" ? "Post-workout evening" : "Evening";
  }
  if (planDay.session.type === "strength") return "After work · 60-120 min pre-gym";
  if (planDay.session.type === "cardio") return "60-120 min pre-cardio if hungry";
  return "Afternoon";
}

function dietCoachNoteForDay(planDay: PlanDay) {
  if (planDay.session.type === "strength") {
    return "After-work lifting day: keep lunch complete, then eat the snack 60-120 minutes before the gym for your 25-40 g lifting-carb dose. Bring water and do not push through dizziness.";
  }
  if (planDay.session.type === "cardio") {
    return "Keep normal measured carbs and hydrate around the treadmill work. If cardio is after work and you feel under-fueled, use the snack 60-120 minutes before you start.";
  }
  return "Keep protein stable, use slightly lower starch portions, and let this be an easier nutrition day.";
}

// This note exists because the user reported nearly fainting during a workout. It turns the snack
// slot into practical pre-workout fueling guidance without adding a separate complicated feature.
function afterWorkGymFuelForDay(planDay: PlanDay, snackRecipe: DietRecipe) {
  if (planDay.session.type === "strength") {
    return {
      title: "After-work gym fuel",
      label: "5pm+ lifting",
      steps: [
        {
          label: "Lunch",
          detail: "Eat the full lunch 3-4 hours before training when possible.",
        },
        {
          label: "Snack",
          detail: `Eat ${snackRecipe.shortTitle} 60-120 minutes before lifting.`,
        },
        {
          label: "Hydration",
          detail: "Drink 2-3 cups of water across the 2-3 hours before the gym, then sip during sets.",
        },
      ],
      caution:
        "If dizziness starts, stop the set, sit or lie down, breathe slowly, sip water, and do not restart hard sets that day. If you actually faint, have chest pain, feel an irregular heartbeat, or this repeats, get medical care.",
    };
  }

  if (planDay.session.type === "cardio") {
    return {
      title: "Cardio fuel check",
      label: "Steady energy",
      steps: [
        {
          label: "Before",
          detail: "If lunch was early or light, eat the snack 60-120 minutes before cardio.",
        },
        {
          label: "Hydration",
          detail: "Bring water and keep the pace at talk-test intensity.",
        },
        {
          label: "During",
          detail: "Slow down if you feel lightheaded; do not chase the treadmill number.",
        },
      ],
      caution:
        "If you feel faint, stop, sit down, hydrate, and end the hard part for the day. Repeated dizziness deserves medical follow-up.",
    };
  }

  return {
    title: "Recovery fuel check",
    label: "Easy day",
    steps: [
      {
        label: "Protein",
        detail: "Keep protein steady even when calories are lower.",
      },
      {
        label: "Carbs",
        detail: "Use the planned snack if a walk or busy workday leaves you flat.",
      },
      {
        label: "Hydration",
        detail: "Drink normally through the day and avoid starting activity dehydrated.",
      },
    ],
    caution: "Recovery days should feel easy. Lightheadedness is a stop signal, not a challenge.",
  };
}

function baseDietRecipeFor(planDay: PlanDay, slot: DietMealSlot) {
  return dietRecipeMap[weeklyDietMealMap[planDay.planDayName][slot]];
}

// A saved swap is only accepted if it still belongs to the same meal slot. That prevents a stale
// or manually edited save from putting a dinner recipe into breakfast.
function activeDietRecipeFor(planDay: PlanDay, log: DietDayLog, slot: DietMealSlot) {
  const baseRecipe = baseDietRecipeFor(planDay, slot);
  const swappedRecipe = log.swaps[slot] ? dietRecipeMap[log.swaps[slot] ?? ""] : null;
  return swappedRecipe?.slot === slot ? swappedRecipe : baseRecipe;
}

function dietSwapOptionsFor(slot: DietMealSlot, currentRecipeId: string) {
  return dietRecipes.filter((recipe) => recipe.slot === slot && recipe.id !== currentRecipeId);
}

// Completion is derived from the four meal checks. This keeps "Mark eaten" and full-day completion
// in sync instead of requiring the user to press one extra final button.
function withAutomaticDietCompletion(log: DietDayLog) {
  const completed = dietMealSlots.every((slot) => log.meals[slot.id]);
  return {
    ...log,
    completed,
  };
}

// The app now uses kg for body weight, but this fallback preserves older saves that stored the
// value in the legacy weight field.
function weightKgFromMetric(metric: MetricLog) {
  const entered = metric.weightKg.trim();
  if (entered && !/^\d+(?:[.,]\d+)?$/.test(entered)) return null;
  const directKg = entered ? Number(entered.replace(",", ".")) : null;
  if (directKg !== null) return directKg > 0 && directKg <= 500 ? directKg : null;

  const legacyPounds = /^\d+(?:[.,]\d+)?$/.test(metric.weight.trim())
    ? Number(metric.weight.replace(",", ".")) : null;
  return legacyPounds !== null && legacyPounds > 0 && legacyPounds * 0.45359237 <= 500
    ? legacyPounds * 0.45359237 : null;
}

function proteinReferenceFromMetrics(
  planDays: PlanDay[],
  metrics: Record<string, MetricLog>,
  throughIndex: number,
): ProteinReference {
  const entries = planDays
    .slice(0, Math.min(Math.max(throughIndex + 1, 1), planDays.length))
    .map((day) => ({
      date: day.iso,
      weight: weightKgFromMetric(normalizeMetricLogShape(metrics[day.iso])),
    }))
    .filter((entry): entry is { date: string; weight: number } => entry.weight !== null);

  if (!entries.length) {
    return {
      weight: null,
      label: "Waiting for weigh-ins",
      detail: "Log morning weight in Coach Hub and protein will calculate automatically.",
    };
  }

  // "Recent" means calendar days, not the last seven entries over several months.
  const referenceDate = planDays[Math.min(Math.max(throughIndex, 0), planDays.length - 1)].iso;
  const recentEntries = entries.filter((entry) => diffDays(entry.date, referenceDate) < 14).slice(-7);

  if (recentEntries.length >= 3) {
    const average =
      recentEntries.reduce((sum, entry) => sum + entry.weight, 0) / recentEntries.length;
    return {
      weight: average,
      label: "Recent average",
      detail: `${formatLoadValue(average)} kg from your latest ${
        recentEntries.length
      } logged mornings.`,
    };
  }

  const latest = entries.at(-1);
  const isStale = latest ? diffDays(latest.date, referenceDate) >= 14 : false;

  return {
    weight: latest?.weight ?? null,
    label: isStale ? "Older weigh-in" : "Latest weigh-in",
    detail: latest
      ? `${formatLoadValue(latest.weight)} kg from ${formatDate(
          latest.date,
          "short",
        )}. ${isStale ? "Add a current weigh-in to refresh this estimate." : "Add 3+ recent logs to switch to an average."}`
      : "Log morning weight in Coach Hub and protein will calculate automatically.",
  };
}

function personalizedDietTarget(
  type: DietDayType,
  settings: UserSettings,
  proteinReferenceWeightKg: number | null,
) {
  const base = dietTargets[type];
  const adjustment =
    settings.calorieMode === "lower" ? -150 : settings.calorieMode === "higher" ? 150 : 0;
  const calories = defaultDietCalories[type] + adjustment;
  const protein = proteinReferenceWeightKg
    ? `${Math.round(proteinReferenceWeightKg * 1.6)}-${Math.round(
        proteinReferenceWeightKg * 2,
      )} g protein`
    : "1.6-2.0 g/kg protein";
  const modeLabel =
    settings.calorieMode === "lower"
      ? "small deficit nudge"
      : settings.calorieMode === "higher"
        ? "training support nudge"
        : "base target";

  return {
    ...base,
    calories: `~${calories.toLocaleString("en-US")} kcal`,
    protein,
    modeLabel,
  };
}

// Smart portions use trend-level evidence, not one emotional weigh-in. The app waits for completed
// weeks before calling weight loss too fast, on track, stalled, or gaining.
function completedWeightWeeksBefore(
  planDays: PlanDay[],
  metrics: Record<string, MetricLog>,
  throughIndex: number,
) {
  const safeIndex = Math.max(0, Math.min(throughIndex, planDays.length - 1));
  const completedWeekCount = Math.floor(safeIndex / 7);

  return Array.from({ length: completedWeekCount }, (_item, weekIndex) =>
    weightWeekSummary(planDays, metrics, weekIndex),
  );
}

function weightTrendSignalFor(
  planDays: PlanDay[],
  metrics: Record<string, MetricLog>,
  throughIndex: number,
  proteinReference: ProteinReference,
): WeightTrendSignal {
  const usableWeeks = completedWeightWeeksBefore(planDays, metrics, throughIndex);
  const previous = usableWeeks.at(-2);
  const current = usableWeeks.at(-1);

  // Do not bridge empty weeks or act on one weigh-in. Four mornings is an app
  // confidence rule, not a clinical threshold, and missing days are never zeroes.
  if (!previous || !current || previous.average === null || current.average === null ||
      previous.loggedDays < 4 || current.loggedDays < 4) {
    return {
      status: "waiting",
      label: "Trend learning",
      detail:
        "Log at least 4 mornings in each of the last two completed weeks before changing portions. Missing weeks and single readings are not enough evidence.",
      deltaKg: null,
    };
  }

  const deltaKg = current.average - previous.average;
  const absDelta = Math.abs(deltaKg);
  const referenceWeight = proteinReference.weight ?? current.average;
  const fastLossCutoff = Math.max(0.7, Math.min(0.95, referenceWeight * 0.01));
  const missingDays = previous.missingDays + current.missingDays;
  const reliability =
    missingDays > 0
      ? ` ${missingDays} of 14 mornings are missing, so the signal is useful but not perfect.`
      : " All 14 mornings are logged, so the signal is clean.";
  const detail = `Week ${previous.week} averaged ${formatLoadValue(
    previous.average,
  )} kg. Week ${current.week} averaged ${formatLoadValue(current.average)} kg.${reliability}`;

  if (deltaKg <= -fastLossCutoff) {
    return {
      status: "fast-loss",
      label: `${formatLoadValue(absDelta)} kg down fast`,
      detail,
      deltaKg,
    };
  }

  if (deltaKg <= -0.25) {
    return {
      status: "on-track-loss",
      label: `${formatLoadValue(absDelta)} kg down`,
      detail,
      deltaKg,
    };
  }

  if (deltaKg > 0.25) {
    return {
      status: "gaining",
      label: `${formatLoadValue(absDelta)} kg up`,
      detail,
      deltaKg,
    };
  }

  const recentThree = usableWeeks.slice(-3);
  const stalledForTwoComparisons =
    recentThree.length === 3 && recentThree.every((week) => week.average !== null && week.loggedDays >= 4) &&
    recentThree
      .slice(1)
      .every((week, index) => week.average! - recentThree[index].average! > -0.2);

  return {
    status: stalledForTwoComparisons ? "stalled" : "steady",
    label: stalledForTwoComparisons ? "Two-week stall" : "Nearly steady",
    detail,
    deltaKg,
  };
}

// Workout adherence decides whether the app should tighten food or first ask for consistency. If a
// user is missing many sessions, cutting portions harder is less useful than making the routine
// repeatable.
function recentTrainingAdherenceFor(
  planDays: PlanDay[],
  store: TrackerStore,
  throughIndex: number,
  windowDays = 14,
): TrainingAdherenceSignal {
  const safeIndex = Math.max(0, Math.min(throughIndex, planDays.length - 1));
  const recentDays = planDays
    .slice(Math.max(0, safeIndex - windowDays), safeIndex)
    .filter((day) => day.session.type !== "recovery");
  const completed = recentDays.filter((day) => {
    const coachedDay = withTrainingWeek(day, earnedTrainingWeekForDay(planDays, store, day));
    return isPlanDayComplete(coachedDay, normalizeDayLog(store.days[day.iso]));
  }).length;
  const total = recentDays.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    completed,
    total,
    percent,
    enough: total > 0 && percent >= 75,
    label: total > 0 ? `${completed}/${total} training days (${percent}%)` : "No training days yet",
  };
}

function adaptiveDietCoachForDay({
  planDays,
  store,
  planDay,
  proteinReference,
  readinessStatus,
  analysisIndex,
}: {
  planDays: PlanDay[];
  store: TrackerStore;
  planDay: PlanDay;
  proteinReference: ProteinReference;
  readinessStatus: ReadinessStatus;
  analysisIndex: number;
}): AdaptiveDietCoach {
  const trend = weightTrendSignalFor(planDays, store.metrics, analysisIndex, proteinReference);
  const adherence = recentTrainingAdherenceFor(planDays, store, analysisIndex);
  const trainingDay = planDay.session.type !== "recovery";
  const dayType = dietDayTypeForPlanDay(planDay);

  if (trend.status === "waiting" && store.settings.calorieMode !== "higher" &&
      !(trainingDay && readinessStatus !== "green")) {
    return {
      tone: "logging",
      label: "Learning",
      headline: "Use the base portions while the app learns your body.",
      detail:
        "Protein follows your logged weight, but calorie portion changes wait for weekly-average evidence so one noisy scale day does not rewrite your meals.",
      trend,
      adherence,
    };
  }

  if (
    trend.status === "fast-loss" ||
    store.settings.calorieMode === "higher" ||
    (trainingDay && readinessStatus !== "green")
  ) {
    return {
      tone: "fuel",
      label: "Fuel",
      headline: "Protect training fuel today.",
      detail:
        "Your workout performance matters for gaining muscle while losing fat. Keep the planned protein and carbs around training, especially if energy or weekly averages suggest you may be under-fueled.",
      trend,
      adherence,
    };
  }

  if (
    store.settings.calorieMode === "lower" ||
    (trend.status === "stalled" && adherence.enough)
  ) {
    return {
      tone: "tighten",
      label: "Tighten",
      headline: "Trim optional calories without cutting protein.",
      detail:
        "Make at most one small adjustment to breakfast today. Keep protein, lunch, pre-workout food, and dinner steady. Review the next completed week before considering another change.",
      trend,
      adherence,
    };
  }

  if ((trend.status === "stalled" || trend.status === "gaining") && !adherence.enough) {
    return {
      tone: "consistency",
      label: "Consistency",
      headline: "Keep portions steady and win the routine first.",
      detail:
        "The weight trend is not clearly moving down yet, but recent training consistency is the first lever. Follow the base plan before making food smaller.",
      trend,
      adherence,
    };
  }

  return {
    tone: "hold",
    label: "Hold",
    headline: dayType === "recovery" ? "Keep recovery portions measured." : "Stay with the current plan.",
    detail:
      "Your weekly-average trend does not call for a bigger change today. Keep protein on target, keep portions measured, and let the next completed week confirm the pattern.",
    trend,
    adherence,
  };
}

function estimatedRecipeProteinGrams(recipe: DietRecipe) {
  const proteinValues = recipe.protein
    .match(/\d+/g)
    ?.map(Number)
    .filter((value) => Number.isFinite(value));

  if (!proteinValues?.length) return null;
  return proteinValues.reduce((sum, value) => sum + value, 0) / proteinValues.length;
}

function mealProteinTargetForSlot(slot: DietMealSlot, referenceWeightKg: number) {
  const slotShare: Record<DietMealSlot, number> = {
    breakfast: 0.24,
    lunch: 0.28,
    snack: 0.2,
    dinner: 0.28,
  };

  return Math.round(referenceWeightKg * 1.6 * slotShare[slot]);
}

function dailyProteinRangeForWeight(referenceWeightKg: number) {
  return {
    low: Math.round(referenceWeightKg * 1.6),
    high: Math.round(referenceWeightKg * 2),
  };
}

function recipeText(recipe: DietRecipe) {
  return `${recipe.title} ${recipe.ingredients.join(" ")} ${recipe.plate.join(" ")}`.toLowerCase();
}

function proteinBoostForRecipe(recipe: DietRecipe, slot: DietMealSlot) {
  const text = recipeText(recipe);

  if (text.includes("chicken")) return "Add 25-40 g cooked chicken breast or skinless thigh";
  if (text.includes("beef")) return "Add 25-35 g cooked extra-lean beef";
  if (text.includes("salmon") || text.includes("white fish")) return "Add 25-35 g cooked fish";
  if (text.includes("tuna")) return "Add 25-35 g drained light tuna";
  if (text.includes("greek yogurt") || text.includes("yogurt")) return "Add 50-100 g Greek yogurt or 5-10 g whey";
  if (text.includes("cottage")) return "Add 50-100 g cottage cheese";
  if (text.includes("egg whites") || text.includes("eggs")) return "Add 50-100 g egg whites instead of another whole egg";
  if (text.includes("tofu") || text.includes("edamame")) return "Add 50 g tofu or edamame";
  if (slot === "snack") return "Add 5-10 g whey or 50-100 g Greek yogurt";
  return "Add 25-40 g cooked chicken or 25-35 g extra-lean beef";
}

function carbPortionTweakForRecipe(recipe: DietRecipe) {
  const text = recipeText(recipe);

  if (text.includes("rice")) {
    return {
      keep: "Keep the rice measured instead of eyeballing the bowl",
      add: "Add 40-60 g cooked rice if training energy has been low",
      reduce: "Reduce cooked rice by 35-50 g away from the pre-workout meal",
    };
  }
  if (text.includes("potato")) {
    return {
      keep: "Keep the potato portion measured",
      add: "Add 75-100 g potato if lifting performance has felt flat",
      reduce: "Reduce potato by 75-100 g on recovery or tightening days",
    };
  }
  if (text.includes("pasta")) {
    return {
      keep: "Keep pasta to the listed cooked weight",
      add: "Add 40-50 g cooked pasta after a hard lift if dinner is post-workout",
      reduce: "Reduce cooked pasta by 40-50 g on tightening days",
    };
  }
  if (text.includes("quinoa")) {
    return {
      keep: "Keep quinoa to the listed cooked weight",
      add: "Add 35-50 g cooked quinoa if this meal is supporting training",
      reduce: "Reduce cooked quinoa by 35-50 g away from training",
    };
  }
  if (text.includes("oats") || text.includes("muesli")) {
    return {
      keep: "Keep oats or grains weighed before mixing",
      add: "Add 10-15 g oats if hunger or training energy is low",
      reduce: "Reduce oats or grains by 10-15 g if this is not near training",
    };
  }
  if (text.includes("bread") || text.includes("wrap")) {
    return {
      keep: "Keep the planned bread or wrap serving",
      add: "Add 1 extra slice of toast only when you truly need more pre-workout fuel",
      reduce: "Use one fewer half-slice or a smaller wrap away from training",
    };
  }
  if (text.includes("banana") || text.includes("fruit") || text.includes("apple") || text.includes("orange")) {
    return {
      keep: "Keep the planned fruit serving",
      add: "Add one fruit serving if lunch was light before training",
      reduce: "Do not cut fruit first; trim optional fats before removing fruit",
    };
  }

  return {
    keep: "Use the listed carb portion",
    add: "Add one measured fruit or starch serving only if training feels under-fueled",
    reduce: "Trim optional calories first before cutting the main meal",
  };
}

function optionalCalorieTweakForRecipe(recipe: DietRecipe) {
  const text = recipeText(recipe);

  if (text.includes("olive oil") || text.includes(" oil")) return "Use spray or 0-5 g oil";
  if (text.includes("avocado")) return "Use 0-20 g avocado when tightening";
  if (text.includes("nuts")) return "Skip optional nuts when tightening";
  if (text.includes("jam")) return "Skip optional jam unless this is your protected pre-workout snack";
  if (text.includes("feta")) return "Skip optional feta or keep it to a measured 15 g";
  if (text.includes("hummus")) return "Use 30 g hummus instead of 60 g when tightening";
  if (text.includes("marinara") || text.includes("salsa") || text.includes("sauce")) {
    return "Use measured low-sugar sauce and do not add extra oil";
  }
  return "Do not add unlisted oils, sauces, nuts, or extra toppings";
}

function isProtectedPreWorkoutSnack(planDay: PlanDay, slot: DietMealSlot, recipe: DietRecipe) {
  return (
    slot === "snack" &&
    planDay.session.type !== "recovery"
  );
}

function smartPortionAdviceForMeal(
  planDay: PlanDay,
  slot: DietMealSlot,
  recipe: DietRecipe,
  coach: AdaptiveDietCoach,
  proteinReference: ProteinReference,
): SmartPortionAdvice {
  const protectedSnack = isProtectedPreWorkoutSnack(planDay, slot, recipe);
  const proteinEstimate = estimatedRecipeProteinGrams(recipe);
  const carbTweak = carbPortionTweakForRecipe(recipe);
  const optionalTweak = optionalCalorieTweakForRecipe(recipe);
  // One daily adjustment, not a separate cut at every meal. Lunch and dinner
  // surround the user's after-work training and remain protected.
  const adjustThisMeal = slot === "breakfast";
  const mealTone = coach.tone === "tighten" && !adjustThisMeal ? "hold" : coach.tone;
  const items: string[] = [];

  if (proteinReference.weight) {
    const dailyRange = dailyProteinRangeForWeight(proteinReference.weight);
    const mealTarget = mealProteinTargetForSlot(slot, proteinReference.weight);
    const estimatedText = proteinEstimate ? `about ${Math.round(proteinEstimate)} g` : "the listed";

    if (proteinEstimate !== null && proteinEstimate + 3 < mealTarget) {
      items.push(
        `Protein: ${proteinBoostForRecipe(
          recipe,
          slot,
        )} if needed toward ~${mealTarget} g. This is a small option, not a guarantee of meeting your ${dailyRange.low}-${dailyRange.high} g daily target; check the food label.`,
      );
    } else {
      items.push(
        `Protein: use the listed portion. It gives ${estimatedText} protein, which fits your ${dailyRange.low}-${dailyRange.high} g daily target from your ${proteinReference.label.toLowerCase()}.`,
      );
    }
  } else {
    items.push(
      "Protein: use the listed portion today. After a few Coach Hub weigh-ins, this line becomes a body-weight-based target.",
    );
  }

  if (protectedSnack) {
    items.push(
      "Carbs: Protect this pre-workout snack 60-120 minutes before lifting. Do not cut the banana, toast, oats, or other planned training carb first.",
    );
  } else if (coach.tone === "fuel" && adjustThisMeal) {
    items.push(`Carbs: ${carbTweak.add}.`);
  } else if (coach.tone === "tighten" && adjustThisMeal) {
    items.push(`Carbs: ${carbTweak.reduce}.`);
  } else if (dietDayTypeForPlanDay(planDay) === "recovery") {
    items.push(`Carbs: ${carbTweak.keep}; recovery days do not need extra starch.`);
  } else {
    items.push(`Carbs: ${carbTweak.keep}.`);
  }

  if (coach.tone === "tighten" && adjustThisMeal) {
    items.push(`Alternative: ${optionalTweak}. Choose this OR the carb change above, not both.`);
  } else if (coach.tone === "fuel") {
    items.push("Optional calories: keep fats and sauces measured, but do not remove planned training carbs today.");
  } else {
    items.push("Use the listed portions; optional ingredients remain your choice.");
  }

  if (coach.tone === "consistency") {
    items.push("Coach rule: finish the planned meal and workouts consistently before making the plate smaller.");
  }

  const title =
    mealTone === "fuel"
      ? "Fuel this meal"
      : mealTone === "tighten"
        ? "Tighten this plate"
        : coach.tone === "consistency"
          ? "Base plate first"
          : coach.tone === "logging"
            ? "Base portions"
            : "Hold portions";

  return {
    tone: mealTone,
    title,
    detail:
      mealTone === "tighten"
        ? "Small adjustment today: keep protein high and trim the easiest calories."
        : protectedSnack
          ? "This meal is protected because you usually train after work."
          : "Use this as the plate check for today.",
    items,
  };
}

// The to-buy list normalizes detailed recipe lines into useful grocery names. For example, several
// fruit portions become one "plan fruit" item instead of a noisy repeated list.
function shoppingIngredientFor(ingredient: string): { name: string; category: ShoppingCategory } {
  const lower = ingredient.toLowerCase();

  if (lower.includes("yogurt")) return { name: "Plain Greek yogurt", category: "Protein & dairy" };
  if (lower.includes("cottage")) return { name: "Cottage cheese", category: "Protein & dairy" };
  if (lower.includes("whey")) return { name: "Whey protein", category: "Protein & dairy" };
  if (lower.includes("egg whites")) return { name: "Liquid egg whites", category: "Protein & dairy" };
  if (lower.includes("eggs") || lower.includes("2 eggs")) return { name: "Eggs", category: "Protein & dairy" };
  if (lower.includes("chicken")) return { name: "Chicken breast or skinless chicken thighs", category: "Protein & dairy" };
  if (lower.includes("turkey")) return { name: "Extra-lean turkey", category: "Protein & dairy" };
  if (lower.includes("salmon")) return { name: "Salmon", category: "Protein & dairy" };
  if (lower.includes("white fish")) return { name: "White fish", category: "Protein & dairy" };
  if (lower.includes("tuna")) return { name: "Canned light tuna", category: "Protein & dairy" };
  if (lower.includes("tofu")) return { name: "Firm tofu", category: "Protein & dairy" };
  if (lower.includes("edamame")) return { name: "Shelled edamame", category: "Protein & dairy" };
  if (lower.includes("beef")) return { name: "Extra-lean beef", category: "Protein & dairy" };
  if (lower.includes("feta")) return { name: "Feta", category: "Protein & dairy" };
  if (lower.includes("milk")) return { name: "Milk", category: "Protein & dairy" };

  if (
    lower.includes("berries") ||
    lower.includes("banana") ||
    lower.includes("apple") ||
    lower.includes("orange") ||
    lower.includes("kiwi") ||
    lower.includes("pear") ||
    lower.includes("melon") ||
    lower.includes("citrus")
  ) {
    return { name: "Plan fruit: berries, bananas, apples, oranges, kiwi, pears, melon", category: "Produce" };
  }
  if (
    lower.includes("vegetables") ||
    lower.includes("peppers") ||
    lower.includes("spinach") ||
    lower.includes("tomatoes") ||
    lower.includes("mushrooms") ||
    lower.includes("zucchini") ||
    lower.includes("salad") ||
    lower.includes("cucumber") ||
    lower.includes("peas") ||
    lower.includes("carrots")
  ) {
    return { name: "Mixed vegetables and salad vegetables", category: "Produce" };
  }
  if (lower.includes("avocado")) return { name: "Avocado", category: "Produce" };

  if (lower.includes("oats")) return { name: "Oats", category: "Carbs" };
  if (lower.includes("muesli")) return { name: "Unsweetened muesli", category: "Carbs" };
  if (lower.includes("rice cakes")) return { name: "Rice cakes", category: "Carbs" };
  if (lower.includes("rice")) return { name: "Rice or brown rice", category: "Carbs" };
  if (lower.includes("quinoa")) return { name: "Quinoa", category: "Carbs" };
  if (lower.includes("pasta")) return { name: "Whole-grain pasta", category: "Carbs" };
  if (lower.includes("wrap")) return { name: "Whole-wheat wraps", category: "Carbs" };
  if (lower.includes("bread")) return { name: "Whole-grain bread", category: "Carbs" };
  if (lower.includes("potato")) return { name: "Potatoes and sweet potatoes", category: "Carbs" };
  if (lower.includes("crackers")) return { name: "Whole-grain crackers", category: "Carbs" };
  if (lower.includes("lentils")) return { name: "Lentils", category: "Carbs" };
  if (lower.includes("beans") || lower.includes("chickpeas")) return { name: "Beans and chickpeas", category: "Carbs" };

  if (lower.includes("chia")) return { name: "Chia seeds", category: "Pantry" };
  if (lower.includes("olive oil") || lower.includes("oil")) return { name: "Olive oil or spray oil", category: "Pantry" };
  if (lower.includes("salsa")) return { name: "Salsa", category: "Pantry" };
  if (lower.includes("jam")) return { name: "Jam", category: "Pantry" };
  if (lower.includes("cinnamon")) return { name: "Cinnamon", category: "Pantry" };
  if (lower.includes("mustard")) return { name: "Mustard", category: "Pantry" };
  if (lower.includes("hummus")) return { name: "Hummus", category: "Pantry" };
  if (lower.includes("marinara")) return { name: "Marinara", category: "Pantry" };
  if (lower.includes("curry")) return { name: "Light curry sauce", category: "Pantry" };
  if (lower.includes("nuts")) return { name: "Nuts", category: "Pantry" };
  if (lower.includes("sauce")) return { name: "Light sauces", category: "Pantry" };

  return { name: ingredient.replace(/^\d+(?:-\d+)?\s*(?:g|mL)?\s*/i, ""), category: "Pantry" };
}

// Shopping groups are generated from the active recipes for the selected week, including swaps.
// That way the list matches what the user actually plans to eat.
function shoppingItemsForRecipes(recipes: DietRecipe[]) {
  const itemMap = new Map<string, ShoppingItem>();

  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const item = shoppingIngredientFor(ingredient);
      const key = `${item.category}:${item.name}`;
      const existing = itemMap.get(key) ?? {
        name: item.name,
        category: item.category,
        portions: [],
        recipeNames: [],
      };

      if (!existing.portions.includes(ingredient)) existing.portions.push(ingredient);
      if (!existing.recipeNames.includes(recipe.shortTitle)) existing.recipeNames.push(recipe.shortTitle);
      itemMap.set(key, existing);
    });
  });

  return shoppingCategories
    .map((category) => ({
      category,
      items: [...itemMap.values()]
        .filter((item) => item.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.items.length > 0);
}

// Weekly averages use only logged mornings and report missing days. That is more honest than
// filling blanks with guesses and helps the user understand how reliable each comparison is.
function weightWeekSummary(planDays: PlanDay[], metrics: Record<string, MetricLog>, weekIndex: number): WeightWeekSummary {
  const days = planDays.slice(weekIndex * 7, weekIndex * 7 + 7);
  const loggedWeights = days
    .map((day) => weightKgFromMetric(normalizeMetricLogShape(metrics[day.iso])))
    .filter((weight): weight is number => weight !== null);
  const average =
    loggedWeights.length > 0
      ? loggedWeights.reduce((sum, weight) => sum + weight, 0) / loggedWeights.length
      : null;

  return {
    week: weekIndex + 1,
    startIso: days[0]?.iso ?? START_DATE,
    endIso: days[days.length - 1]?.iso ?? START_DATE,
    loggedDays: loggedWeights.length,
    missingDays: Math.max(0, days.length - loggedWeights.length),
    average,
  };
}

// The coach insight waits for two completed weeks because one or two scale readings can be noisy
// from water, salt, soreness, or late meals.
function weightComparisonInsight(previous: WeightWeekSummary | null, current: WeightWeekSummary | null) {
  if (!previous || !current) {
    return {
      tone: "locked",
      headline: "Weekly comparison unlocks after Week 2 is finished.",
      detail: "Keep logging morning weight in Coach Hub. The app will compare the first two full weeks once both weeks have passed.",
    };
  }

  if (previous.average === null || current.average === null || previous.loggedDays < 4 || current.loggedDays < 4) {
    return {
      tone: "waiting",
      headline: "Log at least 4 mornings in each week for a useful comparison.",
      detail: `Week ${previous.week}: ${previous.loggedDays}/7 logged. Week ${current.week}: ${current.loggedDays}/7 logged.`,
    };
  }

  const delta = current.average - previous.average;
  const absoluteDelta = Math.abs(delta);
  const direction = delta < 0 ? "down" : delta > 0 ? "up" : "unchanged";
  const missingTotal = previous.missingDays + current.missingDays;
  const reliability =
    missingTotal > 0
      ? ` Missing ${missingTotal} of 14 mornings, so the average uses logged days only.`
      : " All 14 mornings are logged, so this is a clean comparison.";
  const headline =
    absoluteDelta < 0.2
      ? "Average weight is basically steady."
      : `Average weight is ${direction} ${formatLoadValue(absoluteDelta)} kg.`;

  return {
    tone: delta < -0.2 ? "down" : delta > 0.2 ? "up" : "steady",
    headline,
    detail: `Week ${previous.week} averaged ${formatLoadValue(previous.average)} kg. Week ${current.week} averaged ${formatLoadValue(current.average)} kg.${reliability}`,
  };
}

// SVG charts need normalized x/y coordinates. This model converts kg entries into a viewBox path
// while adding padding so the highest and lowest dots do not sit on the chart edge.
function weightChartModel(entries: WeightEntry[]) {
  if (entries.length === 0) return null;

  const weights = entries.map((entry) => entry.weight);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const spread = Math.max(0.6, rawMax - rawMin);
  const min = rawMin - spread * 0.12;
  const max = rawMax + spread * 0.12;
  const range = Math.max(0.6, max - min);
  const elapsedDays = diffDays(entries[0].date, entries[entries.length - 1].date);
  const points = entries.map((entry) => {
    const x = elapsedDays === 0 ? 50 : (diffDays(entries[0].date, entry.date) / elapsedDays) * 100;
    const y = 64 - ((entry.weight - min) / range) * 52;

    return {
      ...entry,
      x,
      y,
    };
  });
  const first = entries[0];
  const last = entries[entries.length - 1];
  const delta = last.weight - first.weight;

  return {
    delta,
    highest: rawMax,
    lowest: rawMin,
    points,
    path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
    windowLabel: `${formatDate(first.date, "short")} - ${formatDate(last.date, "short")}`,
  };
}

// This copy turns raw weight data into a calmer coaching message. It pushes the user toward weekly
// averages and consistency instead of reacting emotionally to one high or low morning.
function weightMomentumCoach(
  entries: WeightEntry[],
  previous: WeightWeekSummary | null,
  current: WeightWeekSummary | null,
) {
  if (entries.length === 0) {
    return {
      headline: "Start with the first dot.",
      detail: "Log morning weight today. The trend chart becomes useful after several logged mornings, and the weekly comparison unlocks after two finished weeks.",
    };
  }

  if (entries.length < 4) {
    return {
      headline: "Good start. Build the signal.",
      detail: `You have ${entries.length} weigh-in${entries.length === 1 ? "" : "s"}. Aim for 4-7 morning logs per week so one random high or low day does not mess with your confidence.`,
    };
  }

  if (previous && current && previous.average !== null && current.average !== null &&
      previous.loggedDays >= 4 && current.loggedDays >= 4) {
    const delta = current.average - previous.average;
    const absDelta = Math.abs(delta);

    if (absDelta < 0.2) {
      return {
        headline: "Stable trend. Keep collecting data.",
        detail: "Your weekly average is nearly unchanged. That can be normal with new training, soreness, salt, or late meals. Follow the plan and judge the next full week.",
      };
    }

    if (delta < 0) {
      return {
        headline: "Your weight trend is moving down.",
        detail: `The latest completed weekly average is down ${formatLoadValue(absDelta)} kg. Keep meals measured, keep lifting, and avoid cutting food harder while performance feels good.`,
      };
    }

    return {
      headline: "Average is up. Check the context.",
      detail: `The latest completed weekly average is up ${formatLoadValue(absDelta)} kg. Review missed meals, weekend portions, sodium, sleep, and whether workouts caused soreness before changing the plan.`,
    };
  }

  const first = entries[0];
  const last = entries[entries.length - 1];
  const delta = last.weight - first.weight;
  const movementText =
    delta === 0
      ? "with no net change"
      : `${formatLoadValue(Math.abs(delta))} kg ${delta < 0 ? "down" : "up"}`;

  return {
    headline: "Trend is forming.",
    detail: `From ${formatDate(first.date, "short")} to ${formatDate(last.date, "short")}, scale weight moved ${movementText}. Keep focusing on weekly averages, not one-day noise.`,
  };
}

// Target and rest helpers are read by every workout view. Centralizing them means Today, Gym Mode,
// detail sheets, and the library always agree about what the user should do.
function targetForExercise(planDay: PlanDay, exercise: Exercise) {
  const week = coachingWeek(planDay);
  if (isRampWarmup(exercise)) return rampWarmupTarget(planDay, exercise);
  if (exercise.family === "warmup") return warmupTarget(planDay, exercise);
  if (exercise.family === "cardio") return cardioTarget(planDay, exercise);
  if (exercise.id === "dead-bug") {
    return `${week <= 4 ? "8 each side" : week <= 8 ? "8-10 each side" : "10-12 each side"} · ${rirTargetForWeek(week)}`;
  }
  if (planDay.session.title === "Strength C" && exercise.id === "leg-press") {
    return `${rangedTarget("10-15", week)} · ${rirTargetForWeek(week)}`;
  }
  return `${rangedTarget(exercise.reps, week)} · ${rirTargetForWeek(week)}`;
}

function progressionForExercise(planDay: PlanDay, exercise: Exercise) {
  const week = coachingWeek(planDay);
  if (exercise.family === "warmup") return warmupProgressionForExercise(planDay, exercise);
  if (exercise.family === "core") {
    return `${exercise.progression} Core training builds the abdominal muscles; nutrition and overall fat loss determine how visible they become. This app does not claim spot reduction.`;
  }
  if (isConsolidationWeek(week)) {
    return "Consolidation week: repeat or slightly reduce load, stop well before form breaks, and keep the next block fresh.";
  }
  if (week >= 5) {
    return `${exercise.progression} Use the double-progression rule: build toward the top of the rep range at the same weight, then add the smallest available load next time.`;
  }
  return `${exercise.progression} Month 1 is about learning the movement while keeping ${rirTargetForWeek(week)}.`;
}

// Only true strength/ramp rows ask for pounds. Warm-ups, cardio, and bodyweight moves become clean
// done buttons so the UI does not show unusable input placeholders.
function tracksWeight(exercise: Exercise) {
  return exercise.logType !== "done";
}

// Swaps are resolved at render time. The original exercise stays in the schedule, while the saved
// log says which replacement should currently be shown.
function activeExerciseFor(originalExercise: Exercise, log: DayLog) {
  const selectedSwapId = log.swaps?.[originalExercise.id];
  if (!selectedSwapId || !originalExercise.swapIds?.includes(selectedSwapId)) return originalExercise;
  return exerciseMap[selectedSwapId] ?? originalExercise;
}

function swapOptionsFor(exercise: Exercise) {
  return (exercise.swapIds ?? []).flatMap((id) => (exerciseMap[id] ? [exerciseMap[id]] : []));
}

function isSwappedExercise(originalExercise: Exercise, log: DayLog) {
  return activeExerciseFor(originalExercise, log).id !== originalExercise.id;
}

// Load parsing accepts simple entries like "45", "45 lb", or "45.5". This keeps logging relaxed
// while still letting the app calculate best loads and kg trends.
function parseLoadValue(value: string) {
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatLoadValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatLoggedWeightText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[a-z]/i.test(trimmed) ? trimmed : `${trimmed} lb`;
}

// Progress stats estimate cardio minutes from completed sessions. The values match the phase-scaled
// targets rather than simply trusting the static session labels.
function estimatedCardioMinutes(planDay: PlanDay) {
  return scheduledExercisesForDay(planDay).reduce((sum, exercise) => {
    const range = cardioMinutesRange(planDay, exercise);
    return range ? sum + Math.round((range[0] + range[1]) / 2) : sum;
  }, 0);
}

// Runtime guards are needed because localStorage and Supabase return unknown JSON. TypeScript can
// verify our code, but it cannot guarantee that saved browser data still has the expected shape.
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nowIso() {
  return new Date().toISOString();
}

function formatClock(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// normalizeStore is the main compatibility layer. It lets the app open older saves gracefully after
// new features are added, which matters for a PWA that users may keep installed for months.
function normalizeStore(value: unknown): TrackerStore | null {
  if (!isRecord(value)) return null;
  const days = isRecord(value.days)
    ? Object.entries(value.days).reduce<Record<string, DayLog>>((merged, [date, log]) => {
        merged[date] = normalizeDayLog(log as DayLog | undefined);
        return merged;
      }, {})
    : {};
  const dietDays = isRecord(value.dietDays)
    ? Object.entries(value.dietDays).reduce<Record<string, DietDayLog>>((merged, [date, log]) => {
        merged[date] = normalizeDietDayLog(log as DietDayLog | undefined);
        return merged;
      }, {})
    : {};
  const metrics = isRecord(value.metrics)
    ? Object.entries(value.metrics).reduce<Record<string, MetricLog>>((merged, [date, metric]) => {
        merged[date] = normalizeMetricLogShape(metric as MetricLog | undefined);
        return merged;
      }, {})
    : {};

  return {
    days,
    dietDays,
    metrics,
    settings: normalizeSettings(value.settings),
  };
}

// Local save is the first persistence layer. The app remains useful offline and then syncs when a
// Supabase session is available.
function loadStore(): TrackerStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyStore();
    return normalizeStore(JSON.parse(saved)) ?? emptyStore();
  } catch {
    return emptyStore();
  }
}

// Metadata is separated from the actual workout/diet data so sync timestamps can change without
// touching the user's visible progress.
function loadStoreMeta(): StoreMeta {
  if (typeof window === "undefined") return {};
  try {
    const saved = window.localStorage.getItem(STORAGE_META_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    return isRecord(parsed) ? (parsed as StoreMeta) : {};
  } catch {
    return {};
  }
}

function saveStoreMeta(meta: StoreMeta) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
  } catch {
    // The local save effect reports storage failures without crashing the tracker.
  }
}

function readStoredProgress(key: string) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? normalizeStore(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

function accountProgressKey(userId: string) { return `${STORAGE_KEY}:account:${userId}`; }
function syncBaseKey(userId: string) { return `${STORAGE_KEY}:baseline:${userId}`; }

function hasStoreData(store: TrackerStore) {
  return (
    Object.keys(store.days).length > 0 ||
    Object.keys(store.dietDays).length > 0 ||
    Object.keys(store.metrics).length > 0 ||
    store.settings.calorieMode !== "calculated"
  );
}

// Merge helpers prefer user-visible progress over blank or older data. This is intentionally
// conservative: a checked box or typed note should survive signing in on another device.
function mergeChecks(
  cloudChecks: Record<string, boolean> = {},
  localChecks: Record<string, boolean> = {},
) {
  const ids = new Set([...Object.keys(cloudChecks), ...Object.keys(localChecks)]);
  return [...ids].reduce<Record<string, boolean>>((merged, id) => {
    merged[id] = Boolean(localChecks[id] ?? cloudChecks[id]);
    return merged;
  }, {});
}

function mergeSwaps(
  cloudSwaps: Record<string, string> = {},
  localSwaps: Record<string, string> = {},
) {
  return {
    ...cloudSwaps,
    ...localSwaps,
  };
}

function mergeSkips(
  cloudSkips: Record<string, SkipReason> = {},
  localSkips: Record<string, SkipReason> = {},
) {
  return {
    ...cloudSkips,
    ...localSkips,
  };
}

function preferFilled(localValue = "", cloudValue = "") {
  return localValue.trim() ? localValue : cloudValue;
}

// Set rows merge by index because each row represents "set 1", "set 2", and so on. We preserve
// typed weights and checked states independently.
function mergeSetRows(cloudRows: SetLog[] = [], localRows: SetLog[] = []) {
  const rowCount = Math.max(cloudRows.length, localRows.length);
  return Array.from({ length: rowCount }, (_, index) => {
    const cloudRow = normalizeSetLogShape(cloudRows[index]);
    const localRow = normalizeSetLogShape(localRows[index]);
    return {
      weight: preferFilled(localRow.weight, cloudRow.weight),
      reps: preferFilled(localRow.reps, cloudRow.reps),
      effort: localRow.effort ?? cloudRow.effort,
      done: localRow.done || cloudRow.done,
    };
  });
}

function mergeDayLog(cloudLog: DayLog | undefined, localLog: DayLog | undefined) {
  if (!cloudLog) return normalizeDayLog(localLog);
  if (!localLog) return normalizeDayLog(cloudLog);

  const normalizedCloudLog = normalizeDayLog(cloudLog);
  const normalizedLocalLog = normalizeDayLog(localLog);

  const cloudExercises = normalizedCloudLog.exercises;
  const localExercises = normalizedLocalLog.exercises;
  const exerciseIds = new Set([
    ...Object.keys(cloudExercises),
    ...Object.keys(localExercises),
  ]);

  return {
    completed: normalizedLocalLog.completed || normalizedCloudLog.completed,
    daySkipReason: normalizedLocalLog.daySkipReason ?? normalizedCloudLog.daySkipReason,
    warmup: mergeChecks(normalizedCloudLog.warmup, normalizedLocalLog.warmup),
    tasks: mergeChecks(normalizedCloudLog.tasks, normalizedLocalLog.tasks),
    swaps: mergeSwaps(normalizedCloudLog.swaps, normalizedLocalLog.swaps),
    skips: mergeSkips(normalizedCloudLog.skips, normalizedLocalLog.skips),
    readiness: {
      ...normalizedCloudLog.readiness,
      ...normalizedLocalLog.readiness,
    },
    monthlyRecovery: normalizedLocalLog.monthlyRecovery ?? normalizedCloudLog.monthlyRecovery,
    exercises: [...exerciseIds].reduce<Record<string, SetLog[]>>((merged, id) => {
      merged[id] = mergeSetRows(cloudExercises[id], localExercises[id]);
      return merged;
    }, {}),
    notes: preferFilled(normalizedLocalLog.notes, normalizedCloudLog.notes),
  };
}

function mergeDietDayLog(cloudLog: DietDayLog | undefined, localLog: DietDayLog | undefined) {
  if (!cloudLog) return normalizeDietDayLog(localLog);
  if (!localLog) return normalizeDietDayLog(cloudLog);

  const normalizedCloudLog = normalizeDietDayLog(cloudLog);
  const normalizedLocalLog = normalizeDietDayLog(localLog);

  return withAutomaticDietCompletion({
    completed: normalizedLocalLog.completed || normalizedCloudLog.completed,
    meals: dietMealSlots.reduce<Record<DietMealSlot, boolean>>((merged, slot) => {
      merged[slot.id] = normalizedLocalLog.meals[slot.id] || normalizedCloudLog.meals[slot.id];
      return merged;
    }, createEmptyDietDay().meals),
    swaps: {
      ...normalizedCloudLog.swaps,
      ...normalizedLocalLog.swaps,
    },
    notes: preferFilled(normalizedLocalLog.notes, normalizedCloudLog.notes),
  });
}

function mergeMetricLog(metric: MetricLog | undefined, localMetric: MetricLog | undefined) {
  const normalizedCloudMetric = normalizeMetricLogShape(metric);
  const normalizedLocalMetric = normalizeMetricLogShape(localMetric);

  if (!metric) return normalizedLocalMetric;
  if (!localMetric) return normalizedCloudMetric;

  return {
    weight: preferFilled(normalizedLocalMetric.weight, normalizedCloudMetric.weight),
    weightKg: preferFilled(normalizedLocalMetric.weightKg, normalizedCloudMetric.weightKg),
    photoReminderDone:
      normalizedLocalMetric.photoReminderDone || normalizedCloudMetric.photoReminderDone,
    note: preferFilled(normalizedLocalMetric.note, normalizedCloudMetric.note),
  };
}

// Store merging happens once when an account loads. After that, normal autosave writes the unified
// result back to Supabase.
function mergeStores(localStore: TrackerStore, cloudStore: TrackerStore) {
  const dayIds = new Set([...Object.keys(cloudStore.days), ...Object.keys(localStore.days)]);
  const dietDayIds = new Set([
    ...Object.keys(cloudStore.dietDays),
    ...Object.keys(localStore.dietDays),
  ]);
  const metricIds = new Set([
    ...Object.keys(cloudStore.metrics),
    ...Object.keys(localStore.metrics),
  ]);

  return {
    days: [...dayIds].reduce<Record<string, DayLog>>((merged, id) => {
      merged[id] = mergeDayLog(cloudStore.days[id], localStore.days[id]);
      return merged;
    }, {}),
    dietDays: [...dietDayIds].reduce<Record<string, DietDayLog>>((merged, id) => {
      merged[id] = mergeDietDayLog(cloudStore.dietDays[id], localStore.dietDays[id]);
      return merged;
    }, {}),
    metrics: [...metricIds].reduce<Record<string, MetricLog>>((merged, id) => {
      merged[id] = mergeMetricLog(cloudStore.metrics[id], localStore.metrics[id]);
      return merged;
    }, {}),
    settings: {
      ...cloudStore.settings,
      ...localStore.settings,
    },
  };
}

// This prevents old local data from overwriting a newer cloud account unless the local copy has
// unsynced changes.
function shouldMergeLocalWithCloud(localStore: TrackerStore, cloudStore: TrackerStore, meta: StoreMeta) {
  if (!hasStoreData(localStore)) return false;
  if (!hasStoreData(cloudStore)) return true;
  if (!meta.lastCloudSyncedAt) return true;
  return Boolean(meta.localUpdatedAt && meta.localUpdatedAt > meta.lastCloudSyncedAt);
}

function chooseInitialSyncedStore(localStore: TrackerStore, cloudStore: TrackerStore, meta: StoreMeta) {
  return shouldMergeLocalWithCloud(localStore, cloudStore, meta)
    ? mergeStores(localStore, cloudStore)
    : cloudStore;
}

// Plans get harder across weeks, so saved exercises may suddenly need more rows. ensureSetRows adds
// the missing rows without deleting the pounds or checks already logged.
function ensureSetRows(existing: SetLog[] | undefined, count: number) {
  const rows = existing ? [...existing] : [];
  while (rows.length < count) rows.push(emptySet());
  return rows;
}

function youtubeUrl(id?: string) {
  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}

// YouTube thumbnails play inline through the privacy-enhanced youtube-nocookie domain. The separate
// external YouTube button still exists for users who prefer opening the YouTube app.
function youtubeEmbedUrl(id?: string) {
  return id
    ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
    : "";
}

// GIF URLs point at our own API route so the private WorkoutX key never appears in browser code.
function workoutXGifUrl(workoutXId?: string) {
  return workoutXId ? `/api/workoutx-gif?id=${encodeURIComponent(workoutXId)}` : "";
}

// Supabase stores one JSON document per user. That keeps the schema simple while Row Level Security
// still guarantees users can only access their own progress row.
async function fetchCloudStore(userId: string) {
  if (!supabase) return { store: emptyStore(), updatedAt: null };

  const { data, error } = await supabase
    .from("workout_progress")
    .select("data, updated_at")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0] as { data: unknown; updated_at: string } | undefined;
  return {
    store: normalizeStore(row?.data) ?? emptyStore(),
    updatedAt: row?.updated_at ?? null,
  };
}

async function upsertCloudStore(userId: string, store: TrackerStore, expectedUpdatedAt: string | null) {
  if (!supabase) return null;

  // Conditional updates are atomic: if another device saved after our read, no
  // row matches and the caller fetches/merges again. Existing RLS still applies.
  const result = expectedUpdatedAt === null
    ? await supabase.from("workout_progress").insert({ user_id: userId, data: store }).select("updated_at").maybeSingle()
    : await supabase.from("workout_progress").update({ data: store })
        .eq("user_id", userId).eq("updated_at", expectedUpdatedAt).select("updated_at").maybeSingle();
  const { data, error } = result;

  if (error?.code === "23505") return null; // A second device created the account row first.
  if (error) throw error;
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

// The app does not manually write 182 calendar entries. Instead, it generates them from START_DATE,
// PROGRAM_DAYS, and the weekly schedule so long plans remain easy to maintain.
function buildPlanDays(): PlanDay[] {
  return Array.from({ length: PROGRAM_DAYS }, (_, index) => {
    const iso = addDays(START_DATE, index);
    const actualName = dayName(iso);
    const planName = scheduleOrder[index % scheduleOrder.length];
    return {
      iso,
      index,
      week: Math.floor(index / 7) + 1,
      dayName: actualName,
      planDayName: planName,
      session: weeklySchedule[planName],
    };
  });
}

function completedStrengthSessionsBefore(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay) {
  return planDays
    .slice(0, selectedDay.index)
    .filter((day) => day.session.type === "strength")
    .filter((day) => normalizeDayLog(store.days[day.iso]).completed)
    .filter((day) => readinessStatusFor(normalizeDayLog(store.days[day.iso]).readiness) !== "red")
    .length;
}

function recoveryCapForNewBlock(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay) {
  const isFirstWeekOfBlock = selectedDay.week > 1 && (selectedDay.week - 1) % 4 === 0;
  if (!isFirstWeekOfBlock) return 26;

  const previousCheckpointIndex = (selectedDay.week - 1) * 7 - 1;
  const checkpointDay = planDays[previousCheckpointIndex];
  if (!checkpointDay) return 26;

  const checkpointRecovery = normalizeDayLog(store.days[checkpointDay.iso]).monthlyRecovery;
  return checkpointRecovery === "very-hard" ? selectedDay.week - 1 : 26;
}

function earnedTrainingWeekForDay(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay) {
  const completedStrength = completedStrengthSessionsBefore(planDays, store, selectedDay);
  const strengthSessionsNeededPerWeek =
    STRENGTH_SESSIONS_PER_WEEK * EARNED_WEEK_ADHERENCE_GATE;
  const earnedByAdherence = Math.floor(completedStrength / strengthSessionsNeededPerWeek) + 1;
  const recoveryCap = recoveryCapForNewBlock(planDays, store, selectedDay);
  return Math.max(1, Math.min(selectedDay.week, earnedByAdherence, recoveryCap, 26));
}

function trainingLevelCopy(calendarWeek: number, trainingWeek: number) {
  if (trainingWeek >= calendarWeek) {
    return `Training level is aligned with the calendar because you have earned at least ${Math.round(
      EARNED_WEEK_ADHERENCE_GATE * 100,
    )}% of the strength practice needed for this block.`;
  }
  return `Calendar is Week ${calendarWeek}, but targets use earned Training Week ${trainingWeek}. The app is holding volume until enough strength sessions are completed.`;
}

function monthWindowForWeek(week: number) {
  const month = trainingMonthForWeek(week);
  const startWeek = month === 7 ? 25 : (month - 1) * 4 + 1;
  const endWeek = month === 7 ? 26 : month * 4;
  return {
    month,
    startIndex: (startWeek - 1) * 7,
    endIndex: Math.min(PROGRAM_DAYS - 1, endWeek * 7 - 1),
  };
}

function monthlyCheckInForDay(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay) {
  const window = monthWindowForWeek(selectedDay.week);
  const days = planDays.slice(window.startIndex, window.endIndex + 1);
  const strengthDays = days.filter((day) => day.session.type === "strength");
  const cardioDays = days.filter((day) => day.session.type === "cardio");
  const completedStrength = strengthDays.filter((day) =>
    normalizeDayLog(store.days[day.iso]).completed,
  ).length;
  const completedCardio = cardioDays.filter((day) =>
    normalizeDayLog(store.days[day.iso]).completed,
  ).length;
  const checkpointDay = planDays[window.endIndex] ?? selectedDay;
  const checkpointMetric = normalizeMetricLogShape(store.metrics[checkpointDay.iso]);
  const firstWeek = weightWeekSummary(planDays, store.metrics, Math.floor(window.startIndex / 7));
  const lastWeek = weightWeekSummary(planDays, store.metrics, Math.floor(window.endIndex / 7));
  const recovery = normalizeDayLog(store.days[checkpointDay.iso]).monthlyRecovery;
  const completionRate = strengthDays.length
    ? Math.round((completedStrength / strengthDays.length) * 100)
    : 0;
  const isUnlocked = selectedDay.index >= checkpointDay.index;
  const recoveryAnswered = Boolean(recovery);
  const shouldProgress =
    completionRate >= 75 && recoveryAnswered && recovery !== "very-hard" && isUnlocked;

  return {
    ...window,
    checkpointDay,
    checkpointMetric,
    completedStrength,
    totalStrength: strengthDays.length,
    completedCardio,
    totalCardio: cardioDays.length,
    completionRate,
    firstWeek,
    lastWeek,
    recovery,
    recoveryAnswered,
    isUnlocked,
    shouldProgress,
  };
}

function bestLoadForExerciseBetween(
  planDays: PlanDay[],
  store: TrackerStore,
  exerciseId: string,
  startIndex: number,
  endIndex: number,
) {
  const loads = planDays
    .slice(startIndex, endIndex + 1)
    .flatMap((day) => normalizeDayLog(store.days[day.iso]).exercises[exerciseId] ?? [])
    .filter((row) => row.done)
    .map((row) => parseLoadValue(row.weight))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return loads.length ? Math.max(...loads) : null;
}

function longestCompletedCardioBetween(
  planDays: PlanDay[],
  store: TrackerStore,
  startIndex: number,
  endIndex: number,
) {
  const durations = planDays
    .slice(startIndex, endIndex + 1)
    .filter((day) => ["cardio", "movement"].includes(day.session.type))
    .filter((day) => normalizeDayLog(store.days[day.iso]).completed)
    .map((day) => estimatedCardioMinutes(withTrainingWeek(day, earnedTrainingWeekForDay(planDays, store, day))));

  return durations.length ? Math.max(...durations) : null;
}

// "Today" clamps to the program window. Before the plan starts, it shows Day 1; after the program
// ends, it shows the final day instead of crashing or returning nothing.
function closestProgramDate(now = new Date()) {
  const today = isoFromDate(now);
  const offset = diffDays(START_DATE, today);
  if (offset < 0) return START_DATE;
  if (offset >= PROGRAM_DAYS) return addDays(START_DATE, PROGRAM_DAYS - 1);
  return today;
}

// Gym's date is independent of calendar browsing. Never fall back to a selected
// preview day, which could give Gym a different log from the date on its header.
function resolveGymDay(planDays: PlanDay[], actualProgramDate: string) {
  return planDays.find((day) => day.iso === actualProgramDate) ?? planDays[0];
}

function familyLabel(family: Exercise["family"]) {
  return {
    legs: "Legs",
    push: "Push",
    pull: "Pull",
    hinge: "Hinge",
    core: "Core",
    arms: "Arms",
    warmup: "Warm-up",
    cardio: "Cardio",
  }[family];
}

// Location labels support the home-gym split. They teach which prep can happen upstairs and which
// work should happen downstairs near the equipment.
const locationLabels: Record<TrainingLocation, { label: string; detail: string }> = {
  upstairs: {
    label: "Upstairs OK",
    detail: "Good to do in your unit if you have clear floor space and head downstairs soon after.",
  },
  downstairs: {
    label: "Downstairs",
    detail: "Keep this in the home gym because it needs equipment or should happen right before lifting.",
  },
  "downstairs-outside": {
    label: "Downstairs/outside",
    detail: "Use the downstairs treadmill or an outdoor route for the planned cardio pace.",
  },
  either: {
    label: "Either",
    detail: "Can be done upstairs or downstairs; choose the option that keeps the session flowing.",
  },
};

function trainingLocationForExercise(exercise: Exercise): TrainingLocation {
  if (exercise.trainingLocation) return exercise.trainingLocation;
  if (exercise.family === "warmup") return "upstairs";
  if (exercise.family === "cardio") return "downstairs-outside";
  return "downstairs";
}

function locationGuideForExercise(exercise: Exercise) {
  const type = trainingLocationForExercise(exercise);
  return {
    type,
    label: locationLabels[type].label,
    detail: exercise.locationNote ?? locationLabels[type].detail,
  };
}

function locationFlowNoteForDay(planDay: PlanDay) {
  if (planDay.session.type === "strength") {
    return "Start with the Upstairs OK moves in your unit, then go downstairs for the treadmill warm-up, ramp sets, lifting, and treadmill finisher. After that, Either floor work can be upstairs or downstairs.";
  }

  if (planDay.session.type === "movement") {
    return "Mobility and bodyweight prep can be upstairs. Do the walking portion downstairs on the treadmill or outside.";
  }

  if (planDay.session.type === "cardio") {
    return "Use the downstairs treadmill or an outdoor route for the walking work.";
  }

  return "Recovery work can happen upstairs unless you choose an optional walk.";
}

function repRangeFromTarget(target: string) {
  if (/sec|min/i.test(target) && !/reps/i.test(target)) return null;
  const match = target.match(/(\d+)(?:-(\d+))?\s*(?:reps?|each|clean)?/i);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2] ?? match[1]);
  return {
    low,
    high,
  };
}

function formatPreviousSetSummary(rows: SetLog[]) {
  const firstWeight = rows.map((row) => row.weight.trim()).find(Boolean);
  const reps = rows.map((row) => row.reps.trim()).filter(Boolean);
  if (firstWeight && reps.length) return `${formatLoggedWeightText(firstWeight)} x ${reps.join(", ")}`;
  if (firstWeight) return formatLoggedWeightText(firstWeight);
  if (reps.length) return `${reps.join(", ")} reps`;
  return "logged work";
}

// Previous-load lookup powers the "what should I lift today?" hints. It scans backward from the
// selected day so each exercise can reference the user's own most recent log.
function lastExerciseLoad(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay, exerciseId: string) {
  for (let index = selectedDay.index - 1; index >= 0; index -= 1) {
    const day = planDays[index];
    const previousRows = normalizeDayLog(store.days[day.iso]).exercises[exerciseId] ?? [];
    const weights = previousRows
      .map((row) => row.weight.trim())
      .filter(Boolean);

    if (weights.length > 0 || previousRows.some((row) => row.reps.trim() || row.done || row.effort)) {
      const numericLoads = weights
        .map(parseLoadValue)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return {
        date: formatDate(day.iso, "short"),
        rows: previousRows,
        weights: weights.join(", "),
        summary: formatPreviousSetSummary(previousRows),
        maxLoad: numericLoads.length ? Math.max(...numericLoads) : null,
        allDone: previousRows.length > 0 && previousRows.every((row) => row.done),
      };
    }
  }

  return null;
}

function smartLoadSuggestion(
  planDays: PlanDay[],
  store: TrackerStore,
  selectedDay: PlanDay,
  exercise: Exercise,
  exerciseIndex: number,
) {
  const readiness = readinessStatusFor(normalizeDayLog(store.days[selectedDay.iso]).readiness);
  const setCount = recommendedSets(selectedDay, exercise, exerciseIndex, readiness);
  const target = targetForExercise(selectedDay, exercise);
  const repRange = repRangeFromTarget(target);

  if (!tracksWeight(exercise)) {
    return {
      label: "Complete clean",
      detail: `Do ${setCount} ${setCount === 1 ? "round" : "rounds"} at ${target}. Mark it done when form and pace stay controlled.`,
      tone: "steady",
    };
  }

  const previousLoad = lastExerciseLoad(planDays, store, selectedDay, exercise.id);

  if (!previousLoad) {
    return {
      label: "Start conservative",
      detail: `Choose pounds you can control for ${setCount} ${setCount === 1 ? "set" : "sets"} of ${target}. The first win is repeatable form with the planned RIR.`,
      tone: "start",
    };
  }

  if (isConsolidationWeek(coachingWeek(selectedDay)) && previousLoad.maxLoad) {
    const low = formatLoadValue(previousLoad.maxLoad * 0.85);
    const high = formatLoadValue(previousLoad.maxLoad * 0.9);
    return {
      label: "Consolidate",
      detail: `Last time: ${previousLoad.summary}. Use about ${low}-${high} lb or simply repeat with cleaner reps so the next block starts fresh.`,
      tone: "deload",
    };
  }

  if (previousLoad.rows.length < setCount) {
    return {
      label: "Earn the new set",
      detail: `Last time: ${previousLoad.summary} on ${previousLoad.date}. Repeat that load while you add the new set, then chase the top of the rep range before increasing pounds.`,
      tone: "steady",
    };
  }

  const rowsToJudge = previousLoad.rows.slice(0, setCount);
  const repValues = rowsToJudge
    .map((row) => parseLoadValue(row.reps))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const reachedTop =
    Boolean(repRange) &&
    previousLoad.allDone &&
    repValues.length >= Math.min(setCount, previousLoad.rows.length) &&
    repValues.every((reps) => reps >= (repRange?.high ?? reps));
  const hadVeryHard = rowsToJudge.some((row) => row.effort === "very-hard");
  const mostlyTooEasy =
    rowsToJudge.length > 0 && rowsToJudge.every((row) => row.effort === "too-easy");

  if (reachedTop && !hadVeryHard) {
    return {
      label: "Try the next jump",
      detail: `Last time: ${previousLoad.summary} on ${previousLoad.date}. You hit the top target, so try the smallest available increase if warm-ups feel smooth.`,
      tone: "build",
    };
  }

  if (repValues.length > 0 && repRange) {
    return {
      label: "Repeat and reach the top",
      detail: `Last time: ${previousLoad.summary} on ${previousLoad.date}. Keep that load and try to move all sets toward ${repRange.high} clean reps before increasing.`,
      tone: hadVeryHard ? "deload" : "steady",
    };
  }

  if (previousLoad.allDone && mostlyTooEasy) {
    return {
      label: "Possibly nudge up",
      detail: `Last time: ${previousLoad.summary} on ${previousLoad.date}. If today also feels too easy with clean form, use the smallest available increase next time.`,
      tone: "build",
    };
  }

  return {
    label: "Repeat and own it",
    detail: `Last time: ${previousLoad.summary} on ${previousLoad.date}. Repeat it before increasing, especially if a set was incomplete or very hard.`,
    tone: "steady",
  };
}

function beginnerTeachingForExercise(planDay: PlanDay, exercise: Exercise, suggestionLabel: string) {
  if (coachingWeek(planDay) > 4) return null;
  if (suggestionLabel === "Try the next jump") {
    return "You earned the first weight increase by completing the target reps with control. Increase by the smallest available jump only if the warm-up feels smooth.";
  }
  if (exercise.id === "leg-press") {
    return "Today is about learning the machine. Set the seat so your hips stay down, use your natural foot angle, and stop the set with 3-4 clean reps still available.";
  }
  if (exercise.id === "db-rdl" || exercise.id === "barbell-rdl") {
    return "The goal is learning the hip hinge, not proving strength. Keep the weight light enough that your back position and hamstring tension stay consistent.";
  }
  if (isRampWarmup(exercise)) {
    return "This is a practice set. Use lighter pounds than the working sets, rehearse the exact movement, and do not count this toward your working-set total.";
  }
  if (exercise.family === "warmup") {
    return "This should make the first working set feel better. Keep it easy, controlled, and pain-free.";
  }
  if (exercise.family === "core") {
    return "Treat core work like skill practice: controlled breathing, steady ribs and pelvis, and no rushing through the reps.";
  }
  if (tracksWeight(exercise)) {
    return `Use a conservative load. Month 1 is successful when you can repeat the movement with clean form and ${rirTargetForWeek(
      coachingWeek(planDay),
    )}.`;
  }
  return null;
}

function completedRows(rows: SetLog[]) {
  return rows.filter((row) => row.done).length;
}

function skipReasonForExercise(log: DayLog, originalExerciseId: string) {
  return log.skips[originalExerciseId] ?? log.daySkipReason ?? null;
}

/** Close only this workout day. Preserve completed sets, loads, notes, and swaps. */
function skipPlanDay(planDay: PlanDay, log: DayLog, reason: SkipReason): DayLog {
  const normalized = normalizeDayLog(log);
  if (isPlanDayComplete(planDay, normalized)) return normalized;
  return { ...normalized, completed: false, daySkipReason: reason };
}

/** Skip only the unfinished portion of a move; earlier sets still happened. */
function skipPlanMove(planDay: PlanDay, log: DayLog, originalExerciseId: string, reason: SkipReason): DayLog {
  const exercises = scheduledExercisesForDay(planDay, log);
  const index = exercises.findIndex((exercise) => exercise.id === originalExerciseId);
  if (index < 0 || moveStatusForExercise(planDay, log, exercises[index], index) === "done") return log;
  return withAutomaticDayCompletion(planDay, {
    ...log,
    completed: false,
    skips: { ...log.skips, [originalExerciseId]: reason },
  });
}

function reopenPlanDay(planDay: PlanDay, log: DayLog): DayLog {
  return withAutomaticDayCompletion(planDay, { ...normalizeDayLog(log), daySkipReason: undefined, completed: false });
}

/** Reopening one move should not silently reopen the rest of a skipped day. */
function reopenPlanMove(planDay: PlanDay, log: DayLog, originalExerciseId: string): DayLog {
  const skips = { ...log.skips };
  if (log.daySkipReason) {
    scheduledExercisesForDay(planDay, log).forEach((exercise, index) => {
      if (exercise.id !== originalExerciseId && moveStatusForExercise(planDay, log, exercise, index) !== "done") {
        skips[exercise.id] ??= log.daySkipReason!;
      }
    });
  }
  delete skips[originalExerciseId];
  return { ...log, daySkipReason: undefined, completed: false, skips };
}

// Move status is derived, not manually stored. That lets Today, Gym Mode, and Progress agree when
// a user completes all sets, skips a move, reopens it, or swaps it.
function moveStatusForExercise(
  planDay: PlanDay,
  log: DayLog,
  originalExercise: Exercise,
  exerciseIndex: number,
): MoveStatus {
  const activeExercise = activeExerciseFor(originalExercise, log);
  const setCount = recommendedSets(planDay, activeExercise, exerciseIndex, readinessStatusFor(log.readiness));
  const rows = ensureSetRows(log.exercises[activeExercise.id], setCount);
  if (rows.length > 0 && completedRows(rows) >= rows.length) return "done";
  if (skipReasonForExercise(log, originalExercise.id)) return "skipped";
  return "pending";
}

function areDayExercisesComplete(planDay: PlanDay, log: DayLog) {
  const exercises = scheduledExercisesForDay(planDay, log);
  const requiredExercises = exercises.filter(
    (exercise) => exercisePriorityFor(activeExerciseFor(exercise, log), planDay) !== "optional",
  );
  if (!requiredExercises.length) return false;

  return requiredExercises.every((originalExercise) => {
    const exerciseIndex = exercises.indexOf(originalExercise);
    return moveStatusForExercise(planDay, log, originalExercise, exerciseIndex) === "done";
  });
}

function dayStatusForDay(planDay: PlanDay, log: DayLog): DayStatus {
  if (log.daySkipReason) return "skipped";
  const exercises = scheduledExercisesForDay(planDay, log);
  if (!exercises.length) return log.completed ? "complete" : "incomplete";

  const statuses = exercises.map((exercise, index) =>
    ({
      priority: exercisePriorityFor(activeExerciseFor(exercise, log), planDay),
      status: moveStatusForExercise(planDay, log, exercise, index),
    }),
  );
  const requiredStatuses = statuses.filter((item) => item.priority !== "optional");
  const hasSkipped = requiredStatuses.some((item) => item.status === "skipped");
  const hasPending = requiredStatuses.some((item) => item.status === "pending");
  const everyDone = requiredStatuses.length > 0 && requiredStatuses.every((item) => item.status === "done");

  if (everyDone || (log.completed && !hasSkipped)) return "complete";
  if (hasSkipped && !hasPending) return "finished-with-skips";
  return "incomplete";
}

function withAutomaticDayCompletion(planDay: PlanDay, log: DayLog) {
  if (log.daySkipReason) return { ...log, completed: false };
  if (!planDay.session.exerciseIds.length) {
    const allTasksDone =
      planDay.session.tasks.length > 0 &&
      planDay.session.tasks.every((task) => Boolean(log.tasks[task]));
    return {
      ...log,
      completed: planDay.session.tasks.length > 0 ? allTasksDone : log.completed,
    };
  }
  return {
    ...log,
    completed: areDayExercisesComplete(planDay, log),
  };
}

function isPlanDayComplete(planDay: PlanDay, log: DayLog) {
  return dayStatusForDay(planDay, log) === "complete";
}

// "Mark Complete" intentionally fills every move and task for that day. This keeps the top-level
// day status and per-move checkmarks synchronized in both Today and Gym Mode.
function completePlanDay(planDay: PlanDay, log: DayLog) {
  const normalizedLog = normalizeDayLog(log);
  const exercises = scheduledExercisesForDay(planDay, normalizedLog);
  const nextExercises = { ...normalizedLog.exercises };
  const nextSkips = { ...normalizedLog.skips };
  const nextTasks = planDay.session.tasks.reduce<Record<string, boolean>>(
    (tasks, task) => ({
      ...tasks,
      [task]: true,
    }),
    { ...normalizedLog.tasks },
  );

  exercises.forEach((originalExercise, exerciseIndex) => {
    const activeExercise = activeExerciseFor(originalExercise, normalizedLog);
    const setCount = Math.max(
      recommendedSets(planDay, activeExercise, exerciseIndex, readinessStatusFor(normalizedLog.readiness)),
      normalizedLog.exercises[activeExercise.id]?.length ?? 0,
    );
    nextExercises[activeExercise.id] = ensureSetRows(
      normalizedLog.exercises[activeExercise.id],
      setCount,
    ).map((row) => ({
      ...row,
      done: true,
    }));
    delete nextSkips[originalExercise.id];
  });

  return {
    ...normalizedLog,
    daySkipReason: undefined,
    completed: true,
    tasks: nextTasks,
    skips: nextSkips,
    exercises: nextExercises,
  };
}

function dayStatusLabel(status: DayStatus) {
  return {
    incomplete: "Incomplete",
    complete: "Complete",
    "finished-with-skips": "Finished with skips",
    skipped: "Day skipped",
  }[status];
}

// Gym Mode should begin where the user actually needs attention, not always at exercise one.
function firstUnfinishedMoveIndex(moves: Array<{ isComplete: boolean; isSkipped: boolean }>) {
  const firstOpenIndex = moves.findIndex((move) => !move.isComplete && !move.isSkipped);
  return firstOpenIndex >= 0 ? firstOpenIndex : 0;
}

function nextUnfinishedMoveIndex(
  moves: Array<{ isComplete: boolean; isSkipped: boolean }>,
  currentIndex: number,
  direction: "previous" | "next",
) {
  const step = direction === "next" ? 1 : -1;

  for (
    let index = currentIndex + step;
    index >= 0 && index < moves.length;
    index += step
  ) {
    if (!moves[index].isComplete && !moves[index].isSkipped) return index;
  }

  return currentIndex;
}

function ExerciseMedia({
  exercise,
  variant,
}: {
  exercise: Exercise;
  variant: "gym" | "thumb" | "library";
}) {
  // Media starts with inline YouTube because it is the most reliable free demo source. GIFs are
  // user-triggered so the page does not waste mobile data loading every animation at once.
  const [showGif, setShowGif] = useState(false);
  const [gifFailed, setGifFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  useEffect(() => {
    setShowGif(false);
    setGifFailed(false);
    setVideoPlaying(false);
  }, [exercise.id]);
  const demo = exercise.motionDemo;
  const canShowGif = Boolean(demo && !gifFailed);
  const isShowingGif = Boolean(canShowGif && showGif);
  const className = `exercise-media exercise-media-${variant} ${
    isShowingGif ? "has-gif" : exercise.youtubeId ? "has-video" : "placeholder"
  }`;

  return (
    <div
      className={`exercise-media-shell exercise-media-shell-${variant} ${
        isShowingGif ? "showing-gif" : "showing-video"
      }`}
    >
      {isShowingGif && demo ? (
        <div className={className}>
          <img
            className="exercise-gif"
            src={workoutXGifUrl(demo.workoutXId)}
            alt={`${exercise.name}: ${demo.label} animated demonstration`}
            loading={variant === "gym" ? "eager" : "lazy"}
            decoding="async"
            onError={() => {
              setGifFailed(true);
              setShowGif(false);
            }}
          />
        </div>
      ) : exercise.youtubeId ? (
        <div className={className}>
          {videoPlaying ? <iframe
            title={`${exercise.name} YouTube demo`}
            src={`${youtubeEmbedUrl(exercise.youtubeId)}&autoplay=1`}
            loading={variant === "gym" ? "eager" : "lazy"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          /> : (
            <button className="video-poster" type="button"
              aria-label={`Play ${exercise.name} video here`}
              onClick={() => setVideoPlaying(true)}>
              <img src={`https://i.ytimg.com/vi/${exercise.youtubeId}/hqdefault.jpg`}
                alt="" loading="lazy" decoding="async" />
              <span className="video-play-icon"><Icon name="play" size={28} /></span>
            </button>
          )}
        </div>
      ) : (
        <div className={className}>
          <span className="motion-badge">Guide</span>
        </div>
      )}

      {canShowGif && demo && (
        <div className="gif-controls">
          <button
            className={`gif-toggle-button ${isShowingGif ? "active" : ""}`}
            type="button"
            onClick={() => setShowGif((current) => !current)}
            aria-pressed={isShowingGif}
          >
            <Icon name={isShowingGif ? "video" : "activity"} size={14} />
            {isShowingGif ? (exercise.youtubeId ? "Show YouTube" : "Hide GIF") : "Show GIF"}
          </button>
          <span>{demo.match === "exact" ? "Exact demo" : "Reference demo"}</span>
        </div>
      )}
    </div>
  );
}

function ExerciseMediaLinks({
  exercise,
  compact = false,
}: {
  exercise: Exercise;
  compact?: boolean;
}) {
  if (!exercise.youtubeId) return null;

  return (
    <div className={`media-actions ${compact ? "compact-media-actions" : ""}`}>
      <a href={youtubeUrl(exercise.youtubeId)} target="_blank" rel="noreferrer">
        <Icon name="video" size={14} /> YouTube
      </a>
    </div>
  );
}

// The test suite uses the same calculations as the interface, exercising complete
// 26-week plans and saved progress without duplicating the coaching logic.
export {
  buildPlanDays, emptyStore, normalizeDayLog, normalizeStore, completePlanDay,
  withTrainingWeek, earnedTrainingWeekForDay, scheduledExercisesForDay,
  recommendedSets, targetForExercise, dayStatusForDay, firstUnfinishedMoveIndex,
  nextUnfinishedMoveIndex, proteinReferenceFromMetrics, weightTrendSignalFor,
  adaptiveDietCoachForDay, recentTrainingAdherenceFor, weightChartModel,
  weightKgFromMetric, smartPortionAdviceForMeal, baseDietRecipeFor, smartLoadSuggestion,
  closestProgramDate, resolveGymDay, skipPlanDay, skipPlanMove, reopenPlanDay, reopenPlanMove,
  moveStatusForExercise, withAutomaticDayCompletion, isPlanDayComplete,
};

export default function Home() {
  // Build the full calendar once. The plan is deterministic, so recalculating it on every render
  // would only make the component harder to reason about.
  const planDays = useMemo(buildPlanDays, []);

  // There are three day concepts on purpose:
  // currentProgramDate is the real "today" inside the program window,
  // selectedDate is the browsable workout day in Today/Week/Progress/Library,
  // selectedDietDate is the browsable diet day.
  const [currentProgramDate, setCurrentProgramDate] = useState(() => closestProgramDate());
  const [selectedDate, setSelectedDate] = useState(() => closestProgramDate());
  const [store, setStore] = useState<TrackerStore>(() => loadStore());
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [localSaveError, setLocalSaveError] = useState("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [syncRevision, setSyncRevision] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    supabaseConfigError ? "error" : isSupabaseConfigured ? "signed-out" : "local-only",
  );
  const [cloudError, setCloudError] = useState(supabaseConfigError);
  const [cloudReadyForUser, setCloudReadyForUser] = useState<string | null>(null);
  const [lastCloudSyncedAt, setLastCloudSyncedAt] = useState<string | null>(
    () => formatClock(loadStoreMeta().lastCloudSyncedAt),
  );
  const [appMode, setAppMode] = useState<AppMode>("hub");
  const [activeSection, setActiveSection] = useState<AppSection>("today");
  const [selectedDietDate, setSelectedDietDate] = useState(() => closestProgramDate());
  const [openDietSwapSlot, setOpenDietSwapSlot] = useState<DietMealSlot | null>(null);
  const [openDietHowToSlot, setOpenDietHowToSlot] = useState<DietMealSlot | null>(null);
  const [gymExerciseIndex, setGymExerciseIndex] = useState(0);
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [skipRequest, setSkipRequest] = useState<SkipRequest | null>(null);
  const [gymStartedAt, setGymStartedAt] = useState<number | null>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [restTimer, setRestTimer] = useState<{
    endAt: number;
    totalSeconds: number;
    label: string;
  } | null>(null);
  const [initialSyncBaseline] = useState(() => {
    const userId = loadStoreMeta().lastUserId;
    return { userId, store: userId ? readStoredProgress(syncBaseKey(userId)) : null };
  });
  const latestStoreRef = useRef(store);
  // Each open tab retains its own last accepted baseline. Reading a shared
  // localStorage baseline on every save could mistake another tab's work for
  // deletions made by this tab.
  const syncBaselineRef = useRef(initialSyncBaseline);
  const lastAutoAlignedDateRef = useRef(currentProgramDate);
  const firstLocalSaveRef = useRef(true);
  const suppressLocalChangeMetaRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const cloudQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // On iPhone Home Screen apps, the app may stay suspended overnight. When it wakes or regains
    // focus, this effect realigns the landing day to the current program date.
    setIsHydrated(true);

    const alignWithCurrentProgramDate = () => {
      const nextProgramDate = closestProgramDate();
      setCurrentProgramDate(nextProgramDate);
      if (lastAutoAlignedDateRef.current === nextProgramDate) return;

      lastAutoAlignedDateRef.current = nextProgramDate;
      setSelectedDate(nextProgramDate);
      setSelectedDietDate(nextProgramDate);
      setActiveSection("today");
    };

    const alignWhenVisible = () => {
      if (document.visibilityState === "visible") alignWithCurrentProgramDate();
    };

    window.addEventListener("focus", alignWithCurrentProgramDate);
    document.addEventListener("visibilitychange", alignWhenVisible);
    const dayTimer = window.setInterval(alignWithCurrentProgramDate, 60_000);

    return () => {
      window.removeEventListener("focus", alignWithCurrentProgramDate);
      document.removeEventListener("visibilitychange", alignWhenVisible);
      window.clearInterval(dayTimer);
    };
  }, []);

  useEffect(() => {
    // Changing the browsed workout day should close detail UI from the previous day so the user
    // never edits the wrong set by accident.
    setDetailExerciseId(null);
    setSkipRequest(null);
  }, [selectedDate]);

  useEffect(() => {
    // Diet panels are day-specific. Closing them on day change avoids showing a swap panel for the
    // previous day's recipe.
    setOpenDietSwapSlot(null);
    setOpenDietHowToSlot(null);
  }, [selectedDietDate]);

  useEffect(() => {
    // Modal sheets lock background scrolling and support Escape on desktop. Mobile users get the
    // same close behavior through visible close buttons.
    if ((!detailExerciseId && !skipRequest) || typeof window === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>(skipRequest ? ".skip-sheet" : ".detail-sheet");
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, iframe, [tabindex="0"]',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      setDetailExerciseId(null);
      setSkipRequest(null);
    };

    document.body.style.overflow = "hidden";
    focusable()[0]?.focus({ preventScroll: true });
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailExerciseId, skipRequest]);

  useEffect(() => {
    // Keep a ref pointing at the newest store so delayed async callbacks save the latest state,
    // not the state that existed when the timeout or request was created.
    latestStoreRef.current = store;
  }, [store]);

  useEffect(() => {
    // Every change saves to localStorage first. This makes the app resilient in gyms with spotty
    // reception and lets Supabase sync happen as an enhancement rather than a hard dependency.
    if (!isHydrated) return;
    const savedAt = nowIso();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      const owner = loadStoreMeta().lastUserId;
      if (owner) window.localStorage.setItem(accountProgressKey(owner), JSON.stringify(store));
      setLocalSaveError("");
    } catch {
      setLocalSaveError("Device saving is unavailable. Keep this screen open until cloud sync succeeds, and check your browser storage.");
      return;
    }

    if (firstLocalSaveRef.current) {
      firstLocalSaveRef.current = false;
    } else if (suppressLocalChangeMetaRef.current) {
      suppressLocalChangeMetaRef.current = false;
    } else {
      const nextMeta = { ...loadStoreMeta(), localUpdatedAt: savedAt };
      saveStoreMeta(nextMeta);
    }

    setLastSavedAt(formatClock(savedAt));
  }, [isHydrated, store]);

  useEffect(() => {
    // This effect owns Supabase auth session discovery. The app can render without Supabase, but if
    // config is present it listens for sign-in/sign-out and lets the sync effects react.
    if (supabaseConfigError) {
      setCloudStatus("error");
      setCloudError(supabaseConfigError);
      return;
    }

    if (!supabase) return;

    let isMounted = true;
    let receivedAuthEvent = false;

    const acceptSession = (nextSession: Session | null) => {
      if (!isMounted) return;
      const nextId = nextSession?.user.id ?? null;
      const changedAccount = activeUserIdRef.current !== nextId;
      activeUserIdRef.current = nextId;
      if (nextId && changedAccount) {
        const meta = loadStoreMeta();
        if (syncBaselineRef.current.userId !== nextId) {
          syncBaselineRef.current = { userId: nextId, store: readStoredProgress(syncBaseKey(nextId)) };
        }
        if (!canClaimLocalProgress(meta.lastUserId, nextId)) {
          try {
            // Preserve a pre-upgrade account copy before replacing the shared
            // display store. A failed backup must not upload it to another user.
            window.localStorage.setItem(accountProgressKey(meta.lastUserId!), JSON.stringify(latestStoreRef.current));
          } catch {
            activeUserIdRef.current = null;
            setCloudStatus("error");
            setCloudError("Could not preserve the previous account's device copy. Check browser storage before switching accounts.");
            return;
          }
          const accountStore = readStoredProgress(accountProgressKey(nextId)) ?? emptyStore();
          latestStoreRef.current = accountStore;
          setStore(accountStore);
        }
        saveStoreMeta(canClaimLocalProgress(meta.lastUserId, nextId)
          ? { ...meta, lastUserId: nextId } : { lastUserId: nextId });
      }
      setSession(nextSession);
      // TOKEN_REFRESHED is the same account: resetting cloud readiness here used
      // to disable autosave until a full reload.
      if (changedAccount) {
        setCloudReadyForUser(null);
        setCloudError("");
        setCloudStatus(nextSession ? "loading" : "signed-out");
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted || receivedAuthEvent) return;
      if (error) {
        setCloudStatus("error");
        setCloudError(error.message);
        return;
      }
      acceptSession(data.session);
    }).catch((error: unknown) => {
      if (!isMounted) return;
      setCloudStatus("error");
      setCloudError(error instanceof Error ? error.message : "Could not restore sign-in. Try signing in again.");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      acceptSession(nextSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Debounce typing, then serialize reads and writes. Every save checks the
    // server revision and merges against the last synced baseline for this user.
    if (!supabase || !session?.user.id || !isHydrated) return;
    const userId = session.user.id;
    if (navigator.onLine) setCloudStatus(cloudReadyForUser === userId ? "saving" : "loading");
    let isCancelled = false;
    const isCurrent = () => !isCancelled && activeUserIdRef.current === userId;
    const timer = window.setTimeout(() => {
      cloudQueueRef.current = cloudQueueRef.current.then(async () => {
      if (!isCurrent() || !navigator.onLine) return;
      setCloudStatus(cloudReadyForUser === userId ? "saving" : "loading");
      setCloudError("");
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const { store: cloudStore, updatedAt } = await fetchCloudStore(userId);
          if (!isCurrent()) return;
          const localStore = latestStoreRef.current;
          const baseline = syncBaselineRef.current.userId === userId ? syncBaselineRef.current.store : null;
          const nextStore = baseline
            ? mergeProgressChanges(baseline, localStore, cloudStore)
            : chooseInitialSyncedStore(localStore, cloudStore, loadStoreMeta());
          const cloudUpdatedAt = sameData(nextStore, cloudStore) && updatedAt
            ? updatedAt : await upsertCloudStore(userId, nextStore, updatedAt);
          if (activeUserIdRef.current !== userId) return;
          if (!cloudUpdatedAt) continue;

          // A user may clear or change a field while this write is in flight.
          // Record what actually reached the server, then rebase those newer
          // edits onto it. Discarding the response would resurrect cleared data
          // on the next read because the old baseline would still look unchanged.
          const withPendingEdits = mergeProgressChanges(localStore, latestStoreRef.current, nextStore);
          const hasPendingEdits = !sameData(withPendingEdits, nextStore);
          syncBaselineRef.current = { userId, store: nextStore };
          if (!sameData(latestStoreRef.current, withPendingEdits)) {
            suppressLocalChangeMetaRef.current = true;
            latestStoreRef.current = withPendingEdits;
            setStore(withPendingEdits);
          }
          window.localStorage.setItem(syncBaseKey(userId), JSON.stringify(nextStore));
          const syncedAt = nowIso();
          saveStoreMeta({ ...loadStoreMeta(), cloudUpdatedAt, lastCloudSyncedAt: syncedAt, lastUserId: userId });
          setLastCloudSyncedAt(formatClock(syncedAt));
          setCloudReadyForUser(userId);
          setCloudStatus(hasPendingEdits ? "saving" : "synced");
          return;
        }
        throw new Error("Another device is saving. Your changes are kept locally; retry sync in a moment.");
      } catch (error) {
        if (!isCurrent()) return;
        setCloudStatus("error");
        setCloudError(error instanceof Error ? error.message : "Cloud sync failed.");
      }
      });
    }, 700);
    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [isHydrated, session?.user.id, store, syncRevision]);

  useEffect(() => {
    const refresh = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine && document.visibilityState === "visible") setSyncRevision((value) => value + 1);
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    // Refresh while visible to pick up progress saved on a second device.
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    // The custom service worker makes the installed PWA refresh itself after deploys. Without this,
    // iPhone Home Screen apps can keep serving an old bundle and look broken after an update.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      let shouldReloadForUpdate = true;

      const reloadOnceForUpdate = (version: string) => {
        if (!shouldReloadForUpdate) return;
        const key = "recomp-gym-console-sw-refresh";
        try {
          if (window.sessionStorage.getItem(key) === version) return;
          window.sessionStorage.setItem(key, version);
        } catch {
          return; // Avoid an automatic reload loop when browser storage is blocked.
        }
        shouldReloadForUpdate = false;
        window.location.reload();
      };
      const reloadForController = () => reloadOnceForUpdate("controller");
      const reloadForVersion = (event: MessageEvent) => {
        if (event.data?.type === "APP_UPDATED" && typeof event.data.version === "string") {
          reloadOnceForUpdate(event.data.version);
        }
      };

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          void registration.update();

          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                installingWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => undefined);

      navigator.serviceWorker.addEventListener("controllerchange", reloadForController);
      navigator.serviceWorker.addEventListener("message", reloadForVersion);

      return () => {
        shouldReloadForUpdate = false;
        navigator.serviceWorker.removeEventListener("controllerchange", reloadForController);
        navigator.serviceWorker.removeEventListener("message", reloadForVersion);
      };
    }

    return undefined;
  }, []);

  useEffect(() => {
    // Timers are intentionally React-only UI state. They should feel live in Gym Mode, but there is
    // no value in syncing a countdown to Supabase.
    if (!gymStartedAt && !restTimer) return undefined;
    const timerId = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [gymStartedAt, restTimer]);

  // Derived state turns raw saves into the exact view model the UI needs. The render below can stay
  // declarative because all date selection, active swaps, phase targets, and progress percentages
  // are prepared here first.
  const selectedDay =
    planDays.find((day) => day.iso === selectedDate) ?? planDays[0];
  const gymDay = resolveGymDay(planDays, currentProgramDate);
  const selectedDietDay =
    planDays.find((day) => day.iso === selectedDietDate) ?? gymDay;
  const selectedLog = normalizeDayLog(store.days[selectedDay.iso]);
  const gymLog = normalizeDayLog(store.days[gymDay.iso]);
  const selectedDietLog = normalizeDietDayLog(store.dietDays[selectedDietDay.iso]);
  const currentProgramMetric = normalizeMetricLogShape(store.metrics[currentProgramDate]);
  const coachedPlanDays = useMemo(() => planDays.map((day) =>
    withTrainingWeek(day, earnedTrainingWeekForDay(planDays, store, day))), [planDays, store.days]);
  const coachedPlanDayFor = useCallback((day: PlanDay) => coachedPlanDays[day.index], [coachedPlanDays]);
  const selectedTrainingWeek = coachingWeek(coachedPlanDayFor(selectedDay));
  const gymTrainingWeek = coachingWeek(coachedPlanDayFor(gymDay));
  const selectedCoachDay = withTrainingWeek(selectedDay, selectedTrainingWeek);
  const gymCoachDay = withTrainingWeek(gymDay, gymTrainingWeek);
  const selectedReadinessStatus = readinessStatusFor(selectedLog.readiness);
  const gymReadinessStatus = readinessStatusFor(gymLog.readiness);
  const selectedReadinessCopy = readinessCopy(selectedReadinessStatus);
  const gymReadinessCopy = readinessCopy(gymReadinessStatus);
  const phase = phaseForWeek(selectedTrainingWeek);
  const gymPhase = phaseForWeek(gymTrainingWeek);
  const selectedSessionTime = sessionTimeForDay(selectedCoachDay, selectedLog);
  const selectedSessionTimeDetail = sessionTimeDetailForDay(selectedCoachDay, selectedLog);
  const selectedSessionSummary = sessionSummaryForDay(selectedCoachDay);
  const selectedLocationNote = locationFlowNoteForDay(selectedCoachDay);
  const selectedDietType = dietDayTypeForPlanDay(selectedDietDay);
  const proteinReference = useMemo(() => proteinReferenceFromMetrics(planDays, store.metrics, gymDay.index),
    [planDays, store.metrics, gymDay.index]);
  const selectedDietTarget = personalizedDietTarget(
    selectedDietType,
    store.settings,
    proteinReference.weight,
  );
  const gymDietType = dietDayTypeForPlanDay(gymDay);
  const gymDietTarget = personalizedDietTarget(
    gymDietType,
    store.settings,
    proteinReference.weight,
  );
  const selectedDietCoachNote = dietCoachNoteForDay(selectedDietDay);
  const selectedDietAccent = selectedDietDay.session.accent;
  const selectedDietWorkoutLog = normalizeDayLog(store.days[selectedDietDay.iso]);
  const selectedDietReadinessStatus = readinessStatusFor(selectedDietWorkoutLog.readiness);
  const dietAnalysisIndex = Math.min(selectedDietDay.index, gymDay.index);
  const adaptiveDietCoach = useMemo(() => adaptiveDietCoachForDay({
    planDays,
    store,
    planDay: selectedDietDay,
    proteinReference,
    readinessStatus: selectedDietReadinessStatus,
    analysisIndex: dietAnalysisIndex,
  }), [planDays, store.days, store.metrics, store.settings, selectedDietDay, proteinReference, selectedDietReadinessStatus, dietAnalysisIndex]);
  const selectedExercises = scheduledExercisesForDay(selectedCoachDay, selectedLog);
  const gymExercises = scheduledExercisesForDay(gymCoachDay, gymLog);
  const selectedDayStatus = dayStatusForDay(selectedCoachDay, selectedLog);
  const gymDayStatus = dayStatusForDay(gymCoachDay, gymLog);
  const selectedDayComplete = selectedDayStatus === "complete";
  const selectedDayStatusText = dayStatusLabel(selectedDayStatus);
  const selectedCompletionButtonLabel =
    selectedDayStatus === "complete" ? "Completed" : "Mark Complete";
  const gymSessionSummary = sessionSummaryForDay(gymCoachDay);
  const gymSessionTime = sessionTimeForDay(gymCoachDay, gymLog);
  const gymSessionTimeDetail = sessionTimeDetailForDay(gymCoachDay, gymLog);
  const gymElapsedSeconds = gymStartedAt ? Math.round((timerNow - gymStartedAt) / 1000) : 0;
  const restSecondsLeft = restTimer
    ? Math.max(0, Math.ceil((restTimer.endAt - timerNow) / 1000))
    : 0;
  const restProgressPercent = restTimer
    ? Math.max(0, Math.min(100, Math.round((restSecondsLeft / restTimer.totalSeconds) * 100)))
    : 0;
  const currentWeekStartIndex = Math.floor(selectedDay.index / 7) * 7;
  const currentWeekDays = planDays.slice(currentWeekStartIndex, currentWeekStartIndex + 7);
  const selectedWeekStart = planDays[currentWeekStartIndex]?.iso ?? selectedDay.iso;
  const dietWeekStartIndex = Math.floor(selectedDietDay.index / 7) * 7;
  const currentDietWeekDays = useMemo(() => planDays.slice(dietWeekStartIndex, dietWeekStartIndex + 7),
    [planDays, dietWeekStartIndex]);
  const selectedDietWeekStart = planDays[dietWeekStartIndex]?.iso ?? selectedDietDay.iso;
  const weekOptions = useMemo(
    () =>
      Array.from({ length: Math.ceil(PROGRAM_DAYS / 7) }, (_, weekIndex) => {
        const firstDay = planDays[weekIndex * 7];
        const lastDay = planDays[Math.min(weekIndex * 7 + 6, planDays.length - 1)];
        return {
          value: firstDay.iso,
          label: `Week ${weekIndex + 1}`,
          detail: `${formatDate(firstDay.iso, "short")} - ${formatDate(lastDay.iso, "short")}`,
        };
      }),
    [planDays],
  );
  const dietMealRows = dietMealSlots.map((slot) => {
    const baseRecipe = baseDietRecipeFor(selectedDietDay, slot.id);
    const activeRecipe = activeDietRecipeFor(selectedDietDay, selectedDietLog, slot.id);
    return {
      slot: slot.id,
      label: slot.label,
      timing: dietTimingForSlot(selectedDietDay, slot.id),
      baseRecipe,
      recipe: activeRecipe,
      portionAdvice: smartPortionAdviceForMeal(
        selectedDietDay,
        slot.id,
        activeRecipe,
        adaptiveDietCoach,
        proteinReference,
      ),
      howTo: detailedRecipeHowTo(activeRecipe),
      isComplete: Boolean(selectedDietLog.meals[slot.id]),
      isSwapped: activeRecipe.id !== baseRecipe.id,
      swaps: dietSwapOptionsFor(slot.id, activeRecipe.id),
    };
  });
  const selectedDietSnack =
    dietMealRows.find((meal) => meal.slot === "snack")?.recipe ?? baseDietRecipeFor(selectedDietDay, "snack");
  const afterWorkGymFuel = afterWorkGymFuelForDay(selectedDietDay, selectedDietSnack);
  const dietCompletedMealCount = dietMealRows.filter((meal) => meal.isComplete).length;
  const dietCompletionPercent = Math.round((dietCompletedMealCount / dietMealRows.length) * 100);
  const dietDayComplete = dietCompletedMealCount === dietMealRows.length;
  const dietShoppingGroups = useMemo(() => {
    const activeWeekRecipes = currentDietWeekDays.flatMap((day) => {
      const log = normalizeDietDayLog(store.dietDays[day.iso]);
      return dietMealSlots.map((slot) => activeDietRecipeFor(day, log, slot.id));
    });
    return shoppingItemsForRecipes(activeWeekRecipes);
  }, [currentDietWeekDays, store.dietDays]);
  const weightWeekSummaries = useMemo(
    () =>
      weekOptions.map((_week, weekIndex) =>
        weightWeekSummary(planDays, store.metrics, weekIndex),
      ),
    [planDays, store.metrics, weekOptions],
  );
  const currentWeightWeek = weightWeekSummaries[gymDay.week - 1] ?? null;
  const previousWeightWeek = weightWeekSummaries[gymDay.week - 2] ?? null;
  const completedWeightWeeks = weightWeekSummaries.filter((_summary, index) => index * 7 + 6 < gymDay.index);
  const comparableWeightWeeks = completedWeightWeeks.slice(-2);
  const weightCoachInsight = weightComparisonInsight(
    comparableWeightWeeks[0] ?? null,
    comparableWeightWeeks[1] ?? null,
  );
  const weightEntries = useMemo(
    () =>
      planDays
        .slice(0, gymDay.index + 1)
        .map((day) => {
          const metric = normalizeMetricLogShape(store.metrics[day.iso]);
          const weight = weightKgFromMetric(metric);
          return weight === null
            ? null
            : {
                date: day.iso,
                dayNumber: day.index + 1,
                note: metric.note,
                weight,
              };
        })
        .filter((entry): entry is WeightEntry => Boolean(entry)),
    [planDays, store.metrics, gymDay.index],
  );
  const recentWeightEntries = weightEntries.slice(-28);
  const weightChart = weightChartModel(recentWeightEntries);
  const weightMomentum = weightMomentumCoach(
    weightEntries,
    comparableWeightWeeks[0] ?? null,
    comparableWeightWeeks[1] ?? null,
  );
  const weightChartDeltaText = weightChart
    ? weightChart.delta === 0
      ? "0 kg"
      : `${formatLoadValue(Math.abs(weightChart.delta))} kg ${weightChart.delta < 0 ? "down" : "up"}`
    : "Waiting";
  const hubWeightDays = planDays.slice(Math.max(0, gymDay.index - 13), gymDay.index + 1);
  const visibleWeightWeeks = weightWeekSummaries.slice(Math.max(0, gymDay.week - 8), gymDay.week);
  const selectedMonthlyCheckIn = monthlyCheckInForDay(planDays, store, selectedDay);
  const selectedMonthlyCheckpointLog = normalizeDayLog(
    store.days[selectedMonthlyCheckIn.checkpointDay.iso],
  );
  const selectedMonthlyCheckpointMetric = normalizeMetricLogShape(
    store.metrics[selectedMonthlyCheckIn.checkpointDay.iso],
  );
  const selectedMonthlyTitle =
    selectedMonthlyCheckIn.month === 7
      ? "Final Comparison"
      : `Month ${selectedMonthlyCheckIn.month} Check-In`;
  const selectedMonthlyCoachLine = !selectedMonthlyCheckIn.isUnlocked
    ? `Unlocks on ${formatDate(selectedMonthlyCheckIn.checkpointDay.iso, "short")}. Keep logging workouts, cardio, and morning weight.`
    : !selectedMonthlyCheckIn.recoveryAnswered
      ? "Answer the recovery question to decide whether the next block should progress or repeat."
      : selectedMonthlyCheckIn.shouldProgress
        ? "Progress normally next block. You completed enough strength practice and recovery was manageable."
        : "Hold or repeat the block. Keep the main lifts, trim extras if needed, and build consistency before adding more work.";
  const checkInLiftIds = ["leg-press", "incline-db-press", "lat-pulldown", "db-rdl"];
  const monthlyLiftComparisons = checkInLiftIds.map((exerciseId) => {
    const exercise = exerciseMap[exerciseId];
    return {
      id: exerciseId,
      name: exercise?.shortName ?? exerciseId,
      start: bestLoadForExerciseBetween(planDays, store, exerciseId, 0, 27),
      current: bestLoadForExerciseBetween(
        planDays,
        store,
        exerciseId,
        selectedMonthlyCheckIn.startIndex,
        selectedMonthlyCheckIn.endIndex,
      ),
    };
  });
  const firstMonthLongestCardio = longestCompletedCardioBetween(planDays, store, 0, 27);
  const currentMonthLongestCardio = longestCompletedCardioBetween(
    planDays,
    store,
    selectedMonthlyCheckIn.startIndex,
    selectedMonthlyCheckIn.endIndex,
  );

  const stats = useMemo(() => {
    // Progress stats are recomputed from saved logs instead of stored separately. Derived stats are
    // harder to corrupt because fixing a log automatically fixes the dashboard.
    const skippedDates = new Set(
      planDays
        .filter((day) => ["finished-with-skips", "skipped"].includes(dayStatusForDay(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso]))))
        .map((day) => day.iso),
    );
    const completedDates = new Set(
      planDays
        .filter((day) => isPlanDayComplete(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso])))
        .map((day) => day.iso),
    );

    const completedDays = completedDates.size;
    const strengthSessions = planDays.filter(
      (day) => day.session.type === "strength" && completedDates.has(day.iso),
    ).length;

    const cardioMinutes = planDays.reduce(
      (sum, day) => (completedDates.has(day.iso) ? sum + estimatedCardioMinutes(coachedPlanDayFor(day)) : sum),
      0,
    );

    const completedSets = Object.values(store.days).reduce(
      (daySum, log) =>
        daySum +
        Object.values(normalizeDayLog(log).exercises).reduce(
          (exerciseSum, sets) => exerciseSum + sets.filter((set) => set.done).length,
          0,
        ),
      0,
    );
    const normalizedMetrics = Object.values(store.metrics).map(normalizeMetricLogShape);
    const weightLogs = normalizedMetrics.filter(
      (metric) => metric.weightKg.trim() || metric.weight.trim() || metric.note.trim(),
    ).length;
    const weighIns = normalizedMetrics.filter((metric) => weightKgFromMetric(metric) !== null).length;
    const completedDietDays = Object.values(store.dietDays).filter(
      (log) => normalizeDietDayLog(log).completed,
    ).length;
    const completedDietMeals = Object.values(store.dietDays).reduce((sum, log) => {
      const normalizedLog = normalizeDietDayLog(log);
      return sum + dietMealSlots.filter((slot) => normalizedLog.meals[slot.id]).length;
    }, 0);
    const strengthLoadHistory = new Map<string, Array<{ load: number; reps: number | null }>>();

    planDays.forEach((day) => {
      const normalizedLog = normalizeDayLog(store.days[day.iso]);
      Object.entries(normalizedLog.exercises).forEach(([exerciseId, rows]) => {
        rows.forEach((row) => {
          const load = parseLoadValue(row.weight);
          if (load === null || !row.done) return;
          const history = strengthLoadHistory.get(exerciseId) ?? [];
          history.push({
            load,
            reps: parseLoadValue(row.reps),
          });
          strengthLoadHistory.set(exerciseId, history);
        });
      });
    });

    const loadImproved = [...strengthLoadHistory.values()].some((history) => {
      if (history.length < 2) return false;
      return Math.max(...history.map((entry) => entry.load)) > Math.min(...history.map((entry) => entry.load));
    });
    const doubledStartingLoad = [...strengthLoadHistory.values()].some((history) => {
      if (history.length < 2) return false;
      const firstLoad = history[0].load;
      if (firstLoad < 10) return false;
      return Math.max(...history.map((entry) => entry.load)) >= firstLoad * 2;
    });
    const repsImprovedSameWeight = [...strengthLoadHistory.values()].some((history) => {
      const repsByLoad = new Map<number, number[]>();
      history.forEach((entry) => {
        if (entry.reps === null) return;
        repsByLoad.set(entry.load, [...(repsByLoad.get(entry.load) ?? []), entry.reps]);
      });
      return [...repsByLoad.values()].some((reps) => reps.length > 1 && Math.max(...reps) > Math.min(...reps));
    });
    const firstThirtyCardio = planDays.some(
      (day) =>
        completedDates.has(day.iso) &&
        ["cardio", "movement"].includes(day.session.type) &&
        estimatedCardioMinutes(coachedPlanDayFor(day)) >= 30,
    );
    const monthAdherence90 = Array.from({ length: 7 }, (_item, monthIndex) => {
      const startIndex = monthIndex < 6 ? monthIndex * 28 : 168;
      const endIndex = monthIndex < 6 ? startIndex + 27 : PROGRAM_DAYS - 1;
      const days = planDays.slice(startIndex, endIndex + 1);
      const completed = days.filter((day) => completedDates.has(day.iso)).length;
      return days.length > 0 && completed / days.length >= 0.9;
    }).some(Boolean);
    let streak = 0;
    // An unfinished today does not break the streak earned through yesterday.
    const streakEndIndex = completedDates.has(gymDay.iso) ? gymDay.index : gymDay.index - 1;
    for (let index = streakEndIndex; index >= 0; index -= 1) {
      if (completedDates.has(planDays[index].iso)) streak += 1;
      else break;
    }

    return {
      completedDays,
      skippedDays: skippedDates.size,
      strengthSessions,
      cardioMinutes,
      completedSets,
      weightLogs,
      weighIns,
      completedDietDays,
      completedDietMeals,
      loadImproved,
      doubledStartingLoad,
      repsImprovedSameWeight,
      firstThirtyCardio,
      monthAdherence90,
      streak,
      percent: Math.round((completedDays / PROGRAM_DAYS) * 100),
    };
  }, [coachedPlanDayFor, gymDay.index, planDays, store.days, store.dietDays, store.metrics]);

  const achievements = [
    {
      label: "First gym day",
      earned: stats.completedDays >= 1,
      detail: "Complete any plan day.",
    },
    {
      label: "Three-day chain",
      earned: stats.streak >= 3,
      detail: "Complete 3 days in a row.",
    },
    {
      label: "Strength rhythm",
      earned: stats.strengthSessions >= 3,
      detail: "Complete 3 strength sessions.",
    },
    {
      label: "First 4 weeks",
      earned: planDays
        .slice(0, 28)
        .every((day) => isPlanDayComplete(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso]))),
      detail: "Complete the first month of the program.",
    },
    {
      label: "12 strength sessions",
      earned: stats.strengthSessions >= 12,
      detail: "Earn the full Month 1 strength base.",
    },
    {
      label: "First weight increase",
      earned: stats.loadImproved,
      detail: "Log a higher load than a previous session.",
    },
    {
      label: "Same weight, more reps",
      earned: stats.repsImprovedSameWeight,
      detail: "Improve reps at a load you used before.",
    },
    {
      label: "First 30-min cardio",
      earned: stats.firstThirtyCardio,
      detail: "Complete a walk that reaches at least 30 minutes.",
    },
    {
      label: "Cardio floor",
      earned: stats.cardioMinutes >= 150,
      detail: "Log 150 cardio minutes.",
    },
    {
      label: "Data-minded",
      earned: stats.weighIns >= 2,
      detail: "Log 2 weigh-ins.",
    },
    {
      label: "Week one locked",
      earned: planDays
        .slice(0, 7)
        .every((day) => isPlanDayComplete(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso]))),
      detail: "Complete the first 7 program days.",
    },
    {
      label: "90% month adherence",
      earned: stats.monthAdherence90,
      detail: "Complete at least 90% of one month.",
    },
    {
      label: "Three months trained",
      earned: stats.completedDays >= 84,
      detail: "Reach the Month 3 comparison window.",
    },
    {
      label: "Doubled a starting load",
      earned: stats.doubledStartingLoad,
      detail: "Double a reasonable starting load on one exercise.",
    },
    {
      label: "Six-month finish",
      earned: stats.completedDays >= 168,
      detail: "Reach the final comparison block.",
    },
  ];

  // These small updater wrappers keep all edits immutable. React notices the changed objects, and
  // the autosave effects above persist the updated store.
  const updateDay = (date: string, updater: (log: DayLog) => DayLog) => {
    setStore((current) => {
      const nextLog = updater(normalizeDayLog(current.days[date]));
      return {
        ...current,
        days: {
          ...current.days,
          [date]: nextLog,
        },
      };
    });
  };

  const updateReadiness = <K extends keyof ReadinessLog>(
    planDay: PlanDay,
    key: K,
    value: NonNullable<ReadinessLog[K]>,
  ) => {
    updateDay(planDay.iso, (log) =>
      withAutomaticDayCompletion(planDay, {
        ...log,
        readiness: {
          ...log.readiness,
          [key]: value,
        },
      }),
    );
  };

  const updateMonthlyRecovery = (planDay: PlanDay, value: MonthlyRecovery) => {
    updateDay(planDay.iso, (log) => ({
      ...log,
      monthlyRecovery: value,
    }));
  };

  const updateMetric = (date: string, updater: (log: MetricLog) => MetricLog) => {
    setStore((current) => {
      const nextLog = updater(normalizeMetricLogShape(current.metrics[date]));
      return {
        ...current,
        metrics: {
          ...current.metrics,
          [date]: nextLog,
        },
      };
    });
  };

  const updateDietDay = (date: string, updater: (log: DietDayLog) => DietDayLog) => {
    setStore((current) => {
      const nextLog = updater(normalizeDietDayLog(current.dietDays[date]));
      return {
        ...current,
        dietDays: {
          ...current.dietDays,
          [date]: withAutomaticDietCompletion(nextLog),
        },
      };
    });
  };

  const updateSettings = (updater: (settings: UserSettings) => UserSettings) => {
    setStore((current) => ({
      ...current,
      settings: updater(normalizeSettings(current.settings)),
    }));
  };

  const toggleDietMeal = (slot: DietMealSlot) => {
    updateDietDay(selectedDietDay.iso, (log) => ({
      ...log,
      meals: {
        ...log.meals,
        [slot]: !log.meals[slot],
      },
    }));
  };

  const setDietSwap = (slot: DietMealSlot, recipeId: string) => {
    updateDietDay(selectedDietDay.iso, (log) => {
      const nextSwaps = { ...log.swaps };
      const baseRecipe = baseDietRecipeFor(selectedDietDay, slot);
      if (recipeId === baseRecipe.id) {
        delete nextSwaps[slot];
      } else {
        nextSwaps[slot] = recipeId;
      }

      return {
        ...log,
        swaps: nextSwaps,
        meals: {
          ...log.meals,
          [slot]: false,
        },
      };
    });
    setOpenDietSwapSlot(null);
    setOpenDietHowToSlot(null);
  };

  const updateSetForDay = (
    planDay: PlanDay,
    exercises: Exercise[],
    exerciseId: string,
    setIndex: number,
    field: keyof SetLog,
    value: string | boolean | EffortFeedback | undefined,
  ) => {
    // Typing edits a draft. Completion is explicit so Gym Mode cannot advance
    // after the first digit of a weight or record a set that was only planned.
    updateDay(planDay.iso, (log) => {
      const exercise = exerciseMap[exerciseId];
      if (!exercise || setIndex < 0) return log;

      const originalExercise = exercises.find(
        (item) => item.id === exerciseId || activeExerciseFor(item, log).id === exerciseId,
      );
      const exerciseIndex = originalExercise ? exercises.indexOf(originalExercise) : -1;
      const originalExerciseId = originalExercise?.id ?? exerciseId;
      const count = Math.max(
        recommendedSets(planDay, exercise, Math.max(exerciseIndex, 0), readinessStatusFor(log.readiness)),
        log.exercises[exerciseId]?.length ?? 0,
      );
      const rows = ensureSetRows(log.exercises[exerciseId], count);
      const nextRow = { ...rows[setIndex] };
      if (field === "weight" && typeof value === "string") nextRow.weight = value;
      if (field === "reps" && typeof value === "string") nextRow.reps = value;
      if (field === "done" && typeof value === "boolean") nextRow.done = value;
      if (field === "effort") nextRow.effort = isEffortFeedback(value) ? value : undefined;
      rows[setIndex] = nextRow;
      const resumesMove = (
        (field === "done" && value === true) ||
        ((field === "weight" || field === "reps") && typeof value === "string" && value.trim())
      );
      const resumedLog = resumesMove ? reopenPlanMove(planDay, log, originalExerciseId) : log;
      const nextLog = {
        ...resumedLog,
        exercises: {
          ...log.exercises,
          [exerciseId]: rows,
        },
      };

      return withAutomaticDayCompletion(planDay, nextLog);
    });
  };

  const updateSet = (
    exerciseId: string,
    setIndex: number,
    field: keyof SetLog,
    value: string | boolean | EffortFeedback | undefined,
  ) => {
    updateSetForDay(selectedCoachDay, selectedExercises, exerciseId, setIndex, field, value);
  };

  const updateGymSet = (
    exerciseId: string,
    setIndex: number,
    field: keyof SetLog,
    value: string | boolean | EffortFeedback | undefined,
  ) => {
    updateSetForDay(gymCoachDay, gymExercises, exerciseId, setIndex, field, value);
  };

  const setExerciseSwapForDay = (
    planDay: PlanDay,
    originalExerciseId: string,
    nextExerciseId: string,
  ) => {
    // Switching a movement also clears a skip for the original movement, because choosing a valid
    // replacement means the user is attempting the training slot again.
    updateDay(planDay.iso, (log) => {
      const nextSwaps = { ...(log.swaps ?? {}) };
      if (nextExerciseId === originalExerciseId) {
        delete nextSwaps[originalExerciseId];
      } else {
        nextSwaps[originalExerciseId] = nextExerciseId;
      }
      const nextLog = {
        ...reopenPlanMove(planDay, log, originalExerciseId),
        swaps: nextSwaps,
      };

      return withAutomaticDayCompletion(planDay, nextLog);
    });
  };

  const setExerciseSwap = (originalExerciseId: string, nextExerciseId: string) => {
    setExerciseSwapForDay(selectedCoachDay, originalExerciseId, nextExerciseId);
  };

  const setGymExerciseSwap = (originalExerciseId: string, nextExerciseId: string) => {
    setExerciseSwapForDay(gymCoachDay, originalExerciseId, nextExerciseId);
  };

  const skipExerciseForDay = (
    planDay: PlanDay,
    originalExerciseId: string,
    reason: SkipReason,
  ) => {
    updateDay(planDay.iso, (log) => skipPlanMove(planDay, log, originalExerciseId, reason));
  };

  const reopenSkippedExerciseForDay = (planDay: PlanDay, originalExerciseId: string) => {
    updateDay(planDay.iso, (log) => withAutomaticDayCompletion(
      planDay, reopenPlanMove(planDay, log, originalExerciseId),
    ));
  };

  const requestSkipReason = (
    planDay: PlanDay,
    originalExerciseId: string | null,
    source: SkipRequest["source"],
  ) => {
    setSkipRequest({ date: planDay.iso, originalExerciseId, source });
  };

  const submitSkipReason = (reason: SkipReason) => {
    if (!skipRequest) return;
    const planDay = planDays.find((day) => day.iso === skipRequest.date);
    if (!planDay) return;
    // The dialog captures its date when opened. Browsing or midnight must never
    // redirect this write into another day's log.
    if (skipRequest.originalExerciseId === null) {
      updateDay(planDay.iso, (log) => skipPlanDay(coachedPlanDayFor(planDay), log, reason));
      if (planDay.iso === gymDay.iso) {
        setRestTimer(null);
        setGymStartedAt(null);
      }
    } else {
      skipExerciseForDay(coachedPlanDayFor(planDay), skipRequest.originalExerciseId, reason);
    }
    setSkipRequest(null);
  };

  const toggleExerciseDoneForDay = (
    planDay: PlanDay,
    exerciseId: string,
    setCount: number,
    isComplete: boolean,
  ) => {
    updateDay(planDay.iso, (log) => {
      const rows = ensureSetRows(log.exercises[exerciseId], setCount).map((row) => ({
        ...row,
        done: !isComplete,
      }));
      const originalExercise = scheduledExercisesForDay(planDay, log).find(
        (item) => item.id === exerciseId || activeExerciseFor(item, log).id === exerciseId,
      );
      const nextLog = {
        ...reopenPlanMove(planDay, log, originalExercise?.id ?? exerciseId),
        exercises: {
          ...log.exercises,
          [exerciseId]: rows,
        },
      };

      return withAutomaticDayCompletion(planDay, nextLog);
    });
  };

  const toggleExerciseDone = (exerciseId: string, setCount: number, isComplete: boolean) => {
    toggleExerciseDoneForDay(selectedCoachDay, exerciseId, setCount, isComplete);
  };

  const toggleTask = (taskId: string) => {
    updateDay(selectedDay.iso, (log) => {
      const nextLog = {
        ...log,
        daySkipReason: undefined,
        tasks: {
          ...log.tasks,
          [taskId]: !log.tasks[taskId],
        },
      };

      return withAutomaticDayCompletion(selectedCoachDay, nextLog);
    });
  };

  const getAuthCredentials = () => {
    // Email is normalized before auth so Ali@example.com and ali@example.com behave like the same
    // account. Password is left exactly as typed.
    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    setCloudError("");

    if (!email) {
      setAuthMessage("Enter your email first.");
      return null;
    }
    if (password.length < 8) {
      setAuthMessage("Use a password with at least 8 characters.");
      return null;
    }

    return { email, password };
  };

  const handleSignInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    const credentials = getAuthCredentials();
    if (!credentials) return;

    setAuthMessage("Signing in...");
    setCloudError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      setAuthMessage("");
      setCloudStatus("error");
      setCloudError(error.message);
      return;
    }

    setAuthPassword("");
    setAuthMessage("Signed in. Cloud sync is loading your progress now.");
  };

  const handleCreateAccount = async () => {
    if (!supabase) return;

    const credentials = getAuthCredentials();
    if (!credentials) return;

    setAuthMessage("Creating your account...");
    setCloudError("");

    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthMessage("");
      setCloudStatus("error");
      setCloudError(error.message);
      return;
    }

    setAuthPassword("");
    setAuthMessage(
      data.session
        ? "Account created and signed in. Cloud sync is loading your progress now."
        : "Account created. Supabase is asking for email confirmation first. Confirm the email once, then return here and sign in with your password.",
    );
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setCloudStatus("error");
      setCloudError(error.message);
      return;
    }

    setCloudReadyForUser(null);
    setCloudStatus("signed-out");
    setAuthMessage("Signed out. Your local copy stays on this device.");
  };

  // Library filtering is intentionally local and instant. A gym app should keep search responsive
  // even when the network is weak.
  const filteredLibrary = libraryOrder
    .map((id) => exerciseMap[id])
    .filter((exercise) => {
      const matchesFilter = libraryFilter === "all" || exercise.family === libraryFilter;
      const query = librarySearch.trim().toLowerCase();
      const matchesSearch =
        !query ||
        exercise.name.toLowerCase().includes(query) ||
        exercise.target.toLowerCase().includes(query) ||
        exercise.equipment.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });

  const nextDay = planDays[Math.min(selectedDay.index + 1, planDays.length - 1)];
  const previousDay = planDays[Math.max(selectedDay.index - 1, 0)];
  const nextDietDay = planDays[Math.min(selectedDietDay.index + 1, planDays.length - 1)];
  const previousDietDay = planDays[Math.max(selectedDietDay.index - 1, 0)];
  const syncHeadline = supabaseConfigError
    ? "Check Supabase settings"
    : !isSupabaseConfigured
    ? "Connect Supabase to sync"
    : !isOnline
      ? "Offline · saved on this device"
    : session
      ? cloudStatus === "loading"
        ? "Loading cloud progress"
        : cloudStatus === "saving"
          ? "Saving to cloud"
          : cloudStatus === "error"
            ? "Sync needs attention"
            : "Synced across devices"
      : "Sign in to sync";
  const syncCopy = supabaseConfigError
    ? "Your workouts still save locally. The production sync settings need correction in Vercel, then a redeploy."
    : !isSupabaseConfigured
    ? "Local saving still works. Add your Supabase URL and publishable key to unlock the same data on your MacBook and iPhone."
    : session
      ? "You are signed in, so every workout check, diet meal, swap, kg weigh-in, and note saves locally and to your cloud account."
      : "Sign in or create an account with email and password. This works inside the iPhone Home Screen app without magic links or custom SMTP.";

  // Weekly completion feeds the planner bars. It reads the same derived day-completion rules as
  // Today, so skipped days do not accidentally count as fully complete.
  const weeklyCompletion = useMemo(
    () =>
      weekOptions.map((week, weekIndex) => {
        const days = planDays.slice(weekIndex * 7, weekIndex * 7 + 7);
        const completed = days.filter((day) =>
          isPlanDayComplete(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso])),
        ).length;
        return {
          ...week,
          completed,
          total: days.length,
          percent: Math.round((completed / days.length) * 100),
        };
      }),
    [coachedPlanDayFor, planDays, store.days, weekOptions],
  );
  const recentCompletedDays = planDays
    .filter((day) => isPlanDayComplete(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso])))
    .slice(-6)
    .reverse();
  // This row builder is shared by Today and Gym Mode. Sharing it is what keeps both tabs in sync
  // after a set is completed, a move is skipped, or a swap is chosen.
  const buildWorkoutMoveRows = (planDay: PlanDay, dayLog: DayLog, exercises: Exercise[]) =>
    exercises.map((originalExercise, exerciseIndex) => {
      const activeExercise = activeExerciseFor(originalExercise, dayLog);
      const readinessStatus = readinessStatusFor(dayLog.readiness);
      const priority = exercisePriorityFor(activeExercise, planDay);
      const setCount = recommendedSets(planDay, activeExercise, exerciseIndex, readinessStatus);
      const rows = ensureSetRows(dayLog.exercises[activeExercise.id], setCount);
      const doneCount = completedRows(rows);
      const isComplete = rows.length > 0 && doneCount >= rows.length;
      const skipReason = skipReasonForExercise(dayLog, originalExercise.id);
      const isSkipped = Boolean(skipReason && !isComplete);
      const status: MoveStatus = isComplete ? "done" : isSkipped ? "skipped" : "pending";
      const suggestion = smartLoadSuggestion(planDays, store, planDay, activeExercise, exerciseIndex);
      const statusLabel =
        status === "done"
          ? "Done"
          : status === "skipped" && skipReason
            ? `Skipped: ${skipReasonLabel(skipReason)}`
            : doneCount > 0
              ? "In progress"
              : "Not started";

      return {
        originalExercise,
        activeExercise,
        exerciseIndex,
        setCount,
        rows,
        doneCount,
        isComplete,
        isSkipped,
        skipReason,
        status,
        statusLabel,
        priority,
        priorityLabel: exercisePriorityLabel(priority),
        target: targetForExercise(planDay, activeExercise),
        rest: restForExercise(planDay, activeExercise),
        timing: exerciseTimingFor(planDay, activeExercise),
        location: locationGuideForExercise(activeExercise),
        progression: progressionForExercise(planDay, activeExercise),
        suggestion,
        beginnerTeaching: beginnerTeachingForExercise(planDay, activeExercise, suggestion.label),
        swaps: swapOptionsFor(originalExercise),
        isSwapped: isSwappedExercise(originalExercise, dayLog),
      };
    });
  const workoutMoveRows = buildWorkoutMoveRows(selectedCoachDay, selectedLog, selectedExercises);
  const gymMoveRows = buildWorkoutMoveRows(gymCoachDay, gymLog, gymExercises);
  const gymCompletionSignature = gymMoveRows.map((move) => move.status).join("");
  const gymSessionResolved = Boolean(gymLog.daySkipReason) || (gymMoveRows.length
    ? gymMoveRows.every((move) => move.isComplete || move.isSkipped)
    : gymDayStatus === "complete");
  const gymCompletedMoves = gymMoveRows.filter((move) => move.isComplete).length;
  const gymSkippedMoves = gymMoveRows.filter((move) => move.isSkipped).length;
  const completedMoveCount = workoutMoveRows.filter((move) => move.isComplete).length;
  const skippedMoveCount = workoutMoveRows.filter((move) => move.isSkipped).length;
  const moveCompletionPercent = workoutMoveRows.length
    ? Math.round((completedMoveCount / workoutMoveRows.length) * 100)
    : selectedDayComplete
      ? 100
      : 0;
  const completedTaskCount = selectedDay.session.tasks.filter((task) => selectedLog.tasks[task]).length;
  const taskCompletionPercent = selectedDay.session.tasks.length
    ? Math.round((completedTaskCount / selectedDay.session.tasks.length) * 100)
    : 0;
  const nextOpenMove =
    workoutMoveRows.find((move) => !move.isComplete && !move.isSkipped) ?? null;
  const currentGymMove = gymMoveRows[gymExerciseIndex] ?? null;
  const currentGymExercise = currentGymMove?.activeExercise ?? null;
  const currentGymOriginalExercise = currentGymMove?.originalExercise ?? null;
  const currentGymRows = currentGymMove?.rows ?? null;
  const currentGymPreviousLoad = currentGymExercise
    ? lastExerciseLoad(planDays, store, gymDay, currentGymExercise.id)
    : null;
  const currentGymTarget = currentGymMove?.target ?? "";
  const currentGymRest = currentGymMove?.rest ?? "";
  const currentGymLocation = currentGymMove?.location ?? null;
  const currentGymSuggestion = currentGymMove?.suggestion ?? null;
  const currentGymTracksWeight = currentGymExercise ? tracksWeight(currentGymExercise) : false;
  const currentGymNextSetIndex = currentGymRows?.findIndex((row) => !row.done) ?? -1;
  const currentGymNextSetNumber = currentGymNextSetIndex >= 0 ? currentGymNextSetIndex + 1 : null;
  const previousUnfinishedGymIndex = nextUnfinishedMoveIndex(
    gymMoveRows,
    gymExerciseIndex,
    "previous",
  );
  const nextUnfinishedGymIndex = nextUnfinishedMoveIndex(gymMoveRows, gymExerciseIndex, "next");
  const hasPreviousUnfinishedGymMove = previousUnfinishedGymIndex !== gymExerciseIndex;
  const hasNextUnfinishedGymMove = nextUnfinishedGymIndex !== gymExerciseIndex;
  const gymPrimaryIsResolved = Boolean(currentGymMove?.isComplete || currentGymMove?.isSkipped);
  const gymPrimaryFullLabel = gymPrimaryIsResolved
    ? hasNextUnfinishedGymMove
      ? "Next Open Move"
      : "All Done"
    : `Complete Set${currentGymNextSetNumber ? ` ${currentGymNextSetNumber}` : ""}`;
  const gymPrimaryShortLabel = gymPrimaryIsResolved
    ? hasNextUnfinishedGymMove
      ? "Next"
      : "Done"
    : "Complete";
  const gymPriorityBuckets = {
    main: gymMoveRows.filter((move) => move.priority === "main" && !move.isComplete && !move.isSkipped),
    accessory: gymMoveRows.filter((move) => move.priority === "accessory" && !move.isComplete && !move.isSkipped),
    optional: gymMoveRows.filter((move) => move.priority === "optional" && !move.isComplete && !move.isSkipped),
  };
  const detailMove = detailExerciseId
    ? workoutMoveRows.find((move) => move.originalExercise.id === detailExerciseId) ?? null
    : null;
  const detailExercise = detailMove?.activeExercise ?? null;
  const detailRows = detailMove?.rows ?? null;
  const detailPreviousLoad = detailExercise
    ? lastExerciseLoad(planDays, store, selectedDay, detailExercise.id)
    : null;
  const detailLocation = detailMove?.location ?? null;
  const skipRequestDay = skipRequest
    ? planDays.find((day) => day.iso === skipRequest.date) ?? null
    : null;
  const skipRequestOriginalExercise = skipRequest?.originalExerciseId
    ? exerciseMap[skipRequest.originalExerciseId] ?? null
    : null;
  const skipRequestLog = skipRequestDay ? normalizeDayLog(store.days[skipRequestDay.iso]) : null;
  const skipRequestExercise =
    skipRequestOriginalExercise && skipRequestLog
      ? activeExerciseFor(skipRequestOriginalExercise, skipRequestLog)
      : skipRequestOriginalExercise;
  const skipRequestContext = skipRequest
    ? {
        today: "Today",
        gym: "Gym Mode",
        detail: "Exercise Detail",
      }[skipRequest.source]
    : "";
  const bestLiftRows = useMemo(() => libraryOrder
    .map((id) => {
      const exercise = exerciseMap[id];
      if (!exercise || !tracksWeight(exercise) || exercise.family === "warmup") return null;

      const allLoads = Object.values(store.days).flatMap((log) =>
        (normalizeDayLog(log).exercises[id] ?? [])
          .filter((row) => row.done)
          .map((row) => parseLoadValue(row.weight))
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      );

      if (!allLoads.length) return null;

      return {
        id,
        name: exercise.shortName,
        load: Math.max(...allLoads),
        family: exercise.family,
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => b.load - a.load)
    .slice(0, 5), [store.days]);
  const weightTrend = useMemo(() => {
    const entries = Object.entries(store.metrics)
      .map(([date, metric]) => {
        const normalizedMetric = normalizeMetricLogShape(metric);
        return {
          date,
          weight: weightKgFromMetric(normalizedMetric),
        };
      })
      .filter((entry) => entry.weight !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length < 2) return null;

    const first = entries[0];
    const last = entries[entries.length - 1];
    const weightDelta =
      first.weight !== null && last.weight !== null ? last.weight - first.weight : null;

    return {
      from: formatDate(first.date, "short"),
      to: formatDate(last.date, "short"),
      weightDelta,
    };
  }, [store.metrics]);

  useEffect(() => {
    // Gym Mode watches completion changes and jumps to the first unfinished, unskipped move. This
    // is why it can continue smoothly after the user logs some sets in Today first.
    if (activeSection !== "gym") return;

    setGymExerciseIndex((index) => {
      const boundedIndex = Math.min(index, Math.max(gymMoveRows.length - 1, 0));
      const currentMove = gymMoveRows[boundedIndex];
      if (currentMove && !currentMove.isComplete && !currentMove.isSkipped) return boundedIndex;
      return firstUnfinishedMoveIndex(gymMoveRows);
    });
  }, [activeSection, gymCompletionSignature, gymDay.iso, gymMoveRows.length]);

  const activeSectionLabel = {
    today: "Today",
    gym: "Gym Mode",
    week: "Week",
    progress: "Progress",
    library: "Library",
  }[activeSection];
  const navItems = [
    { id: "today" as const, label: "Today", icon: "activity" as const },
    { id: "gym" as const, label: "Gym", icon: "dumbbell" as const },
    { id: "week" as const, label: "Week", icon: "calendar" as const },
    { id: "progress" as const, label: "Progress", icon: "progress" as const },
    { id: "library" as const, label: "Library", icon: "library" as const },
  ];

  const goToCurrentProgramDay = () => {
    const nextProgramDate = closestProgramDate();
    setCurrentProgramDate(nextProgramDate);
    setSelectedDate(nextProgramDate);
  };

  const switchSection = (section: AppSection) => {
    // Gym Mode always uses actual today, even if the user has browsed a different date in Today.
    if (section === "gym") {
      const nextProgramDate = closestProgramDate();
      const nextGymDay = resolveGymDay(planDays, nextProgramDate);
      const nextGymCoachDay = withTrainingWeek(
        nextGymDay,
        earnedTrainingWeekForDay(planDays, store, nextGymDay),
      );
      const nextGymLog = normalizeDayLog(store.days[nextGymDay.iso]);
      const nextGymExercises = scheduledExercisesForDay(nextGymCoachDay, nextGymLog);
      const nextGymRows = buildWorkoutMoveRows(nextGymCoachDay, nextGymLog, nextGymExercises);

      setCurrentProgramDate(nextProgramDate);
      setSelectedDate(nextProgramDate);
      setGymExerciseIndex(firstUnfinishedMoveIndex(nextGymRows));
      setGymStartedAt((startedAt) => startedAt ?? Date.now());
    }

    setActiveSection(section);
  };

  const completeNextGymSet = () => {
    if (!currentGymExercise || !currentGymRows) return;
    if (currentGymMove?.isComplete || currentGymMove?.isSkipped) {
      goToNextGymMove();
      return;
    }

    const nextSetIndex = currentGymRows.findIndex((row) => !row.done);
    const restSeconds = restTimerSecondsFor(gymCoachDay, currentGymExercise);
    updateGymSet(currentGymExercise.id, nextSetIndex >= 0 ? nextSetIndex : 0, "done", true);
    if (restSeconds > 0) {
      setRestTimer({
        endAt: Date.now() + restSeconds * 1000,
        totalSeconds: restSeconds,
        label: `${currentGymExercise.shortName} rest`,
      });
    }
  };

  const goToNextGymMove = () => {
    setGymExerciseIndex((index) => nextUnfinishedMoveIndex(gymMoveRows, index, "next"));
  };

  const goToPreviousGymMove = () => {
    setGymExerciseIndex((index) => nextUnfinishedMoveIndex(gymMoveRows, index, "previous"));
  };

  const headerDay = activeSection === "gym" ? gymDay : selectedDay;

  if (appMode === "hub") {
    return (
      <main className="app-shell coach-hub-shell">
        <section className="coach-hub-hero" aria-labelledby="coach-hub-heading">
          <div className="brand-lockup hub-brand">
            <span className="brand-mark">RC</span>
            <div>
              <p className="eyebrow">Recomp coach</p>
              <h1 id="coach-hub-heading">Coach Hub</h1>
              <p className="hero-text">
                {formatDate(currentProgramDate)} · Week {gymDay.week} of 26
              </p>
            </div>
          </div>
          <a className={`hub-save-status ${localSaveError ? "error" : ""}`} href="#coach-account">
            <Icon name="cloud" size={16} /> {localSaveError ? "Check device saving" : syncHeadline}
          </a>

          <div className="hub-choice-grid">
            <button
              className="hub-choice-card workout"
              type="button"
              onClick={() => { goToCurrentProgramDay(); setActiveSection("today"); setAppMode("workout"); }}
            >
              <span><Icon name="dumbbell" size={22} /> Today&apos;s training <Icon name="chevronRight" size={18} /></span>
              <strong>Workout</strong>
              <small>
                {gymDay.session.title} · {gymMoveRows.filter((move) => move.isComplete).length}/{gymMoveRows.length} moves done
              </small>
              <progress aria-label="Today's workout progress" value={gymMoveRows.filter((move) => move.isComplete).length} max={gymMoveRows.length || 1} />
            </button>
            <button
              className="hub-choice-card diet"
              type="button"
              onClick={() => { setSelectedDietDate(currentProgramDate); setAppMode("diet"); }}
            >
              <span><Icon name="cart" size={22} /> Today&apos;s meals <Icon name="chevronRight" size={18} /></span>
              <strong>Diet</strong>
              <small>
                {gymDietTarget.label} · {Object.values(normalizeDietDayLog(store.dietDays[currentProgramDate]).meals).filter(Boolean).length}/4 meals eaten
              </small>
              <progress aria-label="Today's meal progress" value={Object.values(normalizeDietDayLog(store.dietDays[currentProgramDate]).meals).filter(Boolean).length} max={4} />
            </button>
          </div>
        </section>
        {localSaveError && <p className="save-alert" role="alert">{localSaveError}</p>}

        <section className="hub-dashboard-grid" aria-label="Daily coach overview">
          <div className="morning-weighin-card hub-body-check-card">
            <div>
              <p className="eyebrow">Morning weigh-in</p>
              <h2>{formatDate(currentProgramDate, "short")}</h2>
              <p>Same scale, after the bathroom, before food or drink.</p>
            </div>
            <div className="hub-checkin-fields">
              <label>
                Morning weight (kg)
                <input
                  inputMode="decimal"
                  value={currentProgramMetric.weightKg}
                  placeholder="78.0"
                  onChange={(event) =>
                    updateMetric(currentProgramDate, (metric) => ({
                      ...metric,
                      weightKg: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="notes-field hub-checkin-note">
              Check-in note
              <textarea
                value={currentProgramMetric.note}
                placeholder="Sleep, soreness, photos, hunger, or anything that explains today's number..."
                onChange={(event) =>
                  updateMetric(currentProgramDate, (metric) => ({
                    ...metric,
                    note: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="hub-mini-grid">
            <div>
              <span>Workout streak</span>
              <strong>{stats.streak}</strong>
            </div>
            <div>
              <span>Diet meals</span>
              <strong>{stats.completedDietMeals}</strong>
            </div>
            <div>
              <span>Weigh-ins</span>
              <strong>{stats.weighIns}</strong>
            </div>
          </div>
        </section>

        <details className="diet-settings-card coach-disclosure">
          <summary>Nutrition settings <span>{gymDietTarget.calories} · {gymDietTarget.protein}</span></summary>
          <div>
            <p className="eyebrow">Nutrition settings</p>
            <h2 id="diet-settings-heading">Personalize diet targets</h2>
            <p>
              Protein updates from your Coach Hub weigh-ins automatically. Calories can stay at the
              base plan or move by a small 150 kcal step instead of reacting to one weigh-in.
            </p>
          </div>
          <div className="diet-settings-grid">
            <div className="protein-reference-card">
              <span>Protein basis</span>
              <strong>{proteinReference.label}</strong>
              <small>{proteinReference.detail}</small>
            </div>
            <div className="calorie-mode-control">
              <strong>Calorie mode</strong>
              <div>
                {[
                  ["calculated", "Base plan"],
                  ["lower", "-150 kcal"],
                  ["higher", "+150 kcal"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    className={store.settings.calorieMode === mode ? "selected" : ""}
                    type="button"
                    onClick={() =>
                      updateSettings((settings) => ({
                        ...settings,
                        calorieMode: mode as CalorieMode,
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="diet-target-preview">
              <span>Today&apos;s target</span>
              <strong>
                {gymDietTarget.calories} · {gymDietTarget.protein}
              </strong>
              <small>{gymDietTarget.modeLabel}</small>
            </div>
          </div>
        </details>

        <section className={`hub-weight-panel weight-insight-${weightCoachInsight.tone}`} aria-label="Weight tracker">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">
                <Icon name="scale" size={14} /> Weight coach
              </p>
              <h2>Weekly averages</h2>
            </div>
          </div>
          <div className="weight-summary-grid">
            <div>
              <span>This week</span>
              <strong>{currentWeightWeek?.average === null || !currentWeightWeek ? "No data" : `${formatLoadValue(currentWeightWeek.average)} kg`}</strong>
              <small>{currentWeightWeek ? `${currentWeightWeek.loggedDays}/7 mornings logged` : "Start logging today"}</small>
            </div>
            <div>
              <span>Previous week</span>
              <strong>{previousWeightWeek?.average === null || !previousWeightWeek ? "No data" : `${formatLoadValue(previousWeightWeek.average)} kg`}</strong>
              <small>{previousWeightWeek ? `${previousWeightWeek.loggedDays}/7 mornings logged` : "Unlocks after Week 1"}</small>
            </div>
            <div className="weight-coach-note">
              <span>Coach read</span>
              <strong>{weightCoachInsight.headline}</strong>
              <small>{weightCoachInsight.detail}</small>
            </div>
          </div>

          <div className="weight-visual-grid">
            <section className="weight-chart-card" aria-label="Weight trend chart">
              <div className="flow-heading">
                <h3>Weight Trend</h3>
                <span>{weightChart ? weightChart.windowLabel : "Log 2+ mornings"}</span>
              </div>
              {weightChart ? (
                <>
                  <svg className="weight-line-chart" viewBox="0 0 100 72" role="img" aria-label="Recent weight trend line">
                    <path className="chart-grid-line" d="M0 12H100M0 38H100M0 64H100" />
                    {weightChart.points.length > 1 && (
                      <path className="chart-trend-line" d={weightChart.path} />
                    )}
                    {weightChart.points.map((point, pointIndex) => (
                      <g key={point.date}>
                        <circle
                          className={pointIndex === weightChart.points.length - 1 ? "latest" : ""}
                          cx={point.x}
                          cy={point.y}
                          r={pointIndex === weightChart.points.length - 1 ? 2.8 : 2.1}
                        />
                        <title>
                          Day {point.dayNumber}: {formatLoadValue(point.weight)} kg
                        </title>
                      </g>
                    ))}
                  </svg>
                  <div className="weight-chart-stats">
                    <div>
                      <span>Window change</span>
                      <strong>{weightChartDeltaText}</strong>
                    </div>
                    <div>
                      <span>Highest</span>
                      <strong>{formatLoadValue(weightChart.highest)} kg</strong>
                    </div>
                    <div>
                      <span>Lowest</span>
                      <strong>{formatLoadValue(weightChart.lowest)} kg</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-weight-chart">
                  <Icon name="progress" size={22} />
                  <strong>No chart yet</strong>
                  <small>Log a few morning weigh-ins and the trend line will appear here.</small>
                </div>
              )}
            </section>

            <section className="weight-motivation-card" aria-label="Weight motivation">
              <p className="eyebrow">
                <Icon name="spark" size={14} /> Momentum
              </p>
              <h3>{weightMomentum.headline}</h3>
              <p>{weightMomentum.detail}</p>
              <div className="weight-habit-row">
                <span>{stats.weighIns} weigh-ins</span>
                <span>{weightEntries.length >= 14 ? "Trend ready" : "Build 2-week signal"}</span>
              </div>
            </section>
          </div>

          <details className="daily-weight-log compact-weight-log">
            <summary>
              <strong>Daily Weight Log</strong>
              <span>Last {hubWeightDays.length} mornings · tap to edit</span>
            </summary>
            <div className="daily-weight-grid">
              {hubWeightDays.map((day) => {
                const metric = normalizeMetricLogShape(store.metrics[day.iso]);
                const hasWeight = weightKgFromMetric(metric) !== null;

                return (
                  <label key={day.iso} className={`daily-weight-cell ${hasWeight ? "logged" : ""}`}>
                    <span>{formatDate(day.iso, "short")}</span>
                    <small>Day {day.index + 1}</small>
                    <input
                      inputMode="decimal"
                      value={metric.weightKg}
                      placeholder="kg"
                      onChange={(event) =>
                        updateMetric(day.iso, (currentMetric) => ({
                          ...currentMetric,
                          weightKg: event.target.value,
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>
          </details>

          <details className="weekly-weight-history">
            <summary>
              <strong>Weekly Average History</strong>
              <span>Last {visibleWeightWeeks.length} weeks shown · expand for detail</span>
            </summary>
            <div className="weekly-weight-list">
              {visibleWeightWeeks.map((summary) => (
                <div key={summary.week} className={summary.loggedDays > 0 ? "logged" : ""}>
                  <span>Week {summary.week}</span>
                  <strong>{summary.average === null ? "No data" : `${formatLoadValue(summary.average)} kg`}</strong>
                  <small>
                    {formatDate(summary.startIso, "short")} - {formatDate(summary.endIso, "short")} · {summary.loggedDays}/7 logged
                  </small>
                </div>
              ))}
              {gymDay.week > visibleWeightWeeks.length && (
                <div className="weight-history-note">
                  <span>Earlier weeks</span>
                  <strong>{gymDay.week - visibleWeightWeeks.length}</strong>
                  <small>Hidden to keep Coach Hub fast and clean.</small>
                </div>
              )}
            </div>
          </details>
        </section>

        <section id="coach-account" className={`metric-panel sync-panel account-card hub-sync ${cloudStatus}`}>
          <div className="sync-heading">
            <div>
              <p className="eyebrow">
                <Icon name="cloud" size={14} /> Cloud sync
              </p>
              <h2>{syncHeadline}</h2>
            </div>
            <span>{cloudStatus}</span>
          </div>
          <p className="side-copy">{syncCopy}</p>

          {isSupabaseConfigured && session && (
            <div className="account-row">
              <span>{session.user.email ?? "Signed in"}</span>
              <button type="button" onClick={handleSignOut}>
                Sign out
              </button>
              <button type="button" onClick={() => setSyncRevision((value) => value + 1)} disabled={!isOnline || cloudStatus === "saving" || cloudStatus === "loading"}>
                <Icon name="cloud" size={16} /> Sync now
              </button>
            </div>
          )}

          {isSupabaseConfigured && !session && (
            <div className="auth-stack">
              <form className="auth-form password-auth-form" onSubmit={handleSignInWithPassword}>
                <label>
                  Email
                  <input
                    type="email"
                    value={authEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                    onChange={(event) => setAuthEmail(event.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    placeholder="At least 8 characters"
                    autoComplete="current-password"
                    minLength={8}
                    onChange={(event) => setAuthPassword(event.target.value)}
                  />
                </label>
                <div className="auth-button-row">
                  <button type="submit">
                    <Icon name="user" size={17} /> Sign in
                  </button>
                  <button className="secondary" type="button" onClick={handleCreateAccount}>
                    <Icon name="check" size={17} /> Create account
                  </button>
                </div>
                <p>
                  Use the same email and password on your iPhone Home Screen app, MacBook, and
                  any other device.
                </p>
              </form>
            </div>
          )}

          {!isSupabaseConfigured && (
            <code className="env-hint">VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY</code>
          )}

          {lastCloudSyncedAt && session && (
            <p className="sync-message">Last cloud sync: {lastCloudSyncedAt}</p>
          )}
          {authMessage && <p className="sync-message">{authMessage}</p>}
          {cloudError && <p className="sync-message error" role="alert">{cloudError}</p>}
        </section>
      </main>
    );
  }

  if (appMode === "diet") {
    return (
      <main className={`app-shell diet-shell diet-${selectedDietType} ${selectedDietAccent}`}>
        <header className="app-header diet-app-header">
          <div className="brand-lockup">
            <span className="brand-mark diet-mark">DP</span>
            <div>
              <p className="eyebrow">Diet tracker · {selectedDietTarget.label}</p>
              <h1>Recomp Diet Console</h1>
            </div>
          </div>

          <div className="header-status-grid" aria-label="Diet status">
            <div className="header-status-card">
              <span>Selected day</span>
              <strong>{selectedDietDay.session.title}</strong>
              <small>
                {formatDate(selectedDietDay.iso)} · Week {selectedDietDay.week} · Day {selectedDietDay.index + 1}
              </small>
            </div>
            <div className={`header-status-card sync-mini ${cloudStatus}`}>
              <span>Save</span>
              <strong>{localSaveError ? "Save needs attention" : lastSavedAt ?? "Ready"}</strong>
              <small>{syncHeadline}</small>
            </div>
          </div>

          <div className="mode-inline-actions">
            <button type="button" onClick={() => setAppMode("hub")}>
              Coach Hub
            </button>
            <button type="button" onClick={() => setAppMode("workout")}>
              Workout
            </button>
          </div>
        </header>

        <section className="diet-summary-panel" aria-labelledby="diet-heading">
          <div>
            <p className="eyebrow">Today&apos;s diet plan</p>
            <h2 id="diet-heading">
              {formatDate(selectedDietDay.iso)} · {selectedDietTarget.label}
            </h2>
            <p>{selectedDietCoachNote}</p>
          </div>
          <div className="diet-target-grid">
            <div>
              <span>Calorie target</span>
              <strong>{selectedDietTarget.calories}</strong>
            </div>
            <div>
              <span>Protein</span>
              <strong>{selectedDietTarget.protein}</strong>
            </div>
            <div>
              <span>Carbs</span>
              <strong>{selectedDietTarget.carbs}</strong>
            </div>
            <div>
              <span>Fat</span>
              <strong>{selectedDietTarget.fat}</strong>
            </div>
          </div>
          <details className={`adaptive-diet-panel ${adaptiveDietCoach.tone}`}>
            <summary>
              <span className="eyebrow"><Icon name="spark" size={14} /> Smart portions · {adaptiveDietCoach.label}</span>
              <strong>{adaptiveDietCoach.headline}</strong>
            </summary>
            <p>{adaptiveDietCoach.detail}</p>
            <div className="adaptive-signal-grid" aria-label="Smart portion signals">
              <span>
                <strong>{adaptiveDietCoach.label}</strong>
                Coach mode
              </span>
              <span>
                <strong>{adaptiveDietCoach.trend.label}</strong>
                Weight trend
              </span>
              <span>
                <strong>{adaptiveDietCoach.adherence.label}</strong>
                Workout follow-through
              </span>
              <span>
                <strong>{proteinReference.label}</strong>
                Protein basis
              </span>
            </div>
          </details>
        </section>

        <section className="diet-control-panel" aria-label="Diet day controls">
          <label className="week-jump">
            <span>Jump to week</span>
            <select
              value={selectedDietWeekStart}
              onChange={(event) => setSelectedDietDate(event.target.value)}
              aria-label="Jump to diet week"
            >
              {weekOptions.map((week) => (
                <option key={week.value} value={week.value}>
                  {week.label} · {week.detail}
                </option>
              ))}
            </select>
          </label>
          <nav className="diet-week-strip" aria-label="Choose diet day">
            {currentDietWeekDays.map((day) => {
              const log = normalizeDietDayLog(store.dietDays[day.iso]);
              return (
                <button
                  key={day.iso}
                  className={`diet-day-button ${day.iso === selectedDietDay.iso ? "active" : ""} ${
                    log.completed ? "complete" : ""
                  } ${dietDayTypeForPlanDay(day)} ${day.session.accent}`}
                  onClick={() => setSelectedDietDate(day.iso)}
                  type="button"
                >
                  <span>{day.dayName.slice(0, 3)}</span>
                  <strong>{day.session.code}</strong>
                  <small>
                    {log.completed ? "Completed" : personalizedDietTarget(
                      dietDayTypeForPlanDay(day),
                      store.settings,
                      proteinReference.weight,
                    ).calories}
                  </small>
                </button>
              );
            })}
          </nav>
          <div className="strip-actions diet-date-actions">
            <button type="button" onClick={() => setSelectedDietDate(previousDietDay.iso)}>
              Prev
            </button>
            <button type="button" onClick={() => setSelectedDietDate(closestProgramDate())}>
              Today
            </button>
            <button type="button" onClick={() => setSelectedDietDate(nextDietDay.iso)}>
              Next
            </button>
          </div>
        </section>

        <section className="diet-progress-panel" aria-label="Diet progress">
          <div className="progress-meter">
            <div>
              <span>Meal progress</span>
              <strong>
                {dietCompletedMealCount}/{dietMealRows.length}
              </strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${dietCompletionPercent}%` }} />
            </div>
          </div>
          <span className={`diet-status-chip ${dietDayComplete ? "complete" : "open"}`}>
            {dietDayComplete ? "Diet day complete" : "Meals open"}
          </span>
        </section>

        <div className="diet-layout">
          <section className="diet-meal-stack" aria-label="Meals for selected day">
            {dietMealRows.map((meal) => (
              <article
                key={meal.slot}
                className={`diet-meal-card slot-${meal.slot} ${meal.isComplete ? "complete" : ""} ${
                  meal.isSwapped ? "swapped" : ""
                }`}
              >
                <div className="diet-meal-header">
                  <img src={meal.recipe.photo} alt={`${meal.recipe.title} plate`} loading="lazy" />
                  <div className="diet-meal-content">
                    <div className="diet-meal-topline">
                      <span className="diet-slot-chip">{meal.label}</span>
                      <span className="diet-timing-chip">{meal.timing}</span>
                      {meal.isSwapped && <span className="diet-swap-chip">Swap version</span>}
                    </div>
                    <h3>{meal.recipe.title}</h3>
                    <div className="diet-macro-row">
                      <span>Base: {meal.recipe.calories}</span>
                      <span>{meal.recipe.protein}</span>
                    </div>
                    <div className="diet-tag-row">
                      {meal.recipe.tags.slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {meal.isSwapped && (
                  <div className="swap-alert diet-swap-alert">
                    <div>
                      <span className="swap-alert-label">
                        <Icon name="swap" size={15} /> Swap version
                      </span>
                      <strong>{meal.recipe.title}</strong>
                      <small>Original plan: {meal.baseRecipe.title}</small>
                    </div>
                    <button
                      className="swap-revert-button"
                      type="button"
                      onClick={() => setDietSwap(meal.slot, meal.baseRecipe.id)}
                    >
                      Revert to original
                    </button>
                  </div>
                )}

                <div className="diet-card-grid diet-basics-grid">
                  <div>
                    <h4>Ingredients</h4>
                    <ul>
                      {meal.recipe.ingredients.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Plate</h4>
                    <ul>
                      {meal.recipe.plate.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <details className={`smart-portion-card ${meal.portionAdvice.tone}`}>
                  <summary className="flow-heading">
                    <h4>{meal.portionAdvice.title}</h4>
                    <span>Smart plate</span>
                  </summary>
                  <p>{meal.portionAdvice.detail}</p>
                  <ul>
                    {meal.portionAdvice.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>

                <div className="diet-meal-actions">
                  <button
                    className={`diet-complete-button ${meal.isComplete ? "complete" : ""}`}
                    type="button"
                    onClick={() => toggleDietMeal(meal.slot)}
                  >
                    <Icon name={meal.isComplete ? "check" : "activity"} size={16} />
                    {meal.isComplete ? "Done" : "Mark eaten"}
                  </button>
                  <button
                    className="diet-howto-button"
                    type="button"
                    aria-expanded={openDietHowToSlot === meal.slot}
                    onClick={() => {
                      setOpenDietSwapSlot(null);
                      setOpenDietHowToSlot((slot) => (slot === meal.slot ? null : meal.slot));
                    }}
                  >
                    <Icon name="library" size={16} />
                    Make It
                  </button>
                  <button
                    className="diet-swap-button"
                    type="button"
                    onClick={() => {
                      setOpenDietHowToSlot(null);
                      setOpenDietSwapSlot((slot) => (slot === meal.slot ? null : meal.slot));
                    }}
                  >
                    <Icon name="swap" size={16} />
                    Swap
                  </button>
                  {meal.isSwapped && (
                    <button
                      className="diet-original-button"
                      type="button"
                      onClick={() => setDietSwap(meal.slot, meal.baseRecipe.id)}
                    >
                      Revert to original
                    </button>
                  )}
                </div>

                {openDietHowToSlot === meal.slot && (
                  <div className="diet-howto-panel">
                    <div className="flow-heading">
                      <h4>How To: {meal.recipe.title}</h4>
                      <span>Beginner steps</span>
                    </div>
                    {meal.isSwapped && (
                      <p className="swap-note">
                        Swap version. Original plan: {meal.baseRecipe.title}. Use the revert button above if you want the main plan meal back.
                      </p>
                    )}
                    <ol className="diet-howto-steps">
                      {meal.howTo.map((step, stepIndex) => (
                        <li key={`${meal.recipe.id}-how-to-${stepIndex}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {openDietSwapSlot === meal.slot && (
                  <div className="diet-swap-panel">
                    <div className="flow-heading">
                      <h4>Swap {meal.label}</h4>
                      <span>Same meal category</span>
                    </div>
                    <div className="diet-swap-grid">
                      {meal.swaps.map((recipe) => (
                        <button
                          key={recipe.id}
                          type="button"
                          onClick={() => setDietSwap(meal.slot, recipe.id)}
                        >
                          <strong>{recipe.shortTitle}</strong>
                          <span>{recipe.calories} · {recipe.protein}</span>
                          <small>{recipe.tags.slice(0, 3).join(" / ")}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>

          <aside className="diet-side-panel" aria-label="Diet notes and tracking">
            <section className="diet-side-card preworkout-fuel-card">
              <p className="eyebrow">
                <Icon name="activity" size={14} /> Fuel timing
              </p>
              <div className="flow-heading">
                <h2>{afterWorkGymFuel.title}</h2>
                <span>{afterWorkGymFuel.label}</span>
              </div>
              <div className="fuel-step-list">
                {afterWorkGymFuel.steps.map((step) => (
                  <div key={step.label}>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                ))}
              </div>
              <p className="fuel-caution">{afterWorkGymFuel.caution}</p>
            </section>

            <section className="diet-side-card shopping-list-card">
              <p className="eyebrow">
                <Icon name="cart" size={14} /> To buy
              </p>
              <h2>This week</h2>
              <p>Use this as the weekly ingredient list for the recipes currently showing, including your swaps.</p>
              <div className="shopping-list-groups">
                {dietShoppingGroups.map((group) => (
                  <div key={group.category} className="shopping-group">
                    <h3>{group.category}</h3>
                    {group.items.slice(0, 8).map((item) => (
                      <div key={`${group.category}-${item.name}`} className="shopping-item">
                        <strong>{item.name}</strong>
                        <span>{item.recipeNames.length} meal{item.recipeNames.length === 1 ? "" : "s"}</span>
                        <small>{item.portions.slice(0, 2).join(" · ")}</small>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <section className="diet-side-card">
              <p className="eyebrow">Scenario help</p>
              <h2>Smart swaps</h2>
              <div className="scenario-list">
                <div>
                  <strong>Need lifting fuel</strong>
                  <span>Use cottage banana, yogurt banana toast, yogurt oats, or shake meal.</span>
                </div>
                <div>
                  <strong>No cooked protein</strong>
                  <span>Use a yogurt bowl, cottage bowl, tuna plate, or emergency shake.</span>
                </div>
                <div>
                  <strong>Sensitive stomach</strong>
                  <span>Choose banana, toast, yogurt, or lower-fibre meals near training.</span>
                </div>
              </div>
            </section>

            <section className="diet-side-card">
              <p className="eyebrow">Diet notes</p>
              <h2>Today</h2>
              <label className="notes-field">
                Note
                <textarea
                  value={selectedDietLog.notes}
                  placeholder="Hunger, digestion, swaps, meal prep, or anything to remember..."
                  onChange={(event) =>
                    updateDietDay(selectedDietDay.iso, (log) => ({
                      ...log,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </section>
          </aside>
        </div>

        <nav className="diet-bottom-bar" aria-label="Diet mode navigation">
          <button type="button" onClick={() => setAppMode("hub")}>
            Hub
          </button>
          <button type="button" onClick={() => setAppMode("workout")}>
            Workout
          </button>
          <button type="button" onClick={() => setSelectedDietDate(closestProgramDate())}>
            Today
          </button>
        </nav>
      </main>
    );
  }

  return (
    <main className={`app-shell section-${activeSection}`}>
      <header className={`app-header ${headerDay.session.accent}`}>
        <div className="brand-lockup">
          <span className="brand-mark">RG</span>
          <div>
            <p className="eyebrow">Workout tracker · {activeSectionLabel}</p>
            <h1>Recomp Gym Console</h1>
          </div>
        </div>

        <div className="header-status-grid" aria-label="Current status">
          <div className="header-status-card">
            <span>{headerDay.iso === currentProgramDate ? "Today" : "Selected day"}</span>
            <strong>{headerDay.session.title}</strong>
            <small>
              {formatDate(headerDay.iso)} · Week {headerDay.week} · Day {headerDay.index + 1}
            </small>
          </div>
          <div className={`header-status-card sync-mini ${cloudStatus}`}>
            <span>Save</span>
            <strong>{localSaveError ? "Save needs attention" : lastSavedAt ?? "Ready"}</strong>
            <small>{syncHeadline}</small>
          </div>
        </div>
        <div className="mode-inline-actions">
          <button type="button" onClick={() => setAppMode("hub")}>
            Coach Hub
          </button>
          <button type="button" onClick={() => setAppMode("diet")}>
            Diet
          </button>
        </div>
      </header>

      <nav className="section-tabs" aria-label="Main app sections">
        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            className={activeSection === id ? "active" : ""}
            type="button"
            onClick={() => switchSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
          >
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="week-planner" aria-label="Program week">
        <div className="week-planner-top">
          <div>
            <p className="eyebrow">Week {selectedDay.week}</p>
            <h2>{selectedDay.session.title}</h2>
          </div>
          <label className="week-jump">
            <span>Jump to week</span>
            <select
              value={selectedWeekStart}
              onChange={(event) => setSelectedDate(event.target.value)}
              aria-label="Jump to week"
            >
              {weekOptions.map((week) => (
                <option key={week.value} value={week.value}>
                  {week.label} · {week.detail}
                </option>
              ))}
            </select>
          </label>
        </div>

        <nav className="week-grid" aria-label="Days in selected week">
          {currentWeekDays.map((day) => (
            <button
              key={day.iso}
              className={`week-day-card ${day.iso === selectedDay.iso ? "active" : ""} ${
                dayStatusForDay(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso]))
              } ${day.session.type}`}
              onClick={() => setSelectedDate(day.iso)}
              type="button"
              aria-label={`${formatDate(day.iso)} ${day.session.title}, ${dayStatusLabel(dayStatusForDay(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso])))}`}
            >
              <span>{day.dayName.slice(0, 3)}</span>
              <strong>{day.session.code}</strong>
              <small>{day.session.title}</small>
            </button>
          ))}
        </nav>
      </section>

      <section className="progress-strip" aria-label="Program progress">
        <div className="progress-meter">
          <div>
            <span>Program progress</span>
            <strong>{stats.percent}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${stats.percent}%` }} />
          </div>
        </div>
        <div className="quick-stat">
          <span>Streak</span>
          <strong>{stats.streak}</strong>
        </div>
        <div className="quick-stat">
          <span>Completed</span>
          <strong>
            {stats.completedDays}/{PROGRAM_DAYS}
          </strong>
        </div>
        <div className="strip-actions">
          <button type="button" onClick={() => setSelectedDate(previousDay.iso)}>
            Prev
          </button>
          <button type="button" onClick={goToCurrentProgramDay}>
            Today
          </button>
          <button type="button" onClick={() => setSelectedDate(nextDay.iso)}>
            Next
          </button>
        </div>
      </section>

      <div className="mobile-save-status" aria-live="polite">
        <span>Local save</span>
        <strong>{localSaveError ? "Save needs attention" : isHydrated ? lastSavedAt ?? "Ready" : "Loading"}</strong>
      </div>

      <section className="today-day-switcher" aria-label="Choose workout day">
        <div>
          <p className="eyebrow">Selected workout day</p>
          <h2>{selectedDay.session.title}</h2>
          <p>
            {formatDate(selectedDay.iso)} · Day {selectedDay.index + 1} · PDF {selectedDay.planDayName}
          </p>
        </div>
        <label className="week-jump">
          <span>Jump to week</span>
          <select
            value={selectedWeekStart}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="Jump to week"
          >
            {weekOptions.map((week) => (
              <option key={week.value} value={week.value}>
                {week.label} · {week.detail}
              </option>
            ))}
          </select>
        </label>
        <nav className="today-week-strip" aria-label="Choose day in selected week">
          {currentWeekDays.map((day) => (
            <button
              key={day.iso}
              className={`today-day-button ${day.iso === selectedDay.iso ? "active" : ""} ${
                dayStatusForDay(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso]))
              } ${day.session.type}`}
              onClick={() => setSelectedDate(day.iso)}
              type="button"
              aria-label={`${formatDate(day.iso)} ${day.session.title}, ${dayStatusLabel(dayStatusForDay(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso])))}`}
            >
              <span>{day.dayName.slice(0, 3)}</span>
              <strong>{day.session.code}</strong>
              <small>{day.index + 1}</small>
            </button>
          ))}
        </nav>
      </section>

      <section className="gym-mode-shell" aria-label="Gym mode">
        <div className="gym-day-context">
          <div>
            <p className="eyebrow">Gym Mode · Today</p>
            <h2>{formatDate(gymDay.iso)}</h2>
            <p>{gymDay.session.title}</p>
          </div>
          {!gymSessionResolved && gymDayStatus !== "complete" && (
            <button className="day-skip-button" type="button"
              aria-label={`Skip today's workout, ${formatDate(gymDay.iso)}`}
              onClick={() => requestSkipReason(gymCoachDay, null, "gym")}>
              <Icon name="x" size={18} /> Skip Today
            </button>
          )}
        </div>
        {gymSessionResolved ? (
          <section className="empty-gym-card gym-session-summary" aria-live="polite">
            <span className={`day-status-chip ${gymDayStatus}`}>{dayStatusLabel(gymDayStatus)}</span>
            <h2>{gymLog.daySkipReason ? "Day skipped" : gymDayStatus === "complete" ? "Workout complete" : "Finished with skips"}</h2>
            {gymLog.daySkipReason && <p>Reason: {skipReasonLabel(gymLog.daySkipReason)}. Your logged sets and weights are saved.</p>}
            {gymMoveRows.length > 0 && <p>{gymCompletedMoves} moves completed · {gymSkippedMoves} skipped</p>}
            <div className="day-summary-actions">
              {gymLog.daySkipReason && (
                <button type="button" onClick={() => {
                  updateDay(gymDay.iso, (log) => reopenPlanDay(gymCoachDay, log));
                  setGymStartedAt(Date.now());
                }}>
                  Resume Day
                </button>
              )}
              <button type="button" onClick={() => { goToCurrentProgramDay(); setActiveSection("today"); }}>
                Review Today
              </button>
            </div>
          </section>
        ) : currentGymMove && currentGymExercise && currentGymRows ? (
          <article key={`${gymDay.iso}:${currentGymExercise.id}`} className={`gym-card ${currentGymExercise.family} ${currentGymMove.isSkipped ? "skipped" : ""}`}>
            <div className="gym-topbar">
              <button
                type="button"
                onClick={goToPreviousGymMove}
                disabled={!hasPreviousUnfinishedGymMove}
                aria-label="Previous move"
              >
                <Icon name="chevronLeft" size={18} />
              </button>
              <span>
                Move {gymExerciseIndex + 1} of {gymExercises.length} · Elapsed {formatDuration(gymElapsedSeconds)}
              </span>
              <button
                type="button"
                onClick={goToNextGymMove}
                disabled={!hasNextUnfinishedGymMove}
                aria-label="Next move"
              >
                <Icon name="chevronRight" size={18} />
              </button>
            </div>

            <div className="gym-main">
              <div>
                <div className="exercise-labels">
                  <span className="family-chip">{familyLabel(currentGymExercise.family)}</span>
                  <span className={`priority-chip priority-${currentGymMove.priority}`}>
                    {currentGymMove.priorityLabel}
                  </span>
                  <span className={`move-status-chip ${currentGymMove.status}`}>
                    {currentGymMove.statusLabel}
                  </span>
                  {currentGymLocation && (
                    <span className={`location-chip ${currentGymLocation.type}`}>
                      {currentGymLocation.label}
                    </span>
                  )}
                  <span className="order-chip">
                    {completedRows(currentGymRows)}/{currentGymRows.length} sets
                  </span>
                  {currentGymMove.isSwapped && currentGymOriginalExercise && (
                    <span className="swap-chip">Swap version</span>
                  )}
                </div>
                <h2>{currentGymExercise.name}</h2>
                <p>{currentGymTarget}</p>
              </div>
              <div className="gym-media-stack">
                <ExerciseMedia exercise={currentGymExercise} variant="gym" />
                <ExerciseMediaLinks exercise={currentGymExercise} />
              </div>
            </div>

            <div className={`gym-coach-strip readiness-${gymReadinessStatus}`}>
              <div>
                <span>Today</span>
                <strong>{gymPhase.title}</strong>
                <small>Training Week {gymTrainingWeek} · {gymPhase.timeCap} · {gymSessionTime}</small>
              </div>
              <div>
                <span>RIR target</span>
                <strong>{gymPhase.rir}</strong>
                <small>{rirExplanationForWeek(gymTrainingWeek)}</small>
              </div>
              <div>
                <span>Readiness</span>
                <strong>{gymReadinessCopy.label}</strong>
                <small>{gymReadinessCopy.detail}</small>
              </div>
            </div>

            <div className="gym-priority-panel" aria-label="Gym priority plan">
              <div>
                <span>Must complete</span>
                <strong>
                  {gymPriorityBuckets.main.map((move) => move.activeExercise.shortName).join(" · ") || "Done"}
                </strong>
              </div>
              <div>
                <span>Next priority</span>
                <strong>
                  {gymPriorityBuckets.accessory.map((move) => move.activeExercise.shortName).join(" · ") || "Done"}
                </strong>
              </div>
              <div>
                <span>Optional if time</span>
                <strong>
                  {gymPriorityBuckets.optional.map((move) => move.activeExercise.shortName).join(" · ") || "None today"}
                </strong>
              </div>
            </div>

            {restTimer && (
              <div className={`rest-timer-card ${restSecondsLeft === 0 ? "ready" : ""}`}>
                <div>
                  <span>{restSecondsLeft === 0 ? "Rest complete" : restTimer.label}</span>
                  <strong>{formatDuration(restSecondsLeft)}</strong>
                  <small>Use the full rest for better next-set quality.</small>
                </div>
                <div className="rest-timer-track">
                  <span style={{ width: `${restProgressPercent}%` }} />
                </div>
                <div className="rest-timer-actions">
                  <button type="button" onClick={() => setRestTimer(null)}>
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRestTimer((timer) =>
                        timer
                          ? {
                              ...timer,
                              endAt: Math.max(timer.endAt, Date.now()) + 30_000,
                              totalSeconds: timer.totalSeconds + 30,
                            }
                          : timer,
                      )
                    }
                  >
                    +30 sec
                  </button>
                </div>
              </div>
            )}

            {currentGymMove.isSwapped && currentGymOriginalExercise && (
              <div className="swap-alert workout-swap-alert">
                <div>
                  <span className="swap-alert-label">
                    <Icon name="swap" size={15} /> Swap version
                  </span>
                  <strong>{currentGymExercise.name}</strong>
                  <small>Original plan: {currentGymOriginalExercise.name}</small>
                </div>
                <button
                  className="swap-revert-button"
                  type="button"
                  onClick={() =>
                    setGymExerciseSwap(currentGymOriginalExercise.id, currentGymOriginalExercise.id)
                  }
                >
                  Revert to original
                </button>
              </div>
            )}

            <div className="gym-target-grid">
              <div>
                <span>Target</span>
                <strong>{currentGymTarget}</strong>
              </div>
              <div>
                <span>Rest</span>
                <strong>{currentGymRest}</strong>
              </div>
              <div>
                <span>Equipment</span>
                <strong>{currentGymExercise.equipment}</strong>
              </div>
              {currentGymLocation && (
                <div className={`location-fact ${currentGymLocation.type}`}>
                  <span>Where</span>
                  <strong>{currentGymLocation.label}</strong>
                  <small>{currentGymLocation.detail}</small>
                </div>
              )}
              <div>
                <span>Last load</span>
                <strong>
                  {currentGymPreviousLoad ? formatLoggedWeightText(currentGymPreviousLoad.weights) : "New"}
                </strong>
              </div>
            </div>

            {currentGymOriginalExercise && currentGymMove.swaps.length > 0 && (
              <div className="swap-control-strip" aria-label={`${currentGymOriginalExercise.name} swap options`}>
                <span>
                  <Icon name="swap" size={15} /> Swap
                </span>
                <button
                  className={!currentGymMove.isSwapped ? "selected" : ""}
                  type="button"
                  onClick={() => setGymExerciseSwap(currentGymOriginalExercise.id, currentGymOriginalExercise.id)}
                >
                  Original
                </button>
                {currentGymMove.swaps.map((swap) => (
                  <button
                    key={swap.id}
                    className={currentGymExercise.id === swap.id ? "selected" : ""}
                    type="button"
                    onClick={() => setGymExerciseSwap(currentGymOriginalExercise.id, swap.id)}
                  >
                    {swap.shortName}
                  </button>
                ))}
              </div>
            )}

            {currentGymSuggestion && (
              <div className={`load-suggestion smart-load ${currentGymSuggestion.tone}`}>
                <Icon name="spark" size={16} />
                <span>
                  <strong>{currentGymSuggestion.label}</strong>
                  <small>{currentGymSuggestion.detail}</small>
                </span>
              </div>
            )}

            {currentGymMove.beginnerTeaching && (
              <div className="beginner-teaching-card">
                <span>Month 1 coach</span>
                <p>{currentGymMove.beginnerTeaching}</p>
              </div>
            )}

            <div className="instant-cue-card">
              <span>Three cues now</span>
              <ul>
                {currentGymExercise.cues.slice(0, 3).map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
            </div>

            {currentGymOriginalExercise && (
              <div className={`skip-control-strip ${currentGymMove.isSkipped ? "is-skipped" : ""}`}>
                <span>
                  {currentGymMove.isSkipped
                    ? `Skipped because of ${skipReasonLabel(currentGymMove.skipReason ?? "other")}`
                    : "Need to skip this move?"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    currentGymMove.isSkipped
                      ? reopenSkippedExerciseForDay(gymCoachDay, currentGymOriginalExercise.id)
                      : requestSkipReason(gymCoachDay, currentGymOriginalExercise.id, "gym")
                  }
                >
                  {currentGymMove.isSkipped ? "Reopen Move" : "Skip Move"}
                </button>
              </div>
            )}

            <div
              className={`set-table gym-set-table ${currentGymTracksWeight ? "" : "no-load"}`}
              aria-label={`${currentGymExercise.name} gym set log`}
            >
              <div className="set-head">
                <span>Set</span>
                <span>Target</span>
                {currentGymTracksWeight && <span>Weight (lbs)</span>}
                {currentGymTracksWeight && <span>Reps</span>}
                {currentGymTracksWeight && <span>Feel</span>}
                <span>Done</span>
              </div>
              {currentGymRows.map((set, setIndex) => (
                <div className="set-row" key={`${currentGymExercise.id}-gym-${setIndex}`}>
                  <span>{setIndex + 1}</span>
                  <strong className="target-pill">{currentGymTarget}</strong>
                  {currentGymTracksWeight ? (
                    <input
                      inputMode="decimal"
                      value={set.weight}
                      placeholder="lbs"
                      onChange={(event) =>
                        updateGymSet(currentGymExercise.id, setIndex, "weight", event.target.value)
                      }
                      aria-label={`${currentGymExercise.name} set ${setIndex + 1} weight in pounds`}
                    />
                  ) : null}
                  {currentGymTracksWeight ? (
                    <input
                      inputMode="numeric"
                      value={set.reps}
                      placeholder="reps"
                      onChange={(event) =>
                        updateGymSet(currentGymExercise.id, setIndex, "reps", event.target.value)
                      }
                      aria-label={`${currentGymExercise.name} set ${setIndex + 1} reps`}
                    />
                  ) : null}
                  {currentGymTracksWeight ? (
                    <select
                      className={`effort-select effort-${set.effort ?? "unset"}`}
                      value={set.effort ?? ""}
                      onChange={(event) =>
                        updateGymSet(
                          currentGymExercise.id,
                          setIndex,
                          "effort",
                          event.target.value || undefined,
                        )
                      }
                      aria-label={`${currentGymExercise.name} set ${setIndex + 1} feel`}
                    >
                      <option value="">Feel</option>
                      {effortOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <label className="mini-check">
                    <input
                      type="checkbox"
                      checked={set.done}
                      onChange={(event) =>
                        updateGymSet(currentGymExercise.id, setIndex, "done", event.target.checked)
                      }
                    />
                    <span />
                  </label>
                </div>
              ))}
            </div>

            <div className="gym-details-grid">
              <details className="form-details">
                <summary>How to do it</summary>
                <ul>
                  {currentGymExercise.cues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
              <details className="form-details">
                <summary>Common mistakes</summary>
                <ul>
                  {currentGymExercise.avoid.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
            </div>

            <div className="gym-action-bar">
              <button
                type="button"
                onClick={goToPreviousGymMove}
                disabled={!hasPreviousUnfinishedGymMove}
                aria-label="Previous move"
              >
                <Icon name="chevronLeft" size={18} />
                <span className="gym-action-label optional">Previous</span>
              </button>
              <button
                className={`primary ${
                  gymPrimaryIsResolved
                    ? currentGymMove?.isSkipped
                      ? "is-skipped"
                      : "is-complete"
                    : "is-pending"
                }`}
                type="button"
                onClick={completeNextGymSet}
                aria-label={gymPrimaryFullLabel}
              >
                <Icon name={gymPrimaryIsResolved ? "check" : "activity"} size={18} />
                <span className="gym-action-label gym-action-full">{gymPrimaryFullLabel}</span>
                <span className="gym-action-label gym-action-short">{gymPrimaryShortLabel}</span>
              </button>
              <button
                type="button"
                onClick={goToNextGymMove}
                disabled={!hasNextUnfinishedGymMove}
                aria-label="Next move"
              >
                <span className="gym-action-label optional">Next</span>
                <Icon name="chevronRight" size={18} />
              </button>
            </div>
          </article>
        ) : (
          <section className="empty-gym-card">
            <p className="eyebrow">{gymDay.session.title}</p>
            <h2>No gym moves today</h2>
            <p>{gymSessionSummary}</p>
            <button type="button" onClick={() => { goToCurrentProgramDay(); setActiveSection("today"); }}>
              Back to Today
            </button>
          </section>
        )}
      </section>

      <div className="layout-grid">
        <section className={`workout-panel today-command-panel ${selectedDay.session.accent}`} aria-labelledby="today-heading">
          <div className="today-command-header">
            <div>
              <p className="eyebrow">{sessionTypeLabels[selectedDay.session.type]}</p>
              <h2 id="today-heading">{selectedDay.session.title}</h2>
              <p className="today-command-date">
                {formatDate(selectedDay.iso)} · Day {selectedDay.index + 1} · {phase.label}
              </p>
              <span className={`day-status-chip ${selectedDayStatus}`}>
                {selectedDayStatusText}
              </span>
            </div>
            <div className="today-actions">
              {selectedExercises.length > 0 && (
                <button className="gym-launch-button" type="button" onClick={() => switchSection("gym")}
                  aria-label={`Open Gym Mode for today, ${formatDate(gymDay.iso)}`}>
                  <Icon name="play" size={18} /> {selectedDay.iso === currentProgramDate ? "Gym Mode" : "Gym Mode · Today"}
                </button>
              )}
              <button className="day-skip-button" type="button" disabled={selectedDayComplete}
                aria-label={`${selectedLog.daySkipReason ? "Resume" : "Skip"} workout for ${formatDate(selectedDay.iso)}`}
                onClick={() => selectedLog.daySkipReason
                  ? updateDay(selectedDay.iso, (log) => reopenPlanDay(selectedCoachDay, log))
                  : requestSkipReason(selectedCoachDay, null, "today")}>
                <Icon name={selectedLog.daySkipReason ? "play" : "x"} size={18} />
                {selectedLog.daySkipReason ? "Resume Day" : selectedDay.iso === currentProgramDate ? "Skip Today" : "Skip Day"}
              </button>
              <button
                className={`complete-button ${selectedDayComplete ? "is-complete" : ""} ${
                  selectedDayStatus === "finished-with-skips" || selectedDayStatus === "skipped" ? "is-skipped" : ""
                }`}
                type="button"
                disabled={selectedDayComplete}
                onClick={() =>
                  updateDay(selectedDay.iso, (log) => completePlanDay(selectedCoachDay, log))
                }
              >
                {selectedCompletionButtonLabel}
              </button>
            </div>
          </div>

          {selectedLog.daySkipReason && (
            <p className="day-skipped-notice" role="status">
              <strong>{formatDate(selectedDay.iso, "short")} skipped:</strong> {skipReasonLabel(selectedLog.daySkipReason)}.
              {" "}Logged sets and weights are saved. Resume Day reopens the remaining work.
            </p>
          )}
          <div className="command-progress-grid">
            <div className="command-progress-card primary">
              <span>Move progress</span>
              <strong>
                {completedMoveCount}/{workoutMoveRows.length || selectedDay.session.tasks.length}
              </strong>
              <div className="progress-track compact">
                <span style={{ width: `${moveCompletionPercent}%` }} />
              </div>
            </div>
            <div className="command-progress-card">
              <span>Next</span>
              <strong>{nextOpenMove?.activeExercise.shortName ?? (selectedLog.daySkipReason ? "Day skipped" : selectedDayStatus !== "incomplete" ? "Nothing remaining" : "Recovery")}</strong>
              <small>{nextOpenMove?.target ?? (selectedDayStatus !== "incomplete" ? selectedDayStatusText : selectedSessionSummary)}</small>
            </div>
            <div className="command-progress-card">
              <span>Session</span>
              <strong>{selectedSessionTime}</strong>
              <small>{selectedSessionTimeDetail}</small>
            </div>
            <div className="command-progress-card">
              <span>Training level</span>
              <strong>Week {selectedTrainingWeek}</strong>
              <small>{trainingLevelCopy(selectedDay.week, selectedTrainingWeek)}</small>
            </div>
          </div>

          <p className="plan-note">{selectedSessionSummary}</p>
          <p className="phase-note">{phase.note}</p>
          <p className="phase-note">
            <strong>{phase.title}:</strong> {phase.sets} · {phase.timeCap} target · {phase.rir}.
          </p>
          <p className="location-flow-note">
            <strong>Home/gym split:</strong> {selectedLocationNote}
          </p>

          <section className={`readiness-card readiness-${selectedReadinessStatus}`} aria-labelledby="readiness-heading">
            <div className="flow-heading">
              <div>
                <p className="eyebrow">Readiness check</p>
                <h3 id="readiness-heading">{selectedReadinessCopy.label}</h3>
              </div>
              <span>{selectedReadinessStatus}</span>
            </div>
            <p>{selectedReadinessCopy.detail}</p>
            <div className="readiness-grid">
              <div>
                <strong>Energy</strong>
                <div className="readiness-options">
                  {readinessQuestions.energy.map((option) => (
                    <button
                      key={option.id}
                      className={selectedLog.readiness.energy === option.id ? "selected" : ""}
                      type="button"
                      onClick={() => updateReadiness(selectedCoachDay, "energy", option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <strong>Soreness</strong>
                <div className="readiness-options">
                  {readinessQuestions.soreness.map((option) => (
                    <button
                      key={option.id}
                      className={selectedLog.readiness.soreness === option.id ? "selected" : ""}
                      type="button"
                      onClick={() => updateReadiness(selectedCoachDay, "soreness", option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <strong>Joint pain</strong>
                <div className="readiness-options">
                  {readinessQuestions.jointPain.map((option) => (
                    <button
                      key={option.id}
                      className={selectedLog.readiness.jointPain === option.id ? "selected" : ""}
                      type="button"
                      onClick={() => updateReadiness(selectedCoachDay, "jointPain", option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <strong>Sleep</strong>
                <div className="readiness-options">
                  {readinessQuestions.sleep.map((option) => (
                    <button
                      key={option.id}
                      className={selectedLog.readiness.sleep === option.id ? "selected" : ""}
                      type="button"
                      onClick={() => updateReadiness(selectedCoachDay, "sleep", option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="checklist-block compact-targets" aria-labelledby="tasks-heading">
            <div className="flow-heading">
              <h3 id="tasks-heading">Today&apos;s Targets</h3>
              <span>{completedTaskCount}/{selectedDay.session.tasks.length}</span>
            </div>
            <div className="progress-track compact task-track">
              <span style={{ width: `${taskCompletionPercent}%` }} />
            </div>
            <div className="check-grid compact">
              {selectedDay.session.tasks.map((task) => (
                <label key={task} className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedLog.tasks[task])}
                    onChange={() => toggleTask(task)}
                  />
                  <span>
                    <strong>{task}</strong>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {workoutMoveRows.length > 0 ? (
            <section className="exercise-stack compact-flow" aria-labelledby="exercise-heading">
              <div className="flow-heading">
                <h3 id="exercise-heading">Workout Flow</h3>
                <span>
                  {completedMoveCount}/{workoutMoveRows.length} done
                  {skippedMoveCount > 0 ? ` · ${skippedMoveCount} skipped` : ""}
                </span>
              </div>
              <div className="move-list">
                {workoutMoveRows.map((move) => (
                  <article
                    key={move.originalExercise.id}
                    className={`move-item ${move.activeExercise.family} ${
                      move.isComplete ? "complete" : ""
                    } ${move.isSkipped ? "skipped" : ""
                    } ${nextOpenMove?.originalExercise.id === move.originalExercise.id ? "next-up" : ""}`}
                  >
                    <button
                      className="move-check-button"
                      type="button"
                      onClick={() =>
                        toggleExerciseDone(move.activeExercise.id, move.setCount, move.isComplete)
                      }
                      aria-label={`${move.isComplete ? "Reopen" : "Complete"} ${move.activeExercise.name}`}
                    >
                      {move.isComplete ? <Icon name="check" size={18} /> : move.exerciseIndex + 1}
                    </button>
                    <button
                      className="move-main-button"
                      type="button"
                      onClick={() => setDetailExerciseId(move.originalExercise.id)}
                    >
                      <span className="move-title-row">
                        <strong>{move.activeExercise.name}</strong>
                        <span className={`priority-chip priority-${move.priority}`}>
                          {move.priorityLabel}
                        </span>
                        <span className={`move-status-chip ${move.status}`}>{move.statusLabel}</span>
                        <span className="family-chip">{familyLabel(move.activeExercise.family)}</span>
                        <span className={`location-chip ${move.location.type}`}>{move.location.label}</span>
                        {move.isSwapped && <span className="swap-chip">Swap version</span>}
                      </span>
                      {move.isSwapped && (
                        <small className="swap-origin">Original: {move.originalExercise.name}</small>
                      )}
                      <span className="move-meta-row">
                        <span>{move.target}</span>
                        <span>{move.rest}</span>
                        <span>{move.activeExercise.equipment}</span>
                      </span>
                      <span className={`smart-load-mini ${move.suggestion.tone}`}>
                        <Icon name="spark" size={14} />
                        <span>
                          <strong>{move.suggestion.label}</strong>
                          <small>{move.suggestion.detail}</small>
                        </span>
                      </span>
                    </button>
                    <div className="move-actions">
                      <button
                        className={`move-skip-button ${move.isSkipped ? "is-skipped" : ""}`}
                        type="button"
                        onClick={() =>
                          move.isSkipped
                            ? reopenSkippedExerciseForDay(selectedCoachDay, move.originalExercise.id)
                            : requestSkipReason(selectedCoachDay, move.originalExercise.id, "today")
                        }
                      >
                        {move.isSkipped ? "Reopen" : "Skip"}
                      </button>
                      <button
                        className="move-detail-button"
                        type="button"
                        onClick={() => setDetailExerciseId(move.originalExercise.id)}
                      >
                        <Icon name={move.swaps.length ? "swap" : "video"} size={16} />
                        <span>{move.swaps.length ? "Details / Swap" : "Details"}</span>
                      </button>
                      {move.isSwapped && (
                        <button
                          className="move-revert-button"
                          type="button"
                          onClick={() => setExerciseSwap(move.originalExercise.id, move.originalExercise.id)}
                        >
                          <Icon name="swap" size={16} />
                          <span>Revert to original</span>
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="recovery-flow" aria-label="Recovery day">
              <h3>Recovery Day</h3>
              <p>{selectedSessionSummary}</p>
            </section>
          )}

          <section className="notes-block" aria-labelledby="notes-heading">
            <h3 id="notes-heading">Workout Notes</h3>
            <label className="notes-field">
              Notes
              <textarea
                value={selectedLog.notes}
                placeholder="Machine settings, weights that felt right, soreness, or what to improve next time..."
                onChange={(event) =>
                  updateDay(selectedDay.iso, (log) => ({
                    ...log,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </section>

          <section className="monthly-checkin-panel" aria-labelledby="monthly-checkin-heading">
            <div className="flow-heading">
              <div>
                <p className="eyebrow">Monthly coach check-in</p>
                <h3 id="monthly-checkin-heading">{selectedMonthlyTitle}</h3>
              </div>
              <span>{selectedMonthlyCheckIn.isUnlocked ? "Open" : "Locked"}</span>
            </div>
            <p>{selectedMonthlyCoachLine}</p>

            <div className="checkin-grid">
              <div>
                <span>Strength</span>
                <strong>
                  {selectedMonthlyCheckIn.completedStrength}/{selectedMonthlyCheckIn.totalStrength}
                </strong>
                <small>{selectedMonthlyCheckIn.completionRate}% strength adherence</small>
              </div>
              <div>
                <span>Cardio</span>
                <strong>
                  {selectedMonthlyCheckIn.completedCardio}/{selectedMonthlyCheckIn.totalCardio}
                </strong>
                <small>
                  Longest walk:{" "}
                  {currentMonthLongestCardio ? `${currentMonthLongestCardio} min` : "waiting"}
                </small>
              </div>
              <div>
                <span>Body weight</span>
                <strong>
                  {selectedMonthlyCheckIn.lastWeek.average === null
                    ? "No average"
                    : `${formatLoadValue(selectedMonthlyCheckIn.lastWeek.average)} kg`}
                </strong>
                <small>
                  Week {selectedMonthlyCheckIn.lastWeek.week} ·{" "}
                  {selectedMonthlyCheckIn.lastWeek.loggedDays}/7 mornings
                </small>
              </div>
              <div>
                <span>Photo reminder</span>
                <strong>
                  {selectedMonthlyCheckpointMetric.photoReminderDone ? "Done" : "Optional"}
                </strong>
                <small>Same lighting, same place, same relaxed posture.</small>
              </div>
            </div>

            <div className="checkin-comparison-grid">
              <div className="lift-comparison-list">
                <h4>Strength comparison</h4>
                {monthlyLiftComparisons.map((lift) => (
                  <div key={lift.id}>
                    <span>{lift.name}</span>
                    <strong>
                      {lift.start === null ? "Start pending" : `${formatLoadValue(lift.start)} lb`}{" "}
                      to{" "}
                      {lift.current === null ? "Current pending" : `${formatLoadValue(lift.current)} lb`}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="body-checkin-fields">
                <label className="photo-check">
                  <input
                    type="checkbox"
                    checked={selectedMonthlyCheckpointMetric.photoReminderDone}
                    disabled={!selectedMonthlyCheckIn.isUnlocked}
                    onChange={(event) =>
                      updateMetric(selectedMonthlyCheckIn.checkpointDay.iso, (metric) => ({
                        ...metric,
                        photoReminderDone: event.target.checked,
                      }))
                    }
                  />
                  <span>Monthly progress photos today</span>
                </label>
              </div>
            </div>

            <div className="monthly-recovery-row" aria-label="Monthly recovery rating">
              <strong>How was recovery this month?</strong>
              <div>
                {monthlyRecoveryOptions.map((option) => (
                  <button
                    key={option.id}
                    className={
                      selectedMonthlyCheckpointLog.monthlyRecovery === option.id ? "selected" : ""
                    }
                    type="button"
                    disabled={!selectedMonthlyCheckIn.isUnlocked}
                    onClick={() =>
                      updateMonthlyRecovery(
                        coachedPlanDayFor(selectedMonthlyCheckIn.checkpointDay),
                        option.id,
                      )
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="checkin-footnote">
              First month longest walk:{" "}
              {firstMonthLongestCardio ? `${firstMonthLongestCardio} min` : "waiting"} · Body
              success is judged by consistency, strength, fitness, weight trend, and skill.
              Visible abs depend on body-fat level and cannot be guaranteed.
            </p>
          </section>
        </section>

        <aside className="side-panel" aria-label="Progress and check-ins">
          <section className="metric-panel progress-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">
                  <Icon name="trophy" size={14} /> Achievements
                </p>
                <h2>Scoreboard</h2>
              </div>
            </div>
            <div className="stat-grid">
              <div>
                <span>Streak</span>
                <strong>{stats.streak}</strong>
              </div>
              <div>
                <span>Done</span>
                <strong>{stats.completedDays}</strong>
              </div>
              <div>
                <span>Strength</span>
                <strong>{stats.strengthSessions}</strong>
              </div>
              <div>
                <span>Sets</span>
                <strong>{stats.completedSets}</strong>
              </div>
            </div>
            <div className="achievement-list">
              {achievements.map((achievement) => (
                <div
                  key={achievement.label}
                  className={`achievement ${achievement.earned ? "earned" : ""}`}
                >
                  <span>{achievement.earned ? "Done" : "Open"}</span>
                  <strong>{achievement.label}</strong>
                  <small>{achievement.detail}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="metric-panel progress-card dashboard-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">
                  <Icon name="progress" size={14} /> Progress Dashboard
                </p>
                <h2>Training picture</h2>
              </div>
            </div>
            <div className="dashboard-stat-grid">
              <div className="dashboard-stat strength">
                <span>Program</span>
                <strong>{stats.percent}%</strong>
                <small>{stats.completedDays} of {PROGRAM_DAYS} days</small>
              </div>
              <div className="dashboard-stat skipped">
                <span>With skips</span>
                <strong>{stats.skippedDays}</strong>
                <small>finished but not perfect</small>
              </div>
              <div className="dashboard-stat cardio">
                <span>Cardio</span>
                <strong>{stats.cardioMinutes}</strong>
                <small>estimated minutes</small>
              </div>
              <div className="dashboard-stat sets">
                <span>Sets</span>
                <strong>{stats.completedSets}</strong>
                <small>completed rows</small>
              </div>
              <div className="dashboard-stat body">
                <span>Weight logs</span>
                <strong>{stats.weightLogs}</strong>
                <small>logged mornings/notes</small>
              </div>
            </div>

            <div className="dashboard-split">
              <div className="best-load-panel">
                <h3>Best logged loads</h3>
                {bestLiftRows.length > 0 ? (
                  <div className="best-load-list">
                    {bestLiftRows.map((lift) => (
                      <div key={lift.id} className={`best-load-row ${lift.family}`}>
                        <span>{lift.name}</span>
                        <strong>{formatLoadValue(lift.load)} lb</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="side-copy">Weights appear here after your first logged sets.</p>
                )}
              </div>
              <div className="body-trend-panel">
                <h3>Weight trend</h3>
                {weightTrend ? (
                  <div className="trend-list">
                    <span>{weightTrend.from} to {weightTrend.to}</span>
                    <strong>
                      Weight {weightTrend.weightDelta === null ? "n/a" : `${formatLoadValue(weightTrend.weightDelta)} kg`}
                    </strong>
                  </div>
                ) : (
                  <p className="side-copy">Two weigh-ins unlock the trend.</p>
                )}
              </div>
            </div>
          </section>

          <section className="metric-panel progress-card">
            <p className="eyebrow">Completion trend</p>
            <h2>Weekly consistency</h2>
            <div className="week-chart">
              {weeklyCompletion.slice(0, selectedDay.week).map((week) => (
                <div key={week.value} className="week-bar-row">
                  <span>{week.label.replace("Week ", "W")}</span>
                  <div>
                    <i style={{ width: `${week.percent}%` }} />
                  </div>
                  <strong>
                    {week.completed}/{week.total}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="metric-panel progress-card">
            <p className="eyebrow">History</p>
            <h2>Recent workouts</h2>
            <div className="history-list">
              {recentCompletedDays.length > 0 ? (
                recentCompletedDays.map((day) => (
                  <div key={day.iso} className="history-row">
                    <span>{formatDate(day.iso, "short")}</span>
                    <strong>{day.session.title}</strong>
                    <small>{sessionTimeForDay(coachedPlanDayFor(day), normalizeDayLog(store.days[day.iso]))}</small>
                  </div>
                ))
              ) : (
                <p className="side-copy">Completed workouts will appear here.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="library-section" aria-labelledby="library-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Move library</p>
            <h2 id="library-heading">Videos, cues, and resources</h2>
          </div>
          <div className="library-tools">
            <select value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="legs">Legs</option>
              <option value="push">Push</option>
              <option value="pull">Pull</option>
              <option value="hinge">Hinge</option>
              <option value="core">Core</option>
              <option value="arms">Arms</option>
              <option value="warmup">Warm-up</option>
              <option value="cardio">Cardio</option>
            </select>
            <label className="library-search">
              <Icon name="search" size={16} />
              <input
                className="library-search-input"
                value={librarySearch}
                placeholder="Search moves"
                onChange={(event) => setLibrarySearch(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="library-grid">
          {filteredLibrary.map((exercise) => {
            const location = locationGuideForExercise(exercise);

            return (
              <article key={exercise.id} className={`library-card ${exercise.family}`}>
                <div className="library-media">
                  <ExerciseMedia exercise={exercise} variant="library" />
                </div>
                <ExerciseMediaLinks exercise={exercise} compact />
                <div className="library-chip-row">
                  <span className="family-chip">{familyLabel(exercise.family)}</span>
                  <span className={`location-chip ${location.type}`}>{location.label}</span>
                </div>
                <h3>{exercise.name}</h3>
                <p>{exercise.target}</p>
                <small>{exercise.equipment}</small>
                <div className="resource-links compact-links">
                  {exercise.resources.slice(0, 3).map((resource) => (
                    <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                      {resource.label}
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fallback-section" aria-labelledby="fallback-heading">
        <div>
          <p className="eyebrow">No-gym fallback</p>
          <h2 id="fallback-heading">25-35 minute emergency session</h2>
          <p>
            Do 3 rounds in a pain-free range. Rest 60-90 seconds between exercises as needed. This
            protects the habit on days when going downstairs is not happening.
          </p>
        </div>
        <div className="swap-grid">
          {[
            ["Leg press", "Glute bridge plus seated knee extension"],
            ["Incline dumbbell press", "Incline push-up on counter, desk, or bench"],
            ["Lat pulldown or row", "One-arm backpack row with a sturdy chair"],
            ["Romanian deadlift", "Backpack or dumbbell Romanian deadlift"],
            ["Cable fly", "Push-up"],
            ["Plank", "Same plank"],
          ].map(([gym, home]) => (
            <div key={gym} className="swap-row">
              <strong>{gym}</strong>
              <span>{home}</span>
            </div>
          ))}
        </div>
      </section>

      {detailMove && detailExercise && detailRows && (
        <div
          className="detail-sheet-backdrop"
          role="presentation"
          onClick={() => setDetailExerciseId(null)}
        >
          <section
            className={`exercise-detail-sheet ${detailExercise.family}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="detail-sheet-header">
              <div>
                <p className="eyebrow">Exercise Detail</p>
                <h2 id="detail-heading">{detailExercise.name}</h2>
                <span className={`move-status-chip ${detailMove.status}`}>
                  {detailMove.statusLabel}
                </span>
              </div>
              <button
                className="sheet-close-button"
                type="button"
                onClick={() => setDetailExerciseId(null)}
                aria-label="Close exercise details"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            {detailMove.isSwapped && (
              <div className="swap-alert detail-swap-alert">
                <div>
                  <span className="swap-alert-label">
                    <Icon name="swap" size={15} /> Swap version
                  </span>
                  <strong>{detailExercise.name}</strong>
                  <small>Original plan: {detailMove.originalExercise.name}</small>
                </div>
                <button
                  className="swap-revert-button"
                  type="button"
                  onClick={() =>
                    setExerciseSwap(detailMove.originalExercise.id, detailMove.originalExercise.id)
                  }
                >
                  Revert to original
                </button>
              </div>
            )}

            <div className="detail-media-grid">
              <div className="detail-media-panel">
                <ExerciseMedia exercise={detailExercise} variant="gym" />
                <ExerciseMediaLinks exercise={detailExercise} />
                <div className="resource-links detail-resources">
                  {detailExercise.resources.map((resource) => (
                    <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                      {resource.label}
                    </a>
                  ))}
                </div>
              </div>

              <div className="detail-fact-grid">
                <div>
                  <span>Target</span>
                  <strong>{detailMove.target}</strong>
                </div>
                <div>
                  <span>Rest</span>
                  <strong>{detailMove.rest}</strong>
                </div>
                <div>
                  <span>Equipment</span>
                  <strong>{detailExercise.equipment}</strong>
                </div>
                {detailLocation && (
                  <div className={`location-fact ${detailLocation.type}`}>
                    <span>Where</span>
                    <strong>{detailLocation.label}</strong>
                    <small>{detailLocation.detail}</small>
                  </div>
                )}
                <div>
                  <span>Last load</span>
                  <strong>
                    {detailPreviousLoad ? formatLoggedWeightText(detailPreviousLoad.weights) : "New"}
                  </strong>
                </div>
              </div>
            </div>

            {detailMove.swaps.length > 0 && (
              <section className="swap-panel" aria-labelledby="swap-heading">
                <div className="flow-heading">
                  <h3 id="swap-heading">Swap Options</h3>
                  <span>{detailMove.swaps.length} legit</span>
                </div>
                <div className="swap-option-grid">
                  <button
                    className={!detailMove.isSwapped ? "selected" : ""}
                    type="button"
                    onClick={() =>
                      setExerciseSwap(detailMove.originalExercise.id, detailMove.originalExercise.id)
                    }
                  >
                    <strong>Original</strong>
                    <small>{detailMove.originalExercise.name}</small>
                    <span>{detailMove.originalExercise.equipment}</span>
                  </button>
                  {detailMove.swaps.map((swap) => (
                    <button
                      key={swap.id}
                      className={detailExercise.id === swap.id ? "selected" : ""}
                      type="button"
                      onClick={() => setExerciseSwap(detailMove.originalExercise.id, swap.id)}
                    >
                      <strong>{swap.name}</strong>
                      <small>{swap.target}</small>
                      <span>{swap.equipment}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className={`load-suggestion smart-load ${detailMove.suggestion.tone}`}>
              <Icon name="spark" size={16} />
              <span>
                <strong>{detailMove.suggestion.label}</strong>
                <small>{detailMove.suggestion.detail}</small>
              </span>
            </div>

            <div className="detail-details-grid">
              <details className="form-details" open>
                <summary>How to do it</summary>
                <ul>
                  {detailExercise.cues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
              <details className="form-details">
                <summary>Common mistakes</summary>
                <ul>
                  {detailExercise.avoid.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
              <details className="form-details progression-details">
                <summary>Progression</summary>
                <p>{detailMove.progression}</p>
              </details>
            </div>

            <div
              className={`set-table detail-set-table ${tracksWeight(detailExercise) ? "" : "no-load"}`}
              aria-label={`${detailExercise.name} detail set log`}
            >
              <div className="set-head">
                <span>Set</span>
                <span>Target</span>
                {tracksWeight(detailExercise) && <span>Weight (lbs)</span>}
                {tracksWeight(detailExercise) && <span>Reps</span>}
                {tracksWeight(detailExercise) && <span>Feel</span>}
                <span>Done</span>
              </div>
              {detailRows.map((set, setIndex) => (
                <div className="set-row" key={`${detailExercise.id}-detail-${setIndex}`}>
                  <span>{setIndex + 1}</span>
                  <strong className="target-pill">{detailMove.target}</strong>
                  {tracksWeight(detailExercise) ? (
                    <input
                      inputMode="decimal"
                      value={set.weight}
                      placeholder="lbs"
                      onChange={(event) =>
                        updateSet(detailExercise.id, setIndex, "weight", event.target.value)
                      }
                      aria-label={`${detailExercise.name} set ${setIndex + 1} weight in pounds`}
                    />
                  ) : null}
                  {tracksWeight(detailExercise) ? (
                    <input
                      inputMode="numeric"
                      value={set.reps}
                      placeholder="reps"
                      onChange={(event) =>
                        updateSet(detailExercise.id, setIndex, "reps", event.target.value)
                      }
                      aria-label={`${detailExercise.name} set ${setIndex + 1} reps`}
                    />
                  ) : null}
                  {tracksWeight(detailExercise) ? (
                    <select
                      className={`effort-select effort-${set.effort ?? "unset"}`}
                      value={set.effort ?? ""}
                      onChange={(event) =>
                        updateSet(
                          detailExercise.id,
                          setIndex,
                          "effort",
                          event.target.value || undefined,
                        )
                      }
                      aria-label={`${detailExercise.name} set ${setIndex + 1} feel`}
                    >
                      <option value="">Feel</option>
                      {effortOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <label className="mini-check">
                    <input
                      type="checkbox"
                      checked={set.done}
                      onChange={(event) =>
                        updateSet(detailExercise.id, setIndex, "done", event.target.checked)
                      }
                    />
                    <span />
                  </label>
                </div>
              ))}
            </div>

            <div className="sheet-action-row">
              <button
                type="button"
                onClick={() =>
                  toggleExerciseDone(detailExercise.id, detailMove.setCount, detailMove.isComplete)
                }
              >
                <Icon name="check" size={17} />
                {detailMove.isComplete ? "Reopen Move" : "Complete Move"}
              </button>
              <button
                className={`secondary skip-detail-button ${detailMove.isSkipped ? "is-skipped" : ""}`}
                type="button"
                onClick={() =>
                  detailMove.isSkipped
                    ? reopenSkippedExerciseForDay(selectedCoachDay, detailMove.originalExercise.id)
                    : requestSkipReason(selectedCoachDay, detailMove.originalExercise.id, "detail")
                }
              >
                {detailMove.isSkipped ? "Reopen Skipped Move" : "Skip Move"}
              </button>
              <button className="secondary" type="button" onClick={() => setDetailExerciseId(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {skipRequest && skipRequestDay && (skipRequest.originalExerciseId === null || skipRequestExercise) && (
        <div
          className="detail-sheet-backdrop skip-sheet-backdrop"
          role="presentation"
          onClick={() => setSkipRequest(null)}
        >
          <section
            className="skip-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="skip-sheet-header">
              <div>
                <p className="eyebrow">Skip from {skipRequestContext}</p>
                <h2 id="skip-heading">{skipRequest.originalExerciseId === null ? "Skip this day?" : `Why skip ${skipRequestExercise?.shortName}?`}</h2>
                <p>{formatDate(skipRequestDay.iso)} · {skipRequestDay.session.title}</p>
                {skipRequestOriginalExercise && skipRequestExercise &&
                  skipRequestExercise.id !== skipRequestOriginalExercise.id && (
                    <p>Current swap for {skipRequestOriginalExercise.shortName}</p>
                  )}
              </div>
              <button
                className="sheet-close-button"
                type="button"
                onClick={() => setSkipRequest(null)}
                aria-label="Close skip reason"
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            <p className="skip-sheet-copy">
              {skipRequest.originalExerciseId === null
                ? "Choose a reason to skip the remaining workout for this date. Logged sets, weights, and notes stay saved. Diet and other dates are unchanged."
                : "Choose the reason so your progress shows the truth: finished with skips is different from a fully completed day."}
            </p>
            <div className="skip-reason-grid">
              {skipReasonOptions.map((reason) => (
                <button key={reason.id} type="button" onClick={() => submitSkipReason(reason.id)}>
                  {reason.label}
                </button>
              ))}
            </div>
            <button className="skip-cancel-button" type="button" onClick={() => setSkipRequest(null)}>
              {skipRequest.originalExerciseId === null ? "Keep Day Open" : "Keep Move Open"}
            </button>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Main app sections">
        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            className={activeSection === id ? "active" : ""}
            type="button"
            onClick={() => switchSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
          >
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
