import {
  prepNutritionEstimates,
  prepRecipeMap,
  type Ingredient,
  type PrepRecipe,
} from "./recipes.ts";
import { calibratedIngredients } from "../nutrition/portions.ts";
import type { NutritionBudget } from "../nutrition/model.ts";

export type { Ingredient, PrepRecipe } from "./recipes.ts";
export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";
export type PrepContext = {
  training: boolean;
  weightKg: number | null;
  nutrition?: NutritionBudget;
};
export type BlockChoice = {
  mainId?: string;
  breakfastId?: string;
  snackId?: string;
  preparedAt?: string;
  preparedSignature?: string;
  contexts?: Record<string, PrepContext>;
  conflictingPreparation?: Omit<BlockChoice, "conflictingPreparation">;
};
export type MealPrepState = {
  version: 1;
  startedOn: string;
  schedules: Record<string, { days: 2 | 3 }>;
  blocks: Record<string, BlockChoice>;
  checked: Record<string, boolean>;
};
export type PrepBlock = BlockChoice & {
  start: string;
  end: string;
  days: 2 | 3;
  index: number;
  key: string;
  mainId: string;
  breakfastId: string;
  snackId: string;
};
export type PrepServing = {
  recipe: PrepRecipe;
  ingredients: Ingredient[];
  plate: string[];
  calories: number;
  protein: number;
  note: string;
};
export type PrepBatch = {
  block: PrepBlock;
  servings: Array<{ date: string; slot: MealSlot; serving: PrepServing }>;
  ingredients: Ingredient[];
  signature: string;
  mainServings: number;
};

const mainRotation = [
  "prep-chicken-breast-rice",
  "prep-chicken-thigh-potato",
  "prep-chicken-breast-potato",
  "prep-beef-rice",
];
const slots: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const categories: Ingredient["category"][] = [
  "Protein & dairy",
  "Produce",
  "Carbs",
  "Pantry",
];
const units: Ingredient["unit"][] = ["g", "ml", "item"];
const bases: Ingredient["basis"][] = ["raw", "dry", "ready"];
const safeKey = (key: string) =>
  Boolean(key) && !["__proto__", "constructor", "prototype"].includes(key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const round = (value: number) => Math.round(value * 100) / 100;
const compare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export function isPrepDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && dateString(parsed) === value;
}
function assertDate(value: string) {
  if (!isPrepDate(value))
    throw new RangeError("Use a valid local calendar date (YYYY-MM-DD).");
}
function dateString(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addPrepDays(date: string, count: number): string {
  assertDate(date);
  if (!Number.isSafeInteger(count))
    throw new RangeError("Calendar days must be an integer.");
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + count);
  const result = dateString(next);
  assertDate(result);
  return result;
}
function distance(from: string, to: string) {
  // The UTC ordinal is only a difference of calendar labels. Local operations
  // above stay at noon, so a 23/25-hour DST day never loses or duplicates a date.
  return (
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
    86_400_000
  );
}
function context(value: unknown): PrepContext {
  const v = record(value) ? value : {};
  return {
    training: v.training === true,
    ...(validBudget(v.nutrition) ? { nutrition: { ...v.nutrition } } : {}),
    weightKg:
      typeof v.weightKg === "number" &&
      Number.isFinite(v.weightKg) &&
      v.weightKg > 0
        ? v.weightKg
        : null,
  };
}
function validBudget(v: unknown): v is NutritionBudget {
  return (
    record(v) &&
    v.version === 1 &&
    typeof v.calories === "number" &&
    Number.isFinite(v.calories) &&
    v.calories >= 1500 &&
    v.calories <= 3800 &&
    typeof v.protein === "number" &&
    Number.isFinite(v.protein) &&
    v.protein >= 75 &&
    v.protein <= 220
  );
}
function validChoice(id: unknown, kind: PrepRecipe["kind"]): id is string {
  return (
    typeof id === "string" &&
    Object.hasOwn(prepRecipeMap, id) &&
    prepRecipeMap[id].kind === kind
  );
}
function validPreparedAt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    isPrepDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
function validContext(value: unknown): value is PrepContext {
  return (
    record(value) &&
    typeof value.training === "boolean" &&
    (value.nutrition === undefined || validBudget(value.nutrition)) &&
    (value.weightKg === null ||
      (typeof value.weightKg === "number" &&
        Number.isFinite(value.weightKg) &&
        value.weightKg > 0))
  );
}
function normalizeBlockChoice(
  saved: Record<string, unknown>,
  date: string,
): Omit<BlockChoice, "conflictingPreparation"> {
  const choice: Omit<BlockChoice, "conflictingPreparation"> = {};
  let badChoice = false;
  for (const kind of ["main", "breakfast", "snack"] as const) {
    const key = `${kind}Id` as const;
    if (validChoice(saved[key], kind)) choice[key] = saved[key];
    else if (saved[key] !== undefined) badChoice = true;
  }
  if (!badChoice) {
    if (validPreparedAt(saved.preparedAt)) choice.preparedAt = saved.preparedAt;
    if (
      typeof saved.preparedSignature === "string" &&
      saved.preparedSignature.trim()
    )
      choice.preparedSignature = saved.preparedSignature;
    if (record(saved.contexts)) {
      choice.contexts = {};
      for (const [day, snapshot] of Object.entries(saved.contexts))
        if (
          isPrepDate(day) &&
          day >= date &&
          record(snapshot) &&
          typeof snapshot.training === "boolean"
        )
          choice.contexts[day] = context(snapshot);
    }
  }
  return choice;
}

