import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyMomentum, newLog } from "../src/features/momentum/types.ts";
import {
  addDays,
  calendarWeekOf,
  dayPlan,
  legacyPlan,
  makeJourney,
  rescheduleClass,
  sortedSlots,
  starterPlan,
  repeatWeek,
  structured,
  strengthTemplates,
  suggestedStart,
  weekday,
  weekOf,
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
  exerciseGate,
  startJourneyAllowed,
} from "../src/features/momentum/safety.ts";
import {
  mergeMomentum,
  normalizeMomentum,
} from "../src/features/momentum/storage.ts";

function fixture(version = "titan-90", start = "2026-10-26") {
  const data = emptyMomentum(),
    j = makeJourney(start, "synthetic-titan", undefined, version);
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
function assertStructuredSpacing(j) {
  const sessions = sortedSlots(j).filter((s) => structured(dayPlan(j, s).activity));
  for (let i = 1; i < sessions.length; i++)
    assert.ok(
      Date.parse(`${sessions[i].date}T12:00Z`) -
        Date.parse(`${sessions[i - 1].date}T12:00Z`) >= 48 * 3600000,
      `${sessions[i - 1].date} and ${sessions[i].date}`,
    );
}
for (let offset = 0; offset < 7; offset++) {
  const start = addDays("2026-10-26", offset);
  test(`Titan start ${start} keeps 90 actual dates and weekday appointments`, () => {
    const { data, j } = fixture("titan-90", start),
      slots = sortedSlots(j),
      end = addDays(start, 89),
      activities = [
        "review",
        "strength-a",
        "walk",
        "boxing",
        "recovery",
        "walk",
        "strength-b",
      ];
    assert.equal(j.startedOn, start);
    assert.equal(suggestedStart(start), start);
    assert.equal(startJourneyAllowed(data, start, start), true);
    assert.equal(slots.length, 90);
    assert.equal(new Set(slots.map((s) => s.date)).size, 90);
    assert.deepEqual(
      slots.map((s) => s.date),
      Array.from({ length: 90 }, (_, i) => addDays(start, i)),
    );
    assert.deepEqual(
      slots.map((s) => s.day),
      Array.from({ length: 90 }, (_, i) => i + 1),
    );
    assert.equal(slots[0].date, start);
    assert.equal(slots.at(-1).date, end);
    assert.deepEqual(
      slots.filter((s) => calendarWeekOf(j, s) === 1).map((s) => s.date),
      Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    );
    for (const slot of slots) {
      const plan = dayPlan(j, slot),
        resolved = resolveDay(data, slot, addDays(end, 365)),
        reflection = offset === 0 && slot.day === 90;
      assert.equal(slot.templateDay === undefined, offset === 0);
      if (offset !== 0)
        assert.ok(
          Number.isInteger(slot.templateDay) &&
          slot.templateDay >= 1 && slot.templateDay < 90,
        );
      assert.equal(plan.day, slot.day);
      assert.equal(calendarWeekOf(j, slot), weekOf(slot.day));
      assert.equal(
        plan.activity,
        reflection ? "review" : activities[weekday(slot.date)],
        slot.date,
      );
      assert.equal(resolved.day, slot.day);
      assert.equal(resolved.setsPerExercise, 1);
      assert.equal(
        resolved.activity,
        plan.activity === "strength-b" ? "recovery" : plan.activity,
      );
      if (plan.activity === "boxing") {
        assert.equal(weekday(slot.date), 3);
        assert.equal(resolved.minutes, "10-20");
        assert.match(resolved.title, /Introduction/);
      }
    }
    assert.equal(earnedLevel(data, addDays(end, 365)), 0);
    const classes = slots.filter((s) => dayPlan(j, s).activity === "boxing");
    assert.equal(classes[0].date, firstWednesday(start));
    assert.deepEqual(
      classes.map((s) => s.date),
      slots.filter((s) => weekday(s.date) === 3).map((s) => s.date),
    );
    assert.ok(classes.every((s) => s.date >= start && s.date <= end));
    // Include optional B as well as A/classes, not just the default resolved dose.
    assertStructuredSpacing(j);
    assert.deepEqual(j.logs, {});
    const restored = normalizeMomentum(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(restored.journeys[j.id].slots, j.slots);

    const repeated = repeatWeek(j, "2026-11-08", start, `start-${offset}`),
      copies = sortedSlots(repeated).filter((s) => s.id.startsWith("repeat-"));
    assert.equal(Object.keys(repeated.slots).length, 97);
    assert.equal(new Set(sortedSlots(repeated).map((s) => s.date)).size, 97);
    assert.equal(copies.length, 7);
    for (const slot of Object.values(repeated.slots)) {
      const source = j.slots[`day-${slot.day}`];
      assert.equal(slot.templateDay, source.templateDay);
      assert.deepEqual(dayPlan(repeated, slot), dayPlan(j, source));
      if (!slot.id.startsWith("repeat-"))
        assert.equal(
          slot.date,
          source.date > "2026-11-08" ? addDays(source.date, 7) : source.date,
        );
    }
    assertStructuredSpacing(repeated);
  });
}
test("A Wednesday on day 90 is still a Titan class, not a reflection replacement", () => {
  const { j } = fixture("titan-90", "2026-10-30"),
    slot = j.slots["day-90"];
  assert.equal(weekday(slot.date), 3);
  assert.equal(slot.templateDay, 87);
  assert.equal(dayPlan(j, slot).day, 90);
  assert.equal(dayPlan(j, slot).activity, "boxing");
});
test("Moved Titan classes retain their prescription rather than adopting Monday's strength", () => {
  for (const start of ["2026-10-26", "2026-10-29"]) {
    const { j } = fixture("titan-90", start),
      slot = sortedSlots(j).find((s) => dayPlan(j, s).activity === "boxing"),
      target = addDays(slot.date, -2),
      monday = sortedSlots(j).find((s) => s.date === target);
    assert.throws(() => rescheduleClass(j, slot.id, target, start), /workout/);
    // A walking replacement makes room for a confirmed alternate class.
    monday.templateDay = 2;
    j.logs[slot.id] = { ...newLog(), booked: true };
    const saved = structuredClone(j),
      prescription = dayPlan(j, slot),
      moved = rescheduleClass(j, slot.id, target, start);
    assert.equal(moved.slots[slot.id].date, target);
    assert.equal(moved.slots[slot.id].templateDay, slot.templateDay);
    assert.deepEqual(dayPlan(moved, moved.slots[slot.id]), prescription);
    assert.equal(dayPlan(moved, moved.slots[slot.id]).activity, "boxing");
    assert.equal(moved.slots[monday.id].date, slot.date);
    assert.equal(dayPlan(moved, moved.slots[monday.id]).activity, "walk");
    assert.equal(moved.logs[slot.id].booked, false);
    assertStructuredSpacing(moved);
    assert.deepEqual(j, saved);
  }
});
test("Monday Titan and saved legacy prescriptions stay unchanged, including day 90", () => {
  const { j } = fixture();
  for (const slot of sortedSlots(j))
    assert.deepEqual(dayPlan(j, slot), starterPlan[slot.day - 1]);
  assert.equal(dayPlan(j, j.slots["day-90"]).title, "Your 90-day reflection");
  const { j: legacy } = fixture("legacy-30");
  good(legacy, legacy.slots["day-3"]);
  const saved = structuredClone(legacy);
  assert.equal(Object.keys(legacy.slots).length, 30);
  for (const slot of sortedSlots(legacy)) {
    assert.deepEqual(dayPlan(legacy, slot), legacyPlan[slot.day - 1]);
    assert.deepEqual(
      dayPlan(j, { ...slot, legacy: true, templateDay: 1 }),
      legacyPlan[slot.day - 1],
    );
    assert.deepEqual(dayPlan(undefined, slot), legacyPlan[slot.day - 1]);
  }
  assert.deepEqual(legacy, saved);
  assert.throws(
    () => makeJourney("2026-10-29", "legacy", undefined, "legacy-30"),
    /Monday/,
  );
});
test("Start safety accepts today or a future Thursday and rejects past/invalid dates", () => {
  const data = emptyMomentum();
  assert.equal(startJourneyAllowed(data, "2026-10-29", "2026-10-29"), true);
  assert.equal(startJourneyAllowed(data, "2026-10-29", "2026-10-26"), true);
  assert.equal(startJourneyAllowed(data, "2026-10-22", "2026-10-26"), false);
  assert.match(exerciseGate(data, "2026-10-29"), /start date/);
  for (const invalid of [
    "", "invalid", "2026-2-03", "2026-02-29", "2026-02-30", "2026-10-32",
  ]) {
    assert.equal(startJourneyAllowed(data, invalid, "2026-01-01"), false, invalid);
    assert.throws(() => makeJourney(invalid, "invalid"), /valid start date/);
  }
  const { data: future, j } = fixture("titan-90", "2026-10-29");
  assert.equal(j.slots["day-1"].date, "2026-10-29");
  assert.match(exerciseGate(future, "2026-10-28"), /Preparation until 2026-10-29/);
  assert.equal(exerciseGate(future, "2026-10-29"), null);
  assert.equal(makeJourney("2028-02-29", "leap-year").startedOn, "2028-02-29");
});
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
