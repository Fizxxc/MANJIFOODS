import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createServerClock,
  INITIAL_CLOCK,
  CLOCK_SYNC_INTERVAL,
  type ClockEvent,
} from "../src/lib/server-clock";
import {
  formatDuration,
  formatWibTime,
  parseWibDateTime,
  wibDate,
  wibDateTimeInput,
} from "../src/lib/time";
import {
  availableSlot,
  commandSchema,
  dateTime,
  type Slot,
} from "../src/lib/domain";
import { WibClock, SessionTiming } from "../src/components/clock";
import { GET as timeEndpoint } from "../src/app/api/time/route";
import { serverClock } from "../src/hooks/use-server-clock";

const epoch = Date.parse("2026-10-30T02:30:00Z");
const slot: Slot = {
  id: "55555555-5555-4555-8555-555555555555",
  title: "Istirahat",
  starts_at: "2026-10-30T02:30:10Z",
  ends_at: "2026-10-30T02:50:10Z",
  cutoff_at: "2026-10-30T02:30:05.500Z",
  active: true,
  capacity: 30,
  reserved_count: 1,
};
function harness() {
  let visible = true,
    online = true,
    drift = 0,
    serverOffset = 0;
  let listener: ((event: ClockEvent) => void) | undefined;
  const request = vi.fn<(signal: AbortSignal) => Promise<number>>(
    async () => epoch + performance.now() + drift + serverOffset,
  );
  const clock = createServerClock({
    monotonicNow: () => performance.now() + drift,
    wallNow: () => Date.now() + drift,
    visible: () => visible,
    online: () => online,
    requestTime: request,
    listen: (callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
  });
  return {
    clock,
    request,
    emit: (event: ClockEvent) => listener?.(event),
    setVisible: (value: boolean) => {
      visible = value;
      listener?.(value ? "resume" : "pause");
    },
    setOnline: (value: boolean) => {
      online = value;
      listener?.(value ? "online" : "offline");
    },
    stall: (milliseconds: number) => {
      drift += milliseconds;
    },
    serverAdvance: (milliseconds: number) => {
      serverOffset += milliseconds;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["Date", "performance", "setTimeout", "clearTimeout"],
  });
  // Deliberately wrong device date: server time must still win.
  vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("shared monotonic server clock", () => {
  it("uses server time despite a wrong device clock, ticks per second and avoids per-tick API calls", async () => {
    const h = harness();
    const changed = vi.fn();
    const stop = h.clock.subscribe(changed);
    expect(h.clock.getServerSnapshot()).toBe(INITIAL_CLOCK);
    expect(h.clock.getSnapshot()).toBe(INITIAL_CLOCK);
    await flush();
    expect(h.clock.getSnapshot()).toEqual({ now: epoch, synchronized: true });
    await vi.advanceTimersByTimeAsync(61000);
    expect(h.clock.getSnapshot().now).toBe(epoch + 61000);
    expect(changed).toHaveBeenCalledTimes(62);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("compensates response transit using half RTT and aligns to server second boundaries", async () => {
    const h = harness();
    h.request.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return epoch + 50;
    });
    h.clock.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(100);
    expect(h.clock.getNow()).toBe(epoch + 100);
    await vi.advanceTimersByTimeAsync(899);
    expect(h.clock.getSnapshot().now).toBe(epoch);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.clock.getSnapshot().now).toBe(epoch + 1000);
  });

  it("recovers from delayed callbacks without accumulating timer drift", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    h.stall(7321);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.clock.getNow()).toBe(epoch + 8321);
    expect(h.clock.getSnapshot().now).toBe(epoch + 8000);
    await vi.advanceTimersByTimeAsync(679);
    expect(h.clock.getSnapshot().now).toBe(epoch + 9000);
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight request across subscribers and Strict Mode remounts", async () => {
    const h = harness();
    let resolve!: (time: number) => void;
    h.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const stop = h.clock.subscribe(() => {});
    await flush();
    stop();
    const stop2 = h.clock.subscribe(() => {});
    const stop3 = h.clock.subscribe(() => {});
    h.emit("resume");
    h.emit("online");
    await flush();
    expect(h.request).toHaveBeenCalledTimes(1);
    resolve(epoch);
    await flush();
    expect(h.clock.getSnapshot().now).toBe(epoch);
    stop2();
    stop3();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not request on a fresh route remount, and resynchronizes every five active minutes", async () => {
    const h = harness();
    const stop = h.clock.subscribe(() => {});
    await flush();
    stop();
    h.clock.subscribe(() => {});
    await flush();
    expect(h.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CLOCK_SYNC_INTERVAL);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.clock.getSnapshot().now).toBe(epoch + CLOCK_SYNC_INTERVAL);
  });

  it("pauses hidden timers/requests and immediately catches up and resyncs on visibility restore", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    h.setVisible(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3600000);
    expect(h.request).toHaveBeenCalledTimes(1);
    h.setVisible(true);
    expect(h.clock.getSnapshot().now).toBe(epoch + 3600000);
    await flush();
    h.emit("resume");
    h.emit("online");
    await flush();
    expect(h.request).toHaveBeenCalledTimes(2);
  });

  it("detects sleep where monotonic time pauses and confirms before permitting time validation", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    h.setVisible(false);
    vi.setSystemTime(Date.now() + 3600000);
    h.serverAdvance(3600000);
    h.setVisible(true);
    expect(h.clock.getNow()).toBeNull();
    expect(availableSlot(slot, h.clock.getNow())).toBe(false);
    await flush();
    expect(h.clock.getNow()).toBe(epoch + 3600000);
  });

  it("corrects after a manual device clock jump without adopting the device time", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    vi.setSystemTime(Date.now() - 86400000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.clock.getNow()).toBe(epoch + 1000);
    expect(h.request).toHaveBeenCalledTimes(2);
  });

  it("continues from its last anchor while offline and resyncs when connectivity returns", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    h.setOnline(false);
    await vi.advanceTimersByTimeAsync(40000);
    expect(h.clock.getSnapshot()).toEqual({
      now: epoch + 40000,
      synchronized: false,
    });
    expect(h.request).toHaveBeenCalledTimes(1);
    h.serverAdvance(200);
    h.setOnline(true);
    await flush();
    expect(h.clock.getNow()).toBe(epoch + 40200);
    expect(h.clock.getSnapshot().synchronized).toBe(true);
    expect(h.request).toHaveBeenCalledTimes(2);
  });

  it("starts offline without trusting the device clock, then synchronizes on reconnection", async () => {
    const h = harness();
    h.setOnline(false);
    h.clock.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.clock.getNow()).toBeNull();
    expect(h.request).not.toHaveBeenCalled();
    h.setOnline(true);
    await flush();
    expect(h.clock.getNow()).toBe(epoch + 10000);
  });

  it("defers a rapid reconnect only to the cooldown boundary, not the five-minute refresh", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    h.setOnline(false);
    await vi.advanceTimersByTimeAsync(1000);
    h.setOnline(true);
    h.emit("resume");
    await flush();
    expect(h.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.clock.getSnapshot().synchronized).toBe(true);
  });

  it("backs off failed requests instead of retrying each second", async () => {
    const h = harness();
    h.request.mockRejectedValue(new Error("offline"));
    h.clock.subscribe(() => {});
    await flush();
    await vi.advanceTimersByTimeAsync(29999);
    expect(h.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59999);
    expect(h.request).toHaveBeenCalledTimes(2);
    h.request.mockResolvedValue(epoch + 90000);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.clock.getSnapshot().synchronized).toBe(true);
  });

  it("rejects malformed samples and bounds pending network requests", async () => {
    const h = harness();
    h.request.mockResolvedValueOnce(NaN);
    h.clock.subscribe(() => {});
    await flush();
    expect(h.clock.getNow()).toBeNull();
    let aborted = false;
    h.request.mockImplementationOnce(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("timeout"));
          });
        }),
    );
    await vi.advanceTimersByTimeAsync(38000);
    expect(aborted).toBe(true);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.clock.getNow()).toBeNull();
  });

  it("validates a selected pickup slot at the actual instant, including subsecond cutoff", async () => {
    const h = harness();
    h.clock.subscribe(() => {});
    await flush();
    await vi.advanceTimersByTimeAsync(5499);
    expect(availableSlot(slot, h.clock.getNow())).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.clock.getSnapshot().now).toBe(epoch + 5000);
    expect(availableSlot(slot, h.clock.getNow())).toBe(false);
  });
});

