# Code Walkthrough

This document explains how the Workout Tracker codebase is put together, why the files exist, and
where to make common changes. It pairs with the comments inside the source files. The goal is to
teach the project, not decorate every obvious line with a comment.

> Note: JSON files such as `package.json`, `tsconfig.json`, `vercel.json`, and
> `public/manifest.json` cannot contain comments. Their purpose is documented here and in the
> README instead.

## Big Picture

Workout Tracker is a React + TypeScript Progressive Web App. It has three product areas:

| Area | Purpose |
| --- | --- |
| Coach Hub | Account sign-in, sync status, daily kg weigh-ins, weight chart, and weekly averages. |
| Workout | Today, Gym Mode, weekly planner, progress dashboard, and exercise library. |
| Diet | Daily meal cards, recipe steps, meal swaps, pre-workout fueling, and weekly to-buy list. |

The app saves progress in two layers:

1. `localStorage` saves immediately on the current device.
2. Supabase sync merges and saves progress across devices after sign-in.

That design lets the app work in a gym with weak reception while still giving account-based syncing
when the network is available.

## File-By-File Guide

| File | What It Is For |
| --- | --- |
| `src/App.tsx` | Main application logic, data, helpers, and UI. This is the product brain. |
| `src/styles.css` | Full visual system: colors, layout, workout UI, diet UI, modals, and PWA spacing. |
| `src/main.tsx` | Browser entry point that mounts React into `index.html`. |
| `src/lib/supabaseClient.ts` | Safe Supabase client creation and environment validation. |
| `src/vite-env.d.ts` | TypeScript declarations for Vite environment variables. |
| `api/workoutx-gif.js` | Vercel serverless proxy for optional WorkoutX GIFs. |
| `public/sw.js` | Service worker for installable PWA caching and update behavior. |
| `public/manifest.json` | Home Screen install metadata: app name, icons, scope, and display mode. |
| `public/app-icon.svg` | Vector app icon fallback. |
| `public/favicon.svg` | Browser tab icon. |
| `public/icon-192.png` | iPhone/Android PWA icon size. |
| `public/icon-512.png` | Larger PWA icon size. |
| `public/og.png` | Social preview image shown in the README and link previews. |
| `supabase/schema.sql` | Database table, grants, Row Level Security policies, and update trigger. |
| `tests/rendered-html.test.mjs` | Build-time smoke tests for important app features. |
| `.env.example` | Template for local environment variables. |
| `index.html` | HTML shell loaded by Vite before React starts. |
| `package.json` | Project metadata, scripts, dependencies, and Node engine. |
| `package-lock.json` | Exact dependency versions installed by npm. |
| `tsconfig.json` | TypeScript compiler rules. |
| `vite.config.ts` | Vite dev server, preview server, React plugin, and watch exclusions. |
| `vercel.json` | Vercel build settings. |

## `src/App.tsx`

`App.tsx` is large because this project is a single-page personal tracker with a lot of structured
data. The file is organized from definitions to rendering:

1. Imports and tutorial overview.
2. Type definitions.
3. Icon renderer.
4. Data models for exercises, sessions, logs, recipes, metrics, and cloud status.
5. Static program data: exercises, recipes, weekly meals, weekly workouts, and library order.
6. Pure helper functions for dates, progressions, targets, swaps, shopping lists, and charts.
7. Persistence helpers for localStorage and Supabase merging.
8. Media components for YouTube and optional GIF demos.
9. The main `Home` component with state, effects, action handlers, and JSX.

### Types

The union types such as `SessionType`, `AppMode`, `AppSection`, `DietMealSlot`, and `DayStatus`
act like guard rails. Instead of passing arbitrary strings around the app, TypeScript can check that
only known values are used.

Example:

```ts
type AppMode = "hub" | "workout" | "diet";
```

That means a typo such as `"workouts"` would fail during development instead of becoming a broken
button in production.

### Exercise Data

`exerciseMap` is a dictionary keyed by exercise ID. Each exercise can define:

- Name and short name.
- Movement family.
- Equipment.
- Target muscles.
- Base rep range.
- Rest time.
- Coaching cues.
- Mistakes to avoid.
- Progression guidance.
- YouTube video ID.
- Optional WorkoutX GIF ID.
- Whether it tracks pounds or just done/not done.
- Home/gym location label.
- Swap exercise IDs.
- Resource links.

The schedule stores exercise IDs instead of copying whole exercise objects. That way one update to
an exercise's cues, video, or swap list appears everywhere.

### Recipe Data

`dietRecipes` works like the exercise library, but for meals. Each recipe has:

- A meal slot.
- Recipe name.
- Photo URL.
- Calories and protein estimate.
- Tags.
- Measured ingredients.
- Short prep summary.
- Plate portions.

`recipeHowToSteps` adds longer beginner-friendly cooking instructions. The daily diet page keeps
the card short until the user opens the expandable Make It panel.

### Schedule And Program Days

The app does not hand-write 182 days. Instead:

- `weeklySchedule` defines Monday through Sunday training.
- `weeklyDietMealMap` defines Monday through Sunday default meals.
- `START_DATE` defines the first program date.
- `PROGRAM_DAYS` defines the 26-week length.
- `buildPlanDays()` generates every day.

This keeps the plan easy to maintain. A change to Monday's Strength A order automatically repeats
through all Monday-style program days.

### Progression Helpers

The plan gets harder through helper functions instead of repeated text:

