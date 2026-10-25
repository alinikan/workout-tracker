import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Footprints,
  LockKeyhole,
  Pause,
  RefreshCw,
  Settings2,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import {
  addDays,
  calendarWeekOf,
  currentJourney,
  dayPlan,
  isStrength,
  makeJourney,
  phase,
  repeatWeek,
  rescheduleClass,
  sortedSlots,
  strengthTemplates,
  suggestedStart,
  weekday,
  weekOf,
} from "./plan";
import { activePause, startJourneyAllowed } from "./safety";
import {
  adaptationAllowed,
  attendance,
  coachNote,
  completionError,
  earnedLevel,
  loggedActivity,
  outcomeLabel,
  resolveDay,
} from "./coaching";
import { calendarText } from "./calendar";
import { classFor, firstWednesday, upgradeTitan } from "./titan";
import { evidence } from "./research";
import { sessionSets } from "./flow";
import {
  newLog,
  type ActivityLog,
  type Adaptation,
  type Journey,
  type MealSlot,
  type MomentumData,
  type Outcome,
  type Resources,
  type Slot,
} from "./types";
import { Outside, TitanIntro, TitanPrices } from "./TitanPanel";
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
type View = "today" | "meals" | "journey";
const mealSlots: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
const recipeDay = (date: string) =>
  [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][weekday(date)];
const Icon = ({ activity }: { activity: string }) =>
  activity === "boxing" ? (
    <Flame />
  ) : activity.startsWith("strength") ? (
    <Dumbbell />
  ) : activity === "walk" ? (
    <Footprints />
  ) : (
    <Pause />
  );
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mm-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Native dialog supplies focus containment, Escape and an inert background. */
function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const launch = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      launch?.focus();
    };
  }, []);
  return (
    <dialog
      className="mm-sheet momentum"
      aria-label={title}
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="mm-icon" aria-label="Close panel" onClick={close}>
          <X />
        </button>
      </header>
      <div className="mm-sheet-body">{children}</div>
    </dialog>
  );
}

/** Three destinations, one task surface. All writes use the existing owner-scoped
 * autosave hook; the view never bypasses RLS or puts private JSON in localStorage. */
