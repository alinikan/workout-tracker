# Workout Tracker

A mobile-first workout tracker built from the 12-week body recomposition PDF and extended into a conservative 6-month training calendar. It turns the plan into a phone-friendly app with daily sessions, ordered exercise checklists, researched video/resource links, weight-only set logging, body check-ins, achievements, automatic local saving, and optional Supabase cloud sync across every device you sign in to.

## Features

- 182-day program calendar, which is about 6 months of training.
- App-style sections for Today, Gym Mode, Week, Progress, Library, and Account.
- iPhone-friendly bottom navigation plus a desktop tab bar for MacBook use.
- Color-coded weekly planner with a week selector for jumping through the full 6-month calendar without a cluttered 182-day rail.
- Compact Today day picker so you can choose any day in the current week or jump weeks without leaving Today.
- Gym Mode with one move at a time, large video access, set logging, previous/next move controls, and a complete-set action.
- Ordered workout cards so you can follow each day from move 1 to the final move, including warm-ups and finishers.
- YouTube-first media panels with an optional **Show GIF** button for autoplaying movement demos when a WorkoutX key is configured.
- Previous-load suggestions that show the last logged weights for each weighted exercise.
- Strength-day logging with only weight and completion checks. Reps, time, rest, and cardio targets are shown by phase, not entered by you.
- Dynamic set and target recommendations from the PDF:
  - Weeks 1-2: 2 working sets.
  - Weeks 3-6: 3 sets for the first 4 lifts, planks at 3 rounds.
  - Weeks 7-10: same structure, optional extra set if recovery is good.
  - Week 11: deload with 10-15 percent lighter loads and 2 sets.
  - Week 12: normal loads plus progress comparison.
  - Weeks 13-26: repeats the same PDF weekly structure with a second build block, higher cardio targets, longer plank targets, a deload week, and final comparison weeks.
- Warm-up moves are first-class cards with cues, resources, video links where available, targets, and completion checks.
- Body check-ins for weight, waist, and weekly notes.
- Progress section with completion streaks, strength sessions, completed sets, weekly consistency bars, recent workout history, achievements, and body check-ins.
- Exercise library with cues, mistakes to avoid, progression notes, YouTube videos, ACE/NASM/Mayo/PureGym resources, and thumbnails.
- No-gym fallback workout from the PDF.
- Automatic local saving through browser storage, plus account-based Supabase cloud sync when configured.
- Email + password sign-in so the same data appears on your MacBook, iPhone, and any other logged-in device, including the iPhone Home Screen app.
- PWA manifest, service worker, icons, and social preview image.
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

For true cross-device sync, configure Supabase and sign in with the same email on each device. After that, every completion check, weight, workout note, and body check-in is saved locally and synced to your Supabase account.

Important limitation: the cloud sync needs the same deployed app URL and the same Supabase account. If you use a different Vercel preview URL, a different Supabase project, or a different email login, it will behave like a separate account.

iPhone Home Screen note: email + password sign-in happens directly inside the Home Screen app. It does not depend on a magic link opening in the right browser.

## Optional GIF Demo Setup

The app has GIF support built in for every workout move. YouTube remains the default visual guide. Tap **Show GIF** in Gym Mode, Today, or the Move Library when you want the short looping form demo.

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

- Exact GIFs: treadmill walking, incline push-up, leg press, incline dumbbell press, lat pulldown, dumbbell Romanian deadlift, goblet squat, one-arm dumbbell row, push-up, seated dumbbell shoulder press, incline rear lateral raise, barbell Romanian deadlift, cable standing fly.
- Reference GIFs: easy treadmill warm-up, cool-down walk, bodyweight squat warm-up, hip-hinge drill, warm-up/front plank, light practice sets, mobility flow.

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
2. Open the **Cloud sync** panel.
3. Enter your email.
4. Enter a password with at least 8 characters.
5. Click **Create account** the first time.
6. After that, use **Sign in** with the same email and password on every device.
7. The panel should change to **Synced across devices**.

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
8. Open the **Cloud sync** panel.
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

- `src/App.tsx` - the main tracker app, workout data, exercise resources, autosave, cloud sync flow, and UI.
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

