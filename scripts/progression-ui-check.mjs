import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Two synthetic home sessions exercise Today → save → Gym → reload. The final
 * checkbox reveals advice, never opens another movement or writes more pounds. */
export async function runProgressionChecks({
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
  settlePresentation,
}) {
  const start = "2026-10-05",
    today = "2026-10-08";
  for (const [name, engine, viewport] of [
    ["compact", webkit, { width: 375, height: 812 }],
    ["iphone", webkit, { width: 402, height: 874 }],
    ["desktop", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const seed = model.emptyStore(start);
      seed.coaching = {
        version: 1,
        homeFrom: start,
        legacyImported: true,
        choices: {},
      };
      const days = model.coachPlanDays(
        model.buildPlanDays(start),
        seed.coaching,
        {},
        today,
      );
      for (const day of [days[0], days[3]])
        seed.days[day.iso] = model.normalizeDayLog({
          sessionSnapshot: day.session,
          exercises: {
            "machine-chest-press": Array.from({ length: 2 }, (_, i) => ({
              weight: "50",
              reps: "12",
              effort: "about-right",
              done: day.iso !== today || i === 0,
            })),
          },
        });
      const context = await browser.newContext({
        viewport,
        colorScheme,
        timezoneId: "America/Vancouver",
        reducedMotion: "reduce",
        isMobile: viewport.width < 720,
        hasTouch: viewport.width < 720,
      });
      const backend = fixtureBackend(seed);
      const { page, errors } = await prepare(
        context,
        backend,
        undefined,
        `${today}T18:00:00Z`,
      );
      await page
        .getByRole("button", { name: "Account and sync settings", exact: true })
        .click();
      await page
        .getByLabel("Email", { exact: true })
        .fill("fixture@example.test");
      await page
        .getByLabel("Password", { exact: true })
        .fill("fixture-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.locator(".account-row")).toContainText(
        "fixture@example.test",
      );
      await navigate(page, "Today");
      const press = page.locator("#today-move-machine-chest-press");
      await press.locator(".move-main-button").click();
      const current = press.getByRole("region", {
        name: "Current workout load guidance",
        exact: true,
      });
      await expect(current).toContainText("One more confirming session");
      const weight = press.getByRole("textbox", {
        name: "Machine Chest Press set 2 weight in pounds",
        exact: true,
      });
      const done = press.getByRole("checkbox", {
        name: "Machine Chest Press set 2 complete",
        exact: true,
      });
      await expect(weight).toHaveValue("50");
      // The existing final-set action closes its log. Tap, then assert the
      // resulting saved/UI state instead of checking an input being unmounted.
      await done.click();
      const next = press.getByRole("region", {
        name: "Next workout load guidance",
        exact: true,
      });
      await expect(next).toContainText("Try the next jump");
      await expect(next).toContainText("Start at 8 reps");
      await expect(next).toContainText("50 lb");
      await expect
        .poll(
          () =>
            backend.snapshot().days[today]?.exercises?.[
              "machine-chest-press"
            ]?.[1]?.weight,
        )
        .toBe("50");
      await expect(page.locator(".exercise-detail-sheet")).toHaveCount(0);
      await expect(page.locator(".today-inline-log")).toHaveCount(0);
      await next.getByText("Why this recommendation", { exact: true }).click();
      await expect(next).toContainText("2/2 qualifying sessions at 50 lb");
      await settlePresentation(page);
      await assertLayout(page, `progression ${name}/${colorScheme}`);
      const audit = await new AxeBuilder({ page })
        .include(".move-load-guidance")
        .withRules(["color-contrast"])
        .analyze();
      assert.deepEqual(
        audit.violations,
        [],
        `${name}/${colorScheme}: progression text contrast`,
      );
      await next.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `outputs/ui-check/progression-${name}-${colorScheme}-today.png`,
      });
      // Closed logs retain earned advice; Undo removes it immediately.
      await press.locator(".move-main-button").click();
      await expect(weight).toHaveValue("50");
      await done.uncheck();
      await expect(next).toHaveCount(0);
      await done.click();
      await expect(press.locator(".today-inline-log")).toHaveCount(0);
      await expect(next).toBeVisible();
      await navigate(page, "Gym");
      const recap = page.getByRole("region", {
        name: "Earned next workout recommendations",
        exact: true,
      });
      await expect(recap).toContainText("Machine Chest Press");
      await expect(recap).toContainText(
        "No need to add weight or extra sets now",
      );
      await expect(recap).toContainText("50 lb");
      const sessionGuidance = page.locator(".gym-session-guidance");
      await sessionGuidance.locator("summary").click();
      await expect(sessionGuidance).toContainText("Comfortable effort");
      await expect(sessionGuidance).toContainText("3–4 clean reps available");
      await sessionGuidance.locator("summary").click();
      await recap.scrollIntoViewIfNeeded();
      await settlePresentation(page);
      const gymAudit = await new AxeBuilder({ page })
        .include(".session-load-recap")
        .withRules(["color-contrast"])
        .analyze();
      assert.deepEqual(
        gymAudit.violations,
        [],
        `${name}/${colorScheme}: recap contrast`,
      );
      await page.screenshot({
        path: `outputs/ui-check/progression-${name}-${colorScheme}-gym.png`,
      });
      await expect
        .poll(
          () =>
            backend.snapshot().days[today]?.exercises?.[
              "machine-chest-press"
            ]?.[1]?.done,
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
      await navigate(page, "Today");
      await expect(next).toBeVisible();
      await expect(press.locator(".today-inline-log")).toHaveCount(0);
      await press.locator(".move-main-button").click();
      await press
        .getByRole("combobox", {
          name: "Machine Chest Press set 2 feel",
          exact: true,
        })
        .selectOption("very-hard");
      await expect(next).not.toContainText("Try the next jump");
      await expect(next).toContainText("Recover before increasing");
      await assertLayout(page, `updated progression ${name}/${colorScheme}`);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS progression ${name}/${colorScheme}: earned next-load banner, no surprise expansion, Undo/corrections, unchanged pounds, Gym recap, saved reload and contrast`,
      );
    }
    await browser.close();
  }
}
