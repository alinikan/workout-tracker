import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";

export async function runAlternatingChecks({
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
  settlePresentation,
}) {
  const start = "2026-11-19",
    today = "2026-11-21";
  for (const [engine, width, colorScheme] of [
    [webkit, 402, "dark"],
    [chromium, 1440, "light"],
  ]) {
    const seed = model.emptyStore(start);
    seed.coaching = {
      version: 1,
      homeFrom: start,
      legacyImported: true,
      choices: {},
    };
    const first = model.coachPlanDays(
      model.buildPlanDays(start),
      seed.coaching,
      {},
      today,
    )[0];
    seed.days[start] = {
      ...model.completePlanDay(first, model.normalizeDayLog()),
      sessionSnapshot: first.session,
    };
    seed.dietDays[start] = { meals: { lunch: true }, notes: "Historical meal" };
    const backend = fixtureBackend(seed);
    const browser = await engine.launch();
    browsers.push(browser);
    const context = await browser.newContext({
      viewport: { width, height: 874 },
      colorScheme,
      timezoneId: "America/Vancouver",
      reducedMotion: "reduce",
      isMobile: width < 720,
      hasTouch: width < 720,
    });
    const { page, errors } = await prepare(
      context,
      backend,
      undefined,
      `${today}T19:00:00Z`,
    );
    await page
      .getByRole("button", { name: "Account and sync settings", exact: true })
      .click();
    await page
      .getByLabel("Email", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".account-row")).toContainText(
      "fixture@example.test",
    );
    const coach = page.locator(".coach-plan");
    await coach
      .getByRole("button", { name: "Change training schedule" })
      .click();
    await coach
      .getByLabel("Training setup", { exact: true })
      .selectOption("alternating");
    const switchDate = coach.getByLabel("Switch to every other day on");
    await expect(switchDate).toHaveValue(today);
    await switchDate.fill("2026-11-28");
    await expect(
      coach.getByRole("heading", { name: /First 7 days from.*Nov 28/ }),
    ).toBeVisible();
    await expect(
      coach.locator(".coach-schedule-preview li").first(),
    ).toContainText("Home Strength A");
    const save = coach.getByRole("button", {
      name: "Save schedule",
      exact: true,
    });
    await save.click();
    await expect(
      coach.getByRole("heading", { name: /Switch scheduled for.*Nov 28/ }),
    ).toBeVisible();
    await navigate(page, "Gym");
    await expect(page.locator(".gym-day-context")).toContainText("Rest day");
    await navigate(page, "Diet");
    await expect(page.locator(".prep-fuel-disclosure")).toContainText(
      "Keep regular meals",
    );
    await navigate(page, "Coach");
    await coach
      .getByRole("button", { name: "Reschedule", exact: true })
      .click();
    await expect(switchDate).toHaveValue("2026-11-28");
    await switchDate.fill("2026-12-03");
    await save.click();
    const queued = coach.getByRole("heading", {
      name: /Switch scheduled for.*Dec 3/,
    });
    await expect(queued).toBeVisible();
    await expect
      .poll(() =>
        Object.values(backend.snapshot().coaching.choices).some(
          (c) => c.effectiveOn === "2026-12-03",
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", {
        name: "Account and sync settings",
        exact: true,
      }),
    ).toContainText("Synced across devices");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(queued).toBeVisible();
    await coach
      .getByRole("button", { name: "Cancel scheduled switch", exact: true })
      .click();
    await expect(queued).toHaveCount(0);
    await coach
      .getByRole("button", { name: "Change training schedule" })
      .click();
    await coach
      .getByLabel("Training setup", { exact: true })
      .selectOption("alternating");
    await expect(switchDate).toHaveValue(today);
    const preview = coach.locator(".coach-schedule-preview li");
    await expect(preview.nth(0)).toContainText("Home Strength A");
    await expect(preview.nth(1)).toContainText("Recovery day");
    await expect(preview.nth(2)).toContainText("Home Strength B");
    await settlePresentation(page);
    await assertLayout(page, `alternating coach ${width}/${colorScheme}`);
    const audit = await new AxeBuilder({ page })
      .include(".coach-plan")
      .withRules(["color-contrast"])
      .analyze();
    assert.deepEqual(audit.violations, []);
    await coach.locator(".coach-plan-editor").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `outputs/ui-check/alternating-${width}-${colorScheme}.png`,
    });
    await coach
      .getByRole("button", { name: "Save schedule", exact: true })
      .click();
    await expect(coach).toContainText("Home gym every other day");
    await expect
      .poll(() =>
        Object.values(backend.snapshot().coaching.choices).some(
          (c) => c.rhythm?.anchor === today,
        ),
      )
      .toBe(true);
    assert.deepEqual(backend.snapshot().program, seed.program);
    assert.deepEqual(
      backend.snapshot().days[start].exercises,
      seed.days[start].exercises,
    );
    assert.equal(backend.snapshot().dietDays[start].notes, "Historical meal");
    await navigate(page, "Today");
    await expect(page.locator("#today-move-machine-chest-press")).toContainText(
      "1 set",
    );
    await navigate(page, "Gym");
    await expect(page.locator(".gym-day-context")).toContainText(
      "Home Strength A",
    );
    await navigate(page, "Diet");
    await expect(page.locator(".prep-fuel-disclosure")).toContainText(
      "Keep lunch complete",
    );
    await expect(
      page.getByRole("button", {
        name: "Account and sync settings",
        exact: true,
      }),
    ).toContainText("Synced across devices");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(coach).toContainText("Home gym every other day");
    await coach.getByText("Upcoming 7 days", { exact: true }).click();
    await coach.locator(".coach-plan-week button").nth(1).click();
    await expect(
      page.getByText("Rest day · no check-in needed", { exact: true }),
    ).toBeVisible();
    await assertLayout(page, `alternating recovery ${width}/${colorScheme}`);
    await navigate(page, "Coach");
    await coach
      .getByRole("button", { name: "Change training schedule" })
      .click();
    await switchDate.fill("2026-11-30");
    await save.click();
    await expect(
      coach.getByRole("heading", { name: /Switch scheduled for.*Nov 30/ }),
    ).toBeVisible();
    await expect
      .poll(() =>
        Object.values(backend.snapshot().coaching.choices).some(
          (c) => c.effectiveOn === "2026-11-30",
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", {
        name: "Account and sync settings",
        exact: true,
      }),
    ).toContainText("Synced across devices");
    await page.waitForLoadState("networkidle");
    await page.clock.setFixedTime(new Date("2026-11-30T19:00:00Z"));
    await page.reload();
    await expect(coach).toContainText(/Home gym every other day.*Nov 30/);
    await expect(
      coach.getByRole("button", {
        name: "Cancel scheduled switch",
        exact: true,
      }),
    ).toHaveCount(0);
    await navigate(page, "Gym");
    await expect(page.locator(".gym-day-context")).toContainText(
      "Home Strength A",
    );
    assert.deepEqual(errors, []);
    await context.close();
    await browser.close();
    console.log(
      `PASS alternating ${width}/${colorScheme}: future preview, unchanged gym and fuel before switch, reschedule, cancel, immediate switch, sync and history`,
    );
  }
}
