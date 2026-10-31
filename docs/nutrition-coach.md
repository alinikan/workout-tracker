# Personal Nutrition Coach

**An estimated starting target, real portion calculations, and cautious feedback from your records.**

The Nutrition Coach connects Coach Hub, Workout and Diet. It does not measure
metabolism, diagnose symptoms or guarantee fat loss. Its job is to make a repeatable eating plan
more individualized and to show when the evidence supports keeping or reviewing that plan.

## Start Here

1. Open **Coach → Nutrition coach**. Confirm age, height in cm, phase-starting weight in kg,
   usual daily steps and the sex-based calorie equation. No personal values are built into the
   public application or sample account.
2. Press **Calculate my target**. The target uses recent logged weights when available rather
   than blindly treating the starting value as a new scale measurement.
3. Open **Diet → Eat today**. Read the dated ingredients and
   plate quantities. The target changes those actual quantities and groceries, not just a badge.
4. Keep the existing morning weigh-in habit in Coach. Missing mornings are permitted and excluded,
   never filled with zero or an invented weight. This is an in-app reminder, not a push notification.
5. Record meals where you normally follow them. Complete a short **Daily food & activity check-in**
   in Coach when the day is known. Review several weeks of evidence before changing the target.

The five profile fields are a one-time setup, not a daily questionnaire. Age and usual steps can
be updated using the settings icon. The phase-starting weight remains visible on edits; ordinary
profile edits do not silently move the first review milestone lower.

## What Is Calculated

### Resting Energy And Daily Activity

The implementation uses the rounded **Mifflin-St Jeor** resting-energy equations:

```text
Male equation:   10 × kg + 6.25 × cm − 5 × age + 5
Female equation: 10 × kg + 6.25 × cm − 5 × age − 161
```

This is a population estimate of resting expenditure, not a measurement of an individual's
metabolism. A conservative usual-step multiplier supplies an initial non-workout activity estimate:

| Usual Steps / Day | Multiplier |
| --- | --- |
| Below 4,000 | 1.2 |
| 4,000–6,999 | 1.3 |
| 7,000–9,999 | 1.4 |
| 10,000 or more | 1.5 |

These step bands are **app heuristics**, not validated step-to-calorie conversion or the NIH
Body Weight Planner's PAL scale. The app does not implement NIH's dynamic body-composition model.
Very sedentary people can differ substantially from any estimate. Real weight and food records
are therefore essential feedback, not optional proof that an equation must be right.

### Initial Target And Training Days

The starting deficit is approximately 15% of the baseline estimate, with a 350-kcal cap and
upward rounding to practical 50-kcal increments. The app applies conservative planning floors
of 1,700 kcal for the male equation and 1,500 for the female equation. These floors are **product
guardrails, not universal medical minimums or evidence that a target is appropriate for everyone**.

Strength and confirmed trial days receive **150 kcal more** than easier days. This is a fixed
planning allowance, not a claim about calories actually burned. Walking is useful activity, not
permission to add a second exercise allowance. Do not add wearable workout calories on top.

Planned workouts use training portions. An explicitly skipped session without actual work uses
the easier-day context for uncooked food; actual lifting or class participation retains training
fuel. **Prepared containers and meals already eaten do not shrink after a skip.** Recovery concerns
also prevent a later food-cut proposal. No skipped workout creates a food punishment or a debt.

The supported setup is intentionally limited to adults 18–80, heights 140–220 cm and reference
weights 45–180 kg, with a supported maintenance estimate up to 3,600 kcal. Unsupported profiles
and underweight setups cannot silently produce a clipped restrictive target. The estimator is not
intended for pregnancy, breastfeeding, prescribed diets or individual clinical nutrition needs.

### Protein And A First Review Milestone

Protein begins near **1.8 g/kg/day**, with practical limits. The displayed daily total is still
checked against what the menu actually contains; a goal label does not prove the goal was met.
The first milestone is roughly 5% below the phase-starting weight, bounded so the app does not
keep lowering the goal into a lower BMI. It is a review point, not a deadline or an ideal-body-
weight diagnosis. Once the current weight reference reaches it, future uncooked food uses a
maintenance estimate while the user reviews the next goal. The app does not keep cutting forever.

