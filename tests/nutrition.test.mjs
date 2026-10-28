import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/features/momentum/plan.ts";
import {
  emptyNutrition,
  normalizeNutrition,
  saveProfile,
  planFor,
  profileFor,
  estimateEnergy,
  budgetFor,
  recentReference,
  saveCheckin,
  reviewNutrition,
  applyReview,
  foodEvidence,
  restartNutrition,
  firstMilestone,
  trainingFuelDay,
} from "../src/features/nutrition/model.ts";
import {
  createMealPrep,
  prepBatch,
  prepServing,
  normalizeMealPrep,
  prepShopping,
  preparedBatchFor,
  setPrepChoice,
} from "../src/features/mealPrep/plan.ts";
import { prepRecipeMap } from "../src/features/mealPrep/recipes.ts";
import { mergeProgressChanges } from "../src/lib/syncMerge.ts";

// Synthetic examples, not the owner's profile or account history.
const start = "2026-01-05",
  stamp = "2026-01-05T12:00:00.000Z";
const values = {
  age: 30,
  heightCm: 175,
  startWeightKg: 80,
  equation: "male",
  baselineSteps: 2500,
};
const configured = () =>
  saveProfile(emptyNutrition(), values, start, [], stamp);
const simpleFood = (calories = 1800, signature = "synthetic-meals") => ({
  complete: true,
  calories,
  protein: 145,
  signature,
  source: "Nutrition",
});
function evidence(
  state,
  {
    weeks = [80, 80, 80],
    foodDays = 21,
    extras = 0,
    energy = "okay",
    steps = 2500,
  } = {},
) {
  let result = structuredClone(state);
  const weights = [],
    food = {};
  for (let i = 0; i < 21; i++) {
    const date = addDays(start, i);
    weights.push({ date, kg: weeks[Math.floor(i / 7)] });
    food[date] = simpleFood(
      budgetFor(state, date, false).calories,
      `meals-${date}`,
    );
    if (i < foodDays)
      result = saveCheckin(
        result,
        date,
        { matches: "yes", extras, energy, steps },
        food[date],
        addDays(start, 21),
        `${date}T12:00:00.000Z`,
      );
  }
  return {
    state: result,
    proof: { weights, food, trainingForDate: () => false },
    today: addDays(start, 21),
  };
}

test("a confirmed profile creates a modest estimated target without creating a weigh-in", () => {
  const state = configured(),
    profile = profileFor(state, start),
    p = planFor(state, start),
    e = estimateEnergy(values, 80);
  assert.equal(e.resting, 1748.75);
  assert.equal(e.factor, 1.2);
  assert.equal(e.maintenance, 2098.5);
  assert.equal(p.restCalories, 1800);
  assert.equal(p.trainingCalories, 1950);
  assert.equal(p.proteinGrams, 145);
  assert.equal(firstMilestone(profile), 76);
  assert.deepEqual(state.checkins, {});
  assert.ok(!("metrics" in state));
  assert.equal(budgetFor(state, addDays(start, -1), false), undefined);
});

test("equation, height, age, current weight and ordinary steps all influence the estimate", () => {
  const baseline = estimateEnergy(values, 80);
  assert.ok(
    estimateEnergy({ ...values, equation: "female" }, 80).resting <
      baseline.resting,
  );
  assert.ok(
    estimateEnergy({ ...values, age: 50 }, 80).resting < baseline.resting,
  );
  assert.ok(
    estimateEnergy({ ...values, heightCm: 190 }, 80).resting > baseline.resting,
  );
  assert.ok(estimateEnergy(values, 90).maintenance > baseline.maintenance);
  assert.ok(
    estimateEnergy({ ...values, baselineSteps: 8000 }, 80).maintenance >
      baseline.maintenance,
  );
  assert.ok(baseline.maintenance - baseline.restCalories <= 350);
});

test("missing, underage, underweight, unsupported and malformed profiles cannot generate a restrictive plan", () => {
  for (const patch of [
    { age: 17 },
    { equation: "unknown" },
    { heightCm: 0 },
    { startWeightKg: 30 },
    { baselineSteps: -1 },
    { age: NaN },
    { age: 18, heightCm: 220, startWeightKg: 180, baselineSteps: 20000 },
  ])
    assert.throws(() =>
      saveProfile(emptyNutrition(), { ...values, ...patch }, start),
    );
  assert.throws(
    () =>
      saveProfile(
        emptyNutrition(),
        { ...values, heightCm: 200, startWeightKg: 50 },
        start,
      ),
    /BMI/,
  );
  assert.deepEqual(normalizeNutrition({ version: 99 }), emptyNutrition());
});

