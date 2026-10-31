# Shared Meal Prep Engine

`src/features/mealPrep/plan.ts` is a pure, deterministic engine. It does not read
the clock, browser storage, authentication, workout history or Momentum data, and
does not write to either existing tracker. UI and persistence are separate work.
`recipes.ts` is a separate structured catalog; existing Diet recipe IDs and the
legacy rotation remain available to interpret saved food history. The UI passes the connected
Coach schedule's training/rest context into this engine; confirmed trials and regular class dates
count as training. No trial date is inferred from a weekday. Moving/removing the visit
recomputes uncooked portions and groceries, while prepared batches and eaten meals retain snapshots.

## Everyday Workflow

With a confirmed **Coach → Nutrition coach** profile, portion quantities use a personal estimated
calorie/protein budget. Old cooked contexts remain reproducible; new targets change only uncooked
food. See [Personal Nutrition Coach](nutrition-coach.md) for the formula, boundaries and review rules.
Without a profile, the original bounded weight/training-day portion behavior below remains active.

1. Open **Diet**. It is the single live meal tracker; the former Momentum screen is retired.
2. In **Cook batch**, keep the default two days or choose three before starting.
   Choose one main dish for all lunches/dinners. Swap breakfast only if wanted;
   there is no requirement to invent another breakfast each morning.
3. Open **To buy**. Choose **2 weeks** (the default) or **3 weeks** for a bulk
   shopping trip. The list covers complete uncooked batches intersecting the next
   14 or 21 days, starting today (or the future plan start). Boundary batches may
   extend coverage by a day or two; their actual dates are shown. Prepared batches
   are omitted, and quantities reflect planned recipes, swaps and daily portions.
   Check off groceries you already have. Changing the range or quantities uses a
   separate checklist so an earlier smaller purchase is not treated as sufficient.
   Shopping for weeks does not mean cooking or refrigerating weeks of meals at once;
   retain the 2-3 day cooking routine and existing storage guidance below.
4. Follow **Full batch ingredients**, expand the recipe, then use **Portion by day**
   to fill the dated containers. Rice/meat cooked weights are yield estimates;
   divide the actual cooked output using the dated ingredient shares.
5. Check **Batch prepared**. The physical batch is saved and omitted from future
   shopping. This check does not mark any meal eaten or certify its freshness.
6. In **Eat today**, follow the four meals and check each actual meal. Lunch and
   dinner use containers from the same recipe, not a fresh cooking assignment.

For example, a two-day chicken/rice batch at the 80 kg reference, with one
training day and one easier day, requires **800 g raw chicken breast, 250 g dry
rice, 800 g frozen vegetables and 40 g measured oil** for four main servings.
Breakfasts/snacks add **900 g yogurt, 120 g oats, 200 g berries, two bananas and
one bread slice**. The optional paprika is separate. This is an arithmetic example,
not a calorie prescription for the owner; the app displays its actual context.

## Why This Approach

Canada's Food Guide explicitly supports [batch cooking and using leftovers](https://www.canada.ca/en/health-canada/services/food-guide/explore/healthy-eating-recommendations/cook-more-often.html)
to make home cooking practical. This app applies that idea to a busy workweek:
variety between batches, reusable ingredients within them, and minimal assembly
on workdays. Repeated meals do not themselves stop fat loss or muscle gain;
overall intake, food quality, training and consistency matter.

