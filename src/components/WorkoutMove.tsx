import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Circle,
  SkipForward,
  Video,
} from "lucide-react";

type Props = {
  id: string;
  family: string;
  index: number;
  name: string;
  target: string;
  location: string;
  done: number;
  total: number;
  expanded: boolean;
  complete: boolean;
  skipped: boolean;
  next: boolean;
  disabled?: boolean;
  original?: string;
  thumbnail?: string;
  canSwap: boolean;
  onExpand: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onDetails: () => void;
  onSwap: () => void;
  onRevert: () => void;
  children: ReactNode;
};

/** A movement owns its header, actions and expanded log in normal document flow.
 * It never positions controls over other rows, and it owns no saved fitness data. */
export function WorkoutMove(p: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [p.thumbnail]);
  return (
    <article
      id={`today-move-${p.id}`}
      className={`move-item workout-entry ${p.family} ${p.expanded ? "expanded" : ""} ${p.complete ? "complete" : ""} ${p.skipped ? "skipped" : ""} ${p.next ? "next-up" : ""}`}
    >
      <div className="entry-heading">
        <button
          type="button"
          className="entry-thumbnail"
          onClick={p.onDetails}
          aria-label={`Technique: ${p.name}`}
          title={`Watch ${p.name}`}
        >
          {p.thumbnail && !imageFailed ? (
            <img
              src={p.thumbnail}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Video size={22} aria-hidden="true" />
          )}
        </button>
        <button
          className="move-main-button"
          type="button"
          onClick={p.onExpand}
          aria-expanded={p.expanded}
          aria-controls={`inline-log-${p.id}`}
        >
          <span className="entry-position">
            {p.next && !p.complete ? "Up next" : `Movement ${p.index + 1}`}{" "}
            <span>· {p.location}</span>
          </span>
          <strong>{p.name}</strong>
          <span className="entry-prescription">
            {p.total} {p.total === 1 ? "set" : "sets"} · {p.target.split(";")[0]}
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <button
          className="move-check-button"
          type="button"
          onClick={p.onComplete}
          disabled={p.disabled}
          aria-label={`${p.complete ? "Reopen" : "Complete"} movement ${p.index + 1}: ${p.name}`}
          title={
            p.complete ? "Mark movement incomplete" : "Mark movement complete"
          }
        >
          <span className="move-check-indicator">
            {p.complete ? <Check size={20} /> : <Circle size={22} />}
          </span>
        </button>
      </div>
      <div className="entry-status">
        <span>
          {p.skipped
            ? "Skipped"
            : p.complete
              ? "Completed"
              : `${p.done}/${p.total} sets recorded`}
        </span>
        <div className="entry-progress" aria-hidden="true">
          <i style={{ width: `${(100 * p.done) / Math.max(p.total, 1)}%` }} />
        </div>
      </div>
      {p.original && (
        <div className="entry-swap-state">
          <span>Swap version · Original: {p.original}</span>
          <button type="button" className="move-revert-button" onClick={p.onRevert}>
            Revert to original
          </button>
        </div>
      )}
      <div className="move-actions">
        <button
          type="button"
          className="move-detail-button"
          onClick={p.onDetails}
        >
          <Video size={16} /> Details
        </button>
        {p.canSwap && (
          <button
            type="button"
            className="entry-swap-button"
            onClick={p.onSwap}
          >
            <ArrowLeftRight size={16} /> Swap
          </button>
        )}
        <button type="button" className="move-skip-button" onClick={p.onSkip}>
          <SkipForward size={15} />
          {p.skipped ? "Reopen" : "Skip"}
        </button>
      </div>
      {p.expanded && p.children}
    </article>
  );
}
