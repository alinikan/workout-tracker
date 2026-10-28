import { useState } from "react";
import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Scale,
  Settings2,
  Utensils,
} from "lucide-react";
import {
  applyReview,
  budgetFor,
  estimateEnergy,
  firstMilestone,
  planFor,
  profileFor,
  reviewNutrition,
  saveCheckin,
  saveProfile,
  type Equation,
  type FoodEvidence,
  type NutritionState,
  type ReviewEvidence,
} from "./model";
import "./nutrition.css";

type Props = {
  state: NutritionState;
  today: string;
  training: boolean;
  referenceWeight: number | null;
  weightHandled: boolean;
  menu: { calories: number; protein: number };
  evidence: ReviewEvidence;
  foodFor: (date: string) => FoodEvidence;
  onUpdate: (fn: (state: NutritionState) => NutritionState) => void;
  onWeight: () => void;
  onMeals: () => void;
};

/** Coach owns profile/check-in entry; meal screens display the resulting target
 * read-only. Draft validation happens BEFORE the React updater so form errors
 * cannot escape into an asynchronous state update and blank the application. */
export default function NutritionCoach(p: Props) {
  const profile = profileFor(p.state, p.today),
    plan = planFor(p.state, p.today);
  const [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [draftConcern, setDraftConcern] = useState(false);
  const baseReview = reviewNutrition(p.state, p.today, p.evidence);
  const review = draftConcern
    ? {
        ...baseReview,
        delta: 0,
        title: "Protect recovery; no food cut",
        detail:
          "You reported feeling unwell or lightheaded. Save the check-in, keep regular meals and review recovery rather than reducing food.",
      }
    : baseReview;
  const budget = budgetFor(
    p.state,
    p.today,
    p.training,
    p.referenceWeight ?? undefined,
  );
  const atMilestone =
    profile &&
    (p.referenceWeight ?? plan?.referenceWeightKg ?? profile.startWeightKg) <=
      firstMilestone(profile);
  const pending = Object.values(p.state.profiles)
    .filter((value) => value.from > p.today)
    .sort((a, b) => a.from.localeCompare(b.from))[0];
  if (!profile && pending)
    return (
      <section
        className="nutrition-coach"
        aria-label="Personal nutrition coach"
      >
        <span className="nc-eyebrow">
          <Utensils size={16} /> Nutrition coach
        </span>
        <h2>Your nutrition starts on {pending.from}</h2>
        <p>
          Your saved profile is kept. The fresh baseline and daily check-ins
          begin on your shared Start Fresh date; no weigh-ins or meals are
          filled in early.
        </p>
      </section>
    );
  return (
    <section className="nutrition-coach" aria-label="Personal nutrition coach">
      <header>
        <div>
          <span className="nc-eyebrow">
            <Utensils size={16} /> Nutrition coach
          </span>
          <h2>
            {budget ? "Today's food target" : "Make the portions personal"}
          </h2>
        </div>
        {profile && (
          <button
            type="button"
            className="nc-icon"
            title="Edit nutrition profile"
            aria-label="Edit nutrition profile"
            onClick={() => setEditing(!editing)}
          >
            <Settings2 size={20} />
          </button>
        )}
      </header>
      {!profile || !plan || editing ? (
        <ProfileForm
          key={profile?.id ?? "new"}
          state={p.state}
          today={p.today}
          referenceWeight={p.referenceWeight}
          evidence={p.evidence}
          onSave={(next) => {
            p.onUpdate((current) => ({
              ...current,
              profiles: { ...current.profiles, ...next.profiles },
              plans: { ...current.plans, ...next.plans },
            }));
            setEditing(false);
          }}
          onCancel={profile ? () => setEditing(false) : undefined}
        />
      ) : (
        budget &&
        plan && (
          <>
            <span className="nc-day-label">
              {atMilestone
                ? "Maintain & review"
                : p.training
                  ? "Strength / trial day"
                  : "Easier day"}
            </span>
            <div className="nc-targets">
              <div>
                <span>Estimated target</span>
                <strong>
                  {budget.calories.toLocaleString()} <small>kcal</small>
                </strong>
              </div>
              <div>
                <span>Protein goal</span>
                <strong>
                  {budget.protein} <small>g</small>
                </strong>
              </div>
            </div>
            <p className="nc-menu-total">
              Listed meals: approximately{" "}
              <strong>{p.menu.calories.toLocaleString()} kcal</strong> and{" "}
              <strong>{p.menu.protein} g protein</strong>.
            </p>
            {(Math.abs(p.menu.calories - budget.calories) > 100 ||
              p.menu.protein < budget.protein * 0.9) && (
              <p className="nc-notice">
                The current menu does not closely match the new target. Prepared
                or previously recorded food keeps its quantities; use the next
                uncooked batch or review the recipe choice. Do not skip meals to
                force a match.
              </p>
            )}
            <p className="nc-muted">
              {atMilestone
                ? "First review weight reached. Keep building strength before choosing another fat-loss phase."
                : "A starting estimate, not a measured calorie burn. Weekly evidence guides small changes; one scale reading does not."}
            </p>
            {!p.weightHandled && (
              <button
                type="button"
                className="nc-weight-action"
                onClick={p.onWeight}
              >
                <Scale size={18} /> Log this morning's weight
              </button>
            )}
            <div className="nc-actions">
              <button type="button" onClick={p.onMeals}>
                <Utensils size={17} /> Today's portions
              </button>
            </div>
            <details className="nc-details">
              <summary>
                Daily food & activity check-in <ChevronDown size={16} />
              </summary>
              <Checkin
                key={`${p.today}:${p.state.checkins[p.today]?.id ?? "new"}`}
                {...p}
                onConcern={setDraftConcern}
              />
            </details>
            <details className="nc-details" open={Boolean(review.delta)}>
              <summary>
                <span>
                  Weekly review <small>{review.title}</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <p>{review.detail}</p>
              <p className="nc-muted">
                {review.weights} recent weigh-ins · {review.foodDays} confirmed
                food days
                {review.weeklyChange === null
                  ? ""
                  : ` · ${review.weeklyChange > 0 ? "+" : ""}${review.weeklyChange.toFixed(2)} kg between the last two weekly averages`}
              </p>
              {review.delta !== 0 && (
                <button
                  className="nc-primary"
                  type="button"
                  onClick={() => {
                    try {
                      const next = applyReview(p.state, p.today, p.evidence);
                      p.onUpdate((current) => ({
                        ...current,
                        plans: { ...current.plans, ...next.plans },
                      }));
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Check size={17} /> Apply {review.delta > 0 ? "+" : ""}
                  {review.delta} kcal to uncooked portions
                </button>
              )}
            </details>
            <details className="nc-details">
              <summary>
                How this estimate works <ChevronDown size={16} />
              </summary>
              <p>
                Mifflin-St Jeor resting estimate × a conservative usual-step
                activity factor. The initial deficit is about 15%, capped at 350
                kcal. Strength and trial days add a fixed 150 kcal planning
                allowance, not a measured workout burn.
              </p>
              <dl className="nc-facts">
                <div>
                  <dt>Baseline maintenance estimate</dt>
                  <dd>~{plan.maintenance.toLocaleString()} kcal/day</dd>
                </div>
                <div>
                  <dt>Resting estimate</dt>
                  <dd>
                    ~
                    {Math.round(
                      estimateEnergy(profile!, plan.referenceWeightKg).resting,
                    )}{" "}
                    kcal/day
                  </dd>
                </div>
                <div>
                  <dt>Target reference</dt>
                  <dd>{plan.referenceWeightKg.toFixed(1)} kg</dd>
                </div>
                <div>
                  <dt>First review weight</dt>
                  <dd>~{firstMilestone(profile!).toFixed(1)} kg</dd>
                </div>
              </dl>
              <p>
                Protein starts near 1.8 g/kg. The first review milestone is
                roughly 5% below starting weight, bounded above a lower BMI.
                Food labels, water weight and logging errors create uncertainty.
              </p>
              <p>
                No wearable calorie eat-back. Three reliable weeks are needed
                before a food-cut proposal; only one small change is applied at
                a time. These thresholds and calorie limits are conservative app
                rules, not clinical guarantees.
              </p>
              <p>
                Adult estimates only, not for pregnancy, breastfeeding or a
                clinician-prescribed diet.
              </p>
              <a
                href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
                target="_blank"
                rel="noreferrer"
              >
                Resting-energy equation
              </a>
              {" · "}
              <a
                href="https://www.niddk.nih.gov/bwp"
                target="_blank"
                rel="noreferrer"
              >
                NIH: calorie-planning limits
              </a>
            </details>
          </>
        )
      )}
      {error && (
        <p className="nc-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ProfileForm({
  state,
  today,
  referenceWeight,
  evidence,
  onSave,
  onCancel,
}: Pick<Props, "state" | "today" | "referenceWeight" | "evidence"> & {
  onSave: (state: NutritionState) => void;
  onCancel?: () => void;
}) {
  const profile = profileFor(state, today);
  const [age, setAge] = useState(profile ? String(profile.age) : ""),
    [height, setHeight] = useState(profile ? String(profile.heightCm) : ""),
    [weight, setWeight] = useState(
      profile
        ? String(profile.startWeightKg)
        : referenceWeight
          ? String(Number(referenceWeight.toFixed(1)))
          : "",
    ),
    [steps, setSteps] = useState(profile ? String(profile.baselineSteps) : ""),
    [equation, setEquation] = useState<Equation | "">(profile?.equation ?? ""),
    [error, setError] = useState("");
  return (
    <form
      className="nc-profile"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          if (!age || !height || !weight || !steps || !equation)
            throw new Error(
              "Complete the five starting fields. A usual step estimate is fine.",
            );
          const next = saveProfile(
            state,
            {
              age: Number(age),
              heightCm: Number(height),
              startWeightKg: Number(weight),
              baselineSteps: Number(steps),
              equation,
            },
            today,
            evidence.weights,
          );
          onSave(next);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <p>
        Confirm once, then keep logging morning weights. Recent reliable weights
        take priority over the starting value. Personal values sync to your
        account, not the public code.
      </p>
      <div className="nc-form-grid">
        <label>
          Age
          <input
            required
            type="number"
            inputMode="numeric"
            min="18"
            max="80"
            step="1"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </label>
        <label>
          Height (cm)
          <input
            required
            type="number"
            inputMode="decimal"
            min="140"
            max="220"
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <label>
          Starting weight (kg)
          <input
            required
            type="number"
            inputMode="decimal"
            min="45"
            max="180"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label>
          Usual daily steps
          <input
            required
            type="number"
            inputMode="numeric"
            min="0"
            max="30000"
            step="1"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
        </label>
        <label>
          Calorie equation
          <span className="nc-select">
            <select
              aria-label="Calorie equation"
              required
              value={equation}
              onChange={(e) => setEquation(e.target.value as Equation)}
            >
              <option value="">Choose equation</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </span>
        </label>
      </div>
      <small className="nc-muted">
        Usual steps include your ordinary day, not a second estimate of gym
        calories. You can update these values later. This saves a profile, not a
        morning weigh-in.
      </small>
      <div className="nc-actions">
        <button className="nc-primary" type="submit">
          <Check size={17} />{" "}
          {profile ? "Save revised target" : "Calculate my target"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="nc-notice" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

type CheckinProps = Props & { onConcern: (value: boolean) => void };
function Checkin(p: CheckinProps) {
  const [date, setDate] = useState(p.today);
  return (
    <div>
      <label className="nc-date">
        Check-in date
        <input
          type="date"
          aria-label="Nutrition check-in date"
          min={
            Object.values(p.state.profiles)
              .map((x) => x.from)
              .sort()[0]
          }
          max={p.today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            p.onConcern(false);
          }}
        />
      </label>
      <CheckinForm
        key={`${date}:${p.state.checkins[date]?.id ?? "new"}`}
        {...p}
        date={date}
      />
    </div>
  );
}
function CheckinForm(p: CheckinProps & { date: string }) {
  const saved = p.state.checkins[p.date],
    food = p.foodFor(p.date);
  const [matches, setMatches] = useState(saved?.matches ?? "unsure"),
    [extras, setExtras] = useState(
      saved?.extras === null || saved?.extras === undefined
        ? ""
        : String(saved.extras),
    ),
    [steps, setSteps] = useState(
      saved?.steps === null || saved?.steps === undefined
        ? ""
        : String(saved.steps),
    ),
    [energy, setEnergy] = useState<"" | "okay" | "low" | "unwell">(
      saved?.energy ?? "",
    ),
    [error, setError] = useState("");
  return (
    <form
      className="nc-checkin"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          if (!energy)
            throw new Error(
              "Choose how your energy felt. Unknown energy is not assumed to be good.",
            );
          const next = saveCheckin(
            p.state,
            p.date,
            {
              matches,
              extras: extras.trim() ? Number(extras) : null,
              energy,
              steps: steps.trim() ? Number(steps) : null,
            },
            food,
            p.today,
          );
          p.onUpdate((current) => ({
            ...current,
            checkins: { ...current.checkins, [p.date]: next.checkins[p.date] },
          }));
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <p className="nc-muted">
        {food.complete
          ? `Four meals recorded in ${food.source}.`
          : "Log all four meals in Nutrition or Momentum before this day can support a calorie adjustment."}{" "}
        A meal checkmark alone does not confirm portions or extras.
      </p>
      <label>
        Did you follow the listed portions?
        <span className="nc-select">
          <select
            aria-label="Did you follow the listed portions?"
            value={matches}
            onChange={(e) => setMatches(e.target.value as typeof matches)}
          >
            <option value="unsure">Not sure / not finished yet</option>
            <option value="yes">Yes, as portioned</option>
            <option value="no">No, different amounts</option>
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </label>
      {matches === "yes" && (
        <label>
          Extra food or drinks (kcal)
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="2000"
            step="1"
            placeholder="0 if none; leave blank if unknown"
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
          />
        </label>
      )}
      <label>
        Energy today
        <span className="nc-select">
          <select
            aria-label="Energy today"
            value={energy}
            onChange={(e) => {
              setEnergy(e.target.value as typeof energy);
              p.onConcern(e.target.value === "unwell");
            }}
          >
            <option value="">Choose energy</option>
            <option value="okay">Okay</option>
            <option value="low">Low</option>
            <option value="unwell">Unwell / lightheaded</option>
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </label>
      <label>
        Actual steps (optional)
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="100000"
          step="1"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
      </label>
      <button type="submit">
        <ClipboardCheck size={17} />{" "}
        {saved ? "Update check-in" : "Save check-in"}
      </button>
      {saved && (
        <p className="nc-saved" role="status">
          <Check size={16} /> Check-in saved
          {saved.foodSignature !== food.signature
            ? " · meal record changed; confirm and save again"
            : ""}
        </p>
      )}
      {energy === "unwell" && (
        <p className="nc-notice">
          Do not push through lightheadedness or reduce food further. Stop
          exercise and get help if symptoms persist, recur or are severe; meal
          timing cannot guarantee prevention.
        </p>
      )}
      {error && (
        <p className="nc-notice" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