describe("WIB formatting, session duration and hydration boundaries", () => {
  it("wires real browser lifecycle callbacks, omits cookies and cleans up the shared runtime", async () => {
    const document = Object.assign(new EventTarget(), {
      visibilityState: "visible",
    });
    const window = new EventTarget();
    const navigator = { onLine: true };
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", window);
    vi.stubGlobal("navigator", navigator);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ serverTime: epoch + performance.now() }),
            { status: 200 },
          ),
      );
    const stop = serverClock.subscribe(() => {});
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      "/api/time",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(serverClock.getNow()).toBe(epoch);
    await vi.advanceTimersByTimeAsync(6000);
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    navigator.onLine = false;
    window.dispatchEvent(new Event("offline"));
    await vi.advanceTimersByTimeAsync(6000);
    navigator.onLine = true;
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(3);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("focus"));
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("always formats HH:mm:ss and WIB midnight/date rollover independently of host timezone", () => {
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      vi.stubEnv("TZ", zone);
      expect(formatWibTime("2026-10-30T16:59:59Z")).toBe("23:59:59");
      expect(formatWibTime("2026-10-30T17:00:00Z")).toBe("00:00:00");
      expect(wibDate("2026-10-30T17:00:00Z")).toBe("2026-10-31");
      expect(dateTime("2026-10-30T17:00:00Z")).toContain("00:00:00 WIB");
    }
  });
  it("treats admin input as WIB and preserves seconds and unchanged stored precision", () => {
    vi.stubEnv("TZ", "Pacific/Honolulu");
    expect(wibDateTimeInput(slot.starts_at)).toBe("2026-10-30T09:30:10");
    expect(parseWibDateTime("2026-10-30T09:30:10")).toBe(
      slot.starts_at.replace("Z", ".000Z"),
    );
    expect(parseWibDateTime("2026-10-30T09:30")).toBe(
      "2026-10-30T02:30:00.000Z",
    );
    const precise = "2026-10-30T02:30:10.123456+00:00";
    expect(parseWibDateTime(wibDateTimeInput(precise), precise)).toBe(precise);
  });
  it.each([
    "2026-02-30T09:30",
    "2026-13-01T09:30",
    "2026-10-30T24:30",
    "2026-10-30T09:60",
    "2026-10-30T09:30:99",
    "2026-10-30",
    "",
    "not-a-date",
  ])("rejects invalid local input %s", (value) => {
    expect(() => parseWibDateTime(value)).toThrow("Waktu sesi tidak valid");
  });
  it("durations never wrap at midnight, go negative, or accumulate decremented state", () => {
    expect(
      formatDuration(Date.parse(slot.ends_at) - Date.parse(slot.starts_at)),
    ).toBe("00:20:00");
    expect(formatDuration(25 * 3600000 + 1234)).toBe("25:00:02");
    expect(formatDuration(-1000)).toBe("00:00:00");
    expect(formatDuration(NaN)).toBe("--:--:--");
  });
  it("renders identical server/initial-hydration placeholders without reading a device clock or fetching", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const first = renderToString(createElement(WibClock));
    vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    expect(renderToString(createElement(WibClock))).toBe(first);
    expect(first).toContain("--:--:--");
    expect(first).toContain('aria-live="off"');
    expect(renderToString(createElement(SessionTiming, { slot }))).toContain(
      "00:20:00",
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("fails closed without synchronized time and rejects ended sessions or invalid ordering", () => {
    expect(availableSlot(slot, null)).toBe(false);
    expect(
      availableSlot({ ...slot, ends_at: "2026-10-30T02:20:00Z" }, epoch),
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "slot",
        id: null,
        data: { ...slot, cutoff_at: slot.ends_at },
      }).success,
    ).toBe(false);
  });
  it("time endpoint returns precise uncached server epoch and needs no identity", async () => {
    const response = timeEndpoint();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ serverTime: Date.now() });
  });
});
