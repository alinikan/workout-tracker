import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = {};
for (const name of [
  "20261023_momentum",
  "20261023_momentum_setup",
  "20261026_shared_start",
]) {
  sql[name] = await readFile(
    new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
    "utf8",
  );
}
const workoutSchema = await readFile(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const byteLimit = 512 * 1024;
const invalid = (error) => error.code === "22023";
const denied = (error) => error.code === "42501";

function document(startedOn, id = "ordinary", schemaVersion = 2) {
  return {
    schemaVersion,
    profile: { wellbeingGoal: "Synthetic fixture only" },
    activeJourneyId: id,
    journeys: {
      [id]: {
        id,
        startedOn,
        logs: {},
        reviews: {},
        adaptations: {},
        pauses: {},
      },
      archived: {
        id: "archived",
        startedOn: "2020-01-06",
        logs: { day1: { outcome: "stopped", note: "Preserve" } },
      },
    },
    meals: { "2020-01-06": { eaten: { lunch: true } } },
  };
}

const program = (startedOn, resetId = "synthetic-reset") => ({
  startedOn,
  resetId,
  resetAt: "2026-01-02T03:04:05.000Z",
});

function sharedDocument(marker) {
  return {
    ...document(marker.startedOn, `program-${marker.resetId}`),
    sharedProgram: structuredClone(marker),
  };
}

async function database(t, install = sql["20261023_momentum"]) {
  // In-memory PostgreSQL only: no environment, Supabase client or credentials.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${owner}'), ('${other}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  await db.exec(workoutSchema);
  await db.exec(install);
  await db.query(
    "insert into momentum_private.momentum_owner(user_id) values ($1)",
    [owner],
  );
  const dates = (
    await db.query(`
    with clock as (select (now() at time zone 'America/Vancouver')::date as today)
    select today::text, (today - 10)::text as past,
      (today + case when extract(isodow from today + 1) = 1 then 2 else 1 end)::text as future
    from clock
  `)
  ).rows[0];
  const as = async (id = owner, role = "authenticated") => {
    assert.ok(["authenticated", "anon"].includes(role));
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id ?? "",
    ]);
    await db.exec(`set role ${role}`);
  };
  const save = async (revision, data) =>
    (
      await db.query("select public.momentum_save($1, $2::jsonb) as saved", [
        revision,
        JSON.stringify(data),
      ])
    ).rows[0].saved;
  const setProgram = async (id, marker) => {
    await db.exec("reset role");
    await db.query(
      `
      insert into public.workout_progress(user_id, data) values ($1, $2::jsonb)
      on conflict (user_id) do update set data = excluded.data
    `,
      [
        id,
        JSON.stringify({
          program: marker,
          days: { synthetic: { note: "Keep workout history" } },
          metrics: { synthetic: 1 },
        }),
      ],
    );
    await as();
  };
  const seed = async (data, revision = 7, id = owner) => {
    await db.exec("reset role");
    await db.query(
      "insert into public.momentum_progress(user_id, data, revision) values ($1, $2::jsonb, $3)",
      [id, JSON.stringify(data), revision],
    );
    await as();
  };
  await as();
  return { db, dates, as, save, setProgram, seed };
}

