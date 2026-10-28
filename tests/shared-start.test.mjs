import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileSharedStart } from "../src/features/momentum/sharedStart.ts";
import {
  mergeMomentum,
  normalizeMomentum,
} from "../src/features/momentum/storage.ts";
import { currentJourney, makeJourney } from "../src/features/momentum/plan.ts";
import { earnedLevel } from "../src/features/momentum/coaching.ts";
import { emptyMomentum, newLog } from "../src/features/momentum/types.ts";

const program = {
  startedOn: "2026-10-29",
  resetId: "shared-reset-a",
  resetAt: "2026-10-26T18:00:00.000Z",
};
const fixture = () => {
  const data = emptyMomentum();
  const j = makeJourney("2026-10-05", "previous", "2026-10-04T18:00:00.000Z");
  j.logs["day-1"] = {
    ...newLog(),
    outcome: "planned",
    note: "Keep my history",
    sets: { "leg-press": { weight: "40", reps: "8", done: true } },
  };
  j.adaptations["2"] = { mode: "two-sets", reason: "Previous progression" };
  j.pauses.old = { from: "2026-10-24", reason: "personal" };
  data.onboarded = true;
  data.activeJourneyId = j.id;
  data.journeys[j.id] = j;
  data.meals["2026-10-29"] = { eaten: { breakfast: true }, swaps: {} };
  data.preparation["previous"] = true;
  return data;
};

test("one shared reset creates Week 1 on the exact date and archives private history", () => {
  const data = fixture(),
    before = structuredClone(data);
  const next = reconcileSharedStart(data, program);
  const j = currentJourney(next);
  assert.equal(j.id, `program-${program.resetId}`);
  assert.equal(j.startedOn, program.startedOn);
  assert.equal(j.slots["day-1"].date, program.startedOn);
  assert.equal(Object.keys(j.slots).length, 90);
  assert.deepEqual(j.logs, {});
  assert.deepEqual(j.adaptations, {});
  assert.deepEqual(j.pauses, {});
  assert.equal(earnedLevel(next, "2027-03-01"), 0);
  assert.deepEqual(next.journeys.previous.logs, before.journeys.previous.logs);
  assert.deepEqual(next.journeys.previous.archivedMeals, before.meals);
  assert.deepEqual(
    next.journeys.previous.archivedPreparation,
    before.preparation,
  );
  assert.deepEqual(next.meals, {});
  assert.deepEqual(next.preparation, {});
  assert.equal(next.profile.gymId, before.profile.gymId);
  assert.equal(next.profile.nextClassDate, "");
  assert.equal(j.planVersion, "home-trial-90");
  assert.deepEqual(data, before, "never mutate the old private record");
});

test("retries, reloads and two devices reuse one deterministic journey without clearing new records", () => {
  const a = reconcileSharedStart(fixture(), program);
  const b = reconcileSharedStart(fixture(), structuredClone(program));
  assert.equal(a.activeJourneyId, b.activeJourneyId);
  a.journeys[a.activeJourneyId].logs["day-1"] = {
    ...newLog(),
    note: "New journey note",
  };
  a.meals[program.startedOn] = { swaps: {}, eaten: { lunch: true } };
  assert.equal(reconcileSharedStart(a, program), a);
  const loaded = normalizeMomentum(JSON.parse(JSON.stringify(a)));
  assert.equal(reconcileSharedStart(loaded, program), loaded);
  assert.equal(currentJourney(loaded).logs["day-1"].note, "New journey note");
  assert.equal(loaded.meals[program.startedOn].eaten.lunch, true);
});

test("initial adoption is not an unrequested reset; a newer unapplied reset repairs legacy state", () => {
  const initial = {
    startedOn: "2026-08-31",
    resetId: "initial",
    resetAt: null,
  };
  const data = fixture();
  assert.equal(reconcileSharedStart(data, initial), data);
  const earlier = { ...program, resetAt: "2026-10-01T18:00:00.000Z" };
  const adopted = reconcileSharedStart(data, earlier);
  assert.equal(adopted.activeJourneyId, "previous");
  assert.deepEqual(adopted.journeys.previous, data.journeys.previous);
  assert.equal(
    reconcileSharedStart(data, program).activeJourneyId,
    `program-${program.resetId}`,
  );
  const unopened = emptyMomentum();
  assert.equal(reconcileSharedStart(unopened, program).activeJourneyId, null);
});

test("a reset arriving after its chosen date keeps that date instead of moving to today", () => {
  const delayed = {
    ...program,
    startedOn: "2026-10-20",
    resetAt: "2026-10-19T18:00:00.000Z",
  };
  const next = reconcileSharedStart(fixture(), delayed);
  assert.equal(currentJourney(next).startedOn, "2026-10-20");
  assert.equal(next.profile.nextClassDate, "");
});

test("stale private saves cannot revive the old active journey or old eaten checks", () => {
  const base = fixture(),
    fresh = reconcileSharedStart(base, program),
    stale = structuredClone(base);
  stale.journeys.previous.logs["day-1"].note =
    "Saved just before another device reset";
  stale.meals["2026-10-29"].eaten.lunch = true;
  for (const [local, remote] of [
    [fresh, stale],
    [stale, fresh],
  ]) {
    const merged = mergeMomentum(base, local, remote);
    assert.equal(merged.activeJourneyId, fresh.activeJourneyId);
    assert.deepEqual(merged.meals, {});
    assert.deepEqual(currentJourney(merged).logs, {});
    assert.equal(
      merged.journeys.previous.logs["day-1"].note,
      stale.journeys.previous.logs["day-1"].note,
    );
  }
});

test("competing resets converge on the newest generation without deleting either archive", () => {
  const base = fixture(),
    a = reconcileSharedStart(base, program);
  const second = {
    startedOn: "2026-11-03",
    resetId: "shared-reset-b",
    resetAt: "2026-10-26T19:00:00.000Z",
  };
  const b = reconcileSharedStart(base, second);
  for (const [local, remote] of [
    [a, b],
    [b, a],
  ]) {
    const merged = mergeMomentum(base, local, remote);
    assert.equal(currentJourney(merged).startedOn, second.startedOn);
    assert.ok(merged.journeys[a.activeJourneyId]);
    assert.ok(merged.journeys[b.activeJourneyId]);
    assert.equal(reconcileSharedStart(merged, program), merged);
  }
});
