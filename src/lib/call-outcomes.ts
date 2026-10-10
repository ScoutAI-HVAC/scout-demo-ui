import type { CallOutcome } from "@/lib/api";
export type OutcomeGroup = "resolved" | "callback" | "none";
export interface OutcomeMeta {
  label: string;
  group: OutcomeGroup;
  pillBg: string;
  pillText: string;
  dot: string;
  text: string;
}
export const OUTCOME_META: Record<CallOutcome, OutcomeMeta> = {
  booked: {
    label: "Booked",
    group: "resolved",
    pillBg: "bg-sage-tint",
    pillText: "text-sage-deep",
    dot: "bg-sage",
    text: "text-sage-deep",
  },
  answered: {
    label: "Answered",
    group: "resolved",
    pillBg: "bg-sage-tint",
    pillText: "text-sage-deep",
    dot: "bg-sage",
    text: "text-sage-deep",
  },
  escalated: {
    label: "Needs callback",
    group: "callback",
    pillBg: "bg-golden-tint",
    pillText: "text-copper",
    dot: "bg-copper",
    text: "text-copper",
  },
  unresolved: {
    label: "Unresolved",
    group: "callback",
    pillBg: "bg-lavender-tint",
    pillText: "text-lavender",
    dot: "bg-lavender",
    text: "text-lavender",
  },
  "no-connect": {
    label: "Dropped",
    group: "callback",
    pillBg: "bg-alarm-tint",
    pillText: "text-alarm",
    dot: "bg-alarm",
    text: "text-alarm",
  },
  "dead-air": {
    label: "Dead air",
    group: "none",
    pillBg: "bg-alarm-tint",
    pillText: "text-alarm",
    dot: "bg-alarm",
    text: "text-alarm",
  },
  spam: {
    label: "Spam",
    group: "none",
    pillBg: "bg-alarm-tint",
    pillText: "text-alarm",
    dot: "bg-alarm",
    text: "text-alarm",
  },
};
export const OUTCOME_GROUPS: {
  value: OutcomeGroup | "all";
  label: string;
  dot?: string;
}[] = [
  { value: "all", label: "All" },
  { value: "resolved", label: "Resolved", dot: "bg-sage" },
  { value: "callback", label: "Needs callback", dot: "bg-copper" },
  { value: "none", label: "No outcome", dot: "bg-alarm" },
];
export function isOutcomeGroup(value: string | null | undefined): value is OutcomeGroup {
  return value === "resolved" || value === "callback" || value === "none";
}
export function groupOf(outcome: CallOutcome | undefined | null): OutcomeGroup | null {
  return outcome ? (OUTCOME_META[outcome]?.group ?? null) : null;
}
export function isOutboundCallWorthy(outcome: CallOutcome | undefined | null): boolean {
  return groupOf(outcome) === "callback";
}