export function createMealPrep(startedOn: string): MealPrepState {
  assertDate(startedOn);
  return {
    version: 1,
    startedOn,
    schedules: { [startedOn]: { days: 2 } },
    blocks: {},
    checked: {},
  };
}

export function normalizeMealPrep(
  value: unknown,
  fallbackDate: string,
): MealPrepState {
  assertDate(fallbackDate);
  if (!record(value) || value.version !== 1)
    return createMealPrep(fallbackDate);
  const state = createMealPrep(
    isPrepDate(value.startedOn) ? value.startedOn : fallbackDate,
  );
  if (record(value.schedules))
    for (const [date, schedule] of Object.entries(value.schedules)) {
      if (
        isPrepDate(date) &&
        date >= state.startedOn &&
        record(schedule) &&
        (schedule.days === 2 || schedule.days === 3)
      )
        state.schedules[date] = { days: schedule.days };
    }
  if (record(value.blocks))
    for (const [date, saved] of Object.entries(value.blocks)) {
      if (!isPrepDate(date) || date < state.startedOn || !record(saved))
        continue;
      const choice: BlockChoice = normalizeBlockChoice(saved, date);
      const conflict = saved.conflictingPreparation;
      if (
        record(conflict) &&
        validPreparedAt(conflict.preparedAt) &&
        typeof conflict.preparedSignature === "string" &&
        conflict.preparedSignature.trim() &&
        ["main", "breakfast", "snack"].every(
          (kind) =>
            conflict[`${kind}Id`] === undefined ||
            validChoice(conflict[`${kind}Id`], kind as PrepRecipe["kind"]),
        ) &&
        record(conflict.contexts) &&
        Object.keys(conflict.contexts).length > 0 &&
        Object.entries(conflict.contexts).every(
          ([day, snapshot]) =>
            isPrepDate(day) && day >= date && validContext(snapshot),
        )
      ) {
        // Only this one record is copied; nested conflict payloads are never traversed.
        choice.conflictingPreparation = normalizeBlockChoice(conflict, date);
      }
      state.blocks[date] = choice;
    }
  if (record(value.checked))
    for (const [key, checked] of Object.entries(value.checked))
      if (safeKey(key) && typeof checked === "boolean")
        state.checked[key] = checked;
  return state;
}

