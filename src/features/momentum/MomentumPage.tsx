import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronRight,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Utensils,
  Video,
} from "lucide-react";
import { SectionTabs } from "../../components/SessionUI";
import {
  addDays,
  currentJourney,
  suggestedStart,
  isStrength,
  makeJourney,
  repeatWeek,
  rescheduleClass,
  sortedSlots,
  starterPlan,
  strengthTemplates,
  weekday,
  weekOf,
} from "./plan";
import {
  activePause,
  concerning,
  exerciseGate,
  startJourneyAllowed,
  urgentMessage,
} from "./safety";
import {
  adaptationAllowed,
  attendance,
  coachNote,
  completionError,
  loggedActivity,
  monthTwo,
  outcomeLabel,
  progressionEligible,
  resolveDay,
} from "./coaching";
import { boxingSkills, evidence, gyms } from "./research";
import { calendarText } from "./calendar";
import {
  newLog,
  type ActivityLog,
  type Adaptation,
  type Journey,
  type MealSlot,
  type MomentumData,
  type Profile,
  type Readiness,
  type Resources,
  type Review,
  type Slot,
} from "./types";
import MomentumSession from "./MomentumSession";
import "./momentum.css";

type Props = {
  data: MomentumData;
  edit: (update: (d: MomentumData) => MomentumData) => void;
  today: string;
  resources: Resources;
  status: string;
  error: string;
  retry: () => void;
  onExit: () => void;
  weights: Array<{ date: string; weight: number }>;
  weightChart: ReactNode;
  logWeight: (date: string, kg: string) => void;
  weightsReady: boolean;
};
type View =
  | "today"
  | "journey"
  | "boxing"
  | "strength"
  | "nutrition"
  | "progress"
  | "settings";
