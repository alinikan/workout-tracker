# Workout + Diet Tracker

A mobile-first recomposition tracker built from the workout PDF and the revised Diet Plan PDF. It opens to a simple Coach Hub where you choose **Workout** or **Diet**, then turns both plans into phone-friendly daily checklists with meal swaps, recipe photos, weight training logs, kg morning weigh-ins, achievements, automatic local saving, and optional Supabase cloud sync across every device you sign in to.

## Features

- 182-day program calendar, which is about 6 months of training.
- Coach Hub first screen with two clear choices: **Workout** and **Diet**.
- Workout and Diet pages land on the current program day and current week, including when launched from the iPhone Home Screen app.
- Color-coded workout sections for Today, Gym Mode, Week, Progress, and Library.
- Diet section based on the Diet Plan PDF with Breakfast, Lunch, Snack, and Dinner cards for each day.
- Diet meal cards include recipe photos, simple prep steps, exact plate portions, timing labels, calorie/protein estimates, and completion tracking.
- Meal swaps stay inside the same meal category so calories and protein stay close while variety improves.
- Diet To Buy section builds a Costco-friendly ingredient list from the selected week, including active swaps.
- Coach Hub owns account sign-in, morning weigh-ins, waist notes, daily weight history, and weekly average comparisons.
- iPhone-friendly bottom navigation plus a desktop tab bar for MacBook use.
- Color-coded weekly planner with a week selector for jumping through the full 6-month calendar without a cluttered 182-day rail.
- Compact Today day picker so you can choose any day in the current week or jump weeks without leaving Today.
- Gym Mode always opens the actual current program day, starts on the first unfinished move, skips completed moves with smart previous/next controls, and keeps the big complete button visually different before and after a move is finished.
- Ordered workout flow so you can follow each day from move 1 to the final move, including warm-ups and finishers, without every detail cluttering the screen at once.
- Every workout move has a clear status: **Not started**, **In progress**, **Done**, or **Skipped**.
- Skip tracking asks for a reason: **Time**, **Pain**, **Equipment**, **Fatigue**, or **Other**.
- Progress separates perfect **Complete** days from **Finished with skips** days, so skipped workouts stay honest instead of inflating completion.
- Home/gym split labels show whether a movement is **Upstairs OK**, **Downstairs**, **Downstairs/outside**, or **Either**.
- Exercise Detail bottom sheet with the selected move's YouTube/GIF media, cue list, common mistakes, progression note, resource links, swap options, and set log.
- Legit exercise swaps for matching movement patterns such as machine chest press, assisted pull-up, seated cable row, machine shoulder press, pec deck fly, goblet squat, and Romanian deadlift variations.
- YouTube-first media panels that play inline in the app, plus a separate YouTube button for opening the full video externally.
- Optional **Show GIF** button for autoplaying movement demos when a WorkoutX key is configured.
- Smart load suggestions that use your last logged load, completed sets, and deload weeks to suggest whether to start light, repeat, nudge up, or reduce load.
- Strength-day logging with only weight and completion checks. Reps, time, rest, and cardio targets are shown by phase, not entered by you.
- Done-only warm-ups, cardio, and bodyweight moves show Set, Target, and Done only, with no fake weight or pace input.
- Strength weights are treated as pounds/lbs, while morning body weigh-ins are treated as kilograms/kg.
- Dynamic set, warm-up, cardio, and target recommendations from the PDF plus conservative trainer-style progression:
  - Weeks 1-2: 2 working sets.
  - Weeks 3-6: 3 sets for the first 4 lifts, longer brisk cardio blocks, and slightly higher warm-up drill targets.
  - Weeks 7-10: same structure, optional extra set if recovery is good, plus a 12-minute strength finisher.
  - Week 11: deload with 10-15 percent lighter loads, easier cardio, and 2 sets.
  - Weeks 13-18: second build block with longer warm-ups, longer cardio, and 12-15 minute strength finishers.
  - Weeks 19-22: advanced consistency block with the first 4 lifts allowed to reach 4 sets if recovery is good, 15-minute warm-ups, and 15-minute strength finishers.
  - Week 23: deload with easier cardio and lighter loads.
  - Weeks 24-26: final compare block with normal loads, higher cardio targets, and body/strength comparison.