export function prepBlockFor(state: MealPrepState, date: string): PrepBlock {
  assertDate(date);
  const normalized = normalizeMealPrep(state, state.startedOn);
  if (date < normalized.startedOn)
    throw new RangeError("Meal prep does not replace dates before its start.");
  const schedules = Object.entries(normalized.schedules).sort(([a], [b]) =>
    compare(a, b),
  );
  let index = 0;
  for (let segment = 0; segment < schedules.length; segment++) {
    const [anchor, { days }] = schedules[segment];
    const next = schedules[segment + 1]?.[0];
    if (next && date >= next) {
      index += Math.ceil(distance(anchor, next) / days);
      continue;
    }
    const offset = Math.floor(distance(anchor, date) / days);
    const start = addPrepDays(anchor, offset * days);
    const naturalEnd = addPrepDays(start, days - 1);
    const end = next && next <= naturalEnd ? addPrepDays(next, -1) : naturalEnd;
    const choice = normalized.blocks[start] ?? {};
    return {
      ...choice,
      start,
      end,
      days,
      index: index + offset,
      key: start,
      mainId:
        choice.mainId ?? mainRotation[(index + offset) % mainRotation.length],
      breakfastId: choice.breakfastId ?? "prep-overnight-oats",
      snackId: choice.snackId ?? "prep-yogurt-banana-toast",
    };
  }
  throw new RangeError("Meal prep has no schedule for this date.");
}

export function recipeForPrepSlot(
  block: PrepBlock,
  slot: MealSlot,
): PrepRecipe {
  if (!slots.includes(slot)) throw new RangeError("Unknown meal slot.");
  const kind = slot === "lunch" || slot === "dinner" ? "main" : slot;
  const id = block[`${kind}Id`];
  if (!validChoice(id, kind)) throw new RangeError(`Invalid ${kind} recipe.`);
  return prepRecipeMap[id];
}

function assertIngredient(item: Ingredient) {
  if (
    !item ||
    !safeKey(item.id) ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    !categories.includes(item.category) ||
    !units.includes(item.unit) ||
    !bases.includes(item.basis) ||
    !Number.isFinite(item.amount) ||
    item.amount < 0 ||
    (item.optional !== undefined && typeof item.optional !== "boolean") ||
    (item.cookedAmount !== undefined &&
      (!Number.isFinite(item.cookedAmount) || item.cookedAmount < 0))
  )
    throw new RangeError("Invalid structured ingredient.");
}

export function prepServing(
  recipe: PrepRecipe,
  input: PrepContext,
): PrepServing {
  const c = context(input);
  const ingredients = c.nutrition
    ? calibratedIngredients(recipe, c.nutrition)
    : recipe.ingredients.flatMap((base) => {
        assertIngredient(base);
        const item = { ...base };
        if (recipe.kind === "main") {
          if (
            ["chicken-breast", "chicken-thigh", "extra-lean-beef"].includes(
              item.id,
            )
          ) {
            const baseCooked = item.id === "extra-lean-beef" ? 120 : 150;
            const maximum = item.id === "extra-lean-beef" ? 160 : 200;
            const cooked = Math.max(
              120,
              Math.min(
                maximum,
                Math.round(
                  (c.weightKg === null
                    ? baseCooked
                    : baseCooked * (c.weightKg / 80)) / 5,
                ) * 5,
              ),
            );
            item.amount = round(cooked / 0.75);
            item.cookedAmount = cooked;
          } else if (item.id === "rice") {
            item.amount = base.amount + (c.training ? 5 : 0);
            item.cookedAmount = item.amount * 3;
          } else if (item.id === "potatoes")
            item.amount = base.amount + (c.training ? 25 : 0);
        }
        if (recipe.kind === "snack" && item.id === "toast" && !c.training)
          return [];
        return item.amount > 0 ? [item] : [];
      });
  let calories = 0,
    protein = 0;
  for (const item of ingredients) {
    const estimate = prepNutritionEstimates[item.id];
    if (!estimate)
      throw new RangeError(`No food-label estimate for ingredient ${item.id}.`);
    if (!item.optional) {
      calories += (item.amount / estimate.per) * estimate.calories;
      protein += (item.amount / estimate.per) * estimate.protein;
    }
  }
  const plate = ingredients
    .filter((item) => !item.optional)
    .map((item) => {
      if (item.id === "rice") return `${item.cookedAmount} g cooked rice`;
      if (item.cookedAmount !== undefined) {
        const name =
          item.id === "chicken-breast"
            ? "chicken breast"
            : item.id === "chicken-thigh"
              ? "skinless chicken thigh"
              : "extra-lean beef";
        return `${item.cookedAmount} g cooked ${name} (weigh actual yield)`;
      }
      if (item.id === "potatoes")
        return `Potatoes: ${item.amount} g before cooking`;
      if (item.id === "mixed-veg")
        return `Vegetables: ${item.amount} g before cooking`;
      if (item.id === "olive-oil") return `${item.amount} g measured olive oil`;
      if (item.id === "toast")
        return `${item.amount} slice whole-grain toast, made on the day`;
      if (item.id === "oats") return `${item.amount} g dry oats`;
      if (item.unit === "item")
        return `${item.amount} ${item.name.toLowerCase()}`;
      return `${item.amount} ${item.unit} ${item.name.toLowerCase()}`;
    });
  return {
    recipe,
    ingredients,
    plate,
    calories: Math.round(calories / 10) * 10,
    protein: Math.round(protein),
    note:
      "Approximate food-label nutrition, not a daily calorie prescription. Optional ingredients are excluded from estimates." +
      (recipe.kind === "main"
        ? " Meat assumes 75% cooked yield and rice 3x dry weight from water; weigh actual cooked output and divide it in proportion to the dated ingredient amounts, not the estimates." +
          (c.nutrition
            ? " Meat and starch are portioned together for the day's energy and protein target."
            : " Protein portions are bounded, with a small training-day starch addition.")
        : "") +
      (recipe.kind === "snack"
        ? c.nutrition
          ? " Use the dated bread quantity, if listed; keep it dry and toast on the day."
          : " Bread is included only on training days; keep it dry and toast on the day."
        : "") +
      (c.nutrition
        ? " Portions follow your estimated daily calorie and protein target. Check the full-day totals; practical serving limits and food labels mean these are estimates, not exact intake."
        : " No missed-session compensation or automatic calorie deficit."),
  };
}

