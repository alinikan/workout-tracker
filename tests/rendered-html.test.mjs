import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

// These tests are intentionally source-level smoke tests. They are fast, they run after a production
// build, and they catch accidental removal of core app features without requiring a browser driver.
const root = new URL("../", import.meta.url);

async function text(path) {
  // URL-based paths keep the tests portable no matter where the repository is cloned.
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
    "Seated Knee Extension Warm-Up",
    "Standing Supported Hip Abduction",
    "Glute Bridge",
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
    "workoutXId: \"1427\"",
    "workoutXId: \"3013\"",
    "youtubeId: \"m0FOpMEgero\"",
    "youtubeId: \"_2Kd0d-JEUM\"",
    "youtubeId: \"AmpUL3sOz5g\"",
    "youtubeId: \"oKzLYBh4Ui0\"",
    "youtubeId: \"wPM8icPu6H8\"",
    "pain-free knee and hip ranges",
    "never force a deep squat",
    "Quadriceps activation without deep knee bend",
    "Side hip and knee-control prep",
    "Glutes, hamstrings, and posterior hip without a squat",
    "CUH early knee exercises",
    "South Tees hip abduction",
    "AAOS knee conditioning program",
    "Hip strengthening meta-analysis",
    "Show GIF",
    "Show YouTube",
    "Completion trend",
    "Weekly consistency",
    "Exercise Detail",
    "Swap Options",
    "Revert to original",
    "smartLoadSuggestion",
    "Possibly nudge up",
    "Earn the new set",
    "EARNED_WEEK_ADHERENCE_GATE",
    "Training Week",
    "RIR target",
    "rirExplanationForWeek",
    "Too easy",
    "About right",
    "Very hard",
    "readinessQuestions",
    "readinessStatusFor",
    "Rest complete",
    "Use the full rest for better next-set quality.",
    "exercisePriorityFor",
    "priority-chip",
    "Must complete",
    "Next priority",
    "Optional if time",
    "beginnerTeachingForExercise",
    "Monthly coach check-in",
    "Cable Crunch",
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
    "Swap version",
    "swap-alert",
    "move-revert-button",
    "setOpenDietHowToSlot",
    "detailedRecipeHowTo",
    "recipeHowToSteps",
    "Beginner steps",
    "Spoon 300 g Greek yogurt into a bowl",
    "Slice the kiwi or pear into small pieces",
    "Warm 115 g cooked chicken until hot all the way through",
    "Toast 1 slice whole-grain bread until lightly crisp",
    "Bake or pan-cook the fish gently until it flakes easily",
    "weightChartModel",
    "weightMomentumCoach",
    "weightChartDeltaText",
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

  assert.doesNotMatch(page, /Reps\/sec|Daily Foundations|Export JSON|Import|Light Practice Sets|lb\/kg|Inline video/);
  assert.doesNotMatch(page, /className="load-pill"/);
  assert.doesNotMatch(page, /Starts Tuesday/);
  assert.match(page, /acefitness\.org/);
  assert.match(page, /nasm\.org/);
  assert.match(page, /youtube\.com/);
  assert.match(page, /puregym\.com/);
});