- Warm-up moves are first-class cards with cues, resources, inline videos where available, targets, and completion checks.
- The old generic warm-up item is replaced by two lift-specific warm-up ramp cards that match the first two lifts of that strength day.
- Dynamic ab work after every lifting session: dead bugs are added after the downstairs treadmill finisher so the final floor block can happen upstairs or downstairs.
- Direct lower-body machine accessories twice weekly: seated leg extensions and seated leg curls are added to Strength A and Strength C for quads and hamstrings.
- Direct biceps and triceps work twice weekly: dumbbell curls and cable rope pressdowns are added to Strength B and Strength C as small accessory blocks.
- Body check-ins for morning weight, waist, and notes live in Coach Hub only.
- Progress dashboard with completion streaks, strength sessions, completed sets, estimated cardio minutes, body check-ins, best logged loads, weekly consistency bars, recent workout history, achievements, and body trend.
- Exercise library with cues, mistakes to avoid, progression notes, inline YouTube videos, ACE/NASM/Mayo/PureGym resources, and GIF controls.
- No-gym fallback workout from the PDF.
- Automatic local saving through browser storage, plus account-based Supabase cloud sync when configured.
- Email + password sign-in so the same data appears on your MacBook, iPhone, and any other logged-in device, including the iPhone Home Screen app.
- PWA manifest, versioned service worker, safe-area spacing, icons, and social preview image for iPhone Home Screen use.
- Vercel-ready Vite config.

## Tech Stack

- Vite 8
- React 19
- TypeScript
- Plain CSS
- Browser `localStorage` for local fallback persistence
- Supabase Auth for email + password sign-in
- Supabase Postgres with Row Level Security for cloud progress
- Vercel serverless function for private WorkoutX GIF proxying
- WorkoutX exercise GIF API for optional autoplaying movement demos
- Vercel-ready static deployment

## Important Data Note

Your tracking data always saves automatically in the browser first. This keeps the app useful in the gym even when Wi-Fi is weak.

For true cross-device sync, configure Supabase and sign in with the same email on each device. After that, every workout check, diet meal, swap, kg weigh-in, workout note, diet note, and body check-in is saved locally and synced to your Supabase account.

Important limitation: the cloud sync needs the same deployed app URL and the same Supabase account. If you use a different Vercel preview URL, a different Supabase project, or a different email login, it will behave like a separate account.

iPhone Home Screen note: email + password sign-in happens directly inside the Home Screen app. It does not depend on a magic link opening in the right browser.

Launch behavior: the app opens to the Coach Hub. When you choose Workout or Diet, each side is aligned to the current program day automatically. If the iPhone Home Screen app stays in memory overnight, it moves to the new current day the next time it becomes active. You can browse other dates in Workout or Diet, but Gym Mode always uses the actual current program day.

## Using the Coach Hub

1. Open the app.
2. Choose **Workout** for the existing training tracker.
3. Choose **Diet** for the daily meal plan from the Diet Plan PDF.
4. Log your morning weight in kg from Coach Hub.
5. Review the daily weight log and weekly average cards. The comparison unlocks after two full program weeks have passed; if you missed days, the app uses only logged days and tells you how many mornings are missing.
6. Sign in from the Coach Hub **Cloud sync** card if you want everything synced across devices.

## Using the Redesigned Tracker

1. Open the app to land on today's program day and the related week automatically.
2. Use the week strip or **Jump to week** selector if you want a different date.
3. Follow the moves from top to bottom. Each row is color-coded by movement family: warm-up, legs, push, pull, hinge, core, arms, or cardio.
4. Use the location chip beside each move to decide whether it can happen upstairs or should stay in the downstairs gym.
5. Tap the numbered check button to mark a whole move complete, use **Skip** when you cannot do a move, or tap **Details / Swap** for the full set-by-set log.
6. Use **Upstairs OK** prep only when you can head downstairs soon after; do equipment ramp sets downstairs right before the working lift.
7. Use **Either** for mat/bodyweight work that can happen upstairs or downstairs without disrupting the session.
8. In the Exercise Detail sheet, tap the video area to play the YouTube demo inline. Tap the **YouTube** button only when you want to open the full video externally.
9. If a movement is unavailable, use **Swap Options** and choose a listed substitute. The app keeps the original available so you can switch back later.
10. Use **Gym Mode** when you want the largest, simplest training view. It always loads today, starts on the first unfinished move, and skips moves that are already complete.
11. Check **Progress** for program completion, streak, sets, cardio minutes, skipped days, best logged loads, weekly consistency, achievements, and body trend. A day counts as complete once every move in that day is fully checked off.
12. Return to **Coach Hub** for account sign-in, morning weigh-ins, and body trend notes.

## Using the Diet Tracker

The Diet section is based on the Diet Plan PDF: about 150-165 g protein per day, four planned feedings, moderate vegetables, two fruits most days, and calorie cycling by workout type.

