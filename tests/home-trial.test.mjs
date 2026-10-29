import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { emptyMomentum, newLog } from "../src/features/momentum/types.ts";
import {
  addDays,
  currentJourney,
  dayPlan,
  makeJourney,
  movementsFor,
  sortedSlots,
} from "../src/features/momentum/plan.ts";
import {
  adoptHomePlan,
  chooseTrial,
  makeHomeJourney,
  trialAdjustment,
  trialFor,
  trialFuel,
} from "../src/features/momentum/trial.ts";
import { resolveDay } from "../src/features/momentum/coaching.ts";
import {
  mergeMomentum,
  normalizeMomentum,
} from "../src/features/momentum/storage.ts";
import { reconcileSharedStart } from "../src/features/momentum/sharedStart.ts";
import { prepBatch, prepServing } from "../src/features/mealPrep/plan.ts";
import { prepRecipeMap } from "../src/features/mealPrep/recipes.ts";

const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const app = await server.ssrLoadModule("/src/App.tsx");
const start = "2026-10-28",
  now = "2026-10-28T18:00:00Z";
const fixture = (date = start) => {
  const d = emptyMomentum(),
    j = makeHomeJourney(date, "home", now);
  d.activeJourneyId = j.id;
  d.journeys[j.id] = j;
  d.onboarded = true;
  return d;
};
const planOn = (d, date) =>
  resolveDay(
    d,
    sortedSlots(currentJourney(d)).find((s) => s.date === date),
    date,
  );

test("home quad correction preserves actual machine history while future sessions use bodyweight", () => {
  const d = fixture(),
    j = currentJourney(d),
    slots = sortedSlots(j).filter((s) =>
      dayPlan(j, s).activity.startsWith("strength"),
    ),
    s = slots[0];
  const activity = dayPlan(j, s).activity;
  const oldIds = movementsFor(j, activity, s).map((e) =>
    e.id === "wall-sit" ? "seated-leg-extension" : e.id,
  );
  j.logs[s.id] = {
    ...newLog(),
    outcome: "planned",
    plannedActivity: activity,
    plannedExerciseIds: oldIds,
    plannedSets: 2,
    sets: { "seated-leg-extension": { done: true, weight: "20", reps: "10" } },
  };
  const before = structuredClone(j.logs[s.id]);
  assert.ok(
    resolveDay(d, s, s.date).exerciseIds.includes("seated-leg-extension"),
  );
  assert.ok(
    !resolveDay(d, s, s.date).exerciseIds.includes("mi6-leg-extension"),
  );
  assert.ok(planOn(d, slots[1].date).exerciseIds.includes("reverse-nordic"));
  assert.deepEqual(j.logs[s.id], before);
});

test("home sessions order upstairs quad practice before walking, then equipment warm-ups and lifting", () => {
  const d = fixture(), j = currentJourney(d);
  const days = app.connectedPlanDays(app.buildPlanDays(j.startedOn), d, {}, j.startedOn);
  for (const day of days.filter(day => day.session.connected?.kind === "home")) {
    const moves = app.scheduledExercisesForDay(day);
    const treadmill = moves.findIndex(e => e.id === "warmup-treadmill-walk");
    const pressRamp = moves.findIndex(e => e.id === "warmup-ramp-home-machine-press");
    const press = moves.findIndex(e => e.id === "machine-chest-press");
    assert.equal(app.locationGuideForExercise(app.exerciseMap["warmup-ramp-home-machine-press"]).type, "downstairs");
    assert.ok(treadmill >= 0 && pressRamp > treadmill && press > pressRamp);
    assert.ok(moves.slice(0, treadmill).every(e => app.locationGuideForExercise(e).type === "upstairs"));
    assert.ok(!moves.some(e => ["mi6-leg-extension", "mi6-seated-row"].includes(e.id)));
  }
});

test("bodyweight quad alternatives have distinct verified videos and do not request pounds", () => {
  for (const [id, type, video] of [["wall-sit", "seconds", "RG7z0P9qrLk"], ["reverse-nordic", "reps", "PvJDjcfZe1c"]]) {
    const e = app.exerciseMap[id];
    assert.equal(e.logType, type);
    assert.equal(e.youtubeId, video);
    assert.ok(e.cues.length >= 4 && e.avoid.length >= 2);
  }
  assert.notEqual(app.exerciseMap["single-arm-row"].youtubeId, app.exerciseMap["seated-cable-row"].youtubeId);
  assert.equal(app.exerciseMap["single-arm-row"].youtubeId, "pYcpY20QaE8");
});

