/**
 * Run with npm run test:ui after `npx playwright install chromium webkit`.
 * A private Vite server ignores .env files and uses a routed Supabase fixture.
 * No real account, database, login credential, or personal browser is touched.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { chromium, webkit, expect } from "playwright/test";
import { runMomentumChecks } from "./momentum-ui-check.mjs";
import { runContrastChecks } from "./contrast-ui-check.mjs";
import { runBatchChecks } from "./batch-ui-check.mjs";
import { runSharedStartChecks } from "./shared-start-ui-check.mjs";

const storageKey = "body-recomp-gym-tracker-v1";
const fixtureHost = "tracker-fixture.supabase.co";
const diagnosticContexts = new Set();
const { values } = parseArgs({ options: { repeat: { type: "string", default: "1" }, "momentum-only": { type: "boolean", default: false }, "contrast-only": { type: "boolean", default: false }, "batch-only": { type: "boolean", default: false }, "shared-start-only": { type: "boolean", default: false } } });
const repeatCount = Number(values.repeat);
assert.ok(Number.isInteger(repeatCount) && repeatCount >= 1 && repeatCount <= 5, "--repeat must be an integer from 1 to 5");
const server = await createServer({
  envDir: false,
  cacheDir: "node_modules/.vite-ui-check",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(`https://${fixtureHost}`),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sb_publishable_test_fixture"),
  },
  // Do not reload a fixture if an editor saves a source file during a test.
  server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/*"] } },
});
await server.listen();
const baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
const model = await server.ssrLoadModule("/src/App.tsx");
await mkdir("outputs/ui-check", { recursive: true });

function fixtureBackend(initial, options = {}) {
  let data = structuredClone(initial);
  let privateData = options.momentum ? structuredClone(options.momentum) : null;
  let privateRevision = 0;
  let privateAccess = Boolean(options.privateAccess);
  let revision = 1;
  const events = [];
  const updatedAt = () => new Date(Date.UTC(2026, 9, 5, 12, 0, revision)).toISOString();
  const user = { id: options.userId ?? "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test" };
  const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: 2100000000 })).toString("base64url");
  const authSession = { access_token: `e30.${payload}.test`, refresh_token: "fixture-refresh-token", expires_in: 3600, expires_at: 2100000000, token_type: "bearer", user };
  return {
    snapshot: () => structuredClone(data),
    privateSnapshot: () => structuredClone(privateData),
    events: () => structuredClone(events),
    revokePrivate: () => { privateAccess = false; },
    route: async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
      if (request.method() === "OPTIONS") return send({});
      if (url.pathname.endsWith("/token")) return send(authSession);
      if (url.pathname.endsWith("/user")) return send(user);
      if (url.pathname.endsWith("/logout")) return send({});
      if (url.pathname === "/rest/v1/rpc/momentum_access") return send(privateAccess);
      if (url.pathname === "/rest/v1/momentum_progress") {
        if (options.privateLoadDelay) await new Promise((resolve) => setTimeout(resolve, options.privateLoadDelay));
        return send(privateAccess && privateData ? [{ data: privateData, revision: privateRevision }] : []);
      }
      if (url.pathname === "/rest/v1/rpc/momentum_save") {
        if (!privateAccess) return send({code:"42501",message:"Momentum access denied"},403);
        const body = request.postDataJSON();
        if (body.p_expected_revision !== privateRevision) return send({conflict:true,data:privateData,revision:privateRevision});
        if (body.p_data.activeJourneyId?.startsWith("program-") &&
          (body.p_data.sharedProgram?.resetId !== data.program.resetId || body.p_data.sharedProgram?.startedOn !== data.program.startedOn))
          return send({code:"22023",message:"Shared reset has not synced yet"},400);
        privateData = body.p_data; privateRevision += 1;
        events.push({kind:"momentum",resetId:privateData.sharedProgram?.resetId});
        return send({conflict:false,data:privateData,revision:privateRevision});
      }
      if (url.pathname === "/rest/v1/workout_progress") {
        if (request.method() === "GET") return send([{ data, updated_at: updatedAt() }]);
        if (url.searchParams.has("updated_at") && url.searchParams.get("updated_at") !== `eq.${updatedAt()}`) return send([]);
        data = request.postDataJSON().data;
        events.push({kind:"workout",resetId:data.program.resetId});
        revision += 1;
        const response = { updated_at: updatedAt() };
        return send(request.headers().accept?.includes("object+json") ? response : [response]);
      }
      throw new Error(`Unexpected fixture request: ${request.method()} ${url.pathname}`);
    },
  };
}

async function prepare(context, backend, seed, now = "2026-10-05T18:00:00Z") {
  // Keep a real interaction trace when a standalone assertion fails. Successful
  // contexts discard it on close; the fixture contains no production credentials.
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  await context.tracing.start({ screenshots: true, snapshots: true });
  diagnosticContexts.add(context);
  context.on("close", () => diagnosticContexts.delete(context));
  await context.route(`https://${fixtureHost}/**`, backend.route);
  // External recipe/video images are irrelevant to the persistence tests. Abort
  // them to keep the fixture deterministic; the real media links stay unchanged.
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === fixtureHost ? route.fallback() : route.abort();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(now));
  if (seed) await context.addInitScript(({ key, data }) => {
    // YouTube frames have their own origin/storage. Seed only our top-level
    // app, never an embedded frame (including blocked opaque-origin fixtures).
    if (window !== window.top) return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, data: seed });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL);
  try {
    await expect(page.locator(".coach-hub-shell")).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    await page.screenshot({ path: "outputs/ui-check/startup-failure.png" });
    console.error("Startup diagnostics:", errors, (await page.locator("body").innerText()).slice(0, 1500));
    throw error;
  }
  return { page, errors };
}

async function assertLayout(page, label) {
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(widths.scroll <= widths.client + 1, `${label}: horizontal overflow ${JSON.stringify(widths)}`);
  const dock = page.locator(".primary-app-dock");
  const bounds = await dock.count() ? await dock.boundingBox() : null;
  const viewport = page.viewportSize();
  if (bounds && viewport.width <= 720) assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, `${label}: dock outside viewport`);
}

async function assertSelectionContrast(page, selector) {
  const ratios = await page.locator(selector).evaluateAll((elements) => {
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
        const s = v / 255;
        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    return elements.flatMap((element) => {
      const style = getComputedStyle(element);
      const background = luminance(style.backgroundColor);
      // Captions can override an otherwise accessible button's foreground.
      // Check each visible text element against the enclosing selection fill.
      return [element, ...element.querySelectorAll("strong, small, span")].map((text) => {
        const foreground = luminance(getComputedStyle(text).color);
        return { ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05),
          foreground: getComputedStyle(text).color, background: style.backgroundColor,
          transition: getComputedStyle(text).transition, text: text.textContent.slice(0, 100) };
      });
    });
  });
  assert.ok(ratios.length > 0, `No selected controls found: ${selector}`);
  assert.ok(ratios.every(({ ratio }) => ratio >= 4.5), `Selection contrast below 4.5:1: ${JSON.stringify(ratios)}`);
}

async function navigate(page, destination) {
  if (page.viewportSize().width < 720) {
    await page.locator(".primary-app-dock").getByRole("button", { name: destination, exact: true }).click();
    return;
  }
  const product = destination === "Coach" ? "Coach" : destination === "Diet" ? "Nutrition" : "Workout";
  await page.locator(".product-mode-switcher").getByRole("button", { name: product, exact: true }).click();
  if (product === "Workout") await page.locator(".section-tabs").getByRole("button", { name: destination, exact: true }).click();
}

async function settlePresentation(page) {
  // Wait for finite screen transitions, but not repeating sync-status pulses.
  // This keeps screenshots and touch coordinates on the final, stable layout.
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await frame();
    await frame();
    const animations = document.getAnimations().filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return animation.playState === "running" && typeof endTime === "number" && Number.isFinite(endTime);
    });
    // WebKit can retain unresolved pseudo-element animation promises. Bound
    // this cosmetic wait; the assertions still check the actual final layout.
    await Promise.race([
      Promise.all(animations.map((animation) => animation.finished.catch(() => {}))),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    await frame();
    await frame();
  });
}

async function assertNoVideoLayout(page, label) {
  await settlePresentation(page);
  await expect(page.locator(".gym-card")).toHaveCSS("opacity", "1");
  await expect(page.locator(".gym-main.no-video")).toBeVisible();
  await expect(page.locator(".gym-main .exercise-media, .gym-main .video-poster, .gym-main iframe, .gym-main .motion-badge")).toHaveCount(0);
  await assertLayout(page, label);
  if (page.viewportSize().width < 720) {
    const card = await page.locator(".gym-card").boundingBox();
    assert.ok(Math.abs(card.x) <= 1 && Math.abs(card.x + card.width - page.viewportSize().width) <= 1, `${label}: Gym card does not align with both phone edges`);
  }
  const layout = await page.locator(".gym-main").evaluate((main) => {
    const heading = main.firstElementChild.getBoundingClientRect();
    const controls = main.querySelector(".gif-controls")?.getBoundingClientRect();
    return { columns: getComputedStyle(main).gridTemplateColumns, headingX: heading.x, controlsX: controls?.x };
  });
  assert.equal(layout.columns.split(" ").length, 1, `${label}: reserved empty media column`);
  if (layout.controlsX !== undefined) assert.ok(Math.abs(layout.headingX - layout.controlsX) <= 1, `${label}: GIF control is not aligned with the heading`);
}

async function pressStable(page, locator) {
  // A real user scrolls a long exercise list before tapping. WebKit's automatic
  // edge scrolling during a synthetic click can otherwise move the target
  // between pointer-down and pointer-up, especially after an inline collapse.
  await locator.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await settlePresentation(page);
  if (page.viewportSize().width < 720) await locator.tap();
  else await locator.click();
}

async function verifyInlineExperience(page, label, viewport) {
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  await expect(page.locator(".move-item").first()).toHaveCSS("content-visibility", "visible");
  const calendar = page.locator(".today-calendar");
  await expect(calendar).not.toHaveAttribute("open", "");
  await calendar.locator(":scope > summary").click();
  await calendar.getByRole("button", { name: /Tuesday, Oct 6 Cardio Base/ }).click();
  await expect(page.locator(".today-command-date")).toContainText("Tuesday, Oct 6");
  await page.locator(".today-command-header").getByRole("button", { name: "Back to Today", exact: true }).click();
  await expect(page.locator(".today-command-date")).toContainText("Monday, Oct 5");
  const first = page.locator(".move-item").first();
  await expect(first.locator(".today-inline-log")).toBeVisible();
  // Completion intentionally unmounts this one-set inline log. Assert the row's
  // completed state rather than waiting for the removed checkbox to stay mounted.
  await first.getByRole("checkbox").click();
  await expect(first).toHaveClass(/complete/);
  await page.locator(".undo-notice").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first).not.toHaveClass(/complete/);
  // Put the first movement back into its completed state for the shared Gym test.
  await first.locator(".move-check-button").click();
  const lift = page.locator("#today-move-leg-press");
  await pressStable(page, lift.locator(".move-main-button"));
  await expect(lift.locator(".today-inline-log")).toBeVisible();
  const weight = lift.getByRole("textbox", { name: "Leg Press set 1 weight in pounds", exact: true });
  const copyPrevious = lift.getByRole("button", { name: "Copy 35 pounds to Leg Press set 1", exact: true });
  // Center this lower control before touching it, not just the row's heading.
  // Native auto-scroll can shift the button between down/up on mobile WebKit.
  await pressStable(page, copyPrevious);
  await expect(weight).toHaveValue("35");
  assert.equal(await copyPrevious.evaluate((button) => button.closest("label") === null), true,
    `${label}: copying weight must not also activate the input's label`);
  await weight.fill("45");
  // Exercise the same shortcut again after a manual edit; it must replace only
  // the weight, not mark a set complete or fill in repetitions.
  await pressStable(page, copyPrevious);
  await expect(weight).toHaveValue("35");
  await expect(lift.getByRole("textbox", { name: "Leg Press set 1 reps", exact: true })).toHaveValue("");
  await expect(lift.getByRole("checkbox", { name: "Leg Press set 1 complete", exact: true })).not.toBeChecked();
  await weight.fill("45");
  await lift.getByRole("checkbox", { name: "Leg Press set 1 complete", exact: true }).check();
  await expect(lift.locator(".today-inline-log")).toBeVisible();
  await weight.fill("50");
  await page.locator(".undo-notice").getByRole("button", { name: "Undo", exact: true }).click();
  // Undo may collapse to the earliest unfinished move; reopening must keep the edit.
  await pressStable(page, lift.locator(".move-main-button"));
  await expect(weight).toHaveValue("50");
  await expect(lift.getByRole("checkbox", { name: "Leg Press set 1 complete", exact: true })).not.toBeChecked();
  await expect(page.locator(".achievement-moment")).toHaveCount(0);
  const inputs = await lift.locator(".set-field input, .set-field select").evaluateAll((elements) => elements.map((element) => ({
    height: element.getBoundingClientRect().height, font: parseFloat(getComputedStyle(element).fontSize),
  })));
  assert.ok(inputs.every((input) => input.height >= 43 && input.font >= 16), `${label}: cramped native input ${JSON.stringify(inputs)}`);
  const fields = await lift.locator(".set-row").first().evaluate((row) => {
    const weight = row.querySelector(".set-weight input").getBoundingClientRect();
    const reps = row.querySelector(".set-reps input").getBoundingClientRect();
    return { weightTop: weight.top, repsTop: reps.top };
  });
  assert.ok(Math.abs(fields.weightTop - fields.repsTop) < 2, `${label}: weight/reps inputs don't align`);
  if (viewport.width < 720) {
    await weight.focus();
    await page.setViewportSize({ width: viewport.width, height: viewport.height - 240 });
    await expect(page.locator("main")).toHaveClass(/keyboard-open/);
    await expect(page.locator(".primary-app-dock")).toBeHidden();
    await page.setViewportSize(viewport);
    await weight.blur();
    await expect(page.locator("main")).not.toHaveClass(/keyboard-open/);
  }
  await lift.getByRole("button", { name: "Technique", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Leg Press", exact: true });
  await expect(dialog.getByRole("tab", { name: "Technique", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.locator(".video-poster")).toBeVisible();
  await dialog.locator(".video-poster").click();
  await expect(dialog.locator("iframe")).toBeVisible();
  await dialog.getByRole("tab", { name: "History", exact: true }).click();
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await expect(dialog.locator(".exercise-history")).toContainText("Sep 28");
  await expect(dialog.locator(".exercise-history")).toContainText("partial attempt");
  await dialog.getByRole("tab", { name: "Log", exact: true }).click();
  await assertSelectionContrast(page, ".session-section-tabs [aria-selected='true']");
  await dialog.getByRole("tab", { name: "Log", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Technique", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(dialog.getByRole("tab", { name: "History", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Close exercise details", exact: true }).click();
  await assertLayout(page, `${label}-inline`);
  await lift.scrollIntoViewIfNeeded();
  await settlePresentation(page);
  await page.screenshot({ path: `outputs/ui-check/${label}-inline-log.png` });
}

async function verifyRecipeExperience(page, label) {
  const planner = page.locator(".meal-prep-planner");
  const tab = (name) => planner.getByRole("tab", { name, exact: true });
  await expect(planner.locator(".mp-meal")).toHaveCount(4);
  const lunch = planner.getByRole("article", { name: "Lunch", exact: true });
  const dinner = planner.getByRole("article", { name: "Dinner", exact: true });
  assert.equal(await lunch.locator("h3").innerText(), await dinner.locator("h3").innerText());
  await tab("Cook batch").click();
  // The fixture begins partway through a block. Restarting deliberately leaves
  // earlier dates alone instead of silently changing yesterday's containers.
  const restart = planner.getByRole("button", { name: "Start a new batch today", exact: true });
  if (await restart.count()) await restart.click();
  await planner.getByRole("button", { name: "3 days", exact: true }).click();
  await expect(planner.locator(".mp-batch-counts")).toContainText("6");
  await expect(planner.getByRole("region", { name: "Full batch ingredients", exact: true })).toContainText("dry weight");
  const main = planner.getByRole("region", { name: "Lunch + dinner", exact: true });
  const original = await main.locator("h3").innerText();
  await main.getByRole("button", { name: /^Swap/ }).click();
  await main.locator(".mp-swap-option[aria-pressed='false']").first().click();
  await expect(main.locator("h3")).not.toHaveText(original);
  await expect(main).toContainText("Swap version");
  await main.getByRole("button", { name: /^Revert to original/ }).click();
  await expect(main.locator("h3")).toHaveText(original);
  // Reopening a checked meal must not retain its previous food/portion if the
  // user then chooses another uncooked batch. Test the persisted record too.
  await tab("Eat today").click();
  await lunch.getByRole("button", { name: "Mark eaten: Lunch", exact: true }).click();
  await lunch.getByRole("button", { name: "Reopen Lunch", exact: true }).click();
  await tab("Cook batch").click();
  await main.getByRole("button", { name: /^Swap/ }).click();
  await main.locator(".mp-swap-option").filter({ hasText: "Beef + rice" }).click();
  await tab("Eat today").click();
  await lunch.getByRole("button", { name: "Mark eaten: Lunch", exact: true }).click();
  await expect.poll(() => page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return Object.values(saved.dietDays).some((day) => day.meals.lunch && day.recipes?.lunch === "prep-beef-rice" &&
      day.portions?.lunch?.plate.some((line) => line.includes("beef")));
  }, storageKey)).toBe(true);
  await lunch.getByRole("button", { name: "Reopen Lunch", exact: true }).click();
  await tab("Cook batch").click();
  await main.getByRole("button", { name: /^Revert to original/ }).click();
  await main.locator(".mp-instructions > summary").click();
  await expect(main.locator(".mp-steps li").first()).toBeVisible();
  await planner.getByRole("checkbox", { name: /Batch prepared/ }).check();
  await expect(main.getByRole("button", { name: /^Swap/ })).toBeDisabled();
  await tab("To buy").click();
  await planner.getByRole("button", { name: "Next 7 days", exact: true }).click();
  const grocery = planner.locator(".mp-grocery input").first();
  await grocery.check();
  await expect(grocery).toBeChecked();
  await assertLayout(page, `${label}-batch-shopping`);
  await page.screenshot({ path: `outputs/ui-check/${label}-batch-shopping.png` });
  await tab("Eat today").click();
  const meal = planner.getByRole("article", { name: "Breakfast", exact: true });
  await meal.getByRole("button", { name: "Mark eaten: Breakfast", exact: true }).click();
  await expect(meal.getByRole("button", { name: "Reopen Breakfast", exact: true })).toBeVisible();
  await page.locator(".undo-notice").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(meal.getByRole("button", { name: "Mark eaten: Breakfast", exact: true })).toBeVisible();
  await meal.getByRole("button", { name: "Mark eaten: Breakfast", exact: true }).click();
  await meal.getByRole("button", { name: "Reopen Breakfast", exact: true }).click();
  await page.locator(".undo-notice").getByRole("button", { name: "Dismiss undo", exact: true }).click();
  await assertSelectionContrast(page, ".meal-prep-planner [role='tab'][aria-selected='true']");
  await assertLayout(page, `${label}-recipes`);
}

const browsers = [];
const browserCases = [
  ["iphone-webkit", webkit, { width: 402, height: 874 }],
  ["compact-webkit", webkit, { width: 375, height: 812 }],
  ["macbook-chromium", chromium, { width: 1440, height: 900 }],
];
const runs = Array.from({ length: repeatCount }, (_, index) => index + 1)
  .flatMap((iteration) => browserCases.map((entry) => [iteration, ...entry]));
try {
  if (!values["momentum-only"] && !values["contrast-only"] && !values["batch-only"] && !values["shared-start-only"]) {
  for (const [iteration, engineName, engine, viewport] of runs) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, colorScheme, timezoneId: "America/Vancouver", isMobile: viewport.width < 720, hasTouch: viewport.width < 720, reducedMotion: colorScheme === "light" ? "reduce" : "no-preference" });
      const seed = model.emptyStore("2026-08-31");
      seed.days["2026-09-28"] = { ...model.normalizeDayLog(undefined), exercises: {
        "leg-press": [{ weight: "35", reps: "8", done: true }, { weight: "35", reps: "", done: false }],
      } };
      seed.metrics["2026-10-04"] = { weightKg: "80", weight: "", weightForgotten: false, note: "", photoReminderDone: false };
      seed.metrics["2026-08-31"] = { weightKg: "82", weight: "", weightForgotten: false, note: "", photoReminderDone: false };
      const { page, errors } = await prepare(context, fixtureBackend(seed), seed);
      const label = `${engineName}-${colorScheme}${repeatCount > 1 ? `-repeat-${iteration}` : ""}`;
      console.log(`CHECK ${label}`);
      await expect(page.locator(".training-journey h2")).toHaveText("Training Week 1 of 26");
      // The circular counts are the only progress display on these cards.
      // Native progress tracks used to draw white lines across their action text.
      await expect(page.locator(".hub-choice-card > progress")).toHaveCount(0);
      await expect(page.locator(".hub-choice-card .premium-progress-ring")).toHaveCount(2);
      const ringsFit = await page.locator(".hub-choice-card .premium-progress-ring").evaluateAll((rings) => rings.every((ring) => {
        const a = ring.getBoundingClientRect(), b = ring.parentElement.getBoundingClientRect();
        return a.x >= b.x && a.right <= b.right + 1 && a.y >= b.y && a.bottom <= b.bottom + 1;
      }));
      assert.ok(ringsFit, `${label}: Coach progress counters must fit their cards`);
      await settlePresentation(page);
      await page.screenshot({ path: `outputs/ui-check/${label}-coach-cards.png` });
      const chart = page.locator(".weight-story-chart");
      await chart.getByRole("button", { name: "7 days", exact: true }).click();
      await expect(chart.locator(".story-daily")).toHaveCount(1);
      await chart.getByRole("button", { name: "All", exact: true }).click();
      await expect(chart.locator(".story-daily")).toHaveCount(2);
      await chart.getByRole("combobox", { name: "Inspect a reading", exact: true }).selectOption("2026-08-31");
      await expect(chart.locator(".chart-reading")).toContainText("82.0");
      await assertSelectionContrast(page, ".chart-range-control [aria-pressed='true']");
      await chart.getByRole("button", { name: "28 days", exact: true }).click();
      await context.setOffline(true);
      await expect(page.locator(".device-save-status")).toContainText("Offline");
      await context.setOffline(false);
      await assertLayout(page, `${label}-coach`);
      await page.screenshot({ path: `outputs/ui-check/${label}-coach.png` });
      await page.locator(".coach-disclosure > summary").click();
      await page.locator(".calorie-mode-control > summary").click();
      await assertSelectionContrast(page, ".calorie-mode-control button.selected");
      await page.locator(".coach-disclosure > summary").click();
      await navigate(page, "Today");
      await expect(page.locator(".today-command-date")).toContainText("Training Week 1");
      await page.locator(".readiness-disclosure > summary").click();
      await page.locator(".readiness-options").getByRole("button", { name: "Good", exact: true }).click();
      await assertSelectionContrast(page, ".readiness-options button.selected");
      await page.locator(".readiness-disclosure > summary").click();
      await verifyInlineExperience(page, label, viewport);
      await expect(page.locator(".move-item").first()).toBeVisible();
      await expect(page.locator(".move-item").first()).toHaveClass(/complete/);
      await assertLayout(page, `${label}-today`);
      await page.locator(".move-item").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `outputs/ui-check/${label}-today.png` });
      const detailsButton = page.getByRole("button", { name: "Details / Swap", exact: true }).first();
      // Position the action away from the fixed dock before tapping, just as a
      // user scrolls it into view. This also avoids WebKit's edge-focus scrolling.
      await detailsButton.evaluate((button) => button.scrollIntoView({ block: "center", behavior: "instant" }));
      await settlePresentation(page);
      if (viewport.width < 720) await detailsButton.tap();
      else await detailsButton.click();
      try {
        await expect(page.locator(".exercise-detail-sheet")).toBeVisible();
      } catch (error) {
        console.error("Detail diagnostics:", errors);
        await page.screenshot({ path: "outputs/ui-check/detail-failure.png" });
        throw error;
      }
      await assertSelectionContrast(page, ".swap-option-grid button.selected");
      await page.locator(".swap-option-grid button:not(.selected)").first().click();
      await assertSelectionContrast(page, ".swap-option-grid button.selected");
      await expect(page.locator(".detail-swap-alert")).toBeVisible();
      await page.screenshot({ path: `outputs/ui-check/${label}-swap.png` });
      await page.locator(".detail-swap-alert").getByRole("button", { name: "Revert to original" }).click();
      await page.getByRole("button", { name: "Close exercise details" }).click();
      await navigate(page, "Gym");
      await expect(page.locator(".gym-mode-shell")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await assertLayout(page, `${label}-gym`);
      if (viewport.width < 720) {
        await settlePresentation(page);
        const action = await page.locator(".gym-action-bar").boundingBox();
        const dock = await page.locator(".mobile-control-dock").boundingBox();
        assert.ok(action.y + action.height <= dock.y, `${label}: Gym actions overlap navigation ${JSON.stringify({ action, dock })}`);
      }
      await page.screenshot({ path: `outputs/ui-check/${label}-gym.png` });
      // Walk through the real move navigation to the GIF-only finisher from
      // the user's screenshot. Video exercises must still play inline first.
      await page.locator(".gym-main .video-poster").click();
      await expect(page.locator(".gym-main iframe")).toBeVisible();
      for (let index = 0; index < 12 && await page.locator(".gym-main h2").innerText() !== "Brisk Treadmill Finisher"; index += 1) {
        const previous = await page.locator(".gym-main h2").innerText();
        await page.locator(".gym-topbar").getByRole("button", { name: "Next move", exact: true }).click();
        await expect(page.locator(".gym-main h2")).not.toHaveText(previous);
      }
      await expect(page.locator(".gym-main h2")).toHaveText("Brisk Treadmill Finisher");
      await assertNoVideoLayout(page, `${label}-finisher`);
      await page.screenshot({ path: `outputs/ui-check/${label}-finisher-no-video.png` });
      // A synthetic GIF exercises open/close layout without a real API key.
      await context.route("**/api/workoutx-gif?**", (route) => route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }));
      await page.locator(".gym-main").getByRole("button", { name: "Show GIF", exact: true }).click();
      await expect.poll(() => page.locator(".gym-main .exercise-gif").evaluate((img) => img.naturalWidth)).toBe(1);
      await assertLayout(page, `${label}-expanded-gif`);
      await page.locator(".gym-main").getByRole("button", { name: "Hide GIF", exact: true }).click();
      await assertNoVideoLayout(page, `${label}-hidden-gif`);
      await page.clock.setFixedTime(new Date("2026-10-10T18:00:00Z"));
      // Reopen on Saturday as a new session, retaining the same saved progress.
      await page.reload();
      await expect(page.locator(".coach-hub-shell")).toBeVisible();
      await navigate(page, "Gym");
      await expect(page.locator(".gym-main h2")).toHaveText("Long Brisk Walk");
      await assertNoVideoLayout(page, `${label}-long-walk`);
      await page.screenshot({ path: `outputs/ui-check/${label}-long-walk-no-video.png` });
      await navigate(page, "Diet");
      await expect(page.locator(".diet-shell")).toBeVisible();
      await verifyRecipeExperience(page, label);
      await assertLayout(page, `${label}-diet`);
      await settlePresentation(page);
      await page.screenshot({ path: `outputs/ui-check/${label}-diet.png` });
      await navigate(page, "Progress");
      await expect(page.locator(".program-map button")).toHaveCount(26);
      await assertLayout(page, `${label}-progress`);
      await navigate(page, "Coach");
      await page.getByRole("button", { name: "Start fresh", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "Reset & start fresh" })).toBeDisabled();
      await page.screenshot({ path: `outputs/ui-check/${label}-reset.png` });
      await page.getByRole("button", { name: "Keep my progress" }).click();
      assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).metrics["2026-10-04"].weightKg, storageKey), "80");
      assert.deepEqual(errors, [], `${label}: browser errors`);
      await context.close();
      console.log(`PASS ${label}: inline logging/Undo, previous loads, tabs, charts, keyboard, contrast, Gym, recipes, Progress, reset/cancel`);
    }
  }

  const fallbackBrowser = await webkit.launch();
  browsers.push(fallbackBrowser);
  const fallbackContext = await fallbackBrowser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, colorScheme: "dark", timezoneId: "America/Vancouver", reducedMotion: "reduce" });
  const fallbackSeed = model.emptyStore("2026-10-03");
  const { page: fallbackPage, errors: fallbackErrors } = await prepare(fallbackContext, fixtureBackend(fallbackSeed), fallbackSeed, "2026-10-03T18:00:00Z");
  await fallbackContext.route("**/api/workoutx-gif?**", (route) => route.fulfill({ status: 503, contentType: "text/plain", body: "Unavailable fixture" }));
  await navigate(fallbackPage, "Gym");
  await assertNoVideoLayout(fallbackPage, "failed-gif-before");
  await fallbackPage.locator(".gym-main").getByRole("button", { name: "Show GIF", exact: true }).click();
  await expect(fallbackPage.locator(".gym-main .exercise-media-shell")).toHaveCount(0);
  await expect(fallbackPage.locator(".gym-main .gym-media-stack")).toBeHidden();
  await assertNoVideoLayout(fallbackPage, "failed-gif-after");
  await expect(fallbackPage.locator(".gym-set-table")).toBeVisible();
  await fallbackPage.screenshot({ path: "outputs/ui-check/iphone-webkit-failed-gif-no-frame.png" });
  await fallbackPage.locator(".gym-action-bar").getByRole("button", { name: /Complete Set 1/ }).click();
  await expect(fallbackPage.locator(".gym-session-summary h2")).toHaveText("Workout complete");
  await fallbackPage.locator(".undo-notice").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(fallbackPage.locator(".gym-main h2")).toHaveText("Long Brisk Walk");
  await fallbackPage.locator(".gym-day-context").getByRole("button", { name: /Skip/ }).click();
  await fallbackPage.getByRole("dialog").getByRole("button", { name: "Time", exact: true }).click();
  await expect(fallbackPage.locator(".gym-session-summary h2")).toContainText("skipped");
  await fallbackPage.locator(".undo-notice").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(fallbackPage.locator(".gym-main h2")).toHaveText("Long Brisk Walk");
  await expect(fallbackPage.locator(".gym-main .move-status-chip")).not.toContainText("Skipped");
  await fallbackPage.clock.setFixedTime(new Date("2026-10-04T18:00:00Z"));
  await fallbackPage.reload();
  await expect(fallbackPage.locator(".coach-hub-shell")).toBeVisible();
  await navigate(fallbackPage, "Today");
  await expect(fallbackPage.locator(".today-session-count")).toHaveText("0 of 3 recovery steps complete");
  await expect(fallbackPage.locator(".today-targets-disclosure .check-row").first()).toBeVisible();
  await fallbackPage.locator(".today-targets-disclosure .check-row").first().click();
  await expect(fallbackPage.locator(".today-session-count")).toHaveText("1 of 3 recovery steps complete");
  assert.deepEqual(fallbackErrors, []);
  await fallbackContext.close();
  console.log("PASS WebKit unavailable GIF, Gym completion Undo, whole-day skip Undo");

  // Two independent browser storage contexts share only the fake server. This
  // exercises the actual Supabase client, auth restoration and optimistic saves.
  const browser = await chromium.launch();
  browsers.push(browser);
  const original = model.emptyStore("2026-08-31");
  original.metrics["2026-10-04"] = { weightKg: "81", weight: "", weightForgotten: false, photoReminderDone: false, note: "Old history" };
  const backend = fixtureBackend(original);
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 402, height: 874 }, timezoneId: "America/Vancouver", reducedMotion: "reduce" })));
  const pages = [];
  for (const context of contexts) {
    const { page } = await prepare(context, backend);
    await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".account-row")).toContainText("fixture@example.test");
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.metrics["2026-10-04"]?.weightKg, storageKey)).toBe("81");
    pages.push(page);
  }
  const sibling = await contexts[0].newPage();
  await sibling.clock.setFixedTime(new Date("2026-10-05T18:00:00Z"));
  await sibling.goto(baseURL);
  await expect(sibling.locator(".account-row")).toContainText("fixture@example.test");
  await expect(sibling.locator(".training-journey .journey-meta")).toContainText("Aug 31");
  await contexts[1].setOffline(true);
  await pages[0].getByRole("button", { name: "Start fresh", exact: true }).click();
  await pages[0].getByLabel("Type RESET to confirm").fill("RESET");
  await pages[0].getByRole("button", { name: "Reset & start fresh" }).click();
  await expect.poll(() => backend.snapshot().program.startedOn).toBe("2026-10-05");
  assert.deepEqual(backend.snapshot().metrics, {});
  assert.deepEqual(backend.snapshot().days, {});
  await expect(pages[0].locator(".account-row")).toContainText("fixture@example.test");
  await expect(sibling.locator(".training-journey .journey-meta")).toContainText("Oct 5");
  await expect(sibling.locator(".hub-mini-grid > div").last().locator("strong")).toHaveText("0");
  // The stale device tries to upload an old workout while offline. Reconnecting
  // must adopt the reset, not re-introduce that edit or the deleted weight.
  await pages[1].locator(".primary-app-dock").getByRole("button", { name: "Today", exact: true }).click();
  await pages[1].locator(".move-check-button").first().click();
  await contexts[1].setOffline(false);
  await pages[1].locator(".primary-app-dock").getByRole("button", { name: "Coach", exact: true }).click();
  await pages[1].getByRole("button", { name: "Sync now", exact: true }).click();
  await expect.poll(() => pages[1].evaluate((key) => JSON.parse(localStorage.getItem(key))?.program.resetId, storageKey)).toBe(backend.snapshot().program.resetId);
  assert.deepEqual(backend.snapshot().metrics, {});
  assert.deepEqual(backend.snapshot().days, {});
  await pages[0].reload();
  await expect(pages[0].locator(".account-row")).toContainText("fixture@example.test");
  await expect(pages[0].locator(".training-journey h2")).toHaveText("Training Week 1 of 26");
  await Promise.all(contexts.map((context) => context.close()));
  console.log("PASS two-device auth/reset/same-browser tab/offline stale-save/reconnect/reload integration (fixture only)");
  }
  if (!values["momentum-only"] && !values["contrast-only"] && !values["batch-only"]) await runSharedStartChecks({ server, model, browsers, prepare, fixtureBackend, navigate, assertLayout });
  if (!values["momentum-only"] && !values["contrast-only"] && !values["shared-start-only"]) await runBatchChecks({ server, model, browsers, prepare, fixtureBackend, navigate, assertLayout });
  if (!values["contrast-only"] && !values["batch-only"] && !values["shared-start-only"]) await runMomentumChecks({ server, model, browsers, prepare, fixtureBackend, assertLayout, assertSelectionContrast, settlePresentation });
  if (!values["momentum-only"] && !values["batch-only"] && !values["shared-start-only"]) await runContrastChecks({ server, model, browsers, prepare, fixtureBackend, navigate, settlePresentation });
} catch (error) {
  // Preserve the failing screen itself, not only earlier milestone screenshots.
  // Do not let diagnostic I/O hide the original assertion or delay cleanup.
  let index = 0;
  for (const context of diagnosticContexts) {
    for (const page of context.pages()) {
      if (!page.isClosed()) await page.screenshot({ path: `outputs/ui-check/failure-${index++}.png`, timeout: 5000 }).catch(() => {});
    }
    await context.tracing.stop({ path: `outputs/ui-check/failure-trace-${index++}.zip` }).catch(() => {});
  }
  throw error;
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
}
