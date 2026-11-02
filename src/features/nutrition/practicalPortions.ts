import {
  prepNutritionEstimates as foods,
  type Ingredient,
  type PrepRecipe,
} from "../mealPrep/recipes.ts";
import type { NutritionBudget } from "./model.ts";

type Menu = { breakfastId: string; snackId: string };
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
const rounded = (n: number, step: number, low: number, high: number) =>
  clamp(Math.round(n / step) * step, low, high);
const totals = (items: Record<string, number>) =>
  Object.entries(items).reduce(
    (sum, [id, amount]) => ({
      calories: sum.calories + (amount / foods[id].per) * foods[id].calories,
      protein: sum.protein + (amount / foods[id].per) * foods[id].protein,
    }),
    { calories: 0, protein: 0 },
  );

function breakfast(budget: NutritionBudget, chia: boolean) {
  const fixed = {
    "greek-yogurt": 150,
    "milk-1-percent": 125,
    berries: 100,
    ...(chia ? { "chia-seeds": 10 } : {}),
  };
  const oats = rounded(
    (budget.calories * 0.25 - totals(fixed).calories) /
      (foods.oats.calories / 100),
    5,
    30,
    80,
  );
  return { ...fixed, oats };
}
function snack(budget: NutritionBudget, whey: boolean) {
  // A bounded real-life serving comes first. Protein that does not fit here
  // belongs in the main meals, not in a 350 g bowl or a second hidden shake.
  const portions = whey ? [18, 26, 35] : [175];
  const candidates = portions.flatMap((amount) =>
    [0, 0.5, 1, 1.5, 2].map((toast) => {
      const items = {
        [whey ? "leanfit-chocolate-whey" : "greek-yogurt"]: amount,
        banana: 1,
        toast,
      };
      const food = totals(items);
      const proteinShare = budget.protein * (whey ? 0.2 : 0.15);
      return {
        items,
        score:
          Math.abs(food.calories - budget.calories * 0.15) +
          Math.max(0, proteinShare - food.protein) * 6,
      };
    }),
  );
  return candidates.sort((a, b) => a.score - b.score)[0].items;
}
function main(recipe: PrepRecipe, budget: NutritionBudget, menu?: Menu) {
  const earlier = [
    breakfast(budget, menu?.breakfastId === "prep-chia-overnight-oats"),
    snack(budget, menu?.snackId === "prep-leanfit-whey-banana-toast"),
  ];
  const energy =
    (budget.calories -
      earlier.reduce((sum, items) => sum + totals(items).calories, 0)) /
    2;
  const protein =
    (budget.protein -
      earlier.reduce((sum, items) => sum + totals(items).protein, 0)) /
    2;
  const meat = recipe.ingredients.find((item) =>
    ["chicken-breast", "chicken-thigh", "extra-lean-beef"].includes(item.id),
  )?.id;
  const starch = recipe.ingredients.find((item) =>
    ["rice", "potatoes"].includes(item.id),
  )?.id;
  if (!meat || !starch) throw new Error("Unsupported practical main recipe.");
  const candidates: Array<{ items: Record<string, number>; score: number }> =
    [];
  const preferredOil = meat === "chicken-thigh" ? 5 : 10;
  // Fit calories with rice/potatoes after choosing a bounded meat portion.
  // Adjacent kitchen increments let protein and energy compete without forcing
  // giant quantities. If the bounds cannot meet a target, the UI says so.
  for (
    let meatGrams = 130;
    meatGrams <= (meat === "extra-lean-beef" ? 200 : 250);
    meatGrams += 5
  ) {
    for (const oil of [5, 10, 15]) {
      const fixed = { [meat]: meatGrams, "mixed-veg": 200, "olive-oil": oil };
      const step = starch === "rice" ? 5 : 25;
      const wanted =
        (energy - totals(fixed).calories) / (foods[starch].calories / 100);
      for (const delta of [-step, 0, step]) {
        const starchGrams = rounded(
          wanted + delta,
          step,
          starch === "rice" ? 40 : 200,
          starch === "rice" ? 90 : 450,
        );
        const items = { ...fixed, [starch]: starchGrams },
          food = totals(items);
        const score =
          Math.abs(food.calories - energy) +
          Math.max(0, protein - food.protein) * 8 +
          Math.max(0, food.protein - protein) * 2 +
          Math.abs(oil - preferredOil) * 0.2;
        candidates.push({ items, score });
      }
    }
  }
  return candidates.sort((a, b) => a.score - b.score)[0].items;
}

/** Version 2 is selected only by an explicit saved context. Never apply it to
 * historical version-1 containers just because the app has been upgraded. */
export function practicalIngredients(
  recipe: PrepRecipe,
  budget: NutritionBudget,
  menu?: Menu,
): Ingredient[] {
  const amounts: Record<string, number> =
    recipe.kind === "breakfast"
      ? breakfast(budget, recipe.id === "prep-chia-overnight-oats")
      : recipe.kind === "snack"
        ? snack(budget, recipe.id === "prep-leanfit-whey-banana-toast")
        : main(recipe, budget, menu);
  return recipe.ingredients.flatMap((base) => {
    if (base.optional) return [{ ...base }];
    if (!(base.id in amounts))
      throw new Error("Unsupported practical ingredient.");
    const amount = amounts[base.id];
    if (!amount) return [];
    return [
      {
        ...base,
        amount,
        ...(base.id === "rice"
          ? { cookedAmount: amount * 3 }
          : ["chicken-breast", "chicken-thigh", "extra-lean-beef"].includes(
                base.id,
              )
            ? { cookedAmount: Math.round(amount * 0.75) }
            : {}),
      },
    ];
  });
}
