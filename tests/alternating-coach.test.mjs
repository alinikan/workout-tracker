import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import {
  alternatingChoice,
  cancelPendingAlternatingSwitch,
  coachActivity,
  emptyCoaching,
  pendingAlternatingSwitch,
  saveCoachChoice,
} from "../src/features/coaching/plan.ts";
import { addDays } from "../src/features/momentum/plan.ts";
import { mergeProgressChanges } from "../src/lib/syncMerge.ts";

const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const app = await server.ssrLoadModule("/src/App.tsx");
const start = "2026-10-28",
  anchor = "2026-11-21";
const choice = {
  mode: "home",
  date: "",
  time: "",
  weekdays: [],
  minutes: 60,
  stage: "introduction",
};
const rhythm = { kind: "every-other-day", anchor };
function fixture(effective = anchor) {
  const original = app.emptyStore(start);
  original.coaching = {
    version: 1,
    homeFrom: start,
    legacyImported: true,
    choices: {},
  };
  const store = structuredClone(original);
  store.coaching = saveCoachChoice(
    store.coaching,
    { ...choice, rhythm },
    effective,
    start,
    `${effective}T19:00:00Z`,
  );
  const project = (today = effective, state = store) =>
    app.coachPlanDays(
      app.buildPlanDays(start, today),
      state.coaching,
      state.days,
      today,
    );
  return { original, store, project };
}
function record(day, weight = "30") {
  const log = app.completePlanDay(day, app.normalizeDayLog());
  for (const [id, rows] of Object.entries(log.exercises)) {
    if (["warmup", "cardio"].includes(app.exerciseMap[id].family)) continue;
    for (const row of rows)
      Object.assign(row, { weight, reps: "12", effort: "about-right" });
  }
  return { ...log, sessionSnapshot: day.session };
}

test("November 21 starts a 3/4-day-per-week rhythm that continues beyond six months", () => {
  const { project } = fixture();
  const dates = project("2027-11-21").filter((day) => day.iso >= anchor);
  assert.ok(dates.length >= 365);
  for (const [i, day] of dates.entries()) {
    assert.equal(
      day.session.type,
      i % 2 === 0 ? "strength" : "recovery",
      day.iso,
    );
    if (i % 2 === 0) assert.equal(day.session.code, i % 4 === 0 ? "HA" : "HB");
    else assert.ok(app.isRestDay(day));
  }
});

test("saving a dated cadence never resets or rewrites workouts, meals or weights", () => {
  const { original, store, project } = fixture();
  const old = project(anchor, original).find((day) => day.iso === "2026-11-18");
  store.days[old.iso] = record(old);
  store.metrics[old.iso] = { weightKg: "81" };
  store.dietDays[old.iso] = { meals: { lunch: true }, notes: "Saved food" };
  original.days = structuredClone(store.days);
  const before = JSON.stringify(store);
  const newDays = project();
  assert.deepEqual(
    newDays.filter((day) => day.iso < anchor),
    project(anchor, original).filter((day) => day.iso < anchor),
  );
  assert.equal(JSON.stringify(store), before);
  assert.deepEqual(store.program, original.program);
  assert.equal(
    newDays.find((day) => day.iso === anchor).session.connected
      .alternatingStage,
    1,
  );
  const normalized = app.normalizeStore(JSON.parse(before));
  assert.deepEqual(normalized.coaching, store.coaching);
  assert.deepEqual(normalized.days[old.iso].sessionSnapshot, old.session);
  const merged = mergeProgressChanges(original, store, {
    ...original,
    dietDays: store.dietDays,
    metrics: store.metrics,
  });
  assert.deepEqual(merged.coaching, store.coaching);
  assert.deepEqual(merged.dietDays, store.dietDays);
  assert.deepEqual(merged.metrics, store.metrics);
});

test("a later save retains the November 21 rhythm without writing it into past dates", () => {
  const effective = "2026-11-22";
  const { project, original } = fixture(effective);
  const days = project();
  assert.deepEqual(
    days.find((d) => d.iso === anchor),
    project(effective, original).find((d) => d.iso === anchor),
  );
  assert.equal(days.find((d) => d.iso === effective).session.type, "recovery");
  assert.equal(days.find((d) => d.iso === "2026-11-23").session.code, "HB");
});

const scheduleFor = (state, day, authored = anchor, clock = "19:00") =>
  saveCoachChoice(
    state,
    { ...choice, rhythm: { kind: "every-other-day", anchor: day } },
    authored,
    start,
    `${authored}T${clock}:00Z`,
  );

