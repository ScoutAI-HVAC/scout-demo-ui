export function moneyLabel(flow: {
  collectedDollars?: number;
  wonDollars?: number;
}): string | null {
  const collected = flow.collectedDollars || 0;
  const won = flow.wonDollars || 0;
  if (collected > 0 && won > 0) {
    return "Tracked flow value";
  }
  if (won > 0) {
    return "After outreach";
  }
  if (collected > 0) {
    return "Collected";
  }
  return null;
}