test("includes built-in diet tracker with meal swaps and kg weigh-ins", async () => {
  const [app, styles, readme] = await Promise.all([
    text("src/App.tsx"),
    text("src/styles.css"),
    text("README.md"),
  ]);
  const removedWarehouse = ["Preferred", " warehouse"].join("");
  const removedAddress = ["2370", " Ottawa"].join("");
  const removedPattern = new RegExp(
    `${removedWarehouse}|${removedAddress}`,
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
    "Lean Beef Rice Bowl",
    "Lean Beef Potato Plate",
    "Cottage Cheese and Banana",
    "Salmon Potato Plate",
    "Greek Yogurt Oat Pear Bowl",
    "Tuna Quinoa Cucumber Bowl",
    "Chicken Quinoa Veg Bowl",
    "Chicken Tomato Rice Bowl",
    "After-Work Yogurt Banana Toast",
    "Chicken Sandwich and Fruit",
    "Egg Quinoa Veg Bowl",
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
    "60-120 minutes before the gym",
    "afterWorkGymFuelForDay",
    "If dizziness starts",
    "dietRecipes",
    "weeklyDietMealMap",
    "dietDayTypeForPlanDay",
    "dietCoachNoteForDay",
    "activeDietRecipeFor",
    "dietSwapOptionsFor",
    "withAutomaticDietCompletion",
    "shoppingItemsForRecipes",
    "shoppingIngredientFor",
    "Chicken breast or skinless chicken thighs",
    "lean-beef-rice-bowl",
    "lean-beef-potato-plate",
    "120 g cooked extra-lean beef",
    "300 g potato",
    "To buy",
    "optional; skip to save calories",
    "optional; halve or skip to save calories",
    "use water to save calories",
    "updateDietDay",
    "toggleDietMeal",
    "setDietSwap",
    "Scenario help",
    "Fuel timing",
    "After-work gym fuel",
    "Mark eaten",
    "Make It",
    "Revert to original",
    "Weight coach",
    "Daily Weight Log",
    "Weekly averages",
    "Weight logs",
    "Weight Trend",
    "Momentum",
    "Window change",
    "Weekly Average History",
    "weightComparisonInsight",
    "weightWeekSummary",
    "Waist checkpoint",
    "waistProgress",
    "Monthly progress photos today",
    "personalizedDietTarget",
    "proteinWeightKg",
    "calorieMode",
  ]) {
    assert.match(app, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const weeklyMealMap = app.match(
    /const weeklyDietMealMap:[\s\S]*?};\n\nconst weeklySchedule/,
  )?.[0] ?? "";
  for (const swapOnlyRecipe of [
    "tuna-chickpea-quinoa",
    "turkey-lentil-rice",
    "yogurt-rice-cakes",
    "yogurt-muesli-pear",
    "turkey-sandwich-fruit",
    "turkey-bean-chili-lunch",
    "egg-lentil-quinoa",
    "tofu-lentil-curry",
  ]) {
    assert.doesNotMatch(weeklyMealMap, new RegExp(swapOnlyRecipe));
  }

  for (const requiredStyle of [
    "coach-hub-shell",
    "coach-hub-hero",
    "hub-choice-card",
    "diet-shell",
    "diet-strength",
    "diet-summary-panel",
    "diet-meal-card",
    "diet-meal-header",
    "slot-breakfast",
    "slot-lunch",
    "slot-snack",
    "slot-dinner",
    "diet-swap-panel",
    "diet-howto-panel",
    "diet-howto-steps",
    "diet-basics-grid",
    "swap-alert",
    "swap-revert-button",
    "move-revert-button",
    "preworkout-fuel-card",
    "fuel-step-list",
    "fuel-caution",
    "diet-week-strip",
    "diet-bottom-bar",
    "hub-weight-panel",
    "daily-weight-grid",
    "weight-visual-grid",
    "weight-chart-card",
    "weight-line-chart",
    "chart-trend-line",
    "weight-motivation-card",
    "weekly-weight-history",
    "compact-weight-log",
    "shopping-list-card",
    "object-fit: contain",
    "height: 104px",
    "height: 82px",
    "align-content: start",
    "align-self: start",
    "--diet-accent",
    "--meal-color",
    "--day-color",
  ]) {
    assert.match(styles, new RegExp(requiredStyle));
  }

  assert.match(app, /diet-\$\{selectedDietType\}/);
  assert.match(app, /\$\{selectedDietAccent\}/);
  assert.match(app, /slot-\$\{meal\.slot\}/);
  assert.match(app, /className="diet-meal-header"/);
  assert.match(styles, /\.diet-layout\s*\{[^}]*align-items: start/);
  assert.match(styles, /\.diet-meal-stack\s*\{[^}]*align-content: start/);
  assert.match(styles, /\.diet-meal-card\s*\{[^}]*align-self: start/);
  assert.doesNotMatch(styles, /\.diet-meal-card img\s*\{[^}]*height: 100%/);
  assert.doesNotMatch(styles, /\.diet-meal-card img\s*\{[^}]*height: 168px/);
  assert.doesNotMatch(styles, /\.diet-meal-card img\s*\{[^}]*min-height: 260px/);

  assert.match(readme, /Diet Features/);
  assert.match(readme, /built-in fat-loss diet plan/);
  assert.match(readme, /Preference-aware defaults/);
  assert.match(readme, /After-Work Training Fuel/);
  assert.match(readme, /Expandable Make It guide/);
  assert.match(readme, /weight trend chart/);
  assert.match(readme, /Expandable history/);
  assert.match(readme, /Revert to original/);
  assert.match(readme, /Morning weight in kg/);
  assert.match(readme, /store-neutral ingredient list/);
  assert.match(readme, /npm run dev -- --port 3001/);
  assert.doesNotMatch(app, /Body weight \(lbs\)/);
  assert.doesNotMatch(readme, /npm run dev -- -p 3001/);
  assert.doesNotMatch(app, removedPattern);
  assert.doesNotMatch(readme, removedPattern);
  assert.doesNotMatch(app, /Weekly variety|Fruit days|Fatty fish|Oats\/grains/);
  assert.doesNotMatch(app, /Read the full .* recipe first/);
  assert.doesNotMatch(app, /Wash your hands with soap/);
  assert.doesNotMatch(app, /Place the empty bowl or plate/);
  assert.doesNotMatch(app, /Rinse fruit and vegetables under cool running water/);
  assert.doesNotMatch(app, /Recipe-specific step/);
});

