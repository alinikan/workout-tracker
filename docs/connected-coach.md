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
- Changing classes midweek counts strength work already performed toward that cycle's two-lift
  budget. A new fit cannot add another A/B pair after an earlier completed lift. Recorded work
  stays unchanged, and new lifts are not placed immediately after an actual strength session.
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

### Progression Notices And Evidence

`smartLoadSuggestion()` remains the source of current-attempt evidence. Its typed `action`
separates a concise instruction from the detailed explanation. `moveLoadGuidance()` additionally
checks a completed movement on the actual current date, finds the next scheduled occurrence of
the same original slot **and actual exercise**, and calculates its earned set count before giving
next-attempt advice. An added third set therefore blocks a simultaneous load increase. Deliberate
future skips and swaps are respected; future performance drafts do not count as evidence.
Warm-ups, bodyweight work, and assisted pull-ups do not receive this heavier-load preview.

`LoadGuidance.tsx` renders the action directly in normal document flow. Today shows it above an
expanded weighted log and retains earned increases on closed rows. Gym keeps a recap of earned
next-workout increases outside the automatically advancing movement, including at the end of a
session. Details → Log uses the same result. No modal, autofocus, acknowledgement database,
background push permission, automatic weight insertion, or forced movement opening is involved.
All notices derive from the existing dated logs, so Undo, corrections, account changes and reset
cannot leave a separate stale notification record. Syncing those logs reproduces the advice on
another device without changing the Supabase schema or permissions.

The rationale is progressive, repeatable training rather than novelty:

- [ACSM's 2026 position-stand summary](https://acsm.org/resistance-training-guidelines-update-2026/)
  emphasizes consistency, training major muscle groups at least twice weekly and fitting load
  and volume to the goal. More weekly volume can favor hypertrophy, but that does not establish
  a need for an inactive beginner to start with ten hard sets per muscle or rotate exercises
  every month. The home routine is a low-demand starting point, not a maximal-hypertrophy claim.
- [The exercise-variation systematic review](https://pubmed.ncbi.nlm.nih.gov/35438660/) supports
  purposeful variation rather than excessive random changes. Keeping familiar lifts allows
  comparable logs; new movements should address a goal, missing movement pattern, comfort,
  equipment access or a reviewed plateau, not just a new calendar date.
- [ACSM's earlier progression model](https://pubmed.ncbi.nlm.nih.gov/19204579/) discusses small
  load increases after the workload can be exceeded. The app's narrower 2.5–5% suggestion,
  two comparable recorded top-range attempts, 21-day evidence window and extra safeguards are
  conservative product policies, not a validated algorithm that identifies an individual's
  optimal load. The app cannot observe technique, pain, equipment calibration or actual reserve.
- [CDC's activity and weight guidance](https://www.cdc.gov/healthy-weight-growth/physical-activity/index.html)
  describes activity and food intake together in weight management. Adding exercises alone
  cannot guarantee fat loss; the existing nutrition and weight-trend tracking remain relevant.

An appropriate review after a sustained block would consider adherence, performance, recovery,
available equipment and whole-body coverage before adding modest volume or a new movement.
That is a coaching judgment, not an automatic promise that all later exercises must change.
This update improves recommendation visibility; it does not replace the home exercise template.

Classes and lifts use the existing **training-day** nutrition budget, not guessed exercise-calorie
add-backs. Rest uses the recovery-day budget. Logged actual work and deliberate skips are included.
Protein/calorie estimates still use the user's confirmed nutrition profile and weight evidence.
Class timing changes meal/snack labels, not the number of meals. A familiar meal about 3–4 hours
before class, or a smaller meal/snack about 1–3 hours before, is an adaptable guide, not a promise
against symptoms. Cooked batch quantities and eaten meals never change retroactively. Uncooked
batches and the 2-/3-week shopping totals follow the new schedule.

This is a deterministic, tested planner. It is not a live personal trainer, an AI model, a calorie
measurement device or a guarantee of weight loss. Regular check-ins and realistic adherence matter.

## Home Equipment And Preparation

Upcoming Home A and B use the preferred **Bodyweight Wall Sit**: a comfortable shallow hold,
not a forced deep squat. The easy 5–10-second wall-sit rehearsal stays separate from the
10–20-second working holds. Swapping the working exercise changes only that slot; it does not
silently replace the bodyweight preparation, its video, or its seconds field. Each bodyweight
warm-up also has its **own Swap** for explicitly choosing Wall Sit, Reverse Nordic or a gentle
seated rehearsal without changing the working exercise. Reverse Nordic
and unloaded seated knee extension remain choices through **Swap**, not additional sets.
Use the seated option when the wall position or kneeling is uncomfortable.

Equipment-specific ramp sets still follow the selected press/row movement so their setup/media
teach the equipment actually used. A warm-up is easy preparation, never another demanding set.
Existing session snapshots, archived templates and logged values are not migrated or deleted.
A previously started B session may therefore still show its saved Reverse Nordic prescription;
use each slot's own Swap control to choose Wall Sit rather than resetting the program.

The supplied exercise placard labels **HPA-1** and **HPA-2** press-arm *options*. It does not
identify the installed model or prove that every pictured attachment is usable. The
[manufacturer's H2200/H4400 brochure](https://storage.googleapis.com/hoist_products_public_data/brochure/H2200%20%26%20H4400_BROCHURE.pdf)
also distinguishes fixed and articulating press arms. This is a configuration check, not an
assertion that the pictured machine is either exact model.

For the current return-to-training routine:

- Keep the existing chest press; incline/decline presses and flyes are not extra required work.
- A properly configured **press-arm mid-row** is a promising replacement for the dumbbell row
  once the installed handles, adjustment and supported position are confirmed. It is different
  from the unavailable Mi6 seated cable row, which remains excluded from selectable swaps.
- A confirmed standing leg-curl attachment could provide direct hamstring work later; it is
  not a quadriceps replacement. Leg extensions remain excluded unless equipment availability
  is explicitly corrected. No attachment is enabled just from the placard.
- Keep the existing floor core work rather than automatically adding machine crunches or back
  extensions. New equipment is not a reason to increase total workload.

These choices prioritize a manageable repeatable routine, consistent with
[ACSM's 2026 guidance](https://acsm.org/resistance-training-guidelines-update-2026/): regular
training, individual fit and adherence matter more than complicated exercise rotation. This
supports the conservative approach, not a claim that wall sits and dynamic knee extensions
produce identical adaptations or that the exact app routine is optimal for everyone.

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