function saveDefinition(source) {
  const definition = source.match(
    /create or replace function public\.momentum_save\([\s\S]*?\n\$\$;/i,
  )?.[0];
  assert.ok(definition);
  return definition;
}

test("shared-start migration is transaction-wrapped, function-only and identical in both install paths", () => {
  const incremental = sql["20261026_shared_start"];
  const definition = saveDefinition(incremental);
  assert.equal(saveDefinition(sql["20261023_momentum"]), definition);
  assert.equal(saveDefinition(sql["20261023_momentum_setup"]), definition);
  const outsideFunction = incremental
    .replace(definition, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  assert.match(outsideFunction, /^begin;\s*commit;$/);
  assert.doesNotMatch(incremental, /\b(drop|grant|revoke|alter|truncate)\s/i);
});

test("PostgreSQL: owner may choose any today/future date with schema versions 1 and 2", async (t) => {
  const { db, dates, save } = await database(t);
  assert.notEqual(new Date(`${dates.future}T12:00:00Z`).getUTCDay(), 1);
  for (const [index, [date, version]] of [
    [dates.future, 2],
    [dates.today, 1],
  ].entries()) {
    const data = document(date, `ordinary-${index}`, version);
    data.user_id = other;
    const saved = await save(index, data);
    assert.equal(saved.conflict, false);
    assert.equal(saved.revision, index + 1);
    assert.deepEqual(saved.data, data);
  }
  const rows = (
    await db.query(
      "select user_id::text, revision from public.momentum_progress",
    )
  ).rows;
  assert.deepEqual(rows, [{ user_id: owner, revision: 2 }]);
});

test("PostgreSQL: malformed dates and arbitrary historical activations fail without inserting rows", async (t) => {
  const { db, dates, save } = await database(t);
  for (const date of [
    dates.past,
    "2099-02-29",
    "2099-04-31",
    "2099-13-01",
    "2099-00-01",
    "0000-01-01",
    "2099-1-01",
    "infinity",
    null,
  ]) {
    await assert.rejects(save(0, document(date)), invalid, String(date));
  }
  const claimed = program(dates.past);
  await assert.rejects(save(0, sharedDocument(claimed)), invalid);
  await assert.rejects(
    save(0, { ...document(dates.past), sharedProgram: null }),
    invalid,
  );
  await assert.rejects(
    save(0, sharedDocument({ ...claimed, resetId: "initial", resetAt: null })),
    invalid,
  );
  for (const data of [
    { ...document(dates.future), journeys: {} },
    { ...document(dates.future), activeJourneyId: "missing" },
    { ...document(dates.future), journeys: { ordinary: [] } },
  ])
    await assert.rejects(save(0, data), invalid);
  assert.deepEqual(
    (await db.query("select * from public.momentum_progress")).rows,
    [],
  );
});

test("PostgreSQL: an unchanged active historical journey stays editable, without bypassing validation", async (t) => {
  const { db, dates, save, seed } = await database(t);
  const data = document(dates.past);
  data.journeys.ordinary.logs.day1 = {
    outcome: "stopped",
    readiness: { pain: "concerning" },
    note: "Retain safety history",
  };
  data.journeys.ordinary.pauses.synthetic = {
    from: dates.past,
    reason: "personal",
  };
  await seed(data);
  const edited = structuredClone(data);
  edited.profile.wellbeingGoal = "Synthetic edit";
  const saved = await save(7, edited);
  assert.equal(saved.revision, 8);
  assert.deepEqual(saved.data, edited);
  for (const version of [null, 0, 3, 99, "", undefined]) {
    await assert.rejects(
      save(8, { ...edited, schemaVersion: version }),
      invalid,
    );
  }
  for (const profile of [null, [], "not-an-object", undefined]) {
    await assert.rejects(save(8, { ...edited, profile }), invalid);
  }
  for (const revision of [null, -1])
    await assert.rejects(save(revision, edited), invalid);
  for (const data of [null, [], "not-an-object"])
    await assert.rejects(save(8, data), invalid);
  const changed = structuredClone(edited);
  changed.journeys.ordinary.startedOn = "2020-01-07";
  await assert.rejects(save(8, changed), invalid);
  await assert.rejects(
    save(8, { ...edited, activeJourneyId: "archived" }),
    invalid,
  );
  assert.deepEqual(
    (await db.query("select data, revision from public.momentum_progress"))
      .rows,
    [{ data: edited, revision: 8 }],
  );
});

test("PostgreSQL: only the owner's exact persisted shared reset authorizes a late historical activation", async (t) => {
  const { db, dates, save, setProgram } = await database(t);
  const marker = program(dates.past);
  await setProgram(owner, marker);
  await setProgram(other, program(dates.past, "someone-else"));
  const originalWorkout = (
    await db.query("select data from public.workout_progress")
  ).rows;
  const ordinary = document(dates.future);
  assert.equal((await save(0, ordinary)).revision, 1);
  const data = sharedDocument(marker);
  data.journeys.ordinary = ordinary.journeys.ordinary;
  data.journeys[data.activeJourneyId].logs.day1 = {
    outcome: "stopped",
    readiness: { pain: "concerning" },
  };
  const saved = await save(1, data);
  assert.deepEqual(saved, { conflict: false, revision: 2, data });
  const legacy = { ...data, schemaVersion: 1 };
  assert.equal((await save(2, legacy)).revision, 3);
  assert.deepEqual(
    (await db.query("select data from public.workout_progress")).rows,
    originalWorkout,
  );
  for (const patch of [
    { schemaVersion: 99 },
    { profile: [] },
    { journeys: null },
    { padding: "x".repeat(byteLimit) },
  ]) {
    await assert.rejects(save(3, { ...legacy, ...patch }), invalid);
  }
  // Marker/date checks do not replace CAS or change the normal conflict result.
  const staleClient = {
    ...data,
    sharedProgram: { ...marker, resetId: "stale-client" },
  };
  assert.deepEqual(await save(1, staleClient), {
    conflict: true,
    revision: 3,
    data: legacy,
  });
  const newerMarker = {
    ...marker,
    resetId: "newer-server-reset",
    resetAt: "2026-01-03T03:04:05.000Z",
  };
  await setProgram(owner, newerMarker);
  await assert.rejects(save(3, legacy), invalid);
  // Even the same date/ID cannot keep a stale shared marker after a server reset.
  assert.deepEqual(await save(2, legacy), {
    conflict: true,
    revision: 3,
    data: legacy,
  });
  const latest = sharedDocument(newerMarker);
  assert.deepEqual(await save(3, latest), {
    conflict: false,
    revision: 4,
    data: latest,
  });
});

test("PostgreSQL: foreign-owner, forged and equivalent-but-not-identical markers cannot authorize a past start", async (t) => {
  const { db, dates, save, setProgram, as } = await database(t);
  const marker = program(dates.past);
  const data = sharedDocument(marker);
  await setProgram(other, marker);
  // A matching program on another user's row must not be found by SECURITY DEFINER.
  await assert.rejects(save(0, { ...data, user_id: other }), invalid);
  for (const wrongRoot of [
    null,
    {},
    { ...marker, resetId: "wrong-generation" },
    { ...marker, startedOn: "2020-01-07" },
    { ...marker, resetAt: "2026-01-02T03:04:05+00:00" },
    { ...marker, resetId: 123 },
  ]) {
    await setProgram(owner, wrongRoot);
    await assert.rejects(save(0, data), invalid);
  }
  await setProgram(owner, marker);
  for (const wrongClaim of [
    { ...marker, resetId: "wrong-generation" },
    { ...marker, startedOn: "2020-01-07" },
    { ...marker, resetAt: "2026-01-02T03:04:05+00:00" },
    { ...marker, resetAt: "2026-01-02T03:04:05Z" },
  ])
    await assert.rejects(save(0, sharedDocument(wrongClaim)), invalid);
  const differentJourneyDate = structuredClone(data);
  differentJourneyDate.journeys[data.activeJourneyId].startedOn = "2020-01-07";
  await assert.rejects(save(0, differentJourneyDate), invalid);
  for (const id of [
    "ordinary",
    `x${data.activeJourneyId}`,
    `${data.activeJourneyId}-extra`,
    "program-",
  ]) {
    const wrongId = {
      ...data,
      activeJourneyId: id,
      journeys: { ...data.journeys, [id]: data.journeys[data.activeJourneyId] },
    };
    await assert.rejects(save(0, wrongId), invalid);
  }
  await as(other);
  await assert.rejects(save(0, data), denied);
  assert.deepEqual(
    (await db.query("select * from public.momentum_progress")).rows,
    [],
  );
  await as();
  assert.deepEqual(
    (await db.query("select * from public.momentum_progress")).rows,
    [],
  );
});

test("PostgreSQL: a matching marker may be acknowledged without restarting an existing journey", async (t) => {
  const { dates, save, seed, setProgram } = await database(t);
  const marker = program(dates.past);
  await setProgram(owner, marker);
  const existing = document("2020-01-07");
  await seed(existing);
  const acknowledged = { ...existing, sharedProgram: marker };
  assert.deepEqual(await save(7, acknowledged), {
    conflict: false,
    revision: 8,
    data: acknowledged,
  });
  const future = { ...document(dates.future), sharedProgram: marker };
  assert.deepEqual(await save(8, future), {
    conflict: false,
    revision: 9,
    data: future,
  });
  const notStarted = {
    schemaVersion: 2,
    profile: {},
    journeys: {},
    activeJourneyId: null,
    sharedProgram: marker,
  };
  assert.deepEqual(await save(9, notStarted), {
    conflict: false,
    revision: 10,
    data: notStarted,
  });
  // Acknowledgment alone never authorizes reactivation of a historical journey.
  await assert.rejects(save(10, acknowledged), invalid);
});

test("PostgreSQL: even a persisted matching marker needs a real reset ID and finite timestamp", async (t) => {
  const { dates, save, setProgram } = await database(t);
  for (const resetAt of [
    null,
    undefined,
    "",
    "invalid",
    "now",
    "epoch",
    "infinity",
    "2026-02-30T03:04:05.000Z",
    "2026-01-02T25:04:05.000Z",
    "2026-01-02T03:04:05+29:00",
    123,
  ]) {
    const marker = { ...program(dates.past), resetAt };
    await setProgram(owner, marker);
    await assert.rejects(
      save(0, sharedDocument(marker)),
      invalid,
      String(resetAt),
    );
  }
  for (const resetId of ["", "initial", null, undefined, 123]) {
    const marker = { ...program(dates.past), resetId };
    await setProgram(owner, marker);
    await assert.rejects(
      save(0, sharedDocument(marker)),
      invalid,
      String(resetId),
    );
  }
  for (const sharedProgram of [{}, [], "invalid", 123]) {
    await assert.rejects(
      save(0, { ...document(dates.future), sharedProgram }),
      invalid,
    );
  }
});

test("PostgreSQL: 512 KiB is an inclusive byte limit, also for unchanged active dates", async (t) => {
  const { db, dates, save } = await database(t);
  const data = { ...document(dates.future), padding: "" };
  const size = async (data) =>
    (
      await db.query("select octet_length($1::jsonb::text) as size", [
        JSON.stringify(data),
      ])
    ).rows[0].size;
  data.padding = "x".repeat(byteLimit - (await size(data)));
  assert.equal(await size(data), byteLimit);
  assert.equal((await save(0, data)).revision, 1);
  await assert.rejects(
    save(1, { ...data, padding: data.padding + "x" }),
    invalid,
  );
  await assert.rejects(
    save(1, { ...data, padding: data.padding.slice(1) + "\u00e9" }),
    invalid,
  );
  assert.equal(
    (await db.query("select revision from public.momentum_progress")).rows[0]
      .revision,
    1,
  );
});

async function snapshot(db) {
  await db.exec("reset role");
  const result = {};
  for (const [name, query] of Object.entries({
    momentum:
      "select user_id::text, data::text, revision::text, updated_at::text from public.momentum_progress order by user_id",
    workout:
      "select user_id::text, data::text, created_at::text, updated_at::text from public.workout_progress order by user_id",
    owners:
      "select singleton, user_id::text from momentum_private.momentum_owner order by user_id",
    unrelated: "select * from private.preexisting order by value",
    schemas: `select nspname, nspowner, (select array_agg(acl::text order by acl::text) from unnest(nspacl) acl) as grants
      from pg_namespace where nspname in ('public', 'private', 'momentum_private') order by nspname`,
    relations: `select n.nspname, c.relname, c.oid, c.relowner,
      (select array_agg(acl::text order by acl::text) from unnest(c.relacl) acl) as grants, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private', 'momentum_private') order by n.nspname, c.relname`,
    policies:
      "select * from pg_policies where schemaname in ('public', 'private', 'momentum_private') order by schemaname, tablename, policyname",
    functions: `select n.nspname, p.proname, p.oid, p.proowner,
      (select array_agg(acl::text order by acl::text) from unnest(p.proacl) acl) as grants,
      p.prosecdef, p.proconfig, p.provolatile, p.prorettype, p.proargtypes::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'momentum_private') order by n.nspname, p.proname`,
    access:
      "select pg_get_functiondef('public.momentum_access()'::regprocedure) as definition",
    constraints: `select n.nspname, c.conname, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname in ('public', 'private', 'momentum_private') order by n.nspname, c.conname`,
    triggers:
      "select tgname, pg_get_triggerdef(oid) as definition from pg_trigger where not tgisinternal order by tgname",
  }))
    result[name] = (await db.query(query)).rows;
  return result;
}

test("PostgreSQL: migration reruns preserve rows, revisions, owner allowlist, RLS and the exact grant set", async (t) => {
  const { db, dates, save, as, setProgram, seed } = await database(t);
  const marker = program(dates.past);
  await setProgram(owner, marker);
  await setProgram(other, program(dates.past, "foreign-reset"));
  const data = sharedDocument(marker);
  await seed(data, 7);
  await seed(document(dates.past, "foreign-private"), 41, other);
  await db.exec(`reset role;
    create role synthetic_auditor;
    create schema private;
    create table private.preexisting(value text);
    insert into private.preexisting values ('preserved');
    grant usage on schema private to authenticated;
    grant select on private.preexisting to authenticated;
    grant execute on function public.momentum_save(bigint,jsonb) to synthetic_auditor;
  `);
  const before = await snapshot(db);
  for (const name of [
    "20261026_shared_start",
    "20261026_shared_start",
    "20261023_momentum_setup",
    "20261023_momentum_setup",
    "20261023_momentum",
    "20261026_shared_start",
  ]) {
    await db.exec(sql[name]);
    assert.deepEqual(await snapshot(db), before, name);
  }
  await as();
  assert.deepEqual(await save(6, data), { conflict: true, revision: 7, data });
  assert.deepEqual(await save(7, data), { conflict: false, revision: 8, data });
  await db.exec("reset role");
  const privileges = (
    await db.query(`select
    has_function_privilege('authenticated', 'public.momentum_save(bigint,jsonb)', 'EXECUTE') as owner_rpc,
    has_function_privilege('anon', 'public.momentum_save(bigint,jsonb)', 'EXECUTE') as anon_rpc,
    has_table_privilege('authenticated', 'public.momentum_progress', 'UPDATE') as direct_write,
    has_table_privilege('authenticated', 'momentum_private.momentum_owner', 'SELECT') as owner_list
  `)
  ).rows[0];
  assert.deepEqual(privileges, {
    owner_rpc: true,
    anon_rpc: false,
    direct_write: false,
    owner_list: false,
  });
  await as();
  for (const query of [
    "update public.momentum_progress set data = '{}'",
    `insert into public.momentum_progress(user_id) values ('${other}')`,
    "delete from public.momentum_progress",
    "select * from momentum_private.momentum_owner",
    `insert into momentum_private.momentum_owner(user_id) values ('${other}')`,
  ])
    await assert.rejects(db.exec(query), denied);
  assert.deepEqual(
    (await db.query("select user_id::text from public.momentum_progress")).rows,
    [{ user_id: owner }],
  );
  assert.equal(
    (await db.query("select value from private.preexisting")).rows[0].value,
    "preserved",
  );
  await as(other);
  assert.deepEqual(
    (await db.query("select * from public.momentum_progress")).rows,
    [],
  );
  await assert.rejects(save(0, data), denied);
  await as(null);
  await assert.rejects(save(8, data), denied);
  await as(null, "anon");
  await assert.rejects(
    db.query("select * from public.momentum_progress"),
    denied,
  );
  await assert.rejects(save(8, data), denied);
  await assert.rejects(db.query("select public.momentum_access()"), denied);
  await db.exec("reset role");
  await assert.rejects(
    db.query(
      "insert into momentum_private.momentum_owner(user_id) values ($1)",
      [other],
    ),
    (error) => error.code === "23505",
  );
  // Even accidentally granting reads cannot bypass either table's RLS.
  await db.exec(
    "begin; grant usage on schema momentum_private to authenticated; grant select on momentum_private.momentum_owner to authenticated;",
  );
  for (const id of [other, owner]) {
    await as(id);
    assert.deepEqual(
      (await db.query("select * from momentum_private.momentum_owner")).rows,
      [],
    );
  }
  await db.exec(
    "rollback; reset role; delete from momentum_private.momentum_owner",
  );
  await as();
  assert.deepEqual(
    (await db.query("select * from public.momentum_progress")).rows,
    [],
  );
  await assert.rejects(save(8, data), denied);
});