test("weight reference uses a recent average, excludes future/stale weights and never invents missing values", () => {
  const weights = [
    { date: start, kg: 78 },
    { date: addDays(start, 1), kg: 79 },
    { date: addDays(start, 2), kg: 80 },
    { date: addDays(start, 20), kg: 120 },
  ];
  assert.equal(recentReference(weights, addDays(start, 2), 85), 79);
  assert.equal(recentReference(weights, addDays(start, 18), 85), 85);
  assert.equal(recentReference([], start, 85), 85);
});

test("training allowance is planned once, explicit skips remove it only if there was no actual work", () => {
  assert.equal(trainingFuelDay(true, false, false), true);
  assert.equal(trainingFuelDay(true, false, true), false);
  assert.equal(trainingFuelDay(false, true, true), true);
  assert.equal(trainingFuelDay(false, false, false), false);
  const state = configured();
  assert.equal(
    budgetFor(state, start, true).calories -
      budgetFor(state, start, false).calories,
    150,
  );
});

test("reaching the first milestone switches future food context to maintenance, not endless dieting", () => {
  const state = configured();
  assert.ok(
    budgetFor(state, start, false, 76).calories >
      planFor(state, start).restCalories,
  );
  const e = evidence(state, { weeks: [77, 76.5, 76] });
  const review = reviewNutrition(e.state, e.today, e.proof);
  assert.equal(review.delta, 0);
  assert.match(review.title, /milestone/);
});

for (const [label, profile] of [
  ["low-step male", values],
  [
    "low-step female",
    {
      ...values,
      age: 35,
      heightCm: 165,
      startWeightKg: 75,
      equation: "female",
    },
  ],
  [
    "moderate-step male",
    {
      ...values,
      age: 40,
      heightCm: 185,
      startWeightKg: 100,
      baselineSteps: 6000,
    },
  ],
]) {
  test(`all batch recipes follow ${label} calorie/protein targets within honest kitchen rounding`, () => {
    const state = saveProfile(emptyNutrition(), profile, start, [], stamp);
    for (const training of [false, true])
      for (const main of Object.values(prepRecipeMap).filter(
        (r) => r.kind === "main",
      )) {
        const c = {
          training,
          weightKg: profile.startWeightKg,
          nutrition: budgetFor(state, start, training),
        };
        const servings = [
          prepRecipeMap["prep-overnight-oats"],
          main,
          prepRecipeMap["prep-yogurt-banana-toast"],
          main,
        ].map((r) => prepServing(r, c));
        const total = servings.reduce(
          (s, r) => ({
            calories: s.calories + r.calories,
            protein: s.protein + r.protein,
          }),
          { calories: 0, protein: 0 },
        );
        assert.ok(
          Math.abs(total.calories - c.nutrition.calories) <= 100,
          `${label}/${main.id}/${training}: ${JSON.stringify(total)} vs ${JSON.stringify(c.nutrition)}`,
        );
        assert.ok(
          total.protein >= c.nutrition.protein * 0.9,
          `${main.id}: protein ${total.protein}`,
        );
        assert.ok(
          servings.every((s) =>
            s.ingredients.every(
              (i) => Number.isFinite(i.amount) && i.amount > 0,
            ),
          ),
        );
        assert.ok(
          servings[1].ingredients.some(
            (i) => i.id === "mixed-veg" && i.amount >= 200,
          ),
        );
        assert.ok(
          servings[1].ingredients.some(
            (i) => i.id === "olive-oil" && i.amount >= 5,
          ),
        );
      }
  });
}

