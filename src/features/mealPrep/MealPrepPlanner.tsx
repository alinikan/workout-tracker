import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  Info,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  ShoppingBasket,
  Utensils,
  ArrowLeftRight,
  TriangleAlert,
} from "lucide-react";
import { SectionTabs } from "../../components/SessionUI";
import { isCalendarDate } from "../../lib/programLifecycle";
import {
  prepBatch,
  prepBlockFor,
  preparedBatchFor,
  prepServing,
  prepShopping,
  prepShoppingKey,
  recipeForPrepSlot,
  setPrepChoice,
  startPrepSchedule,
  type MealPrepState,
  type MealSlot,
  type PrepContext,
} from "./plan";
import { prepRecipes, prepRecipeMap } from "./recipes";
import "./meal-prep.css";

type Recipe = (typeof prepRecipes)[number];
type Ingredient = ReturnType<typeof prepShopping>[number];
type Batch = ReturnType<typeof prepBatch>;
type ChoiceKind = "main" | "breakfast" | "snack";
type Destination = "eat" | "cook" | "buy";
type Portion = { plate: string[]; calories: number; protein: number };

export type MealPrepPlannerProps = {
  state: MealPrepState;
  date: string;
  today: string;
  contextForDate: (date: string) => PrepContext;
  onChange: (next: MealPrepState) => void;
  mealLog: {
    eaten: Partial<Record<MealSlot, boolean>>;
    overrides?: Partial<Record<MealSlot, string>>;
    portions?: Partial<Record<MealSlot, Portion>>;
  };
  onToggleMeal: (slot: MealSlot) => void;
  renderLegacyMeal?: (slot: MealSlot) => ReactNode;
  history?: boolean;
  onDateChange?: (date: string) => void;
  batchLocked?: boolean;
  lockedKinds?: Partial<Record<ChoiceKind, boolean>>;
  onStartNewBatch?: () => void;
  sessionGuidance?: {
    title: string;
    detail: string;
    prepared: string;
    timings?: Partial<Record<MealSlot, string>>;
  } | null;
};

const slots: Array<{ id: MealSlot; label: string }> = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "snack", label: "Snack" },
  { id: "dinner", label: "Dinner" },
];
const tabs: Array<{ id: Destination; label: string }> = [
  { id: "eat", label: "Eat today" },
  { id: "cook", label: "Cook batch" },
  { id: "buy", label: "To buy" },
];
const kinds: Array<{ kind: ChoiceKind; slot: MealSlot; label: string }> = [
  { kind: "main", slot: "lunch", label: "Lunch + dinner" },
  { kind: "breakfast", slot: "breakfast", label: "Breakfast" },
  { kind: "snack", slot: "snack", label: "Snacks" },
];
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
const fullDate = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const rangeLabel = (start: string, end: string) =>
  `${shortDate(start)} - ${shortDate(end)}`;
const amount = (value: number) =>
  new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
const basisLabel = (ingredient: Ingredient) =>
  ingredient.basis === "raw"
    ? "raw weight"
    : ingredient.basis === "dry"
      ? "dry weight"
      : "ready to use";
const kindForSlot = (slot: MealSlot): ChoiceKind =>
  slot === "lunch" || slot === "dinner" ? "main" : slot;

// A compact content fingerprint scopes grocery checks, never food-safety records.
function shoppingFingerprint(value: string) {
  let hash = 14695981039346656037n;
  for (let index = 0; index < value.length; index += 1)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(value.charCodeAt(index))) * 1099511628211n,
    );
  return hash.toString(36);
}

function Photo({ recipe }: { recipe: Recipe }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [recipe.photo]);
  return recipe.photo && !failed ? (
    <img
      className="mp-photo"
      src={recipe.photo}
      alt=""
      loading="lazy"
      width={76}
      height={76}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="mp-photo mp-photo-fallback" aria-hidden="true">
      <Utensils />
    </span>
  );
}

function Plate({ plate }: { plate: string[] }) {
  return (
    <ul className="mp-plate">
      {plate.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  );
}

function Quantity({ ingredient }: { ingredient: Ingredient }) {
  return (
    <span className="mp-amount">
      {amount(ingredient.amount)}{" "}
      {ingredient.unit === "item"
        ? ingredient.amount === 1
          ? "item"
          : "items"
        : ingredient.unit}
      <small>{basisLabel(ingredient)}</small>
    </span>
  );
}

function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <ul className="mp-ingredient-list">
      {ingredients.map((ingredient) => (
        <li key={prepShoppingKey(ingredient)}>
          <span>
            {ingredient.name}
            {ingredient.optional ? " (optional)" : ""}
          </span>
          <Quantity ingredient={ingredient} />
        </li>
      ))}
    </ul>
  );
}

