export type CampaignGoal = "book" | "collect" | "engage" | "update_records";
export const campaignGoals: Array<{
  value: CampaignGoal;
  label: string;
  description: string;
}> = [
  {
    value: "book",
    label: "Book appointments",
    description: "Turn the right opportunity into a confirmed visit.",
  },
  {
    value: "collect",
    label: "Collect payments",
    description: "Follow up on real unpaid invoices.",
  },
  {
    value: "update_records",
    label: "Update customer records",
    description:
      "Ask customers for equipment details and save confirmed information to a supported CRM.",
  },
  {
    value: "engage",
    label: "Positive customer intent",
    description: "Find out who wants to move forward and bring the next step to your office.",
  },
];
export function goalFor(flow: {
  goal?: CampaignGoal;
  booking?: {
    enabled: boolean;
  };
  segment?: {
    source: string;
  };
}): CampaignGoal {
  return (
    flow.goal ??
    (flow.booking?.enabled ? "book" : flow.segment?.source === "overdue_ar" ? "collect" : "engage")
  );
}
export function campaignResult(flow: {
  goal?: CampaignGoal;
  confirmedBookings?: number;
  collectedDollars: number;
  replied: number;
}): {
  value: string;
  label: string;
} | null {
  if (flow.goal === "book") {
    return { value: String(flow.confirmedBookings ?? 0), label: "Scout bookings" };
  }
  if (flow.goal === "collect") {
    return {
      value: `$${Math.round(flow.collectedDollars).toLocaleString("en-US")}`,
      label: "Payments collected",
    };
  }
  if (flow.goal === "update_records") {
    return { value: String(flow.replied), label: "Replies received" };
  }
  if (flow.goal === "engage") {
    return { value: String(flow.replied), label: "Replies to review" };
  }
  return null;
}