test("old prepared quantities reproduce exactly; new cooked targets survive normalization, profile edits and swaps", () => {
  const state = configured();
  for (const calibrated of [false, true]) {
    const oldContext = () => ({
      training: true,
      weightKg: 80,
      ...(calibrated ? { nutrition: budgetFor(state, start, true) } : {}),
    });
    const prep = createMealPrep(start),
      batch = prepBatch(prep, start, oldContext);
    prep.blocks[start] = {
      preparedAt: stamp,
      preparedSignature: batch.signature,
      contexts: { [start]: oldContext(), [addDays(start, 1)]: oldContext() },
    };
    const restored = normalizeMealPrep(JSON.parse(JSON.stringify(prep)), start);
    const futureContext = () => ({
      training: false,
      weightKg: 70,
      nutrition: { version: 1, calories: 1700, protein: 130 },
    });
    assert.equal(
      prepBatch(restored, start, futureContext).signature,
      batch.signature,
    );
    assert.equal(
      preparedBatchFor(restored, start, futureContext).signature,
      batch.signature,
    );
    assert.deepEqual(
      prepShopping([prepBatch(restored, start, futureContext)]),
      batch.ingredients,
    );
  }
});

test("calorie target changes update actual ingredients and grocery amounts, not only displayed labels", () => {
  const prep = createMealPrep(start);
  const c = (calories) => () => ({
    training: true,
    weightKg: 80,
    nutrition: { version: 1, calories, protein: 145 },
  });
  const low = prepBatch(prep, start, c(1800)),
    high = prepBatch(prep, start, c(2000));
  assert.notEqual(low.signature, high.signature);
  assert.notDeepEqual(prepShopping([low]), prepShopping([high]));
  const swapped = setPrepChoice(prep, start, "main", "prep-beef-rice");
  assert.notEqual(prepBatch(swapped, start, c(1800)).signature, low.signature);
});

test("unknown intake/energy/extras never becomes a trusted zero-calorie or good-recovery day", () => {
  const state = configured();
  assert.throws(
    () =>
      saveCheckin(
        state,
        start,
        { matches: "yes", extras: null, energy: "okay", steps: null },
        simpleFood(),
        start,
      ),
    /Unknown is not zero/,
  );
  assert.throws(() =>
    saveCheckin(
      state,
      start,
      { matches: "unsure", extras: null, energy: "", steps: null },
      simpleFood(),
      start,
    ),
  );
  const saved = saveCheckin(
    state,
    start,
    { matches: "unsure", extras: null, energy: "low", steps: null },
    simpleFood(),
    start,
  );
  assert.equal(saved.checkins[start].intake, null);
  assert.equal(saved.checkins[start].steps, null);
  assert.throws(() =>
    saveCheckin(
      state,
      addDays(start, 1),
      { matches: "no", extras: null, energy: "okay", steps: 2000 },
      simpleFood(),
      start,
    ),
  );
});

test("two steady comparisons and reliable confirmed meals support one small explicit adjustment", () => {
  const e = evidence(configured()),
    before = structuredClone(e.state);
  const review = reviewNutrition(e.state, e.today, e.proof);
  assert.equal(review.status, "less");
  assert.equal(review.delta, -100);
  const applied = applyReview(
    e.state,
    e.today,
    e.proof,
    "2026-01-26T12:00:00.000Z",
  );
  assert.equal(
    planFor(applied, e.today).restCalories,
    planFor(e.state, e.today).restCalories - 100,
  );
  assert.equal(
    planFor(applied, addDays(e.today, -1)).restCalories,
    planFor(e.state, e.today).restCalories,
  );
  assert.equal(reviewNutrition(applied, e.today, e.proof).delta, 0);
  assert.deepEqual(e.state, before);
});

test("missing weights, meal days, changed food snapshots and recovery concerns prevent unsupported cuts", () => {
  for (const type of ["weights", "food", "signature", "recovery"]) {
    const e = evidence(configured());
    if (type === "weights")
      e.proof.weights = e.proof.weights.filter((_, i) => i % 3 === 0);
    if (type === "food") e.state.checkins = {};
    if (type === "signature")
      Object.values(e.proof.food).forEach((f) => (f.signature = "changed"));
    if (type === "recovery") e.proof.recoveryConcern = true;
    assert.equal(reviewNutrition(e.state, e.today, e.proof).delta, 0, type);
  }
});