test("a deferred switch preserves a current training and class schedule until the chosen date", () => {
  const from = "2026-11-28",
    trial = "2026-11-25";
  const { original, project } = fixture();
  original.coaching = saveCoachChoice(
    original.coaching,
    { ...choice, mode: "trial", date: trial },
    anchor,
    start,
    `${anchor}T17:00:00Z`,
  );
  const queued = {
    ...original,
    coaching: scheduleFor(original.coaching, from),
  };
  const before = project(anchor, original),
    after = project(anchor, queued);
  assert.deepEqual(
    after.filter((d) => d.iso < from),
    before.filter((d) => d.iso < from),
  );
  assert.equal(
    after.find((d) => d.iso === trial).session.connected.kind,
    "trial",
  );
  assert.equal(
    app.fuelForProjectedDay(after.find((d) => d.iso === trial)),
    true,
  );
  assert.equal(
    pendingAlternatingSwitch(queued.coaching, anchor).effectiveOn,
    from,
  );
  assert.equal(
    after.find((d) => d.iso === from).session.connected.alternatingStage,
    1,
  );
  assert.equal(
    after.find((d) => d.iso === "2026-11-29").session.type,
    "recovery",
  );
  assert.equal(pendingAlternatingSwitch(queued.coaching, from), undefined);
});

test("rescheduling an active rhythm leaves it running until the new date", () => {
  const from = "2026-11-28";
  const { store, project } = fixture();
  const authored = "2026-11-24";
  const queued = {
    ...store,
    coaching: scheduleFor(store.coaching, from, authored),
  };
  assert.deepEqual(
    project(authored, queued).filter((d) => d.iso < from),
    project(authored).filter((d) => d.iso < from),
  );
  assert.equal(alternatingChoice(queued.coaching, authored).anchor, anchor);
  assert.equal(alternatingChoice(queued.coaching, from).anchor, from);
});

test("rescheduling and cancellation survive a merge without changing legacy milestones", () => {
  const base = app.emptyStore(start);
  const from = "2026-11-28",
    later = "2026-12-02";
  const old = { ...base, coaching: scheduleFor(emptyCoaching(), from) };
  const replacement = { ...base, coaching: scheduleFor(old.coaching, later) };
  const concurrent = {
    ...base,
    coaching: scheduleFor(emptyCoaching(), later, anchor, "20:00"),
  };
  for (const updated of [replacement, concurrent]) {
    const merged = app.normalizeStore(mergeProgressChanges(base, updated, old));
    assert.equal(
      pendingAlternatingSwitch(merged.coaching, anchor).effectiveOn,
      later,
    );
    assert.equal(alternatingChoice(merged.coaching, from), null);
    const before = app.buildPlanDays(start, anchor);
    const after = app.coachPlanDays(
      before,
      merged.coaching,
      merged.days,
      anchor,
    );
    assert.equal(
      app.trainingProgressFor(after, merged, anchor).target,
      app.trainingProgressFor(before, base, anchor).target,
    );
    merged.coaching = cancelPendingAlternatingSwitch(merged.coaching, anchor);
    const canceled = app.normalizeStore(
      mergeProgressChanges(base, merged, old),
    );
    assert.equal(
      pendingAlternatingSwitch(canceled.coaching, anchor),
      undefined,
    );
    assert.deepEqual(
      app.coachPlanDays(before, canceled.coaching, canceled.days, anchor),
      before,
    );
  }
});

test("Start Fresh clears both active and scheduled cadence and restores twice-weekly training", () => {
  const { store } = fixture();
  const newStart = "2026-11-25";
  const switchOn = "2026-12-02";
  store.coaching = scheduleFor(store.coaching, switchOn, "2026-11-23");
  assert.equal(alternatingChoice(store.coaching, newStart).anchor, anchor);
  assert.equal(pendingAlternatingSwitch(store.coaching, newStart).effectiveOn, switchOn);

  const reset = app.resetProgress(store, newStart, new Date(`${newStart}T19:00:00Z`));
  assert.notEqual(reset.program.resetId, store.program.resetId);
  assert.equal(pendingAlternatingSwitch(reset.coaching, newStart), undefined);
  assert.equal(alternatingChoice(reset.coaching, switchOn), null);
  const days = app.coachPlanDays(
    app.buildPlanDays(newStart, newStart), reset.coaching, reset.days, newStart,
  );
  for (const offset of [0, 7, 28]) {
    assert.equal(days.slice(offset, offset + 7).filter((day) => day.session.type === "strength").length, 2);
  }
});

