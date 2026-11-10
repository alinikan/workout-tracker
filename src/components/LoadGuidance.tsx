import { Sparkles } from "lucide-react";

/** Advice is derived from recorded performance, never a command that changes a
 * weight field. Keeping a short action separate from the evidence makes the
 * next step readable while the longer reasoning stays available on demand. */
export type LoadRecommendation = {
  label: string;
  detail: string;
  tone: "steady" | "start" | "deload" | "build";
  action?: {
    kind: "increase" | "reps" | "confirm" | "new-set";
    instruction: string;
  };
};

export type MoveLoadGuidance = {
  recommendation: LoadRecommendation;
  nextWorkout: boolean;
  date: string;
};

/** Normal document flow avoids another floating panel over the iPhone inputs.
 * No autofocus, timers, saved acknowledgements or automatic exercise expansion:
 * changing a log updates this same advice on every device after sync. */
export function LoadGuidance({
  guidance,
  dateLabel,
}: {
  guidance: MoveLoadGuidance;
  dateLabel: string;
}) {
  const advice = guidance.recommendation;
  return (
    <section
      className={`move-load-guidance ${advice.tone}`}
      aria-label={
        guidance.nextWorkout
          ? "Next workout load guidance"
          : "Current workout load guidance"
      }
    >
      <div className="load-guidance-heading">
        <Sparkles size={17} aria-hidden="true" />
        <span>
          {guidance.nextWorkout ? "Next workout" : "For this workout"} ·{" "}
          {dateLabel}
        </span>
      </div>
      <strong>{advice.label}</strong>
      <p>{advice.action?.instruction ?? advice.detail}</p>
      {advice.action && (
        <details>
          <summary>Why this recommendation</summary>
          <p>{advice.detail}</p>
        </details>
      )}
    </section>
  );
}
