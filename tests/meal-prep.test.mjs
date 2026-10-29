import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  addPrepDays,
  createMealPrep,
  isPrepDate,
  normalizeMealPrep,
  prepBatch,
  preparedBatchFor,
  prepBlockFor,
  prepServing,
  prepShopping,
  prepShoppingWindow,
  prepShoppingKey,
  recipeForPrepSlot,
  resetPrepPrepared,
  setPrepChoice,
  startPrepSchedule,
} from "../src/features/mealPrep/plan.ts";
import {
  prepNutritionEstimates,
  prepRecipeMap,
  prepRecipes,
} from "../src/features/mealPrep/recipes.ts";

const start = "2026-10-26";
const rest = { training: false, weightKg: null };
const training = { training: true, weightKg: null };
const base = () => createMealPrep(start);
const item = (items, id) => items.find((i) => i.id === id);
const dayServings = (batch, date = batch.block.start) =>
  batch.servings.filter((s) => s.date === date);
const dailyCalories = (batch) =>
  dayServings(batch).reduce((sum, s) => sum + s.serving.calories, 0);
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function cooked(state, date, contextForDate) {
  const batch = prepBatch(state, date, contextForDate);
  const contexts = Object.fromEntries(
    batch.servings.map((s) => [s.date, contextForDate(s.date)]),
  );
  return {
    ...state,
    blocks: {
      ...state.blocks,
      [batch.block.key]: {
        ...state.blocks[batch.block.key],
        contexts,
        preparedAt: "2026-10-26T19:00:00Z",
        preparedSignature: batch.signature,
      },
    },
  };
}
const synthetic = (key, ingredients) => ({
  block: { key },
  ingredients,
  servings: [],
  signature: key,
});

test("catalog contains structured one-serving recipes with stable prep-prefixed IDs", () => {
  assert.equal(new Set(prepRecipes.map((r) => r.id)).size, prepRecipes.length);
  assert.equal(prepRecipes.filter((r) => r.kind === "main").length, 5);
  assert.ok(prepRecipes.some((r) => r.kind === "breakfast"));
  assert.ok(prepRecipes.some((r) => r.kind === "snack"));
  for (const r of prepRecipes) {
    assert.match(r.id, /^prep-/);
    assert.equal(prepRecipeMap[r.id], r);
    assert.ok(r.title && r.shortTitle && r.description && r.storage);
    assert.ok(r.minutes > 0 && Number.isFinite(r.minutes));
    assert.match(r.photo, /^https:\/\/images\.unsplash\.com\//);
    assert.ok(r.steps.length >= 3);
    assert.ok(r.ingredients.length >= 3);
    for (const i of r.ingredients) {
      assert.ok(i.id && i.name && i.amount > 0);
      assert.ok(["g", "ml", "item"].includes(i.unit));
      assert.ok(["raw", "dry", "ready"].includes(i.basis));
      assert.ok(prepNutritionEstimates[i.id]);
    }
  }
});

test("factories are deterministic and do not share nested state", () => {
  const a = base(),
    b = base();
  assert.deepEqual(a, {
    version: 1,
    startedOn: start,
    schedules: { [start]: { days: 2 } },
    blocks: {},
    checked: {},
  });
  a.schedules[start].days = 3;
  a.blocks[start] = { mainId: "prep-beef-potato" };
  a.checked.example = true;
  assert.deepEqual(b, base());
});

test("calendar validation rejects overflow dates and non-ISO labels", () => {
  for (const date of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-10-00",
    "2026-1-01",
    "2026-10-26T12:00:00Z",
    "",
    null,
    20261026,
  ])
    assert.equal(isPrepDate(date), false, String(date));
  for (const date of [
    start,
    "2024-02-29",
    "2000-02-29",
    "1900-02-28",
    "2026-12-31",
  ])
    assert.ok(isPrepDate(date));
  assert.throws(() => createMealPrep("2026-02-29"), RangeError);
  assert.throws(() => normalizeMealPrep(null, "bad"), RangeError);
  assert.throws(() => addPrepDays(start, 1.5), RangeError);
  assert.throws(() => addPrepDays("bad", 1), RangeError);
});

test("calendar addition crosses months, years and leap days without elapsed-hour arithmetic", () => {
  assert.equal(addPrepDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addPrepDays("2024-02-28", 2), "2024-03-01");
  assert.equal(addPrepDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addPrepDays("2027-01-01", -1), "2026-12-31");
  assert.equal(addPrepDays(start, 0), start);
});

test("local-noon blocks and signatures remain deterministic across DST time zones", () => {
  const script = `
    import {addPrepDays,createMealPrep,prepBatch} from ${JSON.stringify(new URL("../src/features/mealPrep/plan.ts", import.meta.url).href)};
    const dates = ["2026-03-07", "2026-10-31", "2026-04-04", "2026-10-03"];
    const output = dates.map(date => {
      const batch = prepBatch(createMealPrep(date), date, () => ({training:false,weightKg:null}));
      return [addPrepDays(date,1), addPrepDays(date,2), batch.signature];
    });
    process.stdout.write(JSON.stringify(output));
  `;
  const outputs = [
    "UTC",
    "America/Vancouver",
    "America/New_York",
    "Australia/Lord_Howe",
  ].map((TZ) =>
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { env: { ...process.env, TZ }, encoding: "utf8" },
    ),
  );
  outputs.forEach((output) => assert.equal(output, outputs[0]));
  const data = JSON.parse(outputs[0]);
  assert.deepEqual(data[0].slice(0, 2), ["2026-03-08", "2026-03-09"]);
  assert.deepEqual(data[1].slice(0, 2), ["2026-11-01", "2026-11-02"]);
});

