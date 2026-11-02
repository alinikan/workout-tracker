import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prepNutritionEstimates,
  prepRecipeMap,
  prepRecipes,
} from "../src/features/mealPrep/recipes.ts";
import {
  createMealPrep,
  normalizeMealPrep,
  prepBatch,
  prepServing,
  prepShopping,
  preparedBatchFor,
  setPrepChoice,
} from "../src/features/mealPrep/plan.ts";
import {
  budgetFor,
  emptyNutrition,
  saveProfile,
} from "../src/features/nutrition/model.ts";
import { mergeProgressChanges } from "../src/lib/syncMerge.ts";

const start = "2026-11-01";
const wheyId = "prep-leanfit-whey-banana-toast";
const chiaId = "prep-chia-overnight-oats";
const ingredient = (serving, id) =>
  serving.ingredients.find((item) => item.id === id);
const profile = {
  age: 30,
  heightCm: 175,
  startWeightKg: 80,
  equation: "male",
  baselineSteps: 2500,
};
const configured = (values = profile) =>
  saveProfile(emptyNutrition(), values, start, [], `${start}T19:00:00Z`);

test("LEANFIT powder grams use the verified 35 g / 140 kcal / 24 g label, not 35 g of protein", () => {
  assert.deepEqual(prepNutritionEstimates["leanfit-chocolate-whey"], {
    per: 35,
    calories: 140,
    protein: 24,
  });
  const rest = prepServing(prepRecipeMap[wheyId], {
    weightKg: 80,
    training: false,
  });
  assert.equal(ingredient(rest, "leanfit-chocolate-whey").amount, 35);
  assert.equal(rest.calories, 250); // 140 kcal powder + 105 banana, rounded once.
  assert.equal(rest.protein, 25); // Banana contributes about 1.3 g.
  assert.ok(!ingredient(rest, "greek-yogurt"));
  assert.ok(!ingredient(rest, "toast"));
});

test("whey and chia are optional recipe choices, never required extras or a fifth meal", () => {
  const plain = createMealPrep(start);
  assert.equal(
    prepBatch(plain, start, () => ({ training: true, weightKg: 80 })).servings
      .length,
    8,
  );
  const defaults = prepShopping([
    prepBatch(plain, start, () => ({ training: true, weightKg: 80 })),
  ]);
  assert.ok(
    !defaults.some((item) =>
      ["chia-seeds", "leanfit-chocolate-whey"].includes(item.id),
    ),
  );
  const selected = setPrepChoice(
    setPrepChoice(plain, start, "snack", wheyId),
    start,
    "breakfast",
    chiaId,
  );
  const batch = prepBatch(selected, start, () => ({
    training: true,
    weightKg: 80,
  }));
  for (const date of [start, "2026-11-02"]) {
    const meals = batch.servings.filter((row) => row.date === date);
    assert.equal(meals.length, 4);
    assert.equal(
      meals.filter((row) => row.serving.recipe.id === wheyId).length,
      1,
    );
    assert.equal(
      meals.filter((row) => row.serving.recipe.id === chiaId).length,
      1,
    );
  }
  const groceries = prepShopping([batch, batch]);
  assert.equal(
    groceries.find((item) => item.id === "leanfit-chocolate-whey").amount,
    70,
  );
  assert.equal(groceries.find((item) => item.id === "chia-seeds").amount, 20);
  assert.equal(
    groceries.find((item) => item.id === "chia-seeds").optional,
    undefined,
    "An optional recipe's chosen ingredients still count nutritionally.",
  );
});

