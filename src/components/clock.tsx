"use client";
import { useServerClock } from "@/hooks/use-server-clock";
import { formatDuration, formatWibTime } from "@/lib/time";
import type { Slot } from "@/lib/domain";

export function WibClock() {
  const { now, synchronized } = useServerClock();
  return (
    <time
      className="wib-clock"
      role="timer"
      aria-live="off"
      aria-label="Waktu WIB"
      dateTime={now === null ? undefined : new Date(now).toISOString()}
      title={
        synchronized
          ? "Waktu tersinkron ke server"
          : "Menunggu sinkronisasi waktu"
      }
    >
      {now === null ? "--:--:--" : formatWibTime(now)} WIB
    </time>
  );
}

export function SessionTiming({ slot }: { slot: Slot }) {
  const { now } = useServerClock();
  const start = Date.parse(slot.starts_at),
    end = Date.parse(slot.ends_at);
  return (
    <span className="session-timing small muted">
      Durasi {formatDuration(end - start)}
      {now === null
        ? " · Menyinkronkan waktu…"
        : now < start
          ? ` · Mulai dalam ${formatDuration(start - now)}`
          : now < end
            ? ` · Sisa sesi ${formatDuration(end - now)}`
            : " · Sesi selesai"}
    </span>
  );
}
