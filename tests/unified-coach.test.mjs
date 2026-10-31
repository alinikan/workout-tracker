import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import {
  emptyCoaching,
  normalizeCoaching,
  saveCoachChoice,
  coachActivity,
  classFuel,
  classOn,
  walkingMinutes,
  choiceForDate,
} from "../src/features/coaching/plan.ts";
import { addDays } from "../src/features/momentum/plan.ts";
import { makeHomeJourney } from "../src/features/momentum/trial.ts";
import { emptyMomentum, newLog } from "../src/features/momentum/types.ts";
import { mergeProgressChanges } from "../src/lib/syncMerge.ts";
const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const app = await server.ssrLoadModule("/src/App.tsx");
const start = "2026-10-28";
const input = (mode = "home", extra = {}) => ({
  mode,
  date: mode === "home" ? "" : "2026-11-04",
  time: "18:15",
  weekdays: mode === "regular" ? [1, 3] : [],
  minutes: 60,
  stage: "introduction",
  ...extra,
});
const choose = (state, value, today = start) =>
  saveCoachChoice(state, value, today, start, `${today}T20:00:00Z`);
const projected = (state, logs = {}, today = start) =>
  app.coachPlanDays(app.buildPlanDays(start, "2027-10-28"), state, logs, today);

test("home plan grows beyond six calendar months and never schedules a class by default", () => {
  const state = choose(emptyCoaching(), input());
  const days = projected(state);
  assert.ok(days.length > 365);
  for (let n = 0; n < 52; n++) {
    const week = days.slice(n * 7, n * 7 + 7);
    assert.equal(week.filter((d) => d.session.type === "strength").length, 2);
    assert.equal(
      week.filter(
        (d) =>
          d.session.connected.kind === "class" ||
          d.session.connected.kind === "trial",
      ).length,
      0,
    );
  }
});

test("every trial weekday replaces work and buffers adjacent dates without inventing attendance", () => {
  for (let n = 0; n < 21; n++) {
    const date = addDays(start, n),
      state = choose(emptyCoaching(), input("trial", { date }));
    const days = projected(state);
    assert.equal(
      days.filter((d) => d.session.connected.kind === "trial").length,
      1,
    );
    assert.deepEqual(days.find((d) => d.iso === date).session.exerciseIds, [
      "muay-thai-trial",
    ]);
    for (const adjacent of [addDays(date, -1), addDays(date, 1)].filter(
      (d) => d >= start,
    ))
      assert.equal(
        days.find((d) => d.iso === adjacent).session.type,
        "recovery",
      );
    assert.equal(
      app.trainingProgressFor(days, app.emptyStore(start), addDays(start, 181))
        .credits,
      0,
    );
  }
});

test("all valid recurring weekday combinations respect class buffers and at most two home lifts", () => {
  for (let offset = 0; offset < 7; offset++)
    for (let a = 0; a < 7; a++)
      for (const b of [
        null,
        ...Array.from({ length: 7 }, (_, n) => n).filter(
          (n) => n > a && ![1, 6].includes(n - a),
        ),
      ]) {
        const initial = addDays(start, offset);
        const state = saveCoachChoice(
          emptyCoaching(),
          input("regular", {
            date: initial,
            weekdays: b === null ? [a] : [a, b],
          }),
          initial,
          initial,
        );
        for (let week = 0; week < 8; week++) {
          let lifts = 0,
            classes = 0;
          for (let n = 0; n < 7; n++) {
            const date = addDays(initial, week * 7 + n),
              p = coachActivity(state, initial, date);
            if (p.activity === "class") classes++;
            if (p.activity.startsWith("strength")) {
              lifts++;
              for (const delta of [-1, 0, 1])
                assert.equal(classOn(state, addDays(date, delta)), null);
            }
          }
          assert.ok(lifts <= 2);
          assert.equal(classes, b === null ? 1 : 2);
        }
      }
});