test("new recipe combinations fit representative personalized training/rest targets with every main", () => {
  for (const values of [
    profile,
    { ...profile, startWeightKg: 65, heightCm: 165 },
    { ...profile, startWeightKg: 100, heightCm: 185, baselineSteps: 6000 },
  ]) {
    const nutrition = configured(values);
    for (const training of [false, true]) {
      const c = {
        training,
        weightKg: values.startWeightKg,
        nutrition: budgetFor(nutrition, start, training),
      };
      for (const main of prepRecipes.filter((recipe) => recipe.kind === "main"))
        for (const breakfast of prepRecipes.filter(
          (recipe) => recipe.kind === "breakfast",
        ))
          for (const snack of prepRecipes.filter(
            (recipe) => recipe.kind === "snack",
          )) {
            // This feature introduces a menu-aware path only for new choices;
            // old v1 menus retain their existing bounds and reproducible history.
            if (breakfast.id !== chiaId && snack.id !== wheyId) continue;
            let state = setPrepChoice(
              createMealPrep(start),
              start,
              "main",
              main.id,
            );
            state = setPrepChoice(
              setPrepChoice(state, start, "breakfast", breakfast.id),
              start,
              "snack",
              snack.id,
            );
            const meals = prepBatch(state, start, () => c)
              .servings.filter((row) => row.date === start)
              .map((row) => row.serving);
            const calories = meals.reduce(
              (sum, serving) => sum + serving.calories,
              0,
            );
            const protein = meals.reduce(
              (sum, serving) => sum + serving.protein,
              0,
            );
            const label = `${values.startWeightKg}/${training}/${main.id}/${breakfast.id}/${snack.id}`;
            assert.ok(
              Math.abs(calories - c.nutrition.calories) <= 100,
              `${label}: ${calories} vs ${c.nutrition.calories}`,
            );
            assert.ok(
              protein >= c.nutrition.protein * 0.9,
              `${label}: ${protein} vs ${c.nutrition.protein}`,
            );
            const powder = ingredient(meals[2], "leanfit-chocolate-whey");
            if (powder) {
              assert.ok(powder.amount > 0 && powder.amount <= 35, label);
              assert.ok(Number.isInteger(powder.amount), "Use whole grams on a kitchen scale.");
            }
            const chia = ingredient(meals[0], "chia-seeds");
            if (chia) assert.equal(chia.amount, 10);
          }
    }
  }
});

test("chia energy is included, displaced oats stay practical, and instructions hydrate seeds", () => {
  const c = {
    training: false,
    weightKg: 80,
    nutrition: { version: 1, calories: 1900, protein: 145 },
  };
  const plain = prepServing(prepRecipeMap["prep-overnight-oats"], c);
  const chia = prepServing(prepRecipeMap[chiaId], c);
  assert.equal(ingredient(chia, "chia-seeds").amount, 10);
  assert.ok(ingredient(chia, "oats").amount < ingredient(plain, "oats").amount);
  const rawCalories = chia.ingredients.reduce(
    (sum, item) =>
      sum +
      (item.amount / prepNutritionEstimates[item.id].per) *
        prepNutritionEstimates[item.id].calories,
    0,
  );
  assert.equal(chia.calories, Math.round(rawCalories / 10) * 10);
  assert.match(chia.recipe.steps.join(" "), /overnight.*at least 4 hours/);
  assert.match(chia.recipe.storage, /Never swallow.*dry chia/);
});

test("whey/chia batch choices sync as existing recipe fields and cooked servings remain frozen", () => {
  const state = createMealPrep(start),
    a = setPrepChoice(state, start, "snack", wheyId),
    b = setPrepChoice(state, start, "breakfast", chiaId);
  const merged = normalizeMealPrep(mergeProgressChanges(state, a, b), start);
  assert.equal(merged.blocks[start].snackId, wheyId);
  assert.equal(merged.blocks[start].breakfastId, chiaId);
  const oldContext = () => ({
    training: true,
    weightKg: 80,
    nutrition: { version: 1, calories: 1950, protein: 145 },
  });
  const batch = prepBatch(merged, start, oldContext);
  merged.blocks[start] = {
    ...merged.blocks[start],
    mainId: batch.block.mainId,
    preparedAt: `${start}T19:00:00Z`,
    preparedSignature: batch.signature,
    contexts: Object.fromEntries(
      batch.servings.map((row) => [row.date, oldContext()]),
    ),
  };
  const restored = normalizeMealPrep(JSON.parse(JSON.stringify(merged)), start);
  const nextContext = () => ({
    training: false,
    weightKg: 75,
    nutrition: { version: 1, calories: 1800, protein: 135 },
  });
  assert.equal(
    preparedBatchFor(restored, start, nextContext)?.signature,
    batch.signature,
  );
  assert.deepEqual(
    prepShopping([prepBatch(restored, start, nextContext)]),
    prepShopping([batch]),
  );
});
