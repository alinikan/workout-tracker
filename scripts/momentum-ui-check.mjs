import assert from "node:assert/strict";
import { webkit, chromium, expect } from "playwright/test";

// Uses the existing isolated Vite/auth fixture. The PostgreSQL tests separately
// verify real RLS; this suite exercises the actual React UI and Supabase client.
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
  const original = () => model.emptyStore("2026-10-05");
  const active = () => {
    const d = mm.emptyMomentum(),
      j = plan.makeJourney("2026-10-05", "synthetic-private-journey");
    d.activeJourneyId = j.id;
    d.journeys[j.id] = j;
    d.onboarded = true;
    return d;
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
  const openPrivate = async (page) => {
    await expect(page.locator(".momentum-entry")).toBeVisible();
    await page.locator(".momentum-entry").click();
    await expect(page.locator(".momentum")).toBeVisible();
  };
  const tab = async (page, name) => {
    const nested = {
      Boxing: "Classes",
      "My 30 days": "Calendar",
      Strength: "Exercises",
    }[name];
    await page
      .getByRole("tablist", { name: "Momentum sections" })
      .getByRole("tab", { name: nested ? "Plan" : name, exact: true })
      .click();
    if (nested)
      await page
        .getByRole("navigation", { name: "Plan sections" })
        .getByRole("button", { name: nested, exact: true })
        .click();
  };
  const step = (page, name) =>
    page
      .getByRole("navigation", { name: "Session steps" })
      .getByRole("button", { name, exact: true })
      .click();
  const feedback = (page) =>
    page.getByText("Optional feedback", { exact: true }).click();
  const stable = async (page, locator) => {
    await locator.evaluate((e) =>
      e.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await settlePresentation(page);
    if (page.viewportSize().width < 720) await locator.tap();
    else await locator.click();
  };
  for (const [name, engine, viewport] of [
    ["iphone", webkit, { width: 402, height: 874 }],
    ["compact", webkit, { width: 375, height: 812 }],
    ["desktop", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        isMobile: viewport.width < 720,
        hasTouch: viewport.width < 720,
        timezoneId: "America/Vancouver",
        reducedMotion: colorScheme === "light" ? "reduce" : "no-preference",
      });
      const seed = original();
      const backend = fixtureBackend(seed, {
        privateAccess: true,
        momentum: active(),
      });
      const { page, errors } = await prepare(
        context,
        backend,
        seed,
        "2026-10-07T18:00:00Z",
      );
      await expect(page.locator(".momentum-entry")).toHaveCount(0);
      await signIn(page);
      await openPrivate(page);
      await expect(page.locator(".momentum")).not.toContainText(
        /assessment|clearance|professional guidance/i,
      );
      await expect(page.locator(".mm-one-thing")).toContainText(
        "First home Strength A",
      );
      await expect(page.locator(".mm-session")).toContainText(
        "One to three comfortable exercises",
      );
      await assertSelectionContrast(page, '.mm-tabs [aria-selected="true"]');
      const beginBounds = await page
        .getByRole("button", { name: "Begin session", exact: true })
        .boundingBox();
      assert.ok(
        beginBounds.y >= 0 &&
          beginBounds.y + beginBounds.height <= viewport.height + 1,
        "Begin session should be fully visible before scrolling",
      );
      await expect(
        page.locator(
          ".mm-session input:visible, .mm-session select:visible, .mm-session textarea:visible",
        ),
      ).toHaveCount(0);
      const fits = await page
        .locator(".mm-tabs")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
      assert.ok(
        fits,
        "Momentum's five destinations must fit without horizontal scrolling",
      );
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-today.png`,
        fullPage: true,
      });
      await stable(
        page,
        page.getByRole("button", { name: "Begin session", exact: true }),
      );
      await expect(page.locator("#mm-session-exercises")).toBeInViewport();
      await expect(
        page
          .getByRole("navigation", { name: "Session steps" })
          .getByRole("button", { name: "Session", exact: true }),
      ).toHaveAttribute("aria-current", "step");
      await settlePresentation(page);
      await assertSelectionContrast(page, '.mm-stepper [aria-current="step"]');
      await assertLayout(page, `momentum-${name}-${colorScheme}-practice`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-practice.png`,
      });
      // Wait for Recomp's existing overnight housekeeping to reach the fixture
      // before taking a baseline. Momentum must not change THAT settled record.
      await expect
        .poll(() => backend.snapshot().days["2026-10-06"]?.daySkipReason)
        .toBe("forgotten");
      const originalDays = structuredClone(backend.snapshot().days);
      await expect(
        page
          .getByRole("tablist", { name: "Momentum sections" })
          .getByRole("tab"),
      ).toHaveCount(5);
      await expect(page.locator(".mm-exercise")).toHaveCount(1);
      await expect(page.getByLabel("Effort", { exact: true })).toHaveCount(0);
      await step(page, "Finish");
      await expect(
        page.getByLabel("Effort", { exact: true }),
      ).not.toBeVisible();
      await stable(
        page,
        page.getByRole("button", { name: "Save result", exact: true }),
      );
      await expect(page.locator(".mm-notice")).toContainText(
        "Record at least one actual set",
      );
      await page
        .locator(".mm-notice")
        .getByRole("button", { name: "Dismiss" })
        .click();
      await step(page, "Session");
      await stable(
        page,
        page.getByRole("button", { name: "Technique: Leg Press", exact: true }),
      );
      await expect(page.locator(".mm-tutorial .video-poster")).toBeVisible();
      await page.locator(".mm-tutorial .video-poster").click();
      await expect(page.locator(".mm-tutorial iframe")).toBeVisible();
      await page
        .getByRole("button", { name: "Technique: Leg Press", exact: true })
        .click();
      await expect(page.locator(".mm-tutorial iframe")).toHaveCount(0);
      await page
        .getByRole("textbox", { name: "leg-press actual reps", exact: true })
        .fill("5");
      await page
        .getByRole("textbox", { name: "leg-press weight pounds", exact: true })
        .fill("10");
      await page
        .locator(".mm-exercise")
        .first()
        .getByRole("checkbox", { name: "Done", exact: true })
        .check();
      await stable(
        page,
        page.getByRole("button", { name: "Next movement", exact: true }),
      );
      await expect(page.locator(".mm-exercise")).toHaveCount(1);
      await expect(
        page.getByRole("textbox", {
          name: "leg-press actual reps",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Previous movement", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", {
          name: "leg-press actual reps",
          exact: true,
        }),
      ).toHaveValue("5");
      await stable(
        page,
        page.getByRole("button", {
          name: "Finish with what I did",
          exact: true,
        }),
      );
      await expect(
        page.getByRole("radio", { name: "Smaller version", exact: true }),
      ).toBeChecked();
      await assertSelectionContrast(page, ".mm-result-options label.selected");
      await assertLayout(page, `momentum-${name}-${colorScheme}-finish`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-finish.png`,
      });
      await stable(
        page,
        page.getByRole("button", { name: "Save result", exact: true }),
      );
      await expect(page.locator(".mm-session-result")).toContainText(
        "Smaller session recorded",
      );
      await expect
        .poll(
          () =>
            backend.privateSnapshot()?.journeys["synthetic-private-journey"]
              ?.logs["day-3"]?.outcome,
        )
        .toBe("modified");
      assert.equal(
        Object.values(
          backend.privateSnapshot().journeys["synthetic-private-journey"].logs[
            "day-3"
          ].sets,
        ).filter((s) => s.done).length,
        1,
      );
      assert.deepEqual(
        backend.snapshot().days,
        originalDays,
        "Momentum must not complete or change Recomp workout logs",
      );
      await assertLayout(page, `momentum-${name}-${colorScheme}-strength`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-strength.png`,
      });
      await tab(page, "Food");
      const meal = page.locator(".mm-meal").first();
      await stable(
        page,
        meal.getByRole("button", { name: "Make it", exact: true }),
      );
      for (const section of [
        "Ingredients",
        "Portion",
        "Cook",
        "Ingredients",
        "Portion",
      ]) {
        await stable(
          page,
          meal.getByRole("tab", { name: section, exact: true }),
        );
        await expect(
          meal.getByRole("tabpanel", { name: section, exact: true }),
        ).toBeVisible();
      }
      await stable(
        page,
        meal.getByRole("button", { name: "Swap", exact: true }),
      );
      await stable(page, meal.locator(".mm-swap-options button").first());
      await expect(meal.locator(".mm-swap-label")).toHaveText("Swap version");
      await meal
        .getByRole("button", { name: "Revert to original", exact: true })
        .click();
      await expect(meal.locator(".mm-swap-label")).toHaveCount(0);
      await stable(
        page,
        meal.getByRole("button", { name: "Mark eaten", exact: true }),
      );
      await expect
        .poll(
          () =>
            backend.privateSnapshot()?.meals["2026-10-07"]?.eaten?.breakfast,
        )
        .toBe(true);
      assert.deepEqual(
        backend.snapshot().dietDays,
        {},
        "Momentum meals do not mutate original Diet history",
      );
      await assertLayout(page, `momentum-${name}-${colorScheme}-food`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-food.png`,
      });
      await tab(page, "Boxing");
      await page.getByText("Compare gyms", { exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Quinit Boxing", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".mm-gym-list")).toContainText("$59");
      const appointment = page.locator(".mm-appointment").first();
      await appointment
        .getByText("Booking & reschedule", { exact: true })
        .click();
      await stable(page, appointment.getByRole("checkbox"));
      await appointment.locator("input[type=date]").fill("2026-10-08");
      await appointment
        .getByRole("button", { name: "Move appointment", exact: true })
        .click();
      await expect(page.locator(".mm-notice")).toContainText("48 hours");
      await appointment.locator("input[type=date]").fill("2026-10-10");
      await appointment
        .getByRole("button", { name: "Move appointment", exact: true })
        .click();
      await expect
        .poll(
          () =>
            backend.privateSnapshot()?.journeys["synthetic-private-journey"]
              ?.slots["day-5"]?.date,
        )
        .toBe("2026-10-10");
      assert.equal(
        backend.privateSnapshot().journeys["synthetic-private-journey"].logs[
          "day-5"
        ].booked,
        false,
      );
      await tab(page, "My 30 days");
      await expect(page.locator(".mm-calendar button")).toHaveCount(30);
      await expect(
        page.locator(".mm-calendar button").filter({ hasText: "Day 17" }),
      ).toContainText("Recovery instead of extra strength");
      await assertLayout(page, `momentum-${name}-${colorScheme}-calendar`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-calendar.png`,
      });
      await page
        .locator(".mm-calendar button")
        .filter({ hasText: "Day 30" })
        .click();
      await expect(
        page.getByRole("button", { name: "Begin session", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Save result", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Back to today", exact: true })
        .click();
      await expect(page.locator(".mm-session-result")).toContainText(
        "Smaller session recorded",
      );
      await tab(page, "Progress");
      await expect(page.locator(".mm-stats")).toContainText("1");
      await page.getByLabel("Morning weight today (kg)").fill("79.5");
      await page
        .getByRole("button", { name: "Save shared weigh-in", exact: true })
        .click();
      await expect
        .poll(() => backend.snapshot().metrics["2026-10-07"]?.weightKg)
        .toBe("79.5");
      assert.equal("metrics" in backend.privateSnapshot(), false);
      await tab(page, "Today");
      await expect(page.locator(".mm-session-result")).toContainText(
        "Smaller session recorded",
      );
      await feedback(page);
      await context.setOffline(true);
      await page
        .getByLabel("One coach note / what I learned (optional)")
        .fill("Synthetic offline coaching note");
      await expect(page.locator(".mm-save")).toContainText(/Offline/);
      const ciphertext = await page.evaluate(() =>
        Object.entries(localStorage).filter(([k]) =>
          k.startsWith("momentum-private-v1:"),
        ),
      );
      assert.ok(ciphertext.length);
      assert.doesNotMatch(
        JSON.stringify(ciphertext),
        /Synthetic offline coaching note/,
      );
      await context.setOffline(false);
      await page
        .getByRole("button", { name: "Retry Momentum sync", exact: true })
        .click();
      await expect
        .poll(
          () =>
            backend.privateSnapshot()?.journeys["synthetic-private-journey"]
              ?.logs["day-3"]?.note,
        )
        .toBe("Synthetic offline coaching note");
      const readiness = page.getByText("More feedback", {
        exact: true,
      });
      await stable(page, readiness);
      // Stop only this session. No setup form or account-wide lock is added.
      await stable(
        page,
        page.getByRole("checkbox", {
          name: "Dizziness or near-fainting symptoms",
          exact: true,
        }),
      );
      await expect(page.locator(".mm-notice")).toContainText(
        "Stop this session",
      );
      await expect
        .poll(
          () =>
            backend.privateSnapshot()?.journeys["synthetic-private-journey"]
              ?.logs["day-3"]?.outcome,
        )
        .toBe("stopped");
      assert.equal("clearance" in backend.privateSnapshot(), false);
      await tab(page, "Settings");
      await expect(page.locator(".momentum")).not.toContainText(
        /assessment|clearance|professional guidance/i,
      );
      await page
        .getByText("Pause, repeat or lighten this month", { exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Pause my journey", exact: true }),
      ).toBeEnabled();
      await tab(page, "Progress");
      await expect(page.locator(".momentum")).not.toContainText(
        /assessment|clearance|professional guidance/i,
      );
      await assertLayout(page, `momentum-${name}-${colorScheme}-pause`);
      await page.screenshot({
        path: `outputs/ui-check/momentum-${name}-${colorScheme}-pause.png`,
      });
      // A server-side revocation removes the private view AND cached ciphertext.
      backend.revokePrivate();
      await page
        .getByRole("button", { name: "Retry Momentum sync", exact: true })
        .click();
      await expect(page.locator(".momentum")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Private section" }),
      ).toBeVisible();
      assert.equal(
        await page.evaluate(
          () =>
            Object.keys(localStorage).filter((k) =>
              k.startsWith("momentum-private-v1:"),
            ).length,
        ),
        0,
      );
      await page
        .getByRole("button", { name: "Back to Coach Hub", exact: true })
        .click();
      await expect(page.locator(".momentum-entry")).toHaveCount(0);
      assert.deepEqual(
        errors,
        [],
        `Momentum ${name}/${colorScheme}: browser exceptions`,
      );
      await context.close();
      console.log(
        `PASS Momentum ${name}-${colorScheme}: private entry, real sets, media, meals/swaps, reschedule, shared weight, encrypted offline sync, stopped session, simplified settings, revocation`,
      );
    }
  }
  // First launch offers a real start immediately; opening the app alone does not activate it.
  const browser = await webkit.launch();
  browsers.push(browser);
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/Vancouver",
  });
  const seed = original(),
    backend = fixtureBackend(seed, {
      privateAccess: true,
      momentum: mm.emptyMomentum(),
    });
  const { page } = await prepare(context, backend, seed);
  await signIn(page);
  await openPrivate(page);
  await expect(page.getByLabel("Start Monday", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Current activity", { exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".mm-onboarding")).toHaveCount(0);
  await expect(page.locator(".momentum")).not.toContainText(
    /assessment|clearance|professional guidance/i,
  );
  await expect(
    page.getByRole("button", { name: "Activate my 30 days", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Decide later", exact: true }).click();
  await expect(page.locator(".mm-one-thing")).toContainText("Your next step");
  await page
    .getByText("Preparation checklist (optional)", { exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Plan regular meals", exact: true })
    .check();
  await expect
    .poll(() => backend.privateSnapshot()?.preparation["Plan regular meals"])
    .toBe(true);
  assert.equal(backend.privateSnapshot().activeJourneyId, null);
  await tab(page, "Settings");
  await page
    .getByRole("button", { name: "Activate my 30 days", exact: true })
    .click();
  await expect
    .poll(() => Boolean(backend.privateSnapshot()?.activeJourneyId))
    .toBe(true);
  assert.equal(backend.privateSnapshot().schemaVersion, 2);
  assert.equal("clearance" in backend.privateSnapshot(), false);
  await tab(page, "Today");
  await expect(page.locator(".mm-one-thing")).toContainText("Start the habit");
  await page
    .getByRole("button", { name: "Begin session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record session", exact: true })
    .click();
  await page.getByRole("button", { name: "Save result", exact: true }).click();
  await expect(page.locator(".mm-notice")).toContainText("walking minutes");
  await page.getByLabel("Minutes completed", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save result", exact: true }).click();
  await expect(page.locator(".mm-session-result")).toContainText(
    "Session completed",
  );
  await page.getByRole("button", { name: "Coach Hub", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".momentum-entry")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((k) =>
            k.startsWith("momentum-private-v1:"),
          ).length,
      ),
    )
    .toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("momentum-private-v1:"),
          ).length,
      ),
    )
    .toBe(0);
  const otherAccount = fixtureBackend(original(), {
    userId: "00000000-0000-4000-8000-000000000002",
    privateAccess: false,
  });
  await context.unroute(
    "https://tracker-fixture.supabase.co/**",
    backend.route,
  );
  await context.route(
    "https://tracker-fixture.supabase.co/**",
    otherAccount.route,
  );
  await signIn(page);
  await expect(page.locator(".account-row")).toContainText(
    "fixture@example.test",
  );
  await expect(page.locator(".momentum-entry")).toHaveCount(0);
  await expect(page.locator(".momentum")).toHaveCount(0);
  await context.close();
  console.log(
    "PASS Momentum first launch: start-date-first setup, linear walk, optional preparation, sign-out cache clearing and account-B denial",
  );

  // Recovery, a review day, observing a class and skipping all keep the same
  // three-stage route. None should demand a questionnaire or invent minutes.
  for (const [kind, day] of [
    ["recovery", "08"],
    ["boxing", "09"],
    ["review", "11"],
    ["skip", "12"],
  ]) {
    const c = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      reducedMotion: "reduce",
      timezoneId: "America/Vancouver",
    });
    const backend = fixtureBackend(original(), {
      privateAccess: true,
      momentum: active(),
    });
    const { page: p, errors } = await prepare(
      c,
      backend,
      original(),
      `2026-10-${day}T18:00:00Z`,
    );
    await signIn(p);
    await openPrivate(p);
    if (kind === "skip") {
      await p
        .getByRole("button", { name: "Skip session", exact: true })
        .click();
      await expect(
        p.getByRole("radio", { name: "Did not do it", exact: true }),
      ).toBeChecked();
    } else {
      await p
        .getByRole("button", { name: "Begin session", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Record session", exact: true })
        .click();
    }
    if (kind === "boxing") {
      await p
        .getByRole("checkbox", {
          name: "I attended and observed instead of participating",
          exact: true,
        })
        .check();
      await expect(
        p.getByRole("radio", { name: "Smaller version", exact: true }),
      ).toBeChecked();
    }
    await expect(
      p.getByLabel("Minutes completed", { exact: true }),
    ).toHaveCount(0);
    await p.getByRole("button", { name: "Save result", exact: true }).click();
    await expect(p.locator(".mm-session-result")).toContainText(
      kind === "skip"
        ? "Day recorded as skipped"
        : kind === "boxing"
          ? "Smaller session recorded"
          : "Session completed",
    );
    if (kind === "review") {
      await expect(
        p.getByRole("combobox", {
          name: "How did your body respond?",
          exact: true,
        }),
      ).not.toBeVisible();
      await p.getByText("Weekly check-in", { exact: true }).click();
      await expect(
        p.getByRole("combobox", {
          name: "How did your body respond?",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        p.getByLabel("What made attendance difficult?", { exact: true }),
      ).not.toBeVisible();
    }
    await assertLayout(p, `momentum-linear-${kind}`);
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log(
    "PASS Momentum linear recovery, optional review, observed class and no-reason skip",
  );

  // A complete workout still requires every real set. Revisiting the app resumes
  // at the saved result; correcting one set retains the other performed work.
  const fullContext = await browser.newContext({
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    timezoneId: "America/Vancouver",
  });
  const fullBackend = fixtureBackend(original(), {
    privateAccess: true,
    momentum: active(),
  });
  const { page: full } = await prepare(
    fullContext,
    fullBackend,
    original(),
    "2026-10-07T18:00:00Z",
  );
  await signIn(full);
  await openPrivate(full);
  await full
    .getByRole("button", { name: "Begin session", exact: true })
    .click();
  const exerciseIds = plan.strengthTemplates["strength-a"].map((e) => e.id);
  for (const id of exerciseIds) {
    await expect(full.locator(".mm-exercise")).toHaveCount(1);
    await full
      .getByRole("textbox", { name: `${id} actual reps`, exact: true })
      .fill("6");
    await full.getByRole("checkbox", { name: "Done", exact: true }).check();
    await full
      .getByRole("button", {
        name: id === exerciseIds.at(-1) ? "Review session" : "Next movement",
        exact: true,
      })
      .click();
  }
  await expect(
    full.getByRole("radio", { name: "Completed as planned", exact: true }),
  ).toBeChecked();
  await full.getByRole("button", { name: "Save result", exact: true }).click();
  await expect(full.locator(".mm-session-result")).toContainText(
    "Session completed",
  );
  await expect
    .poll(
      () =>
        fullBackend.privateSnapshot()?.journeys["synthetic-private-journey"]
          .logs["day-3"]?.outcome,
    )
    .toBe("planned");
  await tab(full, "Food");
  await tab(full, "Today");
  await expect(full.locator(".mm-session-result")).toContainText(
    "Session completed",
  );
  await full.getByRole("button", { name: "Edit result", exact: true }).click();
  await step(full, "Session");
  for (let i = 1; i < exerciseIds.length; i++)
    await full
      .getByRole("button", { name: "Next movement", exact: true })
      .click();
  await full.getByRole("checkbox", { name: "Done", exact: true }).uncheck();
  await tab(full, "Food");
  await tab(full, "Today");
  await expect(
    full.getByRole("textbox", { name: "dead-bug actual reps", exact: true }),
  ).toHaveValue("6");
  await expect(full.locator(".mm-movement-position")).toContainText(
    "Movement 4 of 4",
  );
  // The working UI updates immediately; wait for the debounced server write
  // before asserting persisted history, rather than racing that boundary.
  await expect
    .poll(
      () =>
        Object.values(
          fullBackend.privateSnapshot()?.journeys["synthetic-private-journey"]
            .logs["day-3"]?.sets ?? {},
        ).filter((s) => s.done).length,
    )
    .toBe(3);
  await fullContext.close();
  console.log(
    "PASS Momentum full linear workout, saved result, correction and first-unfinished resume",
  );

  // Two independent browser stores go offline, edit separate fields, then
  // reconnect. The real hook must merge against its own last acknowledged base.
  const sharedBackend = fixtureBackend(original(), {
    privateAccess: true,
    momentum: active(),
  });
  const devices = [],
    pages = [];
  for (let i = 0; i < 2; i++) {
    const device = await browser.newContext({
      viewport: { width: 402, height: 874 },
      isMobile: true,
      hasTouch: true,
      timezoneId: "America/Vancouver",
      reducedMotion: "reduce",
    });
    devices.push(device);
    const { page: p } = await prepare(
      device,
      sharedBackend,
      original(),
      "2026-10-07T18:00:00Z",
    );
    await signIn(p);
    await openPrivate(p);
    pages.push(p);
    await expect(p.locator(".mm-save")).toContainText("Private data synced");
    await p.getByRole("button", { name: "Begin session", exact: true }).click();
    await device.setOffline(true);
  }
  await pages[0]
    .getByRole("textbox", { name: "leg-press actual reps", exact: true })
    .fill("6");
  await step(pages[1], "Finish");
  await feedback(pages[1]);
  await pages[1]
    .getByLabel("One coach note / what I learned (optional)")
    .fill("Synthetic device B note");
  await devices[1].setOffline(false);
  await pages[1]
    .getByRole("button", { name: "Retry Momentum sync", exact: true })
    .click();
  await expect
    .poll(
      () =>
        sharedBackend.privateSnapshot()?.journeys["synthetic-private-journey"]
          .logs["day-3"]?.note,
    )
    .toBe("Synthetic device B note");
  await devices[0].setOffline(false);
  await pages[0]
    .getByRole("button", { name: "Retry Momentum sync", exact: true })
    .click();
  await expect
    .poll(
      () =>
        sharedBackend.privateSnapshot()?.journeys["synthetic-private-journey"]
          .logs["day-3"]?.sets["leg-press"]?.reps,
    )
    .toBe("6");
  assert.equal(
    sharedBackend.privateSnapshot().journeys["synthetic-private-journey"].logs[
      "day-3"
    ].note,
    "Synthetic device B note",
  );
  await pages[1]
    .getByRole("button", { name: "Retry Momentum sync", exact: true })
    .click();
  await step(pages[1], "Session");
  await expect(
    pages[1].getByRole("textbox", {
      name: "leg-press actual reps",
      exact: true,
    }),
  ).toHaveValue("6");
  for (const device of devices) await device.close();
  console.log(
    "PASS Momentum two-device offline edits merge without overwriting the other device's notes or actual sets",
  );
}