The [British Dietetic Association's sports nutrition guidance](https://www.bda.uk.com/resource/sport-exercise-nutrition.html)
supports regular meals with carbohydrate and protein, distributing protein over
the day, and matching carbohydrate availability to activity demands. Our bounded
portions are a transparent planning heuristic, not a validated weight-loss model
or proof that every body size meets a particular daily g/kg target. The app shows
estimated food totals and retains weight trends for feedback rather than cutting
food in response to missed sessions. No recipe guarantees a body-composition result.

Photos are illustrative serving references, not the ingredient or nutrition authority. The
breakfast reference shows oats and berries, the main references show chicken or beef, and
the snack reference includes yogurt and banana. Follow the written ingredients and measured
portions, not extra toppings in a reference photo. Photos are hosted on Unsplash; the beef
image is [Sheri Silver's beef and broccoli](https://unsplash.com/photos/a-bowl-of-beef-and-broccoli-with-white-rice-BA2UZ6w8JfY),
and the snack image is [Nikita Khowala's yogurt and banana](https://unsplash.com/photos/yogurt-cup-with-granola-banana-and-spoon-on-yellow-background-jxt0SNnrtm0),
both offered under the free Unsplash License when checked. No paid image/API service is required.

## Public API

Types exported from `plan.ts`:

```ts
type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";
type PrepContext = { training: boolean; weightKg: number | null };
type BlockChoice = {
  mainId?: string;
  breakfastId?: string;
  snackId?: string;
  preparedAt?: string;
  preparedSignature?: string;
  contexts?: Record<string, PrepContext>;
  conflictingPreparation?: Omit<BlockChoice, "conflictingPreparation">;
};
type MealPrepState = {
  version: 1;
  startedOn: string;
  schedules: Record<string, { days: 2 | 3 }>;
  blocks: Record<string, BlockChoice>;
  checked: Record<string, boolean>;
};
```

`PrepBlock`, `PrepServing`, `PrepBatch`, `PrepRecipe` and `Ingredient` are also
exported from `plan.ts`. The last two are defined and exported by `recipes.ts`.
Date strings are local calendar labels, strictly `YYYY-MM-DD`, not timestamps.

| Export | Contract |
| --- | --- |
| `createMealPrep(startedOn)` | Fresh version-1 state, initially on a 2-day schedule. |
| `normalizeMealPrep(value, fallbackDate)` | Validate persisted data; retain valid choices, preparation snapshots and boolean grocery checks. |
| `prepBlockFor(state, date)` | `{start, end, days, index, key, mainId, breakfastId, snackId}`, plus saved preparation fields. End is inclusive; index is zero-based and continuous across schedule changes; key is the start date. |
| `recipeForPrepSlot(block, slot)` | A catalog `PrepRecipe`; lunch and dinner resolve to the same main. |
| `prepServing(recipe, context)` | `{recipe, ingredients, plate, calories, protein, note}` for ONE dated serving. Ingredient quantities are purchase/preparation amounts; plate labels are concise. |
| `prepBatch(state, date, contextForDate)` | `{block, servings, ingredients, signature, mainServings}` for the containing block. Each serving has `{date, slot, serving}`. |
| `preparedBatchFor(state, date, contextForDate)` | `PrepBatch \| null`: reconstruct the original physical cooked batch for the current block's start, accepting it only when its signature exactly matches the stored prepared signature. |
| `prepShopping(batches)` | A sorted `Ingredient[]` aggregated across unique non-overlapping batches. |
| `prepShoppingWindow(state, today, days, contextForDate)` | Full, deduplicated batches covering 14 or 21 future days; returns requested start/end, all covered batches, uncooked batches and prepared count omitted. Does not mutate the plan or cooking schedule. |
| `prepShoppingKey(ingredient)` | Stable JSON string including ID, unit, basis, optionality, quantity and cooked estimate; changed quantities do not reuse an old checked state. |
| `setPrepChoice(state, date, kind, id)` | Immutable block-specific choice; validates kind and clears preparation/snapshots only when the effective recipe changes. |
| `startPrepSchedule(state, date, days)` | Add or replace the schedule at that exact date without erasing earlier/later schedule entries or saved block choices. |
| `resetPrepPrepared(state, date)` | Clear `preparedAt`, `preparedSignature` AND `contexts` for the containing block, preserving its recipe choices. |
| `isPrepDate(value)` / `addPrepDays(date, count)` | Strict calendar validation and local-noon, DST-safe day arithmetic. |

`recipes.ts` exports `prepRecipes`, `prepRecipeMap`, and
`prepNutritionEstimates`. Catalog objects are frozen to prevent accidental
cross-serving mutation; serving ingredients are fresh mutable copies. There are
five mains, two breakfast methods and one snack, all with `prep-` IDs.

`Ingredient` has `id`, `name`, `category`, `amount`, `unit`, `basis`, optional
`optional` and optional `cookedAmount`. Categories are `Protein & dairy`,
`Produce`, `Carbs`, `Pantry`; units are `g`, `ml`, `item`; bases are `raw`, `dry`,
`ready`. `PrepRecipe` has `id`, `title`, `shortTitle`, `kind`, `photo`, `minutes`,
`description`, `ingredients`, `steps`, `storage`. Kind is `main`, `breakfast` or
`snack`. Every recipe's ingredients describe ONE base serving, never a whole pot.

## Dates And Schedule Changes

An uninterrupted 2-day block has 8 meal slots and 4 main servings; a 3-day block
has 12 slots and 6 mains. Blocks roll from the activation date, not Monday, a
journey start, earned training weeks, or the current clock.

A new anchor inside an earlier block clips that block's inclusive `end` to the
day before the new anchor. **`days` remains the schedule cadence, 2 or 3; it is
not the actual date count after clipping.** Count actual dates from `servings`,
or use `mainServings / 2`. For example, a 2-day block starting October 26 followed
by a new 3-day schedule on October 27 covers October 26 only: 4 slots, 2 mains.
The next block covers October 27-29. No meal slot overlaps.

Rebasing an existing anchor starts there; it does not move the anchor earlier.
Schedule changes can make old block-choice keys inactive; retain them rather
than reassigning them to another block. Editing past schedules is mechanically
possible but the UI must protect historical/cooked meals and obtain explicit
confirmation for replanning. Queries before activation throw instead of
inventing replacement meals for legacy dates.

Defaults rotate chicken breast/rice, skinless thigh/potato, chicken
breast/potato, extra-lean beef/rice. That is one beef block per 8 days at the
default cadence, or per 12 days at a steady 3-day cadence. Beef/potato is a swap,
not another default block. Explicit schedule rebases or swaps can change that
frequency; this is not a weekly red-meat allowance or dietary prescription.

## Serving And Shopping Arithmetic

Each date's context is evaluated once for all four slots. Chicken portions scale
around a 150 g cooked base at 80 kg, in 5 g increments, bounded to 120-200 g.
Beef uses a smaller 120 g base at 80 kg, bounded to 120-160 g. Missing, non-finite,
zero or negative weights use the base; no huge meat portions are generated.
These are practical portion heuristics, NOT a validated daily g/kg prescription.
Actual estimated protein is shown rather than claiming every weight meets a
particular protein target.

Rest-day mains include 60 g dry rice or 300 g raw potatoes, 200 g frozen mixed
vegetables and **10 g required measured olive oil**. Training adds 5 g dry rice
or 25 g raw potato per main. Breakfast is 250 g yogurt, 60 g oats and 100 g
berries, without required whey. Snack is 200 g yogurt and one medium banana;
one bread slice is added ONLY on training days. Keep bread dry and toast on its
day. Optional paprika is a separate pantry item, excluded from calorie/protein
estimates. Optional does not mean required oil can be silently omitted.

At base weight (or no weight), rounded daily ingredient estimates are:

| Default main | Rest day kcal | Training day kcal |
| --- | ---: | ---: |
| Chicken breast + rice | 1,950 | 2,070 |
| Skinless thighs + potatoes | 2,070 | 2,190 |
| Chicken breast + potatoes | 1,970 | 2,090 |
| Extra-lean beef + rice | 1,910 | 2,030 |

These totals include breakfast, two mains, snack and required oil. They are not
custom calorie targets or a safety/adequacy guarantee. Weight-dependent portions
and actual products change totals; larger portions can exceed this range. Show
the current plan's estimated totals, not the old Diet 1,850/2,050 headlines.
There is no calorie-deficit input, negative adjustment or compensation for
missed exercise. `training` should describe the date's planned support needs,
not be flipped off retrospectively because a session was missed.

Nutrition is calculated only from the explicit **food-label estimate assumptions**
in `prepNutritionEstimates`, using raw meat, dry grains, ready dairy and medium
fruit/bread items. It is not a live food database, lab analysis, or a claim that
the user's brand has those exact values. Calories are rounded to 10 kcal and
protein to whole grams per serving. Summed rounded servings can differ slightly
from computing a day from unrounded values. Use actual product labels for better
estimates; no specific branded label has been verified for this catalog.

Raw meat purchase quantities assume approximately **75% cooked yield**; rice
assumes approximately **3 times dry weight after cooking** due to water gain.
These are planning estimates, not promises. Weigh actual cooked meat and rice
separately and divide each batch in proportion to its dated ingredient amounts.
Potatoes and vegetables have no claimed exact cooked conversion. Do not buy
`cookedAmount` grams as though it were raw meat or dry rice.

`prepBatch.ingredients` sums actual dated servings, including differing weights,
training days and clipped schedule ends. `prepShopping` combines ID + unit +
basis + optionality, retaining optional items separately. It never merges raw
with ready weights, converts units, rounds up packages or invents raw/cooked
conversions. Quantities sum to 2 decimal places. A cooked total is omitted if
any contributing ingredient lacks that estimate, avoiding a partial cooked sum.
Repeated identical block queries are deduplicated; conflicting versions of a
block and overlapping date/slot batches throw. Plan shopping is not an inventory
or an automatic deduction of already eaten meals.

## Freeze Cooking Context

Marking a block prepared is an integration action. Save a context for EVERY
covered date in `blocks[block.key].contexts`, plus `preparedAt` and the batch's
`preparedSignature`. Then persist that state through the canonical owner store.
For example:

```ts
const block = prepBlockFor(state, date);
const contexts: Record<string, PrepContext> = {};
for (let day = block.start; day <= block.end; day = addPrepDays(day, 1)) {
  contexts[day] = { ...(block.contexts?.[day] ?? contextForDate(day)) };
}
const draft: MealPrepState = {
  ...state,
  blocks: {
    ...state.blocks,
    [block.key]: { ...state.blocks[block.key], contexts },
  },
};
const batch = prepBatch(draft, date, contextForDate);
const prepared: MealPrepState = {
  ...draft,
  blocks: {
    ...draft.blocks,
    [batch.block.key]: {
      ...draft.blocks[batch.block.key],
      preparedAt: new Date().toISOString(),
      preparedSignature: batch.signature,
    },
  },
};
```

Capture one stable context map for the entire action so a changing plan cannot
make the signature and stored contexts disagree. `prepBatch` always prefers a
saved date context over the current callback, even if future weight or training
changes. Preparation times and grocery checks are excluded from signatures;
planned serving dates, recipes, quantities and estimates are included.

For the current logical plan, preparation covers the whole assignment only when
`preparedAt` exists AND `preparedSignature === prepBatch(...).signature`. A
schedule cutoff can change that equality without changing what was actually
cooked. Use `preparedBatchFor(state, originalStart, contextForDate)` to show the
physical record: it can still contain four or six main portions even when the
old logical assignment now covers only one day. It resolves the current block's
start, so query the old start to inspect that old record, not a replacement
schedule's later date.

The helper reads only original start/end/cadence metadata from the saved JSON
signature, validates its matching start and at-most-three-day span, and requires
valid saved contexts for every original date. It temporarily removes schedule
anchors strictly after the start through the original end, restores the original
cadence at the start, and recalculates using the current catalog plus those saved
contexts. Only an EXACT signature match is accepted; signed ingredient payloads
are never imported as food. Missing contexts, malformed signatures or changed
recipes/amounts return null instead of inventing a cooked record. State is never
mutated.

Keep physical records separate from logical assignments. For example, after
starting a new batch on day two, the original physical pot still has four main
portions, but its logical assignment has two mains followed by the new batch's
non-overlapping assignment. Do not combine the original physical batch with the
new logical batch as new demand, shopping or consumption: they describe some
of the same date/slots. `prepShopping` rejects that overlap. Remaining physical
portions are not automatically assigned to another date or counted as eaten.

`conflictingPreparation` retains ONE validated alternative preparation from a
concurrent explicit cooking action for UI review. Its provided recipe IDs must
match known kinds, its preparation timestamp must be valid ISO, its signature
nonempty, and its context map nonempty with valid dated contexts. Nested
conflicts and unknown fields are dropped without recursion. It is not a second
automatic meal assignment or an automatic shopping addition. Explicit unprepare
and actual recipe changes clear the conflict, saved contexts and prepared
markers together; merely reading the physical record preserves all of them.

Recipe changes and `resetPrepPrepared` clear snapshots too.
Context snapshots freeze this version's formulas, not arbitrary future code or
catalog edits. Never silently alter an existing version's portion math; migrate
explicitly or persist full serving snapshots if future releases need them.

## Safe Storage And Cooking

Health Canada's [leftover guidance](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/food-safety-tips-leftovers.html)
recommends eating refrigerated leftovers within 2-3 days or freezing them,
prompt cooling in shallow containers, discarding cooked food left out over
2 hours, and reheating to 74 C. Its [safe storage guidance](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-food-storage.html)
specifies a fridge at 4 C or colder. The [cooking temperature chart](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-internal-cooking-temperatures.html)
specifies 74 C for chicken pieces and 71 C for ground beef. Check with a digital
thermometer; elapsed cooking time alone is insufficient. Sources checked
October 26, 2026.

This feature deliberately asks users to freeze the third day's cooked portions
on prep day after prompt cooling, then thaw in the fridge and reheat. This is
the application's conservative rule, not a claim that Health Canada mandates
freezing every third-day portion. It does not make poorly handled food safe.
Only prepare the first two overnight breakfasts assembled; leave day-three oats
dry, berries frozen and yogurt refrigerated until assembly. Follow dairy,
frozen-berry and vegetable package directions. Preparation markers do not
measure actual fridge temperature or prove the food is safe.

## Integration And Preserved History

Persist one canonical shared `MealPrepState`; pass it and narrow prep-specific callbacks to Diet.
Do not maintain competing live copies in separate sync documents. The authorized owner requested
retirement of Momentum: its eaten checks now receive a one-time import into that same account's
Diet log. The private source is retained; profiles and other users' data are not copied. Gate edits
until the correct account's shared store has loaded. See [connected Coach](connected-coach.md).

This engine does not rewrite `weeklyDietMealMap`, `dietDays`, Momentum's `meals`,
eaten booleans, per-day swaps, notes or workout progress. **Preservation is an
integration requirement, not something this engine can guarantee by itself.**
Use precedence: recorded eaten-recipe snapshot, explicit validated same-slot
swap, dated prep assignment, legacy weekday default. Before enabling/replanning
prep, preserve affected already-eaten recipes and their served portions; old
boolean-only logs cannot reconstruct food that was never recorded. Keep each
old source's archive intact; new eaten/swaps use the shared Diet log after the agreed migration.

Apply prep to open future slots only by default. Never install it by overwriting
day swaps or by calling existing swap handlers, since those clear eaten flags.
Manual swap/revert should retain existing date-scoped semantics, while reverting
an open prep meal returns to that date's batch base. A swap exception must be
reflected in any UI promise that shopping exactly matches planned meals; the
engine's totals alone cover its batch assignments, not external per-day swaps.

Extend normalizers, empty/has-data helpers, initial merges, baselines and reset
policy when persisting this state. Existing Diet normalization drops unknown
fields; its first-sign-in fallback OR-merges meal checks. Its normal three-way
merge preserves deletes/unchecks but is not recipe-aware. Momentum's existing
wrong-recipe guard compares swap IDs, not shared default identity. Both require
effective recipe/portion identity protection for concurrent prep changes.
Independent ordinary/private writes are not one atomic transaction. Carry the
eaten recipe identity in the log; do not infer it from whichever shared plan
arrived most recently.

Decide explicitly whether ordinary program reset also clears shared prep; the
current reset replaces the entire ordinary document. Keep private journeys
independent. Older installed clients can strip newly added ordinary fields, and
Momentum server validation accepts only its known schema versions. Do not bump
the private schema without the corresponding SQL migration. Grocery checks are
not eaten records and must never be used to mark consumption.

## Verification

Run `node --experimental-strip-types --test tests/meal-prep.test.mjs` and
`npm run typecheck`. The deterministic tests cover dates/DST across four time
zones, schedule clipping, rotations, four/six main servings, exact per-date totals,
bounded portions, adequate baseline estimates, cooked-context freezing, physical
prepared-batch reconstruction, one-level conflict validation, recipe
choices, signatures, optional/unit/basis aggregation, overlap rejection,
normalization and immutability. UI, sync and preserved legacy consumption need
their own integration tests in the owning App/component changes.