- `phaseForWeek()` explains the current training block.
- `recommendedSets()` changes set count by week and exercise type.
- `warmupTarget()` scales warm-up work.
- `rampWarmupTarget()` explains lighter ramp-set percentages.
- `rangedTarget()` tightens or advances rep ranges.
- `cardioTarget()` increases walking duration and reduces it on deload weeks.
- `progressionForExercise()` adjusts coaching language for deloads and later blocks.

This approach keeps progression consistent across Today, Gym Mode, detail sheets, and progress
stats.

### Completion And Skips

Completion is mostly derived from set rows:

- A move is done when all required rows are checked.
- A move is skipped when it has a skip reason and is not complete.
- A day is complete when all moves are done.
- A day is finished with skips when no move is pending but at least one move was skipped.

That lets the app tell the truth: skipped work is visible, but it does not block the user from
ending a compromised session honestly.

### Today Versus Gym Mode

The app tracks three dates:

- `currentProgramDate`: the real current day inside the program window.
- `selectedDate`: the browsable workout day.
- `selectedDietDate`: the browsable diet day.

This matters because Gym Mode should always show the actual current workout, while the Today tab
can be used to look back or ahead.

Gym Mode uses `firstUnfinishedMoveIndex()` and `nextUnfinishedMoveIndex()` to start on the first
unfinished movement. If sets one, two, three, and five are done, Gym Mode can land on four and then
continue to six.

### Supabase Sync

The sync design is intentionally conservative:

1. Load localStorage immediately.
2. Detect Supabase auth session.
3. Fetch the user's cloud row.
4. Decide whether local data needs to merge with cloud data.
5. Save the merged result back to Supabase.
6. Debounce future cloud saves.

Local changes are never thrown away just because the user signs in. The merge functions preserve
checked boxes, typed weights, swaps, skips, notes, diet meals, and kg weigh-ins.

## `src/styles.css`

The stylesheet uses plain CSS so it is easy to deploy and easy to inspect. It relies heavily on CSS
custom properties:

```css
--accent: var(--strength-a);
--move-color: var(--accent);
--meal-color: var(--diet-accent);
```

Those variables let one class change the color identity of a whole section. For example, a Strength
A day can set a teal accent, while a Diet card can set meal-specific colors for breakfast, lunch,
snack, or dinner.

Important layout ideas:

- The app shell is capped on desktop but fills phone width.
- Bottom navigation is fixed only on mobile-style layouts.
- Gym Mode has extra bottom padding so the action bar does not cover set rows.
- Detail sheets use safe-area insets for iPhone Home Screen mode.
- Recipe images use fixed aspect ratios so text below them does not jump.

## Supabase Files

`src/lib/supabaseClient.ts` creates the browser client only when the required environment variables
are valid. If they are missing, the app still works locally and shows setup guidance.

`supabase/schema.sql` creates one row per user in `public.workout_progress`. The row contains a
JSON document with workout days, diet days, and metrics. Row Level Security is what makes the
publishable browser key safe: the database checks `auth.uid()` before reads and writes.

## PWA Files

`public/manifest.json` tells iOS, Android, and browsers how to install the app:

- Name and short name.
- Start URL.
- App scope.
- Standalone display mode.
- Icons.
- Theme colors.

`public/sw.js` caches the small shell assets and handles updates. The app previously had iPhone
Home Screen issues after deploys, so the service worker now tells open clients when a new version is
active and the React app reloads once.

## API Proxy

`api/workoutx-gif.js` exists because the WorkoutX API key must stay private. Browser JavaScript is
visible to users, so the key is stored as `WORKOUTX_API_KEY` on Vercel instead.

The proxy validates GIF IDs, fetches the real GIF, and returns it from the same domain as the app.
When no key is configured, GIFs fail quietly and YouTube remains the main demo.

## Tests

The test file is intentionally practical instead of exhaustive. It runs after a production build and
checks that the generated project still contains the major expected features:

- 26-week program.
- Exercise resources.
- Supabase sync.
- PWA assets.
- Diet tracker.
- Recipe-specific How To steps.
- Weight chart and kg weigh-ins.
- Mobile/PWA layout protections.
- This code walkthrough.

For a personal app, this kind of smoke test catches accidental deletions quickly without requiring a
large testing framework.

## Common Changes

| Goal | Edit |
| --- | --- |
| Change program start | `START_DATE` in `src/App.tsx` |
| Change program length | `PROGRAM_DAYS` in `src/App.tsx` |
| Add an exercise | Add to `exerciseMap`, then include its ID in `weeklySchedule` or `libraryOrder` |
| Add a swap | Add the replacement to `exerciseMap`, then add its ID to the original `swapIds` |
| Change set progression | `recommendedSets()` |
| Change rep/cardio progression | `targetForExercise()`, `rangedTarget()`, `cardioTarget()` |
| Add a recipe | Add to `dietRecipes`, add optional `recipeHowToSteps`, then use it in meals or swaps |
| Change default meals | `weeklyDietMealMap` |
| Change grocery grouping | `shoppingIngredientFor()` |
| Change cloud table | `supabase/schema.sql` and sync helpers in `src/App.tsx` |
| Change iPhone PWA behavior | `public/manifest.json`, `public/sw.js`, and standalone CSS media queries |

## Commenting Philosophy

The code comments are intentionally tutorial-like at the parts that need context:

- Why this file exists.
- Why a function exists.
- What risk the code prevents.
- How a feature is connected to another feature.
- Where a future editor should make changes.

They avoid narrating obvious syntax. A comment like "set x to 1" does not teach anything; a comment
like "we store swaps by original exercise ID so the schedule can remain stable" does.