test("default two-day batches repeat the same main for four lunches and dinners", () => {
  const batch = prepBatch(base(), start, () => rest);
  assert.deepEqual(
    [
      batch.block.start,
      batch.block.end,
      batch.block.days,
      batch.block.index,
      batch.block.key,
    ],
    [start, "2026-10-27", 2, 0, start],
  );
  assert.equal(batch.servings.length, 8);
  assert.equal(batch.mainServings, 4);
  assert.deepEqual(
    batch.servings.map((s) => `${s.date}:${s.slot}`),
    [
      `${start}:breakfast`,
      `${start}:lunch`,
      `${start}:snack`,
      `${start}:dinner`,
      "2026-10-27:breakfast",
      "2026-10-27:lunch",
      "2026-10-27:snack",
      "2026-10-27:dinner",
    ],
  );
  assert.equal(
    recipeForPrepSlot(batch.block, "lunch"),
    recipeForPrepSlot(batch.block, "dinner"),
  );
  assert.deepEqual(
    prepBatch(base(), "2026-10-27", () => rest),
    batch,
  );
});

test("three-day batches contain six main portions and twelve unique dated servings", () => {
  const state = startPrepSchedule(base(), start, 3);
  const batch = prepBatch(state, "2026-10-28", () => rest);
  assert.equal(batch.block.end, "2026-10-28");
  assert.equal(batch.block.days, 3);
  assert.equal(batch.mainServings, 6);
  assert.equal(batch.servings.length, 12);
  assert.equal(
    new Set(batch.servings.map((s) => `${s.date}:${s.slot}`)).size,
    12,
  );
  assert.equal(prepBlockFor(state, "2026-10-29").index, 1);
});

test("main rotation is chicken, thighs, chicken, beef, repeating every eight default days", () => {
  const state = base();
  const ids = Array.from(
    { length: 8 },
    (_, index) => prepBlockFor(state, addPrepDays(start, index * 2)).mainId,
  );
  assert.deepEqual(ids.slice(0, 4), [
    "prep-chicken-breast-rice",
    "prep-chicken-thigh-potato",
    "prep-chicken-breast-potato",
    "prep-beef-rice",
  ]);
  assert.deepEqual(ids.slice(4), ids.slice(0, 4));
  assert.equal(ids.filter((id) => id.startsWith("prep-beef")).length, 2);
  assert.equal(
    prepBlockFor(startPrepSchedule(state, start, 3), "2026-11-04").mainId,
    "prep-beef-rice",
  );
  assert.ok(!ids.includes("prep-beef-potato"));
});

test("dates before activation fail instead of replacing legacy meals", () => {
  assert.throws(() => prepBlockFor(base(), "2026-10-25"), /before its start/);
  assert.throws(() => prepBatch(base(), "2026-10-25", () => rest), RangeError);
  assert.throws(() => prepBlockFor(base(), "2026-02-30"), RangeError);
});

test("new schedule one day into a batch clips the preceding end, not its cadence type", () => {
  const original = freeze(base());
  const state = startPrepSchedule(original, "2026-10-27", 3);
  assert.deepEqual(original, base());
  assert.deepEqual(state.schedules, {
    [start]: { days: 2 },
    "2026-10-27": { days: 3 },
  });
  const before = prepBatch(state, start, () => rest);
  assert.equal(before.block.end, start);
  assert.equal(before.block.days, 2);
  assert.equal(before.mainServings, 2);
  assert.equal(before.servings.length, 4);
  const after = prepBatch(state, "2026-10-27", () => rest);
  assert.deepEqual(
    [after.block.start, after.block.end, after.block.index, after.mainServings],
    ["2026-10-27", "2026-10-29", 1, 6],
  );
  const shopping = prepShopping([before, after]);
  assert.equal(item(shopping, "chicken-breast").amount, 400);
  assert.equal(item(shopping, "chicken-thigh").amount, 1200);
});

test("multiple schedule boundaries retain old anchors and never duplicate a date/slot", () => {
  let state = startPrepSchedule(base(), "2026-10-27", 3);
  state = startPrepSchedule(state, "2026-11-01", 2);
  const dates = Array.from({ length: 12 }, (_, i) => addPrepDays(start, i));
  const batches = [
    ...new Map(
      dates.map((date) => {
        const batch = prepBatch(state, date, () => rest);
        return [batch.block.key, batch];
      }),
    ).values(),
  ];
  const servings = batches.flatMap((b) =>
    b.servings.map((s) => `${s.date}:${s.slot}`),
  );
  assert.equal(new Set(servings).size, servings.length);
  assert.equal(prepBlockFor(state, "2026-10-31").end, "2026-10-31");
  assert.equal(prepBlockFor(state, "2026-11-01").index, 3);
  assert.equal(Object.keys(state.schedules).length, 3);
  assert.doesNotThrow(() => prepShopping(batches));
});