export default function MomentumPage(p: Props) {
  const { data, today, edit, resources } = p;
  const j = currentJourney(data),
    slots = j ? sortedSlots(j) : [];
  const [view, setView] = useState<View>("today"),
    [sheet, setSheet] = useState<"titan" | "settings" | null>(null);
  const [selectedId, setSelectedId] = useState(""),
    [session, setSession] = useState(false);
  const [week, setWeek] = useState(() =>
    j && slots.length
      ? calendarWeekOf(j, slots.find((s) => s.date >= today) ?? slots.at(-1)!)
      : 1,
  );
  const [start, setStart] = useState(suggestedStart(today)),
    [notice, setNotice] = useState("");
  const [mealOpen, setMealOpen] = useState<MealSlot | null>(null),
    [mealDate, setMealDate] = useState(today);
  const [switchDate, setSwitchDate] = useState(""),
    [moveDate, setMoveDate] = useState("");
  const selected =
    slots.find((s) => s.id === selectedId) ??
    slots.find((s) => s.date === today) ??
    slots.find((s) => s.date > today) ??
    slots.at(-1);
  const plan = selected ? resolveDay(data, selected, today) : undefined;
  const log = selected && j ? (j.logs[selected.id] ?? newLog()) : newLog();
  const nextClass = slots.find(
    (s) =>
      s.date >= today &&
      dayPlan(j, s).activity === "boxing" &&
      !j?.logs[s.id]?.outcome,
  );
  const stage = classFor(data, nextClass?.date ?? today),
    level = earnedLevel(data, today),
    paused = activePause(data);
  const updateJourney = (fn: (journey: Journey) => Journey) =>
    edit((d) => {
      const current = currentJourney(d);
      return current
        ? { ...d, journeys: { ...d.journeys, [current.id]: fn(current) } }
        : d;
    });
  const updateLog = (id: string, patch: Partial<ActivityLog>) =>
    updateJourney((c) => ({
      ...c,
      logs: { ...c.logs, [id]: { ...newLog(), ...c.logs[id], ...patch } },
    }));
  const choose = (slot: Slot) => {
    setSelectedId(slot.id);
    setSession(false);
    setView("today");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const toToday = () => {
    setSelectedId("");
    setSession(false);
    setView("today");
    setNotice("");
  };
  useEffect(() => {
    setSelectedId("");
    setSession(false);
    setMealDate(today);
  }, [today, j?.id]);

  const record = (outcome: Outcome) => {
    if (!j || !selected || !plan) return false;
    const problem = completionError(data, selected, log, outcome, today);
    if (problem) {
      setNotice(problem);
      return false;
    }
    const details = classFor(data, selected.date);
    updateLog(selected.id, {
      outcome,
      performedOn: log.performedOn ?? selected.date,
      scheduledFor: selected.date,
      recordedAt: new Date().toISOString(),
      plannedActivity: plan.activity,
      plannedMinutes: plan.minutes,
      plannedExerciseIds: plan.exerciseIds,
      plannedSets: plan.setsPerExercise,
      extraExercise: plan.extraId,
      ...(plan.activity === "boxing"
        ? {
            className: log.className ?? details.name,
            classTime: "18:15",
            gymId: "titan",
          }
        : {}),
    });
    setNotice("");
    return true;
  };
  const exercise = (id: string) => {
    const resource = resources.exercises[id];
    if (!resource || !plan || !selected)
      return (
        <p>Exercise instructions are unavailable. Do not guess the movement.</p>
      );
    const template = isStrength(plan.activity)
      ? strengthTemplates[plan.activity].find((e) => e.id === id)
      : undefined;
    const keys = sessionSets([id], plan.extraId, plan.setsPerExercise);
    const changeSet = (
      key: string,
      patch: Partial<ActivityLog["sets"][string]>,
    ) => {
      updateJourney((c) => {
        const old = c.logs[selected.id] ?? newLog();
        return {
          ...c,
          logs: {
            ...c.logs,
            [selected.id]: {
              ...old,
              plannedActivity: plan.activity,
              plannedMinutes: plan.minutes,
              plannedExerciseIds: plan.exerciseIds,
              plannedSets: plan.setsPerExercise,
              sets: {
                ...old.sets,
                [key]: Object.assign(
                  { weight: "", reps: "", done: false },
                  old.sets[key],
                  patch,
                ),
              },
            },
          },
        };
      });
    };
    return (
      <div className="mm-exercise">
        <h2>{resource.name}</h2>
        <p className="mm-muted">
          {template?.reps ?? "8"} reps · {keys.length} working{" "}
          {keys.length === 1 ? "set" : "sets"} · comfortable range
        </p>
        {resources.media(id)}
        <div className="mm-set-grid mm-set-heading">
          <span>Set</span>
          <span>Weight (lbs)</span>
          <span>Actual reps</span>
          <span>Done</span>
        </div>
        {keys.map((key, i) => {
          const entry = log.sets[key] ?? { weight: "", reps: "", done: false };
          const weighted =
            resource.logType !== "none" &&
            !["dead-bug", "glute-bridge", "incline-push-up"].includes(id);
          return (
            <div
              className={`mm-set-grid ${entry.done ? "is-done" : ""}`}
              key={key}
            >
              <strong>{i + 1}</strong>
              {weighted ? (
                <input
                  aria-label={`${resource.name} set ${i + 1} weight in pounds`}
                  inputMode="decimal"
                  value={entry.weight}
                  onChange={(e) => changeSet(key, { weight: e.target.value })}
                />
              ) : (
                <span className="mm-muted">Bodyweight</span>
              )}
              <input
                aria-label={`${resource.name} set ${i + 1} actual reps`}
                inputMode="numeric"
                value={entry.reps}
                onChange={(e) => changeSet(key, { reps: e.target.value })}
              />
              <button
                className="mm-icon"
                aria-label={`${entry.done ? "Undo" : "Complete"} ${resource.name} set ${i + 1}`}
                aria-pressed={entry.done}
                onClick={() => {
                  if (
                    !entry.done &&
                    !(
                      Number.isInteger(Number(entry.reps)) &&
                      Number(entry.reps) > 0
                    )
                  ) {
                    setNotice(
                      "Enter the repetitions you actually did before checking this set.",
                    );
                    return;
                  }
                  setNotice("");
                  changeSet(key, { done: !entry.done, skipped: false });
                }}
              >
                {entry.done ? <Check /> : <span className="mm-empty-check" />}
              </button>
            </div>
          );
        })}
        <details className="mm-disclosure">
          <summary>Technique & setup</summary>
          <p>{resource.equipment}</p>
          <ol>
            {resource.cues.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p>
            <strong>Avoid:</strong> {resource.avoid.join(" ")}
          </p>
        </details>
      </div>
    );
  };
  const activate = () => {
    if (!startJourneyAllowed(data, start, today)) {
      setNotice("Choose an upcoming Monday. Existing history stays archived.");
      return;
    }
    const next = makeJourney(start);
    edit((d) => ({
      ...d,
      onboarded: true,
      activeJourneyId: next.id,
      journeys: { ...d.journeys, [next.id]: next },
      profile: {
        ...d.profile,
        gymId: "titan",
        discipline: "muay-thai",
        classWeekday: 3,
        classTime: "18:15",
        classStage: "introduction",
        classSwitchDate: "",
        className: "Introduction to Muay Thai / Kickboxing",
        nextClassDate: firstWednesday(start),
      },
    }));
    setSheet(null);
    setSelectedId("");
    setWeek(1);
  };
  const accept = (mode: Adaptation["mode"]) => {
    if (!j || !adaptationAllowed(data, mode, today)) return;
    const next = slots.find((s) => s.date >= today),
      key = String(weekOf(next?.day ?? 1));
    updateJourney((c) => ({
      ...c,
      adaptations: {
        ...c.adaptations,
        [key]: {
          mode,
          reason: "Chosen after reviewing actual attendance and recovery.",
        },
      },
    }));
  };
  const lastRecovery = slots
    .filter((s) => {
      const l = j?.logs[s.id];
      return (
        l &&
        (l.outcome === "planned" || l.outcome === "modified") &&
        !l.recovery &&
        (l.performedOn ?? s.date) < today &&
        (l.performedOn ?? s.date) >= addDays(today, -7) &&
        (isStrength(loggedActivity(j!, s)) ||
          loggedActivity(j!, s) === "boxing")
      );
    })
    .at(-1);
  const count = j ? attendance(j, today).length : 0;
  const attendedClasses = j
    ? attendance(j, today).filter((s) => loggedActivity(j, s) === "boxing")
        .length
    : 0;
  const attendedLifts = j
    ? attendance(j, today).filter((s) => isStrength(loggedActivity(j, s)))
        .length
    : 0;
  const navigation = (next: View) => {
    setView(next);
    setSession(false);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return (
    <main className={`momentum mm-v2 ${session ? "mm-focused" : ""}`}>
      <header className="mm-app-header">
        <button
          className="mm-icon"
          aria-label="Back to Coach Hub"
          onClick={p.onExit}
        >
          <ArrowLeft />
        </button>
        <div className="mm-brand">
          <span>Momentum</span>
          <small>
            <LockKeyhole size={11} />
            Private coaching
          </small>
        </div>
        <button
          className="mm-icon"
          aria-label="Momentum settings"
          onClick={() => setSheet("settings")}
        >
          <Settings2 />
        </button>
      </header>
      <div className="mm-sync" role="status">
        <span className={p.error ? "mm-error-dot" : "mm-sync-dot"} />
        {p.error || p.status}
        <button
          className="mm-icon"
          aria-label="Sync Momentum now"
          onClick={p.retry}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {notice && (
        <p className="mm-notice" role="alert" tabIndex={-1}>
          {notice}
        </p>
      )}
      {!j ? (
        <section className="mm-start">
          <span className="mm-eyebrow">Your next 90 days</span>
          <h1>
            One class.
            <br />
            One good beginning.
          </h1>
          <p>
            Learn Muay Thai at Titan. Build strength at home. Start small,
            repeat what works, and earn the next step.
          </p>
          <div className="mm-anchor">
            <Flame />
            <div>
              <strong>Titan Training Centre</strong>
              <span>Wednesday · 6:15 pm · Introduction</span>
            </div>
          </div>
          <Field label="Start Monday">
            <input
              type="date"
              min={today}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <p className="mm-muted">
            First planned introduction:{" "}
            {dateLabel(firstWednesday(start || suggestedStart(today)))}. Confirm
            your spot with Titan; this app does not book classes.
          </p>
          <button className="mm-primary mm-wide" onClick={activate}>
            Start my 90 days
            <ArrowRight size={18} />
          </button>
        </section>
      ) : (
        <>
          {view === "today" && (
            <>
              {session && selected && plan ? (
                <MomentumSession
                  key={`${j.id}:${selected.id}`}
                  plan={plan}
                  slot={selected}
                  log={log}
                  today={today}
                  start={j.startedOn}
                  label={dateLabel(selected.date)}
                  onToday={toToday}
                  onEdit={(patch) => updateLog(selected.id, patch)}
                  onReadiness={(patch) =>
                    updateLog(selected.id, {
                      readiness: { ...log.readiness, ...patch },
                    })
                  }
                  onRecord={record}
                  exercise={exercise}
                  skills={[
                    "Stance & guard",
                    "Balance",
                    "Your instructor's next correction",
                  ]}
                  review={null}
                />
              ) : (
                <>
                  <div className="mm-page-heading">
                    <div>
                      <span className="mm-eyebrow">
                        {dateLabel(selected?.date ?? today)}
                      </span>
                      <h1>
                        {selected && selected.date > today
                          ? "Your next beginning."
                          : "One thing at a time."}
                      </h1>
                    </div>
                    <span className="mm-day-label">
                      Day {selected?.day ?? 1}
                      <small>of 90</small>
                    </span>
                  </div>
                  {j.planVersion !== "titan-90" && (
                    <div className="mm-callout">
                      <strong>Your 90-day routine is ready.</strong>
                      <p>
                        Keep recorded history, meals and weigh-ins. Replace only
                        untouched upcoming appointments with the Titan routine.
                      </p>
                      <button
                        onClick={() => edit((d) => upgradeTitan(d, today))}
                      >
                        Use my 90-day plan
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  {selected && plan && (
                    <section className={`mm-today-focus ${plan.activity}`}>
                      <div className="mm-focus-top">
                        <Icon activity={plan.activity} />
                        <span>
                          {plan.activity === "boxing"
                            ? "Your Titan class"
                            : isStrength(plan.activity)
                              ? "Home strength"
                              : plan.activity === "walk"
                                ? "Easy movement"
                                : "Recovery & planning"}
                        </span>
                        <small>{phase(selected.day)}</small>
                      </div>
                      <h2>{plan.title}</h2>
                      <p>
                        {plan.activity === "boxing"
                          ? `6:15 pm · ${classFor(data, selected.date).room} · 60-minute class`
                          : `${plan.minutes}${plan.minutes.includes("planning") ? "" : " minutes"}${isStrength(plan.activity) ? ` · ${plan.exerciseIds.length} movements · ${plan.setsPerExercise} set each` : ""}`}
                      </p>
                      <div className="mm-focus-instruction">
                        {log.outcome ? (
                          <>
                            {log.outcome === "planned" ||
                            log.outcome === "modified" ? (
                              <Check aria-hidden="true" />
                            ) : (
                              <Pause aria-hidden="true" />
                            )}
                            <strong>
                              {outcomeLabel(data, selected, today)}
                            </strong>
                          </>
                        ) : (
                          <p>
                            {plan.activity === "boxing"
                              ? `${plan.minutes} active technique minutes with breaks is a starting option, not an obligation to fill the hour.`
                              : plan.enough}
                          </p>
                        )}
                      </div>
                      <button
                        className="mm-primary mm-wide"
                        disabled={Boolean(plan.gate) || selected.date > today}
                        onClick={() => setSession(true)}
                      >
                        {log.outcome
                          ? "View recorded session"
                          : Object.keys(log.sets).length
                            ? "Continue session"
                            : plan.activity === "review" ||
                                plan.activity === "recovery"
                              ? "Review my day"
                              : "Start session"}
                        <ArrowRight size={18} />
                      </button>
                      {selected.date > today && (
                        <small>
                          Your plan starts {dateLabel(j.startedOn)}. Preview it
                          in Journey.
                        </small>
                      )}
                      {selected.date !== today &&
                        slots.some((s) => s.date === today) && (
                          <button className="mm-text-button" onClick={toToday}>
                            Return to actual today
                          </button>
                        )}
                    </section>
                  )}
                  {plan?.modifiedReason && (
                    <p className="mm-context">{plan.modifiedReason}</p>
                  )}
                  {plan?.gate && <p className="mm-callout">{plan.gate}</p>}
                  {lastRecovery && (
                    <section className="mm-recovery-check">
                      <div>
                        <strong>How is recovery?</strong>
                        <p>After {dateLabel(lastRecovery.date)}'s session</p>
                      </div>
                      <div>
                        <button
                          onClick={() =>
                            updateLog(lastRecovery.id, { recovery: "good" })
                          }
                        >
                          Recovered
                        </button>
                        <button
                          onClick={() =>
                            updateLog(lastRecovery.id, { recovery: "poor" })
                          }
                        >
                          Not yet
                        </button>
                      </div>
                    </section>
                  )}
                  <button
                    className="mm-titan-row"
                    onClick={() => setSheet("titan")}
                  >
                    <span className="mm-venue-icon">
                      <Flame />
                    </span>
                    <span>
                      <strong>Titan Training Centre</strong>
                      <small>
                        {nextClass
                          ? `${dateLabel(nextClass.date)} · 6:15 pm`
                          : "Your chosen training centre"}
                      </small>
                      <small>{stage.name}</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <div className="mm-next-links">
                    <button onClick={() => navigation("meals")}>
                      <Utensils />
                      <span>
                        Next meal<small>Simple food, steady energy</small>
                      </span>
                      <ArrowRight />
                    </button>
                    <button
                      onClick={() => {
                        setWeek(selected ? calendarWeekOf(j, selected) : 1);
                        navigation("journey");
                      }}
                    >
                      <CalendarDays />
                      <span>
                        Your week<small>Plan, progress & recovery</small>
                      </span>
                      <ArrowRight />
                    </button>
                  </div>
                  <p className="mm-coach-note">
                    <Sparkles size={18} />
                    {coachNote(data, today)}
                  </p>
                </>
              )}
            </>
          )}
          {view === "meals" && (
            <section className="mm-meals">
              <div className="mm-page-heading">
                <div>
                  <span className="mm-eyebrow">Fuel the routine</span>
                  <h1>Eat well. Keep it simple.</h1>
                </div>
                <Utensils />
              </div>
              <Field label="Meals for">
                <input
                  type="date"
                  value={mealDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setMealDate(e.target.value);
                      setMealOpen(null);
                    }
                  }}
                />
              </Field>
              <p className="mm-muted">
                Regular meals, protein and comfortable portions. No extra
                restriction to make up for missed training.
              </p>
              {mealSlots.map((slot, index) => {
                const original = resources.meals[recipeDay(mealDate)]?.[slot];
                const recipe = resources.recipes.find(
                  (r) =>
                    r.id === (data.meals[mealDate]?.swaps[slot] ?? original),
                );
                if (!recipe) return null;
                const eaten = Boolean(data.meals[mealDate]?.eaten[slot]),
                  swapped = recipe.id !== original;
                const mealUpdate = (recipeId?: string, checked?: boolean) =>
                  edit((d) => {
                    const old = d.meals[mealDate] ?? { swaps: {}, eaten: {} };
                    const swaps = { ...old.swaps };
                    if (recipeId === original) delete swaps[slot];
                    else if (recipeId) swaps[slot] = recipeId;
                    return {
                      ...d,
                      meals: {
                        ...d.meals,
                        [mealDate]: {
                          swaps,
                          eaten: {
                            ...old.eaten,
                            [slot]: recipeId ? false : (checked ?? false),
                          },
                        },
                      },
                    };
                  });
                return (
                  <article
                    className={`mm-meal ${eaten ? "eaten" : ""}`}
                    key={slot}
                  >
                    <button
                      className="mm-meal-summary"
                      aria-expanded={mealOpen === slot}
                      onClick={() =>
                        setMealOpen(mealOpen === slot ? null : slot)
                      }
                    >
                      <img src={recipe.photo} alt="" loading="lazy" />
                      <span>
                        <small>
                          {
                            [
                              "Morning",
                              "Midday",
                              "Before training · 30-60 min",
                              "Evening / after training",
                            ][index]
                          }
                          {swapped ? " · Swap version" : ""}
                        </small>
                        <strong>{recipe.title}</strong>
                        <small>
                          {eaten
                            ? "Eaten"
                            : slot[0].toUpperCase() + slot.slice(1)}
                        </small>
                      </span>
                      {eaten ? <Check /> : <ChevronRight />}
                    </button>
                    {mealOpen === slot && (
                      <div className="mm-meal-detail">
                        <h3>On your plate</h3>
                        <ul>
                          {recipe.plate.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                        <details className="mm-disclosure">
                          <summary>Make it · step by step</summary>
                          <h3>Ingredients</h3>
                          <ul>
                            {recipe.ingredients.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                          <ol>
                            {resources.howTo(recipe).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                        </details>
                        <Field label={`Swap ${slot}`}>
                          <select
                            value={recipe.id}
                            onChange={(e) => mealUpdate(e.target.value)}
                          >
                            {resources.recipes
                              .filter((r) => r.slot === slot)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.title}
                                  {r.id === original ? " (original)" : ""}
                                </option>
                              ))}
                          </select>
                        </Field>
                        {swapped && (
                          <button
                            className="mm-text-button"
                            onClick={() => mealUpdate(original)}
                          >
                            Revert to original
                          </button>
                        )}
                        <button
                          className={`mm-wide ${eaten ? "" : "mm-primary"}`}
                          aria-pressed={eaten}
                          onClick={() => mealUpdate(undefined, !eaten)}
                        >
                          <Check size={18} />
                          {eaten ? "Eaten · undo" : "Mark eaten"}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
              <details className="mm-disclosure">
                <summary>To buy for these meals</summary>
                <ul>
                  {resources
                    .groceries(
                      mealSlots.flatMap((s) => {
                        const id =
                          data.meals[mealDate]?.swaps[s] ??
                          resources.meals[recipeDay(mealDate)]?.[s];
                        const r = resources.recipes.find((r) => r.id === id);
                        return r ? [r] : [];
                      }),
                    )
                    .map((g) => (
                      <li key={g.name}>
                        {g.name}
                        {g.portions.length ? ` · ${g.portions.join(", ")}` : ""}
                      </li>
                    ))}
                </ul>
              </details>
              <p className="mm-context">
                For class: normal meal 2-3 hours before, or a small familiar
                snack 30-60 minutes before if needed. Water and breaks help, but
                cannot guarantee prevention of dizziness. Stop if you feel
                faint.
              </p>
            </section>
          )}
          {view === "journey" && (
            <section className="mm-journey">
              <div className="mm-page-heading">
                <div>
                  <span className="mm-eyebrow">Your 90-day journey</span>
                  <h1>Progress you can see.</h1>
                </div>
                <CalendarDays />
              </div>
              <div className="mm-stats">
                <div>
                  <strong>{count}</strong>
                  <span>sessions attended</span>
                </div>
                <div>
                  <strong>{attendedClasses}</strong>
                  <span>Titan visits</span>
                </div>
                <div>
                  <strong>{attendedLifts}</strong>
                  <span>strength sessions</span>
                </div>
              </div>
              <div className="mm-week-heading">
                <button
                  className="mm-icon"
                  aria-label="Previous week"
                  disabled={week <= 1}
                  onClick={() => setWeek((w) => w - 1)}
                >
                  <ChevronLeft />
                </button>
                <div>
                  <h2>Week {week}</h2>
                  <small>{phase((week - 1) * 7 + 1)}</small>
                </div>
                <button
                  className="mm-icon"
                  aria-label="Next week"
                  disabled={
                    week >=
                    Math.max(13, ...slots.map((s) => calendarWeekOf(j, s)))
                  }
                  onClick={() => setWeek((w) => w + 1)}
                >
                  <ChevronRight />
                </button>
              </div>
              <div className="mm-calendar">
                {slots
                  .filter((s) => calendarWeekOf(j, s) === week)
                  .map((s) => {
                    const resolved = resolveDay(data, s, today),
                      outcome = j.logs[s.id]?.outcome;
                    return (
                      <button
                        key={s.id}
                        className={`${resolved.activity} ${outcome ?? ""}`}
                        aria-current={s.date === today ? "date" : undefined}
                        onClick={() => choose(s)}
                      >
                        <span className="mm-calendar-date">
                          {dateLabel(s.date)}
                          <small>Day {s.day}</small>
                        </span>
                        <Icon activity={resolved.activity} />
                        <span className="mm-calendar-title">
                          <strong>{resolved.title}</strong>
                          <small>
                            {outcome
                              ? outcomeLabel(data, s, today)
                              : s.date < today
                                ? "No entry"
                                : resolved.activity === "boxing"
                                  ? "Planned · 6:15 pm · not a booking"
                                  : resolved.minutes === "0"
                                    ? "Rest / optional movement"
                                    : `${resolved.minutes} min`}
                          </small>
                        </span>
                        {outcome === "planned" || outcome === "modified" ? (
                          <Check />
                        ) : (
                          <ChevronRight />
                        )}
                      </button>
                    );
                  })}
              </div>
              <section className="mm-progression">
                <span className="mm-eyebrow">Earned, not calendar-based</span>
                <h2>
                  {level === 2
                    ? "Ready for a little more volume"
                    : level === 1
                      ? "A second strength day is an option"
                      : "Build a repeatable base"}
                </h2>
                <p>
                  Start with one home strength session and one Wednesday class.
                  Four comfortable full lifts and three comfortable classes can
                  unlock Saturday Strength B. Eight full lifts (including two B
                  sessions) and six comfortable classes can unlock two sets.
                  Recent recovery must also support it.
                </p>
                <Field label="My workload choice">
                  <select
                    value={
                      Object.entries(j.adaptations)
                        .filter(
                          ([w]) =>
                            Number(w) <=
                            weekOf(
                              slots.find((s) => s.date >= today)?.day ?? 1,
                            ),
                        )
                        .sort(([a], [b]) => Number(b) - Number(a))[0]?.[1]
                        .mode ?? "steady"
                    }
                    onChange={(e) =>
                      accept(e.target.value as Adaptation["mode"])
                    }
                  >
                    <option value="steady">Keep one strength day</option>
                    <option value="lighter">Make it lighter</option>
                    <option value="second-session" disabled={level < 1}>
                      Add Saturday Strength B
                      {level < 1 ? " · not earned yet" : ""}
                    </option>
                    <option value="two-sets" disabled={level < 2}>
                      Two strength days, two sets
                      {level < 2 ? " · not earned yet" : ""}
                    </option>
                  </select>
                </Field>
                <p className="mm-muted">
                  No automatic promotion or heavier weights. Keep familiar loads
                  when adding a session or set. Reviews are for planning, not
                  permission forms.
                </p>
              </section>
              <section className="mm-weight-section">
                <h2>Weight trend</h2>
                <p className="mm-muted">
                  Shared with Coach Hub · kg · averages matter more than
                  individual days.
                </p>
                {p.weightsReady ? (
                  p.weightChart
                ) : (
                  <p>Syncing shared weight history…</p>
                )}
                <button className="mm-text-button" onClick={p.onExit}>
                  Log a weigh-in in Coach Hub
                  <ArrowRight size={16} />
                </button>
              </section>
              <details className="mm-disclosure">
                <summary>Research behind the routine</summary>
                {evidence
                  .filter((e) => !/seek care/i.test(e.title))
                  .map((e) => (
                    <p key={e.url}>
                      <Outside href={e.url}>{e.title}</Outside>
                      <br />
                      {e.text}
                    </p>
                  ))}
              </details>
            </section>
          )}
          {!session && (
            <nav className="mm-bottom-nav" aria-label="Momentum sections">
              {(
                [
                  { id: "today", label: "Today", icon: <Flame /> },
                  { id: "meals", label: "Meals", icon: <Utensils /> },
                  { id: "journey", label: "Journey", icon: <CalendarDays /> },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  aria-current={view === tab.id ? "page" : undefined}
                  onClick={() => navigation(tab.id)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          )}
        </>
      )}
      {sheet === "titan" && (
        <Sheet title="Your Titan routine" close={() => setSheet(null)}>
          <span className="mm-eyebrow">Your chosen gym</span>
          <h3>Titan Training Centre</h3>
          <div className="mm-class-ticket">
            <span>
              {nextClass ? dateLabel(nextClass.date) : "Wednesday"} · 6:15 pm
            </span>
            <h3>{stage.name}</h3>
            <p>{stage.room} · one-hour appointment</p>
            <small>
              Planned, not booked. Confirm your spot and holiday changes with
              Titan.
            </small>
          </div>
          <TitanIntro />
          <details className="mm-disclosure">
            <summary>When I am ready for Beginners / Intermediate</summary>
            <p>
              There is no deadline to leave the introduction. Ask your
              instructor whether the next class fits your technique and
              recovery. This is not advanced sparring.
            </p>
            <Field label="First Wednesday in the new class">
              <input
                type="date"
                min={today}
                value={switchDate}
                onChange={(e) => setSwitchDate(e.target.value)}
              />
            </Field>
            <button
              disabled={
                !switchDate || weekday(switchDate) !== 3 || switchDate < today
              }
              onClick={() => {
                edit((d) => ({
                  ...d,
                  profile: {
                    ...d.profile,
                    classStage: "beginner",
                    classSwitchDate: switchDate,
                  },
                }));
                setSheet(null);
              }}
            >
              Use Beginners / Intermediate from this date
            </button>
            {data.profile.classStage === "beginner" && (
              <button
                className="mm-text-button"
                onClick={() =>
                  edit((d) => ({
                    ...d,
                    profile: {
                      ...d.profile,
                      classStage: "introduction",
                      classSwitchDate: "",
                    },
                  }))
                }
              >
                Return future classes to Introduction
              </button>
            )}
            <p className="mm-muted">
              Same Wednesday time, 6:15 pm; Room #1, not Room #2. Saturday
              requires four months' experience and is not unlocked by this
              calendar.
            </p>
          </details>
          {nextClass && (
            <details className="mm-disclosure">
              <summary>Calendar & appointment changes</summary>
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(
                    new Blob(
                      [
                        calendarText(
                          nextClass.date,
                          "18:15",
                          `${j?.id}-${nextClass.id}`,
                        ),
                      ],
                      { type: "text/calendar" },
                    ),
                  );
                  a.download = "personal-appointment.ics";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                }}
              >
                Download private calendar reminder
              </button>
              <Field label="Move this planned appointment">
                <input
                  type="date"
                  min={today}
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                />
              </Field>
              <button
                disabled={!moveDate}
                onClick={() => {
                  try {
                    updateJourney((c) =>
                      rescheduleClass(c, nextClass.id, moveDate, today),
                    );
                    setSheet(null);
                  } catch (e) {
                    setNotice((e as Error).message);
                    setSheet(null);
                  }
                }}
              >
                Move appointment
              </button>
              <p className="mm-muted">
                Only within this week with recovery spacing. Confirm another
                suitable class with Titan first. This does not book or cancel
                anything.
              </p>
            </details>
          )}
          <TitanPrices />
        </Sheet>
      )}
      {sheet === "settings" && (
        <Sheet title="Routine settings" close={() => setSheet(null)}>
          <p>
            Your original workout program, meals and weight history remain
            unchanged.
          </p>
          {j && (
            <>
              <h3>{paused ? "Your routine is paused" : "Keep it realistic"}</h3>
              <button
                onClick={() => {
                  if (paused)
                    updateJourney((c) => ({
                      ...c,
                      pauses: Object.fromEntries(
                        Object.entries(c.pauses).map(([key, value]) => [
                          key,
                          value.to ? value : { ...value, to: today },
                        ]),
                      ),
                    }));
                  else
                    updateJourney((c) => ({
                      ...c,
                      pauses: {
                        ...c.pauses,
                        [crypto.randomUUID()]: {
                          from: today,
                          reason: "personal",
                        },
                      },
                    }));
                  setSheet(null);
                }}
              >
                {paused ? "Resume routine" : "Pause routine"}
              </button>
              <details className="mm-disclosure">
                <summary>Repeat this week</summary>
                <p>
                  Extend the calendar without losing attendance. Booked or
                  recorded future appointments cannot be moved.
                </p>
                <button
                  onClick={() => {
                    try {
                      updateJourney((c) =>
                        repeatWeek(
                          c,
                          addDays(today, (7 - weekday(today)) % 7),
                          today,
                          crypto.randomUUID(),
                        ),
                      );
                      setSheet(null);
                    } catch (e) {
                      setNotice((e as Error).message);
                      setSheet(null);
                    }
                  }}
                >
                  Repeat current week
                </button>
              </details>
            </>
          )}
          <details className="mm-disclosure">
            <summary>Start a fresh 90-day journey</summary>
            <p>
              Previous journeys stay archived. Meals and shared weigh-ins are
              not reset.
            </p>
            <Field label="New start Monday">
              <input
                type="date"
                min={today}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <button onClick={activate}>Start new 90-day journey</button>
          </details>
          <details className="mm-disclosure">
            <summary>Archived journeys</summary>
            {Object.values(data.journeys)
              .filter((c) => c.id !== data.activeJourneyId)
              .map((c) => (
                <p key={c.id}>
                  {dateLabel(c.startedOn)} ·{" "}
                  {
                    Object.values(c.logs).filter(
                      (l) =>
                        l.outcome === "planned" || l.outcome === "modified",
                    ).length
                  }{" "}
                  recorded days
                </p>
              ))}
            {Object.keys(data.journeys).length <= 1 && (
              <p>No archived journeys yet.</p>
            )}
          </details>
          <p className="mm-muted">
            Offline drafts stay encrypted. Keep this tab open until synced
            before closing it. Account access is managed in Coach Hub.
          </p>
        </Sheet>
      )}
      {session && (
        <p className="mm-stop-guidance">
          Stop if you feel faint, have chest pain or unusual breathlessness.
          Seek urgent help for severe symptoms.
        </p>
      )}
    </main>
  );
}