test("schedule changes are date-effective, cancel safely and converge across offline devices", () => {
  const base = choose(emptyCoaching(), input("trial"));
  const before = coachActivity(base, start, start);
  const moved = choose(
    base,
    input("trial", { date: "2026-11-06" }),
    "2026-10-29",
  );
  const cancelled = choose(base, input(), "2026-10-30");
  for (const [a, b] of [
    [moved, cancelled],
    [cancelled, moved],
  ]) {
    const merged = normalizeCoaching(mergeProgressChanges(base, a, b));
    assert.equal(classOn(merged, "2026-11-04"), null);
    assert.equal(classOn(merged, "2026-11-06"), null);
    assert.deepEqual(coachActivity(merged, start, start), before);
  }
  assert.deepEqual(normalizeCoaching(JSON.parse(JSON.stringify(moved))), moved);
  const first = Object.values(base.choices)[0];
  const zoned = {
    ...base,
    choices: {
      a: { ...first, id: "a", updatedAt: "2026-10-28T21:00:00+01:00" },
      b: { ...first, id: "b", updatedAt: "2026-10-28T20:30:00Z" },
    },
  };
  assert.equal(
    choiceForDate(zoned, start).id,
    "b",
    "timestamp ordering uses instants, not timezone text",
  );
});

test("invalid dates, consecutive classes and malformed persisted choices are rejected", () => {
  for (const value of [
    input("trial", { date: "2026-02-30" }),
    input("trial", { date: "2026-10-27" }),
    input("regular", { weekdays: [0, 6] }),
    input("regular", { weekdays: [1, 2] }),
    input("regular", { weekdays: [] }),
    input("regular", { weekdays: [1, 3, 5] }),
    input("trial", { time: "25:00" }),
    input("trial", { minutes: 0 }),
  ])
    assert.throws(() => choose(emptyCoaching(), value));
  assert.deepEqual(
    normalizeCoaching({ version: 1, choices: { broken: { mode: "regular" } } })
      .choices,
    {},
  );
});

test("recorded shared workouts survive changes; Coach progression reads Today completion only", () => {
  const store = app.emptyStore(start),
    state = choose(emptyCoaching(), input());
  const days = projected(state),
    first = days[0];
  store.coaching = state;
  store.days[start] = {
    ...app.completePlanDay(first, app.normalizeDayLog()),
    sessionSnapshot: first.session,
  };
  const next = choose(state, input("trial", { date: start }));
  const after = projected(next, store.days);
  assert.deepEqual(after[0].session, first.session);
  assert.equal(app.trainingProgressFor(after, store, start).credits, 1);
  assert.equal(app.earnedTrainingWeekForDay(after, store, after[3]), 1);
});

test("strength volume increases only after eight completed home lifts, not eight skipped lifts", () => {
  const store = app.emptyStore(start),
    state = choose(emptyCoaching(), input()),
    days = projected(state);
  const lifts = days.filter((d) => d.session.type === "strength"),
    press = app.exerciseMap["machine-chest-press"];
  for (const day of lifts.slice(0, 8))
    store.days[day.iso] = app.completePlanDay(
      app.withTrainingWeek(day, app.earnedTrainingWeekForDay(days, store, day)),
      app.normalizeDayLog(),
    );
  const earned = app.earnedTrainingWeekForDay(days, store, lifts[8]);
  assert.equal(earned, 5);
  assert.equal(
    app.recommendedSets(app.withTrainingWeek(lifts[8], earned), press, 0),
    3,
  );
  assert.equal(
    app.recommendedSets(
      app.withTrainingWeek(lifts[8], earned),
      press,
      0,
      "yellow",
    ),
    1,
  );
  const skipped = app.emptyStore(start);
  for (const day of lifts.slice(0, 8))
    skipped.days[day.iso] = app.skipPlanDay(day, app.normalizeDayLog(), "time");
  assert.equal(app.earnedTrainingWeekForDay(days, skipped, lifts[8]), 1);
  assert.equal(
    app.recommendedSets(app.withTrainingWeek(lifts[8], 1), press, 0),
    2,
  );
});

test("rest rollover repairs old skipped rest days and never earns lift credit", () => {
  const store = app.emptyStore(start),
    days = projected(choose(emptyCoaching(), input()));
  const rest = days.find((d) => app.isRestDay(d));
  store.days[rest.iso] = {
    ...app.normalizeDayLog(),
    daySkipReason: "forgotten",
    notes: "Keep this",
  };
  const next = app.reconcilePastTracking(days, store, addDays(rest.iso, 1));
  assert.equal(next.days[rest.iso].completed, true);
  assert.equal(next.days[rest.iso].daySkipReason, undefined);
  assert.equal(next.days[rest.iso].notes, "Keep this");
  assert.equal(
    app.trainingProgressFor(days, next, addDays(rest.iso, 1)).credits,
    0,
  );
  assert.equal(
    app.reconcilePastTracking(days, next, addDays(rest.iso, 1)),
    next,
  );
});

