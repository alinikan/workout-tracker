import assert from "node:assert/strict";
import { webkit, chromium, expect } from "playwright/test";

// Isolated real React/Supabase-client flows, with synthetic users and a CAS
// fixture. PostgreSQL tests separately execute the actual production RLS/RPC.
export async function runMomentumChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  assertLayout,
  assertSelectionContrast,
  settlePresentation,
}) {
  const mm = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const plan = await server.ssrLoadModule("/src/features/momentum/plan.ts");
  const trialModel = await server.ssrLoadModule(
    "/src/features/momentum/trial.ts",
  );
  const firstMove = model.exerciseMap["mi6-leg-extension"].name;
  const original = () => model.emptyStore("2026-10-05");
  const active = (trialDate) => {
    const d = mm.emptyMomentum(),
      j = trialModel.makeHomeJourney(
        "2026-10-05",
        "synthetic-private-journey",
        "2026-10-04T18:00:00Z",
      );
    d.activeJourneyId = j.id;
    d.journeys[j.id] = j;
    d.onboarded = true;
    return trialDate
      ? trialModel.chooseTrial(
          d,
          trialDate,
          "18:15",
          "2026-10-05",
          "2026-10-05T18:00:00Z",
        )
      : d;
  };
  const signIn = async (page) => {
    await page
      .getByLabel("Email", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".account-row")).toContainText(
      "fixture@example.test",
    );
  };
  const open = async (page) => {
    await page.locator(".momentum-entry").click();
    await expect(page.locator("main.momentum")).toBeVisible();
    await settlePresentation(page);
  };
  const tab = (page, name) =>
    page
      .getByRole("navigation", { name: "Momentum sections" })
      .getByRole("button", { name, exact: true })
      .click();
  const click = async (page, name) => {
    const button = page.getByRole("button", { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await settlePresentation(page);
    await button.click();
  };
  const privateLog = (backend) =>
    backend.privateSnapshot()?.journeys["synthetic-private-journey"]?.logs[
      "day-1"
    ];
  const contextOptions = (viewport, colorScheme = "light") => ({
    viewport,
    colorScheme,
    isMobile: viewport.width < 720,
    hasTouch: viewport.width < 720,
    timezoneId: "America/Vancouver",
    reducedMotion: colorScheme === "light" ? "reduce" : "no-preference",
  });

  for (const [name, engine, viewport] of [
    ["iphone", webkit, { width: 402, height: 874 }],
    ["compact", webkit, { width: 375, height: 812 }],
    ["desktop", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext(
          contextOptions(viewport, colorScheme),
        ),
        seed = original();
      const backend = fixtureBackend(seed, {
        privateAccess: true,
        momentum: active(),
      });
      const { page, errors } = await prepare(context, backend, seed);
      await expect(page.locator(".momentum-entry")).toHaveCount(0);
      await signIn(page);
      await open(page);
      const originalDays = structuredClone(backend.snapshot().days);
      await expect(page.locator("main.momentum")).not.toContainText(
        /assessment|clearance|Quinit|Rebels/i,
      );
      await expect(page.locator(".mm-today-focus")).toContainText(
        "Home Strength A",
      );
      await expect(
        page
          .getByRole("navigation", { name: "Momentum sections" })
          .getByRole("button"),
      ).toHaveCount(3);
      await assertSelectionContrast(
        page,
        '.mm-bottom-nav [aria-current="page"]',
      );
      await assertSelectionContrast(page, ".mm-today-focus .mm-primary");
      await assertLayout(page, `momentum-${name}-${colorScheme}-today`);
      const startBounds = await page
        .getByRole("button", { name: "Start session", exact: true })
        .boundingBox();
      assert.ok(
        startBounds.y >= 0 &&
          startBounds.y + startBounds.height <= viewport.height,
        "Primary daily action must be visible without scrolling",
      );
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-today.png`,
        fullPage: true,
      });
      await click(page, "Start session");
      await expect(page.locator(".mm-exercise")).toHaveCount(1);
      await expect(page.locator(".mm-bottom-nav")).toHaveCount(0);
      await click(page, "Finish with what I did");
      await click(page, "Save result");
      await expect(page.locator(".mm-notice")).toContainText(
        "Record at least one actual set",
      );
      await click(page, "Back to session");
      await page
        .getByLabel(`${firstMove} set 1 actual reps`, { exact: true })
        .fill("6");
      await page
        .getByLabel(`${firstMove} set 1 weight in pounds`, { exact: true })
        .fill("10");
      await click(page, `Complete ${firstMove} set 1`);
      await expect(
        page.getByRole("button", { name: `Undo ${firstMove} set 1` }),
      ).toHaveAttribute("aria-pressed", "true");
      await assertSelectionContrast(page, ".mm-set-grid.is-done .mm-icon");
      await page.locator(".mm-exercise .video-poster").click();
      await expect(page.locator(".mm-exercise iframe")).toBeVisible();
      await click(page, "Next movement");
      await click(page, "Previous movement");
      await expect(
        page.getByLabel(`${firstMove} set 1 actual reps`, { exact: true }),
      ).toHaveValue("6");
      await assertLayout(page, `momentum-${name}-${colorScheme}-practice`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-practice.png`,
        fullPage: true,
      });
      await click(page, "Finish with what I did");
      await expect(
        page.getByRole("combobox", { name: "Session result", exact: true }),
      ).toHaveValue("modified");
      await page
        .getByRole("combobox", { name: "Effort (optional)", exact: true })
        .selectOption("easy");
      await page
        .getByLabel("The movements felt comfortable", { exact: true })
        .check();
      await click(page, "Save result");
      await expect(page.locator(".mm-session-result")).toContainText(
        "Your effort counts.",
      );
      await expect.poll(() => privateLog(backend)?.outcome).toBe("modified");
      assert.equal(
        Object.values(privateLog(backend).sets).filter((s) => s.done).length,
        1,
      );
      assert.equal(
        privateLog(backend).recovery,
        "",
        "Do not invent next-day recovery",
      );
      assert.deepEqual(
        backend.snapshot().days,
        originalDays,
        "Momentum never completes or edits original Workout days",
      );
      await click(page, "Back to today");
      await tab(page, "Meals");
      const planner = page.locator(".meal-prep-planner");
      await planner
        .getByRole("tab", { name: "Cook batch", exact: true })
        .click();
      const restart = planner.getByRole("button", {
        name: "Start a new batch today",
        exact: true,
      });
      if (await restart.count()) await restart.click();
      const breakfast = planner.getByRole("region", {
        name: "Breakfast",
        exact: true,
      });
      const old = await breakfast.locator("h3").innerText();
      await breakfast.getByRole("button", { name: /^Swap/ }).click();
      await breakfast
        .locator(".mp-swap-option[aria-pressed='false']")
        .first()
        .click();
      await expect(breakfast).toContainText("Swap version");
      await breakfast
        .getByRole("button", { name: /^Revert to original/ })
        .click();
      await expect(breakfast.locator("h3")).toHaveText(old);
      await breakfast.locator(".mp-instructions > summary").click();
      await expect(breakfast.locator(".mp-steps li").first()).toBeVisible();
      await planner.getByRole("tab", { name: "To buy", exact: true }).click();
      await planner.locator(".mp-grocery input").first().check();
      await planner
        .getByRole("tab", { name: "Eat today", exact: true })
        .click();
      const meal = planner.getByRole("article", {
        name: "Breakfast",
        exact: true,
      });
      await meal
        .getByRole("button", { name: "Mark eaten: Breakfast", exact: true })
        .click();
      await expect(
        meal.getByRole("button", { name: "Reopen Breakfast", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(
          () =>
            backend.privateSnapshot().meals["2026-10-05"]?.recipes?.breakfast,
        )
        .toBe("prep-overnight-oats");
      await assertLayout(page, `momentum-${name}-${colorScheme}-meals`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-meals.png`,
        fullPage: true,
      });
      await tab(page, "Journey");
      await expect(page.locator(".mm-calendar > button")).toHaveCount(7);
      for (let i = 1; i < 13; i++) await click(page, "Next week");
      await expect(page.locator(".mm-week-heading")).toContainText("Week 13");
      await expect(page.locator(".mm-calendar > button")).toHaveCount(6);
      await expect(
        page.getByRole("button", { name: "Next week", exact: true }),
      ).toBeDisabled();
      await assertLayout(page, `momentum-${name}-${colorScheme}-journey`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-journey.png`,
        fullPage: true,
      });
      await tab(page, "Today");
      await page.locator(".mm-titan-row").click();
      await expect(page.getByRole("dialog")).toContainText(
        "Choose a trial when you are ready",
      );
      await expect(page.getByLabel("Trial date", { exact: true })).toHaveValue(
        "",
      );
      await expect(
        page.getByLabel("Trial time (optional)", { exact: true }),
      ).toHaveValue("");
      await expect(page.getByRole("dialog")).not.toContainText("$300");
      const panelFit = await page
        .getByRole("dialog")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
      assert.ok(panelFit, "Titan sheet must fit a phone width");
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-titan.png`,
      });
      await click(page, "Close panel");
      // Observe real hook encryption, rather than asserting a mock helper alone.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              Object.keys(localStorage).filter((k) =>
                k.startsWith("momentum-private-v1:data:"),
              ).length,
          ),
        )
        .toBe(1);
      const cache = await page.evaluate(() =>
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith("momentum-private-v1:data:"),
        ),
      );
      assert.ok(
        cache.every(
          ([, value]) => !value.includes("synthetic-private-journey"),
        ),
        "Private draft is ciphertext",
      );
      backend.revokePrivate();
      await click(page, "Sync Momentum now");
      await expect(page.locator("main.momentum")).toHaveCount(0);
      await expect(page.locator(".momentum-entry")).toHaveCount(0);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS Momentum ${name}/${colorScheme}: focused sets, meals, 90 days, pricing, contrast, encrypted cache, revocation`,
      );
    }
  }

  const browser = await webkit.launch();
  browsers.push(browser);
  // First launch remains one date and one action, never a survey.
  const first = await browser.newContext(
    contextOptions({ width: 375, height: 812 }),
  );
  const firstBackend = fixtureBackend(original(), { privateAccess: true });
  const { page: fresh } = await prepare(first, firstBackend, original());
  await signIn(fresh);
  await open(fresh);
  await expect(fresh.locator(".mm-start input")).toHaveCount(1);
  await click(fresh, "Start my 90 days");
  await expect(fresh.locator(".mm-today-focus")).toContainText(
    "Home Strength A",
  );
  await expect
    .poll(
      () => Object.keys(firstBackend.privateSnapshot()?.journeys ?? {}).length,
    )
    .toBe(1);
  assert.equal(
    Object.keys(Object.values(firstBackend.privateSnapshot().journeys)[0].slots)
      .length,
    90,
  );
  await click(fresh, "Back to Coach Hub");
  await click(fresh, "Sign out");
  await expect(fresh.locator(".momentum-entry")).toHaveCount(0);
  await expect
    .poll(() =>
      fresh.evaluate(
        () =>
          Object.keys(sessionStorage).filter((k) =>
            k.startsWith("momentum-private-v1:"),
          ).length,
      ),
    )
    .toBe(0);
  await first.close();
  console.log(
    "PASS Momentum single-date onboarding and sign-out cache clearing",
  );

  // Recovery, observed class, weekly planning and a skip need no invented sets.
  for (const [kind, day] of [
    ["boxing", "07"],
    ["recovery", "08"],
    ["review", "11"],
    ["skip", "12"],
  ]) {
    const c = await browser.newContext(
      contextOptions({ width: 375, height: 812 }, "dark"),
    );
    const backend = fixtureBackend(original(), {
      privateAccess: true,
      momentum: active(
        kind === "boxing" || kind === "recovery" ? "2026-10-07" : undefined,
      ),
    });
    const { page, errors } = await prepare(
      c,
      backend,
      original(),
      `2026-10-${day}T18:00:00Z`,
    );
    await signIn(page);
    await open(page);
    await click(
      page,
      kind === "recovery" || kind === "review"
        ? "Review my day"
        : "Start session",
    );
    await click(
      page,
      kind === "recovery" || kind === "review"
        ? "Record my day"
        : kind === "skip"
          ? "Finish with what I did"
          : "Record session",
    );
    if (kind === "boxing")
      await page.getByLabel("I attended and observed", { exact: true }).check();
    if (kind === "skip")
      await page
        .getByRole("combobox", { name: "Session result", exact: true })
        .selectOption("missed");
    await click(page, "Save result");
    await expect(page.locator(".mm-session-result")).toContainText(
      kind === "boxing"
        ? "Your effort counts."
        : kind === "skip"
          ? "Recorded. Keep going."
          : "You showed up.",
    );
    await assertLayout(page, `momentum-${kind}`);
    if (kind === "boxing") {
      await click(page, "Back to today");
      await page.locator(".mm-titan-row").click();
      await expect(
        page.getByLabel("Trial date", { exact: true }),
      ).toBeDisabled();
      await expect
        .poll(
          () =>
            backend.privateSnapshot().journeys["synthetic-private-journey"]
              .logs["day-3"]?.className,
        )
        .toBe("Muay Thai / Kickboxing trial");
      await click(page, "Close panel");
      await tab(page, "Journey");
      await click(page, "Next week");
      await expect(page.locator(".mm-calendar")).not.toContainText(
        /Kickboxing|Muay Thai/,
      );
    }
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS Momentum observed class, recovery, review and honest skip");

  // Actual full session + re-entry + correcting one set + unfinished resume.
  const c = await browser.newContext(
    contextOptions({ width: 402, height: 874 }),
  );
  const backend = fixtureBackend(original(), {
    privateAccess: true,
    momentum: active(),
  });
  const { page } = await prepare(c, backend, original());
  await signIn(page);
  await open(page);
  await click(page, "Start session");
  for (const [i] of plan.homeStrengthTemplates["strength-a"].entries()) {
    const inputs = page.locator(
      '.mm-set-grid input[aria-label$="actual reps"]',
    );
    for (let s = 0; s < (await inputs.count()); s++)
      await inputs.nth(s).fill("8");
    while (
      await page.locator('.mm-set-grid button[aria-pressed="false"]').count()
    )
      await page
        .locator('.mm-set-grid button[aria-pressed="false"]')
        .first()
        .click();
    await click(page, i === 5 ? "Review session" : "Next movement");
  }
  await expect(
    page.getByRole("combobox", { name: "Session result", exact: true }),
  ).toHaveValue("planned");
  await click(page, "Save result");
  await expect.poll(() => privateLog(backend)?.outcome).toBe("planned");
  await click(page, "Back to today");
  await click(page, "View recorded session");
  await click(page, "Edit result");
  await click(page, "Back to session");
  await page
    .locator('.mm-set-grid button[aria-pressed="true"]')
    .first()
    .click();
  await click(page, "Back to overview");
  await click(page, "Continue session");
  await expect(page.locator(".mm-movement-position")).toContainText(
    "Movement 1 of 6",
  );
  await expect
    .poll(
      () =>
        Object.values(privateLog(backend)?.sets ?? {}).filter((s) => s.done)
          .length,
    )
    .toBe(11);
  await c.close();
  console.log(
    "PASS Momentum full completion, correction, first-unfinished resume",
  );

  // Two devices change independent fields while offline, then CAS/three-way merge.
  const shared = fixtureBackend(original(), {
    privateAccess: true,
    momentum: active(),
  });
  const devices = [],
    pages = [];
  for (let i = 0; i < 2; i++) {
    const d = await browser.newContext(
      contextOptions({ width: 402, height: 874 }),
    );
    devices.push(d);
    const { page } = await prepare(d, shared, original());
    await signIn(page);
    await open(page);
    await expect(page.locator(".mm-sync")).toContainText("Private data synced");
    await click(page, "Start session");
    pages.push(page);
    await d.setOffline(true);
  }
  await pages[0]
    .getByLabel(`${firstMove} set 1 actual reps`, { exact: true })
    .fill("6");
  await click(pages[1], "Finish with what I did");
  await pages[1].getByText("Notes & corrections", { exact: true }).click();
  await pages[1]
    .getByLabel("One coach note (optional)", { exact: true })
    .fill("Synthetic device B note");
  await devices[1].setOffline(false);
  await click(pages[1], "Sync Momentum now");
  await expect
    .poll(() => privateLog(shared)?.note)
    .toBe("Synthetic device B note");
  await devices[0].setOffline(false);
  await click(pages[0], "Sync Momentum now");
  await expect
    .poll(() => privateLog(shared)?.sets["mi6-leg-extension"]?.reps)
    .toBe("6");
  assert.equal(privateLog(shared).note, "Synthetic device B note");
  for (const d of devices) await d.close();
  console.log(
    "PASS Momentum offline two-device merge keeps sets and independent notes",
  );
}