- The app always writes your latest progress to browser storage first.
- If Supabase is not configured, the **Cloud sync** panel says `local-only`.
- If Supabase is configured but you are signed out, local saving still works.
- After you sign in, the app loads your cloud progress row from Supabase.
- On first sign-in, local progress and cloud progress are merged so existing work is not thrown away.
- After cloud loading finishes, every change is debounced and saved back to Supabase.
- Supabase Auth owns the user identity. The `workout_progress.user_id` column matches the signed-in user id.
- Row Level Security policies in `supabase/schema.sql` prevent one account from reading or changing another account's row.
- The app uses Supabase email + password auth for Home Screen app login. This avoids the iPhone problem where a magic link opens Safari instead of the installed web app.

This is designed for one human using several devices. If you edit the exact same field on two devices at the exact same time, the most recent cloud save may win for that field. For normal use, sign in on each device and let the **Cloud sync** panel show `synced` before switching devices.

## Exercise Resource Sources

The app uses concise, paraphrased exercise cues based on the PDF plus reputable public exercise libraries and videos. The app links out to the original resources for demos.

- ACE exercise library:
  - Leg press: https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/
  - Incline chest press: https://www.acefitness.org/resources/everyone/exercise-library/25/incline-chest-press/
  - Seated lat pulldown: https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/
  - Romanian deadlift: https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/
  - Front plank: https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/
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
  - Goblet squat: https://www.nasm.org/resource-center/exercise-library/goblet-squat
  - Push-up: https://www.nasm.org/resource-center/exercise-library/push-up
  - Cable crossover: https://www.nasm.org/resource-center/exercise-library/cable-crossover
  - Prisoner squat: https://www.nasm.org/resource-center/exercise-library/prisoner-squat
  - Incline push-up: https://www.nasm.org/resource-center/exercise-library/incline-push-up
- Mayo Clinic videos:
  - Hip hinge: https://www.youtube.com/watch?v=sinpFajtRPw
  - Seated lat pull: https://www.youtube.com/watch?v=NbHnnvHkajg
  - Knee push-up option: https://www.youtube.com/watch?v=WcHtt6zT3Go
  - Front plank: https://www.youtube.com/watch?v=GgOnCjmyTfY
  - Leg press demo: https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/leg-press/vid-20084684
- PureGym demos:
  - Single-arm dumbbell row: https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/
  - Seated shoulder press: https://www.puregym.com/exercises/arms-and-shoulders/shoulder-press/seated-shoulder-press/
  - Cable fly: https://www.puregym.com/exercises/chest/chest-fly/cable-flyes/
- Cardio intensity:
  - CDC intensity guide: https://www.cdc.gov/physical-activity-basics/measuring/index.html

## Editing the Plan

Most plan data is in `src/App.tsx`:

- Change `START_DATE` to shift the whole 182-day program.
- Edit `scheduleOrder` to change the PDF day order that starts on Aug 31.
- Edit `exerciseMap` to change cues, resources, videos, reps, or rest times.
- Edit `recommendedSets()`, `targetForExercise()`, and `phaseForWeek()` to change progression logic.

If you change the start date, use `YYYY-MM-DD` format:

```ts
const START_DATE = "2026-08-31";
```

## Safety Note

This app helps you follow and track the PDF plan. It is not medical advice. Stop a movement if you feel sharp pain, dizziness, chest pain, unusual shortness of breath, or symptoms that feel wrong. If chest tissue is firm, painful, one-sided, associated with nipple discharge, or feels like a hard lump, get medical assessment before treating it as ordinary fat loss.

## Troubleshooting

### `npm install` fails

Check Node:

```bash
node -v
```

Use Node `>=22.13.0`.

### The page opens but my data is gone

First, sign in with the same email in the **Cloud sync** panel. If you are signed out, the app only sees the local browser copy on that device.

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

### The Cloud sync panel says local-only

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

That is normal on iPhone. Safari and the Home Screen app can have separate login storage. Open the Home Screen app itself, go to **Cloud sync**, and sign in there with your email and password.

### The Cloud sync panel shows an error

Read the error text in the panel first. Most sync errors come from missing Row Level Security policies, missing environment variables, or using a Supabase key from a different project than the SQL table.

### YouTube thumbnails do not load

The tracker still works. The resource links need internet access because they point to YouTube, ACE, NASM, Mayo Clinic, PureGym, and CDC.

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

Open the Home Screen app, check the **Cloud sync** panel, and sign in again if needed. If you previously used a Vercel preview URL, open the production URL in Safari, sign in there, and add that production URL to Home Screen.

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