function shoppingIdentity(item: Ingredient) {
  return JSON.stringify([
    item.id,
    item.unit,
    item.basis,
    item.optional === true,
  ]);
}
function aggregate(ingredients: Ingredient[]): Ingredient[] {
  const totals = new Map<string, Ingredient>();
  for (const item of ingredients) {
    assertIngredient(item);
    if (!item.amount) continue;
    const key = shoppingIdentity(item);
    const previous = totals.get(key);
    if (previous && previous.category !== item.category)
      throw new RangeError("An ingredient ID must use one category.");
    totals.set(
      key,
      previous
        ? {
            ...previous,
            amount: round(previous.amount + item.amount),
            cookedAmount:
              previous.cookedAmount !== undefined &&
              item.cookedAmount !== undefined
                ? round(previous.cookedAmount + item.cookedAmount)
                : undefined,
          }
        : { ...item, amount: round(item.amount) },
    );
  }
  return [...totals.values()].sort(
    (a, b) =>
      categories.indexOf(a.category) - categories.indexOf(b.category) ||
      compare(shoppingIdentity(a), shoppingIdentity(b)),
  );
}

export function prepBatch(
  state: MealPrepState,
  date: string,
  contextForDate: (date: string) => PrepContext,
): PrepBatch {
  const block = prepBlockFor(state, date);
  const servings: PrepBatch["servings"] = [];
  for (let day = block.start; day <= block.end; day = addPrepDays(day, 1)) {
    const c = block.contexts?.[day] ?? contextForDate(day);
    for (const slot of slots)
      servings.push({
        date: day,
        slot,
        serving: prepServing(recipeForPrepSlot(block, slot), c),
      });
  }
  const ingredients = aggregate(
    servings.flatMap(({ serving }) => serving.ingredients),
  );
  // Store the canonical content, not a lossy hash: preparation metadata and
  // grocery checks cannot make an unchanged physical batch look different.
  const signature = JSON.stringify({
    version: 1,
    start: block.start,
    end: block.end,
    days: block.days,
    servings: servings.map(({ date: day, slot, serving }) => ({
      date: day,
      slot,
      recipeId: serving.recipe.id,
      ingredients: serving.ingredients.map((item) => [
        item.id,
        item.amount,
        item.unit,
        item.basis,
        item.optional === true,
        item.cookedAmount ?? null,
      ]),
      calories: serving.calories,
      protein: serving.protein,
    })),
  });
  return {
    block,
    servings,
    ingredients,
    signature,
    mainServings: servings.filter(
      ({ slot }) => slot === "lunch" || slot === "dinner",
    ).length,
  };
}

