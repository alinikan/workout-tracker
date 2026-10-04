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
const days = model.buildPlanDays("2026-08-31");
const reference = { weight: 80, label: "Recent average", detail: "Test fixture" };
const weight = (kg) => ({ weightKg: String(kg), weight: "", weightForgotten: false, note: "", photoReminderDone: false });

function recordWeek(store, week, kg, count = 7) {
  for (let day = 0; day < count; day += 1) store.metrics[days[week * 7 + day].iso] = weight(kg);
}

test("Coach Hub is the useful default with no saved user data", () => {
  const html = renderToString(createElement(model.default));
  assert.match(html, /coach-hub-shell/);
  assert.match(html, /Today&#x27;s workout progress/);
  assert.match(html, /Today&#x27;s meal progress/);
  assert.match(html, /Morning weight \(kg\)/);
  assert.match(html, /Recomp app navigation/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("GIF-only exercises start with compact controls, never an empty video frame", () => {
  for (const exercise of Object.values(model.exerciseMap).filter((move) => !move.youtubeId && move.motionDemo)) {
    for (const variant of ["gym", "thumb", "library"]) {
      const html = renderToString(createElement(model.ExerciseMedia, { exercise, variant }));
      assert.match(html, /controls-only/);
      assert.match(html, /Show GIF/);
      assert.doesNotMatch(html, /placeholder|motion-badge|<iframe|video-poster|<img/);
    }
  }
});

test("exercises with no video or GIF render no media section", () => {
  const exercise = { ...model.exerciseMap["long-cardio-walk"], motionDemo: undefined };
  for (const variant of ["gym", "thumb", "library"]) {
    assert.equal(renderToString(createElement(model.ExerciseMedia, { exercise, variant })), "");
  }
});

test("video exercises retain their clickable inline poster and optional GIF control", () => {
  const exercise = model.exerciseMap["lat-pulldown"];
  const html = renderToString(createElement(model.ExerciseMedia, { exercise, variant: "gym" }));
  assert.match(html, /showing-video/);
  assert.match(html, /has-video/);
  assert.match(html, /video-poster/);
  assert.match(html, /Play Seated Lat Pulldown video here/);
  assert.match(html, /Show GIF/);
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

function loadFixture() {
  const store = model.emptyStore();
  const exercise = model.scheduledExercisesForDay(days[0]).find((move) => move.id === "lat-pulldown");
  for (const index of [0, 4]) {
    store.days[days[index].iso] = model.normalizeDayLog(undefined);
    store.days[days[index].iso].exercises[exercise.id] = Array.from({ length: 2 }, () => ({ weight: "40", reps: "12", effort: "about-right", done: true }));
  }
  return { store, exercise, advise: (day = days[7]) => model.smartLoadSuggestion(days, store, day, exercise, 0) };
}

test("heavier-load advice needs two recent completed same-load top-rep sessions with effort", () => {
  const { store, exercise, advise } = loadFixture();
  assert.equal(advise().tone, "build");
  assert.match(advise().detail, /2\/2 qualifying sessions at 40 lb/);
  assert.match(advise().detail, /41-42 lb/);
  delete store.days[days[0].iso];
  assert.equal(advise().label, "One more confirming session");
  store.days[days[4].iso].exercises[exercise.id][0].effort = undefined;
  assert.notEqual(advise().tone, "build");
});

test("draft, incomplete, mixed-load, malformed and missing-rep sets never earn a load jump", () => {
  for (const patch of [
    { done: false }, { reps: "" }, { reps: "7" }, { reps: "12.5" },
    { reps: "12 reps?" }, { weight: "45" }, { weight: "-40" }, { weight: "20 + 20" },
    { weight: "0" }, { effort: "very-hard" }, { effort: undefined },
  ]) {
    const { store, exercise, advise } = loadFixture();
    Object.assign(store.days[days[4].iso].exercises[exercise.id][0], patch);
    assert.notEqual(advise().tone, "build", JSON.stringify(patch));
  }
});

test("readiness, skipped attempts, stale history, added sets and consolidation block increases", () => {
  for (const scenario of ["today-yellow", "today-red", "prior-red", "move-skip", "day-skip", "stale", "new-set", "consolidation"]) {
    const { store, exercise, advise } = loadFixture();
    let day = days[7];
    if (scenario.startsWith("today")) store.days[day.iso] = { ...model.normalizeDayLog(undefined), readiness: { jointPain: scenario === "today-red" ? "concerning" : "mild" } };
    if (scenario === "prior-red") store.days[days[4].iso].readiness = { jointPain: "concerning" };
    if (scenario === "move-skip") store.days[days[4].iso].skips[exercise.id] = "time";
    if (scenario === "day-skip") store.days[days[4].iso].daySkipReason = "fatigue";
    if (scenario === "stale") day = days[35];
    if (scenario === "new-set") day = model.withTrainingWeek(day, 5);
    if (scenario === "consolidation") day = model.withTrainingWeek(day, 8);
    assert.notEqual(advise(day).tone, "build", scenario);
  }
});

test("a newer skipped attempt blocks older qualifying wins and new swaps do not copy loads", () => {
  const { store, exercise } = loadFixture();
  store.days[days[7].iso] = model.skipPlanDay(days[7], model.normalizeDayLog(undefined), "time");
  assert.notEqual(model.smartLoadSuggestion(days, store, days[11], exercise, 0).tone, "build");
  const row = model.scheduledExercisesForDay(days[2]).find((move) => move.id === "single-arm-row");
  const swap = model.swapOptionsFor(row).find((move) => move.id === "mi6-seated-row");
  store.days[days[2].iso] = model.normalizeDayLog(undefined);
  store.days[days[2].iso].exercises[row.id] = [{ weight: "80", reps: "12", done: true, effort: "too-easy" }];
  assert.equal(model.smartLoadSuggestion(days, store, days[9], swap, 0).tone, "start");
});

test("all training blocks group upstairs prep first and floor core last without removing moves", () => {
  for (const day of days.filter((item) => item.session.type === "strength")) {
    const coached = model.withTrainingWeek(day, day.week);
    const list = model.scheduledExercisesForDay(coached);
    assert.deepEqual(list.slice(0, 3).map((move) => move.id), ["seated-knee-extension-warmup", "standing-supported-hip-abduction", "warmup-treadmill-walk"]);
    let floorStarted = false;
    for (const move of list) {
      const location = model.locationGuideForExercise(move).type;
      if (location === "either") floorStarted = true;
      if (floorStarted) assert.equal(location, "either", `${day.iso}: no return downstairs after ${move.id}`);
    }
    const cable = list.findIndex((move) => move.id === "cable-crunch");
    const finisher = list.findIndex((move) => move.id === "treadmill-finisher");
    if (cable >= 0 && finisher >= 0) assert.ok(cable < finisher);
    assert.equal(new Set(list.map((move) => move.id)).size, list.length);
  }
});

test("requested video IDs and seated pulldown GIF reach the shared exercise model", () => {
  const expected = { "seated-knee-extension-warmup": "8ORm_-xfJV4", "standing-supported-hip-abduction": "qBqKuEQl9sI", "lat-pulldown": "AkjdxVHfe6o", "db-rdl": "5WxMW-Fu5KU" };
  const exercises = model.scheduledExercisesForDay(days[0]);
  for (const [id, video] of Object.entries(expected)) assert.equal(exercises.find((move) => move.id === id).youtubeId, video);
  assert.equal(exercises.find((move) => move.id === "lat-pulldown").motionDemo.workoutXId, "0198");
});

test("Mi6 swaps have media, setup notes and ramp teaching while originals remain reversible", () => {
  const day = model.withTrainingWeek(days[2], 9);
  const log = model.normalizeDayLog(undefined);
  const exercises = model.scheduledExercisesForDay(day);
  for (const [originalId, swapId] of [["single-arm-row", "mi6-seated-row"], ["dumbbell-biceps-curl", "mi6-cable-curl"], ["rope-triceps-pressdown", "mi6-bar-pressdown"]]) {
    const original = exercises.find((move) => move.id === originalId);
    log.swaps[originalId] = swapId;
    const swap = model.activeExerciseFor(original, log);
    assert.equal(swap.id, swapId);
    assert.ok(swap.youtubeId && swap.motionDemo.workoutXId && swap.cues.length >= 4 && swap.loadNote);
    delete log.swaps[originalId];
    assert.equal(model.activeExerciseFor(original, log).id, originalId);
  }
  log.swaps["single-arm-row"] = "mi6-seated-row";
  const ramp = exercises.find((move) => move.id === "warmup-ramp-single-arm-row");
  const activeRamp = model.activeExerciseFor(ramp, log);
  assert.equal(activeRamp.id, ramp.id, "stable saved warm-up slot");
  assert.match(activeRamp.name, /HOIST Mi6/);
  assert.match(activeRamp.cues[0], /lighter/);
  assert.notEqual(model.smartLoadSuggestion(days, model.emptyStore(), day, activeRamp, 0).tone, "build");
});

test("equivalent swaps preserve the original program slot's priority and late-phase volume", () => {
  for (const trainingWeek of [5, 13, 17, 21, 26]) {
    for (const sourceDay of [days[0], days[2], days[4]]) {
      const day = model.withTrainingWeek(sourceDay, trainingWeek);
      const exercises = model.scheduledExercisesForDay(day);
      exercises.forEach((original, index) => {
        for (const swap of model.swapOptionsFor(original)) {
          assert.equal(
            model.recommendedSets(day, swap, index, "green", original),
            model.recommendedSets(day, original, index, "green", original),
            `week ${trainingWeek}: ${original.id} -> ${swap.id}`,
          );
        }
      });
    }
  }
});

test("Gym uses the device date across midnight, independently of the browsed workout", () => {
  const friday = model.closestProgramDate(new Date(2026, 8, 4, 23, 59), "2026-08-31");
  const saturday = model.closestProgramDate(new Date(2026, 8, 5, 0, 1), "2026-08-31");
  assert.equal(model.resolveGymDay(days, friday).iso, days[4].iso);
  assert.equal(model.resolveGymDay(days, saturday).iso, days[5].iso);
  assert.equal(model.closestProgramDate(new Date(2026, 7, 1), "2026-08-31"), days[0].iso);
  assert.equal(model.closestProgramDate(new Date(2027, 8, 1), "2026-08-31"), "2027-09-01");
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
  const automaticConflict = { ...local.days[days[4].iso], daySkipReason: "forgotten", completed: true };
  assert.equal(model.normalizeDayLog(automaticConflict).completed, true, "real completion beats automatic rollover");
  assert.equal(model.normalizeDayLog(automaticConflict).daySkipReason, undefined);
});

test("invalid and negative weights never enter averages; legacy pounds still convert", () => {
  for (const value of ["-20", "0", "NaN", "abc80", "501", "Infinity"]) {
    assert.equal(model.weightKgFromMetric(weight(value)), null, value);
  }
  assert.equal(model.weightKgFromMetric(weight("80,5")), 80.5);
  assert.ok(Math.abs(model.weightKgFromMetric({ ...weight(""), weight: "176.37" }) - 80) < 0.01);
});

test("past-date rollover records forgotten weights without treating them as zero", () => {
  const store = model.emptyStore();
  store.metrics[days[0].iso] = weight(80);

  const reconciled = model.reconcilePastTracking(days, store, days[3].iso);
  assert.equal(model.isWeightForgotten(reconciled.metrics[days[0].iso]), false);
  assert.equal(model.isWeightForgotten(reconciled.metrics[days[1].iso]), true);
  assert.equal(model.isWeightForgotten(reconciled.metrics[days[2].iso]), true);
  assert.equal(reconciled.metrics[days[3].iso], undefined, "today stays open until tomorrow");

  const summary = model.weightWeekSummary(days, reconciled.metrics, 0);
  assert.equal(summary.loggedDays, 1);
  assert.equal(summary.forgottenDays, 2);
  assert.equal(summary.openDays, 4);
  assert.equal(summary.average, 80);
  assert.equal(model.reconcilePastTracking(days, reconciled, days[3].iso), reconciled, "rollover is idempotent");

  const afterProgram = model.reconcilePastTracking(days, model.emptyStore(), "2027-03-01");
  assert.equal(model.isWeightForgotten(afterProgram.metrics[days.at(-1).iso]), true);
  assert.equal(model.normalizeDayLog(afterProgram.days[days.at(-1).iso]).daySkipReason, "forgotten");
});

test("past-date rollover skips only unresolved workout moves after partial work", () => {
  const store = model.emptyStore();
  const firstDay = model.withTrainingWeek(days[0], 1);
  const exercises = model.scheduledExercisesForDay(firstDay);
  const complete = model.completePlanDay(firstDay, model.normalizeDayLog(undefined));
  const partial = model.normalizeDayLog(undefined);
  partial.exercises[exercises[0].id] = complete.exercises[exercises[0].id];
  store.days[firstDay.iso] = partial;

  const reconciled = model.reconcilePastTracking(days, store, days[2].iso);
  const firstLog = model.normalizeDayLog(reconciled.days[firstDay.iso]);
  assert.equal(model.moveStatusForExercise(firstDay, firstLog, exercises[0], 0), "done");
  exercises.slice(1).forEach((exercise, relativeIndex) => {
    assert.equal(
      model.moveStatusForExercise(firstDay, firstLog, exercise, relativeIndex + 1),
      "skipped",
    );
    assert.equal(firstLog.skips[exercise.id], "forgotten");
  });
  assert.equal(model.dayStatusForDay(firstDay, firstLog), "finished-with-skips");

  const untouchedDay = model.withTrainingWeek(days[1], 1);
  const untouchedLog = model.normalizeDayLog(reconciled.days[untouchedDay.iso]);
  assert.equal(untouchedLog.daySkipReason, "forgotten");
  assert.equal(model.dayStatusForDay(untouchedDay, untouchedLog), "skipped");
  assert.equal(reconciled.days[days[2].iso], undefined, "today's workout remains open");
});

test("concurrent cloud completion beats automatic rollover housekeeping", () => {
  const base = model.emptyStore();
  base.days[days[0].iso] = model.normalizeDayLog(undefined);
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.days[days[0].iso] = model.skipPlanDay(days[0], local.days[days[0].iso], "forgotten");
  remote.days[days[0].iso] = model.completePlanDay(days[0], remote.days[days[0].iso]);

  const merged = mergeProgressChanges(base, local, remote);
  const normalized = model.normalizeDayLog(merged.days[days[0].iso]);
  assert.equal(normalized.completed, true);
  assert.equal(normalized.daySkipReason, undefined);
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

test("calendar stays live after long absences and has no hard-coded expiry", () => {
  const live = model.buildPlanDays("2026-08-31", "2028-03-14");
  const actual = live.find((day) => day.iso === "2028-03-14");
  assert.ok(live.length > 182);
  assert.equal(model.resolveGymDay(live, "2028-03-14").iso, actual.iso);
  assert.equal(actual.planDayName, "Tuesday");
  assert.equal(actual.session.type, "cardio");
  assert.ok(live.at(-1).iso >= "2028-04-10");
  assert.equal(model.earnedTrainingWeekForDay(live, model.emptyStore("2026-08-31"), actual), 1);
  const fresh = model.buildPlanDays("2026-10-03");
  assert.equal(fresh[0].planDayName, "Saturday", "restart uses real weekday, not a fictional Monday");
});

test("exactly three full lifts earn a week; skips, partial work and cardio earn none", () => {
  const store = model.emptyStore("2026-08-31");
  for (const index of [0, 2]) store.days[days[index].iso] = model.completePlanDay(days[index], model.normalizeDayLog());
  store.days[days[1].iso] = model.completePlanDay(days[1], model.normalizeDayLog());
  store.days[days[4].iso] = model.skipPlanDay(days[4], model.normalizeDayLog(), "time");
  store.days[days[7].iso] = model.normalizeDayLog();
  store.days[days[7].iso].exercises["leg-press"] = [{ weight: "50", reps: "10", done: true }];
  assert.equal(model.earnedTrainingWeekForDay(days, store, days[28]), 1);
  assert.equal(model.trainingProgressFor(days, store, days[28].iso).credits, 2);
  store.days[days[9].iso] = model.completePlanDay(model.withTrainingWeek(days[9], 1), model.normalizeDayLog());
  assert.equal(model.earnedTrainingWeekForDay(days, store, days[9]), 1, "completing a day doesn't change that day's level");
  assert.equal(model.earnedTrainingWeekForDay(days, store, days[28]), 2);
  const rolled = model.reconcilePastTracking(days, store, days[28].iso);
  assert.equal(model.earnedTrainingWeekForDay(days, rolled, days[28]), 2);
  assert.equal(model.trainingProgressFor(days, rolled, days[28].iso).credits, 3);
});

test("six-month journey requires 78 real lifts even across more than 26 calendar weeks", () => {
  const live = model.buildPlanDays("2026-08-31", "2027-09-01");
  const store = model.emptyStore("2026-08-31");
  const lifts = live.filter((day) => day.index >= 70 && day.session.type === "strength").slice(0, 78);
  for (const day of lifts) {
    const coached = model.withTrainingWeek(day, model.earnedTrainingWeekForDay(live, store, day));
    store.days[day.iso] = { ...model.completePlanDay(coached, model.normalizeDayLog()), trainingWeek: coached.trainingWeek };
  }
  const progress = model.trainingProgressFor(live, store, lifts.at(-1).iso);
  assert.equal(progress.credits, 78);
  assert.equal(progress.completedWeeks, 26);
  assert.equal(progress.percent, 100);
  assert.equal(progress.isComplete, true);
  assert.equal(model.earnedTrainingWeekForDay(live, store, live.at(-1)), 26);
});

test("saved historical target levels remain stable after backfilling earlier workouts", () => {
  const store = model.emptyStore("2026-08-31");
  store.days[days[28].iso] = { ...model.completePlanDay(model.withTrainingWeek(days[28], 1), model.normalizeDayLog()), trainingWeek: 1 };
  for (const day of days.slice(0, 28).filter((item) => item.session.type === "strength")) {
    store.days[day.iso] = model.completePlanDay(model.withTrainingWeek(day, 1), model.normalizeDayLog());
  }
  assert.equal(model.earnedTrainingWeekForDay(days, store, days[28]), 1);
  assert.equal(model.earnedTrainingWeekForDay(days, store, days[30]), 5);
  assert.equal(model.normalizeStore(store).days[days[28].iso].trainingWeek, 1);
});

test("future notes and swaps do not freeze targets before the session date", () => {
  const store = model.emptyStore("2026-08-31");
  store.days[days[28].iso] = { ...model.normalizeDayLog(), notes: "Prepare the cable handle" };
  assert.equal(model.trainingWeekForEdit(days, store, days[28], days[0].iso), undefined);
  for (const index of [0, 2, 4]) store.days[days[index].iso] = model.completePlanDay(days[index], model.normalizeDayLog());
  assert.equal(model.trainingWeekForEdit(days, store, days[28], days[28].iso), 2);
  store.days[days[28].iso].trainingWeek = 2;
  assert.equal(model.trainingWeekForEdit(days, store, days[28], days[35].iso), 2);
});

test("block reviews unlock after completed practice, not after 28 absent calendar days", () => {
  const store = model.emptyStore("2026-08-31");
  let review = model.monthlyCheckInForDay(days, store, days[35]);
  assert.equal(review.month, 1);
  assert.equal(review.isUnlocked, false);
  assert.equal(review.totalStrength, 12);
  const lifts = days.slice(0, 28).filter((day) => day.session.type === "strength");
  for (const day of lifts) store.days[day.iso] = model.completePlanDay(model.withTrainingWeek(day, 1), model.normalizeDayLog());
  review = model.monthlyCheckInForDay(days, store, lifts.at(-1));
  assert.equal(review.isUnlocked, true);
  assert.equal(review.completedStrength, 12);
});

test("restart clears all progress but keeps the account sync document and start date", () => {
  const old = model.emptyStore("2026-08-31");
  old.days[days[0].iso] = model.completePlanDay(days[0], model.normalizeDayLog());
  old.dietDays[days[0].iso] = { completed: true, meals: { breakfast: true } };
  old.metrics[days[0].iso] = weight(80);
  old.settings.calorieMode = "lower";
  const fresh = model.resetProgress(old, "2026-10-05", new Date("2026-10-03T20:00:00Z"));
  assert.deepEqual(fresh.days, {});
  assert.deepEqual(fresh.dietDays, {});
  assert.deepEqual(fresh.metrics, {});
  assert.equal(fresh.settings.calorieMode, "calculated");
  assert.equal(fresh.program.startedOn, "2026-10-05");
  assert.notEqual(fresh.program.resetId, old.program.resetId);
  assert.equal(model.normalizeStore(fresh).program.resetId, fresh.program.resetId);
  assert.equal(Object.keys(model.reconcilePastTracking(model.buildPlanDays(fresh.program.startedOn), fresh, "2026-10-03").days).length, 0);
  assert.equal(Object.keys(old.days).length, 1, "reset doesn't mutate the input");
});

test("reset beats stale devices, initial sign-in merges and in-flight old responses", () => {
  const baseline = model.emptyStore("2026-08-31");
  baseline.metrics[days[0].iso] = weight(80);
  const oldEdited = structuredClone(baseline);
  oldEdited.days[days[0].iso] = model.completePlanDay(days[0], model.normalizeDayLog());
  const fresh = model.resetProgress(baseline, "2026-10-05");
  assert.deepEqual(mergeProgressChanges(baseline, oldEdited, fresh), fresh);
  assert.deepEqual(mergeProgressChanges(baseline, fresh, oldEdited), fresh);
  assert.deepEqual(model.chooseInitialSyncedStore(oldEdited, fresh, { localUpdatedAt: "2099-01-01" }), fresh);
  const editedAfterReset = structuredClone(fresh);
  editedAfterReset.metrics["2026-10-05"] = weight(79);
  assert.deepEqual(mergeProgressChanges(baseline, editedAfterReset, oldEdited), editedAfterReset);
  assert.deepEqual(mergeProgressChanges(fresh, editedAfterReset, oldEdited), editedAfterReset, "old software cannot roll back an accepted reset");
  const receivedReset = mergeProgressChanges(baseline, oldEdited, fresh);
  assert.deepEqual(mergeProgressChanges(fresh, receivedReset, fresh), fresh);
});

test("two offline resets converge and ordinary post-reset device edits still merge", () => {
  const base = model.emptyStore("2026-08-31");
  const earlier = model.resetProgress(base, "2026-10-03", new Date("2026-10-03T10:00:00Z"));
  const later = model.resetProgress(base, "2026-10-04", new Date("2026-10-03T11:00:00Z"));
  assert.deepEqual(mergeProgressChanges(base, earlier, later), later);
  assert.deepEqual(mergeProgressChanges(base, later, earlier), later);
  const left = structuredClone(later);
  const right = structuredClone(later);
  left.metrics["2026-10-04"] = weight(78);
  right.days["2026-10-05"] = model.normalizeDayLog();
  right.days["2026-10-05"].notes = "New session";
  const merged = mergeProgressChanges(later, left, right);
  assert.equal(merged.metrics["2026-10-04"].weightKg, "78");
  assert.equal(merged.days["2026-10-05"].notes, "New session");
});

test("legacy account migration keeps history and its original dates", () => {
  const legacy = { days: { "2026-09-04": model.normalizeDayLog() }, dietDays: {}, metrics: { "2026-09-04": weight(80) }, settings: { calorieMode: "lower" } };
  const upgraded = model.normalizeStore(legacy);
  assert.equal(upgraded.program.startedOn, "2026-08-31");
  assert.equal(upgraded.program.resetId, "initial");
  assert.equal(upgraded.metrics["2026-09-04"].weightKg, "80");
  assert.equal(upgraded.settings.calorieMode, "lower");
});