const views: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "journey", label: "Plan" },
  { id: "nutrition", label: "Food" },
  { id: "progress", label: "Progress" },
  { id: "settings", label: "Settings" },
];
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const mealSlots: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${d}T12:00:00Z`));
const uid = () => crypto.randomUUID();

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mm-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mm-check">
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function LinkOut({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <ArrowRight size={14} aria-hidden="true" />
    </a>
  );
}

function Preferences({
  data,
  edit,
}: {
  data: MomentumData;
  edit: Props["edit"];
}) {
  const p = data.profile,
    update = (patch: Partial<Profile>) =>
      edit((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  return (
    <section className="mm-band">
      <h2>A routine that fits</h2>
      <fieldset>
        <legend>Your priorities</legend>
        {["Consistency", "Gradual fat loss", "Fitness", "Boxing skills"].map(
          (goal) => (
            <Toggle
              key={goal}
              label={goal}
              value={p.goals.includes(goal)}
              onChange={(checked) =>
                update({
                  goals: checked
                    ? [...p.goals, goal]
                    : p.goals.filter((g) => g !== goal),
                })
              }
            />
          ),
        )}
      </fieldset>
      <div className="mm-fields">
        <Field label="Current activity">
          <select
            value={p.activity}
            onChange={(e) =>
              update({ activity: e.target.value as Profile["activity"] })
            }
          >
            <option value="sedentary">Mostly sedentary / starting small</option>
            <option value="some">Some regular activity</option>
          </select>
        </Field>
        <Field label="Preferred skill">
          <select
            value={p.discipline}
            onChange={(e) =>
              update({ discipline: e.target.value as Profile["discipline"] })
            }
          >
            <option value="boxing">Boxing</option>
            <option value="kickboxing">Kickboxing</option>
            <option value="muay-thai">Muay Thai</option>
          </select>
        </Field>
        <Field label="Where feels achievable?">
          <select
            value={p.environment}
            onChange={(e) =>
              update({ environment: e.target.value as Profile["environment"] })
            }
          >
            <option value="both">Home strength + supervised classes</option>
            <option value="home">Home first; research classes</option>
            <option value="classes">
              Supervised classes; shorter home practice
            </option>
          </select>
        </Field>
        <Field label="Monthly budget ceiling (CAD)">
          <input
            inputMode="decimal"
            value={p.budget}
            onChange={(e) => update({ budget: e.target.value })}
            placeholder="Your comfortable limit"
          />
        </Field>
      </div>
      <Toggle
        label="Knee or hip movements need a comfortable-range modification"
        value={p.jointModification}
        onChange={(jointModification) => update({ jointModification })}
      />
      <fieldset>
        <legend>Realistically available days</legend>
        <div className="mm-day-options">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={p.availableDays.includes(day)}
              onClick={() =>
                update({
                  availableDays: p.availableDays.includes(day)
                    ? p.availableDays.filter((d) => d !== day)
                    : [...p.availableDays, day],
                })
              }
            >
              {weekdays[day].slice(0, 3)}
            </button>
          ))}
        </div>
      </fieldset>
      <details>
        <summary>Optional personal goals</summary>
        <div className="mm-fields">
          <Field label="Age">
            <input
              inputMode="numeric"
              value={p.age}
              onChange={(e) => update({ age: e.target.value })}
            />
          </Field>
          <Field label="Height (cm)">
            <input
              inputMode="decimal"
              value={p.height}
              onChange={(e) => update({ height: e.target.value })}
            />
          </Field>
          <Field label="Optional longer-term weight milestone (kg)">
            <input
              inputMode="decimal"
              value={p.goalWeight}
              onChange={(e) => update({ goalWeight: e.target.value })}
            />
          </Field>
        </div>
        <p>
          No fixed weight-loss target is required in Month 1. Personal values
          are not built into the public code.
        </p>
      </details>
    </section>
  );
}

function StartControl({
  data,
  edit,
  today,
  notice,
}: {
  data: MomentumData;
  edit: Props["edit"];
  today: string;
  notice: (s: string) => void;
}) {
  const [start, setStart] = useState(() => suggestedStart(today));
  const [confirmation, setConfirmation] = useState("");
  const j = currentJourney(data);
  return (
    <section className="mm-band">
      <h2>
        {j ? "A fresh month, with history kept" : "Choose your first Monday"}
      </h2>
      <p>
        {j
          ? "Creates a new private journey. The current month is archived, not erased. Recomp workouts, meals and weigh-ins stay unchanged."
          : "Choose a Monday that fits your routine. The calendar starts only when you activate it; until then, meals and preparation are available."}
      </p>
      <Field label="Start Monday">
        <input
          type="date"
          min={today}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>
      {j && (
        <Field label="Type START to create a separate new journey">
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </Field>
      )}
      <button
        className="mm-primary"
        type="button"
        disabled={
          !startJourneyAllowed(data, start, today) ||
          (Boolean(j) && confirmation !== "START")
        }
        onClick={() => {
          if (!startJourneyAllowed(data, start, today)) return;
          const next = makeJourney(start);
          edit((d) => ({
            ...d,
            onboarded: true,
            activeJourneyId: next.id,
            journeys: { ...d.journeys, [next.id]: next },
          }));
          setConfirmation("");
          notice(
            `Your private calendar starts ${shortDate(start)}. No activity is owed before then.`,
          );
        }}
      >
        <CalendarPlus size={18} />{" "}
        {j ? "Create new private journey" : "Activate my 30 days"}
      </button>
      {!startJourneyAllowed(data, start, today) && (
        <p className="mm-muted">
          Choose today or a future Monday, not a date in the past.
        </p>
      )}
    </section>
  );
}

function RecipeCard({
  recipe,
  base,
  done,
  onDone,
  onSwap,
  onRevert,
  resources,
  slot,
  timing,
}: {
  recipe: Resources["recipes"][number];
  base: string;
  done: boolean;
  onDone: () => void;
  onSwap: (id: string) => void;
  onRevert: () => void;
  resources: Resources;
  slot: MealSlot;
  timing: string;
}) {
  const [open, setOpen] = useState(false),
    [swap, setSwap] = useState(false),
    [tab, setTab] = useState<"ingredients" | "cook" | "portion">("cook");
  return (
    <article className={`mm-meal ${done ? "done" : ""}`}>
      <header>
        <img src={recipe.photo} alt={recipe.title} loading="lazy" />
        <div>
          <small>
            {slot} · {timing}
          </small>
          <h3>{recipe.title}</h3>
          {recipe.id !== base && (
            <strong className="mm-swap-label">Swap version</strong>
          )}
        </div>
      </header>
      <p>{recipe.ingredients.slice(0, 2).join(" · ")}</p>
      <div className="mm-actions">
        <button type="button" aria-pressed={done} onClick={onDone}>
          {done ? <Check size={16} /> : <Utensils size={16} />}{" "}
          {done ? "Eaten" : "Mark eaten"}
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setSwap(false);
          }}
        >
          Make it
        </button>
        <button
          type="button"
          aria-expanded={swap}
          onClick={() => {
            setSwap(!swap);
            setOpen(false);
          }}
        >
          Swap
        </button>
        {recipe.id !== base && (
          <button type="button" onClick={onRevert}>
            Revert to original
          </button>
        )}
      </div>
      {open && (
        <div className="mm-recipe-details">
          <SectionTabs
            id={`mm-${slot}`}
            label={`${slot} recipe sections`}
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "ingredients", label: "Ingredients" },
              { id: "cook", label: "Cook" },
              { id: "portion", label: "Portion" },
            ]}
          />
          <div
            role="tabpanel"
            id={`mm-${slot}-panel-${tab}`}
            aria-labelledby={`mm-${slot}-tab-${tab}`}
          >
            {tab === "cook" ? (
              <ol>
                {resources.howTo(recipe).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            ) : (
              <ul>
                {(tab === "ingredients"
                  ? recipe.ingredients
                  : recipe.plate
                ).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {swap && (
        <div className="mm-swap-options">
          {resources.recipes
            .filter((r) => r.slot === slot && r.id !== recipe.id)
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSwap(r.id);
                  setSwap(false);
                }}
              >
                {r.title}
                <ChevronRight size={16} />
              </button>
            ))}
        </div>
      )}
    </article>
  );
}

export default function MomentumPage(props: Props) {
  const { data, edit, today, resources } = props;
  const [view, setView] = useState<View>("today"),
    [date, setDate] = useState(today),
    [notice, setNotice] = useState("");
  const [tutorial, setTutorial] = useState<string | null>(null);
  const primaryView =
    view === "boxing" || view === "strength" ? "journey" : view;
  const [weight, setWeight] = useState(""),
    [waist, setWaist] = useState("");
  useEffect(() => setDate(today), [today]);
  useEffect(() => {
    setNotice("");
    setTutorial(null);
  }, [date]);
  const j = currentJourney(data),
    slots = j ? sortedSlots(j) : [];
  const selected = slots.find((s) => s.date === date),
    log = selected && j ? (j.logs[selected.id] ?? newLog()) : newLog();
  const resolved = selected ? resolveDay(data, selected, today) : null;
  const gate = exerciseGate(data, today),
    pause = activePause(data);
  const editJourney = (update: (j: Journey) => Journey) =>
    edit((d) => {
      const current = currentJourney(d);
      return current
        ? { ...d, journeys: { ...d.journeys, [current.id]: update(current) } }
        : d;
    });
  const editLog = (patch: Partial<ActivityLog>) => {
    if (selected)
      editJourney((current) => ({
        ...current,
        logs: {
          ...current.logs,
          [selected.id]: {
            ...(current.logs[selected.id] ?? newLog()),
            ...patch,
          },
        },
      }));
  };
  const record = (outcome: "planned" | "modified" | "missed" | "stopped") => {
    if (!selected) return false;
    if (
      outcome === "stopped" ||
      (outcome === "missed" && log.reason === "Pain or symptoms")
    ) {
      edit((d) => {
        const next = d,
          current = currentJourney(next);
        return current
          ? {
              ...next,
              journeys: {
                ...next.journeys,
                [current.id]: {
                  ...current,
                  logs: {
                    ...current.logs,
                    [selected.id]: {
                      ...log,
                      outcome: "stopped",
                      recordedAt: new Date().toISOString(),
                      performedOn: undefined,
                      scheduledFor: selected.date,
                    },
                  },
                },
              },
            }
          : next;
      });
      setNotice(urgentMessage);
      return true;
    }
    if (gate || selected.date > today) {
      setNotice(
        "Preparation only. No missed exercise is recorded before the calendar is active or during a pause.",
      );
      return false;
    }
    const error = completionError(data, selected, log, outcome, today);
    if (error) {
      setNotice(error);
      return false;
    }
    editLog({
      outcome,
      performedOn:
        outcome === "missed" ? undefined : (log.performedOn ?? selected.date),
      scheduledFor: selected.date,
      recordedAt: new Date().toISOString(),
      plannedActivity: resolved?.activity,
      plannedMinutes: resolved?.minutes,
      extraExercise: resolved?.extraId,
      plannedExerciseIds: resolved?.exerciseIds,
      classTime: log.classTime ?? data.profile.classTime,
      className: log.className ?? data.profile.className,
      gymId: log.gymId ?? data.profile.gymId,
    });
    setNotice("");
    return true;
  };
  const changeReadiness = (patch: Partial<Readiness>) => {
    const readiness = { ...log.readiness, ...patch };
    if (concerning(readiness)) {
      edit((d) => {
        const next = d,
          current = currentJourney(next);
        return current && selected
          ? {
              ...next,
              journeys: {
                ...next.journeys,
                [current.id]: {
                  ...current,
                  logs: {
                    ...current.logs,
                    [selected.id]: {
                      ...log,
                      readiness,
                      outcome: "stopped",
                      performedOn: undefined,
                      recordedAt: new Date().toISOString(),
                    },
                  },
                },
              },
            }
          : next;
      });
      setNotice(urgentMessage);
    } else editLog({ readiness });
  };
  const mealMap = resources.meals[weekdays[weekday(date)]];
  const mealLog = data.meals[date] ?? { swaps: {}, eaten: {} };
  const dayRecipes = mealSlots.map(
    (slot) =>
      resources.recipes.find(
        (r) => r.id === (mealLog.swaps[slot] ?? mealMap[slot]),
      )!,
  );
  const updateMeal = (slot: MealSlot, recipeId?: string) =>
    edit((d) => {
      const current = d.meals[date] ?? { swaps: {}, eaten: {} };
      return {
        ...d,
        meals: {
          ...d.meals,
          [date]: recipeId
            ? {
                ...current,
                swaps: { ...current.swaps, [slot]: recipeId },
                eaten: { ...current.eaten, [slot]: false },
              }
            : {
                ...current,
                eaten: { ...current.eaten, [slot]: !current.eaten[slot] },
              },
        },
      };
    });
  const upcoming = slots.find(
    (s) =>
      starterPlan[s.day - 1].activity === "boxing" &&
      s.date >= today &&
      !j?.logs[s.id]?.outcome,
  );
  const gym = gyms.find((g) => g.id === data.profile.gymId);
  const visited = j ? attendance(j, today) : [];
  const visits = visited.filter((s) => j && loggedActivity(j, s) === "boxing");
  const focusedSkills = boxingSkills[Math.min(visits.length, 3)];
  const walkEntries = j
    ? visited
        .filter(
          (s) =>
            !isStrength(loggedActivity(j, s)) &&
            loggedActivity(j, s) !== "boxing" &&
            Number(j.logs[s.id].minutes) > 0,
        )
        .sort((a, b) =>
          (j.logs[a.id].performedOn ?? a.date).localeCompare(
            j.logs[b.id].performedOn ?? b.date,
          ),
        )
    : [];
  const journeyWeights = props.weights.filter(
    (w) => !j || w.date >= j.startedOn,
  );
  const section = (next: View) => {
    setView(next);
    setNotice("");
  };
  const updateClassProfile = (patch: Partial<Profile>) =>
    edit((d) => ({
      ...d,
      profile: { ...d.profile, ...patch },
      // Provider/time changes invalidate unfulfilled booking claims. Recorded
      // visits retain their details rather than silently changing history.
      journeys: Object.fromEntries(
        Object.entries(d.journeys).map(([id, c]) => [
          id,
          {
            ...c,
            logs: Object.fromEntries(
              Object.entries(c.logs).map(([key, entry]) => [
                key,
                !entry.outcome && c.slots[key]?.date >= today
                  ? {
                      ...entry,
                      booked: false,
                      classTime: undefined,
                      className: undefined,
                      gymId: undefined,
                    }
                  : entry,
              ]),
            ),
          },
        ]),
      ),
    }));

  const strength = (
    activity: "strength-a" | "strength-b",
    interactive: boolean,
    exerciseId?: string,
  ) => (
    <section
      className="mm-band"
      id={interactive ? "mm-session-exercises" : undefined}
    >
      {!interactive && (
        <>
          <h2>{activity === "strength-a" ? "Strength A" : "Strength B"}</h2>
          <p>
            3-5 minutes of gentle movement first. One very light set per
            movement. Rest 90-180 seconds or longer; breathe continuously.
            Finish with two gentle minutes.
          </p>
          <p>
            Easy effort (2-4/10), with at least 4-5 clean repetitions left. Reps
            are guidance, not minimums. Keep loads familiar. No failure,
            breath-holding or forced joint range.
          </p>
        </>
      )}
      {data.profile.jointModification && (
        <p className="mm-callout">
          Use only a comfortable knee/hip range. Skip a movement that feels
          unsuitable and ask a qualified coach for help with your setup.
        </p>
      )}
      {strengthTemplates[activity]
        .filter(
          (e) =>
            (!interactive || resolved?.exerciseIds.includes(e.id)) &&
            (!exerciseId || exerciseId === e.id),
        )
        .map((e) => (
          <article className="mm-exercise" key={e.id}>
            <div className="mm-row">
              <div>
                <h3>{resources.exercises[e.id].name}</h3>
                <p>1 easy set · {e.reps} repetitions</p>
              </div>
              <button
                type="button"
                aria-expanded={tutorial === e.id}
                aria-label={`Technique: ${resources.exercises[e.id].name}`}
                onClick={() => setTutorial(tutorial === e.id ? null : e.id)}
              >
                <Video size={18} />
                <span>Technique</span>
              </button>
            </div>
            {tutorial === e.id && (
              <div className="mm-tutorial">
                {resources.media(e.id)}
                <ol>
                  {resources.exercises[e.id].cues.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <p>{resources.exercises[e.id].avoid.slice(0, 2).join(" ")}</p>
                <p>
                  Ignore any higher-volume targets in external demonstrations.
                  Follow the one-easy-set Momentum plan shown here.
                </p>
              </div>
            )}
            {interactive &&
              [e.id, ...(resolved?.extraId === e.id ? [`${e.id}-2`] : [])].map(
                (id, index) => {
                  const row = log.sets[id] ?? {
                    weight: "",
                    reps: "",
                    done: false,
                  };
                  return (
                    <div className="mm-set" key={id}>
                      <span>
                        Set {index + 1}
                        {index === 1 ? " · optional" : ""}
                      </span>
                      {resources.exercises[e.id].logType !== "done" &&
                        ![
                          "dead-bug",
                          "glute-bridge",
                          "incline-push-up",
                        ].includes(e.id) && (
                          <Field label="Weight (lbs)">
                            <input
                              aria-label={`${id} weight pounds`}
                              inputMode="decimal"
                              value={row.weight}
                              disabled={Boolean(resolved?.gate)}
                              onChange={(event) =>
                                editLog({
                                  sets: {
                                    ...log.sets,
                                    [id]: {
                                      ...row,
                                      weight: event.target.value,
                                    },
                                  },
                                })
                              }
                            />
                          </Field>
                        )}
                      <Field label="Actual reps">
                        <input
                          aria-label={`${id} actual reps`}
                          inputMode="numeric"
                          value={row.reps}
                          disabled={Boolean(resolved?.gate)}
                          onChange={(event) =>
                            editLog({
                              sets: {
                                ...log.sets,
                                [id]: { ...row, reps: event.target.value },
                              },
                            })
                          }
                        />
                      </Field>
                      <Toggle
                        label="Done"
                        value={row.done}
                        disabled={Boolean(resolved?.gate)}
                        onChange={(done) =>
                          editLog({
                            sets: {
                              ...log.sets,
                              [id]: { ...row, done, skipped: false },
                            },
                          })
                        }
                      />
                      <button
                        type="button"
                        disabled={Boolean(resolved?.gate)}
                        aria-pressed={Boolean(row.skipped)}
                        onClick={() =>
                          editLog({
                            sets: {
                              ...log.sets,
                              [id]: {
                                ...row,
                                done: false,
                                skipped: !row.skipped,
                              },
                            },
                          })
                        }
                      >
                        {row.skipped ? "Skipped - undo" : "Skip & review"}
                      </button>
                    </div>
                  );
                },
              )}
          </article>
        ))}
    </section>
  );

  const reviewForm =
    selected && j && starterPlan[selected.day - 1].activity === "review" ? (
      <WeeklyReview
        key={`${j.id}-${selected.id}`}
        data={data}
        date={selected.date}
        week={weekOf(selected.day)}
        today={today}
        onSave={(review) => {
          edit((d) => {
            const next = d;
            const c = currentJourney(next)!;
            return {
              ...next,
              journeys: {
                ...next.journeys,
                [c.id]: {
                  ...c,
                  reviews: {
                    ...c.reviews,
                    [String(weekOf(selected.day))]: review,
                  },
                },
              },
            };
          });
          setNotice(
            review.body === "symptoms"
              ? urgentMessage
              : "Reflection saved. Choose a familiar or lighter week; extra work is optional.",
          );
        }}
        onAdapt={(adaptation) => {
          const nextWeek = Math.min(4, weekOf(selected.day) + 1);
          if (!adaptationAllowed(data, adaptation.mode, today)) {
            setNotice(
              "Keep the familiar level: progression needs two comfortable strength practices, two light technique visits, a comfortable weekly review.",
            );
            return;
          }
          editJourney((c) => ({
            ...c,
            adaptations: { ...c.adaptations, [String(nextWeek)]: adaptation },
          }));
          setNotice(
            "Next week's choice recorded. The activity card explains any change.",
          );
        }}
      />
    ) : null;

  return (
    <main className="momentum" data-testid="momentum">
      <header className="mm-header">
        <button className="mm-back" type="button" onClick={props.onExit}>
          <ArrowLeft size={18} /> Coach Hub
        </button>
        <span className="mm-private">
          <LockKeyhole size={14} /> Private
        </span>
        <h1>
          Momentum<span>Your daily training & meals</span>
        </h1>
      </header>
      <div className="mm-save" role="status">
        <span>{props.status}</span>
        <button
          type="button"
          onClick={props.retry}
          aria-label="Retry Momentum sync"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {props.error && (
        <p className="mm-callout" role="alert">
          {props.error}
        </p>
      )}
      {notice && (
        <div className="mm-notice" role="status" tabIndex={-1}>
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      {!data.onboarded ? (
        <>
          <StartControl
            data={data}
            edit={edit}
            today={today}
            notice={setNotice}
          />
          <button
            type="button"
            className="mm-text-button"
            onClick={() => edit((d) => ({ ...d, onboarded: true }))}
          >
            Decide later
          </button>
          <details className="mm-disclosure">
            <summary>Personalize my routine (optional)</summary>
            <Preferences data={data} edit={edit} />
          </details>
        </>
      ) : (
        <>
          <nav
            className="mm-tabs"
            role="tablist"
            aria-label="Momentum sections"
          >
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={primaryView === v.id}
                tabIndex={primaryView === v.id ? 0 : -1}
                id={`mm-view-${v.id}`}
                aria-controls={`mm-page-${v.id}`}
                onClick={() => section(v.id)}
                onKeyDown={(event) => {
                  const index = views.findIndex((item) => item.id === v.id);
                  const target =
                    event.key === "ArrowRight"
                      ? (index + 1) % views.length
                      : event.key === "ArrowLeft"
                        ? (index + views.length - 1) % views.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? views.length - 1
                            : -1;
                  if (target < 0) return;
                  event.preventDefault();
                  section(views[target].id);
                  document
                    .getElementById(`mm-view-${views[target].id}`)
                    ?.focus();
                }}
              >
                {v.label}
              </button>
            ))}
          </nav>
          {primaryView === "journey" && (
            <nav className="mm-plan-nav" aria-label="Plan sections">
              {(
                [
                  ["journey", "Calendar"],
                  ["boxing", "Classes"],
                  ["strength", "Exercises"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => section(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          <div
            role="tabpanel"
            id={`mm-page-${primaryView}`}
            aria-labelledby={`mm-view-${primaryView}`}
          >
            {view === "today" && (
              <>
                {selected && resolved && j ? (
                  <MomentumSession
                    key={j.id + ":" + selected.id + ":" + date}
                    plan={resolved}
                    slot={selected}
                    log={log}
                    today={today}
                    start={j.startedOn}
                    label={"Day " + selected.day + " / " + shortDate(date)}
                    onToday={() => setDate(today)}
                    onEdit={editLog}
                    onReadiness={changeReadiness}
                    onRecord={record}
                    skills={focusedSkills}
                    review={reviewForm}
                    exercise={(id) =>
                      isStrength(resolved.activity)
                        ? strength(resolved.activity, true, id)
                        : null
                    }
                  />
                ) : (
                  <section className="mm-one-thing preparation">
                    <h2>
                      {j && today > (slots.at(-1)?.date ?? today)
                        ? "Your month is complete"
                        : "Your next step"}
                    </h2>
                    <p>{gate ?? monthTwo(data, today)}</p>
                    <button
                      type="button"
                      className="mm-primary"
                      onClick={() => section("settings")}
                    >
                      {j ? "View journey settings" : "Choose my start date"}{" "}
                      <ArrowRight size={18} />
                    </button>
                    <details className="mm-disclosure">
                      <summary>Preparation checklist (optional)</summary>
                      {[
                        "Plan regular meals",
                        "Contact a suitable beginner coach",
                        "Choose an achievable appointment",
                        "Set out clothes and water",
                      ].map((task) => (
                        <Toggle
                          key={task}
                          label={task}
                          value={Boolean(data.preparation[task])}
                          onChange={(value) =>
                            edit((d) => ({
                              ...d,
                              preparation: { ...d.preparation, [task]: value },
                            }))
                          }
                        />
                      ))}
                    </details>
                  </section>
                )}
                <nav
                  className="mm-day-shortcuts"
                  aria-label="After your session"
                >
                  <button type="button" onClick={() => section("nutrition")}>
                    <Utensils size={20} />
                    <span>
                      <strong>Meals for this day</strong>
                      <small>
                        {mealSlots.filter((slot) => mealLog.eaten[slot]).length}{" "}
                        of 4 recorded
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button type="button" onClick={() => section("journey")}>
                    <CalendarPlus size={20} />
                    <span>
                      <strong>Calendar & classes</strong>
                      <small>
                        {upcoming
                          ? "Next class: " + shortDate(upcoming.date)
                          : "Your 30-day plan"}
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </nav>
              </>
            )}
            {view === "journey" && (
              <section className="mm-band">
                <h2>My 30 days</h2>
                <p>
                  {gate ??
                    "Tap any day to see its actual plan and record. Smaller participation and stopped sessions stay distinct."}
                </p>
                {!j ? (
                  <p>
                    Your calendar is inactive. Complete preparation and choose
                    your first Monday in Settings.
                  </p>
                ) : (
                  <div className="mm-calendar">
                    {slots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`${resolveDay(data, s, today).activity} ${j.logs[s.id]?.outcome ?? ""}`}
                        onClick={() => {
                          setDate(s.date);
                          section("today");
                        }}
                      >
                        <small>{shortDate(s.date)}</small>
                        <strong>Day {s.day}</strong>
                        <span>{resolveDay(data, s, today).title}</span>
                        <small>{outcomeLabel(data, s, today)}</small>
                        {resolveDay(data, s, today).modifiedReason && (
                          <small>Adjusted · details inside</small>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {view === "strength" && (
              <>
                <section className="mm-band">
                  <h2>Small, familiar practice</h2>
                  <p>
                    These are Momentum's one-set templates, not the original
                    Recomp workouts. Tutorials are shared; attendance and
                    progression are independent.
                  </p>
                  <p>
                    {gate ??
                      "Choose Today to log the scheduled session. Never use this library to add make-up work."}
                  </p>
                </section>
                {strength("strength-a", false)}
                {strength("strength-b", false)}
              </>
            )}
            {view === "boxing" && (
              <>
                <section className="mm-band">
                  <h2>Learn the sport. Keep the commitment small.</h2>
                  <p>
                    One adapted class a week. No sparring, hard conditioning or
                    pressure to finish the full class. A trial or observation is
                    enough to explore the fit.
                  </p>
                  <p>
                    {data.profile.discipline} · Budget{" "}
                    {data.profile.budget
                      ? `CAD $${data.profile.budget}/month`
                      : "not set"}
                  </p>
                  <details className="mm-disclosure">
                    <summary>Class preferences</summary>
                    <div className="mm-fields">
                      <Field label="Class name (confirm with gym)">
                        <input
                          value={data.profile.className}
                          onChange={(e) =>
                            updateClassProfile({ className: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Preferred weekly class day">
                        <select
                          value={data.profile.classWeekday}
                          onChange={(e) =>
                            edit((d) => ({
                              ...d,
                              profile: {
                                ...d.profile,
                                classWeekday: Number(e.target.value),
                              },
                            }))
                          }
                        >
                          {weekdays.map((s, i) => (
                            <option key={s} value={i}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Confirmed class time (Vancouver)">
                        <input
                          type="time"
                          value={data.profile.classTime}
                          onChange={(e) =>
                            updateClassProfile({ classTime: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Next appointment date">
                        <input
                          type="date"
                          min={today}
                          value={data.profile.nextClassDate}
                          onChange={(e) =>
                            edit((d) => ({
                              ...d,
                              profile: {
                                ...d.profile,
                                nextClassDate: e.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <p>
                      Preferred times are your entries, not live availability.
                      Update individual appointments below; changes must
                      preserve 48-hour spacing.
                    </p>
                    {j && (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            let next = j;
                            for (const slot of slots.filter(
                              (s) =>
                                starterPlan[s.day - 1].activity === "boxing" &&
                                s.date >= today &&
                                !j.logs[s.id]?.outcome,
                            )) {
                              const monday = addDays(
                                slot.date,
                                -((weekday(slot.date) + 6) % 7),
                              );
                              const target = addDays(
                                monday,
                                (data.profile.classWeekday + 6) % 7,
                              );
                              if (target !== slot.date)
                                next = rescheduleClass(
                                  next,
                                  slot.id,
                                  target,
                                  today,
                                );
                            }
                            editJourney(() => next);
                            setNotice(
                              "Future class dates updated. Existing attendance was not changed.",
                            );
                          } catch (e) {
                            setNotice((e as Error).message);
                          }
                        }}
                      >
                        Apply preferred day to future classes
                      </button>
                    )}
                  </details>
                </section>
                <details className="mm-disclosure">
                  <summary>Compare gyms</summary>
                  <p>
                    Official sources checked October 23, 2026. Published
                    information is not a live booking guarantee. Confirm price,
                    taxes, cancellation, beginner suitability and modifications
                    directly.
                  </p>
                  <div className="mm-gym-list">
                    {gyms.map((g) => (
                      <article className="mm-gym" key={g.id}>
                        <div className="mm-row">
                          <h3>{g.name}</h3>
                          <button
                            type="button"
                            aria-pressed={data.profile.gymId === g.id}
                            onClick={() => updateClassProfile({ gymId: g.id })}
                          >
                            {data.profile.gymId === g.id ? (
                              <Check size={16} />
                            ) : (
                              <MapPin size={16} />
                            )}{" "}
                            {data.profile.gymId === g.id ? "Chosen" : "Choose"}
                          </button>
                        </div>
                        <p>{g.location}</p>
                        <p>{g.price}</p>
                        {g.monthly &&
                          Number(data.profile.budget) > 0 &&
                          g.monthly > Number(data.profile.budget) && (
                            <p className="mm-callout">
                              Published monthly starting price exceeds your
                              entered budget. A trial is a separate cost, not a
                              membership commitment.
                            </p>
                          )}
                        <p>{g.terms}</p>
                        <LinkOut href={g.url}>
                          Official details / contact
                        </LinkOut>
                      </article>
                    ))}
                  </div>
                </details>
                {j && (
                  <section className="mm-band">
                    <h2>Appointments & visits</h2>
                    {slots
                      .filter(
                        (s) => starterPlan[s.day - 1].activity === "boxing",
                      )
                      .map((s) => (
                        <ClassAppointment
                          key={s.id}
                          slot={{ ...s, id: `${j.id}-${s.id}` }}
                          log={j.logs[s.id] ?? newLog()}
                          time={
                            (j.logs[s.id]?.outcome
                              ? j.logs[s.id].classTime
                              : undefined) ?? data.profile.classTime
                          }
                          today={today}
                          reminders={data.profile.reminders}
                          onBook={(booked) =>
                            editJourney((c) => ({
                              ...c,
                              logs: {
                                ...c.logs,
                                [s.id]: {
                                  ...(c.logs[s.id] ?? newLog()),
                                  booked,
                                  classTime: booked
                                    ? data.profile.classTime
                                    : undefined,
                                  className: booked
                                    ? data.profile.className
                                    : undefined,
                                  gymId: booked
                                    ? data.profile.gymId
                                    : undefined,
                                },
                              },
                            }))
                          }
                          onMove={(target) => {
                            try {
                              editJourney((c) =>
                                rescheduleClass(c, s.id, target, today),
                              );
                              setNotice(
                                "Appointment moved; real attendance dates are unchanged.",
                              );
                            } catch (e) {
                              setNotice((e as Error).message);
                            }
                          }}
                          onOpen={() => {
                            setDate(s.date);
                            section("today");
                          }}
                        />
                      ))}
                  </section>
                )}
                <section className="mm-band">
                  <h2>Your boxing journey</h2>
                  <p>
                    {visits.length} visits attended, including{" "}
                    {visits.filter((s) => j?.logs[s.id]?.observed).length}{" "}
                    observation visits. No automatic sparring progression.
                  </p>
                  {boxingSkills.map((skills, i) => (
                    <div className="mm-skill" key={i}>
                      <strong>Visit {i + 1} · suggested focus</strong>
                      <p>{skills.join(" · ")}</p>
                    </div>
                  ))}
                  <p>
                    Skills are learning prompts, not a mastery test. Coaching
                    determines what is appropriate.
                  </p>
                </section>
              </>
            )}
            {view === "nutrition" && (
              <>
                <section className="mm-band">
                  <h2>Regular food, steady energy</h2>
                  <p>
                    Three meals and a flexible snack. The shared recipes are
                    meal ideas, not a verified calorie prescription. No strict
                    deficit, fasting rule, supplement requirement or food earned
                    through exercise.
                  </p>
                  <Field label="Meal date">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) setDate(e.target.value);
                      }}
                    />
                  </Field>
                  <p>
                    Morning breakfast · midday lunch · snack before class when
                    useful · dinner afterwards. Try a familiar snack 60-120
                    minutes before exercise if tolerated, and normal meals
                    earlier. This cannot prevent or explain fainting. Bring
                    water; follow any clinical nutrition/fluid advice.
                  </p>
                  <p>
                    Ingredient amounts are flexible starting examples. Optional
                    whey, oil, sauces or toppings can be omitted where the
                    recipe permits, not by removing essential pre-class food.
                  </p>
                  <p className="mm-muted">
                    Meal checkmarks here belong only to Momentum. Original Diet
                    history is unchanged.
                  </p>
                </section>
                <div className="mm-meals">
                  {dayRecipes.map((r, i) => (
                    <RecipeCard
                      key={`${date}-${mealSlots[i]}-${r.id}`}
                      recipe={r}
                      base={mealMap[mealSlots[i]]}
                      done={Boolean(mealLog.eaten[mealSlots[i]])}
                      onDone={() => updateMeal(mealSlots[i])}
                      onSwap={(id) => updateMeal(mealSlots[i], id)}
                      onRevert={() =>
                        updateMeal(mealSlots[i], mealMap[mealSlots[i]])
                      }
                      slot={mealSlots[i]}
                      timing={
                        [
                          "Morning",
                          "Midday",
                          "Before activity if useful",
                          "Evening / after activity",
                        ][i]
                      }
                      resources={resources}
                    />
                  ))}
                </div>
                <details className="mm-band">
                  <summary>To buy · this meal week</summary>
                  <p>
                    Consolidated ingredients from your current meal choices,
                    including swaps. Portions are recipe examples, not
                    automatically summed raw shopping weights.
                  </p>
                  <ul>
                    {resources
                      .groceries(
                        Array.from({ length: 7 }, (_, i) => {
                          const d = addDays(
                            date,
                            -((weekday(date) + 6) % 7) + i,
                          );
                          return mealSlots.map(
                            (slot) =>
                              resources.recipes.find(
                                (r) =>
                                  r.id ===
                                  (data.meals[d]?.swaps[slot] ??
                                    resources.meals[weekdays[weekday(d)]][
                                      slot
                                    ]),
                              )!,
                          );
                        }).flat(),
                      )
                      .map((g) => (
                        <li key={`${g.category}-${g.name}`}>
                          <strong>{g.name}</strong>
                          <small> {g.portions.join("; ")}</small>
                        </li>
                      ))}
                  </ul>
                </details>
              </>
            )}
            {view === "progress" && (
              <>
                <section className="mm-band">
                  <h2>Showing up is the measure</h2>
                  <div className="mm-stats">
                    <div>
                      <strong>{visits.length}</strong>
                      <span>boxing visits</span>
                    </div>
                    <div>
                      <strong>
                        {
                          visited.filter(
                            (s) => j && isStrength(loggedActivity(j, s)),
                          ).length
                        }
                      </strong>
                      <span>strength attempts</span>
                    </div>
                    <div>
                      <strong>
                        {
                          visited.filter(
                            (s) =>
                              (j && loggedActivity(j, s) === "walk") ||
                              (Number(j?.logs[s.id]?.minutes) > 0 &&
                                j &&
                                !isStrength(loggedActivity(j, s)) &&
                                loggedActivity(j, s) !== "boxing"),
                          ).length
                        }
                      </strong>
                      <span>walks logged</span>
                    </div>
                  </div>
                  <p>
                    Modified practice counts as participation, not a full
                    completed workout. No perfect-day streak or calories-burned
                    target.
                  </p>
                  <p>
                    {(slots.at(-1)?.date ?? "9999-12-31") <= today
                      ? monthTwo(data, today)
                      : "Your Month 2 recommendation appears at the end of this journey. For now, make the next appointment achievable."}
                  </p>
                  {j && (
                    <p>
                      {visited.filter((s) => j.logs[s.id].prepared).length}{" "}
                      attended activities had preparation checked. This is a
                      recorded association, not proof of what caused attendance.
                    </p>
                  )}
                  {j && walkEntries.length > 1 && (
                    <p>
                      First recorded walk: {j.logs[walkEntries[0].id].minutes}{" "}
                      min · Latest: {j.logs[walkEntries.at(-1)!.id].minutes}{" "}
                      min. These are actual entries, not a target to beat.
                    </p>
                  )}
                  {j && (
                    <p>
                      {visited.filter((s) => j.logs[s.id].comfortable).length}{" "}
                      activities were recorded as comfortable. Missing feedback
                      is not assumed to mean good recovery.
                    </p>
                  )}
                </section>
                <section className="mm-band">
                  <h2>Weight, without the pressure</h2>
                  <p>
                    The Coach Hub is the single source of weigh-ins. This view
                    reads the same kg records; it does not duplicate them.
                    Missing mornings never become zero.
                  </p>
                  {journeyWeights.length > 0 && (
                    <p>
                      First shared reading{j ? " in this journey" : ""}:{" "}
                      {journeyWeights[0].weight.toFixed(1)} kg · Latest:{" "}
                      {journeyWeights.at(-1)!.weight.toFixed(1)} kg
                    </p>
                  )}
                  {props.weightChart}
                  <div className="mm-fields">
                    <Field label="Morning weight today (kg)">
                      <input
                        inputMode="decimal"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                      />
                    </Field>
                    <button
                      type="button"
                      disabled={!props.weightsReady}
                      onClick={() => {
                        if (!(Number(weight) > 0 && Number(weight) < 500)) {
                          setNotice("Enter a valid kg reading.");
                          return;
                        }
                        props.logWeight(today, weight);
                        setNotice(
                          "Updated the shared Coach weight record for today. It is not counted twice.",
                        );
                      }}
                    >
                      Save shared weigh-in
                    </button>
                  </div>
                  {!props.weightsReady && (
                    <p>
                      Wait for the existing account's weight records to finish
                      syncing before editing them.
                    </p>
                  )}
                </section>
                <section className="mm-band">
                  <h2>Optional monthly waist check</h2>
                  <p>
                    Private to Momentum. About once a month is enough; no
                    body-fat estimate or spot-fat-loss claim.
                  </p>
                  <div className="mm-fields">
                    <Field label="Waist today (cm, optional)">
                      <input
                        inputMode="decimal"
                        value={waist}
                        onChange={(e) => setWaist(e.target.value)}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        if (!(Number(waist) > 20 && Number(waist) < 250)) {
                          setNotice(
                            "Enter a plausible measurement, or leave it untracked.",
                          );
                          return;
                        }
                        edit((d) => ({
                          ...d,
                          waist: { ...d.waist, [today]: waist },
                        }));
                        setNotice("Private waist check saved.");
                      }}
                    >
                      Save optional measurement
                    </button>
                  </div>
                  {Object.entries(data.waist)
                    .sort()
                    .map(([d, v]) => (
                      <p key={d}>
                        {shortDate(d)} · {v} cm
                      </p>
                    ))}
                  <p>
                    Progress photos are not collected: no private photo-storage
                    service is configured.
                  </p>
                </section>
                {j && (
                  <section className="mm-band">
                    <h2>Reflections & earlier journeys</h2>
                    {Object.entries(j.reviews).map(([w, r]) => (
                      <details key={w}>
                        <summary>Week {w} review</summary>
                        <p>{r.barrier || "No barrier recorded"}</p>
                        <p>{r.easier}</p>
                        <p>
                          {r.body} · Next class: {r.nextClass || "Not chosen"}
                        </p>
                      </details>
                    ))}
                    <details>
                      <summary>
                        Archived journeys (
                        {Object.keys(data.journeys).length - 1})
                      </summary>
                      {Object.values(data.journeys)
                        .filter((x) => x.id !== j.id)
                        .map((x) => (
                          <details key={x.id}>
                            <summary>
                              {shortDate(x.startedOn)} ·{" "}
                              {attendance(x, today).length} participation
                              records preserved
                            </summary>
                            {sortedSlots(x)
                              .filter((s) => x.logs[s.id]?.outcome)
                              .map((s) => (
                                <p key={s.id}>
                                  Day {s.day} · {shortDate(s.date)} ·{" "}
                                  {
                                    {
                                      planned: "Completed as planned",
                                      modified: "Smaller version",
                                      missed: "Did not do it",
                                      stopped: "Session stopped",
                                    }[x.logs[s.id].outcome!]
                                  }
                                  {x.logs[s.id].performedOn &&
                                  (x.logs[s.id].outcome === "planned" ||
                                    x.logs[s.id].outcome === "modified")
                                    ? ` · Attended ${shortDate(x.logs[s.id].performedOn!)}`
                                    : ""}
                                  {x.logs[s.id].note
                                    ? ` · ${x.logs[s.id].note}`
                                    : ""}
                                </p>
                              ))}
                          </details>
                        ))}
                    </details>
                  </section>
                )}
              </>
            )}
            {view === "settings" && (
              <>
                <h2 className="mm-page-title">Settings</h2>
                <details className="mm-disclosure">
                  <summary>Routine & goals</summary>
                  <Preferences data={data} edit={edit} />
                </details>
                <details className="mm-disclosure" open={!j}>
                  <summary>{j ? "Start a new month" : "Start date"}</summary>
                  <StartControl
                    data={data}
                    edit={edit}
                    today={today}
                    notice={setNotice}
                  />
                </details>
                {j && (
                  <details className="mm-disclosure">
                    <summary>Pause, repeat or lighten this month</summary>
                    <p>
                      Pause whenever you need a break and resume at the next
                      opportunity. No catch-up work is added.
                    </p>
                    {pause ? (
                      <button
                        type="button"
                        onClick={() =>
                          editJourney((c) => ({
                            ...c,
                            pauses: Object.fromEntries(
                              Object.entries(c.pauses).map(([id, p]) => [
                                id,
                                p.to ? p : { ...p, to: today },
                              ]),
                            ),
                          }))
                        }
                      >
                        Resume personal pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          editJourney((c) => ({
                            ...c,
                            pauses: {
                              ...c.pauses,
                              [uid()]: { from: today, reason: "personal" },
                            },
                          }))
                        }
                      >
                        Pause my journey
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const sunday = addDays(
                            today,
                            (7 - weekday(today)) % 7,
                          );
                          editJourney((c) =>
                            repeatWeek(c, sunday, today, uid()),
                          );
                          setNotice(
                            "A familiar week was added with new record IDs. Earlier logs were preserved.",
                          );
                        } catch (e) {
                          setNotice((e as Error).message);
                        }
                      }}
                    >
                      Repeat this week after Sunday
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const week = selected ? weekOf(selected.day) : 1;
                        editJourney((c) => ({
                          ...c,
                          adaptations: {
                            ...c.adaptations,
                            [String(week)]: {
                              mode: "lighter",
                              reason: "You requested fewer demands.",
                            },
                          },
                        }));
                        setNotice(
                          "This week's lighter option is saved; no attendance was fabricated.",
                        );
                      }}
                    >
                      Use a lighter week
                    </button>
                  </details>
                )}
                <details className="mm-disclosure">
                  <summary>Reminders</summary>
                  <Toggle
                    label="Show in-app preparation reminders and calendar-export controls"
                    value={data.profile.reminders}
                    onChange={(reminders) =>
                      edit((d) => ({
                        ...d,
                        profile: { ...d.profile, reminders },
                      }))
                    }
                  />
                  <p>
                    No push notifications are sent while the app is closed.
                    Calendar files create appointments only when you choose to
                    import them; they contain no health details.
                  </p>
                </details>
                <details className="mm-disclosure">
                  <summary>Optional wellbeing support</summary>
                  <Toggle
                    label="Show smoking-reduction or quitting support"
                    value={data.profile.wellbeing}
                    onChange={(wellbeing) =>
                      edit((d) => ({
                        ...d,
                        profile: { ...d.profile, wellbeing },
                      }))
                    }
                  />
                  {data.profile.wellbeing && (
                    <>
                      <p>
                        Quitting or reducing tobacco can support long-term
                        health. It is not a prerequisite for exercise, and
                        smoking is not assumed to explain exercise symptoms.
                      </p>
                      <Field label="One optional personal support goal">
                        <input
                          value={data.profile.wellbeingGoal}
                          onChange={(e) =>
                            edit((d) => ({
                              ...d,
                              profile: {
                                ...d.profile,
                                wellbeingGoal: e.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                      <LinkOut href="https://quitnow.ca/">
                        QuitNow BC · free support
                      </LinkOut>
                    </>
                  )}
                </details>
              </>
            )}
          </div>
        </>
      )}
      {data.profile.reminders && upcoming && (
        <aside className="mm-coach">
          <CalendarPlus size={20} />
          <p>
            Next class: {shortDate(upcoming.date)}. Confirm the time, set out
            clothes and check the route. A short technique visit is enough.
          </p>
        </aside>
      )}
      <details className="mm-evidence">
        <summary>Why this plan works</summary>
        <p>
          The exact one-class/one-strength-session starter is a conservative
          coaching design. The first month is a habit foundation, not the full
          long-term activity target.
        </p>
        {evidence.map((e) => (
          <div key={e.url}>
            <h3>{e.title}</h3>
            <p>{e.text}</p>
            <LinkOut href={e.url}>Read the source</LinkOut>
          </div>
        ))}
      </details>
      <footer className="mm-footer">
        <LockKeyhole size={14} /> Separate private journey · Original Recomp
        records stay intact
      </footer>
    </main>
  );
}

function WeeklyReview({
  data,
  date,
  week,
  today,
  onSave,
  onAdapt,
}: {
  data: MomentumData;
  date: string;
  week: number;
  today: string;
  onSave: (r: Review) => void;
  onAdapt: (a: Adaptation) => void;
}) {
  const existing = currentJourney(data)?.reviews[String(week)];
  const j = currentJourney(data);
  const actual = j
    ? attendance(j, date).filter(
        (s) => (j.logs[s.id].performedOn ?? s.date) >= addDays(date, -6),
      )
    : [];
  const [r, setR] = useState<Review>(
    existing ?? {
      barrier: "",
      body: "",
      manageable: false,
      nextClass: "",
      easier: "",
      savedAt: "",
    },
  );
  return (
    <section className="mm-band">
      <h2>Two-minute weekly reflection</h2>
      <p>
        Attendance comes from actual records, not this form. Decide what should
        be easier, not what you owe.
      </p>
      {j && (
        <p>
          Last seven days:{" "}
          {actual.filter((s) => loggedActivity(j, s) === "boxing").length}{" "}
          boxing visits ·{" "}
          {actual.filter((s) => isStrength(loggedActivity(j, s))).length}{" "}
          strength attempts ·{" "}
          {
            actual.filter(
              (s) =>
                !isStrength(loggedActivity(j, s)) &&
                loggedActivity(j, s) !== "boxing",
            ).length
          }{" "}
          walks. Smaller versions and observation count as participation, not a
          full session.
        </p>
      )}
      <details className="mm-disclosure">
        <summary>Planning notes (optional)</summary>
        <Field label="What made attendance difficult?">
          <input
            value={r.barrier}
            onChange={(e) => setR({ ...r, barrier: e.target.value })}
          />
        </Field>
        <Field label="What should be easier next week?">
          <input
            value={r.easier}
            onChange={(e) => setR({ ...r, easier: e.target.value })}
          />
        </Field>
        <Field label="Next class date">
          <input
            type="date"
            min={today}
            value={r.nextClass}
            onChange={(e) => setR({ ...r, nextClass: e.target.value })}
          />
        </Field>
      </details>
      <Field label="How did your body respond?">
        <select
          value={r.body}
          onChange={(e) =>
            setR({ ...r, body: e.target.value as Review["body"] })
          }
        >
          <option value="">Not recorded</option>
          <option value="comfortable">Comfortable</option>
          <option value="difficult">Too difficult / poor recovery</option>
          <option value="symptoms">Concerning symptoms</option>
        </select>
      </Field>
      <Toggle
        label="This schedule felt manageable"
        value={r.manageable}
        onChange={(manageable) => setR({ ...r, manageable })}
      />
      <button
        type="button"
        disabled={date > today}
        onClick={() => onSave({ ...r, savedAt: new Date().toISOString() })}
      >
        Save reflection
      </button>
      <details className="mm-disclosure">
        <summary>Next week's level (optional)</summary>
        <div className="mm-actions">
          <button
            type="button"
            onClick={() =>
              onAdapt({ mode: "steady", reason: "Repeat the familiar level." })
            }
          >
            Repeat the same level
          </button>
          <button
            type="button"
            onClick={() =>
              onAdapt({
                mode: "lighter",
                reason: "Fewer demands after your review.",
              })
            }
          >
            Make it lighter
          </button>
          {week >= 2 && week <= 3 && (
            <>
              <button
                type="button"
                disabled={
                  !progressionEligible(data, today) || r.body !== "comfortable"
                }
                onClick={() =>
                  onAdapt({
                    mode: "second-session",
                    reason:
                      "Optional second light practice after comfortable attendance and a weekly review.",
                  })
                }
              >
                Offer second strength day
              </button>
              <button
                type="button"
                disabled={
                  !progressionEligible(data, today) || r.body !== "comfortable"
                }
                onClick={() =>
                  onAdapt({
                    mode: "extra-set",
                    exerciseId: "incline-db-press",
                    reason:
                      "Optional second easy press set, keeping load and frequency unchanged.",
                  })
                }
              >
                Offer one extra easy set
              </button>
            </>
          )}
        </div>
        <p>{coachNote(data, today)}</p>
      </details>
    </section>
  );
}

function ClassAppointment({
  slot,
  log,
  time,
  today,
  reminders,
  onBook,
  onMove,
  onOpen,
}: {
  slot: Slot;
  log: ActivityLog;
  time: string;
  today: string;
  reminders: boolean;
  onBook: (b: boolean) => void;
  onMove: (d: string) => void;
  onOpen: () => void;
}) {
  const [target, setTarget] = useState(slot.date);
  useEffect(() => setTarget(slot.date), [slot.date]);
  return (
    <article className="mm-appointment">
      <div className="mm-row">
        <h3>
          {shortDate(slot.date)} · {time || "Time unconfirmed"}
        </h3>
        <span>
          {log.outcome
            ? {
                planned: "Completed as planned",
                modified: "Smaller version",
                missed: "Did not do it",
                stopped: "Session stopped",
              }[log.outcome]
            : log.booked
              ? "Booked by you"
              : "Not booked"}
        </span>
      </div>
      {log.performedOn &&
        (log.outcome === "planned" || log.outcome === "modified") && (
          <p>
            Actual attendance: {shortDate(log.performedOn)}
            {log.observed ? " · observed" : ""}
          </p>
        )}
      {slot.note && <p>{slot.note}</p>}
      {log.outcome && (log.className || log.gymId) && (
        <p>
          {log.className || "Recorded class"}
          {log.gymId
            ? ` · ${gyms.find((g) => g.id === log.gymId)?.name ?? "Gym recorded privately"}`
            : ""}
        </p>
      )}
      {!log.outcome && slot.date >= today && (
        <details className="mm-disclosure">
          <summary>Booking & reschedule</summary>
          <Toggle
            label="I confirmed and booked this appointment myself"
            value={log.booked}
            onChange={onBook}
          />
          <div className="mm-fields">
            <Field label={`Move class from ${shortDate(slot.date)}`}>
              <input
                type="date"
                min={today}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
            <button type="button" onClick={() => onMove(target)}>
              Move appointment
            </button>
          </div>
          <p>
            Prepare clothes, water, a familiar snack and transport. Confirm
            breaks and non-contact technique with the coach.
          </p>
        </details>
      )}
      <div className="mm-actions">
        <button type="button" onClick={onOpen}>
          Open this day
        </button>
        {reminders && time && slot.date >= today && (
          <button
            type="button"
            onClick={() => downloadCalendar(slot.date, time, slot.id)}
          >
            <CalendarPlus size={16} /> Calendar file
          </button>
        )}
      </div>
    </article>
  );
}

function downloadCalendar(date: string, time: string, id: string) {
  const url = URL.createObjectURL(
    new Blob([calendarText(date, time, id)], {
      type: "text/calendar;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "personal-appointment.ics";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
