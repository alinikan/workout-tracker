import { addDays } from "../momentum/plan.ts";
import { isCalendarDate } from "../../lib/programLifecycle.ts";

export type Equation = "male" | "female";
export type NutritionProfile = {
  id: string;
  createdAt: string;
  from: string;
  age: number;
  heightCm: number;
  startWeightKg: number;
  equation: Equation;
  baselineSteps: number;
};
export type NutritionPlan = {
  id: string;
  profileId: string;
  createdAt: string;
  from: string;
  restCalories: number;
  trainingCalories: number;
  proteinGrams: number;
  referenceWeightKg: number;
  maintenance: number;
  reason: "initial" | "less" | "more";
};
export type FoodEvidence = {
  complete: boolean;
  calories: number | null;
  protein: number | null;
  signature: string;
  source: string;
};
export type NutritionCheckin = {
  id: string;
  updatedAt: string;
  matches: "yes" | "no" | "unsure";
  extras: number | null;
  energy: "okay" | "low" | "unwell";
  steps: number | null;
  foodSignature: string;
  intake: number | null;
};
export type NutritionState = {
  version: 1;
  profiles: Record<string, NutritionProfile>;
  plans: Record<string, NutritionPlan>;
  checkins: Record<string, NutritionCheckin>;
};
export type WeightEvidence = { date: string; kg: number };
export type NutritionBudget = { version: 1; calories: number; protein: number };
export type NutritionReview = {
  status:
    | "setup"
    | "learning"
    | "hold"
    | "on-track"
    | "consistency"
    | "less"
    | "more";
  title: string;
  detail: string;
  delta: number;
  weights: number;
  foodDays: number;
  weeklyChange: number | null;
};

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const stamp = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const safeId = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length < 150 &&
  !["__proto__", "constructor", "prototype"].includes(v);
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const round50 = (value: number) => Math.round(value / 50) * 50;
const nextStamp = (now: string, previous: string[]) =>
  new Date(
    Math.max(
      Date.parse(now),
      ...previous.map((v) => Date.parse(v) + 1).filter(Number.isFinite),
    ),
  ).toISOString();
const compare = (
  a: { from: string; createdAt: string; id: string },
  b: typeof a,
) =>
  b.from.localeCompare(a.from) ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);
export const emptyNutrition = (): NutritionState => ({
  version: 1,
  profiles: {},
  plans: {},
  checkins: {},
});
export const firstMilestone = (p: NutritionProfile) =>
  Math.min(
    p.startWeightKg,
    Math.round(
      Math.max(p.startWeightKg * 0.95, (p.heightCm / 100) ** 2 * 22) * 2,
    ) / 2,
  );
export const trainingFuelDay = (
  planned: boolean,
  actualWork: boolean,
  explicitlySkipped: boolean,
) => actualWork || (planned && !explicitlySkipped);

/** Saved plans are dated episodes. Editing a profile must not rewrite yesterday's
 * food, and the same immutable ID must mean the same prescription on each device. */
export function normalizeNutrition(value: unknown): NutritionState {
  const state = emptyNutrition();
  if (!object(value) || value.version !== 1) return state;
  if (object(value.profiles))
    for (const [id, p] of Object.entries(value.profiles)) {
      if (
        object(p) &&
        safeId(id) &&
        p.id === id &&
        stamp(p.createdAt) &&
        isCalendarDate(p.from) &&
        finite(p.age, 18, 80) &&
        Number.isInteger(p.age) &&
        finite(p.heightCm, 140, 220) &&
        finite(p.startWeightKg, 45, 180) &&
        ["male", "female"].includes(String(p.equation)) &&
        finite(p.baselineSteps, 0, 30000)
      )
        state.profiles[id] = p as NutritionProfile;
    }
  if (object(value.plans))
    for (const [id, p] of Object.entries(value.plans)) {
      if (
        object(p) &&
        safeId(id) &&
        p.id === id &&
        safeId(p.profileId) &&
        state.profiles[p.profileId] &&
        stamp(p.createdAt) &&
        isCalendarDate(p.from) &&
        finite(
          p.restCalories,
          state.profiles[p.profileId].equation === "male" ? 1700 : 1500,
          3600,
        ) &&
        finite(
          p.trainingCalories,
          p.restCalories,
          Math.min(3800, p.restCalories + 200),
        ) &&
        finite(p.proteinGrams, 75, 220) &&
        finite(p.referenceWeightKg, 45, 180) &&
        finite(p.maintenance, 1500, 5000) &&
        ["initial", "less", "more"].includes(String(p.reason))
      )
        state.plans[id] = p as NutritionPlan;
    }
  if (object(value.checkins))
    for (const [date, c] of Object.entries(value.checkins)) {
      if (
        isCalendarDate(date) &&
        object(c) &&
        safeId(c.id) &&
        stamp(c.updatedAt) &&
        ["yes", "no", "unsure"].includes(String(c.matches)) &&
        ["okay", "low", "unwell"].includes(String(c.energy)) &&
        (c.extras === null || finite(c.extras, 0, 2000)) &&
        (c.steps === null || finite(c.steps, 0, 100000)) &&
        (c.intake === null || finite(c.intake, 500, 6000)) &&
        typeof c.foodSignature === "string"
      )
        state.checkins[date] = c as NutritionCheckin;
    }
  return state;
}

