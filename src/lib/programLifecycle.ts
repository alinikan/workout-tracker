/**
 * A program has a start date, not an expiry date. The calendar can grow while the
 * exercise model retains its 26 earned training levels. A reset creates a new
 * generation so another device cannot merge the old history into the new plan.
 */
export type ProgramState = {
  startedOn: string;
  resetId: string;
  resetAt: string | null;
};

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function initialProgram(startedOn: string): ProgramState {
  return { startedOn, resetId: "initial", resetAt: null };
}

export function normalizeProgram(value: unknown, fallback: string): ProgramState {
  const saved = value && typeof value === "object" ? value as Partial<ProgramState> : {};
  const resetAt = typeof saved.resetAt === "string" && Number.isFinite(Date.parse(saved.resetAt))
    ? new Date(saved.resetAt).toISOString() : null;
  return {
    startedOn: isCalendarDate(saved.startedOn) ? saved.startedOn : fallback,
    resetId: resetAt && typeof saved.resetId === "string" && saved.resetId.length > 0
      ? saved.resetId : "initial",
    resetAt,
  };
}

export function restartedProgram(previous: ProgramState, startedOn: string, now = new Date()): ProgramState {
  if (!isCalendarDate(startedOn)) throw new Error("Choose a valid start date.");
  // A monotonic timestamp also works when this device's clock moved backwards.
  const timestamp = Math.max(now.getTime(), previous.resetAt ? Date.parse(previous.resetAt) + 1 : 0);
  return {
    startedOn,
    // This ID is an ordering marker, not an authentication secret. randomUUID
    // needs HTTPS; the fallback keeps Mac-to-iPhone HTTP development usable.
    resetId: typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID()
      : `${timestamp.toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    resetAt: new Date(timestamp).toISOString(),
  };
}

type ProgressDocument = { program?: Partial<ProgramState>; days: unknown; metrics: unknown };
function isProgressDocument(value: unknown): value is ProgressDocument {
  return Boolean(value && typeof value === "object" && "days" in value && "metrics" in value);
}

/** Return one whole document when generations differ; never merge across a reset. */
export function resolveResetConflict<T>(_base: T | undefined, local: T, remote: T): T | undefined {
  if (!isProgressDocument(local) || !isProgressDocument(remote)) return undefined;
  const generation = (value: ProgressDocument) => value.program?.resetId ?? "initial";
  const localId = generation(local);
  const remoteId = generation(remote);
  if (localId === remoteId) return undefined;
  // Two offline resets converge deterministically. The newer reset wins; the ID
  // breaks a timestamp tie, so devices cannot keep replacing one another.
  const timestamp = (value: ProgressDocument) => {
    const parsed = Date.parse(value.program?.resetAt ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const difference = timestamp(local) - timestamp(remote);
  // Compare numeric timestamps first: a legacy null timestamp must always rank
  // below a reset. Also reject an old generation even when it differs from the
  // baseline (for example, an outdated app overwrote the server with old data).
  return difference === 0 ? (localId > remoteId ? local : remote) : difference > 0 ? local : remote;
}
