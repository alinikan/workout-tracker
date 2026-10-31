import assert from "node:assert/strict";
import { chromium, webkit, expect } from "playwright/test";

/** Synthetic home accounts verify real controls. Pairwise bounds catch the
 * original text-behind-weight-field defect, including expanded multi-set rows. */
export async function runRedesignChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  assertLayout,
  settlePresentation,
}) {
  const mm = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const trial = await server.ssrLoadModule("/src/features/momentum/trial.ts");
  for (const [name, engine, viewport] of [
    ["iphone", webkit, { width: 402, height: 874 }],
    ["compact", webkit, { width: 375, height: 812 }],
    ["small", webkit, { width: 320, height: 740 }],
    ["tablet", webkit, { width: 768, height: 1024 }],
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
        reducedMotion: "reduce",
      });
      const data = mm.emptyMomentum(),
        j = trial.makeHomeJourney(
          "2026-10-05",
          "redesign-home",
          "2026-10-04T18:00:00Z",
        );
      data.onboarded = true;
      data.activeJourneyId = j.id;
      data.journeys[j.id] = j;
      const backend = fixtureBackend(model.emptyStore("2026-10-05"), {
        privateAccess: true,
        momentum: data,
      });
      const { page, errors } = await prepare(context, backend);
      await page
        .getByRole("button", { name: "Account and sync settings", exact: true })
        .click();
      await expect(page.getByLabel("Email", { exact: true })).toBeInViewport();
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
      await expect(page.locator(".coach-plan")).toBeVisible();
      assert.ok(
        ["left", "start"].includes(await page
          .locator(".coach-plan")
          .evaluate((el) => getComputedStyle(el).textAlign)),
        `${name}/${colorScheme}: Coach planning text must share a left edge`,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await settlePresentation(page);
      await page.screenshot({
        path: `outputs/ui-check/redesign-${name}-${colorScheme}-coach.png`,
      });
      await navigate(page, "Today");
      await expect(page.locator(".today-inline-log")).toHaveCount(0);
      const quad = page.locator("#today-move-wall-sit");
      await quad.locator(".move-check-button").click();
      await expect(page.locator(".today-inline-log")).toHaveCount(0);
      await quad.locator(".move-check-button").click();
      await expect(page.locator(".today-inline-log")).toHaveCount(0);
      await quad.locator(".move-main-button").click();
      await expect(quad.locator(".set-weight")).toHaveCount(0);
      await quad
        .getByRole("textbox", {
          name: "Bodyweight Wall Sit set 1 hold seconds",
          exact: true,
        })
        .fill("15");
      await quad.locator(".move-main-button").click();
      await quad.locator(".entry-swap-button").click();
      const quadSheet = page.locator(".exercise-detail-sheet");
      await quadSheet
        .locator(".swap-option-grid")
        .getByRole("button", { name: /Nordic Leg Extension/ })
        .click();
      await quadSheet.getByRole("tab", { name: "Log", exact: true }).click();
      await expect(quadSheet.locator(".set-weight")).toHaveCount(0);
      await expect(
        quadSheet.getByRole("textbox", {
          name: "Nordic Leg Extension (Reverse Nordic) set 1 reps",
          exact: true,
        }),
      ).toBeVisible();
      await quadSheet
        .getByRole("tab", { name: "Technique", exact: true })
        .click();
      await expect(quadSheet.locator(".video-poster img")).toHaveAttribute(
        "src",
        /PvJDjcfZe1c/,
      );
      await quadSheet
        .getByRole("button", { name: "Close exercise details", exact: true })
        .click();
      await quad
        .getByRole("button", { name: "Revert to original", exact: true })
        .click();
      const entry = page.locator("#today-move-machine-chest-press");
      await expect(entry).toBeVisible();
      await expect(
        page.locator("#today-move-seated-leg-extension"),
      ).toHaveCount(0);
      await entry.locator(".move-main-button").click();
      const weight = entry.getByRole("textbox", {
        name: "Machine Chest Press set 1 weight in pounds",
        exact: true,
      });
      await weight.fill("10");
      const collisions = await entry.locator(".set-row").evaluateAll((rows) =>
        rows.flatMap((row) => {
          const fields = [...row.children]
              .map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  name: el.className,
                  x: r.x,
                  y: r.y,
                  right: r.right,
                  bottom: r.bottom,
                  w: r.width,
                  h: r.height,
                };
              })
              .filter((r) => r.w > 0 && r.h > 0),
            overlap = [];
          for (let i = 0; i < fields.length; i++)
            for (let k = i + 1; k < fields.length; k++) {
              const a = fields[i],
                b = fields[k];
              if (
                Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
              )
                overlap.push([a.name, b.name]);
            }
          return overlap;
        }),
      );
      assert.deepEqual(
        collisions,
        [],
        `${name}/${colorScheme}: overlapping set labels or controls`,
      );
      // Check inside the responsive input group as well as its outer grid cell.
      // A non-overlapping wrapper alone would miss a field covering its sibling.
      const inputLayoutErrors = await entry
        .locator(".set-row")
        .evaluateAll((rows) =>
          rows.flatMap((row) => {
            const group = row.querySelector(".set-inputs");
            if (!group) return [];
            const bounds = [...group.children].map((el) => ({
              name: el.className,
              rect: el.getBoundingClientRect(),
            }));
            const errors = [];
            for (let i = 0; i < bounds.length; i++) {
              for (let j = i + 1; j < bounds.length; j++) {
                const a = bounds[i].rect;
                const b = bounds[j].rect;
                if (
                  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
                )
                  errors.push(`${bounds[i].name} overlaps ${bounds[j].name}`);
              }
            }
            // On compact screens the complete header must precede the inputs.
            // This catches inherited grid-area rules moving "Set 1" below them.
            if (window.innerWidth <= 980) {
              const inputTop = group.getBoundingClientRect().top;
              for (const header of [...row.children].filter(
                (el) => el !== group,
              )) {
                if (header.getBoundingClientRect().bottom > inputTop + 1) {
                  errors.push(`${header.className} is below the input group`);
                }
              }
            }
            return errors;
          }),
        );
      assert.deepEqual(
        inputLayoutErrors,
        [],
        `${name}/${colorScheme}: set input order or internal overlap`,
      );
      await entry
        .getByRole("checkbox", {
          name: "Machine Chest Press set 1 complete",
          exact: true,
        })
        .check();
      await entry.locator(".entry-swap-button").click();
      const sheet = page.locator(".exercise-detail-sheet");
      await expect(
        sheet.getByRole("tab", { name: "Swap", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await sheet
        .locator(".swap-option-grid")
        .getByRole("button", { name: /Incline Push-Up/ })
        .click();
      await expect(sheet.locator(".detail-swap-alert")).toBeVisible();
      await sheet.getByRole("tab", { name: "Log", exact: true }).click();
      await expect(sheet.locator(".set-weight input")).toHaveCount(0);
      await expect(sheet.getByRole("textbox", { name: "Incline Push-Up set 1 reps", exact: true })).toBeVisible();
      await sheet.getByRole("tab", { name: "Technique", exact: true }).click();
      await expect(sheet.locator(".video-poster")).toBeVisible();
      await expect(sheet.locator(".video-poster img")).toHaveAttribute(
        "src",
        new RegExp(model.exerciseMap["incline-push-up"].youtubeId),
      );
      await sheet.locator(".video-poster").click();
      await expect(sheet.locator("iframe")).toHaveAttribute(
        "src",
        new RegExp(model.exerciseMap["incline-push-up"].youtubeId),
      );
      await sheet
        .getByRole("button", { name: "Close exercise details", exact: true })
        .click();
      await expect(entry).toContainText("Swap version");
      await entry
        .getByRole("button", { name: "Revert to original", exact: true })
        .click();
      await expect(weight).toHaveValue("10");
      await expect(
        entry.getByRole("checkbox", {
          name: "Machine Chest Press set 1 complete",
          exact: true,
        }),
      ).toBeChecked();
      await assertLayout(page, `redesign-${name}-${colorScheme}`);
      await entry.scrollIntoViewIfNeeded();
      await settlePresentation(page);
      await page.screenshot({
        path: `outputs/ui-check/redesign-${name}-${colorScheme}-today.png`,
      });
      await navigate(page, "Diet");
      await page.screenshot({
        path: `outputs/ui-check/redesign-${name}-${colorScheme}-meals.png`,
      });
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS redesign ${name}/${colorScheme}: account shortcut, non-overlapping fields, visible swaps, correct bodyweight inputs, original-load recovery and app navigation`,
      );
    }
  }
}