## How Recipes Become Portions

The shared meal-prep engine supports the existing two-day/three-day batches and recipe swaps.
With an active personal target:

- Breakfast and snack quantities solve for energy and protein together, using oats/yogurt and
  the existing fruit and bread options. Bread can be a half-slice or more on an easier day when
  the target calls for it; the dated quantities are the authority.
- The remaining daily budget is divided between lunch and dinner. Each main recipe solves for
  its own meat and rice/potato quantities; swapping breast for thigh is not the same calorie
  calculation with another title.
- Vegetables and measured oil remain. Added oil varies by meat choice because thighs and beef
  contain more fat than breast. The app does not meet a target by removing whole meals.
- Amounts use practical increments and bounded serving sizes. Displayed food totals are estimates,
  not decimal-level certainty. Menus outside a reasonable target tolerance show a notice instead
  of pretending the target was met.

Food composition uses generic planning values. Buy the specified foods, including **nonfat plain
Greek yogurt** and the listed extra-lean meat, and compare real package labels. Different brands,
fat content, sauces, drinks, cooking yields and unlogged oil can change actual intake. The app is
not a complete micronutrient analysis or a substitute for food variety and individual nutrition advice.

The uncooked batch's quantities flow into the cooking ingredients, dated containers and grocery
list. A prepared batch stores a versioned nutrition context and its canonical recipe signature.
Old contexts without a personal budget retain the old algorithm and exact quantities. New contexts
retain version 1 of the calibrated algorithm. Eaten portions keep their saved snapshots. Do not
modify a released portion algorithm in place; introduce another version and preserve old decoding.

## Daily Evidence

The daily check-in asks whether listed portions were followed, extra calories outside the meals,
energy and optional actual steps. **Unknown is not zero**: choosing "as portioned" requires an
explicit extras amount, including `0` when there were none. Unknown energy is not assumed good.
There is no automatic phone step count or HealthKit connection.

A day can support an intake review only when all four meals have saved numeric portions in one
source, the user confirms quantities/extras, and the meal signature still matches. Diet is the live
meal log; old private eaten records are imported once for the authorized owner. The evidence layer selects **one complete source**,
never sums two copies of the same day or assembles an intake from mismatched partial records.

If meals are changed after the check-in, save the confirmation again. A canonical ordered signature
is independent of PostgreSQL JSON key order. Older meals without numeric snapshots are unknown,
not evidence of low intake. Daily calories remain food-label estimates even with a complete record.

## Weekly Review Rules

The review uses completed seven-day windows ending before today, not today's incomplete food log.
One scale change cannot rewrite the diet. Water, digestion, salt, illness and starting resistance
training can influence the scale; these records do not directly measure body fat.

| Evidence | Behavior |
| --- | --- |
| Fewer than four real weights in either of the last two windows | Keep the target and collect data. Missing days never become zeroes. |
| Fewer than ten confirmed food days in the last fourteen | Review consistency first; no calorie cut. |
| Low energy repeatedly, feeling unwell, or concerning workout feedback | Pause reductions and protect recovery. |
| At least seven step entries show a large change from usual activity | Review the activity profile before changing food. |
| Average is moving down without an overly fast signal | Hold the current plan. |
| Average falls faster than this gradual plan intends | A small increase may be offered after sufficient food evidence. |
| One nearly flat comparison | Hold; an earlier falling week is not a plateau. |
| Three completed weeks at the current target, four weights in each, fifteen confirmed food days, and two nearly flat comparisons | A 100-kcal reduction may be offered if intake is consistent and the planning limits permit it. |
| Confirmed intake averages above target | Follow the existing portions/review extras, rather than cutting the recipe further. |

