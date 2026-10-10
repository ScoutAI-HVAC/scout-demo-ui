export interface ShopNumberCopy {
  label: string;
  help?: string;
}
const EQUIPMENT: Record<
  string,
  {
    name: string;
    help?: string;
  }
> = {
  waterHeater: { name: "Water heater" },
  heatPump: { name: "Heat pump" },
  airConditioner: { name: "Air conditioner" },
  airConditionerOrHeatPump: {
    name: "AC or heat pump (type unknown)",
    help: "Used for units the CRM doesn't mark as an AC or a heat pump, like air handlers and packaged units.",
  },
  furnace: { name: "Furnace" },
  boiler: { name: "Boiler" },
};
const COPY: Record<string, ShopNumberCopy> = {
  arItemizedDays: {
    label: "List a late invoice by name after",
    help: "Days past due. Invoices newer than this are added into one total instead of listed one by one.",
  },
  arPastDueDays: {
    label: "Call a late invoice urgent after",
    help: "Days past due before Scout flags an unpaid invoice as urgent.",
  },
  dormantAfterDays: {
    label: "Count a customer as lost after",
    help: "Days since their last paid visit before Scout treats a customer as gone and worth winning back.",
  },
  concentrationAttentionPct: {
    label: "Big-customer share to flag",
    help: "When one customer pays more than this share of your collections, Scout points it out.",
  },
  concentrationUrgentPct: {
    label: "Big-customer share that's urgent",
    help: "Above this share, Scout flags leaning on that one customer as urgent.",
  },
  concentrationWindowDays: {
    label: "Look-back for customer share",
    help: "How many days of collections Scout uses to work out each customer's share.",
  },
  revenueTrendWindowDays: {
    label: "Look-back for the revenue trend",
    help: "Scout compares collections over this many days with the same stretch just before it.",
  },
  revenueTrendAttentionPct: {
    label: "Revenue drop to flag",
    help: "How far collections can fall against the stretch before (-15 is a 15% drop) before Scout points it out.",
  },
};
const UNIT_SUFFIX = /(Days|Pct|Percent|Years|Months|Hours|Dollars)$/u;
export function humanizeKey(key: string): string {
  const words = key
    .replace(UNIT_SUFFIX, (suffix) => (suffix === key ? suffix : ""))
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}
function withArticle(noun: string): string {
  return `${/^[aeiou]/u.test(noun) ? "an" : "a"} ${noun}`;
}
export function shopNumberCopy(path: string): ShopNumberCopy {
  const known = COPY[path];
  if (known) {
    return known;
  }
  const [parent, ...rest] = path.split(".");
  const child = rest.join(".");
  if (parent === "equipmentServiceLifeYears" && child) {
    const equipment = EQUIPMENT[child];
    const name = equipment?.name ?? humanizeKey(child);
    return {
      label: `${name} service life`,
      help:
        equipment?.help ??
        `Age at which Scout suggests talking about replacing ${withArticle(name.toLowerCase())}.`,
    };
  }
  return { label: child ? `${humanizeKey(parent)}: ${humanizeKey(child)}` : humanizeKey(path) };
}
