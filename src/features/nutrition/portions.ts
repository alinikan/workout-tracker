import {
  prepNutritionEstimates as foods,
  type Ingredient,
  type PrepRecipe,
} from "../mealPrep/recipes.ts";
import type { NutritionBudget } from "./model.ts";

const bound = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const grams = (n: number, min: number, max: number) =>
  bound(Math.round(n / 5) * 5, min, max);
const totals = (items: Record<string, number>) =>
  Object.entries(items).reduce(
    (sum, [id, amount]) => ({
      calories: sum.calories + (foods[id].calories * amount) / foods[id].per,
      protein: sum.protein + (foods[id].protein * amount) / foods[id].per,
    }),
    { calories: 0, protein: 0 },
  );

/** Solve two food quantities against energy AND protein instead of scaling every
 * ingredient by body weight. Fixed fruit/vegetables stay in the meal. Quantities
 * are practical kitchen increments, so the final label is still an estimate.
 * Version 1 must remain reproducible for contexts saved with cooked batches. */
function breakfast(budget: NutritionBudget) {
  const energy = budget.calories * 0.25 - 50,
    protein = budget.protein * 0.3 - 1;
  const oats = grams((energy - 5.9 * protein) / (3.89 - 5.9 * 0.169), 25, 120);
  const yogurt = grams((protein - 0.169 * oats) / 0.1, 150, 400);
  return { oats, "greek-yogurt": yogurt, berries: 100 };
}
function snack(budget: NutritionBudget) {
  const targetEnergy = budget.calories * 0.15,
    targetProtein = budget.protein * 0.2;
  const options = [0, 0.5, 1, 1.5, 2].map((toast) => {
    const yogurt = grams((targetProtein - 1.3 - 4 * toast) / 0.1, 150, 350);
    const items = { "greek-yogurt": yogurt, banana: 1, toast };
    const food = totals(items);
    return {
      items,
      score:
        Math.abs(food.calories - targetEnergy) +
        Math.abs(food.protein - targetProtein) * 6,
    };
  });
  return options.sort((a, b) => a.score - b.score)[0].items;
}
function main(recipe: PrepRecipe, budget: NutritionBudget) {
  const breakfastFood = totals(breakfast(budget)),
    snackFood = totals(snack(budget));
  const energy =
    (budget.calories - breakfastFood.calories - snackFood.calories) / 2;
  const protein =
    (budget.protein - breakfastFood.protein - snackFood.protein) / 2;
  const meat = recipe.ingredients.find((i) =>
    ["chicken-breast", "chicken-thigh", "extra-lean-beef"].includes(i.id),
  )?.id;
  const starch = recipe.ingredients.find((i) =>
    ["rice", "potatoes"].includes(i.id),
  )?.id;
  if (!meat || !starch)
    throw new Error("This recipe does not support calibrated portions.");
  const m = foods[meat],
    s = foods[starch];
  // Keep vegetables and a measured fat source rather than meeting an energy
  // budget by deleting whole food groups. Higher targets retain more oil.
  // Thighs/beef already contain more fat than breast. Using the same added oil
  // for every protein can force the higher-fat recipes above the day's budget.
  const oil = Math.max(
    5,
    grams(budget.calories / 125, 10, 25) -
      (meat === "chicken-thigh" ? 10 : meat === "extra-lean-beef" ? 5 : 0),
  );
  const remainingEnergy = energy - 100 - oil * 9,
    remainingProtein = protein - 6;
  const starchAmount = grams(
    (remainingEnergy - (m.calories / m.protein) * remainingProtein) /
      (s.calories / 100 - ((m.calories / m.protein) * s.protein) / 100),
    starch === "rice" ? 30 : 150,
    starch === "rice" ? 140 : 700,
  );
  const meatAmount = grams(
    (remainingProtein - (starchAmount * s.protein) / 100) / (m.protein / 100),
    130,
    meat === "extra-lean-beef" ? 210 : 320,
  );
  return {
    [meat]: meatAmount,
    [starch]: starchAmount,
    "mixed-veg": 200,
    "olive-oil": oil,
  };
}
export function calibratedIngredients(
  recipe: PrepRecipe,
  budget: NutritionBudget,
): Ingredient[] {
  const amounts =
    recipe.kind === "breakfast"
      ? breakfast(budget)
      : recipe.kind === "snack"
        ? snack(budget)
        : main(recipe, budget);
  return recipe.ingredients.flatMap((base) => {
    if (base.optional) return [{ ...base }];
    if (!(base.id in amounts))
      throw new Error("Calibrated recipe has an unsupported ingredient.");
    const amount = (amounts as Record<string, number>)[base.id];
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