test("editing an existing schedule anchor rebases there without creating an earlier anchor", () => {
  const a = startPrepSchedule(base(), "2026-10-28", 3);
  const b = startPrepSchedule(a, "2026-10-28", 2);
  assert.deepEqual(Object.keys(b.schedules).sort(), [start, "2026-10-28"]);
  assert.equal(prepBlockFor(b, "2026-10-29").start, "2026-10-28");
  assert.equal(startPrepSchedule(b, "2026-10-28", 2), b);
  assert.throws(() => startPrepSchedule(b, "2026-10-25", 3), RangeError);
  for (const days of [0, 1, 4, 2.5, "3", NaN])
    assert.throws(() => startPrepSchedule(b, start, days), RangeError);
});

test("normalization supplies backward-compatible defaults and validates unknown versions", () => {
  for (const input of [
    null,
    undefined,
    [],
    false,
    4,
    {},
    { version: 2 },
    new Date(),
  ])
    assert.deepEqual(normalizeMealPrep(input, start), base());
  assert.deepEqual(
    normalizeMealPrep({ version: 1, startedOn: "invalid" }, start),
    base(),
  );
  const normalized = normalizeMealPrep(
    { version: 1, startedOn: start, schedules: { "2026-10-28": { days: 3 } } },
    start,
  );
  assert.deepEqual(normalized.schedules, {
    [start]: { days: 2 },
    "2026-10-28": { days: 3 },
  });
});

test("normalization rejects bad dates, recipe kinds, truthy checkmarks and unsafe keys", () => {
  const input = JSON.parse(
    JSON.stringify({
      version: 1,
      startedOn: start,
      schedules: {
        "2026-10-25": { days: 3 },
        "2026-10-27": { days: "3" },
        "2026-02-30": { days: 2 },
        "2026-10-28": { days: 3 },
      },
      blocks: {
        [start]: {
          mainId: "prep-overnight-oats",
          breakfastId: "prep-warm-oats",
          snackId: "missing",
          preparedAt: "2026-10-26T20:00:00Z",
          preparedSignature: "old",
          contexts: { [start]: rest },
        },
        "2026-10-25": { mainId: "prep-beef-rice" },
        bad: { mainId: "prep-beef-rice" },
      },
      checked: { good: true, unchecked: false, bad: "true", invalid: 1 },
    }),
  );
  Object.defineProperty(input.checked, "__proto__", {
    value: true,
    enumerable: true,
  });
  input.checked.constructor = true;
  const copy = JSON.stringify(input);
  const state = normalizeMealPrep(freeze(input), start);
  assert.deepEqual(state.schedules, {
    [start]: { days: 2 },
    "2026-10-28": { days: 3 },
  });
  assert.deepEqual(state.blocks, {
    [start]: { breakfastId: "prep-warm-oats" },
  });
  assert.deepEqual(state.checked, { good: true, unchecked: false });
  assert.equal(JSON.stringify(input), copy);
  assert.equal({}.polluted, undefined);
});

test("normalization round-trips choices, preparation and valid saved contexts without sharing objects", () => {
  const state = cooked(
    setPrepChoice(base(), start, "main", "prep-beef-potato"),
    start,
    () => training,
  );
  state.checked.example = false;
  const restored = normalizeMealPrep(JSON.parse(JSON.stringify(state)), start);
  assert.deepEqual(restored, state);
  assert.notEqual(
    restored.blocks[start].contexts,
    state.blocks[start].contexts,
  );
  const malformed = {
    ...state,
    blocks: {
      [start]: {
        contexts: {
          [start]: { training: false, weightKg: -3 },
          bad: rest,
          "2026-10-25": rest,
          "2026-10-27": { training: "true", weightKg: 80 },
        },
      },
    },
  };
  assert.deepEqual(normalizeMealPrep(malformed, start).blocks[start].contexts, {
    [start]: rest,
  });
});

test("each choice validates its recipe kind and only changes the requested block", () => {
  let state = freeze(base());
  state = setPrepChoice(state, start, "main", "prep-beef-potato");
  state = setPrepChoice(state, start, "breakfast", "prep-warm-oats");
  const block = prepBlockFor(state, "2026-10-27");
  assert.equal(recipeForPrepSlot(block, "lunch").id, "prep-beef-potato");
  assert.equal(recipeForPrepSlot(block, "dinner").id, "prep-beef-potato");
  assert.equal(recipeForPrepSlot(block, "breakfast").id, "prep-warm-oats");
  assert.equal(
    recipeForPrepSlot(block, "snack").id,
    "prep-yogurt-banana-toast",
  );
  assert.equal(
    prepBlockFor(state, "2026-10-28").mainId,
    "prep-chicken-thigh-potato",
  );
  for (const [kind, id] of [
    ["main", "missing"],
    ["main", "prep-warm-oats"],
    ["snack", "prep-beef-rice"],
    ["other", "prep-beef-rice"],
    ["main", "constructor"],
  ])
    assert.throws(() => setPrepChoice(state, start, kind, id), RangeError);
  assert.throws(() => recipeForPrepSlot(block, "brunch"), RangeError);
  assert.throws(
    () => recipeForPrepSlot({ ...block, mainId: "missing" }, "lunch"),
    RangeError,
  );
});

test("same effective recipe is a no-op; changing it clears preparation and frozen contexts", () => {
  const state = freeze(cooked(base(), start, () => rest));
  assert.equal(
    setPrepChoice(state, start, "main", "prep-chicken-breast-rice"),
    state,
  );
  const changed = setPrepChoice(
    state,
    "2026-10-27",
    "main",
    "prep-beef-potato",
  );
  assert.deepEqual(changed.blocks[start], { mainId: "prep-beef-potato" });
  assert.ok(state.blocks[start].preparedAt);
  assert.ok(state.blocks[start].contexts);
  assert.equal(changed.checked, state.checked);
  assert.deepEqual(resetPrepPrepared(state, start).blocks[start], {});
});

