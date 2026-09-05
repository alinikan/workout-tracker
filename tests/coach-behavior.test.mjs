import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { canClaimLocalProgress, mergeProgressChanges, sameData } from "../src/lib/syncMerge.ts";

// Load the actual app through Vite's TS/JSX pipeline. envDir:false makes this a
// local fixture: no production credentials, accounts, or saved data are used.
const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(() => server.close());
const model = await server.ssrLoadModule("/src/App.tsx");
const days = model.buildPlanDays();
const reference = { weight: 80, label: "Recent average", detail: "Test fixture" };
const weight = (kg) => ({ weightKg: String(kg), weight: "", note: "", photoReminderDone: false });

function recordWeek(store, week, kg, count = 7) {
  for (let day = 0; day < count; day += 1) store.metrics[days[week * 7 + day].iso] = weight(kg);
}

test("Coach Hub renders with useful actions and no saved user data", () => {
  const html = renderToString(createElement(model.default));
  assert.match(html, /Coach Hub/);
  assert.match(html, /Today&#x27;s workout progress/);
  assert.match(html, /Today&#x27;s meal progress/);
  assert.match(html, /Morning weight \(kg\)/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("all 182 days have valid ordered movements, targets, and bounded set counts", () => {
  assert.equal(days.length, 182);
  assert.equal(days[0].iso, "2026-08-31");
  assert.equal(days[0].planDayName, "Monday");
  for (const day of days) {
    const coached = model.withTrainingWeek(day, day.week);
    const exercises = model.scheduledExercisesForDay(coached);
    assert.equal(new Set(exercises.map((item) => item.id)).size, exercises.length);
    for (const [index, exercise] of exercises.entries()) {
      const count = model.recommendedSets(coached, exercise, index);
      assert.ok(Number.isInteger(count) && count >= 1 && count <= 4, `${day.iso}: ${exercise.id}`);
      assert.ok(model.targetForExercise(coached, exercise));
      assert.ok(exercise.cues?.length || exercise.steps?.length || exercise.howTo?.length, `${exercise.id} needs teaching`);
    }
  }
});

test("completed real strength sessions unlock volume; recovery replacements do not", () => {
  const store = model.emptyStore();
  const selected = days[28];
  assert.equal(model.earnedTrainingWeekForDay(days, store, selected), 1);
  for (const day of days.slice(0, 28).filter((item) => item.session.type === "strength")) {
    store.days[day.iso] = model.completePlanDay(day, model.normalizeDayLog(undefined));
  }
  assert.equal(model.earnedTrainingWeekForDay(days, store, selected), 5);
  const lift = model.scheduledExercisesForDay(selected).find((item) => item.id === "leg-press");
  assert.equal(model.recommendedSets(model.withTrainingWeek(selected, 1), lift, 0), 2);
  assert.equal(model.recommendedSets(model.withTrainingWeek(selected, 5), lift, 0), 3);
  for (const log of Object.values(store.days)) log.readiness = { jointPain: "concerning" };
  assert.equal(model.earnedTrainingWeekForDay(days, store, selected), 1);
});

test("marking a day complete fills its sets and unfinished navigation skips done moves", () => {
  const log = model.completePlanDay(days[0], model.normalizeDayLog(undefined));
  assert.equal(model.dayStatusForDay(days[0], log), "complete");
  assert.ok(Object.values(log.exercises).flat().every((row) => row.done));
  const moves = [true, true, true, false, true, false, false].map((isComplete) => ({ isComplete, isSkipped: false }));
  assert.equal(model.firstUnfinishedMoveIndex(moves), 3);
  assert.equal(model.nextUnfinishedMoveIndex(moves, 3, "next"), 5);
  assert.equal(model.nextUnfinishedMoveIndex(moves, 5, "next"), 6);
});

test("missing effort feedback is not evidence to increase load", () => {
  const store = model.emptyStore();
  store.days[days[0].iso] = model.normalizeDayLog(undefined);
  store.days[days[0].iso].exercises["leg-press"] = Array.from({ length: 2 }, () => ({ weight: "50", reps: "", done: true }));
  const lift = model.scheduledExercisesForDay(days[7]).find((item) => item.id === "leg-press");
  const advice = model.smartLoadSuggestion(days, store, days[7], lift, 0);
  assert.notEqual(advice.tone, "build");
});

test("Gym uses the device date across midnight, independently of the browsed workout", () => {
  const friday = model.closestProgramDate(new Date(2026, 8, 4, 23, 59));
  const saturday = model.closestProgramDate(new Date(2026, 8, 5, 0, 1));
  assert.equal(model.resolveGymDay(days, friday).iso, days[4].iso);
  assert.equal(model.resolveGymDay(days, saturday).iso, days[5].iso);
  assert.equal(model.closestProgramDate(new Date(2026, 7, 1)), days[0].iso);
  assert.equal(model.closestProgramDate(new Date(2027, 8, 1)), days.at(-1).iso);
});

test("Friday skips never carry to Saturday or next Friday's matching exercise IDs", () => {
  const store = model.emptyStore();
  let friday = model.normalizeDayLog(undefined);
  for (const move of model.scheduledExercisesForDay(days[4], friday)) {
    friday = model.skipPlanMove(days[4], friday, move.id, "fatigue");
  }
  store.days[days[4].iso] = friday;
  assert.equal(model.dayStatusForDay(days[4], friday), "finished-with-skips");
  for (const day of [days[5], days[11]]) {
    const log = model.normalizeDayLog(store.days[day.iso]);
    assert.equal(model.dayStatusForDay(day, log), "incomplete");
    model.scheduledExercisesForDay(day, log).forEach((move, index) => {
      assert.equal(model.moveStatusForExercise(day, log, move, index), "pending");
    });
  }
});

test("whole-day skipping works throughout the program, including recovery and active swaps", () => {
  for (const rawDay of days) {
    const day = model.withTrainingWeek(rawDay, rawDay.week);
    const log = model.normalizeDayLog(undefined);
    const exercises = model.scheduledExercisesForDay(day, log);
    const swappable = exercises.find((move) => move.swapIds?.length);
    if (swappable) log.swaps[swappable.id] = swappable.swapIds[0];
    log.notes = "Keep my notes";
    const before = structuredClone(log);
    const skipped = model.skipPlanDay(day, log, "time");
    assert.deepEqual(log, before, "skipping must not mutate the source log");
    assert.equal(model.dayStatusForDay(day, skipped), "skipped", day.iso);
    assert.equal(skipped.completed, false);
    assert.equal(model.isPlanDayComplete(day, skipped), false);
    assert.deepEqual(skipped.swaps, log.swaps);
    assert.equal(skipped.notes, log.notes);
    model.scheduledExercisesForDay(day, skipped).forEach((move, index) => {
      assert.equal(model.moveStatusForExercise(day, skipped, move, index), "skipped");
    });
    assert.equal(model.dayStatusForDay(day, model.reopenPlanDay(day, skipped)), "incomplete");
    const completed = model.completePlanDay(day, skipped);
    assert.equal(completed.daySkipReason, undefined);
    assert.equal(model.dayStatusForDay(day, completed), "complete");
    assert.ok(Object.values(completed.exercises).flat().every((row) => row.done));
    assert.deepEqual(model.skipPlanDay(day, completed, "time"), model.normalizeDayLog(completed), "completed days cannot be skipped accidentally");
  }
});

test("skipping and resuming preserve completed sets, partial moves, and earlier individual reasons", () => {
  const day = days[0];
  const completed = model.completePlanDay(day, model.normalizeDayLog(undefined));
  const exercises = model.scheduledExercisesForDay(day);
  const first = exercises[0];
  const partialIndex = exercises.findIndex((move, index) => model.recommendedSets(day, move, index) > 1);
  const partial = exercises[partialIndex];
  const another = exercises.find((move) => move.id !== first.id && move.id !== partial.id);
  const log = model.normalizeDayLog(undefined);
  log.exercises[first.id] = completed.exercises[first.id];
  log.exercises[partial.id] = completed.exercises[partial.id].map((row, index) => ({ ...row, weight: "25", done: index === 0 }));
  log.skips[another.id] = "equipment";
  const moveSkipped = model.skipPlanMove(day, log, partial.id, "fatigue");
  assert.deepEqual(moveSkipped.exercises[partial.id], log.exercises[partial.id]);
  assert.equal(model.moveStatusForExercise(day, moveSkipped, partial, partialIndex), "skipped");
  const skipped = model.skipPlanDay(day, log, "time");
  assert.equal(model.moveStatusForExercise(day, skipped, first, 0), "done");
  assert.deepEqual(skipped.exercises, model.normalizeDayLog(log).exercises);
  const resumed = model.reopenPlanDay(day, skipped);
  assert.equal(model.moveStatusForExercise(day, resumed, partial, partialIndex), "pending");
  assert.equal(resumed.skips[another.id], "equipment");
  assert.deepEqual(resumed.exercises, model.normalizeDayLog(log).exercises);
  const oneMoveResumed = model.reopenPlanMove(day, skipped, partial.id);
  assert.equal(oneMoveResumed.daySkipReason, undefined);
  assert.equal(model.moveStatusForExercise(day, oneMoveResumed, partial, partialIndex), "pending");
  exercises.forEach((move, index) => {
    if (move.id === partial.id) return;
    assert.equal(model.moveStatusForExercise(day, oneMoveResumed, move, index), move.id === first.id ? "done" : "skipped");
  });
  assert.equal(oneMoveResumed.skips[another.id], "equipment");
  assert.deepEqual(oneMoveResumed.exercises, model.normalizeDayLog(log).exercises);
});

test("day skips survive save/reload and independent cross-device date edits", () => {
  const base = model.emptyStore();
  base.days[days[4].iso] = model.normalizeDayLog(undefined);
  base.days[days[5].iso] = model.normalizeDayLog(undefined);
  base.metrics[days[4].iso] = weight(80);
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.days[days[4].iso] = model.skipPlanDay(days[4], local.days[days[4].iso], "fatigue");
  remote.days[days[5].iso] = model.completePlanDay(days[5], remote.days[days[5].iso]);
  const synced = model.normalizeStore(JSON.parse(JSON.stringify(mergeProgressChanges(base, local, remote))));
  assert.equal(synced.days[days[4].iso].daySkipReason, "fatigue");
  assert.equal(model.dayStatusForDay(days[5], synced.days[days[5].iso]), "complete");
  assert.deepEqual(synced.metrics, base.metrics);
  assert.deepEqual(synced.dietDays, base.dietDays);
  assert.equal(model.earnedTrainingWeekForDay(days, synced, days[7]), 1);
  const resumed = structuredClone(synced);
  resumed.days[days[4].iso] = model.reopenPlanDay(days[4], resumed.days[days[4].iso]);
  const remoteEdit = structuredClone(synced);
  remoteEdit.days[days[5].iso].notes = "Still Saturday";
  const merged = model.normalizeStore(mergeProgressChanges(synced, resumed, remoteEdit));
  assert.equal(merged.days[days[4].iso].daySkipReason, undefined);
  assert.equal(merged.days[days[5].iso].notes, "Still Saturday");
  const invalid = { ...base.days[days[4].iso], daySkipReason: "invalid" };
  assert.equal(model.normalizeDayLog(invalid).daySkipReason, undefined);
  const conflict = { ...local.days[days[4].iso], completed: true };
  assert.equal(model.normalizeDayLog(conflict).completed, false, "a skipped day cannot earn training credit");
});

test("invalid and negative weights never enter averages; legacy pounds still convert", () => {
  for (const value of ["-20", "0", "NaN", "abc80", "501", "Infinity"]) {
    assert.equal(model.weightKgFromMetric(weight(value)), null, value);
  }
  assert.equal(model.weightKgFromMetric(weight("80,5")), 80.5);
  assert.ok(Math.abs(model.weightKgFromMetric({ ...weight(""), weight: "176.37" }) - 80) < 0.01);
});

test("recent protein averages cannot silently include months-old or future entries", () => {
  const store = model.emptyStore();
  recordWeek(store, 0, 95);
  store.metrics[days[28].iso] = weight(80);
  store.metrics[days[29].iso] = weight(50);
  assert.equal(model.proteinReferenceFromMetrics(days, store.metrics, 28).weight, 80);
  assert.equal(model.proteinReferenceFromMetrics(days, store.metrics, 28).label, "Latest weigh-in");
  assert.equal(model.proteinReferenceFromMetrics(days, store.metrics, 60).label, "Older weigh-in");
});

test("trend requires consecutive completed weeks with four weigh-ins each", () => {
  const store = model.emptyStore();
  recordWeek(store, 0, 80, 1);
  recordWeek(store, 1, 78, 1);
  assert.equal(model.weightTrendSignalFor(days, store.metrics, 14, reference).status, "waiting");
  recordWeek(store, 0, 80, 4);
  recordWeek(store, 1, 79.6, 4);
  assert.equal(model.weightTrendSignalFor(days, store.metrics, 13, reference).status, "waiting");
  assert.equal(model.weightTrendSignalFor(days, store.metrics, 14, reference).status, "on-track-loss");
  // The empty third week must not be skipped when looking for an older good signal.
  assert.equal(model.weightTrendSignalFor(days, store.metrics, 21, reference).status, "waiting");
});

test("poor readiness and higher mode protect fuel even before weight history exists", () => {
  const store = model.emptyStore();
  const args = { planDays: days, store, planDay: days[0], proteinReference: reference, analysisIndex: 0 };
  assert.equal(model.adaptiveDietCoachForDay({ ...args, readinessStatus: "yellow" }).tone, "fuel");
  store.settings.calorieMode = "higher";
  assert.equal(model.adaptiveDietCoachForDay({ ...args, readinessStatus: "green" }).tone, "fuel");
});

test("today's unfinished training is excluded from the adherence denominator", () => {
  const store = model.emptyStore();
  const result = model.recentTrainingAdherenceFor(days, store, 0);
  assert.equal(result.total, 0);
  assert.equal(result.enough, false);
});

test("one higher week does not automatically tighten a consistent user's meals", () => {
  const store = model.emptyStore();
  recordWeek(store, 0, 80);
  recordWeek(store, 1, 80.5);
  for (const day of days.slice(0, 14)) store.days[day.iso] = model.completePlanDay(day, model.normalizeDayLog(undefined));
  const result = model.adaptiveDietCoachForDay({ planDays: days, store, planDay: days[14], proteinReference: reference, readinessStatus: "green", analysisIndex: 14 });
  assert.equal(result.tone, "hold");
});

test("tightening advice is limited to one meal and protects training food", () => {
  const coach = { tone: "tighten" };
  for (const slot of ["lunch", "snack", "dinner"]) {
    const recipe = model.baseDietRecipeFor(days[0], slot);
    const advice = model.smartPortionAdviceForMeal(days[0], slot, recipe, coach, reference);
    assert.doesNotMatch(advice.items.join(" "), /Carbs: Reduce|Alternative:/);
  }
  const recipe = model.baseDietRecipeFor(days[0], "breakfast");
  const advice = model.smartPortionAdviceForMeal(days[0], "breakfast", recipe, coach, reference);
  assert.match(advice.items.join(" "), /OR the carb change/);
});

test("weight chart spacing reflects missing calendar days", () => {
  const chart = model.weightChartModel([0, 1, 7].map((day) => ({ date: days[day].iso, dayNumber: day + 1, note: "", weight: 80 })));
  assert.ok(Math.abs(chart.points[1].x - 100 / 7) < 0.001);
  assert.equal(chart.points[2].x, 100);
});

test("sync preserves independent edits, unchecks, cleared values, and reverted swaps", () => {
  const base = { meals: { lunch: true, dinner: false }, swaps: { lunch: "swap" }, weight: "80", sets: [{ done: true, weight: "50" }, { done: false, weight: "" }] };
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.meals.lunch = false;
  local.weight = "";
  delete local.swaps.lunch;
  local.sets[0].done = false;
  remote.meals.dinner = true;
  remote.sets[1] = { done: true, weight: "55" };
  const merged = mergeProgressChanges(base, local, remote);
  assert.deepEqual(merged.meals, { lunch: false, dinner: true });
  assert.deepEqual(merged.swaps, {});
  assert.equal(merged.weight, "");
  assert.deepEqual(merged.sets, [{ done: false, weight: "50" }, { done: true, weight: "55" }]);
  assert.equal(base.meals.lunch, true, "merge must not mutate the baseline");
});

test("a different account cannot claim another user's local progress", () => {
  assert.equal(canClaimLocalProgress("first-user", "second-user"), false);
  assert.equal(canClaimLocalProgress("first-user", "first-user"), true);
  assert.equal(canClaimLocalProgress(undefined, "first-user"), true);
});

test("server JSON key ordering does not turn an unchanged save into an edit", () => {
  const local = { days: { monday: { done: true, weight: "50", effort: undefined } }, settings: {} };
  const remote = { settings: {}, days: { monday: { weight: "50", done: true } } };
  assert.equal(sameData(local, remote), true);
  assert.equal(sameData(local, { ...remote, settings: { calorieMode: "higher" } }), false);
});

test("clearing a field during an in-flight write survives the next cloud read", () => {
  const sent = { weight: "50", note: "" };
  const editedWhileSaving = { weight: "", note: "new note" };
  const acceptedByServer = { weight: "50", note: "" };
  const pending = mergeProgressChanges(sent, editedWhileSaving, acceptedByServer);
  // The accepted write becomes the new baseline, even if the original effect's
  // render was superseded while waiting for the network.
  const nextSave = mergeProgressChanges(acceptedByServer, pending, acceptedByServer);
  assert.deepEqual(nextSave, { weight: "", note: "new note" });
});
