import { Check, Cloud, CloudOff, LoaderCircle, Undo2, X } from "lucide-react";
import type { SavePresentation } from "../lib/presentationState";

/** Controlled tabs share keyboard behavior across recipe and exercise panels.
 * Arrow/Home/End keys move focus and selection together; inactive panels are
 * unmounted by their owner so hidden media never keeps playing. */
export function SectionTabs<T extends string>({ id, label, tabs, value, onChange }: {
  id: string; label: string; tabs: Array<{ id: T; label: string }>;
  value: T; onChange: (value: T) => void;
}) {
  return <div className="session-section-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.id} id={`${id}-tab-${tab.id}`}
      type="button" role="tab" aria-selected={value === tab.id}
      aria-controls={`${id}-panel-${tab.id}`} tabIndex={value === tab.id ? 0 : -1}
      onClick={() => onChange(tab.id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length :
          event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length :
          event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        onChange(tabs[next].id);
        // Selecting a shorter panel must not scroll the page again after the
        // browser has already brought this tab strip into view.
        document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus({ preventScroll: true });
      }}>{tab.label}</button>)}
  </div>;
}

/** The same quiet save indicator appears in each area, including the installed
 * iPhone app where the desktop product header is intentionally hidden. */
export function DeviceSaveStatus({ status }: { status: SavePresentation }) {
  const Symbol = status.tone === "working" ? LoaderCircle : status.tone === "attention" ? CloudOff : Cloud;
  return <div className={`device-save-status ${status.tone}`} role="status" title={status.detail}>
    <Symbol size={14} aria-hidden="true" />
    <span><strong>{status.label}</strong><small>{status.detail}</small></span>
  </div>;
}

/** Undo is an explicit, dismissible action, not an auto-disappearing target.
 * The owning app clears it on date, reset, or account changes. */
export function UndoNotice({ label, onUndo, onDismiss }: {
  label: string; onUndo: () => void; onDismiss: () => void;
}) {
  return <aside className="undo-notice" aria-label="Recent action">
    <span role="status"><Check size={16} aria-hidden="true" />{label}</span>
    <button type="button" onClick={onUndo}><Undo2 size={16} aria-hidden="true" /> Undo</button>
    <button type="button" onClick={onDismiss} aria-label="Dismiss undo"><X size={16} aria-hidden="true" /></button>
  </aside>;
}
