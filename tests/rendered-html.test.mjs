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
    "Seated Leg Extension",
    "Incline Dumbbell Press",
    "Seated Lat Pulldown",
    "Dumbbell Romanian Deadlift",
    "Seated Leg Curl Machine",
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
    "Warm-Up Ramp: Leg Press",
    "Warm-Up Ramp: Incline Dumbbell Press",
    "Warm-Up Ramp: Goblet Squat",
    "Warm-Up Ramp: Single-Arm Dumbbell Row",
    "Brisk Treadmill Finisher",
    "Dead Bug",
    "Dumbbell Biceps Curl",
    "Cable Rope Triceps Pressdown",
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
    "workoutXId: \"0585\"",
    "workoutXId: \"0599\"",
    "youtubeId: \"m0FOpMEgero\"",
    "youtubeId: \"_2Kd0d-JEUM\"",
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
    "Weight (lbs)",
    "Morning weight (kg)",
    "Arms",
    "8-12 each side",
    "direct arms",
    "youtube-nocookie.com/embed",
    "sessionTimeForDay",
    "warmupTarget",
    "rampWarmupTarget",
    "TrainingLocation",
    "Upstairs OK",
    "Downstairs",
    "Downstairs/outside",
    "Either",
    "Home/gym split",
    "locationGuideForExercise",
    "locationFlowNoteForDay",
    "location-chip",
    "currentProgramDate",
    "gymDay",
    "gymLog",
    "gymMoveRows",
    "updateSetForDay",
    "updateGymSet",
    "setGymExerciseSwap",
    "withAutomaticDayCompletion",
    "isPlanDayComplete",
    "completePlanDay",
    "firstUnfinishedMoveIndex",
    "nextUnfinishedMoveIndex",
    "currentGymTracksWeight",
    "currentGymNextSetNumber",
    "gymPrimaryIsResolved",
    "Next Open Move",
    "All Done",
    "no-load",
    "lowerMachineAccessoryIds",
    "quad/hamstring machine accessories",
    "SkipReason",
    "MoveStatus",
    "DayStatus",
    "SkipRequest",
    "skipReasonOptions",
    "Time",
    "Pain",
    "Equipment",
    "Fatigue",
    "Other",
    "normalizeSkips",
    "mergeSkips",
    "moveStatusForExercise",
    "dayStatusForDay",
    "Finished with skips",
    "finished-with-skips",
    "move-status-chip",
    "move-skip-button",
    "skip-control-strip",
    "skip-reason-grid",
    "skipRequest",
    "requestSkipReason",
    "submitSkipReason",
    "reopenSkippedExerciseForDay",
    "With skips",
  ]) {
    assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(page, /Reps\/sec|RIR|Daily Foundations|Export JSON|Import|Light Practice Sets|lb\/kg|Inline video/);
  assert.doesNotMatch(page, /className="load-pill"/);
  assert.doesNotMatch(page, /Starts Tuesday/);
  assert.match(page, /acefitness\.org/);
  assert.match(page, /nasm\.org/);
  assert.match(page, /youtube\.com/);
  assert.match(page, /puregym\.com/);
});

