import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium, webkit, expect } from "playwright/test";

/** Exercise the real signed-out form as well as the main product views. axe
 * handles alpha-composited backgrounds, font sizes and WCAG contrast thresholds;
 * raw RGB equality would miss many pale-text-on-tinted-surface failures. */
export async function runContrastChecks({
  server,
  model,
  browsers,
  prepare,
  fixtureBackend,
  navigate,
  settlePresentation,
}) {
  const reports = [],
    failures = [];
  const mm = await server.ssrLoadModule("/src/features/momentum/types.ts");
  const plan = await server.ssrLoadModule("/src/features/momentum/plan.ts");
  const audit = async (page, label, include) => {
    await settlePresentation(page);
    let builder = new AxeBuilder({ page }).withRules(["color-contrast"]);
    if (include) builder = builder.include(include);
    const result = await builder.analyze();
    const issues = result.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        target: n.target,
        text: n.html,
        reason: n.failureSummary,
      })),
    );
    reports.push({
      label,
      issues,
      needsManualReview: result.incomplete.flatMap((v) =>
        v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })),
      ),
    });
    if (issues.length) {
      failures.push({
        label,
        count: issues.length,
        examples: issues.slice(0, 3),
      });
      console.log(
        `CONTRAST ${label}: ${issues.length} failures; ${JSON.stringify(issues.slice(0, 3))}`,
      );
    } else console.log(`PASS contrast ${label}`);
  };
  // Supplement axe where a CSS pseudo-element or SVG prevents its background
  // inference. Canvas resolves browser-native CSS color syntax (including color-
  // mix); this checks computed ink, not a second hard-coded palette in tests.
  const checkComputedPairs = async (page, label, selector, kind = "text") => {
    const pairs = await page.locator(selector).evaluateAll((elements, kind) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const rgba = (color) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      };
      const blend = (front, back) => {
        const a = front[3] / 255;
        return [0, 1, 2]
          .map((i) => front[i] * a + back[i] * (1 - a))
          .concat(255);
      };
      const background = (element) => {
        const chain = [];
        for (let e = element; e; e = e.parentElement) chain.unshift(e);
        return chain.reduce(
          (color, e) => blend(rgba(getComputedStyle(e).backgroundColor), color),
          [255, 255, 255, 255],
        );
      };
      const luminance = (color) => {
        const c = color.slice(0, 3).map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      return elements
        .filter((e) => e.getClientRects().length)
        .map((e) => {
          let bg = background(e);
          if (kind === "ring")
            bg = blend(
              rgba(
                getComputedStyle(
                  e.closest(".premium-progress-ring"),
                  "::before",
                ).backgroundColor,
              ),
              bg,
            );
          const style = getComputedStyle(
            e,
            kind === "placeholder" ? "::placeholder" : null,
          );
          const fg = blend(rgba(kind === "svg" ? style.fill : style.color), bg),
            a = luminance(fg),
            b = luminance(bg);
          return {
            text:
              kind === "placeholder"
                ? e.getAttribute("placeholder")
                : e.textContent.slice(0, 50),
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            foreground: style.color,
          };
        });
    }, kind);
    assert.ok(pairs.length, `${label}: missing contrast target ${selector}`);
    assert.ok(
      pairs.every((p) => p.ratio >= 4.5),
      `${label}: computed contrast below 4.5:1 ${JSON.stringify(pairs)}`,
    );
  };
  for (const [name, engine, viewport] of [
    ["iphone", webkit, { width: 402, height: 874 }],
    ["macbook", chromium, { width: 1440, height: 900 }],
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
      const seed = model.emptyStore("2026-10-05");
      seed.metrics["2026-10-04"] = {
        weightKg: "80",
        weight: "",
        weightForgotten: false,
        note: "",
        photoReminderDone: false,
      };
      seed.metrics["2026-10-05"] = {
        weightKg: "79.5",
        weight: "",
        weightForgotten: false,
        note: "",
        photoReminderDone: false,
      };
      const privateData = mm.emptyMomentum(),
        journey = plan.makeJourney("2026-10-05", "synthetic-contrast-journey");
      privateData.activeJourneyId = journey.id;
      privateData.journeys[journey.id] = journey;
      privateData.onboarded = true;
      const { page, errors } = await prepare(
        context,
        fixtureBackend(seed, { privateAccess: true, momentum: privateData }),
        seed,
      );
      const label = `${name}-${colorScheme}`;
      await page.locator("#coach-account").scrollIntoViewIfNeeded();
      await audit(page, `${label}-auth-empty`, "#coach-account");
      await checkComputedPairs(
        page,
        `${label}-auth-placeholders`,
        ".auth-form input",
        "placeholder",
      );
      await page
        .getByLabel("Email", { exact: true })
        .fill("contrast@example.test");
      await page
        .getByLabel("Password", { exact: true })
        .fill("synthetic-password");
      await audit(page, `${label}-auth-filled`, "#coach-account");
      await page.screenshot({
        path: `outputs/ui-check/contrast-${label}-auth.png`,
      });
      await page.emulateMedia({
        colorScheme: colorScheme === "light" ? "dark" : "light",
      });
      await audit(page, `${label}-auth-theme-switch`, "#coach-account");
      await page.emulateMedia({ colorScheme });
      await audit(page, `${label}-coach`);
      await checkComputedPairs(
        page,
        `${label}-coach-heading-ink-after-theme-switch`,
        ".coach-hub-shell :is(h1, h2, h3, h4)",
      );
      await checkComputedPairs(
        page,
        `${label}-ring-captions`,
        ".premium-progress-ring :is(strong, small)",
        "ring",
      );
      await checkComputedPairs(
        page,
        `${label}-chart-labels`,
        ".weight-story-svg text",
        "svg",
      );
      await page.locator(".coach-disclosure > summary").click();
      await page.locator(".daily-weight-log > summary").click();
      await page.locator(".weekly-weight-history > summary").click();
      await audit(page, `${label}-coach-expanded`);
      for (const view of ["Today", "Gym", "Diet", "Progress"]) {
        await navigate(page, view);
        await audit(page, `${label}-${view.toLowerCase()}`);
        if (view === "Diet") {
          await checkComputedPairs(
            page,
            `${label}-selected-day`,
            ".diet-day-button.active :is(span, strong, small)",
          );
          await page.getByRole("tab", { name: "Cook batch", exact: true }).click();
          const restart = page.getByRole("button", { name: "Start a new batch today", exact: true });
          if (await restart.count()) await restart.click();
          await page.locator(".mp-recipe-row").first().getByRole("button", { name: /^Swap/ }).click();
          await audit(page, `${label}-batch-cook-swaps`);
          await page.getByRole("tab", { name: "To buy", exact: true }).click();
          await audit(page, `${label}-shopping-expanded`);
          await page.getByRole("tab", { name: "Eat today", exact: true }).click();
          await page.getByRole("button", { name: "Mark eaten: Breakfast", exact: true }).click();
          await audit(page, `${label}-meal-completed`);
        }
      }
      await navigate(page, "Today");
      for (const [title, suffix] of [
        ["Week plan", "week"],
        ["Exercise library", "library"],
      ]) {
        if (viewport.width < 720)
          await page.getByRole("button", { name: title, exact: true }).click();
        else await navigate(page, suffix === "week" ? "Week" : "Library");
        await audit(page, `${label}-${suffix}`);
      }
      await navigate(page, "Today");
      const details = page
        .getByRole("button", { name: "Details / Swap", exact: true })
        .first();
      await details.scrollIntoViewIfNeeded();
      await details.click();
      await expect(page.locator(".exercise-detail-sheet")).toBeVisible();
      await audit(page, `${label}-exercise-sheet`, ".exercise-detail-sheet");
      await page
        .getByRole("button", { name: "Close exercise details", exact: true })
        .click();
      await navigate(page, "Coach");
      await page
        .getByRole("button", { name: "Start fresh", exact: true })
        .click();
      await audit(page, `${label}-reset-dialog`, ".reset-dialog");
      await page
        .getByRole("button", { name: "Keep my progress", exact: true })
        .click();
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.locator(".account-row")).toContainText(
        "fixture@example.test",
      );
      await audit(page, `${label}-signed-in-account`, "#coach-account");
      await page.locator(".momentum-entry").click();
      await expect(page.locator("main.momentum")).toBeVisible();
      await audit(page, `${label}-momentum-today`);
      await page.locator(".mm-titan-row").click();
      await audit(page, `${label}-momentum-titan`, ".mm-sheet");
      await page
        .getByRole("button", { name: "Close panel", exact: true })
        .click();
      const privateTab = (name) =>
        page
          .getByRole("navigation", { name: "Momentum sections" })
          .getByRole("button", { name, exact: true })
          .click();
      await privateTab("Meals");
      await audit(page, `${label}-momentum-meals`);
      await page.getByRole("tab", { name: "Cook batch", exact: true }).click();
      await audit(page, `${label}-momentum-batch`);
      await page.getByRole("tab", { name: "To buy", exact: true }).click();
      await audit(page, `${label}-momentum-groceries`);
      await privateTab("Journey");
      await audit(page, `${label}-momentum-journey`);
      await privateTab("Today");
      await page
        .getByRole("button", { name: "Start session", exact: true })
        .click();
      await audit(page, `${label}-momentum-session`);
      await page
        .getByRole("button", { name: "Finish with what I did", exact: true })
        .click();
      await audit(page, `${label}-momentum-finish`);
      assert.deepEqual(errors, [], `${label}: console errors`);
      await context.close();
    }
  }
  await writeFile(
    "outputs/ui-check/contrast-report.json",
    JSON.stringify(reports, null, 2),
  );
  assert.deepEqual(
    failures,
    [],
    "Color contrast violations (see outputs/ui-check/contrast-report.json)",
  );
}
