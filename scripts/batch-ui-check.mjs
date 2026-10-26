import assert from "node:assert/strict";
import { chromium, expect } from "playwright/test";

/** Two real browser storage contexts share only the synthetic backend. This
 * verifies the React -> both account documents -> reload path, not a mocked
 * planner callback. No real profile or production endpoint is used. */
export async function runBatchChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
}) {
  const browser = await chromium.launch();
  browsers.push(browser);
  const types = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const plan = await server.ssrLoadModule("/src/features/momentum/plan.ts");
  const seed = model.emptyStore("2026-10-26");
  seed.dietDays["2026-10-27"] = {
    completed: false,
    meals: { breakfast: false, lunch: false, snack: false, dinner: false },
    swaps: { breakfast: "egg-wrap-orange" },
    notes: "A saved earlier choice",
  };
  const privateData = types.emptyMomentum();
  const journey = plan.makeJourney("2026-10-26", "batch-fixture");
  privateData.onboarded = true;
  privateData.activeJourneyId = journey.id;
  privateData.journeys[journey.id] = journey;
  privateData.meals["2026-10-27"] = {
    swaps: { breakfast: "egg-wrap-orange" },
    eaten: {},
  };
  const backend = fixtureBackend(seed, {
    privateAccess: true,
    momentum: privateData,
  });
  const contexts = [],
    pages = [],
    failures = [];
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({
      viewport: { width: 402, height: 874 },
      timezoneId: "America/Vancouver",
      reducedMotion: "reduce",
    });
    contexts.push(context);
    const { page, errors } = await prepare(
      context,
      backend,
      undefined,
      "2026-10-26T19:00:00Z",
    );
    failures.push(errors);
    await page
      .getByLabel("Email", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".account-row")).toContainText(
      "fixture@example.test",
    );
    await expect(page.locator(".device-save-status")).toContainText(/Synced/);
    pages.push(page);
  }
  const [a, b] = pages;
  const planner = (page) => page.locator(".meal-prep-planner");
  const section = (page, name) =>
    planner(page).getByRole("tab", { name, exact: true }).click();
  const sync = async (page) => {
    await navigate(page, "Coach");
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.locator(".device-save-status")).toContainText(/Synced/);
  };
  await navigate(a, "Diet");
  await section(a, "Cook batch");
  await planner(a).getByRole("button", { name: "3 days", exact: true }).click();
  const mains = planner(a).getByRole("region", {
    name: "Lunch + dinner",
    exact: true,
  });
  await mains.getByRole("button", { name: /^Swap/ }).click();
  await mains
    .locator(".mp-swap-option")
    .filter({ hasText: "Beef + rice" })
    .click();
  await expect
    .poll(() => backend.snapshot().mealPrep.blocks["2026-10-26"]?.mainId)
    .toBe("prep-beef-rice");
  await sync(b);
  await navigate(b, "Diet");
  await expect(
    planner(b)
      .getByRole("article", { name: "Lunch", exact: true })
      .locator("h3"),
  ).toContainText("Beef");

  // An offline meal and an online grocery purchase are independent edits.
  await contexts[1].setOffline(true);
  await planner(b)
    .getByRole("button", { name: "Mark eaten: Lunch", exact: true })
    .click();
  await section(a, "To buy");
  await planner(a).locator(".mp-grocery input").first().check();
  await expect
    .poll(() =>
      Object.values(backend.snapshot().mealPrep.checked).some(Boolean),
    )
    .toBe(true);
  await contexts[1].setOffline(false);
  await sync(b);
  await expect
    .poll(() => backend.snapshot().dietDays["2026-10-26"]?.meals.lunch)
    .toBe(true);
  assert.ok(Object.values(backend.snapshot().mealPrep.checked).some(Boolean));
  assert.equal(
    backend.snapshot().dietDays["2026-10-26"].recipes.lunch,
    "prep-beef-rice",
  );
  assert.ok(
    backend
      .snapshot()
      .dietDays["2026-10-26"].portions.lunch.plate.some((line) =>
        line.includes("beef"),
      ),
  );
  await b.reload();
  await navigate(b, "Diet");
  await expect(
    planner(b).getByRole("button", { name: "Reopen Lunch", exact: true }),
  ).toBeVisible();
  await b
    .locator(".diet-week-strip")
    .getByRole("button")
    .filter({ hasText: "27" })
    .click();
  await expect(
    planner(b)
      .locator(".prep-legacy-meal")
      .getByRole("button", { name: "Mark eaten", exact: true }),
  ).toBeDisabled();
  await b
    .locator(".diet-date-actions")
    .getByRole("button", { name: "Today", exact: true })
    .click();

  // Preparation freezes the physical batch across a shared morning weight edit.
  await section(b, "Cook batch");
  await planner(b)
    .getByRole("checkbox", { name: /Batch prepared/ })
    .check();
  await expect
    .poll(() => backend.snapshot().mealPrep.blocks["2026-10-26"]?.preparedAt)
    .toBeTruthy();
  const original = structuredClone(
    backend.snapshot().mealPrep.blocks["2026-10-26"],
  );
  const ingredients = await planner(b)
    .getByRole("region", { name: "Full batch ingredients", exact: true })
    .innerText();
  await navigate(b, "Coach");
  await b.getByLabel("Morning weight (kg)", { exact: true }).fill("105");
  await expect
    .poll(() => backend.snapshot().metrics["2026-10-26"]?.weightKg)
    .toBe("105");
  await navigate(b, "Diet");
  await section(b, "Cook batch");
  await expect(
    planner(b).getByRole("region", {
      name: "Full batch ingredients",
      exact: true,
    }),
  ).toHaveText(ingredients, { useInnerText: true });
  assert.deepEqual(backend.snapshot().mealPrep.blocks["2026-10-26"], original);

  // Momentum uses that same prepared dish, while its eaten checks stay private.
  await navigate(b, "Coach");
  await b.locator(".momentum-entry").click();
  await b
    .getByRole("navigation", { name: "Momentum sections" })
    .getByRole("button", { name: "Meals", exact: true })
    .click();
  await expect(
    planner(b)
      .getByRole("article", { name: "Lunch", exact: true })
      .locator("h3"),
  ).toContainText("Beef");
  await planner(b)
    .getByRole("button", { name: "Mark eaten: Breakfast", exact: true })
    .click();
  await expect
    .poll(() => backend.privateSnapshot().meals["2026-10-26"]?.eaten.breakfast)
    .toBe(true);
  assert.equal(
    backend.snapshot().dietDays["2026-10-26"].meals.breakfast,
    false,
  );
  await section(b, "To buy");
  await expect(planner(b)).toContainText("Nothing to buy");
  await planner(b).getByLabel("Meal date", { exact: true }).fill("2026-10-27");
  await section(b, "Eat today");
  await expect(
    planner(b)
      .locator(".prep-legacy-meal")
      .getByRole("button", { name: "Mark eaten", exact: true }),
  ).toBeDisabled();
  await planner(b).getByLabel("Meal date", { exact: true }).fill("2026-10-25");
  await expect(planner(b).locator(".prep-legacy-meal")).toHaveCount(4);
  await expect(planner(b)).toContainText(
    "Saved meals from before batch planning",
  );
  await planner(b).getByLabel("Meal date", { exact: true }).fill("2026-10-26");
  await assertLayout(b, "batch-shared-momentum");
  await b.screenshot({ path: "outputs/ui-check/batch-shared-momentum.png" });
  failures.forEach((errors) => assert.deepEqual(errors, []));
  for (const context of contexts) await context.close();
  console.log(
    "PASS batch: cross-device choices, offline meal/groceries, reload, frozen cooked quantities, shared Momentum plan and separate eaten records",
  );
}
