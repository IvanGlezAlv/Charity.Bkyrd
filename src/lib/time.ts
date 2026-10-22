// Time helpers. Every instant is handled as UTC; the race's IANA timezone is
// applied only when displaying or when interpreting local wall-clock input.

export const LOCALE = "es-MX";

/** Offset of `tz` from UTC at the given instant, in milliseconds (local - UTC). */
export function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const truncated = date.getTime() - date.getUTCMilliseconds();
  return asUtc - truncated;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?$/;

/**
 * Converts a wall-clock date and time in `tz` to a UTC Date. Returns null for
 * malformed input or a wall-clock time that does not exist (DST gap).
 */
export function zonedLocalToUtc(date: string, time: string, tz: string): Date | null {
  const d = LOCAL_DATE.exec(date.trim());
  const t = LOCAL_TIME.exec(time.trim());
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi, s] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  const ms = t[4] ? Number(t[4].padEnd(3, "0")) : 0;
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59 || s > 59) return null;
  const naive = Date.UTC(y, mo - 1, da, h, mi, s, ms);
  let guess = naive - tzOffsetMs(new Date(naive), tz);
  const offset2 = tzOffsetMs(new Date(guess), tz);
  guess = naive - offset2;
  // Verify round-trip (rejects impossible dates and DST gaps).
  const back = new Date(guess + tzOffsetMs(new Date(guess), tz));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da ||
      back.getUTCHours() !== h || back.getUTCMinutes() !== mi) {
    return null;
  }
  return new Date(guess);
}

/** Value for <input type="datetime-local"> showing `iso` in `tz`. */
export function toLocalInputValue(iso: string | null | undefined, tz: string, withSeconds = false): string {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() + tzOffsetMs(date, tz));
  const s = local.toISOString();
  return withSeconds ? s.slice(0, 19) : s.slice(0, 16);
}

/** Parses a datetime-local value (wall clock in `tz`) into an ISO UTC string. */
export function fromLocalInputValue(value: string | null | undefined, tz: string): string | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  return zonedLocalToUtc(date, time, tz)?.toISOString() ?? null;
}

export function formatDateTime(iso: string | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    dateStyle: opts.timeStyle && !opts.dateStyle ? undefined : (opts.dateStyle ?? "medium"),
    timeStyle: opts.timeStyle ?? "short",
    ...opts,
  }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined, tz: string, seconds = false): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatDate(isoOrDate: string | null | undefined, tz: string, style: "long" | "full" | "medium" = "long"): string {
  if (!isoOrDate) return "";
  // A bare date (YYYY-MM-DD) is a calendar date, not an instant.
  if (LOCAL_DATE.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split("-").map(Number);
    return new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", dateStyle: style }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  }
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, dateStyle: style }).format(new Date(isoOrDate));
}

/** Short day label such as "sáb 21 nov", in the race's timezone. */
export function formatDay(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value.replace(/\./g, "") ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** H:MM:SS, truncated to whole seconds (matches the ranking precision). */
export function formatElapsed(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** MM:SS for durations under an hour, H:MM:SS above. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

export interface YardState {
  started: boolean;
  /** Yard currently running (1-based); 0 before the start. */
  yard: number;
  yardStart: number | null;
  nextStart: number;
  msToNext: number;
}

/** Backyard clock: which yard is running at `now` and when the next one starts. */
export function yardAt(now: number, startIso: string, intervalMinutes: number): YardState {
  const start = new Date(startIso).getTime();
  const interval = intervalMinutes * 60_000;
  if (now < start) return { started: false, yard: 0, yardStart: null, nextStart: start, msToNext: start - now };
  const yard = Math.floor((now - start) / interval) + 1;
  const yardStart = start + (yard - 1) * interval;
  const nextStart = yardStart + interval;
  return { started: true, yard, yardStart, nextStart, msToNext: nextStart - now };
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Whole days, hours, minutes and seconds left until `target`; all zero once it has passed. */
export function countdownParts(now: number, target: number): CountdownParts {
  const total = Math.max(0, Math.floor((target - now) / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
