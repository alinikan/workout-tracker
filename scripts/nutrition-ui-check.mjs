import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";

/** Synthetic accounts exercise the real profile -> portions -> groceries ->
 * saved meals -> daily evidence -> weekly review path. No production API runs. */
export async function runNutritionChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
  settlePresentation,
}) {
  const nutrition = await server.ssrLoadModule(
    "/src/features/nutrition/model.ts",
  );
  const mm = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const trials = await server.ssrLoadModule("/src/features/momentum/trial.ts");
  const start = "2026-10-05";
  const privateData = () => {
    const data = mm.emptyMomentum(),
      j = trials.makeHomeJourney(
        start,
        "nutrition-home",
        "2026-10-04T18:00:00Z",
      );
    data.onboarded = true;
    data.activeJourneyId = j.id;
    data.journeys[j.id] = j;
    return data;
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
  const profile = async (page) => {
    const coach = page.locator(".nutrition-coach");
    await coach.getByLabel("Age", { exact: true }).fill("30");
    await coach.getByLabel("Height (cm)", { exact: true }).fill("175");
    await coach.getByLabel("Starting weight (kg)", { exact: true }).fill("80");
    await coach.getByLabel("Usual daily steps", { exact: true }).fill("2500");
    await coach
      .getByLabel("Calorie equation", { exact: true })
      .selectOption("male");
    assert.ok(
      await coach
        .getByLabel("Calorie equation", { exact: true })
        .evaluate((el) => el.getBoundingClientRect().height >= 44),
      "The equation selector must have a phone-friendly tap height",
    );
    await coach
      .getByRole("button", { name: "Calculate my target", exact: true })
      .click();
    await expect(coach.locator(".nc-targets")).toContainText("1,950");
    return coach;
  };
  for (const [name, engine, viewport] of [
    ["compact", webkit, { width: 375, height: 812 }],
    ["iphone", webkit, { width: 402, height: 874 }],
    ["desktop", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        timezoneId: "America/Vancouver",
        reducedMotion: "reduce",
        isMobile: viewport.width < 720,
        hasTouch: viewport.width < 720,
      });
      const backend = fixtureBackend(model.emptyStore(start), {
        privateAccess: true,
        momentum: privateData(),
      });
      const { page, errors } = await prepare(context, backend);
      await signIn(page);
      const coach = await profile(page);
      await expect
        .poll(() => Object.keys(backend.snapshot().nutrition.profiles).length)
        .toBe(1);
      assert.equal(
        Object.keys(backend.snapshot().metrics).length,
        0,
        "A starting weight must not fabricate a morning measurement",
      );
      await coach
        .locator("summary")
        .filter({ hasText: "Daily food & activity check-in" })
        .click();
      await coach
        .getByLabel("Did you follow the listed portions?", { exact: true })
        .selectOption("yes");
      await coach
        .getByLabel("Energy today", { exact: true })
        .selectOption("okay");
      for (const select of await coach.locator("select").all()) {
        assert.ok(
          await select.evaluate(
            (el) => el.getBoundingClientRect().height >= 44,
          ),
          "Daily check-in selectors must not collapse into short Safari controls",
        );
      }
      await coach
        .getByRole("button", { name: "Save check-in", exact: true })
        .click();
      await expect(coach.getByRole("alert")).toContainText(
        "Unknown is not zero",
      );
      await coach
        .getByLabel("Extra food or drinks (kcal)", { exact: true })
        .fill("0");
      await coach
        .getByRole("button", { name: "Save check-in", exact: true })
        .click();
      await expect
        .poll(() => backend.snapshot().nutrition.checkins[start]?.intake)
        .toBe(null);
      await coach
        .getByRole("button", { name: "Today's portions", exact: true })
        .click();
      await expect(page.locator(".mp-personal-target")).toContainText(
        "1,950 kcal",
      );
      for (const meal of ["Breakfast", "Lunch", "Snack", "Dinner"])
        await page
          .getByRole("button", { name: `Mark eaten: ${meal}`, exact: true })
          .click();
      await navigate(page, "Coach");
      await page
        .locator(".nutrition-coach summary")
        .filter({ hasText: "Daily food & activity check-in" })
        .click();
      await page
        .locator(".nutrition-coach")
        .getByRole("button", { name: "Update check-in", exact: true })
        .click();
      await expect
        .poll(() => backend.snapshot().nutrition.checkins[start]?.intake)
        .toBeGreaterThan(1500);
      await settlePresentation(page);
      await assertLayout(page, `nutrition-${name}-${colorScheme}`);
      await page.locator(".nutrition-coach").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `outputs/ui-check/nutrition-${name}-${colorScheme}.png`,
      });
      await page.locator(".momentum-entry").click();
      await page
        .getByRole("navigation", { name: "Momentum sections" })
        .getByRole("button", { name: "Meals", exact: true })
        .click();
      await expect(page.locator(".mp-personal-target")).toContainText(
        "1,950 kcal",
      );
      await expect(
        page.getByRole("button", { name: "Mark eaten: Lunch", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Back to Coach Hub", exact: true })
        .click();
      await page.reload();
      await expect(page.locator(".nutrition-coach .nc-targets")).toContainText(
        "1,950",
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS nutrition ${name}/${colorScheme}: profile, real recipe quantities, no invented weigh-in, honest extras, saved meal evidence, shared Momentum target and reload`,
      );
    }
  }

  const browser = await chromium.launch();
  browsers.push(browser);
  const seed = model.emptyStore(start);
  seed.nutrition = nutrition.saveProfile(
    seed.nutrition,
    {
      age: 30,
      heightCm: 175,
      startWeightKg: 80,
      baselineSteps: 2500,
      equation: "male",
    },
    start,
    [],
    "2026-10-04T18:00:00.000Z",
  );
  const backend = fixtureBackend(seed, {
    privateAccess: true,
    momentum: privateData(),
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
    const result = await prepare(context, backend);
    pages.push(result.page);
    errors.push(result.errors);
    await signIn(result.page);
  }
  const [a, b] = pages;
  await navigate(a, "Diet");
  await a.getByRole("tab", { name: "Cook batch", exact: true }).click();
  await a.getByRole("checkbox", { name: /Batch prepared/ }).check();
  await expect
    .poll(() => backend.snapshot().mealPrep.blocks[start]?.preparedSignature)
    .toBeTruthy();
  const before = backend.snapshot().mealPrep.blocks[start];
  const ingredients = await a
    .getByRole("region", { name: "Full batch ingredients", exact: true })
    .innerText();
  await navigate(a, "Coach");
  await contexts[0].setOffline(true);
  await a
    .locator(".nutrition-coach summary")
    .filter({ hasText: "Daily food & activity check-in" })
    .click();
  await a.getByLabel("Energy today", { exact: true }).selectOption("okay");
  await a.getByLabel("Actual steps (optional)", { exact: true }).fill("3200");
  await a.getByRole("button", { name: "Save check-in", exact: true }).click();
  await b
    .getByRole("button", { name: "Edit nutrition profile", exact: true })
    .click();
  await b.getByLabel("Usual daily steps", { exact: true }).fill("6000");
  await b
    .getByRole("button", { name: "Save revised target", exact: true })
    .click();
  await expect(b.locator(".nutrition-coach .nc-targets")).toContainText(
    "2,100",
  );
  await contexts[0].setOffline(false);
  await a.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(a.locator(".nutrition-coach .nc-targets")).toContainText(
    "2,100",
  );
  await expect
    .poll(() => backend.snapshot().nutrition.checkins[start]?.steps)
    .toBe(3200);
  await navigate(a, "Diet");
  await a.getByRole("tab", { name: "Cook batch", exact: true }).click();
  await expect(
    a.getByRole("region", { name: "Full batch ingredients", exact: true }),
  ).toHaveText(ingredients, { useInnerText: true });
  assert.deepEqual(backend.snapshot().mealPrep.blocks[start], before);
  errors.forEach((e) => assert.deepEqual(e, []));
  for (const context of contexts) await context.close();
  console.log(
    "PASS nutrition two-device offline check-in/profile merge and immutable calibrated cooked batch",
  );

  // A real UI proposal uses complete saved food snapshots and three weeks of
  // synthetic measurements. Applying it cannot rewrite yesterday's target.
  const reviewSeed = model.emptyStore(start),
    d = privateData();
  reviewSeed.nutrition = seed.nutrition;
  for (let i = 0; i < 21; i++) {
    const date = new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10);
    reviewSeed.metrics[date] = {
      weightKg: "80",
      weight: "",
      weightForgotten: false,
      note: "",
      photoReminderDone: false,
    };
    const log = {
      meals: {},
      recipes: {},
      portions: {},
      swaps: {},
      notes: "",
      completed: true,
    };
    for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
      log.meals[slot] = true;
      log.recipes[slot] = "prep-overnight-oats";
      log.portions[slot] = {
        calories: 450,
        protein: 36,
        plate: ["Synthetic saved serving"],
      };
    }
    reviewSeed.dietDays[date] = log;
    const food = nutrition.foodEvidence(
      { eaten: log.meals, recipes: log.recipes, portions: log.portions },
      "Nutrition",
    );
    reviewSeed.nutrition = nutrition.saveCheckin(
      reviewSeed.nutrition,
      date,
      { matches: "yes", extras: 0, energy: "okay", steps: 2500 },
      food,
      "2026-10-26",
      `${date}T18:00:00.000Z`,
    );
  }
  const reviewBackend = fixtureBackend(reviewSeed, {
    privateAccess: true,
    momentum: d,
  });
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    timezoneId: "America/Vancouver",
    reducedMotion: "reduce",
  });
  const { page, errors: reviewErrors } = await prepare(
    context,
    reviewBackend,
    undefined,
    "2026-10-26T18:00:00Z",
  );
  await signIn(page);
  await expect(page.locator(".nutrition-coach")).toContainText(
    "A small next-batch adjustment is available",
  );
  const coach = page.locator(".nutrition-coach");
  const adjustment = coach.getByRole("button", {
    name: "Apply -100 kcal to uncooked portions",
    exact: true,
  });
  await coach
    .locator("summary")
    .filter({ hasText: "Daily food & activity check-in" })
    .click();
  await coach
    .getByLabel("Energy today", { exact: true })
    .selectOption("unwell");
  await expect(adjustment).toHaveCount(0);
  await expect(coach).toContainText("Protect recovery; no food cut");
  await coach
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect
    .poll(
      () => reviewBackend.snapshot().nutrition.checkins["2026-10-26"]?.energy,
    )
    .toBe("unwell");
  await expect(adjustment).toHaveCount(0);
  await coach.getByLabel("Energy today", { exact: true }).selectOption("okay");
  await coach
    .getByRole("button", { name: "Update check-in", exact: true })
    .click();
  await expect(adjustment).toBeVisible();
  await page
    .getByRole("button", {
      name: "Apply -100 kcal to uncooked portions",
      exact: true,
    })
    .click();
  await expect(page.locator(".nutrition-coach .nc-targets")).toContainText(
    "1,850",
  );
  await expect
    .poll(() => Object.keys(reviewBackend.snapshot().nutrition.plans).length)
    .toBe(2);
  assert.equal(
    nutrition.planFor(reviewBackend.snapshot().nutrition, "2026-10-25")
      .restCalories,
    1800,
  );
  assert.equal(
    nutrition.planFor(reviewBackend.snapshot().nutrition, "2026-10-26")
      .restCalories,
    1700,
  );
  assert.deepEqual(reviewErrors, []);
  await context.close();
  console.log(
    "PASS nutrition evidence-backed review, explicit single adjustment and unchanged historical targets",
  );
}