test("includes PDF-based diet tracker with meal swaps and kg weigh-ins", async () => {
  const [app, styles, readme] = await Promise.all([
    text("src/App.tsx"),
    text("src/styles.css"),
    text("README.md"),
  ]);
  const removedMeasure = ["wa", "ist"].join("");
  const removedMeasureTitle = `${removedMeasure[0].toUpperCase()}${removedMeasure.slice(1)}`;
  const removedWarehouse = ["Preferred", " warehouse"].join("");
  const removedAddress = ["2370", " Ottawa"].join("");
  const removedPattern = new RegExp(
    `${removedMeasure}|${removedMeasureTitle}|${removedWarehouse}|${removedAddress}`,
  );

  for (const required of [
    "AppMode",
    "DietMealSlot",
    "DietDayType",
    "DietRecipe",
    "DietDayLog",
    "dietDays",
    "weightKg",
    "Coach Hub",
    "Choose Your Tracker",
    "Recomp Diet Console",
    "Diet tracker",
    "Blue training",
    "Green nutrition",
    "Breakfast",
    "Lunch",
    "Snack",
    "Dinner",
    "Oats, Greek Yogurt, Berries",
    "Chicken Rice Bowl",
    "Cottage Cheese and Banana",
    "Salmon Potato Plate",
    "Tuna Chickpea Quinoa Bowl",
    "Turkey Lentil Rice Bowl",
    "Tofu Edamame Stir-Fry",
    "Turkey Bean Chili",
    "Tofu Lentil Curry",
    "Morning weight (kg)",
    "dietTargets",
    "~2,050 kcal",
    "150-165 g protein",
    "25-40 g lifting-carb dose",
    "dietRecipes",
    "weeklyDietMealMap",
    "dietDayTypeForPlanDay",
    "dietCoachNoteForDay",
    "activeDietRecipeFor",
    "dietSwapOptionsFor",
    "withAutomaticDietCompletion",
    "shoppingItemsForRecipes",
    "shoppingIngredientFor",
    "To buy",
    "optional; skip to save calories",
    "optional; halve or skip to save calories",
    "use water to save calories",
    "updateDietDay",
    "toggleDietMeal",
    "setDietSwap",
    "Scenario help",
    "Mark eaten",
    "Use original",
    "Weight coach",
    "Daily Weight Log",
    "Weekly averages",
    "Weight logs",
    "Weight trend",
    "weightComparisonInsight",
    "weightWeekSummary",
  ]) {
    assert.match(app, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const requiredStyle of [
    "coach-hub-shell",
    "coach-hub-hero",
    "hub-choice-card",
    "diet-shell",
    "diet-summary-panel",
    "diet-meal-card",
    "diet-swap-panel",
    "diet-week-strip",
    "diet-bottom-bar",
    "hub-weight-panel",
    "daily-weight-grid",
    "shopping-list-card",
    "object-fit: contain",
    "height: 168px",
  ]) {
    assert.match(styles, new RegExp(requiredStyle));
  }

  assert.doesNotMatch(styles, /\.diet-meal-card img\s*\{[^}]*height: 100%/);
  assert.doesNotMatch(styles, /\.diet-meal-card img\s*\{[^}]*min-height: 260px/);

  assert.match(readme, /Using the Diet Tracker/);
  assert.match(readme, /Diet Plan PDF/);
  assert.match(readme, /morning weight in kg/);
  assert.match(readme, /store-neutral ingredient list/);
  assert.match(readme, /npm run dev -- --port 3001/);
  assert.doesNotMatch(app, /Body weight \(lbs\)/);
  assert.doesNotMatch(readme, /npm run dev -- -p 3001/);
  assert.doesNotMatch(app, removedPattern);
  assert.doesNotMatch(readme, removedPattern);
  assert.doesNotMatch(app, /Weekly variety|Fruit days|Fatty fish|Oats\/grains/);
});

test("extends the PDF progression to roughly 6 months", async () => {
  const page = await text("src/App.tsx");

  assert.match(page, /PROGRAM_DAYS = 182/);
  assert.match(page, /Weeks 13-14/);
  assert.match(page, /Weeks 19-22/);
  assert.match(page, /Weeks 24-26/);
  assert.match(page, /targetForExercise/);
  assert.match(page, /10 min easy/);
  assert.match(page, /15 min brisk/);
  assert.match(page, /working lbs/);
  assert.match(page, /rangedTarget/);
  assert.match(page, /double-progression rule/);
  assert.match(
    page,
    /const strengthWarmupIds = \[\s*"bodyweight-squat",\s*"hip-hinge-drill",\s*"incline-push-up",\s*"warmup-front-plank",\s*"warmup-treadmill-walk",\s*\]/,
  );
  assert.match(page, /"leg-press",\s*"seated-leg-extension",\s*"incline-db-press"/);
  assert.match(page, /"db-rdl",\s*"seated-leg-curl",\s*"treadmill-finisher",\s*"front-plank",\s*"dead-bug"/);
  assert.match(
    page,
    /"incline-reverse-fly",\s*"dumbbell-biceps-curl",\s*"rope-triceps-pressdown",\s*"treadmill-finisher",\s*"front-plank",\s*"dead-bug"/,
  );
  assert.match(
    page,
    /"barbell-rdl",\s*"seated-leg-curl",\s*"cable-chest-fly",\s*"dumbbell-biceps-curl",\s*"rope-triceps-pressdown",\s*"treadmill-finisher",\s*"front-plank",\s*"dead-bug"/,
  );
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
  assert.match(app, /workoutXId: "0276"/);
  assert.match(app, /workoutXId: "0416"/);
  assert.match(app, /workoutXId: "0200"/);
  assert.match(app, /youtubeId: "bxn9FBrt4-A"/);
  assert.match(app, /youtubeId: "2k9co4UIlEw"/);
  assert.match(app, /youtubeId: "4GHNbhQS-Zw"/);
  assert.match(app, /aria-pressed=\{isShowingGif\}/);
  assert.match(app, /setShowGif\(\(current\) => !current\)/);
  assert.match(app, /setGifFailed\(true\)/);
  assert.match(app, /setShowGif\(false\)/);
  assert.match(app, /YouTube/);
  assert.match(app, /youtubeEmbedUrl/);
  assert.match(app, /allowFullScreen/);
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
  assert.match(page, /const \[selectedDate, setSelectedDate\] = useState\(\(\) => closestProgramDate\(\)\)/);
  assert.match(page, /function closestProgramDate\(\)/);
  assert.match(page, /date\.getFullYear\(\)/);
  assert.match(page, /date\.getMonth\(\) \+ 1/);
  assert.match(page, /date\.getDate\(\)/);
  assert.match(page, /lastAutoAlignedDateRef/);
  assert.match(page, /setCurrentProgramDate\(nextProgramDate\)/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /document\.visibilityState === "visible"/);
  assert.match(page, /window\.addEventListener\("focus", alignWithCurrentProgramDate\)/);
  assert.match(page, /setActiveSection\("today"\)/);
  assert.match(page, /const nextProgramDate = closestProgramDate\(\)/);
  assert.match(page, /const nextGymRows = buildWorkoutMoveRows\(nextGymDay, nextGymLog, nextGymExercises\)/);
  assert.match(page, /setGymExerciseIndex\(firstUnfinishedMoveIndex\(nextGymRows\)\)/);
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
  assert.match(styles, /\.arms/);
  assert.match(styles, /#b83280/);
  assert.match(styles, /detail-sheet-backdrop/);
  assert.match(styles, /move-list/);
  assert.match(styles, /swap-option-grid/);
  assert.match(styles, /location-chip/);
  assert.match(styles, /location-flow-note/);
  assert.match(styles, /set-table\.no-load/);
  assert.match(styles, /primary\.is-pending/);
  assert.match(styles, /primary\.is-complete/);
  assert.match(styles, /primary\.is-skipped/);
  assert.match(styles, /move-item\.skipped/);
  assert.match(styles, /day-status-chip\.finished-with-skips/);
  assert.match(styles, /move-status-chip\.skipped/);
  assert.match(styles, /skip-control-strip/);
  assert.match(styles, /skip-sheet/);
  assert.match(styles, /skip-reason-grid/);
  assert.match(styles, /move-actions/);
  assert.match(styles, /mini-check input:checked \+ span::after/);
  assert.match(styles, /section-today\.app-shell/);
  assert.match(styles, /section-gym\.app-shell/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /content: "Done"/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(styles, /overscroll-behavior-x: contain/);
  assert.match(styles, /scroll-margin-bottom/);
  assert.match(styles, /grid-template-columns: 46px minmax\(0, 1fr\) 46px/);
  assert.match(app, /controllerchange/);
  assert.match(app, /aria-label=\{gymPrimaryFullLabel\}/);
});

test("service worker avoids stale Vercel app shells", async () => {
  const serviceWorker = await text("public/sw.js");

  assert.match(serviceWorker, /recomp-gym-console-v19/);
  assert.match(serviceWorker, /weight-only-diet-v19/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /requestDestination === "script"/);
  assert.match(serviceWorker, /APP_UPDATED/);
  assert.match(serviceWorker, /fetch\(event\.request\)/);
  assert.doesNotMatch(serviceWorker, /CORE_ASSETS = \[\s*["']\/["']/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v18/);
  assert.doesNotMatch(serviceWorker, /diet-tracker-v17/);
  assert.doesNotMatch(serviceWorker, /lower-machine-accessories-v16/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v15/);
});