test("breakfast supplies oats, yogurt and berries with no required whey", () => {
  for (const r of prepRecipes.filter((r) => r.kind === "breakfast")) {
    const serving = prepServing(r, rest);
    assert.deepEqual(
      serving.ingredients.map((i) => i.id),
      ["greek-yogurt", "oats", "berries"],
    );
    assert.ok(serving.calories >= 400);
    assert.ok(serving.protein >= 30);
    assert.ok(!serving.ingredients.some((i) => i.id.includes("whey")));
  }
});

test("training adds a little starch and day-of toast without removing rest-day food", () => {
  const rice = prepRecipeMap["prep-chicken-breast-rice"];
  const a = prepServing(rice, rest),
    b = prepServing(rice, training);
  assert.equal(
    item(b.ingredients, "rice").amount - item(a.ingredients, "rice").amount,
    5,
  );
  assert.equal(item(b.ingredients, "rice").cookedAmount, 195);
  assert.equal(
    item(b.ingredients, "chicken-breast").amount,
    item(a.ingredients, "chicken-breast").amount,
  );
  const potato = prepRecipeMap["prep-chicken-breast-potato"];
  assert.equal(
    item(prepServing(potato, training).ingredients, "potatoes").amount,
    325,
  );
  const snack = prepRecipeMap["prep-yogurt-banana-toast"];
  assert.deepEqual(
    prepServing(snack, rest).ingredients.map((i) => i.id),
    ["greek-yogurt", "banana"],
  );
  assert.equal(
    item(prepServing(snack, training).ingredients, "toast").amount,
    1,
  );
  assert.match(snack.steps.join(" "), /bread dry|bread.*package/);
  assert.match(
    snack.steps.join(" "),
    /Toast.*day|day.*Toast|toast.*before eating/,
  );
});

test("body-weight scaling is finite and bounded without a custom calorie deficit", () => {
  for (const id of [
    "prep-chicken-breast-rice",
    "prep-chicken-thigh-potato",
    "prep-beef-rice",
  ]) {
    const recipe = prepRecipeMap[id];
    const meatId = recipe.ingredients[0].id;
    let previous = 0;
    for (const weightKg of [1, 40, 60, 80, 100, 200, 1000]) {
      const s = prepServing(recipe, { training: false, weightKg });
      const meat = item(s.ingredients, meatId);
      assert.ok(meat.cookedAmount >= 120 && meat.cookedAmount <= 200);
      assert.ok(meat.cookedAmount >= previous);
      assert.ok(Math.abs(meat.amount * 0.75 - meat.cookedAmount) < 0.01);
      assert.equal(item(s.ingredients, "olive-oil").amount, 10);
      assert.equal(item(s.ingredients, "mixed-veg").amount, 200);
      assert.match(s.note, /No missed-session compensation/);
      previous = meat.cookedAmount;
    }
    for (const weightKg of [null, NaN, Infinity, -1, 0, "80"])
      assert.deepEqual(
        prepServing(recipe, { training: false, weightKg }),
        prepServing(recipe, rest),
      );
  }
});

test("all base daily totals include oil, breakfast and snack and do not collapse to 1200-1500 kcal", () => {
  for (let index = 0; index < 4; index++) {
    const date = addPrepDays(start, index * 2);
    const a = prepBatch(base(), date, () => rest),
      b = prepBatch(base(), date, () => training);
    assert.ok(
      dailyCalories(a) >= 1800 && dailyCalories(a) <= 2100,
      `${a.block.mainId}: ${dailyCalories(a)}`,
    );
    assert.ok(
      dailyCalories(b) >= 1950 && dailyCalories(b) <= 2250,
      `${b.block.mainId}: ${dailyCalories(b)}`,
    );
    assert.ok(dailyCalories(b) > dailyCalories(a));
    for (const s of a.servings.filter(
      (s) => s.slot === "lunch" || s.slot === "dinner",
    )) {
      const oil = item(s.serving.ingredients, "olive-oil");
      assert.equal(oil.amount, 10);
      assert.notEqual(oil.optional, true);
    }
  }
});

test("nutrition comes from declared ingredient assumptions and is deliberately rounded", () => {
  const s = prepServing(prepRecipeMap["prep-chicken-breast-rice"], rest);
  const required = s.ingredients.filter((i) => !i.optional);
  const kcal = required.reduce(
    (sum, i) =>
      sum +
      (i.amount / prepNutritionEstimates[i.id].per) *
        prepNutritionEstimates[i.id].calories,
    0,
  );
  const protein = required.reduce(
    (sum, i) =>
      sum +
      (i.amount / prepNutritionEstimates[i.id].per) *
        prepNutritionEstimates[i.id].protein,
    0,
  );
  assert.equal(s.calories, Math.round(kcal / 10) * 10);
  assert.equal(s.protein, Math.round(protein));
  assert.equal(s.calories % 10, 0);
  assert.match(s.note, /food-label/);
  assert.match(s.note, /Optional ingredients are excluded/);
  assert.equal(item(s.ingredients, "paprika").optional, true);
  assert.equal(
    s.calories,
    prepServing(
      {
        ...s.recipe,
        ingredients: s.recipe.ingredients.filter((i) => !i.optional),
      },
      rest,
    ).calories,
  );
});

