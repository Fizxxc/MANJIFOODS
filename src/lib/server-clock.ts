export type ClockSnapshot = Readonly<{
  now: number | null;
  synchronized: boolean;
}>;
export type ClockEvent = "resume" | "pause" | "online" | "offline";
export type ClockRuntime = {
  monotonicNow: () => number;
  wallNow: () => number;
  visible: () => boolean;
  online: () => boolean;
  requestTime: (signal: AbortSignal) => Promise<number>;
  listen: (listener: (event: ClockEvent) => void) => () => void;
};
export const INITIAL_CLOCK: ClockSnapshot = Object.freeze({
  now: null,
  synchronized: false,
});
export const CLOCK_SYNC_INTERVAL = 5 * 60 * 1000;
const MIN_SYNC_GAP = 5000;

// One shared store per browser tab. Timers only request a render; elapsed time
// comes from a monotonic anchor, never from counting interval callbacks.
export function createServerClock(runtime: ClockRuntime) {
  const listeners = new Set<() => void>();
  let snapshot = INITIAL_CLOCK;
  let anchor: { server: number; monotonic: number } | null = null;
  let observed: { wall: number; monotonic: number } | null = null;
  let confirmed = false;
  let invalid = false;
  let nextSync = 0;
  let lastAttempt = -Infinity;
  let failures = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unlisten: (() => void) | undefined;

  const getNow = () =>
    anchor && !invalid
      ? anchor.server + Math.max(0, runtime.monotonicNow() - anchor.monotonic)
      : null;
  const publish = () => {
    const now = getNow();
    const rounded = now === null ? null : Math.floor(now / 1000) * 1000;
    if (snapshot.now !== rounded || snapshot.synchronized !== confirmed) {
      snapshot = { now: rounded, synchronized: confirmed };
      listeners.forEach((listener) => listener());
    }
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clearTimer();
    if (!listeners.size || !runtime.visible()) return;
    const now = getNow();
    const delay = now === null ? 1000 : 1000 - (now % 1000);
    timer = setTimeout(tick, Math.max(1, Math.ceil(delay)));
  };
  const observe = () => {
    const monotonic = runtime.monotonicNow(),
      wall = runtime.wallNow();
    if (
      observed &&
      Math.abs(wall - observed.wall - (monotonic - observed.monotonic)) > 2000
    ) {
      // Some browsers pause performance.now during system sleep. A wall-clock
      // jump cannot tell sleep from a manual clock change: confirm with server.
      invalid = true;
      confirmed = false;
      nextSync = 0;
      lastAttempt = -Infinity;
    }
    observed = { monotonic, wall };
  };
  const synchronize = (requested = false): Promise<void> => {
    if (inFlight) return inFlight;
    const start = runtime.monotonicNow();
    if (requested && !confirmed && start - lastAttempt < MIN_SYNC_GAP) {
      // A real reconnection inside the cooldown must still get a sample soon,
      // rather than waiting for the normal five-minute refresh.
      nextSync = Math.min(nextSync, lastAttempt + MIN_SYNC_GAP);
    }
    if (
      !runtime.online() ||
      !runtime.visible() ||
      start - lastAttempt < MIN_SYNC_GAP ||
      (!requested && start < nextSync)
    )
      return Promise.resolve();
    lastAttempt = start;
    const wallStart = runtime.wallNow();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    inFlight = Promise.resolve().then(async () => {
      try {
        const serverTime = await runtime.requestTime(controller.signal);
        const end = runtime.monotonicNow();
        if (
          !Number.isSafeInteger(serverTime) ||
          serverTime < 0 ||
          serverTime > 8640000000000000 ||
          end - start > 8000 ||
          Math.abs(runtime.wallNow() - wallStart - (end - start)) > 2000 ||
          controller.signal.aborted
        )
          throw new Error("Invalid server time sample");
        // Server stamps immediately before responding. Half the round trip is
        // the best single-request estimate of the response's transit time.
        anchor = { server: serverTime + (end - start) / 2, monotonic: end };
        observed = { monotonic: end, wall: runtime.wallNow() };
        invalid = false;
        confirmed = runtime.online();
        failures = 0;
        nextSync = end + CLOCK_SYNC_INTERVAL;
      } catch {
        confirmed = false;
        failures++;
        nextSync =
          runtime.monotonicNow() +
          Math.min(CLOCK_SYNC_INTERVAL, 30000 * 2 ** Math.min(failures - 1, 4));
      } finally {
        clearTimeout(timeout);
        inFlight = null;
        publish();
        schedule();
      }
    });
    return inFlight;
  };
  function tick() {
    observe();
    publish();
    void synchronize();
    schedule();
  }
  const lifecycle = (event: ClockEvent) => {
    if (event === "pause") {
      clearTimer();
      return;
    }
    observe();
    if (event === "offline") confirmed = false;
    publish();
    if (event !== "offline") void synchronize(true);
    schedule();
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL_CLOCK,
    getNow,
    synchronize,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        unlisten = runtime.listen(lifecycle);
        tick();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearTimer();
          unlisten?.();
          unlisten = undefined;
          // Let an already-started, bounded request finish. Strict Mode's
          // immediate resubscription then shares it instead of issuing twice.
        }
      };
    },
  };
}