test("the home cable warm-up follows the no-machine swap without asking for a weight", () => {
  const log = app.normalizeDayLog({
    swaps: { "mi6-leg-extension": "seated-quad-extension" },
  });
  const ramp = app.activeExerciseFor(
    app.exerciseMap["warmup-ramp-home-cable-extension"],
    log,
  );
  assert.equal(ramp.id, "warmup-ramp-home-cable-extension");
  assert.equal(ramp.logType, "reps");
  assert.equal(
    ramp.youtubeId,
    app.exerciseMap["seated-quad-extension"].youtubeId,
  );
  assert.match(ramp.name, /Warm-Up/);
  for (const id of [
    "machine-chest-press",
    "mi6-seated-row",
    "mi6-cable-curl",
    "mi6-bar-pressdown",
    "mi6-leg-extension",
  ]) {
    const options = app.swapOptionsFor(app.exerciseMap[id]);
    assert.ok(options.length, id);
    assert.ok(
      options.every((e) => e.youtubeId && e.cues.length && e.resources.length),
      id,
    );
  }
});

for (let offset = 0; offset < 7; offset++)
  test(`home start weekday ${offset}: Day 1 lift, two weekly lifts, no assumed class`, () => {
    const d = fixture(addDays(start, offset)),
      j = currentJourney(d),
      slots = sortedSlots(j);
    assert.equal(slots.length, 90);
    assert.equal(dayPlan(j, slots[0]).activity, "strength-a");
    assert.equal(dayPlan(j, slots[3]).activity, "strength-b");
    assert.equal(
      slots.filter((s) => resolveDay(d, s, s.date).activity === "boxing")
        .length,
      0,
    );
    assert.equal(
      slots
        .slice(0, 14)
        .filter((s) => resolveDay(d, s, s.date).activity.startsWith("strength"))
        .length,
      4,
    );
    for (const s of slots.filter((s) =>
      dayPlan(j, s).activity.startsWith("strength"),
    )) {
      const p = resolveDay(d, s, s.date);
      assert.equal(p.setsPerExercise, 2);
      assert.ok(p.exerciseIds.includes("machine-chest-press"));
      assert.ok(p.exerciseIds.includes("single-arm-row"));
      assert.ok(!p.exerciseIds.includes("mi6-seated-row"));
      assert.ok(!p.exerciseIds.includes("leg-press"));
      for (const id of p.exerciseIds)
        assert.ok(
          app.exerciseMap[id]?.youtubeId &&
            app.exerciseMap[id]?.resources.length,
          id,
        );
    }
  });

test("every possible trial day replaces rather than adds work and keeps adjacent days light", () => {
  for (let n = 0; n < 21; n++) {
    const d = chooseTrial(fixture(), addDays(start, n), "", start, now),
      j = currentJourney(d);
    const boxing = sortedSlots(j).filter(
      (s) => resolveDay(d, s, start).activity === "boxing",
    );
    assert.equal(boxing.length, 1);
    assert.equal(boxing[0].date, addDays(start, n));
    const p = resolveDay(d, boxing[0], start);
    assert.deepEqual(p.exerciseIds, []);
    for (const s of sortedSlots(j).filter(
      (s) =>
        Math.abs(Date.parse(s.date) - Date.parse(boxing[0].date)) === 86400000,
    ))
      assert.ok(!resolveDay(d, s, start).activity.startsWith("strength"));
  }
});

