import { useId, useState } from "react";
import { CalendarDays, Check, Dumbbell, Save } from "lucide-react";
import { addDays } from "../momentum/plan";
import {
  applyCoachChoice,
  cancelPendingAlternatingSwitch,
  homeRhythmChoice,
  choiceForDate,
  coachActivity,
  saveCoachChoice,
  pendingAlternatingSwitch,
  type CoachSchedule,
  type ClassChoice,
} from "./plan";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const label = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
type DaySummary = {
  date: string;
  title: string;
  kind: string;
  complete: boolean;
  skipped: boolean;
};

/** Planning lives here; attendance lives in Today/Gym. Drafts do not change
 * food or workouts until Save, and the preview calls the same pure planner. */
export default function CoachPlan({
  state,
  start,
  today,
  days,
  completedLifts,
  completedClasses,
  disabled,
  onSave,
  onOpenDay,
  previewFor,
}: {
  state: CoachSchedule;
  start: string;
  today: string;
  days: DaySummary[];
  completedLifts: number;
  completedClasses: number;
  disabled: boolean;
  onSave: (state: CoachSchedule) => void;
  onOpenDay: (date: string) => void;
  previewFor?: (
    state: CoachSchedule,
    from: string,
  ) => Array<Pick<DaySummary, "date" | "title">>;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const first = today > start ? today : start;
  const current = choiceForDate(state, first);
  const homeRhythm = homeRhythmChoice(state, first)?.rhythm;
  const pending = pendingAlternatingSwitch(state, first);
  const activeRhythm =
    homeRhythm?.kind === "every-other-day" ? homeRhythm : null;
  const [alternating, setAlternating] = useState(false);
  const [rhythmAnchor, setRhythmAnchor] = useState(first);
  const [draft, setDraft] = useState<
    Omit<ClassChoice, "id" | "updatedAt" | "effectiveOn">
  >({
    mode: "home",
    date: "",
    time: "",
    weekdays: [3],
    minutes: 60,
    stage: "introduction",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const begin = () => {
    setAlternating(Boolean(activeRhythm || pending));
    setRhythmAnchor(pending?.effectiveOn ?? activeRhythm?.anchor ?? first);
    setDraft(
      current && !pending
        ? {
            mode: current.mode,
            date: current.date,
            time: current.time,
            weekdays: current.weekdays.length ? current.weekdays : [3],
            minutes: current.minutes,
            stage: current.stage,
          }
        : {
            mode: "home",
            date: "",
            time: "",
            weekdays: [3],
            minutes: 60,
            stage: "introduction",
          },
    );
    setEditing(true);
    setError("");
    setSaved(false);
  };
  const commit = () => {
    try {
      const next = saveCoachChoice(draftState, choiceInput, today, start);
      onSave(next);
      setEditing(false);
      setError("");
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // Saving the same cadence (e.g. returning from a trial) must not discard
  // an earned stage. Class choices have no cadence field and inherit it.
  const rhythm: ClassChoice["rhythm"] =
    draft.mode !== "home"
      ? undefined
      : alternating
        ? activeRhythm?.anchor === rhythmAnchor
          ? undefined
          : { kind: "every-other-day", anchor: rhythmAnchor }
        : activeRhythm
          ? { kind: "twice-weekly" }
          : undefined;
  const choiceInput = {
    ...draft,
    rhythm,
    date: draft.mode === "home" ? "" : draft.date,
    weekdays: draft.mode === "regular" ? draft.weekdays : [],
  };
  const draftState =
    pending && draft.mode === "home" && !rhythm
      ? cancelPendingAlternatingSwitch(state, first)
      : state;
  const previewFrom =
    draft.mode === "home" && alternating && rhythmAnchor > first
      ? rhythmAnchor
      : first;
  const preview = (() => {
    if (!editing) return null;
    try {
      return applyCoachChoice(draftState, choiceInput, first, start, {
        id: "preview",
        updatedAt: new Date(
          Math.max(
            0,
            ...Object.values(state.choices).map(
              (c) => Date.parse(c.updatedAt) + 1,
            ),
          ),
        ).toISOString(),
      });
    } catch {
      return null;
    }
  })();
  const previewDays = preview
    ? (previewFor?.(preview, previewFrom) ??
      Array.from({ length: 7 }, (_, n) => addDays(previewFrom, n)).map(
        (date) => ({
          date,
          title: coachActivity(preview, start, date).title,
        }),
      ))
    : [];
  return (
    <section className="coach-plan" aria-labelledby={`${id}-heading`}>
      <header className="coach-plan-heading">
        <div>
          <p className="eyebrow">One connected plan</p>
          <h2 id={`${id}-heading`}>Training & Muay Thai</h2>
        </div>
        <CalendarDays size={24} aria-hidden="true" />
      </header>
      <p>
        {current?.mode === "regular"
          ? `${current.weekdays.map((n) => weekdays[n]).join(" & ")} · from ${label(current.date)}${current.time ? ` at ${current.time}` : ""}`
          : current?.mode === "trial"
            ? `One trial · ${label(current.date)}${current.time ? ` at ${current.time}` : ""}`
            : activeRhythm
              ? `Home gym every other day · rhythm from ${label(activeRhythm.anchor)}`
              : state.homeFrom
                ? "Home training, easy movement and recovery. No classes assumed."
                : "Your existing workout plan continues. Choose a setup to use home training or add Muay Thai."}
      </p>
      {pending && !editing && (
        <div className="coach-schedule-preview">
          <h3>Switch scheduled for {label(pending.effectiveOn)}</h3>
          <p>Your current plan stays in place until then.</p>
          <div className="coach-plan-actions">
            <button
              className="secondary"
              type="button"
              onClick={begin}
              disabled={disabled}
            >
              Reschedule
            </button>
            <button
              className="secondary"
              type="button"
              disabled={disabled}
              onClick={() => {
                try {
                  onSave(cancelPendingAlternatingSwitch(state, first));
                  setSaved(false);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Cancel scheduled switch
            </button>
          </div>
        </div>
      )}
      <dl className="coach-plan-counts">
        <div>
          <dt>Completed lifts</dt>
          <dd>{completedLifts}</dd>
        </div>
        <div>
          <dt>Classes attended</dt>
          <dd>{completedClasses}</dd>
        </div>
      </dl>
      <p className="coach-plan-muted">
        Rest days are planned recovery, not workout attendance.
      </p>
      {!editing ? (
        <button
          className="secondary"
          type="button"
          onClick={begin}
          disabled={disabled}
        >
          <CalendarDays size={17} aria-hidden="true" /> Change training schedule
        </button>
      ) : (
        <form
          className="coach-plan-editor"
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
        >
          <label>
            Training setup
            <select
              aria-label="Training setup"
              value={
                draft.mode === "home" && alternating
                  ? "alternating"
                  : draft.mode
              }
              onChange={(event) => {
                const setup = event.target.value;
                setAlternating(setup === "alternating");
                setDraft({
                  ...draft,
                  mode:
                    setup === "alternating"
                      ? "home"
                      : (setup as ClassChoice["mode"]),
                });
                setError("");
              }}
            >
              <option value="home">Home gym only</option>
              <option value="alternating">Home gym every other day</option>
              <option value="trial">One Muay Thai trial</option>
              <option value="regular">Weekly Muay Thai classes</option>
            </select>
          </label>
          {draft.mode === "home" && alternating && (
            <label>
              Switch to every other day on
              <input
                type="date"
                aria-label="Switch to every other day on"
                min={start}
                max={addDays(first, 365)}
                value={rhythmAnchor}
                required
                onChange={(event) => setRhythmAnchor(event.target.value)}
              />
            </label>
          )}
          {draft.mode !== "home" && (
            <>
              <label>
                {draft.mode === "trial" ? "Trial date" : "Classes start on"}
                <input
                  type="date"
                  min={first}
                  value={draft.date}
                  required
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label>
                Class time (optional)
                <input
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </label>
              <label>
                Class duration (minutes)
                <input
                  type="number"
                  min={15}
                  max={90}
                  step={5}
                  value={draft.minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, minutes: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Class level
                <select
                  aria-label="Class level"
                  value={draft.stage}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stage: e.target.value as ClassChoice["stage"],
                    })
                  }
                >
                  <option value="introduction">Introduction</option>
                  <option value="beginner">Beginners / Intermediate</option>
                </select>
              </label>
              {draft.mode === "regular" && (
                <fieldset>
                  <legend>Weekly class days · choose 1 or 2</legend>
                  <div className="coach-class-days">
                    {weekdays.map((day, n) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={draft.weekdays.includes(n)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              weekdays: e.target.checked
                                ? [...draft.weekdays, n].sort()
                                : draft.weekdays.filter((v) => v !== n),
                            })
                          }
                        />
                        <span>{day.slice(0, 3)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <p className="coach-plan-muted">
                Confirm these details with Titan. This does not book a class.
                Take breaks in class; the full class duration is not a target
                for hard exercise.
              </p>
            </>
          )}
          {preview && (
            <div className="coach-schedule-preview">
              <h3>
                {previewFrom > first
                  ? `First 7 days from ${label(previewFrom)}`
                  : "Next 7 days"}
              </h3>
              {previewFrom > first && (
                <p>
                  Your current plan stays in place until {label(previewFrom)}.
                </p>
              )}
              <ol>
                {previewDays.map(({ date, title }) => (
                  <li key={date}>
                    <span>{label(date)}</span>
                    <strong>{title}</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="coach-plan-muted">
            Classes replace home work and the days around them stay light. No
            make-up workouts. Choosing an earlier rhythm date never rewrites
            prior days. Already-cooked food and recorded workouts stay
            unchanged.
          </p>
          {draft.mode === "home" &&
            (current?.mode === "regular" ||
              (current?.mode === "trial" && current.date >= today)) && (
              <p className="coach-plan-muted">
                Upcoming classes stay in this planner until the switch date. A
                home-only setup does not cancel a booking at the gym.
              </p>
            )}
          <div className="coach-plan-actions">
            <button type="submit" disabled={disabled}>
              <Save size={17} aria-hidden="true" /> Save schedule
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && (
        <p role="status" className="coach-plan-saved">
          <Check size={16} aria-hidden="true" /> Schedule saved.
        </p>
      )}
      <details className="coach-plan-upcoming">
        <summary>Upcoming 7 days</summary>
        <ol className="coach-plan-week" aria-label="Upcoming training">
          {days.map((day) => (
            <li key={day.date}>
              <button type="button" onClick={() => onOpenDay(day.date)}>
                <span>{label(day.date)}</span>
                <strong>{day.title}</strong>
                <small>
                  {day.kind === "recovery"
                    ? "Rest · automatic"
                    : day.complete
                      ? "Completed"
                      : day.skipped
                        ? "Skipped"
                        : "View day"}
                </small>
              </button>
            </li>
          ))}
        </ol>
      </details>
      <details className="coach-plan-rules">
        <summary>
          <Dumbbell size={16} aria-hidden="true" /> How your plan adapts
        </summary>
        <p>
          Strength targets advance from completed lifts, not weeks that passed.
          Easy or reduced sessions remain available. Adding class days does not
          automatically earn harder lifts or estimate calories burned in class.
          Your existing nutrition profile, weigh-ins and food check-ins still
          govern calorie adjustments.
        </p>
        {activeRhythm && (
          <p>
            Gym visits alternate with recovery days. After 6, 12 and 20
            qualifying home sessions, new work unlocks. Log actual reps or hold
            time and how each working set felt, plus pounds for weighted moves.
            A break of more than three weeks restarts the lighter progression
            without removing your records.
          </p>
        )}
      </details>
    </section>
  );
}
