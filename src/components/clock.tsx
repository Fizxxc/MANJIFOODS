"use client";
import { useServerClock } from "@/hooks/use-server-clock";
import { formatDuration, formatWibTime } from "@/lib/time";
import type { Session } from "@/lib/domain";

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

export function SessionTiming({
  session,
  compact = false,
}: {
  session: Session;
  compact?: boolean;
}) {
  const { now } = useServerClock();
  const start = Date.parse(session.starts_at);
  const end = session.ends_at === null ? now : Date.parse(session.ends_at);
  return (
    <span
      className={
        compact ? "session-timing sync-status" : "session-timing small muted"
      }
    >
      Durasi sesi{" "}
      {end === null
        ? "--:--:--"
        : formatDuration(Math.floor(Math.max(0, end - start) / 1000) * 1000)}
      {!compact && (session.ends_at === null ? " · Berlangsung" : " · Selesai")}
    </span>
  );
}