export function preparedBatchFor(
  state: MealPrepState,
  date: string,
  contextForDate: (date: string) => PrepContext,
): PrepBatch | null {
  const block = prepBlockFor(state, date);
  const choice = state.blocks[block.start];
  if (
    !choice ||
    !validPreparedAt(choice.preparedAt) ||
    !choice.preparedSignature ||
    !record(choice.contexts)
  )
    return null;
  try {
    const metadata: unknown = JSON.parse(choice.preparedSignature);
    if (!record(metadata)) return null;
    const { start, end, days } = metadata;
    if (
      !isPrepDate(start) ||
      start !== block.start ||
      !isPrepDate(end) ||
      (days !== 2 && days !== 3) ||
      end < start ||
      end > addPrepDays(start, days - 1)
    )
      return null;
    for (let day = start; day <= end; day = addPrepDays(day, 1))
      if (
        !Object.hasOwn(choice.contexts, day) ||
        !validContext(choice.contexts[day])
      )
        return null;
    // Restore only bounded calendar metadata, never food from the signature.
    // The current recipes and saved contexts must reproduce every signed serving.
    const schedules = Object.fromEntries(
      Object.entries(state.schedules).filter(
        ([anchor]) => anchor <= start || anchor > end,
      ),
    );
    schedules[start] = { days };
    const physical = prepBatch({ ...state, schedules }, start, contextForDate);
    return physical.signature === choice.preparedSignature ? physical : null;
  } catch {
    return null;
  }
}

export function prepShopping(batches: readonly PrepBatch[]): Ingredient[] {
  const seen = new Map<string, string>();
  const ingredients: Ingredient[] = [];
  const dates = new Set<string>();
  for (const batch of batches) {
    const previous = seen.get(batch.block.key);
    if (previous !== undefined) {
      if (previous !== batch.signature)
        throw new RangeError("Conflicting versions of the same prep block.");
      continue;
    }
    seen.set(batch.block.key, batch.signature);
    for (const serving of batch.servings) {
      const key = `${serving.date}:${serving.slot}`;
      if (dates.has(key))
        throw new RangeError("Prep batches contain overlapping meal slots.");
      dates.add(key);
    }
    ingredients.push(...batch.ingredients);
  }
  return aggregate(ingredients);
}

export function prepShoppingKey(ingredient: Ingredient): string {
  assertIngredient(ingredient);
  return JSON.stringify([
    ingredient.id,
    ingredient.unit,
    ingredient.basis,
    ingredient.optional === true,
    ingredient.amount,
    ingredient.cookedAmount ?? null,
  ]);
}

function withoutPrepared(choice: BlockChoice): BlockChoice {
  const {
    preparedAt: _at,
    preparedSignature: _signature,
    contexts: _contexts,
    conflictingPreparation: _conflict,
    ...rest
  } = choice;
  return rest;
}
export function resetPrepPrepared(
  state: MealPrepState,
  date: string,
): MealPrepState {
  const block = prepBlockFor(state, date);
  return {
    ...state,
    blocks: {
      ...state.blocks,
      [block.key]: withoutPrepared(state.blocks[block.key] ?? {}),
    },
  };
}
export function setPrepChoice(
  state: MealPrepState,
  date: string,
  kind: PrepRecipe["kind"],
  id: string,
): MealPrepState {
  if (!["main", "breakfast", "snack"].includes(kind) || !validChoice(id, kind))
    throw new RangeError("Choose an existing recipe of the matching kind.");
  const block = prepBlockFor(state, date);
  const key = `${kind}Id` as const;
  if (block[key] === id) return state;
  return {
    ...state,
    blocks: {
      ...state.blocks,
      [block.key]: {
        ...withoutPrepared(state.blocks[block.key] ?? {}),
        [key]: id,
      },
    },
  };
}
export function startPrepSchedule(
  state: MealPrepState,
  date: string,
  days: 2 | 3,
): MealPrepState {
  assertDate(date);
  if (date < state.startedOn || (days !== 2 && days !== 3))
    throw new RangeError("Choose 2 or 3 days on or after the meal-prep start.");
  if (state.schedules[date]?.days === days) return state;
  return { ...state, schedules: { ...state.schedules, [date]: { days } } };
}
