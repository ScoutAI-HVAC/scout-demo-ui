export interface ShopClock {
  shop?: string;
  viewer?: string;
}
const zoneVerdicts = new Map<string, string | undefined>();
export function safeTimeZone(timeZone: unknown): string | undefined {
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    return undefined;
  }
  const key = timeZone.trim();
  if (!zoneVerdicts.has(key)) {
    let verdict: string | undefined;
    try {
      verdict = new Intl.DateTimeFormat("en-US", { timeZone: key }).resolvedOptions().timeZone;
    } catch {
      verdict = undefined;
    }
    zoneVerdicts.set(key, verdict);
  }
  return zoneVerdicts.get(key);
}
export function viewerTimeZone(): string | undefined {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return undefined;
  }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string | undefined, opts: Intl.DateTimeFormatOptions) {
  const key = `${zone ?? ""}|${JSON.stringify(opts)}`;
  let hit = formatters.get(key);
  if (!hit) {
    hit = new Intl.DateTimeFormat("en-US", { ...opts, ...(zone ? { timeZone: zone } : {}) });
    formatters.set(key, hit);
  }
  return hit;
}
function valid(ms: number): boolean {
  return typeof ms === "number" && Number.isFinite(ms);
}
function wallClock(ms: number, zone: string): string {
  return formatter(zone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}
function zoneAbbreviation(ms: number, zone: string): string {
  const read = (style: "shortGeneric" | "short") => {
    try {
      return formatter(zone, { timeZoneName: style })
        .formatToParts(ms)
        .find((part) => part.type === "timeZoneName")?.value;
    } catch {
      return undefined;
    }
  };
  const generic = read("shortGeneric");
  if (generic && !/\s/.test(generic) && generic.length <= 5) {
    return generic;
  }
  return read("short") ?? zone;
}
export function zoneTag(ms: number, clock: ShopClock): string {
  const { shop, viewer } = clock;
  if (!valid(ms) || !shop || !viewer || shop === viewer) {
    return "";
  }
  if (wallClock(ms, shop) === wallClock(ms, viewer)) {
    return "";
  }
  return ` ${zoneAbbreviation(ms, shop)}`;
}
export function shopDayKey(ms: number, clock: ShopClock): string {
  if (!valid(ms)) {
    return "";
  }
  const parts = formatter(clock.shop, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function sameShopYear(ms: number, clock: ShopClock): boolean {
  return shopDayKey(ms, clock).slice(0, 4) === shopDayKey(Date.now(), clock).slice(0, 4);
}
export function shopDate(
  ms: number,
  clock: ShopClock,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
  {
    autoYear = false,
  }: {
    autoYear?: boolean;
  } = {},
): string {
  if (!valid(ms)) {
    return "";
  }
  const withYear =
    autoYear && !sameShopYear(ms, clock) ? { ...opts, year: "numeric" as const } : opts;
  return formatter(clock.shop, withYear).format(ms);
}
export function shopTime(ms: number, clock: ShopClock): string {
  if (!valid(ms)) {
    return "";
  }
  return `${formatter(clock.shop, { hour: "numeric", minute: "2-digit" }).format(ms)}${zoneTag(ms, clock)}`;
}
export function shopAsOf(ms: number, clock: ShopClock): string {
  if (!valid(ms)) {
    return "";
  }
  return shopDayKey(ms, clock) === shopDayKey(Date.now(), clock)
    ? shopTime(ms, clock)
    : shopStamp(ms, clock);
}
export function shopStamp(ms: number, clock: ShopClock): string {
  if (!valid(ms)) {
    return "";
  }
  return `${shopDate(ms, clock, { month: "short", day: "numeric" }, { autoYear: true })}, ${shopTime(ms, clock)}`;
}