function groupIngredients(ingredients: Ingredient[]) {
  const grouped = new Map<string, Ingredient[]>();
  for (const ingredient of ingredients) {
    const category = ingredient.category || "Other";
    grouped.set(category, [...(grouped.get(category) ?? []), ingredient]);
  }
  return [...grouped.entries()];
}

function Instructions({
  recipe,
  ingredients,
  batch = false,
}: {
  recipe: Recipe;
  ingredients?: Ingredient[];
  batch?: boolean;
}) {
  return (
    <details className="mp-instructions">
      <summary>
        <ChefHat aria-hidden="true" />
        {batch ? `Prepare ${recipe.shortTitle}` : "Recipe details"}
        <ChevronDown className="mp-chevron" aria-hidden="true" />
      </summary>
      <div className="mp-instructions-body">
        {ingredients && (
          <div className="mp-stack">
            <h4>For this portion</h4>
            <IngredientList ingredients={ingredients} />
          </div>
        )}
        <ol className="mp-steps">
          {recipe.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <p className="mp-muted">{recipe.storage}</p>
      </div>
    </details>
  );
}

function Safety({ threeDays }: { threeDays: boolean }) {
  return (
    <details className="mp-safety">
      <summary>
        <ShieldCheck aria-hidden="true" />
        Storage & food safety
        <ChevronDown className="mp-chevron" aria-hidden="true" />
      </summary>
      <div className="mp-safety-content">
        <ul>
          <li>
            Keep the fridge at 4 C or colder. Refrigerate promptly in shallow
            containers, within 2 hours of cooking.
          </li>
          <li>
            Eat refrigerated leftovers within 2-3 days, or freeze promptly.{" "}
            {threeDays
              ? "For day 3, freeze portions early if storage or timing is uncertain."
              : "Freeze portions early if you will not eat them in time."}
          </li>
          <li>
            Use a thermometer: chicken pieces and ground poultry 74 C; ground
            beef 71 C. Reheat leftovers to 74 C.
          </li>
          <li>
            A prepared check is a cooking record, not a freshness guarantee. If
            storage was unsafe or you are unsure, discard the food.
          </li>
        </ul>
        <div className="mp-safety-links">
          <a
            href="https://www.canada.ca/en/health-canada/services/general-food-safety-tips/food-safety-tips-leftovers.html"
            target="_blank"
            rel="noreferrer"
          >
            Health Canada: leftovers
            <ExternalLink aria-hidden="true" />
          </a>
          <a
            href="https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-internal-cooking-temperatures.html"
            target="_blank"
            rel="noreferrer"
          >
            Safe cooking temperatures
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </div>
    </details>
  );
}

/** The owner persists prep state and snapshots eaten recipes before a batch change.
 * This component never writes meal logs: preparation and eating are independent. */
export function MealPrepPlanner({
  state,
  date,
  today,
  contextForDate,
  onChange,
  mealLog,
  onToggleMeal,
  renderLegacyMeal,
  history = false,
  onDateChange,
  batchLocked = false,
  lockedKinds,
  onStartNewBatch,
  sessionGuidance,
}: MealPrepPlannerProps) {
  const id = useId();
  const [destination, setDestination] = useState<Destination>("eat");
  const [shoppingRange, setShoppingRange] = useState<"batch" | "week">("batch");
  const [swap, setSwap] = useState<{ key: string; kind: ChoiceKind } | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Dates before adoption belong entirely to the legacy renderer. The engine
  // rejects those dates, so hidden planning panels use the first valid batch.
  const engineDate = date < state.startedOn ? state.startedOn : date;
  const batch = prepBatch(state, engineDate, contextForDate);
  const { block } = batch;
  // The logical schedule can end early when a new batch starts. Containers that
  // were already cooked still retain their original quantities and dated yield.
  const physicalBatch = preparedBatchFor(state, engineDate, contextForDate);
  const cookBatch = physicalBatch ?? batch;
  const cookBlock = cookBatch.block;
  const batchDates = [...new Set(cookBatch.servings.map((item) => item.date))];
  const daysCovered = batchDates.length;
  const choice = state.blocks[cookBlock.key];
  const prepared = Boolean(physicalBatch);
  const shortenedPreparedBatch = prepared && cookBlock.end > block.end;
  const preparedTime = choice?.preparedAt ? Date.parse(choice.preparedAt) : NaN;
  const stale =
    Number.isFinite(preparedTime) && now - preparedTime > 72 * 60 * 60 * 1000;
  const legacyDate = date < state.startedOn;
  const readOnly = history || date < today || legacyDate;
  const activeDestination = legacyDate ? "eat" : destination;
  const canPrepare =
    !readOnly && cookBlock.start <= today && today <= cookBlock.end;
  const locked = prepared || block.start < today;
  // The owner sees records across the whole block. Its per-kind flags take
  // precedence over this selected-day fallback; legacy food never locks prep.
  const locallyLockedKinds: Partial<Record<ChoiceKind, boolean>> = {};
  if (!legacyDate)
    for (const { id: slot } of slots) {
      const override = mealLog.overrides?.[slot];
      const recipe =
        override && Object.hasOwn(prepRecipeMap, override)
          ? prepRecipeMap[override]
          : undefined;
      if (
        mealLog.eaten[slot] &&
        recipe?.id === recipeForPrepSlot(block, slot).id
      )
        locallyLockedKinds[kindForSlot(slot)] = true;
    }
  const kindLocked = (kind: ChoiceKind) =>
    lockedKinds?.[kind] ?? Boolean(locallyLockedKinds[kind]);
  const hasRecordedKind = kinds.some(({ kind }) => kindLocked(kind));
  const canEditKind = (kind: ChoiceKind) =>
    !readOnly && !locked && !kindLocked(kind);
  // Duration changes can reshape every food group, so retain the broader guard.
  const canEditDuration =
    !readOnly && !locked && !batchLocked && !hasRecordedKind;
  const canRestart = !readOnly && block.start < date;

  // Removing the complete block selection asks the engine for its original rotation.
  // Reverting below removes only one food override and keeps all other block choices.
  const originalBlocks = { ...state.blocks };
  delete originalBlocks[block.key];
  const original = prepBlockFor(
    { ...state, blocks: originalBlocks },
    engineDate,
  );
  const foods = kinds.map((kind) => ({
    ...kind,
    recipe: recipeForPrepSlot(cookBlock, kind.slot),
    originalRecipe: recipeForPrepSlot(original, kind.slot),
  }));

  // A frozen recorded portion wins over frozen batch context, which wins over live
  // context. Legacy IDs are left to the owner; never reinterpret them as prep food.
  const meals = slots.map(({ id: slot, label }) => {
    const override = mealLog.overrides?.[slot];
    const savedRecipe = override ? prepRecipeMap[override] : undefined;
    const legacy = legacyDate || Boolean(override && !savedRecipe);
    const current = batch.servings.find(
      (item) => item.date === date && item.slot === slot,
    )?.serving;
    const recipe =
      savedRecipe ?? current?.recipe ?? recipeForPrepSlot(block, slot);
    const serving =
      current?.recipe.id === recipe.id
        ? current
        : prepServing(recipe, contextForDate(date));
    const snapshot =
      override && mealLog.eaten[slot] ? mealLog.portions?.[slot] : undefined;
    return {
      slot,
      label,
      recipe,
      serving,
      portion: snapshot ?? serving,
      legacy,
      recorded: Boolean(
        override && recipe.id !== recipeForPrepSlot(block, slot).id,
      ),
      changed: recipe.id !== recipeForPrepSlot(original, slot).id,
      approximate: Boolean(
        override &&
        mealLog.eaten[slot] &&
        !snapshot &&
        current?.recipe.id !== recipe.id,
      ),
    };
  });
  const eaten = slots.filter(({ id: slot }) => mealLog.eaten[slot]).length;
  const hasLegacy = meals.some((meal) => meal.legacy);
  const dailyCalories = meals.reduce(
    (total, meal) => total + meal.portion.calories,
    0,
  );

  // Always purchase complete, deduplicated batches, including any overlapping
  // boundary days. Do not multiply one live day's portion by the batch length.
  const coveredBatches: Batch[] = [];
  const seen = new Set<string>();
  const shoppingWindowStart =
    shoppingRange === "week"
      ? today < state.startedOn
        ? state.startedOn
        : today
      : engineDate;
  for (
    let offset = 0;
    offset < (shoppingRange === "week" ? 7 : 1);
    offset += 1
  ) {
    const nextDate = shiftDate(shoppingWindowStart, offset);
    const key = prepBlockFor(state, nextDate).key;
    if (!seen.has(key)) {
      seen.add(key);
      coveredBatches.push(prepBatch(state, nextDate, contextForDate));
    }
  }
  // Coverage describes the requested range even when every batch is cooked.
  // Prepared food is already purchased; omit it without changing its records.
  const shoppingStart = coveredBatches[0]?.block.start ?? block.start;
  const shoppingEnd =
    coveredBatches[coveredBatches.length - 1]?.block.end ?? block.end;
  const shoppingBatches = coveredBatches.filter(
    (item) => !preparedBatchFor(state, item.block.start, contextForDate),
  );
  const preparedOmitted = coveredBatches.length - shoppingBatches.length;
  const shopping = prepShopping(shoppingBatches);
  const required = shopping.filter((ingredient) => !ingredient.optional);
  const optional = shopping.filter((ingredient) => ingredient.optional);
  // Current-batch and seven-day lists intentionally have independent checklists.
  // Changed recipes, quantities or covered dates must not inherit old purchases.
  const shoppingVersion = shoppingFingerprint(
    shoppingBatches.map((item) => item.signature).join("|"),
  );
  const groceryKey = (ingredient: Ingredient) =>
    JSON.stringify([
      shoppingStart,
      shoppingEnd,
      shoppingVersion,
      prepShoppingKey(ingredient),
    ]);
  const checked = required.filter(
    (ingredient) => state.checked[groceryKey(ingredient)],
  ).length;

  const changeDuration = (days: 2 | 3) => {
    if (!canEditDuration) return;
    setSwap(null);
    onChange(startPrepSchedule(state, date, days));
  };
  const changeRecipe = (kind: ChoiceKind, recipeId: string) => {
    if (!canEditKind(kind)) return;
    setSwap(null);
    onChange(setPrepChoice(state, date, kind, recipeId));
  };
  const revertRecipe = (kind: ChoiceKind) => {
    if (!canEditKind(kind)) return;
    const nextChoice = { ...choice };
    delete nextChoice[`${kind}Id` as const];
    delete nextChoice.preparedAt;
    delete nextChoice.preparedSignature;
    delete nextChoice.contexts;
    setSwap(null);
    onChange({
      ...state,
      blocks: { ...state.blocks, [block.key]: nextChoice },
    });
  };
  const togglePrepared = (checked: boolean) => {
    if (!canPrepare) return;
    const nextChoice = { ...choice };
    if (checked) {
      const contexts: Record<string, PrepContext> = {};
      for (const item of batch.servings)
        if (!Object.hasOwn(contexts, item.date))
          contexts[item.date] = { ...contextForDate(item.date) };
      // Explicit defaults keep a physical batch independent of rotation changes.
      nextChoice.mainId = block.mainId;
      nextChoice.breakfastId = block.breakfastId;
      nextChoice.snackId = block.snackId;
      nextChoice.contexts = contexts;
      nextChoice.preparedAt = new Date().toISOString();
      nextChoice.preparedSignature = batch.signature;
    } else {
      delete nextChoice.contexts;
      delete nextChoice.preparedAt;
      delete nextChoice.preparedSignature;
      delete nextChoice.conflictingPreparation;
    }
    onChange({
      ...state,
      blocks: { ...state.blocks, [cookBlock.key]: nextChoice },
    });
  };
  const toggleShopping = (ingredient: Ingredient, checked: boolean) => {
    const key = groceryKey(ingredient);
    const nextChecked = { ...state.checked };
    if (checked) nextChecked[key] = true;
    else delete nextChecked[key];
    onChange({ ...state, checked: nextChecked });
  };

  const renderShoppingGroup = (ingredients: Ingredient[]) => (
    <div className="mp-ingredient-groups">
      {groupIngredients(ingredients).map(([category, items]) => (
        <section
          className="mp-ingredient-group"
          key={category}
          aria-label={category}
        >
          <h4>{category}</h4>
          {items.map((ingredient) => {
            const key = groceryKey(ingredient);
            const isChecked = Boolean(state.checked[key]);
            return (
              <label
                className={`mp-grocery${isChecked ? " is-checked" : ""}`}
                key={key}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) =>
                    toggleShopping(ingredient, event.target.checked)
                  }
                />
                <span>
                  <span className="mp-grocery-name">{ingredient.name}</span>
                  <Quantity ingredient={ingredient} />
                </span>
              </label>
            );
          })}
        </section>
      ))}
    </div>
  );

  return (
    <div className="meal-prep-planner">
      <header className="mp-heading">
        <div className="mp-heading-copy">
          <span className="mp-kicker">Batch meals</span>
          <h2>{date === today ? "Today's meals" : fullDate(date)}</h2>
        </div>
        {onDateChange ? (
          <div className="mp-date-nav">
            <button
              type="button"
              className="mp-icon-button"
              title="Previous day"
              aria-label="Previous meal day"
              onClick={() => onDateChange(shiftDate(date, -1))}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <label className="mp-date-label">
              <span className="sr-only">Meal date</span>
              <input
                className="mp-date-input"
                type="date"
                value={date}
                aria-label="Meal date"
                onChange={(event) => {
                  if (isCalendarDate(event.target.value))
                    onDateChange(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="mp-icon-button"
              title="Next day"
              aria-label="Next meal day"
              onClick={() => onDateChange(shiftDate(date, 1))}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : (
          <span className="mp-muted">{rangeLabel(block.start, block.end)}</span>
        )}
      </header>
      {!legacyDate && (
        <SectionTabs
          id={id}
          label="Meal planning"
          tabs={tabs}
          value={destination}
          onChange={setDestination}
        />
      )}
      {!legacyDate && choice?.conflictingPreparation && (
        <p className="mp-notice mp-warning" role="alert">
          <TriangleAlert aria-hidden="true" />
          Two devices recorded different cooked batches. This is the later
          record. Check your containers and ingredients before following it; the
          other preparation record is preserved.
        </p>
      )}

      <section
        id={`${id}-panel-eat`}
        role={legacyDate ? "region" : "tabpanel"}
        aria-labelledby={legacyDate ? undefined : `${id}-tab-eat`}
        aria-label={legacyDate ? "Saved meals" : undefined}
        tabIndex={0}
        hidden={activeDestination !== "eat"}
        className="mp-panel"
      >
        <div className="mp-day-summary">
          <span className="mp-count">
            <Utensils aria-hidden="true" />
            {eaten} of 4 eaten
          </span>
          <span className="mp-nutrition">
            {hasLegacy
              ? "Saved meals"
              : `${amount(Math.round(dailyCalories))} kcal planned`}
          </span>
        </div>
        {legacyDate && (
          <div className="mp-notice">
            <Info aria-hidden="true" />
            <div>
              <p>Saved meals from before batch planning.</p>
              {onDateChange && (
                <button
                  type="button"
                  className="mp-text-button"
                  onClick={() => onDateChange(today)}
                >
                  Back to today
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}
        {sessionGuidance && (
          <section
            className="mp-notice mp-session-guidance"
            aria-label="Trial meal guidance"
          >
            <div>
              <strong>{sessionGuidance.title}</strong>
              <p>{sessionGuidance.detail}</p>
              {prepared && <p>{sessionGuidance.prepared}</p>}
            </div>
          </section>
        )}
        {date > today && (
          <p className="mp-notice">
            <Clock3 aria-hidden="true" />
            Meal logging opens {shortDate(date)}.
          </p>
        )}
        {!legacyDate && stale && (
          <p className="mp-notice mp-warning" role="status">
            <TriangleAlert aria-hidden="true" />
            Do not eat refrigerated portions: prepared over 72 hours ago. Only
            use portions promptly frozen while safe; otherwise discard.
          </p>
        )}
        {meals.map(
          ({
            slot,
            label,
            recipe,
            serving,
            portion,
            legacy,
            recorded,
            changed,
            approximate,
          }) =>
            legacy ? (
              <div className="mp-legacy" key={slot}>
                {renderLegacyMeal?.(slot) ?? (
                  <p className="mp-notice">
                    <Info aria-hidden="true" />
                    {label}: saved meal unavailable. The meal record is
                    unchanged.
                  </p>
                )}
              </div>
            ) : (
              <article
                className={`mp-meal${mealLog.eaten[slot] ? " is-eaten" : ""}`}
                key={slot}
                aria-label={label}
              >
                <div className="mp-meal-top">
                  <Photo recipe={recipe} />
                  <div className="mp-meal-copy">
                    <div className="mp-meal-meta">
                      <span>{label}</span>
                      <span>
                        {sessionGuidance?.timings?.[slot] ??
                          (slot === "breakfast"
                            ? "Morning"
                            : slot === "lunch"
                              ? "Midday"
                              : slot === "snack"
                                ? (
                                    block.contexts?.[date] ??
                                    contextForDate(date)
                                  ).training
                                  ? "60-120 min before training"
                                  : "Afternoon"
                                : (
                                      block.contexts?.[date] ??
                                      contextForDate(date)
                                    ).training
                                  ? "Evening, after training"
                                  : "Evening")}
                      </span>
                      {recorded ? (
                        <span className="mp-recorded">Recorded meal</span>
                      ) : (
                        changed && (
                          <span className="mp-version">Swap version</span>
                        )
                      )}
                    </div>
                    <h3>{recipe.title}</h3>
                    <span className="mp-nutrition">
                      {Math.round(portion.calories)} kcal ·{" "}
                      {amount(portion.protein)} g protein
                    </span>
                  </div>
                </div>
                <div className="mp-meal-portion">
                  <span className="mp-kicker">
                    Your plate
                    {approximate ? " · approximate historic portion" : ""}
                  </span>
                  <Plate plate={portion.plate} />
                </div>
                <div className="mp-meal-actions">
                  <span className="mp-nutrition">
                    {slot === "lunch" || slot === "dinner"
                      ? "Reheat one container"
                      : "Ready in a few minutes"}
                  </span>
                  <button
                    type="button"
                    className="mp-button mp-eaten-button"
                    aria-pressed={Boolean(mealLog.eaten[slot])}
                    aria-label={`${mealLog.eaten[slot] ? "Reopen" : "Mark eaten:"} ${label}`}
                    disabled={date > today}
                    onClick={() => onToggleMeal(slot)}
                  >
                    {mealLog.eaten[slot] ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Circle aria-hidden="true" />
                    )}
                    {mealLog.eaten[slot] ? "Eaten" : "Mark eaten"}
                  </button>
                </div>
                {changed && !recorded && (
                  <button
                    type="button"
                    className="mp-text-button mp-eat-revert"
                    disabled={!canEditKind(kindForSlot(slot))}
                    onClick={() => revertRecipe(kindForSlot(slot))}
                  >
                    <RotateCcw aria-hidden="true" />
                    Revert to original
                  </button>
                )}
                <Instructions
                  key={recipe.id}
                  recipe={recipe}
                  ingredients={
                    recorded && mealLog.portions?.[slot]
                      ? undefined
                      : serving.ingredients
                  }
                />
              </article>
            ),
        )}
        {!legacyDate && (
          <button
            type="button"
            className="mp-bottom-link"
            onClick={() => setDestination("cook")}
          >
            <span>
              Batch · {rangeLabel(block.start, block.end)} ·{" "}
              {batch.mainServings} main portions
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
        )}
        <Safety threeDays={block.days === 3} />
      </section>

      <section
        id={`${id}-panel-cook`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-cook`}
        tabIndex={0}
        hidden={legacyDate || destination !== "cook"}
        className="mp-panel"
      >
        <div className="mp-heading">
          <div className="mp-heading-copy">
            <span className="mp-kicker">Cook once</span>
            <h3>{rangeLabel(cookBlock.start, cookBlock.end)}</h3>
          </div>
          <span className="mp-count">
            <ChefHat aria-hidden="true" />
            {daysCovered}-day batch
          </span>
        </div>
        <div className="mp-duration">
          <span className="mp-muted">Schedule from {shortDate(date)}</span>
          <div className="mp-segment" role="group" aria-label="Batch duration">
            {([2, 3] as const).map((days) => (
              <button
                type="button"
                key={days}
                aria-pressed={cookBlock.days === days}
                disabled={!canEditDuration}
                onClick={() => changeDuration(days)}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>
        {readOnly ? (
          <p className="mp-notice">
            <LockKeyhole aria-hidden="true" />
            History is read-only for batch changes.
          </p>
        ) : (
          locked && (
            <div className="mp-notice">
              <LockKeyhole aria-hidden="true" />
              <div>
                <p>
                  Already cooked or started. Start a new batch today to change
                  future meals.
                </p>
                {canRestart ? (
                  <button
                    type="button"
                    className="mp-text-button"
                    onClick={() => {
                      setSwap(null);
                      if (onStartNewBatch) onStartNewBatch();
                      else onChange(startPrepSchedule(state, date, block.days));
                    }}
                  >
                    <ChefHat aria-hidden="true" />
                    Start a new batch{" "}
                    {date === today ? "today" : shortDate(date)}
                  </button>
                ) : (
                  <small>
                    Change meals with the next batch, from{" "}
                    {shortDate(shiftDate(block.end, 1))}.
                  </small>
                )}
              </div>
            </div>
          )
        )}
        {!readOnly && !locked && (hasRecordedKind || batchLocked) && (
          <p className="mp-notice">
            <Info aria-hidden="true" />
            Recorded meals stay saved. Change remaining food groups, or plan
            your next batch.
          </p>
        )}
        {shortenedPreparedBatch && (
          <p className="mp-notice mp-warning">
            <TriangleAlert aria-hidden="true" />
            New batch starts before these containers run out. Freeze the extra
            portions promptly; they are not logged as eaten.
          </p>
        )}
        <div className="mp-batch-counts" aria-label="Full batch yield">
          <div>
            <strong>{cookBatch.mainServings}</strong>
            <small>main portions</small>
            <small>Lunch + dinner</small>
          </div>
          <div>
            <strong>{daysCovered}</strong>
            <small>breakfasts</small>
          </div>
          <div>
            <strong>{daysCovered}</strong>
            <small>snacks</small>
          </div>
        </div>
        {foods.map(({ kind, slot, label, recipe, originalRecipe }) => {
          const editable = canEditKind(kind);
          const swapOpen =
            editable && swap?.key === block.key && swap.kind === kind;
          const count = kind === "main" ? cookBatch.mainServings : daysCovered;
          return (
            <section className="mp-recipe-row" key={kind} aria-label={label}>
              <div className="mp-recipe-title">
                <Photo recipe={recipe} />
                <div className="mp-stack">
                  <span className="mp-kicker">
                    {label} · {count} portions
                    {recipe.id !== originalRecipe.id && (
                      <span className="mp-version"> · Swap version</span>
                    )}
                  </span>
                  <h3>{recipe.title}</h3>
                  <span className="mp-nutrition">{recipe.minutes} min</span>
                </div>
              </div>
              <p className="mp-recipe-description">{recipe.description}</p>
              <div className="mp-recipe-tools">
                <button
                  type="button"
                  className="mp-text-button"
                  disabled={!editable}
                  aria-expanded={swapOpen}
                  aria-controls={`${id}-swap-${kind}`}
                  onClick={() =>
                    setSwap(swapOpen ? null : { key: block.key, kind })
                  }
                >
                  <ArrowLeftRight aria-hidden="true" />
                  Swap<span className="sr-only">: {label}</span>
                </button>
                {recipe.id !== originalRecipe.id && (
                  <button
                    type="button"
                    className="mp-text-button"
                    disabled={!editable}
                    onClick={() => revertRecipe(kind)}
                  >
                    <RotateCcw aria-hidden="true" />
                    Revert to original<span className="sr-only">: {label}</span>
                  </button>
                )}
              </div>
              <div id={`${id}-swap-${kind}`} hidden={!swapOpen}>
                <p className="mp-swap-caption">
                  For all {count}{" "}
                  {kind === "main"
                    ? "lunch + dinner portions"
                    : `${label.toLowerCase()} portions`}{" "}
                  · {rangeLabel(block.start, block.end)}
                </p>
                <div
                  className="mp-swap-options"
                  role="group"
                  aria-label={`${label} batch versions`}
                >
                  {prepRecipes
                    .filter((option) => option.kind === kind)
                    .map((option) => (
                      <button
                        className="mp-swap-option"
                        type="button"
                        key={option.id}
                        disabled={!editable}
                        aria-pressed={recipe.id === option.id}
                        onClick={() => changeRecipe(kind, option.id)}
                      >
                        <Photo recipe={option} />
                        <span>
                          <strong>{option.shortTitle}</strong>
                          <small>
                            {option.minutes} min · {count} portions
                          </small>
                        </span>
                        {recipe.id === option.id ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <ArrowRight aria-hidden="true" />
                        )}
                      </button>
                    ))}
                </div>
              </div>
              <Instructions
                key={recipeForPrepSlot(cookBlock, slot).id}
                recipe={recipe}
                batch
              />
            </section>
          );
        })}
        <label className="mp-prepared">
          <input
            type="checkbox"
            checked={prepared}
            disabled={!canPrepare}
            onChange={(event) => togglePrepared(event.target.checked)}
          />
          <span>
            <strong>Batch prepared</strong>
            <small>
              {prepared
                ? `Recorded ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(preparedTime))}`
                : `${cookBatch.mainServings} main portions, ${daysCovered} breakfasts, ${daysCovered} snacks`}
            </small>
            <small>Cooking record only. Meals are logged separately.</small>
          </span>
        </label>
        {block.start > today && (
          <p className="mp-notice">
            <Clock3 aria-hidden="true" />
            Cook near the first planned day, or freeze promptly.
          </p>
        )}
        {stale && (
          <p className="mp-notice mp-warning" role="status">
            <TriangleAlert aria-hidden="true" />
            Prepared more than 72 hours ago. Do not eat refrigerated portions.
            Only use portions promptly frozen while safe; otherwise discard.
          </p>
        )}
        <section className="mp-section" aria-label="Full batch ingredients">
          <div className="mp-heading">
            <div className="mp-heading-copy">
              <h3>Full batch ingredients</h3>
              <small className="mp-muted">
                All {daysCovered} days · breakfast, lunch, dinner & snacks
              </small>
            </div>
          </div>
          <div className="mp-ingredient-groups">
            {groupIngredients(
              cookBatch.ingredients.filter((item) => !item.optional),
            ).map(([category, items]) => (
              <section
                className="mp-ingredient-group"
                key={category}
                aria-label={category}
              >
                <h4>{category}</h4>
                <IngredientList ingredients={items} />
              </section>
            ))}
          </div>
          {cookBatch.ingredients.some((item) => item.optional) && (
            <div className="mp-stack">
              <h4 className="mp-optional-label">Optional extras</h4>
              <IngredientList
                ingredients={cookBatch.ingredients.filter(
                  (item) => item.optional,
                )}
              />
            </div>
          )}
        </section>
        <section className="mp-section" aria-label="Daily cooked portions">
          <div className="mp-heading">
            <h3>Portion by day</h3>
            <small className="mp-muted">Cooked / ready-to-eat plate</small>
          </div>
          <table className="mp-portions">
            <caption>
              Each cell is one meal. Lunch and dinner use the same batch.
            </caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {slots.map(({ id: slot, label }) => (
                  <th scope="col" key={slot}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batchDates.map((day) => (
                <tr key={day}>
                  <th scope="row">{fullDate(day)}</th>
                  {slots.map(({ id: slot, label }) => {
                    const portion = cookBatch.servings.find(
                      (item) => item.date === day && item.slot === slot,
                    )?.serving;
                    return (
                      <td key={slot} data-label={label}>
                        <div className="mp-portion-cell">
                          {portion && (
                            <>
                              <Plate plate={portion.plate} />
                              <small>
                                {Math.round(portion.calories)} kcal ·{" "}
                                {amount(portion.protein)} g protein
                              </small>
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <details className="mp-instructions">
          <summary>
            <Info aria-hidden="true" />
            Nutrition & portion estimates
            <ChevronDown className="mp-chevron" aria-hidden="true" />
          </summary>
          <div className="mp-instructions-body">
            <p className="mp-muted">
              {
                cookBatch.servings.find((item) => item.slot === "lunch")
                  ?.serving.note
              }
            </p>
          </div>
        </details>
        <Safety threeDays={cookBlock.days === 3} />
      </section>

      <section
        id={`${id}-panel-buy`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-buy`}
        tabIndex={0}
        hidden={legacyDate || destination !== "buy"}
        className="mp-panel"
      >
        <div className="mp-shopping-range">
          <div className="mp-heading-copy">
            <h3>To buy</h3>
            <small className="mp-muted">
              Full batches · {rangeLabel(shoppingStart, shoppingEnd)}
            </small>
          </div>
          <div className="mp-segment" role="group" aria-label="Shopping range">
            <button
              type="button"
              aria-pressed={shoppingRange === "batch"}
              onClick={() => setShoppingRange("batch")}
            >
              Current batch
            </button>
            <button
              type="button"
              aria-pressed={shoppingRange === "week"}
              onClick={() => setShoppingRange("week")}
            >
              Next 7 days
            </button>
          </div>
        </div>
        {shoppingRange === "week" && (
          <div className="mp-stack">
            <p className="mp-muted">
              {coveredBatches.length} complete batches for{" "}
              {rangeLabel(
                shoppingWindowStart,
                shiftDate(shoppingWindowStart, 6),
              )}
              .
              {shoppingStart < shoppingWindowStart ||
              shoppingEnd > shiftDate(shoppingWindowStart, 6)
                ? ` Includes full batches through ${shortDate(shoppingEnd)}, starting ${shortDate(shoppingStart)}.`
                : ""}
            </p>
            <div className="mp-shopping-batches">
              {coveredBatches.map((item) => (
                <span key={item.block.key}>
                  {rangeLabel(item.block.start, item.block.end)}
                </span>
              ))}
            </div>
          </div>
        )}
        {preparedOmitted > 0 && (
          <p className="mp-muted">
            {preparedOmitted} prepared{" "}
            {preparedOmitted === 1 ? "batch" : "batches"} omitted.
          </p>
        )}
        {shoppingBatches.length === 0 ? (
          <p className="mp-notice">
            <ShoppingBasket aria-hidden="true" />
            {shoppingRange === "batch"
              ? "Batch already prepared. Nothing to buy for it."
              : "All batches already prepared. Nothing to buy for this range."}
          </p>
        ) : (
          <div className="mp-shopping-progress">
            <div>
              <span>
                <ShoppingBasket aria-hidden="true" /> {checked} of{" "}
                {required.length} checked
              </span>
              <span>
                {shoppingBatches.reduce(
                  (total, item) => total + item.mainServings,
                  0,
                )}{" "}
                main portions
              </span>
            </div>
            <progress
              value={checked}
              max={Math.max(1, required.length)}
              aria-label="Groceries checked"
            />
          </div>
        )}
        {renderShoppingGroup(required)}
        {optional.length > 0 && (
          <section className="mp-section" aria-label="Optional groceries">
            <div className="mp-heading">
              <h3>Optional extras</h3>
            </div>
            {renderShoppingGroup(optional)}
          </section>
        )}
      </section>
    </div>
  );
}

export default MealPrepPlanner;
