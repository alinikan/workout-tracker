import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("ships the finished workout tracker instead of the starter preview", async () => {
  const [app, html, packageJson] = await Promise.all([
    text("src/App.tsx"),
    text("index.html"),
    text("package.json"),
  ]);

  assert.match(app, /Recomp Gym Console/);
  assert.match(app, /START_DATE = "2026-08-31"/);
  assert.match(app, /PROGRAM_DAYS = 182/);
  assert.match(app, /Strength A/);
  assert.match(app, /Cardio Base/);
  assert.match(app, /Strength C/);
  assert.match(app, /localStorage/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.json" \/>/);
  assert.match(packageJson, /"name": "workout-tracker"/);
  assert.match(packageJson, /"dev": "vite"/);

  assert.doesNotMatch(app, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(html, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("includes researched movement resources and autosave controls", async () => {
  const page = await text("src/App.tsx");

  for (const required of [
    "Leg Press",
    "Incline Dumbbell Press",
    "Seated Lat Pulldown",
    "Dumbbell Romanian Deadlift",
    "Goblet Squat",
    "Single-Arm Dumbbell Row",
    "Seated Dumbbell Overhead Press",
    "Standing Cable Chest Fly",
    "Machine Chest Press",
    "Band-Assisted Pull-Up",
    "Seated Cable Row",
    "Machine Shoulder Press",
    "Pec Deck Fly",
    "Treadmill Easy Walk",
    "Warm-Up Front Plank",
    "Light Practice Sets",
    "Brisk Treadmill Finisher",
    "Cloud sync",
    "Create account",
    "Password",
    "Gym Mode",
    "Workout Flow",
    "Jump to week",
    "Selected workout day",
    "ExerciseMedia",
    "motionDemo",
    "workoutXGifUrl",
    "Show GIF",
    "Show YouTube",
    "Completion trend",
    "Weekly consistency",
    "Exercise Detail",
    "Swap Options",
    "Use original",
    "smartLoadSuggestion",
    "Hold or nudge up",
    "Progress Dashboard",
    "dashboard-stat-grid",
    "activeExerciseFor",
    "workoutMoveRows",
    "bottom-nav",
    "section-tabs",
    "move.exerciseIndex + 1",
    "gym-action-label",
    "Weight",
  ]) {
    assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(page, /Reps\/sec|RIR|Daily Foundations|Export JSON|Import/);
  assert.doesNotMatch(page, /Starts Tuesday/);
  assert.match(page, /acefitness\.org/);
  assert.match(page, /nasm\.org/);
  assert.match(page, /youtube\.com/);
  assert.match(page, /puregym\.com/);
});

test("extends the PDF progression to roughly 6 months", async () => {
  const page = await text("src/App.tsx");

  assert.match(page, /PROGRAM_DAYS = 182/);
  assert.match(page, /Weeks 13-14/);
  assert.match(page, /Weeks 19-22/);
  assert.match(page, /Weeks 24-26/);
  assert.match(page, /targetForExercise/);
  assert.match(page, /rangedTarget/);
  assert.match(page, /double-progression rule/);
});

test("includes Supabase cloud sync with protected schema", async () => {
  const [app, client, schema, envExample, packageJson] = await Promise.all([
    text("src/App.tsx"),
    text("src/lib/supabaseClient.ts"),
    text("supabase/schema.sql"),
    text(".env.example"),
    text("package.json"),
  ]);

  assert.match(packageJson, /"@supabase\/supabase-js"/);
  assert.match(app, /signUp/);
  assert.match(app, /signInWithPassword/);
  assert.match(app, /type="password"/);
  assert.match(app, /autoComplete="current-password"/);
  assert.match(app, /workout_progress/);
  assert.match(app, /chooseInitialSyncedStore/);
  assert.match(app, /Synced across devices/);
  assert.doesNotMatch(app, /signInWithOtp|verifyOtp|one-time-code/);
  assert.match(client, /VITE_SUPABASE_URL/);
  assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /supabaseConfigError/);
  assert.match(client, /createSupabaseClient/);
  assert.match(client, /persistSession: true/);
  assert.match(envExample, /VITE_SUPABASE_URL/);
  assert.match(envExample, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(schema, /create table if not exists public\.workout_progress/);
  assert.match(schema, /alter table public\.workout_progress enable row level security/);
  assert.match(schema, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(schema, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("includes API-backed autoplay exercise GIF support", async () => {
  const [app, apiRoute, envExample, readme] = await Promise.all([
    text("src/App.tsx"),
    text("api/workoutx-gif.js"),
    text(".env.example"),
    text("README.md"),
  ]);

  assert.match(app, /motionDemoForExercise/);
  assert.match(app, /\/api\/workoutx-gif\?id=/);
  assert.match(app, /workoutXId: "0739"/);
  assert.match(app, /workoutXId: "0314"/);
  assert.match(app, /workoutXId: "1459"/);
  assert.match(app, /workoutXId: "0227"/);
  assert.match(app, /workoutXId: "0577"/);
  assert.match(app, /workoutXId: "0017"/);
  assert.match(app, /workoutXId: "0861"/);
  assert.match(app, /workoutXId: "0603"/);
  assert.match(app, /workoutXId: "0596"/);
  assert.match(app, /aria-pressed=\{isShowingGif\}/);
  assert.match(app, /setShowGif\(\(current\) => !current\)/);
  assert.match(app, /setGifFailed\(true\)/);
  assert.match(app, /setShowGif\(false\)/);
  assert.match(app, /YouTube/);
  assert.match(apiRoute, /process\.env\.WORKOUTX_API_KEY/);
  assert.match(apiRoute, /api\.workoutxapp\.com\/v1\/gifs/);
  assert.match(apiRoute, /X-WorkoutX-Key/);
  assert.match(envExample, /WORKOUTX_API_KEY/);
  assert.match(readme, /Optional GIF Demo Setup/);
  assert.match(readme, /npx vercel dev/);
});

test("starts Aug 31 on the PDF Monday workout slot and ignores scratch folders", async () => {
  const [page, viteConfig] = await Promise.all([text("src/App.tsx"), text("vite.config.ts")]);

  assert.match(page, /START_DATE = "2026-08-31"/);
  assert.match(page, /const scheduleOrder = \[/);
  assert.match(page, /planDayName: planName/);
  assert.match(viteConfig, /\*\*\/work\/\*\*/);
  assert.match(viteConfig, /\*\*\/\.npm-cache\/\*\*/);
});

test("includes installable app assets", async () => {
  const [html, manifest, styles, app] = await Promise.all([
    text("index.html"),
    text("public/manifest.json"),
    text("src/styles.css"),
    text("src/App.tsx"),
    access(new URL("public/manifest.json", root)),
    access(new URL("public/app-icon.svg", root)),
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/og.png", root)),
    access(new URL("public/sw.js", root)),
  ]);

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-status-bar-style/);
  assert.match(manifest, /"start_url": "\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/"/);
  assert.match(styles, /display-mode: standalone/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /--gym-action-bar-height/);
  assert.match(styles, /--focus-teal/);
  assert.match(styles, /--focus-coral/);
  assert.match(styles, /detail-sheet-backdrop/);
  assert.match(styles, /move-list/);
  assert.match(styles, /swap-option-grid/);
  assert.match(styles, /section-today\.app-shell/);
  assert.match(styles, /section-gym\.app-shell/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(styles, /overscroll-behavior-x: contain/);
  assert.match(styles, /scroll-margin-bottom/);
  assert.match(styles, /grid-template-columns: 46px minmax\(0, 1fr\) 46px/);
  assert.match(app, /controllerchange/);
  assert.match(app, /aria-label="Complete next set"/);
});

test("service worker avoids stale Vercel app shells", async () => {
  const serviceWorker = await text("public/sw.js");

  assert.match(serviceWorker, /recomp-gym-console-v7/);
  assert.match(serviceWorker, /product-polish-swaps-v7/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /requestDestination === "script"/);
  assert.match(serviceWorker, /APP_UPDATED/);
  assert.match(serviceWorker, /fetch\(event\.request\)/);
  assert.doesNotMatch(serviceWorker, /CORE_ASSETS = \[\s*["']\/["']/);
});
