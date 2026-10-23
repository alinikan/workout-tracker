import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";
import { emptyMomentum, newLog } from "../src/features/momentum/types.ts";
import {
  starterPlan,
  makeJourney,
  firstMondayAfter,
  addDays,
  rescheduleClass,
  repeatWeek,
  strengthTemplates,
  suggestedStart,
} from "../src/features/momentum/plan.ts";
import {
  clearanceValid,
  exerciseGate,
  startJourneyAllowed,
  pauseForSymptoms,
} from "../src/features/momentum/safety.ts";
import {
  resolveDay,
  completionError,
  progressionEligible,
  monthTwo,
  coachNote,
  outcomeLabel,
  attendance,
} from "../src/features/momentum/coaching.ts";
import {
  mergeMomentum,
  cachePrivate,
  readPrivate,
  clearPrivateCache,
} from "../src/features/momentum/storage.ts";
import {
  appointmentUtc,
  calendarText,
} from "../src/features/momentum/calendar.ts";

const assessed = () => ({
  assessed: true,
  assessedOn: "2026-10-23",
  understood: true,
  walk: true,
  strength: true,
  boxing: true,
  progression: true,
  maxMinutes: "",
  restrictions: "",
  recordedAt: "2026-10-23T17:00:00Z",
});
function fixture() {
  const d = emptyMomentum(),
    j = makeJourney("2026-10-26", "synthetic-journey");
  d.clearance = assessed();
  d.activeJourneyId = j.id;
  d.journeys[j.id] = j;
  d.onboarded = true;
  return d;
}
const journey = (d) => d.journeys[d.activeJourneyId];
function recordGood(d, id) {
  const j = journey(d),
    slot = j.slots[id],
    activity = starterPlan[slot.day - 1].activity;
  j.logs[id] = {
    ...newLog(),
    outcome: "planned",
    performedOn: slot.date,
    scheduledFor: slot.date,
    effort: "easy",
    recovery: "good",
    comfortable: true,
    enjoyment: "yes",
    minutes: "12",
    sets: activity.startsWith("strength")
      ? Object.fromEntries(
          strengthTemplates[activity].map((e) => [
            e.id,
            { weight: "5", reps: "8", done: true },
          ]),
        )
      : {},
  };
}

