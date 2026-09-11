/**
 * Pure date/scheduling math for the Campanhas dispatcher — no Prisma, no I/O,
 * so it's cheap to reason about/test in isolation. Everything here assumes a
 * same-day send window (e.g. "07:30"–"19:30"); a window crossing midnight
 * (e.g. "22:00"–"06:00") is NOT supported — CAMPAIGN_DEFAULTS.sendWindowEndMax
 * caps configuration to a same-day window on purpose.
 */

/** Brazil no longer observes DST (abolished 2019), so this zone's UTC offset
 * is effectively constant — but we still recompute it from the actual date
 * via Intl (never hardcode "-03:00") in case that ever changes again. */
export const SEND_WINDOW_TIMEZONE = "America/Sao_Paulo";

export interface SendWindow {
  sendWindowStart: string; // "HH:mm"
  sendWindowEnd: string; // "HH:mm"
}

export interface RateSettings extends SendWindow {
  batchSize: number;
  minMessageIntervalSeconds: number;
  maxMessageIntervalSeconds: number;
  minBatchPauseSeconds: number;
  maxBatchPauseSeconds: number;
}

function parseHHmm(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(":").map(Number);
  return { hours: h, minutes: m };
}

/** Wall-clock hour/minute of `date` as seen in `timeZone`. */
function timeInZone(date: Date, timeZone: string): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hours = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minutes = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hours, minutes };
}

function minutesOfDay({ hours, minutes }: { hours: number; minutes: number }): number {
  return hours * 60 + minutes;
}

/** `timeZone`'s offset from UTC (ms) at the instant `date` — `local = utc + offset`. */
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
  return asUTC - date.getTime();
}

/** The Date instant for `hhmm` on the `timeZone`-local calendar day that
 * contains `referenceDate`, shifted by `dayOffset` days. Used to jump a
 * schedule cursor to "today's window start" or "tomorrow's window start". */
function zonedTime(
  referenceDate: Date,
  hhmm: { hours: number; minutes: number },
  dayOffset: number,
  timeZone: string
): Date {
  const offsetMs = getTimeZoneOffsetMs(referenceDate, timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const localInstantGuess =
    Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day) + dayOffset, hhmm.hours, hhmm.minutes, 0) -
    offsetMs;
  return new Date(localInstantGuess);
}

/** SP-local midnight of the day containing `date` — used to key the "did we
 * already reset today's counter" check without storing a separate date-only
 * column. */
export function startOfLocalDay(date: Date, timeZone: string = SEND_WINDOW_TIMEZONE): Date {
  return zonedTime(date, { hours: 0, minutes: 0 }, 0, timeZone);
}

export function isWithinSendWindow(
  date: Date,
  window: SendWindow,
  timeZone: string = SEND_WINDOW_TIMEZONE
): boolean {
  const nowMin = minutesOfDay(timeInZone(date, timeZone));
  const startMin = minutesOfDay(parseHHmm(window.sendWindowStart));
  const endMin = minutesOfDay(parseHHmm(window.sendWindowEnd));
  return nowMin >= startMin && nowMin < endMin;
}

/** Pushes `date` forward to the next instant inside the send window — same
 * day's start if `date` is before it, tomorrow's start if at/after the end.
 * A no-op when `date` is already inside the window. */
function clampIntoWindow(date: Date, window: SendWindow, timeZone: string): Date {
  if (isWithinSendWindow(date, window, timeZone)) return date;
  const nowMin = minutesOfDay(timeInZone(date, timeZone));
  const startMin = minutesOfDay(parseHHmm(window.sendWindowStart));
  const startHHmm = parseHHmm(window.sendWindowStart);
  return nowMin < startMin
    ? zonedTime(date, startHHmm, 0, timeZone)
    : zonedTime(date, startHHmm, 1, timeZone);
}

function randomInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Computes `count` send timestamps starting at/after `startAt`, spaced by a
 * random message interval (or a random batch pause every `batchSize`th
 * message), rolling over to the next window whenever a computed instant
 * would land outside today's send window. Used once when a campaign
 * starts/resumes to stamp every PENDING recipient's `scheduledAt` up front —
 * the dispatcher tick then just processes whatever's due, never recomputes.
 */
export function computeSchedule(
  count: number,
  startAt: Date,
  settings: RateSettings,
  timeZone: string = SEND_WINDOW_TIMEZONE
): Date[] {
  if (count <= 0) return [];
  const window: SendWindow = { sendWindowStart: settings.sendWindowStart, sendWindowEnd: settings.sendWindowEnd };

  let cursor = clampIntoWindow(startAt, window, timeZone);
  const result: Date[] = [];

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const isBatchBoundary = i % settings.batchSize === 0;
      const gapSeconds = isBatchBoundary
        ? randomInt(settings.minBatchPauseSeconds, settings.maxBatchPauseSeconds)
        : randomInt(settings.minMessageIntervalSeconds, settings.maxMessageIntervalSeconds);
      cursor = clampIntoWindow(new Date(cursor.getTime() + gapSeconds * 1000), window, timeZone);
    }
    result.push(cursor);
  }
  return result;
}
