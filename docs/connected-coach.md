# One Connected Coach Plan

Coach is for planning. Today and Gym are for doing and logging. Diet is the only meal tracker.
There is no separate Momentum screen or parallel attendance counter.

## Use It

1. Open **Coach → Training & Muay Thai → Change training schedule**.
2. Choose **Home gym only**, **One Muay Thai trial**, or **Weekly Muay Thai classes**.
3. For a class, enter a confirmed date and optional time. Duration is the timetable slot, not
   continuous hard exercise and not an estimate of calories burned. Choose the class level.
4. For recurring classes, select one or two non-consecutive weekdays. Confirm the timetable with
   Titan; this app does not check live availability, book a place or buy a membership.
5. Review **Next 7 days** and **Save schedule**. Cancel leaves everything unchanged.
6. Follow **Today** (or **Gym**) and complete actual sets. Mark a class only after attending.
   Coach's lift/class counts and Progress derive from those same dated records.
7. To cancel future classes, save **Home gym only**. To move a trial, save a new future date.
   Recorded activity remains historical even if the new preview would otherwise replace it.

To miss just one regular class, open that date in Today and **Skip Day**. Notes/skips can be saved
ahead of time; attendance cannot. Uncooked meals use recovery portions for that skipped date unless
actual training was recorded. **Resume Day** reopens it; already-cooked food stays unchanged.

The calendar grows beyond the initial six-month preview. Recurring classes continue until
changed; the home cycle uses the user's chosen start date rather than a fixed Monday/date.
The original three-day template stays compatible for older non-home accounts until they choose
a new setup. Existing private home accounts are adopted automatically without a reset.

## Scheduling Rules

- Home-only rhythm: A, easy walk, rest, B, easy walk, rest, easy walk.
- A class replaces home work that day. The day before and after stay light/restful.
- The planner fits **at most two** home lifts into a seven-day program cycle, preferring the
  familiar A/B anchors. It leaves at least three calendar days between lifts within that cycle
  and never puts a lift on or immediately adjacent to a class date.
- Dense class weeks may have only one home lift, or none. The app does not create make-up work
  or silently raise class frequency. Choosing fewer demands is preferable to stacking sessions.
- These are transparent, conservative software rules, not a validated individualized recovery
  model. Calendar spacing is not a guarantee of recovery. Follow your coach and actual readiness.
- Each saved configuration takes effect today (or the future program start). Historical choices,
  completed/partly logged workouts and session snapshots are preserved.
- Automatic rest days require no action. Past skipped-rest markers are repaired on the next app
  visit/day rollover. No fabricated sets, calories burned or strength credits are awarded.
- Unrecorded actual workout/walk/class days still become skipped after their date ends. Missing
  weigh-ins remain forgotten, excluded from averages; they are never filled with zero.

## Progression And Food

Two complete home lifts earn one training level; rest, classes and skipped lifts do not. After
eight completed home lifts (level 5), the main press/row can have three working sets. Other work
stays at two; warm-ups/classes remain one logging round. Yellow/red readiness reduces sets.
Load suggestions continue to use the existing performance-history rules, not elapsed time alone.
Easy walks add five minutes after each four recorded completed walks, up to 30 minutes. A gap
longer than three weeks resets that walking evidence block to the ten-minute return option.

Classes and lifts use the existing **training-day** nutrition budget, not guessed exercise-calorie
add-backs. Rest uses the recovery-day budget. Logged actual work and deliberate skips are included.
Protein/calorie estimates still use the user's confirmed nutrition profile and weight evidence.
Class timing changes meal/snack labels, not the number of meals. A familiar meal about 3–4 hours
before class, or a smaller meal/snack about 1–3 hours before, is an adaptable guide, not a promise
against symptoms. Cooked batch quantities and eaten meals never change retroactively. Uncooked
batches and the 2-/3-week shopping totals follow the new schedule.

This is a deterministic, tested planner. It is not a live personal trainer, an AI model, a calorie
measurement device or a guarantee of weight loss. Regular check-ins and realistic adherence matter.

## Data And Compatibility

`src/features/coaching/plan.ts` owns validated dated choices, recurrence, recovery spacing and fuel
labels. `CoachPlan.tsx` owns the explicit editor/preview. `App.tsx` projects the shared plan and uses
the existing workout completion, nutrition, meal prep and cloud-save functions.

The `coaching` field is stored in the existing account-owned `workout_progress.data`. It follows
the same local-first persistence, three-way merge, account isolation and RLS as workouts. Each
saved choice is immutable and has a unique ID; offline devices append independent choices. The
latest effective date/timestamp/ID wins deterministically. Cancelling is a new home choice, not
a deletion that an old device can resurrect. A real Start Fresh creates a new reset generation,
clears choices and starts home training on the chosen date.

The old `momentum_progress` row, access rules and private archive are **not deleted or opened to
other users**. Authorized owners get one automatic import into their own shared account row.
Documented sets/weights/reps and eaten meals are copied once; partial work stays partial, existing
shared workout records win conflicts, and meals already in the shared log are not counted twice.
Only the active journey's dates at/after the current root start are eligible. Archived journeys
are retained, not merged into a fresh start. No migration SQL or new credentials are needed.
The legacy sync adapter remains for archive/reset compatibility, but is not another live tracker.
After import, the shared Diet log alone controls intake reviews and meal locks. Reopening a meal
cannot fall back to an old still-checked private copy; archived attendance cannot override a new skip.

## Evidence And Limits

- [WHO adult activity guidance](https://www.ncbi.nlm.nih.gov/books/NBK566046/): start small when
  inactive and build gradually; work toward aerobic activity plus strength on two or more days.
- [CDC adult activity overview](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html):
  long-term activity goals are goals to build toward, not an immediate beginner workload.
- [Mayo Clinic: eating and exercise](https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/exercise/art-20045506):
  adapt familiar meal/snack timing to comfort and the exercise session.
- [Nutrition calculations and safeguards](nutrition-coach.md) and [meal storage/batches](meal-prep.md)
  document the existing budget, weight-trend, prepared-food and shopping behavior.

The precise buffer, maximum class frequency, home-lift placement and eight-lift volume threshold
are application policy choices informed by gradual progression, not thresholds proven optimal for
every individual. No automatic intensity, sparring or weight-loss guarantee is implied.

## Verification

`npm test` covers all trial weekdays, regular weekday combinations, starts across all weekdays,
more than a year of calendar growth, actual-completion progression, rest rollover, offline merges,
invalid saved data, migration and historical preservation.

`npm run test:ui -- --coaching-only` exercises React → account save → reload/second device in
WebKit phone sizes and Chromium desktop, both themes. It checks import, shared Today/Gym completion,
trial changes, recurrence, offline cancellation and non-overlapping progress labels. The complete
UI suite also tests batch meals, nutrition, resets and contrast. Synthetic users only; production
fitness records and real bookings are never used as test fixtures.