test("6/12/20 real qualifying logs unlock the staged sets, reps and hinge; old targets are frozen", () => {
  const { store, project } = fixture();
  const initial = project().find((day) => day.iso === anchor);
  const press = app.exerciseMap["machine-chest-press"],
    row = app.exerciseMap["single-arm-row"];
  for (let i = 0; i <= 21; i++) {
    const date = addDays(anchor, i * 2);
    const day = project(date).find((day) => day.iso === date);
    assert.equal(
      day.session.connected.alternatingStage,
      i >= 20 ? 4 : i >= 12 ? 3 : i >= 6 ? 2 : 1,
      date,
    );
    assert.equal(
      app.recommendedSets(day, press, 0),
      i >= 20 ? 3 : i >= 6 ? 2 : 1,
    );
    assert.equal(
      app.recommendedSets(day, row, 0),
      i >= 20 ? 3 : i >= 6 ? 2 : 1,
    );
    if (i === 20)
      assert.equal(
        app.smartLoadSuggestion(project(date), store, day, press, 0).action
          .kind,
        "new-set",
      );
    assert.equal(app.recommendedSets(day, press, 0, "yellow"), 1);
    assert.equal(
      day.session.exerciseIds.includes("db-rdl"),
      i >= 12 && i % 2 === 1,
    );
    if (i >= 12)
      assert.match(
        app.targetForExercise(day, app.exerciseMap["dead-bug"]),
        /^6-8/,
      );
    store.days[date] = record(day);
  }
  const after = project(addDays(anchor, 45)).find((day) => day.iso === anchor);
  assert.deepEqual(after.session, initial.session);
  assert.equal(
    app.trainingProgressFor(
      project(addDays(anchor, 45)),
      store,
      addDays(anchor, 45),
    ).credits,
    22,
  );
  const next = addDays(anchor, 44),
    days = project(next);
  assert.equal(
    app.smartLoadSuggestion(
      days,
      store,
      days.find((d) => d.iso === next),
      press,
      0,
    ).action.kind,
    "increase",
  );
});

test("skips, bare completion, hard efforts, reduced days and future records cannot rush an unlock", () => {
  for (const scenario of ["bare", "hard", "skip", "yellow", "future"]) {
    const { store, project } = fixture();
    for (let i = 0; i < 6; i++) {
      const date = addDays(anchor, i * 2);
      const day = project(date).find((d) => d.iso === date);
      const log =
        scenario === "bare"
          ? app.completePlanDay(day, app.normalizeDayLog())
          : record(day);
      if (scenario === "hard")
        log.exercises["machine-chest-press"][0].effort = "very-hard";
      if (scenario === "skip") log.daySkipReason = "time";
      if (scenario === "yellow") log.readiness = { energy: "low" };
      store.days[date] = { ...log, sessionSnapshot: day.session };
    }
    const next = addDays(anchor, 12);
    assert.equal(
      project(scenario === "future" ? anchor : next).find((d) => d.iso === next)
        .session.connected.alternatingStage,
      1,
      scenario,
    );
  }
  const { store, project } = fixture();
  for (let i = 0; i < 6; i++) {
    const date = addDays(anchor, i * 2);
    store.days[date] = record(project(date).find((d) => d.iso === date));
  }
  const back = addDays(anchor, 32);
  assert.equal(
    project(back).find((d) => d.iso === back).session.connected
      .alternatingStage,
    1,
  );
  assert.equal(Object.keys(store.days).length, 6);
});

test("class buffers and a recently logged lift take priority; no makeup changes the rhythm", () => {
  const { store, original, project } = fixture();
  const twoDaysBefore = project(anchor, original).find(
    (d) => d.iso === addDays(anchor, -2),
  );
  const yesterday = addDays(anchor, -1);
  store.days[yesterday] = record({
    ...twoDaysBefore,
    iso: yesterday,
    session: project().find((d) => d.iso === anchor).session,
  });
  assert.equal(
    project().find((d) => d.iso === anchor).session.title,
    "Recovery after recorded training",
  );
  assert.equal(
    project(addDays(anchor, 1)).find((d) => d.iso === anchor).session.type,
    "recovery",
  );
  const date = addDays(anchor, 4);
  store.coaching = saveCoachChoice(
    store.coaching,
    { ...choice, mode: "trial", date },
    anchor,
    start,
    `${anchor}T20:00:00Z`,
  );
  assert.equal(coachActivity(store.coaching, start, date).activity, "class");
  for (const offset of [-1, 1])
    assert.equal(
      coachActivity(store.coaching, start, addDays(date, offset)).activity,
      "recovery",
    );
  assert.equal(
    coachActivity(store.coaching, start, addDays(date, 2)).activity,
    "strength-b",
  );
});

test("uncooked meal fuel tracks real lifting, recovery and skips, not just the day label", () => {
  const { project } = fixture();
  const [lift, rest] = project().filter((d) => d.iso >= anchor);
  assert.equal(app.fuelForProjectedDay(lift), true);
  assert.equal(app.fuelForProjectedDay(rest), false);
  assert.equal(app.fuelForProjectedDay(lift, { daySkipReason: "time" }), false);
  assert.equal(
    app.fuelForProjectedDay(lift, {
      readiness: { energy: "low", sleep: "poor" },
      exercises: { "warmup-treadmill-walk": [{ done: true }] },
    }),
    false,
  );
  assert.equal(
    app.fuelForProjectedDay(lift, { ...record(lift), daySkipReason: "time" }),
    true,
  );
});
