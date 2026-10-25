import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Pause,
  ShieldAlert,
} from "lucide-react";
import { isStrength } from "./plan";
import { resolveDay } from "./coaching";
import {
  firstUnfinishedMovement,
  initialSessionStep,
  sessionSets,
  suggestedOutcome,
} from "./flow";
import type { ActivityLog, Outcome, Readiness, Slot } from "./types";

type Props = {
  plan: ReturnType<typeof resolveDay>;
  slot: Slot;
  log: ActivityLog;
  today: string;
  start: string;
  label: string;
  onToday: () => void;
  onEdit: (patch: Partial<ActivityLog>) => void;
  onReadiness: (patch: Partial<Readiness>) => void;
  onRecord: (outcome: Outcome) => boolean;
  exercise: (id: string) => ReactNode;
  skills: string[];
  review: ReactNode;
};

/** A session is a focused route, not another dashboard. Next only navigates;
 * checking an actual set and saving attendance remain deliberate actions. */
export default function MomentumSession(p: Props) {
  const { plan, log } = p,
    ids = plan.exerciseIds;
  const [step, setStep] = useState(() => {
    const next = initialSessionStep(
      log,
      ids,
      plan.extraId,
      plan.setsPerExercise,
    );
    return next === "plan" ? "practice" : next;
  });
  const [index, setIndex] = useState(() =>
    firstUnfinishedMovement(log, ids, plan.extraId, plan.setsPerExercise),
  );
  const [result, setResult] = useState<Exclude<Outcome, "stopped">>(() =>
    suggestedOutcome(log, ids, plan.extraId, plan.setsPerExercise),
  );
  const surface = useRef<HTMLElement>(null);
  // Move focus before paint, not in a later animation frame that can steal
  // focus from the first input while a fast user starts typing on iPhone.
  useLayoutEffect(() => {
    surface.current?.scrollIntoView({ block: "start", behavior: "instant" });
    surface.current?.focus({ preventScroll: true });
  }, [step]);
  const sets = sessionSets(ids, plan.extraId, plan.setsPerExercise),
    done = sets.filter((id) => log.sets[id]?.done).length;
  const move = (next: typeof step) => {
    if (next === "finish")
      setResult(suggestedOutcome(log, ids, plan.extraId, plan.setsPerExercise));
    setStep(next);
  };
  const save = (outcome: Outcome) => {
    if (p.onRecord(outcome)) move("saved");
    else
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(".mm-notice")?.focus(),
      );
  };
  return (
    <section
      className={`mm-session ${plan.activity}`}
      ref={surface}
      tabIndex={-1}
      aria-label="Daily session"
    >
      <div className="mm-route-heading">
        <button
          className="mm-icon"
          aria-label="Back to overview"
          onClick={p.onToday}
        >
          <ArrowLeft />
        </button>
        <span>{p.label}</span>
        <small>
          {step === "saved"
            ? "Saved"
            : step === "finish"
              ? "Finish"
              : "In progress"}
        </small>
      </div>
      <h1>{plan.title}</h1>
      {plan.gate ? (
        <p className="mm-callout">{plan.gate}</p>
      ) : (
        <>
          {step === "practice" && (
            <>
              {isStrength(plan.activity) && ids.length ? (
                <>
                  <div className="mm-movement-position">
                    <span>
                      Movement {index + 1} of {ids.length}
                    </span>
                    <span>
                      {done}/{sets.length} sets
                    </span>
                  </div>
                  <div
                    className="mm-meter"
                    role="progressbar"
                    aria-label="Sets completed"
                    aria-valuenow={done}
                    aria-valuemin={0}
                    aria-valuemax={sets.length}
                  >
                    <span style={{ width: `${(100 * done) / sets.length}%` }} />
                  </div>
                  <p className="mm-muted">
                    Warm up for 3-5 easy minutes, then clearly lighter practice
                    sets of the first two movements. Rest 90-180 seconds between
                    working sets.
                  </p>
                  {p.exercise(ids[Math.min(index, ids.length - 1)])}
                  <div className="mm-flow-actions">
                    <button
                      className="mm-icon"
                      aria-label="Previous movement"
                      disabled={index === 0}
                      onClick={() => setIndex((i) => i - 1)}
                    >
                      <ChevronLeft />
                    </button>
                    <button
                      className="mm-primary"
                      onClick={() => {
                        if (index === ids.length - 1) move("finish");
                        else {
                          setIndex((i) => i + 1);
                          surface.current?.scrollIntoView({
                            block: "start",
                            behavior: "instant",
                          });
                        }
                      }}
                    >
                      {index === ids.length - 1
                        ? "Review session"
                        : "Next movement"}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                  <button
                    className="mm-text-button"
                    onClick={() => move("finish")}
                  >
                    Finish with what I did
                  </button>
                </>
              ) : (
                <>
                  <ol className="mm-plan-steps">
                    {plan.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {plan.activity === "boxing" && (
                    <div className="mm-coach-note">
                      <strong>One thing to learn</strong>
                      <p>{p.skills.join(" · ")}</p>
                    </div>
                  )}
                  <p className="mm-muted">{plan.task}</p>
                  <button
                    className="mm-primary mm-wide"
                    onClick={() => move("finish")}
                  >
                    {plan.activity === "recovery" || plan.activity === "review"
                      ? "Record my day"
                      : "Record session"}
                    <ArrowRight size={18} />
                  </button>
                </>
              )}
            </>
          )}
          {step === "finish" && (
            <div className="mm-finish">
              <h2>How did it go?</h2>
              {sets.length > 0 && (
                <p>
                  {done} of {sets.length} actual sets checked.
                </p>
              )}
              <label className="mm-field">
                <span>Session result</span>
                <select
                  value={result}
                  onChange={(e) => setResult(e.target.value as typeof result)}
                >
                  <option value="planned">Completed as planned</option>
                  <option value="modified">Smaller version / observed</option>
                  <option value="missed">Did not do it</option>
                </select>
              </label>
              {result !== "missed" && (
                <>
                  {plan.activity === "boxing" && (
                    <label className="mm-check">
                      <input
                        type="checkbox"
                        checked={log.observed}
                        onChange={(e) => {
                          p.onEdit({ observed: e.target.checked });
                          if (e.target.checked) setResult("modified");
                        }}
                      />
                      I attended and observed
                    </label>
                  )}
                  {(plan.activity === "walk" ||
                    (plan.activity === "boxing" && !log.observed)) && (
                    <label className="mm-field">
                      <span>Actual active minutes</span>
                      <input
                        inputMode="numeric"
                        value={log.minutes}
                        onChange={(e) => p.onEdit({ minutes: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="mm-field">
                    <span>Effort (optional)</span>
                    <select
                      value={log.effort}
                      onChange={(e) =>
                        p.onEdit({
                          effort: e.target.value as ActivityLog["effort"],
                        })
                      }
                    >
                      <option value="">Not recorded</option>
                      <option value="easy">Easy</option>
                      <option value="manageable">Manageable</option>
                      <option value="hard">Too demanding</option>
                    </select>
                  </label>
                  <label className="mm-check">
                    <input
                      type="checkbox"
                      checked={log.comfortable}
                      onChange={(e) =>
                        p.onEdit({ comfortable: e.target.checked })
                      }
                    />
                    The movements felt comfortable
                  </label>
                </>
              )}
              {result === "missed" && (
                <label className="mm-field">
                  <span>Reason (optional)</span>
                  <select
                    value={log.reason}
                    onChange={(e) => p.onEdit({ reason: e.target.value })}
                  >
                    <option value="">Not added</option>
                    {[
                      "Work",
                      "No time",
                      "Too tired",
                      "Forgot",
                      "Class unavailable",
                      "Other",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <details className="mm-disclosure">
                <summary>Notes & corrections</summary>
                <label className="mm-field">
                  <span>Actual attendance date</span>
                  <input
                    type="date"
                    min={p.start}
                    max={p.today}
                    value={log.performedOn ?? p.slot.date}
                    onChange={(e) => p.onEdit({ performedOn: e.target.value })}
                  />
                </label>
                <label className="mm-field">
                  <span>One coach note (optional)</span>
                  <textarea
                    maxLength={600}
                    value={log.note}
                    onChange={(e) => p.onEdit({ note: e.target.value })}
                  />
                </label>
                <label className="mm-field">
                  <span>Recovery (record later)</span>
                  <select
                    value={log.recovery}
                    onChange={(e) =>
                      p.onEdit({
                        recovery: e.target.value as ActivityLog["recovery"],
                      })
                    }
                  >
                    <option value="">Not known yet</option>
                    <option value="good">Recovered comfortably</option>
                    <option value="poor">Still unusually tired / sore</option>
                  </select>
                </label>
              </details>
              <div className="mm-flow-actions">
                <button
                  className="mm-icon"
                  aria-label="Back to session"
                  onClick={() => move("practice")}
                >
                  <ArrowLeft />
                </button>
                <button className="mm-primary" onClick={() => save(result)}>
                  <Check size={18} />
                  Save result
                </button>
              </div>
              <button
                className="mm-text-button mm-stop-button"
                onClick={() => save("stopped")}
              >
                <ShieldAlert size={16} />
                Stop session
              </button>
            </div>
          )}
          {step === "saved" && (
            <div className="mm-session-result" role="status">
              {log.outcome === "planned" || log.outcome === "modified" ? (
                <CheckCircle2 size={48} />
              ) : (
                <Pause size={48} />
              )}
              <h2>
                {log.outcome === "planned"
                  ? "You showed up."
                  : log.outcome === "modified"
                    ? "Your effort counts."
                    : "Recorded. Keep going."}
              </h2>
              <p>
                {log.outcome === "planned" || log.outcome === "modified"
                  ? "Actual work saved. Recovery matters next."
                  : "No catch-up workout has been added."}
              </p>
              <button className="mm-primary" onClick={p.onToday}>
                Back to today
                <ArrowRight size={18} />
              </button>
              <button
                className="mm-text-button"
                onClick={() => {
                  p.onEdit({ outcome: undefined });
                  move("finish");
                }}
              >
                Edit result
              </button>
              {p.review}
            </div>
          )}
        </>
      )}
    </section>
  );
}
