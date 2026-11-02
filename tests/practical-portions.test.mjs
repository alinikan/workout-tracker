import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import {
  prepRecipes,
  prepRecipeMap,
  prepNutritionEstimates,
  recipeForPortionVersion,
} from "../src/features/mealPrep/recipes.ts";
import {
  createMealPrep,
  normalizeMealPrep,
  prepBatch,
  preparedBatchFor,
  prepServing,
  prepShopping,
  setPrepChoice,
} from "../src/features/mealPrep/plan.ts";

const start = "2026-11-01";
const context = (calories = 1950, protein = 145) => ({
  training: true,
  weightKg: 80,
  portionVersion: 2,
  nutrition: { version: 1, calories, protein },
});
const find = (serving, id) =>
  serving.ingredients.find((item) => item.id === id);
const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const app = await server.ssrLoadModule("/src/App.tsx");
const cook = (state, c) => {
  const batch = prepBatch(state, start, () => c);
  return {
    ...state,
    blocks: {
      ...state.blocks,
      [start]: {
        mainId: batch.block.mainId,
        breakfastId: batch.block.breakfastId,
        snackId: batch.block.snackId,
        preparedAt: `${start}T18:00:00Z`,
        preparedSignature: batch.signature,
        contexts: Object.fromEntries(
          batch.servings.map((row) => [row.date, structuredClone(c)]),
        ),
      },
    },
  };
};

test("practical breakfasts use 150 g yogurt and counted 125 ml milk; yogurt snacks stay at 175 g", () => {
  for (const recipe of prepRecipes.filter((r) => r.kind !== "main")) {
    const serving = prepServing(recipe, context());
    assert.equal(serving.portionVersion, 2);
    assert.ok(serving.ingredients.every((item) => item.amount > 0));
    if (recipe.kind === "breakfast") {
      assert.equal(find(serving, "greek-yogurt").amount, 150);
      assert.equal(find(serving, "milk-1-percent").amount, 125);
      assert.ok(find(serving, "oats").amount <= 80);
      assert.ok(serving.recipe.steps.join(" ").includes("milk"));
    } else if (find(serving, "greek-yogurt"))
      assert.equal(find(serving, "greek-yogurt").amount, 175);
    else assert.ok(find(serving, "leanfit-chocolate-whey").amount <= 35);
  }
  const milk = prepNutritionEstimates["milk-1-percent"];
  assert.equal((125 / milk.per) * milk.calories, 55);
  assert.equal((125 / milk.per) * milk.protein, 4.5);
});

test("all practical recipe combinations keep realistic bounds and representative full-day targets", () => {
  for (const [calories, protein] of [
    [1700, 115],
    [1850, 135],
    [1950, 145],
    [2150, 145],
    [2450, 180],
  ])
    for (const main of prepRecipes.filter((r) => r.kind === "main"))
      for (const breakfast of prepRecipes.filter((r) => r.kind === "breakfast"))
        for (const snack of prepRecipes.filter((r) => r.kind === "snack")) {
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
          const meals = prepBatch(state, start, () =>
            context(calories, protein),
          ).servings.filter((row) => row.date === start);
          const total = meals.reduce(
            (sum, row) => ({
              calories: sum.calories + row.serving.calories,
              protein: sum.protein + row.serving.protein,
            }),
            { calories: 0, protein: 0 },
          );
          const label = `${calories}/${protein}/${main.id}/${breakfast.id}/${snack.id}`;
          assert.ok(
            Math.abs(total.calories - calories) <= 100,
            `${label}: ${JSON.stringify(total)}`,
          );
          assert.ok(
            total.protein >= protein * 0.9,
            `${label}: ${JSON.stringify(total)}`,
          );
          assert.equal(meals.length, 4);
          for (const { serving } of meals)
            for (const item of serving.ingredients) {
              if (item.id === "greek-yogurt") assert.ok(item.amount <= 175);
              if (item.id === "oats")
                assert.ok(item.amount >= 30 && item.amount <= 80);
              if (item.id === "rice")
                assert.ok(item.amount >= 40 && item.amount <= 90);
              if (item.id === "potatoes")
                assert.ok(item.amount >= 200 && item.amount <= 450);
              if (["chicken-breast", "chicken-thigh"].includes(item.id))
                assert.ok(item.amount <= 250);
              if (item.id === "extra-lean-beef") assert.ok(item.amount <= 200);
              if (item.id === "olive-oil") assert.ok(item.amount <= 15);
              if (item.id === "leanfit-chocolate-whey")
                assert.ok(item.amount <= 35);
            }
        }
});

