import { useState } from "react";
import { CalendarDays, Check, Flame } from "lucide-react";
import { currentJourney, sortedSlots, calendarWeekOf } from "./plan";
import { resolveDay } from "./coaching";
import { chooseTrial, hasActualWork, trialFor } from "./trial";
import { calendarText } from "./calendar";
import { isCalendarDate } from "../../lib/programLifecycle";
import type { MomentumData } from "./types";

const label = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** One appointment editor. Preview is derived; only Save commits a private
 * change. Existing activity and cooked-food snapshots are never rewritten. */
export default function TrialPanel({
  data,
  today,
  edit,
  close,
  workoutDates = [],
  recordedTrialDates = [],
}: {
  data: MomentumData;
  today: string;
  edit: (fn: (d: MomentumData) => MomentumData) => void;
  close: () => void;
  workoutDates?: string[];
  recordedTrialDates?: string[];
}) {
  const j = currentJourney(data)!,
    trial = trialFor(data),
    slots = sortedSlots(j);
  const [date, setDate] = useState(trial?.date ?? ""),
    [time, setTime] = useState(trial?.time ?? ""),
    [error, setError] = useState("");
  const locked = Boolean(
    trial &&
    (recordedTrialDates.includes(trial.date!) ||
      slots.some(
        (s) =>
          s.date === trial.date &&
          data.journeys[j.id].logs[s.id]?.outcome !== "missed" &&
          hasActualWork(j.logs[s.id]),
      )),
  );
  const anchor = slots.find((s) => s.date === date);
  const preview =
    anchor && isCalendarDate(date)
      ? {
          ...data,
          journeys: {
            ...data.journeys,
            [j.id]: {
              ...j,
              trial: {
                date,
                time,
                id: "preview",
                updatedAt: "2000-01-01T00:00:00Z",
              },
            },
          },
        }
      : null;
  const save = (chosen: string | null) => {
    try {
      if (chosen && chosen !== trial?.date && workoutDates.includes(chosen))
        throw new Error(
          "A workout is already recorded on this date. Choose a different trial date so you do not stack it on that workout.",
        );
      edit((d) => chooseTrial(d, chosen, time, today));
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="mm-trial-editor">
      <span className="mm-eyebrow">Titan Training Centre · one visit</span>
      <h3>
        {trial ? "Your trial appointment" : "Choose a trial when you are ready"}
      </h3>
      <p>
        Your home routine continues until you choose one confirmed trial date.
        This app does not book a class, buy a membership or schedule weekly
        classes.
      </p>
      <label className="mm-field">
        <span>Trial date</span>
        <input
          type="date"
          min={today > j.startedOn ? today : j.startedOn}
          max={slots.at(-1)?.date}
          value={date}
          disabled={locked}
          onChange={(e) => {
            setDate(e.target.value);
            setError("");
          }}
        />
      </label>
      <label className="mm-field">
        <span>Trial time (optional)</span>
        <input
          type="time"
          value={time}
          disabled={locked}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <p className="mm-muted">
        Confirm the date, time and room with the coach. Leave the time empty
        until you know it.
      </p>
      {preview && anchor && (
        <div className="mm-trial-preview">
          <h4>
            <CalendarDays size={18} /> Week {calendarWeekOf(j, anchor)} with
            your trial
          </h4>
          <p>
            Nearby lifts are replaced by easy movement or recovery, not squeezed
            into another day. Recorded sessions stay unchanged.
          </p>
          <ol>
            {slots
              .filter(
                (s) =>
                  Math.abs(
                    Date.parse(`${s.date}T12:00Z`) -
                      Date.parse(`${date}T12:00Z`),
                  ) <=
                    2 * 86400000 ||
                  calendarWeekOf(j, s) === calendarWeekOf(j, anchor),
              )
              .map((s) => {
                const plan = resolveDay(preview, s, today);
                return (
                  <li key={s.id} className={plan.activity}>
                    <span>{label(s.date)}</span>
                    <strong>{plan.title}</strong>
                    {s.date === date && (
                      <Flame size={16} aria-label="Trial day" />
                    )}
                  </li>
                );
              })}
          </ol>
          <p className="mm-context">
            Trial meals use the training-day portions in both Nutrition and
            Momentum. Cooked containers and meals already eaten stay unchanged;
            use your planned snack before class.
          </p>
        </div>
      )}
      {locked ? (
        <p className="mm-context">
          <Check size={16} /> This visit has an activity record. Your home plan
          continues; review your result before deciding on a longer-term class
          schedule.
        </p>
      ) : (
        <div className="mm-trial-actions">
          <button
            className="mm-primary"
            disabled={!date}
            onClick={() => save(date)}
          >
            Save trial date
          </button>
          {trial && (
            <button onClick={() => save(null)}>Remove trial date</button>
          )}
        </div>
      )}
      {trial?.time && (
        <button
          className="mm-text-button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [calendarText(trial.date!, trial.time, `${j.id}-${trial.id}`)],
                { type: "text/calendar" },
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "trial-appointment.ics";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download private calendar reminder
        </button>
      )}
      {error && (
        <p className="mm-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
