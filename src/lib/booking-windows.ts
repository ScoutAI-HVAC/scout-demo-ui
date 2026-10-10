export interface BookingWindow {
  start: string;
  end: string;
}
export const MIN_BOOKING_WINDOW_MINUTES = 60;
export const BOOKING_WINDOW_STEP_MINUTES = 30;
export const MAX_BOOKING_WINDOWS = 24;
export function windowClockMinutes(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
  if (minute > 59) {
    return undefined;
  }
  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return undefined;
    }
    hour = meridiem.startsWith("p") ? (hour % 12) + 12 : hour % 12;
  } else if (hour > 23) {
    return undefined;
  }
  return hour * 60 + minute;
}
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function bookingWindowSlot(window: BookingWindow): string {
  return `${window.start}-${window.end}`;
}
export function bookingWindowLabel(window: BookingWindow): string {
  const start = windowClockMinutes(window.start);
  const end = windowClockMinutes(window.end);
  if (start === undefined || end === undefined) {
    return `${window.start}-${window.end}`;
  }
  const time = (minutes: number) => {
    const hour = Math.floor(minutes / 60) % 12 || 12;
    const minute = minutes % 60;
    return minute ? `${hour}:${String(minute).padStart(2, "0")}` : String(hour);
  };
  const meridiem = (minutes: number) => (minutes >= 12 * 60 ? "PM" : "AM");
  return meridiem(start) === meridiem(end)
    ? `${time(start)} to ${time(end)} ${meridiem(end)}`
    : `${time(start)} ${meridiem(start)} to ${time(end)} ${meridiem(end)}`;
}
type Parsed = {
  start: number;
  end: number;
};
function parseEntry(entry: unknown): Parsed | undefined {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  const start = windowClockMinutes(
    (
      entry as {
        start?: unknown;
      }
    ).start,
  );
  const end = windowClockMinutes(
    (
      entry as {
        end?: unknown;
      }
    ).end,
  );
  return start === undefined || end === undefined ? undefined : { start, end };
}
function canonical(parsed: Parsed[]): BookingWindow[] {
  return parsed.map((w) => ({ start: clock(w.start), end: clock(w.end) }));
}
function onStep(window: Parsed): boolean {
  return (
    window.start % BOOKING_WINDOW_STEP_MINUTES === 0 &&
    window.end % BOOKING_WINDOW_STEP_MINUTES === 0
  );
}
function byStart(a: Parsed, b: Parsed): number {
  return a.start - b.start || a.end - b.end;
}
export type BookingWindowsCheck =
  | {
      ok: true;
      windows: BookingWindow[];
    }
  | {
      ok: false;
      error: string;
    };
export function validateBookingWindows(input: unknown): BookingWindowsCheck {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Booking windows must be a list." };
  }
  if (input.length > MAX_BOOKING_WINDOWS) {
    return { ok: false, error: `Use ${MAX_BOOKING_WINDOWS} booking windows or fewer.` };
  }
  const parsed: Parsed[] = [];
  for (const entry of input) {
    const window = parseEntry(entry);
    if (!window) {
      return { ok: false, error: "Each booking window needs a start time and an end time." };
    }
    const label = bookingWindowLabel(canonical([window])[0]!);
    if (window.end <= window.start) {
      return { ok: false, error: `${label}: the window has to end after it starts.` };
    }
    if (window.end - window.start < MIN_BOOKING_WINDOW_MINUTES) {
      return { ok: false, error: `${label}: a booking window has to be at least an hour long.` };
    }
    if (!onStep(window)) {
      return { ok: false, error: `${label}: windows start and end on the hour or half hour.` };
    }
    parsed.push(window);
  }
  const sorted = parsed.toSorted(byStart);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.start < sorted[i - 1]!.end) {
      const [earlier, later] = canonical([sorted[i - 1]!, sorted[i]!]);
      return {
        ok: false,
        error: `${bookingWindowLabel(earlier!)} and ${bookingWindowLabel(later!)} overlap. Windows can touch but not overlap.`,
      };
    }
  }
  return { ok: true, windows: canonical(sorted) };
}
export function readBookingWindows(raw: unknown): BookingWindow[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const usable = raw
    .map(parseEntry)
    .filter(
      (w): w is Parsed =>
        w !== undefined && w.end - w.start >= MIN_BOOKING_WINDOW_MINUTES && onStep(w),
    )
    .toSorted(byStart);
  const kept: Parsed[] = [];
  for (const window of usable) {
    const last = kept[kept.length - 1];
    if (!last || window.start >= last.end) {
      kept.push(window);
    }
  }
  return kept.length > 0 ? canonical(kept.slice(0, MAX_BOOKING_WINDOWS)) : null;
}
export function configuredBookingWindows(config: unknown): string[] | null {
  const doc =
    config && typeof config === "object"
      ? (config as {
          booking?: {
            windows?: unknown;
          };
        })
      : undefined;
  return readBookingWindows(doc?.booking?.windows)?.map(bookingWindowSlot) ?? null;
}