test("move, clear, reload and conflicting offline edits preserve a single atomic trial", () => {
  const base = chooseTrial(fixture(), "2026-11-03", "19:30", start, now);
  const moved = chooseTrial(
    base,
    "2026-11-05",
    "08:00",
    start,
    "2026-10-28T19:00:00Z",
  );
  assert.notEqual(planOn(moved, "2026-11-03").activity, "boxing");
  assert.equal(planOn(moved, "2026-11-05").activity, "boxing");
  const cleared = chooseTrial(base, null, "", start, "2026-10-28T20:00:00Z");
  for (const [a, b] of [
    [moved, cleared],
    [cleared, moved],
  ]) {
    const merged = normalizeMomentum(
      JSON.parse(JSON.stringify(mergeMomentum(base, a, b))),
    );
    assert.equal(trialFor(merged), null);
    assert.equal(currentJourney(merged).trial.time, "");
    assert.deepEqual(
      sortedSlots(currentJourney(merged)).map(
        (s) => planOn(merged, s.date).activity,
      ),
      sortedSlots(currentJourney(fixture())).map(
        (s) => planOn(fixture(), s.date).activity,
      ),
    );
  }
});

test("migration cancels automatic upcoming classes without resetting real history or food", () => {
  const d = emptyMomentum(),
    j = makeJourney("2026-10-26", "old", "2026-10-24T18:00:00Z");
  d.onboarded = true;
  d.activeJourneyId = j.id;
  d.journeys[j.id] = j;
  j.logs["day-1"] = {
    ...newLog(),
    outcome: "modified",
    plannedActivity: "strength-a",
    note: "Keep this",
  };
  j.logs["day-3"] = { ...newLog(), booked: true };
  d.meals[start] = { swaps: {}, eaten: { breakfast: true } };
  const saved = structuredClone(d),
    next = adoptHomePlan(d, start);
  assert.equal(next.activeJourneyId, d.activeJourneyId);
  assert.equal(currentJourney(next).startedOn, j.startedOn);
  assert.deepEqual(next.meals, d.meals);
  assert.deepEqual(currentJourney(next).logs["day-1"], j.logs["day-1"]);
  assert.equal(currentJourney(next).logs["day-3"].booked, false);
  assert.equal(trialFor(next), null);
  assert.notEqual(planOn(next, start).activity, "boxing");
  assert.equal(adoptHomePlan(next, start), next);
  assert.deepEqual(d, saved);
});

test("recorded and partial sessions cannot be moved or repurposed by trial selection", () => {
  const d = fixture(),
    j = currentJourney(d);
  j.logs["day-1"] = {
    ...newLog(),
    plannedActivity: "strength-a",
    sets: { "machine-chest-press": { reps: "8", weight: "20", done: true } },
  };
  assert.throws(
    () => chooseTrial(d, start, "18:15", start),
    /already work recorded/,
  );
  const next = chooseTrial(d, addDays(start, 1), "", start);
  assert.equal(planOn(next, start).activity, "strength-a");
  const attended = chooseTrial(fixture(), addDays(start, 2), "18:15", start);
  currentJourney(attended).logs["day-3"] = {
    ...newLog(),
    plannedActivity: "boxing",
    outcome: "modified",
    minutes: "10",
  };
  assert.throws(
    () => chooseTrial(attended, null, "", start),
    /activity record/,
  );
});

test("input validation rejects past/outside dates and bad times; missed trial may be rescheduled", () => {
  for (const date of ["2026-02-30", "bad", "2026-10-27", "2028-01-01"])
    assert.throws(
      () => chooseTrial(fixture(), date, "", start),
      /Choose today/,
    );
  assert.throws(
    () => chooseTrial(fixture(), start, "25:00", start),
    /valid class time/,
  );
  let d = chooseTrial(fixture(), start, "", start);
  currentJourney(d).logs["day-1"] = {
    ...newLog(),
    outcome: "missed",
    plannedActivity: "boxing",
  };
  d = chooseTrial(d, "2026-11-02", "09:00", start);
  assert.equal(
    planOn(d, start).activity,
    "boxing",
    "history retains what was missed",
  );
  assert.equal(trialFor(d).date, "2026-11-02");
});