export function profileFor(state: NutritionState, date: string) {
  return (
    Object.values(state.profiles)
      .filter((p) => p.from <= date)
      .sort(compare)[0] ?? null
  );
}
export function planFor(state: NutritionState, date: string) {
  const profile = profileFor(state, date);
  return profile
    ? (Object.values(state.plans)
        .filter((p) => p.profileId === profile.id && p.from <= date)
        .sort(compare)[0] ?? null)
    : null;
}
export function recentReference(
  weights: WeightEvidence[],
  today: string,
  fallback: number,
) {
  const recent = weights
    .filter(
      (w) =>
        isCalendarDate(w.date) &&
        w.date <= today &&
        w.date >= addDays(today, -13) &&
        finite(w.kg, 45, 180),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  return recent.length >= 3
    ? mean(recent.map((w) => w.kg))
    : (recent.at(-1)?.kg ?? fallback);
}

/** Mifflin-St Jeor estimates RESTING expenditure, not a measured metabolism.
 * The low-step multiplier and 150-kcal lifting allowance are transparent product
 * heuristics. Do not add a wearable's exercise calories on top of this allowance. */
export function estimateEnergy(
  profile: Pick<
    NutritionProfile,
    "age" | "heightCm" | "equation" | "baselineSteps"
  >,
  weight: number,
) {
  const resting =
    10 * weight +
    6.25 * profile.heightCm -
    5 * profile.age +
    (profile.equation === "male" ? 5 : -161);
  const factor =
    profile.baselineSteps < 4000
      ? 1.2
      : profile.baselineSteps < 7000
        ? 1.3
        : profile.baselineSteps < 10000
          ? 1.4
          : 1.5;
  const maintenance = resting * factor;
  const floor = profile.equation === "male" ? 1700 : 1500;
  const deficit = Math.min(350, Math.max(150, maintenance * 0.15));
  return {
    resting,
    factor,
    maintenance,
    restCalories: Math.max(floor, Math.ceil((maintenance - deficit) / 50) * 50),
    floor,
  };
}
export function saveProfile(
  state: NutritionState,
  values: Omit<NutritionProfile, "id" | "createdAt" | "from">,
  today: string,
  weights: WeightEvidence[] = [],
  now = new Date().toISOString(),
): NutritionState {
  if (!isCalendarDate(today) || !stamp(now))
    throw new Error("Use a valid profile date.");
  const profile: NutritionProfile = {
    ...values,
    id: crypto.randomUUID(),
    createdAt: nextStamp(
      now,
      Object.values(state.profiles).map((p) => p.createdAt),
    ),
    from: today,
  };
  if (
    !normalizeNutrition({
      ...emptyNutrition(),
      profiles: { [profile.id]: profile },
    }).profiles[profile.id]
  )
    throw new Error(
      "Enter an adult age, height, weight, equation and usual step count within the supported ranges.",
    );
  const weight = recentReference(weights, today, profile.startWeightKg);
  if (weight / (profile.heightCm / 100) ** 2 < 18.5)
    throw new Error(
      "Weight-loss targets are not available below a BMI of 18.5. Seek individual nutrition advice rather than reducing food here.",
    );
  const energy = estimateEnergy(profile, weight);
  if (energy.maintenance > 3600)
    throw new Error(
      "This estimate is outside the app's supported calorie range. Use individual nutrition planning rather than a capped automatic target.",
    );
  if (energy.maintenance < energy.floor + 100)
    throw new Error(
      "This estimate leaves too little room for a sensible deficit. Use individual nutrition guidance instead of lowering portions here.",
    );
  const plan: NutritionPlan = {
    id: crypto.randomUUID(),
    profileId: profile.id,
    createdAt: profile.createdAt,
    from: today,
    restCalories: energy.restCalories,
    trainingCalories: energy.restCalories + 150,
    proteinGrams: Math.round(Math.min(220, Math.max(75, weight * 1.8)) / 5) * 5,
    referenceWeightKg: weight,
    maintenance: Math.round(energy.maintenance),
    reason: "initial",
  };
  return {
    ...state,
    profiles: { ...state.profiles, [profile.id]: profile },
    plans: { ...state.plans, [plan.id]: plan },
  };
}
export function budgetFor(
  state: NutritionState,
  date: string,
  training: boolean,
  currentReference?: number,
): NutritionBudget | undefined {
  const p = planFor(state, date),
    profile = profileFor(state, date);
  if (!p || !profile) return undefined;
  const weight = currentReference ?? p.referenceWeightKg;
  // A first 5% milestone is a review point, not permission to keep cutting
  // indefinitely. Near a lower BMI, the initial direction is maintenance instead.
  if (weight <= firstMilestone(profile))
    return {
      version: 1,
      calories:
        Math.max(
          estimateEnergy(profile, weight).floor,
          round50(estimateEnergy(profile, weight).maintenance),
        ) + (training ? 150 : 0),
      protein: Math.round(Math.min(220, Math.max(75, weight * 1.8)) / 5) * 5,
    };
  return {
    version: 1,
    calories: training ? p.trainingCalories : p.restCalories,
    protein: p.proteinGrams,
  };
}

/** An eaten check is not proof of intake. Explicit portions/extras confirmation,
 * complete saved meals and an unchanged food signature are all needed for review. */
export function saveCheckin(
  state: NutritionState,
  date: string,
  values: Pick<NutritionCheckin, "matches" | "extras" | "energy" | "steps">,
  food: FoodEvidence,
  today: string,
  now = new Date().toISOString(),
): NutritionState {
  if (!isCalendarDate(date) || date > today || !profileFor(state, date))
    throw new Error(
      "Choose today or an earlier date with a nutrition profile.",
    );
  if (values.matches === "yes" && values.extras === null)
    throw new Error(
      "Enter extra calories, including 0 if there were none. Unknown is not zero.",
    );
  const c: NutritionCheckin = {
    ...values,
    id: crypto.randomUUID(),
    updatedAt: nextStamp(
      now,
      state.checkins[date] ? [state.checkins[date].updatedAt] : [],
    ),
    foodSignature: food.signature,
    intake:
      values.matches === "yes" &&
      food.complete &&
      food.calories !== null &&
      values.extras !== null
        ? Math.round(food.calories + values.extras)
        : null,
  };
  if (!normalizeNutrition({ ...state, checkins: { [date]: c } }).checkins[date])
    throw new Error("Check your step count, extras and energy selection.");
  return { ...state, checkins: { ...state.checkins, [date]: c } };
}

export type ReviewEvidence = {
  weights: WeightEvidence[];
  food: Record<string, FoodEvidence>;
  recoveryConcern?: boolean;
  trainingForDate: (date: string) => boolean;
};
export function reviewNutrition(
  state: NutritionState,
  today: string,
  evidence: ReviewEvidence,
): NutritionReview {
  const profile = profileFor(state, today),
    plan = planFor(state, today);
  const result = (
    status: NutritionReview["status"],
    title: string,
    detail: string,
    delta = 0,
    weights = 0,
    foodDays = 0,
    weeklyChange: number | null = null,
  ): NutritionReview => ({
    status,
    title,
    detail,
    delta,
    weights,
    foodDays,
    weeklyChange,
  });
  if (!profile || !plan)
    return result(
      "setup",
      "Set your starting target",
      "Confirm your profile in Coach. No personal calorie target has been calculated yet.",
    );
  const dates = Array.from({ length: 21 }, (_, i) => addDays(today, i - 21));
  const weights = evidence.weights.filter(
    (w) =>
      w.date >= dates[0] &&
      w.date < today &&
      w.date >= plan.from &&
      finite(w.kg, 45, 180),
  );
  const checkins = dates.flatMap((date) =>
    state.checkins[date] ? [{ date, c: state.checkins[date] }] : [],
  );
  // Food/weight comparisons exclude today's unfinished day. Symptoms must not:
  // a current check-in can pause reductions immediately, even without meals.
  const recentEnergy = Object.entries(state.checkins)
    .filter(([date]) => date >= addDays(today, -6) && date <= today)
    .map(([date, c]) => ({ date, c }));
  if (
    evidence.recoveryConcern ||
    recentEnergy.some((x) => x.c.energy === "unwell") ||
    recentEnergy.filter((x) => x.c.energy === "low").length >= 2
  )
    return result(
      "hold",
      "Protect recovery; no food cut",
      "Low energy or concerning workout feedback pauses reductions. Keep regular meals, take breaks and review persistent symptoms rather than trying to burn more.",
      0,
      weights.length,
    );
  const weeks = [0, 1, 2].map((i) =>
    weights.filter((w) => w.date >= dates[i * 7] && w.date <= dates[i * 7 + 6]),
  );
  const trusted = checkins.filter(
    ({ date, c }) =>
      date >= plan.from &&
      c.matches === "yes" &&
      c.extras !== null &&
      c.intake !== null &&
      evidence.food[date]?.complete &&
      c.foodSignature === evidence.food[date]?.signature,
  );
  const lastTwo = weeks.slice(1);
  if (lastTwo.some((w) => w.length < 4))
    return result(
      "learning",
      "Build a reliable trend",
      "Log at least four actual mornings in each of two completed seven-day windows. Missing days are excluded, never counted as zero.",
      0,
      weights.length,
      trusted.length,
    );
  const a = mean(lastTwo[0].map((w) => w.kg)),
    b = mean(lastTwo[1].map((w) => w.kg)),
    delta = b - a;
  if (b <= firstMilestone(profile))
    return result(
      "hold",
      "First milestone: maintain and review",
      "Your recent average reached the first review weight. Future uncooked portions now use a maintenance estimate. Build strength and review the next goal rather than continuing to cut automatically.",
      0,
      weights.length,
      0,
      delta,
    );
  const trusted14 = trusted.filter((x) => x.date >= addDays(today, -14));
  if (trusted14.length < 10)
    return result(
      "consistency",
      "Confirm the food before changing it",
      "The weight trend is available, but fewer than ten of fourteen days have complete meals and confirmed portions/extras. Keep the target; improve the record first.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  const steps = trusted14.flatMap((x) =>
    x.c.steps === null ? [] : [x.c.steps],
  );
  if (
    steps.length >= 7 &&
    Math.abs(mean(steps) - profile.baselineSteps) >
      Math.max(1500, profile.baselineSteps * 0.4)
  )
    return result(
      "hold",
      "Your activity baseline changed",
      "Review your usual step count in the profile before changing food. Do not add exercise calories twice.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  if (delta < -b * 0.0075) return currentUpperLimit();
  function currentUpperLimit() {
    return plan!.restCalories + 100 <= 3600 &&
      plan!.trainingCalories + 100 <= 3800
      ? result(
          "more",
          "Consider a little more fuel",
          "The weekly average is falling faster than this gradual plan intends. A 100-kcal increase is available; no cooked food changes automatically.",
          100,
          weights.length,
          trusted.length,
          delta,
        )
      : result(
          "hold",
          "Review the target individually",
          "The trend needs review, but the supported calorie range has been reached. Do not chase an automatic number.",
          0,
          weights.length,
          trusted.length,
          delta,
        );
  }
  if (delta <= -b * 0.001)
    return result(
      "on-track",
      "Your average is moving down",
      "Keep the current portions and strength routine. Scale changes include water; this does not measure fat loss directly.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  if (plan.from > dates[0] || weeks[0].length < 4 || trusted.length < 15)
    return result(
      "learning",
      "Give the new target more time",
      "A reduction needs three completed weeks at this target, at least four weights per week and fifteen confirmed food days. New lifting and water changes can mask progress.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  if (
    mean(weeks[1].map((w) => w.kg)) - mean(weeks[0].map((w) => w.kg)) <
    -b * 0.001
  )
    return result(
      "hold",
      "One steady week is not a plateau",
      "The earlier comparison was falling. Hold the target rather than responding to a single flat week.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  const expected = mean(
    trusted14.map(
      ({ date }) =>
        budgetFor(state, date, evidence.trainingForDate(date))!.calories,
    ),
  );
  if (mean(trusted14.map((x) => x.c.intake!)) > expected + 100)
    return result(
      "consistency",
      "Follow the existing portions first",
      "Confirmed meals and extras average above the target. Do not make the recipes smaller to compensate; review portions, drinks, oils and extra food first.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  const initial =
    Object.values(state.plans)
      .filter((p) => p.profileId === profile.id && p.reason === "initial")
      .sort(compare)[0] ?? plan;
  const minimum = Math.max(
    estimateEnergy(profile, b).floor,
    Math.ceil((estimateEnergy(profile, b).maintenance * 0.8) / 50) * 50,
    initial.restCalories - 300,
  );
  if (
    b / (profile.heightCm / 100) ** 2 <= 22 ||
    plan.restCalories - 100 < minimum
  )
    return result(
      "hold",
      "No further automatic reduction",
      "The plan has reached a conservative planning limit. Review the goal and real intake with a dietitian rather than cutting further here.",
      0,
      weights.length,
      trusted.length,
      delta,
    );
  return result(
    "less",
    "A small next-batch adjustment is available",
    "Two comparisons are nearly flat despite a reliable food record. You may apply 100 kcal less per day, then collect a new three-week trend. Protein is maintained; prepared food stays unchanged.",
    -100,
    weights.length,
    trusted.length,
    delta,
  );
}

type FoodLog = {
  eaten?: Partial<Record<"breakfast" | "lunch" | "snack" | "dinner", boolean>>;
  recipes?: Partial<Record<"breakfast" | "lunch" | "snack" | "dinner", string>>;
  portions?: Partial<
    Record<
      "breakfast" | "lunch" | "snack" | "dinner",
      { calories: number; protein: number; plate: string[] }
    >
  >;
};
export function foodEvidence(
  log: FoodLog | undefined,
  source: string,
): FoodEvidence {
  const slots = ["breakfast", "lunch", "snack", "dinner"] as const;
  const complete = slots.every(
    (slot) =>
      log?.eaten?.[slot] &&
      typeof log.recipes?.[slot] === "string" &&
      finite(log.portions?.[slot]?.calories, 50, 2000) &&
      finite(log.portions?.[slot]?.protein, 0, 150),
  );
  return {
    source,
    complete,
    signature: JSON.stringify([
      source,
      slots.map((slot) => [
        slot,
        Boolean(log?.eaten?.[slot]),
        log?.recipes?.[slot] ?? null,
        log?.portions?.[slot]
          ? [
              log.portions[slot]!.calories,
              log.portions[slot]!.protein,
              log.portions[slot]!.plate,
            ]
          : null,
      ]),
    ]),
    calories: complete
      ? slots.reduce((sum, slot) => sum + log!.portions![slot]!.calories, 0)
      : null,
    protein: complete
      ? slots.reduce((sum, slot) => sum + log!.portions![slot]!.protein, 0)
      : null,
  };
}

export function applyReview(
  state: NutritionState,
  today: string,
  evidence: ReviewEvidence,
  now = new Date().toISOString(),
): NutritionState {
  const review = reviewNutrition(state, today, evidence),
    current = planFor(state, today),
    profile = profileFor(state, today);
  if (!current || !profile || !review.delta)
    throw new Error("There is no supported calorie adjustment to apply.");
  const weight = recentReference(
    evidence.weights,
    today,
    current.referenceWeightKg,
  );
  const next: NutritionPlan = {
    ...current,
    id: crypto.randomUUID(),
    createdAt: nextStamp(
      now,
      Object.values(state.plans).map((p) => p.createdAt),
    ),
    from: today,
    restCalories: current.restCalories + review.delta,
    trainingCalories: current.trainingCalories + review.delta,
    proteinGrams: Math.round(Math.min(220, Math.max(75, weight * 1.8)) / 5) * 5,
    referenceWeightKg: weight,
    maintenance: Math.round(estimateEnergy(profile, weight).maintenance),
    reason: review.delta < 0 ? "less" : "more",
  };
  return { ...state, plans: { ...state.plans, [next.id]: next } };
}

/** A fresh training journey keeps factual profile information, not prior intake
 * check-ins or calorie reductions. The next plan is an explicitly reset baseline. */
export function restartNutrition(
  state: NutritionState,
  date: string,
  weights: WeightEvidence[],
  now: string,
) {
  const profile = profileFor(state, date);
  return profile
    ? saveProfile(
        emptyNutrition(),
        {
          age: profile.age,
          heightCm: profile.heightCm,
          equation: profile.equation,
          baselineSteps: profile.baselineSteps,
          startWeightKg: recentReference(weights, date, profile.startWeightKg),
        },
        date,
        [],
        now,
      )
    : emptyNutrition();
}
