import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const app = await server.ssrLoadModule("/src/App.tsx");
const ui = await server.ssrLoadModule("/src/components/LoadGuidance.tsx");
const start = "2026-10-05";
function fixture() {
  const store = app.emptyStore(start);
  store.coaching = {
    version: 1,
    homeFrom: start,
    legacyImported: true,
    choices: {},
  };
  const days = app.coachPlanDays(
    app.buildPlanDays(start),
    store.coaching,
    {},
    "2026-10-08",
  );
  const lifts = days.filter((day) => day.session.type === "strength");
  const exercise = app.exerciseMap["machine-chest-press"];
  for (const day of lifts.slice(0, 2))
    store.days[day.iso] = app.normalizeDayLog({
      sessionSnapshot: day.session,
      exercises: {
        [exercise.id]: Array.from({ length: 2 }, () => ({
          weight: "50",
          reps: "12",
          done: true,
          effort: "about-right",
        })),
      },
    });
  const today = lifts[1];
  const advise = () =>
    app.moveLoadGuidance(
      days,
      store,
      app.withTrainingWeek(today, 1),
      exercise,
      0,
      exercise,
      today.iso,
    );
  return { store, days, lifts, today, exercise, advise };
}

test("the second finished home attempt immediately earns next-workout advice, not more weight today", () => {
  const { store, lifts, advise } = fixture();
  const before = JSON.stringify(store);
  const advice = advise();
  assert.equal(advice.nextWorkout, true);
  assert.equal(advice.date, lifts[2].iso);
  assert.equal(advice.recommendation.action.kind, "increase");
  assert.match(advice.recommendation.action.instruction, /50 lb/);
  assert.match(advice.recommendation.action.instruction, /Start at 8 reps/);
  assert.match(advice.recommendation.action.instruction, /small increment/);
  assert.equal(
    JSON.stringify(store),
    before,
    "advice must never write heavier weights",
  );
});

test("Undo, unfinished work, missing feedback, lower reps and skipped attempts cannot earn a jump", () => {
  for (const patch of [
    { done: false },
    { reps: "" },
    { reps: "10" },
    { effort: undefined },
    { effort: "very-hard" },
    { weight: "60" },
  ]) {
    const { store, today, exercise, advise } = fixture();
    Object.assign(store.days[today.iso].exercises[exercise.id][1], patch);
    assert.notEqual(
      advise().recommendation.action?.kind,
      "increase",
      JSON.stringify(patch),
    );
  }
  const { store, today, exercise, advise } = fixture();
  store.days[today.iso].skips[exercise.id] = "time";
  assert.notEqual(advise().recommendation.action?.kind, "increase");
});

test("first qualifying attempt asks for confirmation; missing data gives an explicit recording step", () => {
  const { store, lifts, today, exercise, advise } = fixture();
  delete store.days[lifts[0].iso];
  assert.equal(advise().recommendation.action.kind, "confirm");
  store.days[today.iso].exercises[exercise.id][0].reps = "";
  assert.equal(advise().recommendation.action.kind, "reps");
  assert.match(
    advise().recommendation.action.instruction,
    /pounds, reps and set feel/,
  );
});

test("unlocking a third set takes priority over adding pounds", () => {
  const { store, days, lifts, exercise } = fixture();
  store.days = {};
  for (const day of lifts.slice(0, 8)) {
    store.days[day.iso] = app.completePlanDay(
      app.withTrainingWeek(day, app.earnedTrainingWeekForDay(days, store, day)),
      app.normalizeDayLog(),
    );
    store.days[day.iso].exercises[exercise.id] = Array.from(
      { length: 2 },
      () => ({ weight: "50", reps: "12", done: true, effort: "about-right" }),
    );
  }
  const day = app.withTrainingWeek(lifts[7], 4);
  const advice = app.moveLoadGuidance(
    days,
    store,
    day,
    exercise,
    0,
    exercise,
    day.iso,
  );
  assert.equal(advice.nextWorkout, true);
  assert.equal(advice.recommendation.action.kind, "new-set");
  assert.match(advice.recommendation.action.instruction, /all 3 planned sets/);
});

test("readiness, stale attempts and future phantom performance cannot earn an increase", () => {
  const { store, lifts, today, exercise, advise } = fixture();
  store.days[lifts[2].iso] = app.normalizeDayLog({
    readiness: { energy: "low" },
    exercises: {
      [exercise.id]: [
        { weight: "500", reps: "30", done: true, effort: "too-easy" },
      ],
    },
  });
  assert.equal(advise().recommendation.label, "No increase today");
  store.days[lifts[2].iso].readiness = {};
  delete store.days[today.iso].exercises[exercise.id][1].effort;
  assert.notEqual(advise().recommendation.action?.kind, "increase");
  const stale = fixture();
  for (const day of stale.lifts.slice(2, 10))
    stale.store.days[day.iso] = app.normalizeDayLog({ daySkipReason: "time" });
  assert.equal(stale.advise().recommendation.label, "Return gently");
});

test("a future swap, bodyweight work, warm-up and past review do not inherit next-attempt advice", () => {
  const { store, days, lifts, today, exercise, advise } = fixture();
  for (const day of lifts.slice(2))
    store.days[day.iso] = app.normalizeDayLog({
      swaps: { [exercise.id]: "incline-push-up" },
    });
  assert.equal(advise().nextWorkout, false);
  for (const id of ["wall-sit", "warmup-ramp-home-machine-press"]) {
    const move = app.exerciseMap[id];
    assert.equal(
      app.moveLoadGuidance(days, store, today, move, 0, move, today.iso)
        .nextWorkout,
      false,
    );
  }
  assert.equal(
    app.moveLoadGuidance(
      days,
      store,
      today,
      exercise,
      0,
      exercise,
      lifts[2].iso,
    ).nextWorkout,
    false,
  );
});

test("guidance renders an explicit next-workout scope and no automatic dialog or weight command", () => {
  const guidance = fixture().advise();
  const html = renderToString(
    createElement(ui.LoadGuidance, { guidance, dateLabel: "Mon, Oct 12" }),
  );
  assert.match(html, /Next workout load guidance/);
  assert.match(html, /Next workout/);
  assert.match(html, /Why this recommendation/);
  assert.doesNotMatch(html, /role="dialog"|autofocus|<input|<button/);
});
