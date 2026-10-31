import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The retired Momentum UI is intentionally absent. These tests exercise its
 * replacement through the real account store, including legacy import, live
 * attendance, schedule changes and a second independent browser storage area. */
export async function runCoachingChecks({
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
  const source = () => {
    const data = types.emptyMomentum(),
      j = trial.makeHomeJourney(
        "2026-10-28",
        "coach-legacy",
        "2026-10-27T18:00Z",
      );
    data.activeJourneyId = j.id;
    data.journeys[j.id] = j;
    data.onboarded = true;
    j.logs["day-1"] = {
      ...types.newLog(),
      plannedActivity: "strength-a",
      outcome: "modified",
      sets: {
        "machine-chest-press": { done: true, weight: "20", reps: "8" },
        "machine-chest-press-2": { done: false, weight: "20", reps: "7" },
      },
    };
    data.meals["2026-10-28"] = { swaps: {}, eaten: { breakfast: true } };
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
  const editor = (page) => page.locator(".coach-plan");
  const edit = async (page) => {
    await navigate(page, "Coach");
    await editor(page)
      .getByRole("button", { name: "Change training schedule", exact: true })
      .click();
  };
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
        momentum: source(),
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
        "2026-10-28T19:00Z",
      );
      await signIn(page);
      await expect
        .poll(() => backend.snapshot().coaching.legacyImported)
        .toBe(true);
      assert.equal(
        backend.snapshot().days["2026-10-28"].exercises[
          "machine-chest-press"
        ][0].weight,
        "20",
      );
      assert.equal(backend.snapshot().days["2026-10-28"].completed, false);
      assert.equal(
        backend.snapshot().dietDays["2026-10-28"].meals.breakfast,
        true,
      );
      await expect(page.locator(".momentum-entry")).toHaveCount(0);
      await expect(editor(page).locator("dd").first()).toHaveText("0");
      await navigate(page, "Today");
      await page
        .getByRole("button", { name: "Mark Complete", exact: true })
        .click();
      await expect
        .poll(() => backend.snapshot().days["2026-10-28"].completed)
        .toBe(true);
      await navigate(page, "Gym");
      await expect(page.locator(".gym-session-summary")).toBeVisible();
      await navigate(page, "Coach");
      await expect(editor(page).locator("dd").first()).toHaveText("1");
      await edit(page);
      await editor(page)
        .getByLabel("Training setup", { exact: true })
        .selectOption("trial");
      await editor(page)
        .getByLabel("Trial date", { exact: true })
        .fill("2026-11-03");
      await editor(page)
        .getByLabel("Class time (optional)", { exact: true })
        .fill("18:15");
      await expect(page.locator(".coach-schedule-preview")).toContainText(
        "Muay Thai trial",
      );
      await assertLayout(page, `coach-${name}-${colorScheme}-trial`);
      await page.screenshot({
        path: `outputs/ui-check/coach-${name}-${colorScheme}-trial.png`,
        fullPage: true,
      });
      await editor(page)
        .getByRole("button", { name: "Save schedule", exact: true })
        .click();
      await expect
        .poll(() =>
          Object.values(backend.snapshot().coaching.choices).some(
            (c) => c.mode === "trial" && c.date === "2026-11-03",
          ),
        )
        .toBe(true);
      await editor(page).locator(".coach-plan-upcoming > summary").click();
      await editor(page).locator(".coach-plan-week button").last().click();
      await expect(page.locator("#today-heading")).toHaveText(
        "Muay Thai trial",
      );
      await expect(
        page.getByRole("button", { name: "Mark Complete", exact: true }),
      ).toBeDisabled();
      await navigate(page, "Gym");
      await expect(page.locator(".gym-day-context")).toContainText(
        "Home Strength A",
      );
      await navigate(page, "Diet");
      await page
        .locator(".diet-day-button")
        .filter({ has: page.locator("strong").filter({ hasText: /^3$/ }) })
        .click();
      await expect(page.locator(".meal-prep-planner")).toContainText(
        "Fuel for your trial",
      );
      await expect(page.locator(".meal-prep-planner")).toContainText("18:15");
      await edit(page);
      await editor(page)
        .getByLabel("Trial date", { exact: true })
        .fill("2026-11-04");
      await editor(page)
        .getByRole("button", { name: "Save schedule", exact: true })
        .click();
      await edit(page);
      await editor(page)
        .getByLabel("Training setup", { exact: true })
        .selectOption("regular");
      await editor(page)
        .getByLabel("Classes start on", { exact: true })
        .fill("2026-11-04");
      await editor(page).getByLabel("Mon", { exact: true }).check();
      await editor(page)
        .getByLabel("Class level", { exact: true })
        .selectOption("beginner");
      await editor(page)
        .getByRole("button", { name: "Save schedule", exact: true })
        .click();
      await expect(editor(page)).toContainText("Monday & Wednesday");
      await expect
        .poll(() =>
          Object.values(backend.snapshot().coaching.choices).some(
            (c) => c.mode === "regular",
          ),
        )
        .toBe(true);
      await page.reload();
      await expect(editor(page)).toContainText("Monday & Wednesday");
      await expect(editor(page).locator("dd").first()).toHaveText("1");
      // A second device receives the same single schedule and progress document.
      const other = await browser.newContext({
        viewport,
        colorScheme,
        timezoneId: "America/Vancouver",
        reducedMotion: "reduce",
      });
      const second = await prepare(
        other,
        backend,
        undefined,
        "2026-10-28T19:00Z",
      );
      await signIn(second.page);
      await expect(editor(second.page)).toContainText("Monday & Wednesday");
      await expect(editor(second.page).locator("dd").first()).toHaveText("1");
      await edit(second.page);
      await editor(second.page)
        .getByLabel("Training setup", { exact: true })
        .selectOption("home");
      await other.setOffline(true);
      await editor(second.page)
        .getByRole("button", { name: "Save schedule", exact: true })
        .click();
      await expect(editor(second.page)).toContainText("No classes assumed");
      await other.setOffline(false);
      await second.page
        .getByRole("button", { name: "Sync now", exact: true })
        .click();
      await expect(second.page.locator(".device-save-status")).toContainText(
        /Synced/,
      );
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await expect(editor(page)).toContainText("No classes assumed");
      await navigate(page, "Today");
      await page
        .getByRole("button", { name: "Week plan", exact: true })
        .click();
      const stat = page.locator(".progress-strip .quick-stat").last();
      await expect(stat).toContainText("1/52 lifts");
      const bounds = await stat.evaluate((el) => ({
        label: el.querySelector("span").getBoundingClientRect().toJSON(),
        value: el.querySelector("strong").getBoundingClientRect().toJSON(),
      }));
      assert.ok(
        bounds.label.bottom <= bounds.value.top + 1,
        "Progress label and value overlap",
      );
      const contrast = await new AxeBuilder({ page })
        .include(".week-planner")
        .include(".progress-strip")
        .withRules(["color-contrast"])
        .analyze();
      assert.deepEqual(
        contrast.violations,
        [],
        "Completed date and progress contrast",
      );
      await assertLayout(page, `coach-${name}-${colorScheme}-week`);
      await page.screenshot({
        path: `outputs/ui-check/coach-${name}-${colorScheme}-week.png`,
        fullPage: true,
      });
      assert.deepEqual(second.errors, []);
      await other.close();
      // Actual day rollover: the walk is missed, but the rest day closes itself.
      await page.clock.setFixedTime(new Date("2026-10-31T19:00Z"));
      await page.reload();
      await expect
        .poll(() => backend.snapshot().days["2026-10-30"]?.completed)
        .toBe(true);
      assert.equal(
        backend.snapshot().days["2026-10-30"].daySkipReason,
        undefined,
      );
      assert.equal(
        backend.snapshot().days["2026-10-29"].daySkipReason,
        "forgotten",
      );
      await navigate(page, "Today");
      await page.locator(".today-calendar > summary").click();
      await page
        .locator(".today-day-switcher .today-day-button")
        .nth(2)
        .click();
      await expect(
        page.locator(".today-command-panel .rest-day-note"),
      ).toBeVisible();
      await expect(
        page.locator(".today-command-panel .complete-button"),
      ).toHaveCount(0);
      await expect(
        page.locator(".today-command-panel .day-skip-button"),
      ).toHaveCount(0);
      await assertLayout(page, `coach-${name}-${colorScheme}-rest`);
      await navigate(page, "Coach");
      await page.clock.setFixedTime(new Date("2026-11-02T19:00Z"));
      await page.reload();
      await expect(page.locator(".hub-choice-card.workout")).toContainText("Planned rest");
      await expect(page.getByRole("progressbar", { name: "Today's workout progress", exact: true })).toHaveCount(0);
      await expect(page.locator(".hub-mini-grid > div").first().locator("strong")).toHaveText("1");
      await page
        .getByRole("button", { name: "Start fresh", exact: true })
        .click();
      await page
        .getByLabel("New start date", { exact: true })
        .fill("2026-11-03");
      await page
        .getByLabel("Type RESET to confirm", { exact: true })
        .fill("RESET");
      await page
        .getByRole("button", { name: "Reset & start fresh", exact: true })
        .click();
      await expect
        .poll(() => backend.snapshot().program.startedOn)
        .toBe("2026-11-03");
      assert.equal(backend.snapshot().coaching.homeFrom, "2026-11-03");
      assert.deepEqual(backend.snapshot().coaching.choices, {});
      await expect(editor(page).locator("dd").first()).toHaveText("0");
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS unified Coach ${name}/${colorScheme}: migration, shared attendance, trial meals, recurrence, offline/two-device sync, progress/contrast, rest rollover and fresh start`,
      );
    }
  }
  const standalone = await chromium.launch();
  browsers.push(standalone);
  const fresh = fixtureBackend(model.emptyStore("2026-10-28"), {
    noPrivateModule: true,
  });
  const standaloneContext = await standalone.newContext({
    viewport: { width: 402, height: 874 },
    timezoneId: "America/Vancouver",
    reducedMotion: "reduce",
  });
  const result = await prepare(
    standaloneContext,
    fresh,
    undefined,
    "2026-10-28T19:00Z",
  );
  await signIn(result.page);
  await edit(result.page);
  await editor(result.page)
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect
    .poll(() => fresh.snapshot().coaching.homeFrom)
    .toBe("2026-10-28");
  await navigate(result.page, "Today");
  await expect(result.page.locator("#today-heading")).toHaveText(
    "Home Strength A",
  );
  assert.equal(
    fresh.privateSnapshot(),
    null,
    "No legacy module or private row is needed for Coach planning",
  );
  assert.deepEqual(result.errors, []);
  await standaloneContext.close();
  console.log(
    "PASS fresh-install Coach planning without any legacy private tables/functions",
  );
}
