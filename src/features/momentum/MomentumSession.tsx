import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  HeartHandshake,
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
  type SessionStep,
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
const steps = ["plan", "practice", "finish"] as const;
const stepLabels = { plan: "Plan", practice: "Session", finish: "Finish" };

/** One working surface at a time. The parent keeps autosave and validation;
 * this component owns presentation only, so Next never manufactures a set. */
export default function MomentumSession(p: Props) {
  const { plan, log } = p;
  const ids = plan.exerciseIds;
  const [step, setStep] = useState<SessionStep>(() =>
    initialSessionStep(log, ids, plan.extraId),
  );
  const [movement, setMovement] = useState(() =>
    firstUnfinishedMovement(log, ids, plan.extraId),
  );
  const [outcome, setOutcome] = useState(() =>
    suggestedOutcome(log, ids, plan.extraId),
  );
  const surface = useRef<HTMLElement>(null);
  const sets = sessionSets(ids, plan.extraId);
  const done = sets.filter((id) => log.sets[id]?.done).length;
  const index = Math.min(movement, Math.max(0, ids.length - 1));
  const blocked = Boolean(plan.gate);
  useEffect(() => {
    if (log.outcome) setStep("saved");
  }, [log.outcome]);
  const focusSurface = () =>
    requestAnimationFrame(() => {
      surface.current?.scrollIntoView({ block: "start", behavior: "instant" });
      surface.current?.focus({ preventScroll: true });
    });
  const moveTo = (next: SessionStep) => {
    if (next === "finish") setOutcome(suggestedOutcome(log, ids, plan.extraId));
    setStep(next);
    focusSurface();
  };
  const save = (result: Outcome) => {
    if (p.onRecord(result)) {
      setStep("saved");
      focusSurface();
    } else
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(".mm-notice")?.focus(),
      );
  };
  const feedback = (
    <details className="mm-disclosure mm-feedback">
      <summary>Optional feedback</summary>
      <div className="mm-fields">
        <label className="mm-field">
          <span>Effort</span>
          <select
            value={log.effort}
            onChange={(e) =>
              p.onEdit({ effort: e.target.value as ActivityLog["effort"] })
            }
          >
            <option value="">Not recorded</option>
            <option value="easy">Easy</option>
            <option value="manageable">Manageable</option>
            <option value="hard">Too demanding</option>
          </select>
        </label>
        <label className="mm-field">
          <span>Recovery after the session (update later)</span>
          <select
            value={log.recovery}
            onChange={(e) =>
              p.onEdit({ recovery: e.target.value as ActivityLog["recovery"] })
            }
          >
            <option value="">Not known yet</option>
            <option value="good">Recovered comfortably</option>
            <option value="poor">Lingering fatigue / poor recovery</option>
          </select>
        </label>
      </div>
      <label className="mm-check">
        <input
          type="checkbox"
          checked={log.comfortable}
          onChange={(e) => p.onEdit({ comfortable: e.target.checked })}
        />
        Comfortable and symptom-free practice
      </label>
      <label className="mm-field">
        <span>One coach note / what I learned (optional)</span>
        <textarea
          maxLength={600}
          value={log.note}
          onChange={(e) => p.onEdit({ note: e.target.value })}
        />
      </label>
      <details className="mm-disclosure">
        <summary>More feedback</summary>
        <label className="mm-field">
          <span>Enjoyable / would return?</span>
          <select
            value={log.enjoyment}
            onChange={(e) =>
              p.onEdit({
                enjoyment: e.target.value as ActivityLog["enjoyment"],
              })
            }
          >
            <option value="">Not recorded</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="mm-check">
          <input
            type="checkbox"
            checked={log.prepared}
            onChange={(e) => p.onEdit({ prepared: e.target.checked })}
          />
          I prepared clothes / equipment beforehand
        </label>
        <div className="mm-fields">
          {(
            [
              ["energy", ["low", "normal", "good"]],
              ["sleep", ["poor", "okay", "good"]],
              ["soreness", ["none", "mild", "significant"]],
              ["pain", ["none", "mild", "concerning"]],
            ] as const
          ).map(([key, options]) => (
            <label className="mm-field" key={key}>
              <span>{key}</span>
              <select
                value={log.readiness[key] ?? ""}
                onChange={(e) => p.onReadiness({ [key]: e.target.value })}
              >
                <option value="">Not recorded</option>
                {options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="mm-check">
          <input
            type="checkbox"
            checked={log.readiness.dizzy ?? false}
            onChange={(e) => p.onReadiness({ dizzy: e.target.checked })}
          />
          Dizziness or near-fainting symptoms
        </label>
      </details>
    </details>
  );

  return (
    <section
      className={"mm-session " + plan.activity}
      ref={surface}
      tabIndex={-1}
      aria-label="Daily session"
    >
      <header className="mm-session-heading mm-one-thing">
        <div className="mm-row">
          <small>{p.label}</small>
          {p.slot.date !== p.today && (
            <button
              type="button"
              className="mm-text-button"
              onClick={p.onToday}
            >
              Back to today
            </button>
          )}
        </div>
        <div className="mm-section-title">
          {isStrength(plan.activity) ? (
            <Dumbbell />
          ) : plan.activity === "boxing" ? (
            <HeartHandshake />
          ) : plan.activity === "recovery" ? (
            <Pause />
          ) : (
            <Footprints />
          )}
          <h2>{plan.title}</h2>
        </div>
        <p className="mm-session-meta">
          {plan.minutes}
          {plan.minutes.includes("planning") ? "" : " min"}
          {isStrength(plan.activity)
            ? " / " + ids.length + " movements"
            : " / " +
              (plan.activity === "recovery" || plan.activity === "review"
                ? "No workout required"
                : "Easy effort")}
        </p>
      </header>
      {blocked ? (
        <div className="mm-band">
          <p className="mm-callout">{plan.gate}</p>
          <ol>
            {plan.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          <nav className="mm-stepper" aria-label="Session steps">
            {steps.map((s, i) => (
              <button
                type="button"
                key={s}
                disabled={Boolean(log.outcome) && s !== "finish"}
                aria-current={
                  step === s || (step === "saved" && s === "finish")
                    ? "step"
                    : undefined
                }
                onClick={() => moveTo(log.outcome ? "saved" : s)}
              >
                {step === "saved" && s === "finish" ? (
                  <Check size={16} />
                ) : (
                  <span className="mm-step-index" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
                {stepLabels[s]}
              </button>
            ))}
          </nav>
          <div className="mm-step-content" data-step={step}>
            {step === "plan" && (
              <>
                <h3>Today's plan</h3>
                <ol className="mm-plan-steps">
                  {plan.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <p className="mm-session-goal">
                  <strong>Aim for</strong>
                  {plan.enough}
                </p>
                {plan.modifiedReason && (
                  <p className="mm-callout">{plan.modifiedReason}</p>
                )}
                <div className="mm-flow-actions">
                  <button
                    className="mm-primary"
                    type="button"
                    onClick={() => moveTo("practice")}
                  >
                    Begin session <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    className="mm-text-button"
                    onClick={() => {
                      moveTo("finish");
                      setOutcome("missed");
                    }}
                  >
                    Skip session
                  </button>
                </div>
                <details className="mm-disclosure">
                  <summary>Smaller option & preparation</summary>
                  <p>{plan.minimum}</p>
                  <p>{plan.task}</p>
                </details>
              </>
            )}
            {step === "practice" && (
              <>
                {isStrength(plan.activity) && ids.length > 0 ? (
                  <>
                    <div className="mm-movement-position">
                      <span>
                        Movement {index + 1} of {ids.length}
                      </span>
                      <span>
                        {done}/{sets.length} sets done
                      </span>
                    </div>
                    <p className="mm-muted">
                      Warm up gently for 3-5 minutes. Use an easy load and rest
                      90-180 seconds between movements.
                    </p>
                    {p.exercise(ids[index])}
                    <div className="mm-flow-actions">
                      <button
                        type="button"
                        aria-label="Previous movement"
                        disabled={index === 0}
                        onClick={() => {
                          setMovement(index - 1);
                          focusSurface();
                        }}
                      >
                        <ChevronLeft size={20} />
                      </button>
                      {index < ids.length - 1 ? (
                        <button
                          type="button"
                          className="mm-primary"
                          onClick={() => {
                            setMovement(index + 1);
                            focusSurface();
                          }}
                        >
                          Next movement <ChevronRight size={18} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mm-primary"
                          onClick={() => moveTo("finish")}
                        >
                          Review session <ArrowRight size={18} />
                        </button>
                      )}
                    </div>
                    <button
                      className="mm-text-button"
                      type="button"
                      onClick={() => moveTo("finish")}
                    >
                      Finish with what I did
                    </button>
                  </>
                ) : (
                  <>
                    <h3>
                      {plan.activity === "boxing"
                        ? "Your class"
                        : plan.activity === "walk"
                          ? "Your walk"
                          : "Recovery & preparation"}
                    </h3>
                    <ol className="mm-plan-steps">
                      {plan.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                    {plan.activity === "boxing" && (
                      <p className="mm-session-goal">
                        <strong>Technique focus</strong>
                        {p.skills.join(" / ")}
                      </p>
                    )}
                    <p>{plan.task}</p>
                    <div className="mm-flow-actions">
                      <button
                        type="button"
                        className="mm-primary"
                        onClick={() => moveTo("finish")}
                      >
                        Record session <ArrowRight size={18} />
                      </button>
                      <button
                        type="button"
                        className="mm-text-button"
                        onClick={() => moveTo("plan")}
                      >
                        <ArrowLeft size={16} /> Plan
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {step === "finish" && (
              <>
                <h3>Record your session</h3>
                {sets.length > 0 && (
                  <p>
                    {done} of {sets.length} sets marked done.
                  </p>
                )}
                <fieldset className="mm-result-options">
                  <legend>Result</legend>
                  {(
                    [
                      ["planned", "Completed as planned"],
                      ["modified", "Smaller version"],
                      ["missed", "Did not do it"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={outcome === value ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="session-result"
                        value={value}
                        checked={outcome === value}
                        onChange={() => setOutcome(value)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {outcome !== "missed" && (
                  <>
                    {plan.activity === "boxing" && (
                      <label className="mm-check">
                        <input
                          type="checkbox"
                          checked={log.observed}
                          onChange={(e) => {
                            p.onEdit({ observed: e.target.checked });
                            if (e.target.checked) setOutcome("modified");
                          }}
                        />
                        I attended and observed instead of participating
                      </label>
                    )}
                    {(plan.activity === "walk" ||
                      (plan.activity === "boxing" && !log.observed)) && (
                      <label className="mm-field">
                        <span>Minutes completed</span>
                        <input
                          inputMode="numeric"
                          value={log.minutes}
                          onChange={(e) =>
                            p.onEdit({ minutes: e.target.value })
                          }
                        />
                      </label>
                    )}
                  </>
                )}
                {outcome === "missed" && (
                  <label className="mm-field">
                    <span>Reason (optional)</span>
                    <select
                      value={log.reason}
                      onChange={(e) => p.onEdit({ reason: e.target.value })}
                    >
                      <option value="">Not added</option>
                      {[
                        "Too tired",
                        "No time",
                        "Forgot",
                        "Work",
                        "Transportation",
                        "Class unavailable",
                        "Pain or symptoms",
                        "Other",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
                <details className="mm-disclosure">
                  <summary>Change attendance date</summary>
                  <label className="mm-field">
                    <span>Date actually attended / done</span>
                    <input
                      type="date"
                      min={p.start}
                      max={p.today}
                      value={log.performedOn ?? p.slot.date}
                      onChange={(e) =>
                        p.onEdit({ performedOn: e.target.value })
                      }
                    />
                  </label>
                </details>
                {feedback}
                <div className="mm-flow-actions">
                  <button
                    type="button"
                    className="mm-primary"
                    onClick={() => save(outcome)}
                  >
                    <Check size={18} /> Save result
                  </button>
                  <button
                    type="button"
                    className="mm-text-button"
                    onClick={() => moveTo("practice")}
                  >
                    <ArrowLeft size={16} /> Session
                  </button>
                </div>
                <button
                  type="button"
                  className="mm-text-button mm-stop-button"
                  onClick={() => save("stopped")}
                >
                  <ShieldAlert size={16} /> Stop session
                </button>
              </>
            )}
            {step === "saved" && (
              <>
                <div
                  className={"mm-session-result " + (log.outcome ?? "")}
                  role="status"
                >
                  {log.outcome === "planned" || log.outcome === "modified" ? (
                    <CheckCircle2 size={32} />
                  ) : (
                    <Pause size={32} />
                  )}
                  <h3>
                    {log.outcome === "planned"
                      ? "Session completed"
                      : log.outcome === "modified"
                        ? "Smaller session recorded"
                        : log.outcome === "stopped"
                          ? "Session stopped"
                          : "Day recorded as skipped"}
                  </h3>
                  <p>
                    {log.outcome === "planned" || log.outcome === "modified"
                      ? (sets.length > 0
                          ? done +
                            (done === 1
                              ? " set recorded. "
                              : " sets recorded. ")
                          : log.minutes
                            ? log.minutes + " minutes recorded. "
                            : "Recovery recorded. ") + "You're done for today."
                      : "No catch-up session has been added."}
                  </p>
                </div>
                <div className="mm-flow-actions">
                  <button
                    type="button"
                    onClick={() => {
                      p.onEdit({ outcome: undefined });
                      moveTo("finish");
                    }}
                  >
                    Edit result
                  </button>
                </div>
                {feedback}
                {p.review && (
                  <details className="mm-disclosure">
                    <summary>Weekly check-in</summary>
                    {p.review}
                  </details>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
