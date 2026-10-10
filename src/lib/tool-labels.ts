const FAMILIES: Array<[RegExp, string]> = [
  [/invoice|moneyowed|receivab|payment|reconcile/i, "Pulling invoices and balances"],
  [/estimate|quote/i, "Reviewing your estimates"],
  [/pricebook|pricing|price/i, "Checking your pricebook"],
  [/equipment/i, "Checking equipment records"],
  [/metric|topcustomer|digest|leaderboard|report|dormant/i, "Crunching your numbers"],
  [/customer/i, "Looking up customers in your CRM"],
  [/technician|roster/i, "Checking your tech roster"],
  [/job|schedule|slot|appointment|book/i, "Checking jobs and the schedule"],
  [/inbox_status/i, "Checking your inbox and hand-offs"],
  [/sms_delivery/i, "Checking text delivery and opt-outs"],
  [/brain|memory|insight|recall|timeline|watch/i, "Searching Scout's memory of your business"],
  [/call|voice/i, "Reviewing call activity"],
  [/sms|message|text|conversation/i, "Checking message history"],
  [/shop|profile|teach/i, "Reading your shop profile"],
];
const DEFAULT_LABEL = "Working in your business tools";
export function toolStatusLabel(toolName: string, subject?: string): string {
  const suffix = subject?.trim() ? ` · ${subject.trim()}` : "";
  if (typeof toolName !== "string" || !toolName.trim()) {
    return DEFAULT_LABEL + suffix;
  }
  for (const [pattern, label] of FAMILIES) {
    if (pattern.test(toolName)) {
      return label + suffix;
    }
  }
  return DEFAULT_LABEL + suffix;
}