test("extra intake and changed ordinary activity are reviewed before reducing the recipes", () => {
  const extra = evidence(configured(), { extras: 250 });
  assert.equal(
    reviewNutrition(extra.state, extra.today, extra.proof).status,
    "consistency",
  );
  const steps = evidence(configured(), { steps: 7000 });
  assert.equal(reviewNutrition(steps.state, steps.today, steps.proof).delta, 0);
});

test("on-track loss is held; overly fast loss can suggest more fuel, not a larger deficit", () => {
  const onTrack = evidence(configured(), { weeks: [80, 79.7, 79.4] });
  assert.equal(
    reviewNutrition(onTrack.state, onTrack.today, onTrack.proof).status,
    "on-track",
  );
  const fast = evidence(configured(), { weeks: [80, 79.9, 79.1] });
  assert.equal(reviewNutrition(fast.state, fast.today, fast.proof).delta, 100);
  const low = evidence(configured(), { energy: "low" });
  assert.equal(reviewNutrition(low.state, low.today, low.proof).delta, 0);
});

test("a single flat comparison does not undo an earlier falling week", () => {
  const e = evidence(configured(), { weeks: [80, 79.5, 79.5] });
  assert.equal(reviewNutrition(e.state, e.today, e.proof).delta, 0);
});

test("today's unwell report pauses cuts immediately even though today's food/weight window is incomplete", () => {
  const e = evidence(configured());
  assert.equal(reviewNutrition(e.state, e.today, e.proof).delta, -100);
  const state = saveCheckin(
    e.state,
    e.today,
    { matches: "unsure", extras: null, energy: "unwell", steps: null },
    { ...simpleFood(), complete: false, calories: null },
    e.today,
  );
  assert.equal(reviewNutrition(state, e.today, e.proof).status, "hold");
  assert.equal(reviewNutrition(state, e.today, e.proof).delta, 0);
});

test("nutrition confirmation merges atomically while independent profile/history edits survive", () => {
  const base = configured();
  const a = saveCheckin(
    base,
    start,
    { matches: "yes", extras: 0, energy: "okay", steps: 2500 },
    simpleFood(),
    start,
    stamp,
  );
  const b = saveCheckin(
    base,
    start,
    { matches: "no", extras: null, energy: "low", steps: null },
    simpleFood(),
    start,
    "2026-01-05T13:00:00.000Z",
  );
  const other = addDays(start, 1);
  b.checkins[other] = { ...b.checkins[start], id: "independent-day" };
  for (const [local, remote] of [
    [a, b],
    [b, a],
  ]) {
    const merged = normalizeNutrition(
      mergeProgressChanges(base, local, remote),
    );
    assert.deepEqual(merged.checkins[start], b.checkins[start]);
    assert.ok(merged.checkins[other]);
    assert.deepEqual(merged.profiles, base.profiles);
  }
});

test("only complete numeric meal snapshots count, without double-counting another source", () => {
  const log = { eaten: {}, recipes: {}, portions: {} };
  for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
    log.eaten[slot] = true;
    log.recipes[slot] = "synthetic-recipe";
    log.portions[slot] = { calories: 450, protein: 35, plate: ["Saved plate"] };
  }
  assert.equal(foodEvidence(log, "Nutrition").calories, 1800);
  const reordered = structuredClone(log);
  for (const slot of Object.keys(reordered.portions)) {
    const p = reordered.portions[slot];
    reordered.portions[slot] = {
      plate: p.plate,
      protein: p.protein,
      calories: p.calories,
    };
  }
  assert.equal(
    foodEvidence(log, "Nutrition").signature,
    foodEvidence(reordered, "Nutrition").signature,
    "PostgreSQL JSON key ordering cannot invalidate a food confirmation",
  );
  log.eaten.snack = false;
  assert.equal(foodEvidence(log, "Nutrition").complete, false);
  assert.equal(foodEvidence(log, "Nutrition").calories, null);
});

test("fresh start keeps the factual profile but clears check-ins and previous adjustments", () => {
  const e = evidence(configured());
  const restarted = restartNutrition(
    e.state,
    e.today,
    e.proof.weights,
    "2026-01-26T12:00:00.000Z",
  );
  assert.deepEqual(restarted.checkins, {});
  assert.equal(Object.keys(restarted.plans).length, 1);
  assert.equal(profileFor(restarted, e.today).heightCm, values.heightCm);
  assert.equal(planFor(restarted, e.today).reason, "initial");
});