test("very high targets do not force oversized food or invent that the target was met", () => {
  const batch = prepBatch(createMealPrep(start), start, () =>
    context(3800, 220),
  );
  const meals = batch.servings.filter((row) => row.date === start);
  assert.ok(meals.reduce((sum, row) => sum + row.serving.calories, 0) < 3700);
  assert.equal(find(meals[0].serving, "greek-yogurt").amount, 150);
  assert.equal(find(meals[2].serving, "greek-yogurt").amount, 175);
});

test("old prepared batches keep original ingredients and instructions after practical portions launch", () => {
  const oldContext = {
    training: true,
    weightKg: 80,
    nutrition: { version: 1, calories: 1950, protein: 160 },
  };
  const saved = cook(createMealPrep(start), oldContext);
  const old = prepBatch(saved, start, () => oldContext);
  assert.ok(find(old.servings[0].serving, "greek-yogurt").amount > 200);
  const restored = normalizeMealPrep(JSON.parse(JSON.stringify(saved)), start);
  const physical = preparedBatchFor(restored, start, () => context());
  assert.equal(physical.signature, old.signature);
  assert.deepEqual(physical.servings, old.servings);
  assert.ok(!find(physical.servings[0].serving, "milk-1-percent"));
  assert.equal(physical.servings[0].serving.portionVersion, undefined);
});

test("new prepared batches freeze revision 2 and shopping counts milk once per dated breakfast", () => {
  const saved = cook(createMealPrep(start), context());
  const restored = normalizeMealPrep(JSON.parse(JSON.stringify(saved)), start);
  const batch = preparedBatchFor(restored, start, () => context(2150, 155));
  assert.equal(batch.signature, saved.blocks[start].preparedSignature);
  assert.equal(restored.blocks[start].contexts[start].portionVersion, 2);
  const groceries = prepShopping([batch, batch]);
  assert.equal(
    groceries.find((item) => item.id === "milk-1-percent").amount,
    250,
  );
  assert.equal(
    groceries.find((item) => item.id === "greek-yogurt").amount,
    650,
  );
});

test("the signed revision restores context markers dropped by an older client", () => {
  const saved = cook(createMealPrep(start), context());
  for (const c of Object.values(saved.blocks[start].contexts))
    delete c.portionVersion;
  const restored = normalizeMealPrep(saved, start);
  assert.equal(restored.blocks[start].contexts[start].portionVersion, 2);
  assert.equal(
    preparedBatchFor(restored, start, () => context(2150, 155)).signature,
    saved.blocks[start].preparedSignature,
  );
});

test("meal snapshot revision survives normalization; archive recipes remain immutable", () => {
  const store = app.emptyStore(start);
  store.dietDays[start] = {
    meals: { breakfast: true },
    recipes: { breakfast: "prep-overnight-oats" },
    portions: {
      breakfast: {
        plate: ["150 g yogurt", "125 ml milk"],
        calories: 490,
        protein: 33,
        portionVersion: 2,
      },
    },
  };
  const normalized = app.normalizeStore(JSON.parse(JSON.stringify(store)));
  assert.equal(normalized.dietDays[start].portions.breakfast.portionVersion, 2);
  const recipe = prepRecipeMap["prep-overnight-oats"],
    before = JSON.stringify(recipe);
  assert.equal(recipeForPortionVersion(recipe), recipe);
  assert.notEqual(recipeForPortionVersion(recipe, 2), recipe);
  assert.equal(JSON.stringify(recipe), before);
  assert.ok(Object.isFrozen(recipeForPortionVersion(recipe, 2).ingredients));
});