The step-change threshold is greater than the larger of 1,500 steps or 40% of the saved baseline.
The trend rules are conservative **software confidence rules**, not clinically validated personal
thresholds. A cut cannot push the target below the planning floor, approximately 80% of the new
maintenance estimate, or more than 300 kcal below the phase's initial target. Further reductions
are not proposed at lower BMI values. The app may refuse another adjustment and advise individual
review instead of tightening indefinitely.

Changes require the explicit **Apply … kcal to uncooked portions** action. They are dated target
episodes; yesterday's target and eaten food are not rewritten. The next review needs a new evidence
window. The application never guarantees a rate of loss or treats following a plan as proof of fat loss.

## Storage, Privacy And Reset

The additive `nutrition` field lives in the existing account-bound `workout_progress.data` JSON.
Existing authentication and row-level security apply. No new SQL, API key, paid AI service or
permission grant is needed. This follows the main tracker/weight log's local browser persistence;
it does **not** inherit Momentum's separate encrypted-draft storage. Use a trusted device.

Profiles and plans are append-only dated records. Daily check-ins merge as whole timestamped
confirmations, not field-by-field combinations of somebody else's extras and another meal signature.
Account changes and the existing reset-generation rules still isolate data. Personal profile values
must not be committed to GitHub, screenshots used in documentation or synthetic test fixtures.

**Start Fresh** keeps factual profile information, uses a current reference when available, and
starts a new baseline on the chosen date. It clears nutrition check-ins and prior calorie adjustments,
along with the shared history named by the confirmation. It does not fabricate a morning weight.
If the start is in the future, the profile remains pending until then rather than asking for setup again.

## Developer Verification

| File | Responsibility |
| --- | --- |
| `src/features/nutrition/model.ts` | Profile validation, energy estimates, dated plans, food evidence, review guardrails and restart behavior. |
| `src/features/nutrition/portions.ts` | Reproducible version-1 ingredient calculations for the shared recipe catalog. |
| `src/features/nutrition/NutritionCoach.tsx` | Single profile/check-in entry point and explicit review actions. |
| `src/features/nutrition/nutrition.css` | Scoped semantic styles, accessible fields and narrow-phone layout. |
| `src/features/mealPrep/plan.ts` | Backwards-compatible budget contexts and cooked-batch snapshots. |
| `src/App.tsx` | Shared workout-day context, morning weights, one meal evidence source and account persistence. |
| `src/lib/syncMerge.ts` | Atomic check-in merge and existing generation isolation. |
| `tests/nutrition.test.mjs` | Formula, portion, confidence, preservation, merge and boundary tests. |
| `scripts/nutrition-ui-check.mjs` | Real phone/desktop UI, offline devices, cooking preservation and review integration. |

```bash
npm test
npm run test:ui -- --nutrition-only
npm run test:ui -- --contrast-only
npm run test:ui -- --repeat=2
npm audit --audit-level=high
```

Tests use synthetic accounts with environment loading disabled. No real fitness history is loaded.
The profile, daily evidence and warning states are included in phone/desktop light/dark contrast audits.

## Research And Limits

- [Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/): the resting-energy predictive equation, not proof of individual maintenance calories.
- [NIH Body Weight Planner](https://www.niddk.nih.gov/bwp): personalization inputs and the limits of estimates, especially for very sedentary people. The app does not claim to implement that model.
- [ISSN protein position stand](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/): protein guidance for exercising adults supports the broad target range, not a guarantee for every individual.
- [CDC gradual weight management](https://www.cdc.gov/healthy-weight-growth/losing-weight/): realistic habits and gradual progress rather than rapid-loss promises.
- [NIDDK successful weight-loss programs](https://www.niddk.nih.gov/health-information/weight-management/choosing-a-safe-successful-weight-loss-program): individualized eating/activity and a realistic initial review milestone.

The app helps organize decisions. The equations, label estimates, self-reports and confidence rules
all have uncertainty. Persistent/recurrent lightheadedness or poor recovery is a reason to stop pushing
and obtain appropriate help, not a reason for the app to cut food or prescribe harder exercise.
