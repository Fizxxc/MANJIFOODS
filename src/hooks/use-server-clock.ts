"use client";
import { useSyncExternalStore } from "react";
import { createServerClock } from "@/lib/server-clock";
import { wibDate } from "@/lib/time";

export const serverClock = createServerClock({
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
  visible: () => document.visibilityState !== "hidden",
  online: () => navigator.onLine !== false,
  requestTime: async (signal) => {
    const response = await fetch("/api/time", {
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    if (!response.ok) throw new Error("Time synchronization failed");
    return (await response.json()).serverTime;
  },
  listen: (listener) => {
    const visibility = () =>
      listener(document.visibilityState === "hidden" ? "pause" : "resume");
    const online = () => listener("online"),
      offline = () => listener("offline");
    const resume = () => listener("resume");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
    };
  },
});

export function useServerClock() {
  const clock = useSyncExternalStore(
    serverClock.subscribe,
    serverClock.getSnapshot,
    serverClock.getServerSnapshot,
  );
  return { ...clock, getNow: serverClock.getNow };
}

// Report date only re-renders at a WIB date boundary, not every second.
export function useWibToday() {
  return useSyncExternalStore(
    serverClock.subscribe,
    () => {
      const now = serverClock.getSnapshot().now;
      return now === null ? "" : wibDate(now);
    },
    () => "",
  );
}