1. Open **Diet** from the Coach Hub.
2. Check the day target: Strength, Cardio, or Recovery.
3. Follow the four meal cards in order: Breakfast, Lunch, Snack, Dinner.
4. Use the timing chip on each card, such as **Morning**, **Midday**, **Before workout / afternoon**, or **After workout / evening**.
5. Use the ingredient list to cook or assemble the meal.
6. Use the **Plate** list for the final portions to put in your bowl or plate.
7. Tap **Mark eaten** after you eat the meal.
8. Tap **Swap** if you need variety or a different acceptable option. Swaps stay in the same meal category.
9. Use **To buy** for the selected week's Costco-friendly ingredient list. The preferred warehouse note points to Costco Port Coquitlam, but availability can change, so check stock before you go.

Diet day types:

- **Strength:** about 2,050 kcal with 25-40 g carbohydrate near lifting.
- **Cardio:** about 1,950 kcal with normal measured carbs and hydration around treadmill work.
- **Recovery:** about 1,850 kcal with protein stable and slightly lower starch.

## Skipping Moves Properly

Skipping is built in because real gym days are not always perfect. Use it when you truly cannot do a movement that day.

- Tap **Skip** beside the move in Today, Gym Mode, or Exercise Detail.
- Choose the reason: **Time**, **Pain**, **Equipment**, **Fatigue**, or **Other**.
- The move becomes amber and shows the skip reason.
- Gym Mode treats skipped moves as resolved, so **Next Open Move** jumps to the next unfinished, unskipped exercise.
- If you change your mind, tap **Reopen** and the move goes back to the normal pending state.

Day status rules:

- **Complete:** every planned move is fully checked off.
- **Finished with skips:** all remaining work is either done or intentionally skipped.
- **Incomplete:** at least one move is still open.

Trainer rule: skipping for pain is different from skipping for time. If pain is sharp, joint-based, or unusual, stop that movement and use the note field so you can remember what happened next time.

## Home/Gym Split

Because the gym is downstairs, the app now separates movements by where they make sense.

- **Upstairs OK:** bodyweight or mat-based prep such as bodyweight squats, hip-hinge drills, warm-up planks, and mobility. Do these first in your unit only if you can head downstairs soon after.
- **Downstairs:** treadmill work, lift-specific ramp warm-ups, machines, dumbbells, and cable work. These either need the downstairs equipment or should happen immediately before the lift.
- **Downstairs/outside:** cardio walks that can use the downstairs treadmill or an outdoor route.
- **Either:** bodyweight/mat work that appears after the downstairs treadmill finisher, such as front planks and dead bugs. Staying downstairs is usually smoother, but upstairs is okay because the downstairs equipment work is already done.

Trainer rule: start with the Upstairs OK moves in your unit, then go downstairs for the treadmill warm-up, ramp sets, lifting, and treadmill finisher. After that, the remaining Either floor work can be done upstairs or downstairs.

Why this split is allowed: NSCA describes warm-ups as general work plus more specific movement prep before training, and ACE describes movement prep as controlled movement that raises readiness before harder work. The app uses that logic by allowing low-equipment bodyweight prep upstairs, then keeping treadmill work, ramp sets, and loaded exercises downstairs where they can happen immediately before lifting.

References:

