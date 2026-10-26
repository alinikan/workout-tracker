import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";

/** Exercise the actual two-document sync protocol with synthetic accounts.
 * SQL tests separately enforce the real RPC/owner/reset-marker requirements. */
export async function runSharedStartChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
}) {
  const types = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const plan = await server.ssrLoadModule("/src/features/momentum/plan.ts");
  const active = () => {
    const d = types.emptyMomentum(),
      j = plan.makeJourney("2026-10-05", "old-journey", "2026-10-04T18:00:00Z");
    d.onboarded = true;
    d.activeJourneyId = j.id;
    d.journeys[j.id] = j;
    j.logs["day-1"] = {
      ...types.newLog(),
      note: "Preserve this private history",
      outcome: "modified",
    };
    d.meals["2026-10-29"] = { swaps: {}, eaten: { breakfast: true } };
    return d;
  };
  const signIn = async (page) => {
    await page
      .getByLabel("Email", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".momentum-entry")).toBeVisible();
  };
  const open = async (page) => {
    await page.locator(".momentum-entry").click();
    await expect(page.locator("main.momentum")).toBeVisible();
  };
  const section = (page, name) =>
    page
      .getByRole("navigation", { name: "Momentum sections" })
      .getByRole("button", { name, exact: true })
      .click();
  const fresh = async (page, date) => {
    await page
      .getByRole("button", { name: "Start fresh", exact: true })
      .click();
    await page.getByLabel("New start date", { exact: true }).fill(date);
    await page
      .getByLabel("Type RESET to confirm", { exact: true })
      .fill("RESET");
    await page
      .getByRole("button", { name: "Reset & start fresh", exact: true })
      .click();
  };
  for (const [name, engine, viewport] of [
    ["iphone", webkit, { width: 402, height: 874 }],
    ["desktop", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    const seed = model.emptyStore("2026-10-05");
    const backend = fixtureBackend(seed, {
      privateAccess: true,
      momentum: active(),
      privateLoadDelay: 120,
    });
    const contexts = [],
      pages = [],
      errors = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({
        viewport,
        timezoneId: "America/Vancouver",
        colorScheme: i ? "dark" : "light",
        reducedMotion: "reduce",
        isMobile: viewport.width < 720,
        hasTouch: viewport.width < 720,
      });
      contexts.push(context);
      const result = await prepare(
        context,
        backend,
        undefined,
        "2026-10-26T19:00:00Z",
      );
      pages.push(result.page);
      errors.push(result.errors);
      await signIn(result.page);
    }
    const [a, b] = pages;
    await open(b);
    await section(b, "Journey");
    await b.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(b.locator(".mm-week-heading h2")).not.toHaveText("Week 1");
    await contexts[1].setOffline(true);
    await fresh(a, "2026-10-29");
    await expect
      .poll(() => backend.snapshot().program.startedOn)
      .toBe("2026-10-29");
    await expect
      .poll(() => backend.privateSnapshot().sharedProgram?.resetId)
      .toBe(backend.snapshot().program.resetId);
    await expect(a.locator(".reset-sync-notice")).toHaveCount(0);
    const privateData = backend.privateSnapshot();
    const j = privateData.journeys[privateData.activeJourneyId];
    assert.equal(j.startedOn, "2026-10-29");
    assert.equal(Object.keys(j.slots).length, 90);
    assert.deepEqual(j.logs, {});
    assert.deepEqual(privateData.meals, {});
    assert.equal(
      privateData.journeys["old-journey"].logs["day-1"].note,
      "Preserve this private history",
    );
    assert.equal(
      privateData.journeys["old-journey"].archivedMeals["2026-10-29"].eaten
        .breakfast,
      true,
    );
    const events = backend.events();
    const rootWrite = events.findIndex(
      (e) =>
        e.kind === "workout" &&
        e.resetId === backend.snapshot().program.resetId,
    );
    const privateWrite = events.findIndex(
      (e) =>
        e.kind === "momentum" &&
        e.resetId === backend.snapshot().program.resetId,
    );
    assert.ok(
      rootWrite >= 0 && privateWrite > rootWrite,
      "Shared reset must reach the server before private acknowledgement",
    );
    await contexts[1].setOffline(false);
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(b.locator(".mm-week-heading h2")).toHaveText("Week 1");
    await expect(b.locator(".mm-calendar > button").first()).toContainText(
      "Oct 29",
    );
    assert.equal(
      Object.keys(backend.privateSnapshot().journeys).length,
      2,
      "No duplicate reset journey on the second device",
    );
    await assertLayout(b, `shared-start-${name}`);
    await b.screenshot({ path: `outputs/ui-check/shared-start-${name}.png` });

    // Momentum's restart entry opens the SAME destructive confirmation, not a
    // second independent calendar. Cancelling it changes neither document.
    await b
      .getByRole("button", { name: "Momentum settings", exact: true })
      .click();
    await b.getByText("Start fresh across the app", { exact: true }).click();
    const before = backend.snapshot().program.resetId;
    await b
      .getByRole("button", {
        name: "Start fresh for all sections",
        exact: true,
      })
      .click();
    await expect(
      b.getByRole("dialog", {
        name: "A clean slate. Same account.",
        exact: true,
      }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Keep my progress", exact: true })
      .click();
    assert.equal(backend.snapshot().program.resetId, before);
    errors.forEach((e) => assert.deepEqual(e, []));
    for (const context of contexts) await context.close();
    console.log(
      `PASS shared start ${name}: exact non-Monday reset, private archive, Week 1, root-first CAS, two-device offline adoption and shared confirmation`,
    );
  }

  // An existing broken reset repairs after delayed private loading; do not ask
  // the owner to erase the ordinary record again to make Momentum catch up.
  const browser = await chromium.launch();
  browsers.push(browser);
  const seed = model.resetProgress(
    model.emptyStore("2026-10-05"),
    "2026-10-27",
    new Date("2026-10-26T18:00:00Z"),
  );
  const backend = fixtureBackend(seed, {
    privateAccess: true,
    momentum: active(),
    privateLoadDelay: 400,
  });
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    timezoneId: "America/Vancouver",
    reducedMotion: "reduce",
  });
  const { page, errors } = await prepare(
    context,
    backend,
    undefined,
    "2026-10-28T19:00:00Z",
  );
  await signIn(page);
  await expect
    .poll(() => backend.privateSnapshot().sharedProgram?.resetId)
    .toBe(seed.program.resetId);
  assert.equal(
    backend.privateSnapshot().journeys[
      backend.privateSnapshot().activeJourneyId
    ].startedOn,
    "2026-10-27",
  );
  const id = backend.privateSnapshot().activeJourneyId;
  await page.reload();
  await expect(page.locator(".momentum-entry")).toBeVisible();
  await open(page);
  await section(page, "Journey");
  await expect(page.locator(".mm-week-heading h2")).toHaveText("Week 1");
  assert.equal(backend.privateSnapshot().activeJourneyId, id);
  assert.equal(Object.keys(backend.privateSnapshot().journeys).length, 2);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS shared start legacy repair: delayed private load, past chosen date, reload idempotence",
  );
}
