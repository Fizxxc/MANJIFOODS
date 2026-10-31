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