test("plate labels stay concise; raw/dry shopping and estimated cooked yields stay separate", () => {
  const s = prepServing(prepRecipeMap["prep-chicken-breast-rice"], rest);
  assert.deepEqual(s.plate, [
    "150 g cooked chicken breast (weigh actual yield)",
    "180 g cooked rice",
    "Vegetables: 200 g before cooking",
    "10 g measured olive oil",
  ]);
  assert.ok(s.plate.every((line) => line.length < 80));
  assert.match(s.note, /75%/);
  assert.match(s.note, /3x/);
  assert.match(s.note, /weigh actual cooked output/);
  assert.equal(item(s.ingredients, "chicken-breast").basis, "raw");
  assert.equal(item(s.ingredients, "rice").basis, "dry");
});

test("batch totals sum each date's context exactly instead of multiplying one sample day", () => {
  const calls = [];
  const batch = prepBatch(base(), start, (date) => {
    calls.push(date);
    return date === start
      ? { training: true, weightKg: 80 }
      : { training: false, weightKg: 100 };
  });
  assert.deepEqual(calls, [start, "2026-10-27"]);
  assert.equal(item(batch.ingredients, "chicken-breast").amount, 906.66);
  assert.equal(item(batch.ingredients, "chicken-breast").cookedAmount, 680);
  assert.equal(item(batch.ingredients, "rice").amount, 250);
  assert.equal(item(batch.ingredients, "rice").cookedAmount, 750);
  assert.equal(item(batch.ingredients, "mixed-veg").amount, 800);
  assert.equal(item(batch.ingredients, "olive-oil").amount, 40);
  assert.equal(item(batch.ingredients, "greek-yogurt").amount, 900);
  assert.equal(item(batch.ingredients, "oats").amount, 120);
  assert.equal(item(batch.ingredients, "banana").amount, 2);
  assert.equal(item(batch.ingredients, "toast").amount, 1);
  assert.equal(item(batch.ingredients, "paprika").amount, 4);
});

test("three-day ingredient totals include only actually scheduled training-day toast", () => {
  const batch = prepBatch(
    startPrepSchedule(base(), start, 3),
    start,
    (date) => ({ training: date === "2026-10-27", weightKg: null }),
  );
  assert.equal(item(batch.ingredients, "chicken-breast").amount, 1200);
  assert.equal(item(batch.ingredients, "rice").amount, 370);
  assert.equal(item(batch.ingredients, "rice").cookedAmount, 1110);
  assert.equal(item(batch.ingredients, "olive-oil").amount, 60);
  assert.equal(item(batch.ingredients, "greek-yogurt").amount, 1350);
  assert.equal(item(batch.ingredients, "toast").amount, 1);
});

test("prepared context snapshots freeze amounts despite later weight or training-plan changes", () => {
  const initial = (date) =>
    date === start ? training : { training: false, weightKg: 90 };
  const expected = prepBatch(base(), start, initial);
  const state = freeze(cooked(base(), start, initial));
  const after = prepBatch(state, start, () => {
    throw new Error("Frozen dates must not read new context");
  });
  assert.deepEqual(after.servings, expected.servings);
  assert.deepEqual(after.ingredients, expected.ingredients);
  assert.equal(after.signature, expected.signature);
  assert.equal(after.signature, state.blocks[start].preparedSignature);
  const reset = resetPrepPrepared(state, start);
  assert.notEqual(
    prepBatch(reset, start, () => ({ training: true, weightKg: 150 }))
      .signature,
    expected.signature,
  );
});

test("partial snapshots take priority per date while missing dates still use current context", () => {
  const state = base();
  state.blocks[start] = { contexts: { [start]: training } };
  const calls = [];
  const batch = prepBatch(state, start, (date) => {
    calls.push(date);
    return rest;
  });
  assert.deepEqual(calls, ["2026-10-27"]);
  assert.equal(item(batch.ingredients, "toast").amount, 1);
});

test("prepared metadata and grocery checks are excluded from the planned-serving signature", () => {
  const state = base();
  const before = prepBatch(state, start, () => rest);
  state.blocks[start] = {
    preparedAt: "2026-10-26T20:00:00Z",
    preparedSignature: "different metadata",
  };
  state.checked.example = true;
  const after = prepBatch(state, start, () => rest);
  assert.equal(after.signature, before.signature);
  assert.notEqual(
    prepBatch(state, start, () => training).signature,
    before.signature,
  );
  assert.notEqual(
    prepBatch(
      setPrepChoice(state, start, "main", "prep-beef-potato"),
      start,
      () => rest,
    ).signature,
    before.signature,
  );
  assert.notEqual(
    prepBatch(startPrepSchedule(state, start, 3), start, () => rest).signature,
    before.signature,
  );
});

test("a later schedule cutoff changes the signature while preserving saved portions for covered dates", () => {
  const state = cooked(base(), start, () => training);
  const before = prepBatch(state, start, () => rest);
  const changed = startPrepSchedule(state, "2026-10-27", 3);
  const clipped = prepBatch(changed, start, () => rest);
  assert.equal(clipped.mainServings, 2);
  assert.deepEqual(clipped.servings, dayServings(before));
  assert.notEqual(clipped.signature, state.blocks[start].preparedSignature);
  assert.equal(prepBatch(changed, "2026-10-27", () => rest).mainServings, 6);
});

