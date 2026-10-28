import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";

/** Exercise the appointment editor through React and the revisioned save API.
 * All users, clocks and records are synthetic; this never books a real visit. */
export async function runTrialChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
}) {
  const types = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const trial = await server.ssrLoadModule("/src/features/momentum/trial.ts");
  const active = () => {
    const d = types.emptyMomentum();
    const j = trial.makeHomeJourney(
      "2026-10-28",
      "trial-fixture",
      "2026-10-27T18:00:00Z",
    );
    d.onboarded = true;
    d.activeJourneyId = j.id;
    d.journeys[j.id] = j;
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
    if (!(await page.locator("main.momentum").count())) {
      await navigate(page, "Coach");
      await page.locator(".momentum-entry").click();
    }
    await page.locator(".mm-titan-row").click();
    await expect(page.getByLabel("Trial date", { exact: true })).toBeVisible();
  };
  const value = (backend) =>
    backend.privateSnapshot()?.journeys["trial-fixture"]?.trial;
  for (const [name, engine, viewport] of [
    ["compact", webkit, { width: 375, height: 812 }],
    ["iphone", webkit, { width: 402, height: 874 }],
    ["desktop", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const backend = fixtureBackend(model.emptyStore("2026-10-28"), {
        privateAccess: true,
        momentum: active(),
      });
      const context = await browser.newContext({
        viewport,
        colorScheme,
        timezoneId: "America/Vancouver",
        reducedMotion: "reduce",
        isMobile: viewport.width < 720,
        hasTouch: viewport.width < 720,
      });
      const { page, errors } = await prepare(
        context,
        backend,
        undefined,
        "2026-10-28T19:00:00Z",
      );
      await signIn(page);
      await open(page);
      await expect(page.getByLabel("Trial date", { exact: true })).toHaveValue(
        "",
      );
      await expect(page.getByLabel("Trial time (optional)")).toHaveValue("");
      await page.getByLabel("Trial date", { exact: true }).fill("2026-11-03");
      await expect(page.locator(".mm-trial-preview")).toContainText(
        "Recover after the trial",
      );
      await assertLayout(page, `trial-${name}-${colorScheme}-preview`);
      await page.screenshot({
        path: `outputs/ui-check/trial-${name}-${colorScheme}.png`,
      });
      await page
        .getByRole("button", { name: "Save trial date", exact: true })
        .click();
      await expect.poll(() => value(backend)?.date).toBe("2026-11-03");
      assert.equal(value(backend).time, "", "No invented class time");
      await page
        .getByRole("button", { name: "Back to Coach Hub", exact: true })
        .click();
      await navigate(page, "Diet");
      await page
        .locator(".diet-day-button")
        .filter({ has: page.locator("strong").filter({ hasText: /^3$/ }) })
        .click();
      await expect(page.locator(".meal-prep-planner")).toContainText(
        "Fuel for your trial",
      );
      await expect(page.locator(".meal-prep-planner")).toContainText(
        "3-4 hours",
      );
      await assertLayout(page, `trial-${name}-${colorScheme}-nutrition`);
      await open(page);
      await page.getByLabel("Trial date", { exact: true }).fill("2026-11-05");
      await page.getByLabel("Trial time (optional)").fill("08:00");
      await page
        .getByRole("button", { name: "Save trial date", exact: true })
        .click();
      await expect.poll(() => value(backend)?.date).toBe("2026-11-05");
      await open(page);
      await page
        .getByRole("button", { name: "Remove trial date", exact: true })
        .click();
      await expect.poll(() => value(backend)?.date).toBe(null);
      await page.reload();
      await open(page);
      await expect(page.getByLabel("Trial date", { exact: true })).toHaveValue(
        "",
      );
      await page
        .getByRole("button", { name: "Close panel", exact: true })
        .click();
      await expect(page.locator(".mm-today-focus")).toContainText(
        "Home Strength A",
      );
      await page
        .getByRole("button", { name: "Back to Coach Hub", exact: true })
        .click();
      await navigate(page, "Today");
      await expect(page.locator("#today-heading")).toHaveText(
        "Home Strength A",
      );
      await navigate(page, "Gym");
      await expect(page.locator(".gym-card")).not.toContainText("Muay Thai");
      await assertLayout(page, `trial-${name}-${colorScheme}-home-gym`);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS flexible trial ${name}/${colorScheme}: empty default, preview, optional time, meals, reschedule, cancellation, reload and home restoration`,
      );
    }
  }

  // Separate browser storage, one server: a cancellation must reach the second
  // device, including after that device has temporarily been offline.
  const browser = await chromium.launch();
  browsers.push(browser);
  const backend = fixtureBackend(model.emptyStore("2026-10-28"), {
    privateAccess: true,
    momentum: active(),
  });
  const contexts = [],
    pages = [],
    errors = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({
      viewport: { width: 402, height: 874 },
      timezoneId: "America/Vancouver",
      reducedMotion: "reduce",
    });
    contexts.push(context);
    const result = await prepare(
      context,
      backend,
      undefined,
      "2026-10-28T19:00:00Z",
    );
    pages.push(result.page);
    errors.push(result.errors);
    await signIn(result.page);
  }
  const [a, b] = pages;
  await open(a);
  await a.getByLabel("Trial date", { exact: true }).fill("2026-11-03");
  await a.getByLabel("Trial time (optional)").fill("19:30");
  await a.getByRole("button", { name: "Save trial date", exact: true }).click();
  await expect.poll(() => value(backend)?.date).toBe("2026-11-03");
  await b.evaluate(() => window.dispatchEvent(new Event("focus")));
  await open(b);
  await expect(b.getByLabel("Trial date", { exact: true })).toHaveValue(
    "2026-11-03",
  );
  await expect(b.getByLabel("Trial time (optional)")).toHaveValue("19:30");
  await b.getByRole("button", { name: "Close panel", exact: true }).click();
  await contexts[1].setOffline(true);
  await open(a);
  await a
    .getByRole("button", { name: "Remove trial date", exact: true })
    .click();
  await expect.poll(() => value(backend)?.date).toBe(null);
  await contexts[1].setOffline(false);
  await b.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(b.locator(".mm-titan-row")).toContainText("No trial scheduled");
  await open(b);
  await expect(b.getByLabel("Trial date", { exact: true })).toHaveValue("");
  await b.getByLabel("Trial date", { exact: true }).fill("2026-10-28");
  await b.getByRole("button", { name: "Save trial date", exact: true }).click();
  await expect.poll(() => value(backend)?.date).toBe("2026-10-28");
  await b
    .getByRole("button", { name: "Back to Coach Hub", exact: true })
    .click();
  await navigate(b, "Today");
  await expect(b.locator("#today-heading")).toHaveText(
    "Muay Thai / Kickboxing trial",
  );
  await navigate(b, "Gym");
  await expect(b.locator(".gym-main.no-video")).toBeVisible();
  await expect(b.locator(".gym-main h2")).toHaveText(/Muay Thai \/ Kickboxing trial/i);
  await expect(b.locator(".gym-card")).not.toContainText("Use the downstairs treadmill");
  await expect(b.locator(".gym-card .gym-session-guidance")).toHaveCount(0);
  await expect(
    b.locator(".gym-main .exercise-media, .gym-main iframe"),
  ).toHaveCount(0);
  await b
    .locator(".gym-action-bar")
    .getByRole("button", { name: "Complete Set 1", exact: true })
    .click();
  await expect
    .poll(
      () =>
        backend.snapshot().days["2026-10-28"]?.exercises["muay-thai-trial"]?.[0]
          ?.done,
    )
    .toBe(true);
  await open(b);
  await expect(b.getByLabel("Trial date", { exact: true })).toBeDisabled();
  await expect(
    b.getByRole("button", { name: "Remove trial date", exact: true }),
  ).toHaveCount(0);
  errors.forEach((e) => assert.deepEqual(e, []));
  for (const context of contexts) await context.close();
  console.log(
    "PASS flexible trial two-device date/time sync, offline cancellation, Today/Gym projection and performed-visit lock",
  );
}