test("Today/Gym/Week and nutrition use the exact private schedule, with historical snapshots preserved", () => {
  const d = chooseTrial(fixture(), "2026-11-04", "18:30", start),
    store = app.emptyStore(start);
  const days = app.connectedPlanDays(
    app.buildPlanDays(start),
    d,
    store.days,
    start,
  );
  const trial = days.find((day) => day.iso === "2026-11-04");
  assert.equal(trial.session.connected.kind, "trial");
  assert.deepEqual(trial.session.exerciseIds, ["muay-thai-trial"]);
  const first = days[0],
    exercises = app.scheduledExercisesForDay(first);
  assert.equal(exercises.length, 9);
  assert.ok(exercises.some((e) => e.id === "wall-sit"));
  assert.ok(!exercises.some((e) => e.id === "seated-leg-extension"));
  assert.equal(
    app.recommendedSets(first, app.exerciseMap["machine-chest-press"], 0),
    2,
  );
  assert.match(
    app.targetForExercise(first, app.exerciseMap["mi6-cable-curl"]),
    /10-12/,
  );
  store.days[first.iso] = {
    ...app.completePlanDay(first, app.normalizeDayLog()),
    sessionSnapshot: first.session,
  };
  const changed = chooseTrial(d, "2026-11-05", "", start);
  assert.deepEqual(
    app.connectedPlanDays(
      app.buildPlanDays(start),
      changed,
      store.days,
      start,
    )[0].session,
    first.session,
  );
  const progress = app.trainingProgressFor(days, store, start);
  assert.equal(progress.sessions, 2);
  assert.equal(progress.target, 52);
  assert.equal(progress.credits, 1);
});

test("trial meals keep protein, fuel the chosen date, leave recipes alone and do not rewrite prepared food", () => {
  const d = chooseTrial(fixture(), "2026-11-03", "", start),
    recipe = prepRecipeMap["prep-chicken-breast-rice"];
  const rest = prepServing(recipe, { training: false, weightKg: 80 });
  const training = prepServing(recipe, { training: true, weightKg: 80 });
  assert.ok(training.calories > rest.calories);
  assert.ok(training.protein >= rest.protein);
  assert.equal(trialFuel(d, "2026-11-02"), null);
  assert.match(trialFuel(d, "2026-11-03").detail, /3-4 hours/);
  const state = app.emptyStore(start).mealPrep;
  const context = (date) => ({
    training:
      planOn(d, date).activity === "boxing" ||
      planOn(d, date).activity.startsWith("strength"),
    weightKg: 80,
  });
  const batch = prepBatch(state, "2026-11-03", context);
  assert.ok(
    batch.servings
      .filter((row) => row.date === "2026-11-03")
      .every((row) => row.serving.ingredients.length > 0),
  );
});

test("Start Fresh uses home on the exact start date and does not carry a trial into the new journey", () => {
  const d = chooseTrial(fixture(), "2026-11-03", "18:15", start, now);
  const p = {
    resetId: "new-home-start",
    resetAt: "2026-10-29T20:00:00Z",
    startedOn: "2026-10-30",
  };
  const next = reconcileSharedStart(d, p);
  assert.equal(currentJourney(next).startedOn, p.startedOn);
  assert.equal(trialFor(next), null);
  assert.equal(planOn(next, p.startedOn).activity, "strength-a");
  assert.equal(d.journeys.home.trial.date, "2026-11-03");
});

test("trial fueling labels follow a confirmed morning versus evening visit", () => {
  const morning = chooseTrial(fixture(), "2026-11-03", "08:00", start, now);
  const evening = chooseTrial(fixture(), "2026-11-03", "19:30", start, now);
  assert.match(
    trialFuel(morning, "2026-11-03").timings.lunch,
    /after the morning trial/,
  );
  assert.match(trialFuel(evening, "2026-11-03").timings.snack, /before trial/);
  currentJourney(morning).trial.time = "bad-time";
  assert.equal(trialFor(morning), null);
});

test("malformed historical session snapshots are ignored without discarding activity", () => {
  for (const connected of [
    { kind: "bad", sets: 2, targets: {} },
    { kind: "home", sets: "2", targets: {} },
    { kind: "home", sets: 2, targets: { wrong: {} } },
  ]) {
    const log = app.normalizeDayLog({
      sessionSnapshot: {
        title: "Bad",
        code: "HA",
        type: "strength",
        time: "25 minutes",
        summary: "",
        accent: "strength-a",
        tasks: [],
        exerciseIds: [],
        connected,
      },
      notes: "Keep my record",
    });
    assert.equal(log.sessionSnapshot, undefined);
    assert.equal(log.notes, "Keep my record");
  }
});