test("prepared physical four-portion batch survives a new logical batch on day two", () => {
  const state = cooked(base(), start, () => training);
  const expected = preparedBatchFor(state, start, () => rest);
  const changed = freeze(startPrepSchedule(state, "2026-10-27", 3));
  const copy = JSON.stringify(changed);
  const physical = preparedBatchFor(changed, start, () => {
    throw new Error("Do not invent a cooked context");
  });
  assert.ok(physical);
  assert.equal(physical.mainServings, 4);
  assert.equal(physical.block.end, "2026-10-27");
  assert.equal(physical.signature, state.blocks[start].preparedSignature);
  assert.deepEqual(physical.servings, expected.servings);
  assert.deepEqual(physical.ingredients, expected.ingredients);
  const logical = prepBatch(changed, start, () => rest);
  const next = prepBatch(changed, "2026-10-27", () => rest);
  assert.equal(logical.mainServings, 2);
  assert.equal(logical.block.end, start);
  assert.equal(next.mainServings, 6);
  const slots = [...logical.servings, ...next.servings].map(
    (s) => `${s.date}:${s.slot}`,
  );
  assert.equal(new Set(slots).size, slots.length);
  assert.doesNotThrow(() => prepShopping([logical, next]));
  assert.throws(() => prepShopping([physical, next]), /overlapping/);
  assert.equal(
    preparedBatchFor(changed, "2026-10-27", () => rest),
    null,
  );
  assert.equal(JSON.stringify(changed), copy);
});

test("prepared physical six-portion batch ignores interior schedule anchors and restores its original cadence", () => {
  const state = cooked(startPrepSchedule(base(), start, 3), start, (date) => ({
    training: date === start,
    weightKg: 100,
  }));
  let changed = startPrepSchedule(state, "2026-10-27", 2);
  changed = startPrepSchedule(changed, "2026-10-28", 2);
  changed = startPrepSchedule(changed, start, 2);
  const physical = preparedBatchFor(freeze(changed), start, () => rest);
  assert.ok(physical);
  assert.equal(physical.mainServings, 6);
  assert.equal(physical.block.days, 3);
  assert.equal(physical.block.end, "2026-10-28");
  assert.equal(physical.signature, state.blocks[start].preparedSignature);
  assert.equal(prepBatch(changed, start, () => rest).mainServings, 2);
});

test("physical reconstruction rejects changed recipes, contexts and tampered signed food", () => {
  const state = cooked(base(), start, () => rest);
  const changedRecipe = structuredClone(state);
  changedRecipe.blocks[start].mainId = "prep-beef-potato";
  assert.equal(
    preparedBatchFor(changedRecipe, start, () => rest),
    null,
  );
  const changedContext = structuredClone(state);
  changedContext.blocks[start].contexts[start].training = true;
  assert.equal(
    preparedBatchFor(changedContext, start, () => rest),
    null,
  );
  const tampered = structuredClone(state);
  const signature = JSON.parse(tampered.blocks[start].preparedSignature);
  signature.servings[0].ingredients[0][1] = 999;
  tampered.blocks[start].preparedSignature = JSON.stringify(signature);
  assert.equal(
    preparedBatchFor(tampered, start, () => rest),
    null,
  );
});

test("physical reconstruction requires valid bounded metadata and every original saved context", () => {
  const state = cooked(base(), start, () => rest);
  assert.equal(
    preparedBatchFor(base(), start, () => rest),
    null,
  );
  for (const metadata of [
    null,
    [],
    {},
    { start: "2026-10-27" },
    { end: "2026-02-30" },
    { end: "2026-10-25" },
    { end: "2026-10-29" },
    { days: 1 },
    { days: "2" },
    { days: 2, end: "2026-10-28" },
  ]) {
    const changed = structuredClone(state);
    changed.blocks[start].preparedSignature = JSON.stringify(
      metadata === null || Array.isArray(metadata)
        ? metadata
        : { ...JSON.parse(state.blocks[start].preparedSignature), ...metadata },
    );
    if (
      metadata &&
      !Array.isArray(metadata) &&
      Object.keys(metadata).length === 0
    )
      changed.blocks[start].preparedSignature = "{}";
    assert.equal(
      preparedBatchFor(changed, start, () => rest),
      null,
    );
  }
  for (const signature of ["not-json", "", "{", "null", "3"])
    assert.equal(
      preparedBatchFor(
        {
          ...state,
          blocks: {
            [start]: { ...state.blocks[start], preparedSignature: signature },
          },
        },
        start,
        () => rest,
      ),
      null,
    );
  for (const snapshot of [
    undefined,
    { training: "false", weightKg: null },
    { training: false, weightKg: NaN },
    { training: false, weightKg: -1 },
  ]) {
    const changed = structuredClone(state);
    if (snapshot === undefined)
      delete changed.blocks[start].contexts["2026-10-27"];
    else changed.blocks[start].contexts["2026-10-27"] = snapshot;
    assert.equal(
      preparedBatchFor(changed, start, () => {
        throw new Error("Missing snapshots cannot be guessed");
      }),
      null,
    );
  }
  const unprepared = structuredClone(state);
  delete unprepared.blocks[start].preparedAt;
  assert.equal(
    preparedBatchFor(unprepared, start, () => rest),
    null,
  );
});

