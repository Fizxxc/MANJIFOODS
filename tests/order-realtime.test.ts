import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeOrderRefresh } from "../src/lib/order-realtime";
afterEach(() => vi.useRealTimers());
describe("private canonical order refresh", () => {
  it("listens only to the signed-in recipient, coalesces commit events and cleans up", async () => {
    vi.useFakeTimers();
    const handlers: (() => void)[] = [];
    let subscribed: ((state: string) => void) | undefined;
    const channel = {
      on: vi.fn((_event, _filter, handler) => {
        handlers.push(handler);
        return channel;
      }),
      subscribe: vi.fn((callback) => {
        subscribed = callback;
        return channel;
      }),
    };
    const db = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const refresh = vi.fn(),
      state = vi.fn();
    const cleanup = subscribeOrderRefresh(
      db as unknown as SupabaseClient,
      "student-a",
      refresh,
      state,
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "recipient_id=eq.student-a",
      },
      expect.any(Function),
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_refresh",
        filter: "recipient_id=eq.student-a",
      },
      expect.any(Function),
    );
    subscribed?.("SUBSCRIBED");
    handlers[0]();
    handlers[1]();
    handlers[1]();
    await vi.advanceTimersByTimeAsync(79);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    subscribed?.("CHANNEL_ERROR");
    expect(state).toHaveBeenLastCalledWith(false);
    subscribed?.("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(80);
    expect(refresh).toHaveBeenCalledTimes(2);
    handlers[1]();
    cleanup();
    subscribed?.("SUBSCRIBED");
    handlers[1]();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(db.removeChannel).toHaveBeenCalledWith(channel);
    const cleanupNext = subscribeOrderRefresh(
      db as unknown as SupabaseClient,
      "student-a",
      refresh,
      state,
    );
    expect(db.channel.mock.calls[0]).not.toEqual(db.channel.mock.calls[1]);
    cleanupNext();
  });
});