test("legacy import is idempotent, preserves records and unifies meals without double attendance", () => {
  const data = emptyMomentum(),
    j = makeHomeJourney(start, "old", `${start}T18:00Z`);
  data.activeJourneyId = j.id;
  data.journeys[j.id] = j;
  j.logs["day-1"] = {
    ...newLog(),
    plannedActivity: "strength-a",
    outcome: "modified",
    note: "Old note",
    sets: {
      "machine-chest-press": { done: true, reps: "8", weight: "20" },
      "machine-chest-press-2": { done: false, reps: "7", weight: "20" },
    },
  };
  data.meals[start] = {
    swaps: { breakfast: "egg-wrap-orange" },
    eaten: { breakfast: true },
    recipes: { breakfast: "egg-wrap-orange" },
  };
  const original = structuredClone(data),
    store = app.emptyStore(start);
  const migrated = app.importCoachHistory(store, data, start);
  assert.equal(migrated.days[start].exercises["machine-chest-press"].length, 2);
  assert.equal(
    migrated.days[start].exercises["machine-chest-press"][1].done,
    false,
  );
  assert.equal(migrated.days[start].completed, false);
  assert.equal(migrated.dietDays[start].meals.breakfast, true);
  assert.equal(migrated.dietDays[start].swaps.breakfast, "egg-wrap-orange");
  assert.equal(app.importCoachHistory(migrated, data, start), migrated);
  assert.deepEqual(data, original);
  const shared = app.emptyStore(start);
  shared.days[start] = {
    ...app.normalizeDayLog(),
    exercises: {
      "machine-chest-press": [{ weight: "30", reps: "9", done: true }],
    },
  };
  assert.deepEqual(
    app.importCoachHistory(shared, data, start).days[start],
    shared.days[start],
  );
  const fresh = app.resetProgress(migrated, "2026-11-01");
  assert.equal(fresh.coaching.homeFrom, "2026-11-01");
  assert.equal(app.importCoachHistory(fresh, data, "2026-11-01"), fresh);
  assert.deepEqual(fresh.coaching.choices, {});
});

test("class fueling follows real dates and times and has no guidance on a rest day", () => {
  const state = choose(
    emptyCoaching(),
    input("regular", { date: start, weekdays: [3] }),
  );
  assert.ok(classFuel(state, start));
  assert.match(classFuel(state, start).timings.snack, /before class/);
  assert.equal(classFuel(state, addDays(start, 1)), null);
  assert.match(classFuel(state, start).prepared, /Keep your containers/);
});

test("walks grow from completed evidence, with a conservative return after a long break", () => {
  const dates = Array.from({ length: 16 }, (_, n) => addDays(start, n * 2));
  assert.equal(walkingMinutes([], "2027-01-01"), 10);
  assert.equal(walkingMinutes(dates.slice(0, 4), addDays(start, 8)), 15);
  assert.equal(walkingMinutes(dates.slice(0, 8), addDays(start, 16)), 20);
  assert.equal(walkingMinutes(dates, addDays(start, 32)), 30);
  assert.equal(walkingMinutes(dates, "2027-01-01"), 10);
  assert.equal(walkingMinutes([...dates, "2027-01-01"], "2027-01-02"), 10);
});

test("a partial legacy log never becomes a full lift merely because all copied rows are checked", () => {
  const data = emptyMomentum(),
    j = makeHomeJourney(start, "partial");
  data.activeJourneyId = j.id;
  data.journeys[j.id] = j;
  j.logs["day-1"] = {
    ...newLog(),
    plannedActivity: "strength-a",
    outcome: "modified",
    sets: {
      "machine-chest-press": { weight: "20", reps: "8", done: true },
      "machine-chest-press-2": { weight: "20", reps: "8", done: true },
    },
  };
  const store = app.importCoachHistory(app.emptyStore(start), data, start);
  const days = app.coachPlanDays(
    app.connectedPlanDays(app.buildPlanDays(start), data, store.days, start),
    store.coaching,
    store.days,
    start,
  );
  assert.equal(store.days[start].completed, false);
  assert.equal(app.trainingProgressFor(days, store, start).credits, 0);
});