test("one valid preparation conflict survives normalization without nested conflicts or input mutation", () => {
  const state = cooked(base(), start, () => rest);
  const other = cooked(
    setPrepChoice(base(), start, "main", "prep-beef-potato"),
    start,
    () => training,
  ).blocks[start];
  state.blocks[start].conflictingPreparation = {
    ...other,
    conflictingPreparation: { malformed: "{bad JSON" },
  };
  const copy = JSON.stringify(state);
  const restored = normalizeMealPrep(freeze(state), start);
  assert.deepEqual(restored.blocks[start].conflictingPreparation, other);
  assert.equal(
    "conflictingPreparation" in restored.blocks[start].conflictingPreparation,
    false,
  );
  assert.notEqual(
    restored.blocks[start].conflictingPreparation.contexts,
    other.contexts,
  );
  assert.equal(JSON.stringify(state), copy);
  assert.equal(preparedBatchFor(restored, start, () => rest).mainServings, 4);
});

test("malformed preparation conflicts are ignored, not recursively trusted", () => {
  const state = cooked(base(), start, () => rest);
  const valid = state.blocks[start];
  const badConflicts = [
    null,
    [],
    "{broken",
    {},
    { ...valid, mainId: "missing" },
    { ...valid, breakfastId: "prep-beef-rice" },
    { ...valid, snackId: "constructor" },
    { ...valid, preparedAt: "2026-02-30T19:00:00Z" },
    { ...valid, preparedAt: "2026-10-26" },
    { ...valid, preparedSignature: " " },
    { ...valid, contexts: {} },
    { ...valid, contexts: { bad: rest } },
    { ...valid, contexts: { [start]: { training: "yes", weightKg: 80 } } },
    {
      ...valid,
      contexts: { [start]: { training: false, weightKg: Infinity } },
    },
  ];
  for (const conflict of badConflicts) {
    const input = {
      ...state,
      blocks: { [start]: { ...valid, conflictingPreparation: conflict } },
    };
    const restored = normalizeMealPrep(input, start);
    assert.equal(restored.blocks[start].conflictingPreparation, undefined);
    assert.equal(
      restored.blocks[start].preparedSignature,
      valid.preparedSignature,
    );
  }
});

test("explicit unprepare and changed recipe clear the retained preparation conflict too", () => {
  const state = cooked(base(), start, () => rest);
  state.blocks[start].conflictingPreparation = cooked(
    base(),
    start,
    () => training,
  ).blocks[start];
  freeze(state);
  assert.deepEqual(resetPrepPrepared(state, start).blocks[start], {});
  assert.deepEqual(
    setPrepChoice(state, start, "main", "prep-beef-potato").blocks[start],
    { mainId: "prep-beef-potato" },
  );
  assert.ok(state.blocks[start].conflictingPreparation);
});

for (const cadence of [2, 3])
  for (const days of [14, 21]) {
    test(`${days}-day shopping covers complete ${cadence}-day batches once across a month boundary`, () => {
      const state = startPrepSchedule(base(), start, cadence);
      const before = structuredClone(state);
      const from = addPrepDays(start, 1);
      const window = prepShoppingWindow(state, from, days, (date) => ({
        ...rest,
        training: date.endsWith("1"),
      }));
      assert.equal(window.start, from);
      assert.equal(window.end, addPrepDays(from, days - 1));
      assert.equal(
        new Set(window.covered.map((b) => b.block.key)).size,
        window.covered.length,
      );
      for (let offset = 0; offset < days; offset++) {
        const date = addPrepDays(from, offset);
        assert.equal(
          window.covered.filter(
            (b) => b.block.start <= date && b.block.end >= date,
          ).length,
          1,
        );
      }
      assert.ok(window.covered[0].block.start <= from);
      assert.ok(window.covered.at(-1).block.end >= window.end);
      assert.equal(window.preparedOmitted, 0);
      assert.ok(prepShopping(window.batches).length > 0);
      assert.deepEqual(state, before);
    });
  }

test("bulk shopping omits cooked batches, reflects future swaps and never changes cooking cadence", () => {
  let state = cooked(base(), start, () => rest);
  state = setPrepChoice(
    state,
    addPrepDays(start, 2),
    "main",
    "prep-beef-potato",
  );
  const window = prepShoppingWindow(state, start, 14, () => rest);
  assert.equal(window.preparedOmitted, 1);
  assert.equal(window.batches.length, 6);
  assert.ok(!window.batches.some((b) => b.block.start === start));
  assert.equal(window.batches[0].block.mainId, "prep-beef-potato");
  assert.deepEqual(
    prepShopping(window.batches),
    prepShopping(window.covered.slice(1)),
  );
  assert.equal(prepBlockFor(state, start).days, 2);
  assert.ok(state.blocks[start].preparedSignature);
});

test("bulk shopping starts at a future plan activation and validates the supported windows", () => {
  assert.equal(
    prepShoppingWindow(base(), "2026-10-01", 21, () => rest).start,
    start,
  );
  assert.throws(
    () => prepShoppingWindow(base(), start, 7, () => rest),
    /Invalid shopping window/,
  );
  assert.throws(
    () => prepShoppingWindow(base(), "not-a-date", 14, () => rest),
    /Invalid shopping window/,
  );
});

test("shopping aggregates shared groceries across batches in deterministic category order", () => {
  const a = prepBatch(base(), start, () => rest);
  const b = prepBatch(base(), "2026-10-28", () => training);
  const first = prepShopping([a, b]),
    second = prepShopping([b, a]);
  assert.deepEqual(first, second);
  assert.equal(item(first, "greek-yogurt").amount, 1800);
  assert.equal(item(first, "olive-oil").amount, 80);
  assert.equal(item(first, "mixed-veg").amount, 1600);
  assert.equal(item(first, "toast").amount, 2);
  assert.equal(first[0].category, "Protein & dairy");
  assert.equal(first.at(-1).category, "Pantry");
  assert.deepEqual(prepShopping([]), []);
});

