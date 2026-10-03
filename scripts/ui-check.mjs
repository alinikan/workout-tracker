/**
 * Run with npm run test:ui after `npx playwright install chromium webkit`.
 * A private Vite server ignores .env files and uses a routed Supabase fixture.
 * No real account, database, login credential, or personal browser is touched.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium, webkit, expect } from "playwright/test";

const storageKey = "body-recomp-gym-tracker-v1";
const fixtureHost = "tracker-fixture.supabase.co";
const server = await createServer({
  envDir: false,
  cacheDir: "node_modules/.vite-ui-check",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(`https://${fixtureHost}`),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sb_publishable_test_fixture"),
  },
  server: { host: "127.0.0.1", port: 0, watch: null },
});
await server.listen();
const baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
const model = await server.ssrLoadModule("/src/App.tsx");
await mkdir("outputs/ui-check", { recursive: true });

function fixtureBackend(initial) {
  let data = structuredClone(initial);
  let revision = 1;
  const updatedAt = () => new Date(Date.UTC(2026, 9, 5, 12, 0, revision)).toISOString();
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test" };
  const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: 2100000000 })).toString("base64url");
  const authSession = { access_token: `e30.${payload}.test`, refresh_token: "fixture-refresh-token", expires_in: 3600, expires_at: 2100000000, token_type: "bearer", user };
  return {
    snapshot: () => structuredClone(data),
    route: async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
      if (request.method() === "OPTIONS") return send({});
      if (url.pathname.endsWith("/token")) return send(authSession);
      if (url.pathname.endsWith("/user")) return send(user);
      if (url.pathname.endsWith("/logout")) return send({});
      if (url.pathname === "/rest/v1/workout_progress") {
        if (request.method() === "GET") return send([{ data, updated_at: updatedAt() }]);
        if (url.searchParams.has("updated_at") && url.searchParams.get("updated_at") !== `eq.${updatedAt()}`) return send([]);
        data = request.postDataJSON().data;
        revision += 1;
        const response = { updated_at: updatedAt() };
        return send(request.headers().accept?.includes("object+json") ? response : [response]);
      }
      throw new Error(`Unexpected fixture request: ${request.method()} ${url.pathname}`);
    },
  };
}

async function prepare(context, backend, seed) {
  await context.route(`https://${fixtureHost}/**`, backend.route);
  // External recipe/video images are irrelevant to the persistence tests. Abort
  // them to keep the fixture deterministic; the real media links stay unchanged.
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === fixtureHost ? route.fallback() : route.abort();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-05T18:00:00Z"));
  if (seed) await context.addInitScript(({ key, data }) => {
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
  const bounds = await dock.boundingBox();
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

const browsers = [];
try {
  for (const [engineName, engine, viewport] of [
    ["iphone-webkit", webkit, { width: 402, height: 874 }],
    ["compact-webkit", webkit, { width: 375, height: 812 }],
    ["macbook-chromium", chromium, { width: 1440, height: 900 }],
  ]) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, colorScheme, timezoneId: "America/Vancouver", isMobile: viewport.width < 720, hasTouch: viewport.width < 720, reducedMotion: colorScheme === "light" ? "reduce" : "no-preference" });
      const seed = model.emptyStore("2026-08-31");
      seed.metrics["2026-10-04"] = { weightKg: "80", weight: "", weightForgotten: false, note: "", photoReminderDone: false };
      const { page, errors } = await prepare(context, fixtureBackend(seed), seed);
      const label = `${engineName}-${colorScheme}`;
      await expect(page.locator(".training-journey h2")).toHaveText("Training Week 1 of 26");
      await assertLayout(page, `${label}-coach`);
      await page.screenshot({ path: `outputs/ui-check/${label}-coach.png` });
      await page.locator(".coach-disclosure > summary").click();
      await assertSelectionContrast(page, ".calorie-mode-control button.selected");
      await page.locator(".coach-disclosure > summary").click();
      await navigate(page, "Today");
      await expect(page.locator(".today-command-date")).toContainText("Training Week 1");
      await page.locator(".readiness-options").getByRole("button", { name: "Good", exact: true }).click();
      await assertSelectionContrast(page, ".readiness-options button.selected");
      await expect(page.locator(".move-item").first()).toBeVisible();
      await page.locator(".move-check-button").first().click();
      await expect(page.locator(".move-item").first()).toHaveClass(/complete/);
      await assertLayout(page, `${label}-today`);
      await page.locator(".move-item").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `outputs/ui-check/${label}-today.png` });
      const detailsButton = page.getByRole("button", { name: "Details / Swap", exact: true }).first();
      // Position the action away from the fixed dock before tapping, just as a
      // user scrolls it into view. This also avoids WebKit's edge-focus scrolling.
      await detailsButton.evaluate((button) => button.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
      await page.screenshot({ path: `outputs/ui-check/${label}-gym.png` });
      await navigate(page, "Diet");
      await expect(page.locator(".diet-shell")).toBeVisible();
      await assertLayout(page, `${label}-diet`);
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
      console.log(`PASS ${label}: Coach, Today logging, swap/revert contrast, Gym, Diet, Progress, reset/cancel`);
    }
  }

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
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
}