- [NSCA: Introduction to Dynamic Warm-Up](https://www.nsca.com/education/articles/kinetic-select/introduction-to-dynamic-warm-up/)
- [ACE: Movement Preparation Warm-Up Strategy](https://www.acefitness.org/resources/pros/expert-articles/5404/5-reasons-movement-preparation-is-an-effective-warm-up-strategy/)

## New Core and Arm Additions

The PDF remains the backbone of the program. These additions are small accessories layered after the lifting work so the plan stays beginner-friendly and recoverable.

- **Dead Bug** appears after each Strength A, Strength B, and Strength C lifting block. It starts at 2 sets, moves toward 3 sets in the later build block, and stays easy on deload weeks.
- **Dumbbell Biceps Curl** appears twice weekly on Strength B and Strength C.
- **Cable Rope Triceps Pressdown** appears twice weekly on Strength B and Strength C.
- Arm accessories use 10-15 rep targets. Start light, keep the reps controlled, and only increase load after every set reaches the top of the target cleanly.
- The app includes YouTube-first media, WorkoutX GIF IDs, cues, mistakes to avoid, progression notes, and external resources for all three additions.

## New Lower-Body Machine Additions

Seated leg extensions and seated leg curls were added where they make the most training sense: Strength A and Strength C.

- **Seated Leg Extension** appears after Leg Press so the main compound lift still comes first, then quads get direct controlled work.
- **Seated Leg Curl Machine** appears after the Romanian deadlift pattern so hamstrings get both hip-hinge work and knee-flexion work.
- Both moves start at 2 sets, progress to 3 sets in later phases, and stay at 2 lighter sets on deload weeks.
- Both are logged in pounds/lbs.
- These are accessories, not ego lifts. Use smooth reps, quiet weight stacks, and stop if your knees feel irritated.
- The app includes YouTube-first media, WorkoutX GIF IDs, cues, mistakes to avoid, progression notes, and external resources for both machine additions.

## Progression Logic

The plan does not simply repeat the same week for 6 months. It uses training blocks so difficulty rises, then drops briefly during deload weeks so you can keep improving.

- **Treadmill warm-up:** starts at 10 minutes, then builds toward 12-15 minutes. Later blocks may include short brisk pickups, but it should never ruin your first lift.
- **Movement prep:** bodyweight squats, hinge drills, incline push-ups, and warm-up planks add reps, pauses, lower inclines, or cleaner tempo over time.
- **Lift-specific ramp warm-ups:** each strength day now has two specific ramp cards after the general warm-up. Strength A/C warm up Leg Press and Incline Dumbbell Press. Strength B warms up Goblet Squat and Single-Arm Dumbbell Row.
- **Ramp weights:** log these in pounds. They are intentionally lighter than working sets, usually around 40-85 percent depending on phase and exercise.
- **Cardio:** the Tuesday base walk, Thursday movement walk, Saturday long walk, and post-lift treadmill finishers all increase by phase.
- **Deload weeks:** Weeks 11 and 23 intentionally get easier so joints, energy, and technique can recover before the next build.

## Optional GIF Demo Setup

The app has GIF support built in for every workout move. YouTube remains the default visual guide. Tap **Show GIF** in Gym Mode, the Exercise Detail sheet, or the Move Library when you want the short looping form demo.

GIFs are loaded through `api/workoutx-gif.js`, which keeps your WorkoutX key private on Vercel. The browser only sees same-origin URLs such as `/api/workoutx-gif?id=0739`.

Why this uses a proxy: WorkoutX requires an API key, and browser image tags cannot safely attach private request headers. Do not put the key in a `VITE_` variable.

### 1. Get a WorkoutX key

1. Go to [WorkoutX](https://workoutxapp.com/).
2. Create a developer account.
3. Choose the free Exercise API plan if you only need the included monthly quota.
4. Copy your API key from the developer dashboard.

WorkoutX says the free plan includes 500 requests/month and GIF animations. Successful GIF responses are cached by the browser service worker and by Vercel, but the free quota can still be used up if you browse many moves on several devices.

### 2. Add the key locally

If you already created `.env.local`, open it and add this line:

```bash
WORKOUTX_API_KEY=YOUR_WORKOUTX_API_KEY
```

If you have not created `.env.local` yet:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
cp .env.example .env.local
```

Then fill in Supabase plus WorkoutX:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
WORKOUTX_API_KEY=YOUR_WORKOUTX_API_KEY
```

### 3. Test GIFs locally

Normal Vite local dev still works:

```bash
npm run dev
```

However, Vite does not run Vercel serverless functions by itself, so GIFs will fall back to YouTube/resource links in plain `npm run dev`.

To test the GIF proxy locally, run the app through Vercel's local dev server:

```bash
npx vercel dev
```

Open the local URL printed by Vercel. With `WORKOUTX_API_KEY` in `.env.local`, tap **Show GIF** on any exercise. The GIF should replace the media panel and autoplay.

### 4. Add the key in Vercel

1. Open your `workout-tracker` project in Vercel.
2. Go to **Settings -> Environment Variables**.
3. Add a variable named `WORKOUTX_API_KEY`.
4. Paste the WorkoutX key as the value.
5. Select **Production**, and optionally **Preview** if you test preview deployments.
6. Save.
7. Redeploy the site.

On iPhone, delete and re-add the Home Screen app only if it keeps an old cached version after deployment. The GIFs are normal image assets from your own domain, so they autoplay after tapping **Show GIF** in Safari, Chrome, and iPhone Home Screen mode.

### Current GIF Matching

Most plan movements use exact ExerciseDB-style IDs. A few warm-up/recovery items are intentionally labeled as reference GIFs because they are movement patterns rather than one exact lift.

- Exact GIFs: treadmill walking, incline push-up, leg press, seated leg extension, incline dumbbell press, machine chest press, lat pulldown, assisted pull-up, seated cable row, dumbbell Romanian deadlift, seated leg curl, goblet squat, one-arm dumbbell row, push-up, seated dumbbell shoulder press, machine shoulder press, incline rear lateral raise, barbell Romanian deadlift, cable standing fly, pec deck fly, dead bug, dumbbell biceps curl, cable rope triceps pressdown.
- Reference GIFs: easy treadmill warm-up, cool-down walk, bodyweight squat warm-up, hip-hinge drill, warm-up/front plank, lift-specific ramp warm-ups, mobility flow.

## Run on a MacBook

Open Terminal and run:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
npm install
npm run dev
```

Then open:

```bash
open http://localhost:3000
```

If port `3000` is busy:

```bash
npm run dev -- -p 3001
open http://localhost:3001
```

## Test a Production Build Locally

Run:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
npm run build
npm run preview
```

Then open:

```bash
open http://localhost:4173
```

## Set Up True Cloud Sync

The app works without Supabase, but then it is local-only. To see the same data on your iPhone, MacBook, and any other logged-in device, set up Supabase once.

### 1. Create a Supabase project

1. Go to [Supabase](https://supabase.com/).
2. Create a new project.
3. Name the project `workout-tracker`.
4. Wait for the project dashboard to finish provisioning.

### 2. Create the workout progress table

1. In Supabase, open **SQL Editor**.
2. Open this project file: `supabase/schema.sql`.
3. Copy the full SQL into the Supabase SQL editor.
4. Run it.

That SQL creates one private `workout_progress` row per signed-in user. Row Level Security is enabled, so a user can only read and write their own progress row.

### 3. Get your Supabase browser keys

In Supabase, open **Project Settings -> API** or the project **Connect** panel.

You need:

- Project URL
- Publishable key

The publishable key is safe to use in a browser app when Row Level Security is enabled. Do not use the service role key in this app.

### 4. Create local environment variables

In Terminal:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
cp .env.example .env.local
```

Open `.env.local` and fill it like this:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Restart the dev server after changing `.env.local`:

```bash
npm run dev
```

### 5. Configure Supabase email + password auth

In Supabase, open **Authentication -> Sign In / Providers -> Email**.

Use these settings for the easiest free private-app setup:

- Keep the **Email** provider enabled.
- There may not be a separate **Email + password** toggle. That is okay. Supabase password login works through the regular **Email** provider.
- Make sure **Allow new users to sign up** is enabled if you want to create the account from the app.
- Turn **Confirm email** off for this private workout tracker.

Why turn **Confirm email** off? For a personal app, it lets you create the account and sign in immediately without any auth email, custom SMTP, template editing, or iPhone magic-link problem.

If you leave **Confirm email** on, account creation can still work, but Supabase will send a confirmation email first. Confirm that email once, then return to the Home Screen app and sign in with your password.

### 6. Configure Supabase redirects

In Supabase, open **Authentication -> URL Configuration**.

Password login does not need redirect links when **Confirm email** is off, but these settings are still useful for email confirmation, password recovery, and local testing.

Set the Site URL to your production Vercel URL after deployment. During local testing, add these redirect URLs:

```text
http://localhost:3000
http://localhost:4173
```

After Vercel deploys, also add:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app
```

For this project, the production URL is:

```text
https://ali-workout.vercel.app
```

### 7. Use it

1. Run the app.
2. Open **Coach Hub**.
3. Enter your email.
4. Enter a password with at least 8 characters.
5. Click **Create account** the first time.
6. After that, use **Sign in** with the same email and password on every device.
7. The Coach Hub cloud card should change to **Synced across devices**.

When you sign in for the first time, the app keeps your existing local progress, merges it with anything already in the cloud, then saves the result to Supabase.

## Run It on Your iPhone as an App

### Option A: Best option, use the deployed Vercel website

1. Deploy the app to Vercel using the steps below.
2. On your iPhone, open the deployed URL in Safari.
3. Tap the Share button.
4. Tap **Add to Home Screen**.
5. Name it `Recomp Gym`.
6. Tap **Add**.
7. Open the new Home Screen app.
8. Use the **Cloud sync** card in Coach Hub.
9. Enter your email and password.
10. Tap **Create account** the first time, or **Sign in** if the account already exists.

It will appear like an app on your Home Screen. When you are signed in, your logs sync through Supabase for that account.

### Option B: Test from your Mac on the same Wi-Fi

Run the dev server so your phone can see it:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
npm run dev -- --host 0.0.0.0
```

Find your Mac Wi-Fi IP:

```bash
ipconfig getifaddr en0
```

On your iPhone Safari, open:

```text
http://YOUR_MAC_IP:3000
```

Example:

```text
http://192.168.1.25:3000
```

Then use Share -> Add to Home Screen.

## Deploy to Vercel

This repo includes `vercel.json`, so Vercel should use the correct commands automatically.

For cloud sync, add these environment variables in Vercel before deploying:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Use the same values from your local `.env.local`.

For autoplay GIF demos, also add this optional server-only variable:

```text
WORKOUTX_API_KEY
```

Use the key from your WorkoutX developer dashboard. This key should not start with `VITE_`.

### Deploy through the Vercel dashboard

1. Create a GitHub repository.
2. Push this project to GitHub.
3. Go to [Vercel](https://vercel.com/).
4. Click **Add New Project**.
5. Connect the GitHub repository.
6. Framework preset: **Vite**.
7. Build command: `npm run build`.
8. Install command: `npm install`.
9. Output directory: `dist`.
10. Add the two Supabase environment variables above.
11. Add `WORKOUTX_API_KEY` if you want the **Show GIF** buttons to load GIFs on the live site.
12. Click **Deploy**.
13. Copy the deployed production URL.
14. Add that URL to Supabase **Authentication -> URL Configuration** as the Site URL and as an allowed redirect URL.

### Push to GitHub from Terminal

If this folder is not already a Git repo:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
git init
git add .
git commit -m "Build workout tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/workout-tracker.git
git push -u origin main
```

If you already have a Git repo, only run:

```bash
git add .
git commit -m "Build workout tracker"
git push
```

### Deploy with the Vercel CLI

You can also deploy directly:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
npx vercel
```

Follow the prompts. When it asks for a framework, choose Vite. When it asks whether to override settings, you can keep the defaults from `vercel.json`.

For CLI deployment with cloud sync, add Vercel environment variables first:

```bash
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
npx vercel env add WORKOUTX_API_KEY production
```

Then deploy:

```bash
npx vercel --prod
```

## Useful Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm test
npm run lint
```

In this project, `npm run lint` reuses the Vite production build gate. `npm run build` creates the production output in `dist/`.

## Project Files

- `src/App.tsx` - the main tracker app, workout data, diet recipe data, exercise resources, smart load logic, meal swaps, exercise swaps, autosave, cloud sync flow, and UI.
- `src/lib/supabaseClient.ts` - optional Supabase browser client with validation so cloud config mistakes show in the app instead of causing a blank screen.
- `src/styles.css` - the responsive visual system and mobile layout.
- `src/main.tsx` - the React entry point.
- `api/workoutx-gif.js` - Vercel serverless GIF proxy that keeps the WorkoutX API key out of browser code.
- `index.html` - metadata, PWA manifest, app icon, and social card configuration.
- `.env.example` - template for local Supabase and optional WorkoutX environment variables.
- `supabase/schema.sql` - Supabase table, Row Level Security policies, grants, and update timestamp trigger.
- `public/manifest.json` - installable app metadata.
- `public/sw.js` - lightweight service worker that keeps installable-app assets cached while fetching fresh Vercel page HTML after deployments.
- `public/app-icon.svg`, `public/icon-192.png`, `public/icon-512.png` - Home Screen/app icons.
- `public/og.png` - social preview image.
- `tests/rendered-html.test.mjs` - smoke tests for tracker content and assets.
- `vercel.json` - Vercel deployment settings.

## How Sync Works

- The app always writes your latest workout, diet, meal-swap, note, and weigh-in progress to browser storage first.
- If Supabase is not configured, the Coach Hub **Cloud sync** card says `local-only`.
- If Supabase is configured but you are signed out, local saving still works.
- After you sign in, the app loads your cloud progress row from Supabase.
- On first sign-in, local progress and cloud progress are merged so existing work is not thrown away.
- After cloud loading finishes, every change is debounced and saved back to Supabase.
- Supabase Auth owns the user identity. The `workout_progress.user_id` column matches the signed-in user id.
- Row Level Security policies in `supabase/schema.sql` prevent one account from reading or changing another account's row.
- The app uses Supabase email + password auth for Home Screen app login. This avoids the iPhone problem where a magic link opens Safari instead of the installed web app.
- Diet data is stored inside `dietDays`, workout data inside `days`, and kg weigh-ins inside `metrics`.

This is designed for one human using several devices. If you edit the exact same field on two devices at the exact same time, the most recent cloud save may win for that field. For normal use, sign in on each device and let the Coach Hub **Cloud sync** card show `synced` before switching devices.

## Exercise Resource Sources

The app uses concise, paraphrased exercise cues based on the PDF plus reputable public exercise libraries and videos. The app links out to the original resources for demos.

- ACE exercise library:
  - Leg press: https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/
  - Incline chest press: https://www.acefitness.org/resources/everyone/exercise-library/25/incline-chest-press/
  - Seated lat pulldown: https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/
  - Romanian deadlift: https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/
  - Front plank: https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/
  - Seated biceps curl: https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/
  - Tricep pressdown: https://www.acefitness.org/resources/everyone/exercise-library/333/tricep-pressdown/
  - Goblet squat: https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/
  - Single-arm row: https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/
  - Push-up: https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/
  - Seated overhead press: https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/
  - Incline reverse fly: https://www.acefitness.org/resources/everyone/exercise-library/34/incline-reverse-fly/
  - Standing chest fly: https://www.acefitness.org/resources/everyone/exercise-library/160/standing-chest-fly/
- NASM exercise library:
  - Leg press: https://www.nasm.org/resource-center/exercise-library/leg-press
  - Two-arm incline dumbbell chest press: https://www.nasm.org/resource-center/exercise-library/two-arm-incline-dumbbell-chest-press
  - Dumbbell Romanian deadlift: https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift
  - Plank: https://www.nasm.org/resource-center/exercise-library/plank
  - Dead bug: https://www.nasm.org/resource-center/exercise-library/dead-bug
  - Core exercise programming: https://www.nasm.org/resource-center/blog/training/best-abs-exercises
  - Goblet squat: https://www.nasm.org/resource-center/exercise-library/goblet-squat
  - Push-up: https://www.nasm.org/resource-center/exercise-library/push-up
  - Cable crossover: https://www.nasm.org/resource-center/exercise-library/cable-crossover
  - Prisoner squat: https://www.nasm.org/resource-center/exercise-library/prisoner-squat
  - Incline push-up: https://www.nasm.org/resource-center/exercise-library/incline-push-up
  - Chest press machine: https://www.nasm.org/resource-center/exercise-library/chest-press-machine
  - Band-assisted pull-up: https://www.nasm.org/resource-center/exercise-library/band-assisted-pull-up
  - Seated machine row: https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip
  - Arm exercise guide: https://www.nasm.org/resource-center/blog/training/9-of-the-best-arm-sculpting-exercises-to-tone-and-strengthen
- Mayo Clinic videos:
  - Hip hinge: https://www.youtube.com/watch?v=sinpFajtRPw
  - Seated lat pull: https://www.youtube.com/watch?v=NbHnnvHkajg
  - Knee push-up option: https://www.youtube.com/watch?v=WcHtt6zT3Go
  - Front plank: https://www.youtube.com/watch?v=GgOnCjmyTfY
  - Biceps curl: https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675
  - Leg press demo: https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/leg-press/vid-20084684
  - Chest press demo: https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/chest-press/vid-20084687
- PureGym demos:
  - Single-arm dumbbell row: https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/
  - Seated shoulder press: https://www.puregym.com/exercises/arms-and-shoulders/shoulder-press/seated-shoulder-press/
  - Cable fly: https://www.puregym.com/exercises/chest/chest-fly/cable-flyes/
  - Machine equipment demos: https://www.puregym.com/lets-get-started/workout-builder/equipment-how-tos/
- Swap-specific sources:
  - Assisted machine pull-up: https://macrosinc.net/exercises/back/assisted-machine-pull-up/
  - Machine shoulder press: https://www.muscleandstrength.com/exercises/machine-shoulder-press
  - Pec deck fly: https://www.fittr.com/exercise-video/lever-pec-deck-fly-13/
  - Dumbbell biceps curl: https://coaching.fittr.com/exercise-video/dumbbell-bicep-curls-192/
  - Cable rope pressdown: https://www.fittr.com/exercise-video/cable-pushdown-with-rope-attachment-2/
  - Pec deck fly form notes: https://www.liveleantv.com/how-to-do-a-pec-deck-fly/
  - Seated leg extension: https://repfitness.com/blogs/training/leg-extensions
  - Leg extension machine demo: https://gym.com/exercises/leg-extension-machine
  - Seated leg curl: https://www.nasm.org/resource-center/exercise-library/seated-leg-curl
  - Seated leg curl setup guide: https://www.nasm.org/workout-exercise-guidance/how-to-seated-leg-curl
  - Hamstrings blueprint: https://www.acefitness.org/resources/pros/expert-articles/9015/the-hamstrings-blueprint-evidence-based-exercises-for-better-function/
- Cardio intensity:
  - CDC intensity guide: https://www.cdc.gov/physical-activity-basics/measuring/index.html
- Programming and progression:
  - CDC adult activity guidelines: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html
  - ACSM progression model abstract: https://pubmed.ncbi.nlm.nih.gov/11828249/
  - NSCA dynamic warm-up guide: https://www.nsca.com/education/articles/kinetic-select/introduction-to-dynamic-warm-up/
  - NASM beginner fitness routine: https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine

## Editing the Plan

Most plan data is in `src/App.tsx`:

- Change `START_DATE` to shift the whole 182-day program.
- Edit `scheduleOrder` to change the PDF day order that starts on Aug 31.
- Edit `exerciseMap` to change cues, resources, videos, reps, or rest times.
- Add or remove `swapIds` inside an exercise to control which substitute moves appear in the Detail sheet and Gym Mode swap strip.
- Edit `recommendedSets()`, `targetForExercise()`, and `phaseForWeek()` to change progression logic.

If you change the start date, use `YYYY-MM-DD` format:

```ts
const START_DATE = "2026-08-31";
```

## Safety Note

This app helps you follow and track the workout PDF and Diet Plan PDF. It is not medical advice. Stop a movement if you feel sharp pain, dizziness, chest pain, unusual shortness of breath, or symptoms that feel wrong. If chest tissue is firm, painful, one-sided, associated with nipple discharge, or feels like a hard lump, get medical assessment before treating it as ordinary fat loss. If the diet causes unusual symptoms, severe hunger, dizziness, digestive problems, or conflicts with a medical condition or medication, check with a physician or registered dietitian.

## Troubleshooting

### `npm install` fails

Check Node:

```bash
node -v
```

Use Node `>=22.13.0`.

### The page opens but my data is gone

First, sign in with the same email in the Coach Hub **Cloud sync** card. If you are signed out, the app only sees the local browser copy on that device.

If you are signed in and still do not see data:

- Confirm you are using the same deployed Vercel production URL.
- Confirm Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Confirm Supabase has your Vercel URL listed in **Authentication -> URL Configuration**.
- Confirm you ran `supabase/schema.sql` in the same Supabase project used by the app.

### The live site is a white screen after a deploy

This usually means the browser or iPhone Home Screen app kept an old service-worker cache. The old cached HTML can point to JavaScript files from a previous Vercel deployment, and those files may no longer exist.

The current service worker fixes this by using network-first page loading and clearing the old cache version. After you push this fix and Vercel finishes deploying:

1. Open `https://ali-workout.vercel.app` in Safari or Chrome.
2. Refresh once. If it was already open as a blank page, refresh twice so the new service worker can activate.
3. If the Home Screen app is still blank, delete that Home Screen icon and add it again from the production URL.
4. If Safari still shows the old blank page, clear website data for `ali-workout.vercel.app` in Safari settings, then reopen the site.

### The Coach Hub Cloud sync card says local-only

The app cannot see Supabase environment variables. For local development, create `.env.local` from `.env.example` and restart `npm run dev`. For Vercel, add the same variables in the project settings and redeploy.

### Creating an account asks me to confirm an email

For the easiest free private-app setup, turn off email confirmation in Supabase:

1. Open Supabase.
2. Go to **Authentication -> Sign In / Providers -> Email**.
3. Turn **Confirm email** off.
4. Save.
5. Return to the app and create your account again or sign in.

If you prefer to leave email confirmation on, confirm the email once in Safari, then reopen the Home Screen app and sign in with your email and password.

### The Home Screen app does not share my Safari login

That is normal on iPhone. Safari and the Home Screen app can have separate login storage. Open the Home Screen app itself, use the Coach Hub **Cloud sync** card, and sign in there with your email and password.

### The Coach Hub Cloud sync card shows an error

Read the error text in the card first. Most sync errors come from missing Row Level Security policies, missing environment variables, or using a Supabase key from a different project than the SQL table.

### Inline YouTube videos do not load

The tracker still works. The inline video panels and resource links need internet access because they point to YouTube, ACE, NASM, Mayo Clinic, PureGym, NSCA, and CDC.

### Show GIF does not display an animation

That means `WORKOUTX_API_KEY` is missing, invalid, over quota, or the app is running through plain `npm run dev` instead of `npx vercel dev`.

To fix the deployed site:

1. Open Vercel.
2. Go to **Settings -> Environment Variables**.
3. Confirm `WORKOUTX_API_KEY` exists in Production.
4. Redeploy.
5. Reopen the site or Home Screen app.

To test locally with GIFs:

```bash
cd /Users/alinikan/Documents/Codex/2026-08-24/i-w
npx vercel dev
```

### Vercel deploys but the Home Screen app has old data

Open the Home Screen app, check the Coach Hub **Cloud sync** card, and sign in again if needed. If you previously used a Vercel preview URL, open the production URL in Safari, sign in there, and add that production URL to Home Screen.

### The iPhone Home Screen web app opens half-loaded or buttons do not respond

This is usually an old standalone PWA shell or iOS safe-area issue. The app includes iPhone-specific viewport settings, safe-area spacing, and a versioned service worker so scripts/styles refresh correctly in Home Screen mode.

After deploying a PWA fix:

1. Open the existing Home Screen app once and wait 10-20 seconds.
2. Fully close it from the iPhone app switcher.
3. Reopen it.
4. If it is still broken, delete that Home Screen icon and add it again from `https://ali-workout.vercel.app`.

## Supabase References

- [Use Supabase with React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Initialize the Supabase JavaScript client](https://supabase.com/docs/reference/javascript/initializing)
- [Password-based auth](https://supabase.com/docs/guides/auth/passwords)
- [Create an account with `signUp`](https://supabase.com/docs/reference/javascript/auth-signup)
- [Sign in with `signInWithPassword`](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Listen to auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Upsert rows with Supabase JavaScript](https://supabase.com/docs/reference/javascript/upsert)
- [Secure tables with Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