test("shopping keeps units, raw/dry/ready bases and optional items separate", () => {
  const rice = {
    ...prepRecipeMap["prep-chicken-breast-rice"].ingredients[1],
    amount: 100,
  };
  const list = prepShopping([
    synthetic("one", [
      rice,
      { ...rice, amount: 50 },
      { ...rice, optional: true },
      { ...rice, unit: "ml" },
      { ...rice, basis: "ready" },
    ]),
  ]);
  assert.equal(list.length, 4);
  assert.equal(
    list.find((i) => i.unit === "g" && i.basis === "dry" && !i.optional).amount,
    150,
  );
  assert.equal(list.find((i) => i.optional).amount, 100);
  assert.equal(list.find((i) => i.basis === "ready").amount, 100);
  assert.equal(list.find((i) => i.unit === "ml").amount, 100);
});

test("shopping sums decimals, excludes zero and never reports a partial cooked total", () => {
  const oil = prepRecipeMap["prep-chicken-breast-rice"].ingredients.find(
    (i) => i.id === "olive-oil",
  );
  const rows = [
    { ...oil, amount: 0.1, cookedAmount: 0.1 },
    { ...oil, amount: 0.2 },
    { ...oil, amount: 0 },
  ];
  const list = prepShopping([synthetic("one", rows)]);
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 0.3);
  assert.equal(list[0].cookedAmount, undefined);
});

test("shopping deduplicates repeated block queries and rejects conflicting or overlapping batches", () => {
  const a = prepBatch(base(), start, () => rest);
  const same = prepBatch(base(), "2026-10-27", () => rest);
  assert.deepEqual(prepShopping([a, same]), a.ingredients);
  assert.throws(
    () => prepShopping([a, prepBatch(base(), start, () => training)]),
    /Conflicting/,
  );
  const overlapping = prepBatch(
    startPrepSchedule(base(), "2026-10-27", 3),
    "2026-10-27",
    () => rest,
  );
  assert.throws(() => prepShopping([a, overlapping]), /overlapping/);
});

test("shopping keys change with quantity, unit, basis, optionality or cooked yield", () => {
  const rice = prepRecipeMap["prep-chicken-breast-rice"].ingredients[1];
  const key = prepShoppingKey(rice);
  assert.equal(key, prepShoppingKey({ ...rice }));
  for (const change of [
    { amount: 61 },
    { unit: "ml" },
    { basis: "ready" },
    { optional: true },
    { cookedAmount: 181 },
  ])
    assert.notEqual(prepShoppingKey({ ...rice, ...change }), key);
});

test("invalid structured quantities and unestimated foods cannot silently produce shopping or macros", () => {
  const rice = prepRecipeMap["prep-chicken-breast-rice"].ingredients[1];
  for (const change of [
    { amount: -1 },
    { amount: NaN },
    { amount: Infinity },
    { cookedAmount: -1 },
    { unit: "kg" },
    { basis: "cooked" },
    { category: "Other" },
    { optional: "yes" },
    { id: "" },
    { name: "" },
  ]) {
    const invalid = { ...rice, ...change };
    assert.throws(() => prepShoppingKey(invalid), RangeError);
    assert.throws(
      () => prepShopping([synthetic("bad", [invalid])]),
      RangeError,
    );
  }
  assert.throws(
    () =>
      prepServing(
        {
          ...prepRecipeMap["prep-chicken-breast-rice"],
          ingredients: [{ ...rice, id: "unknown-food" }],
        },
        rest,
      ),
    /No food-label estimate/,
  );
});

test("recipes carry specific methods, conservative third-day freezing and verified temperatures", () => {
  for (const recipe of prepRecipes.filter((r) => r.kind === "main")) {
    assert.match(recipe.storage, /4 C/);
    assert.match(recipe.storage, /2-3 days/);
    assert.match(recipe.storage, /freeze the third day's.*prep day/i);
    assert.match(recipe.storage, /reheat to 74 C/);
    assert.match(
      recipe.steps.join(" "),
      recipe.id.includes("beef") ? /71 C/ : /74 C/,
    );
    assert.match(recipe.steps.join(" "), /thermometer/);
    assert.match(
      recipe.steps.join(" "),
      recipe.id.includes("rice")
        ? /rice.*package|package.*rice/
        : /potatoes.*cm|cm.*potatoes/,
    );
  }
});

test("all calculations and choice/schedule edits preserve frozen inputs and the shared catalog", () => {
  const state = freeze(cooked(base(), start, () => rest));
  const copy = JSON.stringify(state),
    catalogCopy = JSON.stringify(prepRecipes);
  const a = prepBatch(state, start, () => training);
  freeze(a);
  prepShopping([a]);
  setPrepChoice(state, start, "main", "prep-beef-potato");
  startPrepSchedule(state, "2026-10-27", 3);
  resetPrepPrepared(state, start);
  const serving = prepServing(prepRecipes[0], training);
  serving.ingredients[0].amount = 1;
  assert.equal(JSON.stringify(state), copy);
  assert.equal(JSON.stringify(prepRecipes), catalogCopy);
});
