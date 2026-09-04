/**
 * Bound auth/sync requests so a stalled connection cannot block the save queue
 * indefinitely. Forward the caller's abort signal as well, and always remove
 * listeners/timers after the request. No newer AbortSignal.any API is required.
 */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const originalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const forwardAbort = () => controller.abort(originalSignal?.reason);
  if (originalSignal?.aborted) forwardAbort();
  else originalSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Connection timed out. Your progress remains on this device; retry sync.")), 20_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    originalSignal?.removeEventListener("abort", forwardAbort);
  }
}
