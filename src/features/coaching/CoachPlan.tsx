import { useId, useState } from "react";
import { CalendarDays, Check, Dumbbell, Save } from "lucide-react";
import { addDays } from "../momentum/plan";
import {
  choiceForDate,
  coachActivity,
  saveCoachChoice,
  validChoice,
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
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const current = choiceForDate(state, today > start ? today : start);
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
    setDraft(
      current
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
      const next = saveCoachChoice(
        state,
        {
          ...draft,
          date: draft.mode === "home" ? "" : draft.date,
          weekdays: draft.mode === "regular" ? draft.weekdays : [],
        },
        today,
        start,
      );
      onSave(next);
      setEditing(false);
      setError("");
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const first = today > start ? today : start;
  const previewChoice = {
    ...draft,
    date: draft.mode === "home" ? "" : draft.date,
    weekdays: draft.mode === "regular" ? draft.weekdays : [],
    id: "preview",
    effectiveOn: first,
    updatedAt: new Date(
      Math.max(
        0,
        ...Object.values(state.choices).map((c) => Date.parse(c.updatedAt) + 1),
      ),
    ).toISOString(),
  };
  const preview: CoachSchedule | null = validChoice(previewChoice)
    ? {
        ...state,
        homeFrom: state.homeFrom ?? first,
        choices: { ...state.choices, preview: previewChoice },
      }
    : null;
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
            : state.homeFrom
              ? "Home training, easy movement and recovery. No classes assumed."
              : "Your existing workout plan continues. Choose a setup to use home training or add Muay Thai."}
      </p>
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
        Sets completed in Today or Gym count here automatically. Rest days need
        no check-in.
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
              value={draft.mode}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  mode: event.target.value as ClassChoice["mode"],
                });
                setError("");
              }}
            >
              <option value="home">Home gym only</option>
              <option value="trial">One Muay Thai trial</option>
              <option value="regular">Weekly Muay Thai classes</option>
            </select>
          </label>
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
              <h3>Next 7 days</h3>
              <ol>
                {Array.from({ length: 7 }, (_, n) => addDays(first, n)).map(
                  (date) => (
                    <li key={date}>
                      <span>{label(date)}</span>
                      <strong>
                        {coachActivity(preview!, start, date).title}
                      </strong>
                    </li>
                  ),
                )}
              </ol>
            </div>
          )}
          <p className="coach-plan-muted">
            Classes replace home work. Nearby days stay light; at most two
            well-spaced home lifts fit around classes. No make-up workouts.
            Uncooked meal portions and your shopping list follow the new plan;
            cooked food and recorded workouts stay unchanged.
          </p>
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
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      {saved && (
        <p role="status" className="coach-plan-saved">
          <Check size={16} aria-hidden="true" /> Schedule updated. Today, Gym
          and Diet use this plan.
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
      </details>
    </section>
  );
}