test("Momentum has precisely the requested 30 initial activities and one-set templates", () => {
  assert.equal(starterPlan.length, 30);
  assert.deepEqual(
    starterPlan.map((p) => p.day),
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  assert.deepEqual(
    starterPlan.map((p) => p.activity),
    [
      "walk",
      "walk",
      "strength-a",
      "recovery",
      "boxing",
      "recovery",
      "review",
      "strength-a",
      "walk",
      "recovery",
      "walk",
      "boxing",
      "recovery",
      "review",
      "strength-a",
      "walk",
      "strength-b",
      "recovery",
      "boxing",
      "recovery",
      "review",
      "strength-a",
      "walk",
      "strength-b",
      "recovery",
      "boxing",
      "recovery",
      "review",
      "strength-a",
      "review",
    ],
  );
  assert.equal(strengthTemplates["strength-a"].length, 4);
  assert.equal(strengthTemplates["strength-b"].length, 4);
  for (const p of starterPlan)
    for (const key of ["steps", "task", "enough", "minimum", "minutes"])
      assert.ok(p[key].length);
});
test("Medical gate cannot be bypassed by energy, opening the app, a date change or a partial checkbox", () => {
  const d = emptyMomentum();
  assert.equal(d.activeJourneyId, null);
  assert.ok(exerciseGate(d, "2026-10-26"));
  d.clearance = assessed();
  d.clearance.boxing = false;
  assert.equal(clearanceValid(d.clearance, "2026-10-26"), false);
  assert.equal(startJourneyAllowed(d, "2026-10-26", "2026-10-23"), false);
  assert.ok(exerciseGate(d, "2028-10-26"));
});
test("Start must be an explicitly chosen Monday after assessment; date arithmetic survives DST", () => {
  const d = fixture();
  assert.equal(firstMondayAfter("2026-10-23"), "2026-10-26");
  assert.equal(firstMondayAfter("2026-10-26"), "2026-11-02");
  assert.equal(suggestedStart("2026-10-01", "2026-10-26"), "2026-10-26");
  assert.equal(suggestedStart("2026-10-26", "2026-10-26"), "2026-11-02");
  assert.equal(startJourneyAllowed(d, "2026-10-26", "2026-10-23"), true);
  assert.equal(startJourneyAllowed(d, "2026-10-27", "2026-10-23"), false);
  assert.equal(startJourneyAllowed(d, "2026-10-19", "2026-10-23"), false);
  assert.equal(addDays("2026-10-31", 2), "2026-11-02");
  assert.equal(addDays("2026-03-07", 2), "2026-03-09");
  assert.match(exerciseGate(d, "2026-10-25"), /Preparation/);
});
test("Calendar passage alone never enables B, extra sets, load jumps or longer boxing", () => {
  const d = fixture(),
    j = journey(d);
  for (const today of ["2026-11-11", "2027-11-11"]) {
    assert.equal(resolveDay(d, j.slots["day-17"], today).activity, "recovery");
    assert.equal(resolveDay(d, j.slots["day-24"], today).activity, "recovery");
    assert.equal(progressionEligible(d, today), false);
    assert.equal(resolveDay(d, j.slots["day-26"], today).minutes, "10-20");
  }
  assert.equal(
    resolveDay(d, j.slots["day-15"], "2026-11-09").extraId,
    undefined,
  );
});
test("Progression needs real comfortable strength/class records, review, permission and explicit choice", () => {
  const d = fixture(),
    j = journey(d);
  for (const id of ["day-3", "day-5", "day-8", "day-12"]) recordGood(d, id);
  j.reviews["2"] = { body: "comfortable", manageable: true };
  assert.equal(progressionEligible(d, "2026-11-09"), true);
  assert.equal(
    resolveDay(d, j.slots["day-17"], "2026-11-11").activity,
    "recovery",
  );
  j.adaptations["3"] = { mode: "second-session", reason: "Opted in" };
  assert.equal(
    resolveDay(d, j.slots["day-17"], "2026-11-11").activity,
    "strength-b",
  );
  d.clearance.progression = false;
  assert.equal(
    resolveDay(d, j.slots["day-17"], "2026-11-11").activity,
    "recovery",
  );
});
test("One modified exercise can be participation but cannot falsely complete the whole strength template", () => {
  const d = fixture(),
    s = journey(d).slots["day-3"],
    l = newLog();
  assert.ok(completionError(d, s, l, "planned", s.date));
  l.sets["leg-press"] = { weight: "5", reps: "5", done: true };
  assert.equal(completionError(d, s, l, "modified", s.date), null);
  assert.ok(completionError(d, s, l, "planned", s.date));
  assert.equal(Object.keys(l.sets).length, 1);
});
test("Actual attendance dates are validated and a rest checkmark does not manufacture a workout", () => {
  const d = fixture(),
    j = journey(d),
    s = j.slots["day-1"],
    l = { ...newLog(), minutes: "5", performedOn: "2026-10-27" };
  assert.match(
    completionError(d, s, l, "planned", "2026-10-26"),
    /actual date/,
  );
  l.performedOn = "2026-10-20";
  assert.match(
    completionError(d, s, l, "planned", "2026-10-26"),
    /actual date/,
  );
  j.logs["day-4"] = {
    ...newLog(),
    outcome: "planned",
    plannedActivity: "recovery",
  };
  j.logs["day-17"] = {
    ...newLog(),
    outcome: "planned",
    plannedActivity: "recovery",
  };
  assert.equal(attendance(j, "2026-11-15").length, 0);
});
test("Clinical movement exclusions take precedence without substituting a medical exercise", () => {
  const d = fixture(),
    j = journey(d),
    s = j.slots["day-3"],
    l = newLog();
  d.clearance.avoidExercises = ["leg-press"];
  l.sets["leg-press"] = { weight: "5", reps: "5", done: true };
  assert.ok(completionError(d, s, l, "modified", s.date));
  for (const id of ["incline-db-press", "lat-pulldown", "dead-bug"])
    l.sets[id] = { weight: "", reps: "5", done: true };
  assert.equal(completionError(d, s, l, "planned", s.date), null);
  d.clearance.avoidExercises = strengthTemplates["strength-a"].map((e) => e.id);
  assert.equal(resolveDay(d, s, s.date).activity, "recovery");
});
test("A newer poor recovery outweighs older comfortable walks and classes", () => {
  const d = fixture(),
    j = journey(d);
  for (const id of ["day-1", "day-2", "day-9"]) recordGood(d, id);
  j.logs["day-9"].recovery = "poor";
  assert.equal(
    resolveDay(d, j.slots["day-11"], j.slots["day-11"].date).minutes,
    "5-8",
  );
  assert.match(
    resolveDay(d, j.slots["day-11"], j.slots["day-11"].date).modifiedReason,
    /latest comparable/,
  );
});
test("A lighter week shows just one movement and the clinical time limit overrides the template", () => {
  const d = fixture(),
    j = journey(d),
    s = j.slots["day-3"];
  j.adaptations["1"] = { mode: "lighter", reason: "Fewer demands" };
  assert.deepEqual(resolveDay(d, s, s.date).exerciseIds, ["leg-press"]);
  assert.match(
    resolveDay(d, s, s.date).steps.join(" "),
    /one permitted easy movement/,
  );
  const l = {
    ...newLog(),
    sets: { "leg-press": { weight: "5", reps: "5", done: true } },
  };
  assert.equal(completionError(d, s, l, "planned", s.date), null);
  d.clearance.maxMinutes = "5";
  assert.equal(resolveDay(d, s, s.date).activity, "recovery");
  assert.equal(resolveDay(d, s, s.date).minutes, "0");
  assert.match(resolveDay(d, s, s.date).modifiedReason, /clinical time limit/);
});
test("A medical hold from another journey survives a concurrent new-month merge", () => {
  const base = fixture(),
    remote = pauseForSymptoms(base, "2026-10-28", "medical-from-phone"),
    local = structuredClone(base);
  local.journeys.next = makeJourney("2026-11-30", "next");
  local.activeJourneyId = "next";
  const merged = mergeMomentum(base, local, remote);
  assert.equal(merged.clearance.assessed, false);
  merged.clearance = assessed();
  assert.equal(startJourneyAllowed(merged, "2026-11-30", "2026-10-29"), false);
  assert.ok(exerciseGate(merged, "2026-11-30"));
});
test("Observation is an honest modified boxing visit and missing minutes do not fabricate exercise", () => {
  const d = fixture(),
    s = journey(d).slots["day-5"],
    l = newLog();
  assert.ok(completionError(d, s, l, "modified", s.date));
  l.observed = true;
  assert.equal(completionError(d, s, l, "modified", s.date), null);
  assert.match(completionError(d, s, l, "planned", s.date), /Observation/);
});
test("Medical pause blocks all progression, survives merging and does not become a missed day", () => {
  const d = fixture(),
    paused = pauseForSymptoms(d, "2026-10-28", "pause-test");
  assert.ok(exerciseGate(paused, "2026-11-01"));
  assert.equal(progressionEligible(paused, "2028-11-01"), false);
  assert.equal(
    outcomeLabel(paused, journey(paused).slots["day-4"], "2026-11-01"),
    "Medical pause",
  );
  assert.equal(mergeMomentum(d, d, paused).clearance.assessed, false);
  assert.match(
    monthTwo(
      {
        ...paused,
        journeys: {
          ...paused.journeys,
          [paused.activeJourneyId]: {
            ...journey(paused),
            logs: { "day-3": { ...newLog(), outcome: "medical" } },
          },
        },
      },
      "2026-11-01",
    ),
    /Clinical review/,
  );
});
test("Missed sessions never add compulsory make-up work and restart archives rather than erases", () => {
  const d = fixture(),
    j = journey(d);
  j.logs["day-3"] = { ...newLog(), outcome: "missed", reason: "Work" };
  assert.match(coachNote(d, "2026-10-29"), /workday/);
  assert.equal(Object.keys(j.slots).length, 30);
  const next = makeJourney("2026-11-30", "next");
  d.journeys.next = next;
  d.activeJourneyId = "next";
  assert.equal(d.journeys[j.id].logs["day-3"].outcome, "missed");
});
test("Rescheduling preserves identity/real history, rejects collisions and retains rest spacing", () => {
  const j = journey(fixture());
  const moved = rescheduleClass(j, "day-5", "2026-10-26", "2026-10-23");
  assert.equal(moved.slots["day-5"].date, "2026-10-26");
  assert.equal(moved.slots["day-1"].date, "2026-10-30");
  assert.throws(
    () => rescheduleClass(j, "day-5", "2026-10-29", "2026-10-23"),
    /48 hours/,
  );
  j.logs["day-5"] = {
    ...newLog(),
    outcome: "modified",
    performedOn: "2026-10-31",
  };
  assert.throws(
    () => rescheduleClass(j, "day-5", "2026-10-26", "2026-10-23"),
    /unrecorded/,
  );
  assert.equal(j.logs["day-5"].performedOn, "2026-10-31");
});
test("Repeating a week preserves original IDs and rejects shifting booked future appointments", () => {
  const j = journey(fixture()),
    next = repeatWeek(j, "2026-11-01", "2026-10-30", "repeat-fixture");
  assert.equal(Object.keys(next.slots).length, 37);
  assert.equal(next.slots["day-1"].date, "2026-10-26");
  assert.equal(next.slots["day-8"].date, "2026-11-09");
  j.logs["day-12"] = { ...newLog(), booked: true };
  assert.throws(
    () => repeatWeek(j, "2026-11-01", "2026-10-30", "blocked"),
    /booked/,
  );
});
test("Calendar appointments use real Vancouver DST offsets and contain no private health details", () => {
  assert.equal(appointmentUtc("2026-10-23", "18:00"), "20261024T010000Z");
  assert.equal(appointmentUtc("2026-11-23", "18:00"), "20261124T010000Z");
  assert.equal(appointmentUtc("2025-11-23", "18:00"), "20251124T020000Z");
  assert.throws(() => appointmentUtc("2026-03-08", "02:30"), /does not exist/);
  const text = calendarText("2026-11-23", "18:00", "journey-slot");
  assert.match(text, /SUMMARY:Personal appointment/);
  assert.doesNotMatch(text, /medical|diagnos|symptom|restriction/i);
});
test("Independent private edits merge without touching a Recomp-shaped document", () => {
  const base = fixture(),
    a = structuredClone(base),
    b = structuredClone(base);
  a.meals["2026-10-26"] = {
    swaps: { lunch: "chicken-rice-bowl" },
    eaten: { lunch: true },
  };
  b.waist["2026-10-26"] = "90";
  const merged = mergeMomentum(base, a, b);
  assert.equal(merged.meals["2026-10-26"].eaten.lunch, true);
  assert.equal(merged.waist["2026-10-26"], "90");
  assert.equal("metrics" in merged, false);
  assert.equal("days" in merged, false);
});
test("Concurrent first logs preserve another device's note rather than treating a blank default as a clearing edit", () => {
  const base = fixture(),
    a = structuredClone(base),
    b = structuredClone(base);
  journey(a).logs["day-3"] = {
    ...newLog(),
    sets: { "leg-press": { weight: "5", reps: "6", done: false } },
  };
  journey(b).logs["day-3"] = { ...newLog(), note: "Synthetic device B note" };
  const merged = mergeMomentum(base, a, b);
  assert.equal(journey(merged).logs["day-3"].note, "Synthetic device B note");
  assert.equal(journey(merged).logs["day-3"].sets["leg-press"].reps, "6");
  assert.equal(
    journey(mergeMomentum(base, base, b)).logs["day-3"].note,
    "Synthetic device B note",
  );
  const cleared = structuredClone(merged);
  journey(cleared).logs["day-3"].note = "";
  assert.equal(
    journey(mergeMomentum(merged, cleared, merged)).logs["day-3"].note,
    "",
  );
  journey(b).logs["day-3"].sets = {
    "leg-press": { weight: "", reps: "7", done: false },
  };
  journey(a).logs["day-3"].sets["leg-press"] = {
    weight: "10",
    reps: "",
    done: false,
  };
  const sets = journey(mergeMomentum(base, a, b)).logs["day-3"].sets;
  assert.equal(sets["leg-press"].reps, "7");
  assert.equal(sets["leg-press"].weight, "10");
});
test("A concurrent recipe swap cannot count an original meal checkmark as eating the replacement", () => {
  const base = fixture(),
    a = structuredClone(base),
    b = structuredClone(base);
  a.meals["2026-10-26"] = { swaps: {}, eaten: { breakfast: true } };
  b.meals["2026-10-26"] = {
    swaps: { breakfast: "yogurt-bowl-kiwi" },
    eaten: { breakfast: false },
  };
  const merged = mergeMomentum(base, a, b);
  assert.equal(merged.meals["2026-10-26"].swaps.breakfast, "yogurt-bowl-kiwi");
  assert.equal(merged.meals["2026-10-26"].eaten.breakfast, false);
});

test("Private device cache contains ciphertext and cannot be read under another account", async () => {
  class MemoryStorage {
    getItem(k) {
      return this[k] ?? null;
    }
    setItem(k, v) {
      this[k] = String(v);
    }
    removeItem(k) {
      delete this[k];
    }
  }
  const oldL = globalThis.localStorage,
    oldS = globalThis.sessionStorage;
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  try {
    const d = fixture();
    d.clearance.restrictions = "Synthetic private advice";
    await cachePrivate("account-a", { base: d, local: d, revision: 2 });
    assert.doesNotMatch(
      JSON.stringify(localStorage),
      /Synthetic private advice/,
    );
    assert.equal(await readPrivate("account-b"), null);
    assert.equal(
      (await readPrivate("account-a")).local.clearance.restrictions,
      "Synthetic private advice",
    );
    clearPrivateCache();
    assert.equal(await readPrivate("account-a"), null);
    assert.equal(Object.keys(localStorage).length, 0);
    assert.equal(Object.keys(sessionStorage).length, 0);
  } finally {
    globalThis.localStorage = oldL;
    globalThis.sessionStorage = oldS;
  }
});

test("Actual PostgreSQL: singleton allowlist, RLS, RPC ownership and compare-and-swap", async (t) => {
  const db = new PGlite();
  const migration = await readFile(
    new URL("../supabase/migrations/20261023_momentum.sql", import.meta.url),
    "utf8",
  );
  const owner = "00000000-0000-4000-8000-000000000001",
    other = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create table public.workout_progress(user_id uuid primary key,data jsonb);insert into public.workout_progress values('${owner}','{"original":"untouched"}');`,
    );
    await db.exec(migration);
    // The feature must not revoke privileges belonging to an unrelated schema.
    await db.exec(
      "create schema private;create table private.preexisting(value text);insert into private.preexisting values('preserved');grant usage on schema private to authenticated;grant select on private.preexisting to authenticated;",
    );
    const dbToday = (
      await db.query(
        "select (now() at time zone 'America/Vancouver')::date::text as day",
      )
    ).rows[0].day;
    const dbFixture = () => {
      const d = fixture(),
        j = makeJourney(firstMondayAfter(dbToday), "synthetic-journey");
      d.clearance.assessedOn = dbToday;
      d.journeys[j.id] = j;
      return d;
    };
    await db.exec(
      `insert into momentum_private.momentum_owner(user_id)values('${owner}');`,
    );
    const as = async (id) => {
      await db.exec(
        `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
      );
    };
    await t.test(
      "unapproved user cannot discover the owner, read records or invoke writes",
      async () => {
        await as(other);
        assert.equal(
          (await db.query("select public.momentum_access() as allowed")).rows[0]
            .allowed,
          false,
        );
        assert.equal(
          (await db.query("select * from public.momentum_progress")).rows
            .length,
          0,
        );
        await assert.rejects(
          db.query("select * from momentum_private.momentum_owner"),
        );
        await assert.rejects(
          db.query("select public.momentum_save(0,$1::jsonb)", [
            JSON.stringify(fixture()),
          ]),
          /denied/,
        );
      },
    );
    await t.test(
      "activation is also gated on the server, not only a client checkbox",
      async () => {
        await as(owner);
        const invalid = dbFixture();
        invalid.clearance.assessed = false;
        await assert.rejects(
          db.query("select public.momentum_save(0,$1::jsonb)", [
            JSON.stringify(invalid),
          ]),
          /professional guidance/,
        );
      },
    );
    await t.test(
      "authorized writes derive ownership from the session and reject direct bypass",
      async () => {
        await as(owner);
        assert.equal(
          (await db.query("select public.momentum_access() as allowed")).rows[0]
            .allowed,
          true,
        );
        const r = (
          await db.query("select public.momentum_save(0,$1::jsonb) as saved", [
            JSON.stringify(dbFixture()),
          ])
        ).rows[0].saved;
        assert.equal(r.revision, 1);
        await assert.rejects(
          db.query("update public.momentum_progress set data='{}'"),
        );
        await assert.rejects(
          db.query(
            `insert into public.momentum_progress(user_id)values('${other}')`,
          ),
        );
      },
    );
    await t.test(
      "guessing another account ID returns no row and CAS cannot overwrite a newer save",
      async () => {
        await as(other);
        assert.equal(
          (
            await db.query(
              `select * from public.momentum_progress where user_id='${owner}'`,
            )
          ).rows.length,
          0,
        );
        await as(owner);
        const r = (
          await db.query("select public.momentum_save(0,$1::jsonb) as saved", [
            JSON.stringify(emptyMomentum()),
          ])
        ).rows[0].saved;
        assert.equal(r.conflict, true);
        assert.equal(r.revision, 1);
      },
    );
    await t.test(
      "a fresh month cannot drop an unresolved medical hold from the stored document",
      async () => {
        await as(owner);
        await db.exec("begin;");
        try {
          const paused = pauseForSymptoms(
            dbFixture(),
            dbToday,
            "synthetic-hold",
          );
          await db.query("select public.momentum_save(1,$1::jsonb)", [
            JSON.stringify(paused),
          ]);
          const candidate = dbFixture(),
            next = makeJourney(firstMondayAfter(dbToday), "another");
          candidate.journeys = { another: next };
          candidate.activeJourneyId = "another";
          await assert.rejects(
            db.query("select public.momentum_save(2,$1::jsonb)", [
              JSON.stringify(candidate),
            ]),
            /medical pause/,
          );
        } finally {
          await db.exec("rollback;");
        }
      },
    );
    await t.test(
      "grant cannot be self-assigned, broadened to two owners, or retained after revocation",
      async () => {
        await assert.rejects(
          db.exec(
            `insert into momentum_private.momentum_owner(user_id)values('${other}')`,
          ),
        );
        await db.exec("reset role;");
        await assert.rejects(
          db.exec(
            `insert into momentum_private.momentum_owner(user_id)values('${other}')`,
          ),
        );
        await db.exec("delete from momentum_private.momentum_owner;");
        await as(owner);
        assert.equal(
          (await db.query("select * from public.momentum_progress")).rows
            .length,
          0,
        );
        await assert.rejects(
          db.query("select public.momentum_save(1,$1::jsonb)", [
            JSON.stringify(fixture()),
          ]),
          /denied/,
        );
      },
    );
    await t.test(
      "anonymous has no read or execute privilege; additive rerun preserves Recomp",
      async () => {
        await db.exec("reset role;set role anon;");
        await assert.rejects(
          db.query("select * from public.momentum_progress"),
        );
        await assert.rejects(db.query("select public.momentum_access()"));
        await db.exec("reset role;");
        await db.exec(migration);
        await as(owner);
        assert.equal(
          (await db.query("select value from private.preexisting")).rows[0]
            .value,
          "preserved",
        );
        await db.exec("reset role;");
        assert.deepEqual(
          (await db.query("select data from public.workout_progress")).rows[0]
            .data,
          { original: "untouched" },
        );
        assert.equal(
          (await db.query("select revision from public.momentum_progress"))
            .rows[0].revision,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});

// Load only the existing shared resources through Vite; no .env or real account.
const server = await createServer({
  envDir: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
test("Every Momentum tutorial and meal reference resolves to the actual Recomp library", async () => {
  const m = await server.ssrLoadModule("/src/App.tsx");
  for (const e of Object.values(strengthTemplates).flat()) {
    assert.ok(m.exerciseMap[e.id]);
    assert.ok(m.exerciseMap[e.id].youtubeId);
  }
  for (const row of Object.values(m.weeklyDietMealMap))
    for (const [slot, id] of Object.entries(row))
      assert.equal(m.dietRecipes.find((r) => r.id === id)?.slot, slot);
});
