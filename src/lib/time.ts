export const WIB_ZONE = "Asia/Jakarta";
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: WIB_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WIB_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatWibTime(value: number | string | Date) {
  return timeFormatter.format(new Date(value));
}

export function wibDate(value: number | string | Date) {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function wibDateTimeInput(value?: string) {
  if (!value) return "";
  return `${wibDate(value)}T${formatWibTime(value)}`;
}

export function parseWibDateTime(value: string, original?: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error("Waktu sesi tidak valid.");
  const normalized = value.length === 16 ? value + ":00" : value;
  // Preserve the full stored precision when an existing timestamp is unchanged,
  // so editing capacity does not accidentally reschedule a reserved slot.
  if (original && wibDateTimeInput(original) === normalized) return original;
  // WIB has no daylight-saving transition; a local input always means UTC+07.
  const instant = new Date(normalized + "+07:00");
  if (
    !Number.isFinite(instant.getTime()) ||
    wibDateTimeInput(instant.toISOString()) !== normalized
  )
    throw new Error("Waktu sesi tidak valid.");
  return instant.toISOString();
}

export function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) return "--:--:--";
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
