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
  assert.match(app, /START_DATE = "2026-08-25"/);
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
    "Treadmill Easy Walk",
    "Warm-Up Front Plank",
    "Light Practice Sets",
    "Brisk Treadmill Finisher",
    "Autosave",
    "Cloud sync",
    "Ordered Workout",
    "Move {exerciseIndex + 1}",
    "Weight",
  ]) {
    assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(page, /Reps\/sec|RIR|Daily Foundations|Export JSON|Import/);
  assert.doesNotMatch(page, /Starts Tuesday, Aug 25, 2026/);
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
  assert.match(app, /signInWithOtp/);
  assert.match(app, /workout_progress/);
  assert.match(app, /chooseInitialSyncedStore/);
  assert.match(app, /Synced across devices/);
  assert.match(client, /VITE_SUPABASE_URL/);
  assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /persistSession: true/);
  assert.match(envExample, /VITE_SUPABASE_URL/);
  assert.match(envExample, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(schema, /create table if not exists public\.workout_progress/);
  assert.match(schema, /alter table public\.workout_progress enable row level security/);
  assert.match(schema, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(schema, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("starts Aug 25 on the PDF Monday workout slot and ignores scratch folders", async () => {
  const [page, viteConfig] = await Promise.all([text("src/App.tsx"), text("vite.config.ts")]);

  assert.match(page, /START_DATE = "2026-08-25"/);
  assert.match(page, /const scheduleOrder = \[/);
  assert.match(page, /planDayName: planName/);
  assert.match(viteConfig, /\*\*\/work\/\*\*/);
  assert.match(viteConfig, /\*\*\/\.npm-cache\/\*\*/);
});

test("includes installable app assets", async () => {
  await Promise.all([
    access(new URL("public/manifest.json", root)),
    access(new URL("public/app-icon.svg", root)),
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/og.png", root)),
    access(new URL("public/sw.js", root)),
  ]);
});
