export const SHOP_TRADE_OPTIONS = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "pest_control", label: "Pest control" },
  { value: "general", label: "General home services" },
] as const;
export type ShopTrade = (typeof SHOP_TRADE_OPTIONS)[number]["value"];
export const DEFAULT_SHOP_TRADE: ShopTrade = "hvac";
const KNOWN = new Set<string>(SHOP_TRADE_OPTIONS.map((option) => option.value));
export function normalizeShopTrade(value: unknown): ShopTrade {
  if (typeof value !== "string") {
    return DEFAULT_SHOP_TRADE;
  }
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return KNOWN.has(key) ? (key as ShopTrade) : DEFAULT_SHOP_TRADE;
}
export function isShopTrade(value: unknown): value is ShopTrade {
  return typeof value === "string" && KNOWN.has(value);
}
export function shopTradeCopy(value: unknown) {
  const isHvac = normalizeShopTrade(value) === "hvac";
  return {
    emergencyHint: isHvac
      ? "No-heat and no-cool calls still book outside hours, on closed days, and inside the notice window."
      : "Emergency calls still book outside hours, on closed days, and inside the notice window.",
    emergencyExamples: isHvac
      ? "no heat in freezing weather, a gas or burning smell, flooding"
      : "an immediate safety risk, or damage that can't wait",
    bookingHints: {
      repair: isHvac
        ? "No cool, no heat, something's broken"
        : "Something needs attention, a repair or service visit",
      maintenance: isHvac
        ? "Tune-ups, seasonal checks, memberships"
        : "Routine service, inspections, memberships",
      estimate: isHvac
        ? "Replacement quotes, new installs"
        : "Quotes for repairs, projects or new service",
      emergency: "After-hours, urgent, can't wait",
    },
    numbersHint: isHvac
      ? "Scout ships sensible defaults for figures like dormancy and equipment life. Enter your shop's own measured number to outrank the default. Leave a field blank to use the default."
      : "Enter your shop's own measured numbers to guide Scout. Leave a field blank to use the default.",
  };
}
