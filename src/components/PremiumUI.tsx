import type { CSSProperties, ReactNode } from "react";

/**
 * Small presentation primitives shared by the three product areas.
 *
 * These components deliberately know nothing about workouts, meals, Supabase, or
 * localStorage. Keeping them "dumb" lets the main application retain ownership
 * of all business behavior while the shell can evolve independently.
 */

export type ProductMode = "hub" | "workout" | "diet";

type ProductNavigationProps = {
  activeMode: ProductMode;
  statusLabel: string;
  statusTone?: "calm" | "working" | "attention";
  onSelect: (mode: ProductMode) => void;
};

const modeLabels: Array<{ id: ProductMode; label: string }> = [
  { id: "hub", label: "Coach" },
  { id: "workout", label: "Workout" },
  { id: "diet", label: "Nutrition" },
];

/** The stable level-one navigation used in Coach, Workout, and Nutrition. */
export function ProductNavigation({
  activeMode,
  statusLabel,
  statusTone = "calm",
  onSelect,
}: ProductNavigationProps) {
  return (
    <header className="product-navigation">
      <button
        className="product-identity"
        type="button"
        aria-label="Open Coach Hub"
        onClick={() => onSelect("hub")}
      >
        <span className="product-symbol" aria-hidden="true">R</span>
        <span>
          <strong>Recomp</strong>
          <small>Personal coaching</small>
        </span>
      </button>

      <nav className="product-mode-switcher" aria-label="Product areas">
        {modeLabels.map((mode) => (
          <button
            key={mode.id}
            className={activeMode === mode.id ? "active" : ""}
            type="button"
            aria-current={activeMode === mode.id ? "page" : undefined}
            onClick={() => onSelect(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </nav>

      <span className={`product-save-state ${statusTone}`} role="status">
        <i aria-hidden="true" />
        {statusLabel}
      </span>
    </header>
  );
}

type ProgressRingProps = {
  value: number;
  max: number;
  label: string;
  children?: ReactNode;
};

/**
 * A compact, accessible progress visual. The text label remains authoritative;
 * the SVG is only the visual treatment and never the sole status indicator.
 */
export function ProgressRing({ value, max, label, children }: ProgressRingProps) {
  const safeMax = Math.max(max, 1);
  const safeValue = Math.min(Math.max(value, 0), safeMax);
  const percent = Math.round((safeValue / safeMax) * 100);

  return (
    <span
      className="premium-progress-ring"
      style={{ "--ring-progress": percent } as CSSProperties}
      role="img"
      aria-label={`${label}: ${safeValue} of ${max}`}
    >
      <span aria-hidden="true">
        <strong>{safeValue}</strong>
        <small>/{max}</small>
      </span>
      {children}
    </span>
  );
}
