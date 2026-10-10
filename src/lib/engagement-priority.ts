export interface EngagementPriority {
  grade: "High" | "Medium" | "Low" | "Not rated";
  points: number | null;
  reason: string;
}
export function engagementPriority(facts: Record<string, string>): EngagementPriority {
  const number = (key: string) => {
    const raw = facts[key]?.trim();
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const quoteDays = number("days_since_quote");
  if (quoteDays !== null)
    return quoteDays <= 30
      ? {
          grade: "High",
          points: 3,
          reason: "An open quote from the last 30 days gives the conversation recent context.",
        }
      : {
          grade: "Medium",
          points: 2,
          reason: "An older open quote is a specific reason to reconnect.",
        };
  if (facts.visit_service && facts.visit_due) {
    return { grade: "High", points: 3, reason: "A named membership visit has a due date on file." };
  }
  const overdue = number("days_overdue");
  if (overdue !== null)
    return overdue <= 30
      ? { grade: "High", points: 3, reason: "The invoice became overdue within the last 30 days." }
      : {
          grade: "Medium",
          points: 2,
          reason:
            "An older unpaid invoice gives outreach a specific purpose; payment isn't predicted.",
        };
  const quiet = number("months_quiet") ?? number("months_since_service");
  if (quiet !== null)
    return quiet <= 12
      ? {
          grade: "Medium",
          points: 2,
          reason: "Service or activity is recorded within the last 12 months.",
        }
      : {
          grade: "Low",
          points: 1,
          reason:
            "More than a year without recorded service or activity; start with a light reconnection.",
        };
  if (
    number("months_lapsed") !== null ||
    number("equipment_age") !== null ||
    number("repair_count") !== null
  ) {
    return {
      grade: "Medium",
      points: 2,
      reason: "A plan or equipment need is recorded, but recent interest isn't known.",
    };
  }
  return {
    grade: "Not rated",
    points: null,
    reason: "Not enough timing or service context to rate this contact.",
  };
}