test("extends the PDF progression to roughly 6 months", async () => {
  const page = await text("src/App.tsx");

  assert.match(page, /PROGRAM_DAYS = 182/);
  assert.match(page, /Weeks 1-4/);
  assert.match(page, /Weeks 5-8/);
  assert.match(page, /Weeks 9-12/);
  assert.match(page, /Weeks 13-16/);
  assert.match(page, /Weeks 17-20/);
  assert.match(page, /Weeks 21-24/);
  assert.match(page, /Weeks 25-26/);
  assert.match(page, /45-60 min/);
  assert.match(page, /65-85 min/);
  assert.match(page, /targetForExercise/);
  assert.match(page, /5-7 min easy/);
  assert.match(page, /if \(month === 1\) return \[20, 30\]/);
  assert.match(page, /60-75/);
  assert.match(page, /working lbs/);
  assert.match(page, /rangedTarget/);
  assert.match(page, /double-progression rule/);
  assert.match(page, /earnedTrainingWeekForDay/);
  assert.match(page, /monthlyCheckInForDay/);
  assert.match(page, /restTimerSecondsFor/);
  assert.match(page, /sessionTimeEstimateForDay/);
  assert.match(page, /Cable Crunch/);
  assert.match(
    page,
    /const strengthWarmupIds = \[\s*"warmup-treadmill-walk",\s*"seated-knee-extension-warmup",\s*"standing-supported-hip-abduction",\s*\]/,
  );
  assert.doesNotMatch(
    page,
    /const strengthWarmupIds = \[\s*"bodyweight-squat",\s*"hip-hinge-drill"/,
  );
  assert.match(page, /"leg-press",\s*"incline-db-press",\s*"lat-pulldown",\s*"db-rdl",\s*"seated-leg-extension",\s*"seated-leg-curl"/);
  assert.match(page, /"leg-press",\s*"single-arm-row",\s*"glute-bridge",\s*"push-up",\s*"seated-db-overhead"/);
  assert.match(
    page,
    /"incline-reverse-fly",\s*"dumbbell-biceps-curl",\s*"rope-triceps-pressdown",\s*"treadmill-finisher",\s*"front-plank",\s*"dead-bug"/,
  );
  assert.match(
    page,
    /"barbell-rdl",\s*"seated-leg-curl",\s*"seated-leg-extension",\s*"cable-chest-fly",\s*"dumbbell-biceps-curl",\s*"rope-triceps-pressdown",\s*"treadmill-finisher",\s*"dead-bug",\s*"front-plank",\s*"cable-crunch"/,
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
  assert.match(readme, /WorkoutX GIF Setup/);
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
  assert.match(page, /const nextGymRows = buildWorkoutMoveRows\(nextGymCoachDay, nextGymLog, nextGymExercises\)/);
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

  assert.match(serviceWorker, /recomp-gym-console-v27/);
  assert.match(serviceWorker, /beginner-to-trained-coach-v27/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /requestDestination === "script"/);
  assert.match(serviceWorker, /APP_UPDATED/);
  assert.match(serviceWorker, /fetch\(event\.request\)/);
  assert.doesNotMatch(serviceWorker, /CORE_ASSETS = \[\s*["']\/["']/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v26/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v25/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v22/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v21/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v20/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v19/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v18/);
  assert.doesNotMatch(serviceWorker, /diet-tracker-v17/);
  assert.doesNotMatch(serviceWorker, /lower-machine-accessories-v16/);
  assert.doesNotMatch(serviceWorker, /recomp-gym-console-v15/);
});

test("documents the codebase with tutorial-style comments and a walkthrough", async () => {
  const [app, styles, supabaseClient, walkthrough, readme] = await Promise.all([
    text("src/App.tsx"),
    text("src/styles.css"),
    text("src/lib/supabaseClient.ts"),
    text("docs/code-walkthrough.md"),
    text("README.md"),
  ]);

  assert.match(app, /Tutorial map/);
  assert.match(app, /Storage keys are versioned/);
  assert.match(app, /volume progression engine/);
  assert.match(app, /localStorage first/);
  assert.match(app, /Gym Mode always uses actual today/);
  assert.match(styles, /Stylesheet map/);
  assert.match(styles, /Product polish/);
  assert.match(styles, /Coach Hub and Diet tracker/);
  assert.match(supabaseClient, /Supabase browser client setup/);
  assert.match(walkthrough, /File-By-File Guide/);
  assert.match(walkthrough, /JSON files such as `package\.json`/);
  assert.match(walkthrough, /knee\/hip friendly/);
  assert.match(walkthrough, /seated knee extension and supported hip abduction/);
  assert.match(walkthrough, /Commenting Philosophy/);
  assert.match(readme, /Code Comments And Walkthrough/);
  assert.match(readme, /docs\/code-walkthrough\.md/);
});
