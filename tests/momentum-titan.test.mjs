import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyMomentum, newLog } from "../src/features/momentum/types.ts";
import {
  addDays,
  calendarWeekOf,
  dayPlan,
  makeJourney,
  starterPlan,
  repeatWeek,
  strengthTemplates,
} from "../src/features/momentum/plan.ts";
import {
  classFor,
  firstWednesday,
  membershipEstimate,
  passCashCost,
  upgradeTitan,
} from "../src/features/momentum/titan.ts";
import {
  completionError,
  earnedLevel,
  resolveDay,
} from "../src/features/momentum/coaching.ts";
import { sessionSets } from "../src/features/momentum/flow.ts";
import {
  mergeMomentum,
  normalizeMomentum,
} from "../src/features/momentum/storage.ts";

function fixture(version = "titan-90") {
  const data = emptyMomentum(),
    j = makeJourney("2026-10-26", "synthetic-titan", undefined, version);
  data.activeJourneyId = j.id;
  data.journeys[j.id] = j;
  data.onboarded = true;
  return { data, j };
}
function good(j, slot) {
  const activity = dayPlan(j, slot).activity;
  j.logs[slot.id] = {
    ...newLog(),
    outcome: "planned",
    performedOn: slot.date,
    plannedActivity: activity,
    effort: "easy",
    recovery: "good",
    comfortable: true,
    minutes: "20",
    sets: activity.startsWith("strength")
      ? Object.fromEntries(
          strengthTemplates[activity].map((e) => [
            e.id,
            { weight: "10", reps: "8", done: true },
          ]),
        )
      : {},
  };
}
test("Titan has 90 initial dates, thirteen Wednesdays and no automatic class promotion", () => {
  const { data, j } = fixture();
  assert.equal(starterPlan.length, 90);
  assert.equal(Object.keys(j.slots).length, 90);
  assert.equal(j.slots["day-90"].date, "2027-01-23");
  assert.equal(firstWednesday(j.startedOn), "2026-10-28");
  assert.equal(starterPlan.filter((p) => p.activity === "boxing").length, 13);
  for (let i = 0; i < 90; i += 7)
    assert.equal(starterPlan[i].activity, "strength-a");
  assert.match(classFor(data, "2027-01-20").name, /Introduction/);
  data.profile.classStage = "beginner";
  data.profile.classSwitchDate = "2026-12-02";
  assert.match(classFor(data, "2026-11-25").name, /Introduction/);
  assert.match(classFor(data, "2026-12-02").name, /Beginners/);
  assert.match(classFor(data, "2026-12-02").room, /#1/);
});
test("Calendar passage alone never unlocks B, extra sets or longer active class dose", () => {
  const { data, j } = fixture();
  j.adaptations["1"] = { mode: "two-sets", reason: "synthetic forged choice" };
  for (const slot of Object.values(j.slots)) {
    const plan = resolveDay(data, slot, "2027-01-23");
    assert.equal(plan.setsPerExercise, 1);
    if (slot.day % 7 === 6 && slot.day !== 90)
      assert.equal(plan.activity, "recovery");
    if (dayPlan(j, slot).activity === "boxing")
      assert.equal(plan.minutes, "10-20");
  }
  assert.equal(earnedLevel(data, "2027-01-23"), 0);
});
test("Real comfortable attendance earns an option, never silently changes workload", () => {
  const { data, j } = fixture();
  Object.values(j.slots)
    .filter(
      (s) =>
        ["strength-a", "boxing"].includes(dayPlan(j, s).activity) &&
        s.day <= 24,
    )
    .forEach((s) => good(j, s));
  const date = "2026-11-21",
    saturday = j.slots["day-27"];
  assert.equal(earnedLevel(data, date), 1);
  assert.equal(resolveDay(data, saturday, date).activity, "recovery");
  j.adaptations["4"] = { mode: "second-session", reason: "explicit choice" };
  assert.equal(resolveDay(data, saturday, date).activity, "strength-b");
  j.logs["day-24"].recovery = "poor";
  assert.equal(earnedLevel(data, date), 0);
  assert.equal(resolveDay(data, saturday, date).activity, "recovery");
});
test("Two-set completion validates every actual required set; missing work is not filled", () => {
  const { data, j } = fixture();
  Object.values(j.slots)
    .filter(
      (s) =>
        s.day <= 52 &&
        ["strength-a", "strength-b", "boxing"].includes(dayPlan(j, s).activity),
    )
    .forEach((s) => good(j, s));
  const slot = j.slots["day-57"],
    date = slot.date;
  assert.equal(earnedLevel(data, date), 2);
  j.adaptations["9"] = { mode: "two-sets", reason: "explicit choice" };
  const plan = resolveDay(data, slot, date);
  assert.equal(plan.setsPerExercise, 2);
  assert.equal(sessionSets(plan.exerciseIds, undefined, 2).length, 8);
  good(j, slot);
  assert.match(
    completionError(data, slot, j.logs[slot.id], "planned", date),
    /unfinished/,
  );
  for (const id of plan.exerciseIds)
    j.logs[slot.id].sets[`${id}-2`] = { weight: "10", reps: "8", done: true };
  assert.equal(
    completionError(data, slot, j.logs[slot.id], "planned", date),
    null,
  );
  j.logs[slot.id].plannedSets = 2;
  assert.equal(
    resolveDay(data, slot, addDays(date, 60)).setsPerExercise,
    2,
    "saved prescription survives later loss of progression eligibility",
  );
});
test("Upgrade keeps old history, meals, weights-independent data and partially worked slots", () => {
  const { data, j } = fixture("legacy-30");
  good(j, j.slots["day-3"]);
  j.logs["day-15"] = {
    ...newLog(),
    sets: { "leg-press": { weight: "10", reps: "4", done: false } },
  };
  data.meals["2026-10-28"] = {
    swaps: { dinner: "synthetic-dinner" },
    eaten: { dinner: true },
  };
  const copy = structuredClone(data),
    result = upgradeTitan(data, "2026-11-01");
  const updated = result.journeys[j.id];
  assert.equal(updated.planVersion, "titan-90");
  assert.equal(Object.keys(updated.slots).length, 90);
  assert.deepEqual(updated.logs, copy.journeys[j.id].logs);
  assert.deepEqual(result.meals, copy.meals);
  assert.equal(updated.slots["day-3"].legacy, true);
  assert.equal(dayPlan(updated, updated.slots["day-3"]).activity, "strength-a");
  assert.equal(updated.slots["day-15"].legacy, true);
  assert.equal(dayPlan(updated, updated.slots["day-10"]).activity, "boxing");
  assert.deepEqual(upgradeTitan(result, "2026-11-02"), result);
  assert.deepEqual(normalizeMomentum(result).journeys, result.journeys);
  const local = structuredClone(copy);
  local.journeys[j.id].logs["day-3"].note = "independent old-device edit";
  const merged = mergeMomentum(copy, local, result);
  assert.equal(merged.journeys[j.id].planVersion, "titan-90");
  assert.equal(
    merged.journeys[j.id].logs["day-3"].note,
    "independent old-device edit",
  );
  assert.equal(Object.keys(merged.journeys[j.id].slots).length, 90);
});
test("Membership math keeps upfront cash, unused credits and billing thresholds honest", () => {
  assert.equal(membershipEstimate(4).creditValue, 120);
  assert.equal(membershipEstimate(5).creditValue, 150);
  assert.equal(membershipEstimate(7).equal, true);
  assert.equal(membershipEstimate(8).cheaper, "monthly");
  assert.equal(passCashCost(12), 400);
  assert.equal(passCashCost(0), 0);
  assert.equal(passCashCost(10), 300);
  assert.equal(passCashCost(16), 600);
  assert.equal(membershipEstimate(NaN).visits, 0);
});

test("Missing recovery, observed visits, partial lifts, stale practice and recent skips never earn an increase", () => {
  for (const change of ["recovery", "observed", "partial", "stale", "missed"]) {
    const { data, j } = fixture();
    Object.values(j.slots)
      .filter(
        (s) =>
          ["strength-a", "boxing"].includes(dayPlan(j, s).activity) &&
          s.day <= 24,
      )
      .forEach((s) => good(j, s));
    if (change === "recovery")
      Object.values(j.logs).forEach((l) => {
        l.recovery = "";
      });
    if (change === "observed")
      Object.values(j.logs)
        .filter((l) => l.plannedActivity === "boxing")
        .forEach((l) => {
          l.observed = true;
        });
    if (change === "partial")
      Object.values(j.logs)
        .filter((l) => l.plannedActivity === "strength-a")
        .forEach((l) => {
          l.plannedExerciseIds = ["leg-press"];
          l.sets = { "leg-press": l.sets["leg-press"] };
        });
    if (change === "missed")
      for (const id of ["day-17", "day-22"])
        j.logs[id] = { ...newLog(), outcome: "missed" };
    assert.equal(
      earnedLevel(data, change === "stale" ? "2027-01-23" : "2026-11-21"),
      0,
      change,
    );
  }
});

test("Repeating extends the calendar without putting fourteen rows into one displayed week", () => {
  const { j } = fixture();
  const repeated = repeatWeek(
    j,
    "2026-11-01",
    "2026-10-26",
    "synthetic-repeat",
  );
  assert.equal(Object.keys(repeated.slots).length, 97);
  assert.equal(
    Object.values(repeated.slots).filter(
      (s) => calendarWeekOf(repeated, s) === 2,
    ).length,
    7,
  );
  assert.equal(
    Object.values(repeated.slots).filter(
      (s) => calendarWeekOf(repeated, s) === 3,
    ).length,
    7,
  );
  assert.equal(repeated.slots["day-8"].date, "2026-11-09");
});
