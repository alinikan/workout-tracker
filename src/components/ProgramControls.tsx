import { useRef, useState } from "react";
import { ArrowUpRight, Check, RotateCcw, ShieldCheck, X } from "lucide-react";

/** Presentation only: the parent owns the reset transaction and cloud status. */
export function ProgramControls({ today, disabled, signedIn, pending, error, onReset }: {
  today: string;
  disabled: boolean;
  signedIn: boolean;
  pending: boolean;
  error: string;
  onReset: (startedOn: string) => boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [startedOn, setStartedOn] = useState(today);
  const [confirmation, setConfirmation] = useState("");
  const open = () => {
    setStartedOn(today);
    setConfirmation("");
    // Native modal dialogs handle focus containment, Escape, inert background,
    // and focus restoration in both Safari and installed iPhone web apps.
    dialog.current?.showModal();
  };

  return (
    <section className="program-controls" aria-labelledby="program-controls-title">
      <div>
        <p className="eyebrow">Your plan, your pace</p>
        <h2 id="program-controls-title">Need a fresh start?</h2>
        <p>A break doesn&apos;t erase your earned level. Restart only when you want a clean slate.</p>
      </div>
      <button className="restart-plan-button" type="button" disabled={disabled} onClick={open}>
        <RotateCcw size={18} aria-hidden="true" /> Start fresh
      </button>
      {pending && <p className="reset-sync-notice" role="status">Fresh start saved on this device. Waiting for cloud sync before it reaches your other devices.</p>}
      <dialog ref={dialog} className="reset-dialog" aria-labelledby="reset-dialog-title" onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
        }
      }}>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (confirmation === "RESET" && startedOn >= today && onReset(startedOn)) dialog.current?.close();
        }}>
          <header>
            <span className="reset-dialog-symbol"><RotateCcw size={22} aria-hidden="true" /></span>
            <button type="button" className="reset-close" aria-label="Close restart confirmation" onClick={() => dialog.current?.close()}><X size={20} /></button>
          </header>
          <p className="eyebrow">Restart your program</p>
          <h2 id="reset-dialog-title">A clean slate. Same account.</h2>
          <p>This permanently clears workout sets, skips, swaps, meal tracking, weigh-ins, notes, achievements, and nutrition settings. Your training returns to Week 1.</p>
          <p className="reset-account-note"><ShieldCheck size={18} aria-hidden="true" /> {signedIn ? "You stay signed in. The reset replaces this account's progress on all updated devices once synced." : "Your local progress resets. Sign in to sync the fresh start across devices."}</p>
          <label>New start date<input type="date" value={startedOn} min={today} required onChange={(event) => setStartedOn(event.target.value)} /></label>
          <label>Type RESET to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="RESET" /></label>
          {error && <p role="alert" className="reset-error">{error}</p>}
          <footer>
            <button type="button" onClick={() => dialog.current?.close()}>Keep my progress</button>
            <button className="reset-confirm" type="submit" disabled={disabled || confirmation !== "RESET" || startedOn < today}>Reset &amp; start fresh</button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

export function TrainingJourney({ week, credits, inWeek, complete, startedOn, onContinue }: {
  week: number;
  credits: number;
  inWeek: number;
  complete: boolean;
  startedOn: string;
  onContinue: () => void;
}) {
  return (
    <section className="training-journey" aria-labelledby="training-journey-title">
      <div className="journey-heading">
        <div><p className="eyebrow">Earned progress · no expiry</p><h2 id="training-journey-title">{complete ? "26 training weeks earned" : `Training Week ${week} of 26`}</h2></div>
        <button type="button" onClick={onContinue} aria-label="Open today's workout"><ArrowUpRight size={21} aria-hidden="true" /></button>
      </div>
      <div className="journey-session-rail" aria-label={`${inWeek} of 3 lifting sessions earned in this training week`}>
        {[0, 1, 2].map((index) => <span key={index} className={index < inWeek ? "earned" : ""}>{index < inWeek ? <Check size={16} aria-hidden="true" /> : index + 1}<small>{index < inWeek ? "Earned" : "To earn"}</small></span>)}
      </div>
      <div className="journey-meta"><strong>{Math.min(credits, 78)} / 78 lifts</strong><span>Started {startedOn}</span></div>
      <div className="journey-track" role="progressbar" aria-label="Earned six-month training progress" aria-valuenow={Math.min(credits, 78)} aria-valuemin={0} aria-valuemax={78}><span style={{ width: `${Math.min(100, credits / 78 * 100)}%` }} /></div>
      <p>{complete ? "Keep training at your current level, or start a new program when you're ready." : "Every 3 completed lifting sessions earns a week. Missed days hold your level, not your place."}</p>
    </section>
  );
}
