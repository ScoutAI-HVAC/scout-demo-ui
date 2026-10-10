import { dashboardLine } from "@/lib/format";
export function replyOwnership({
  unavailable,
  optedOut,
  canSend,
  takenOver,
  sendBlocked,
}: {
  unavailable?: boolean;
  optedOut?: boolean;
  canSend?: boolean;
  takenOver?: boolean;
  sendBlocked?: boolean;
}): string {
  if (unavailable) {
    return "Reply status unavailable";
  }
  if (optedOut) {
    return "Texting unavailable";
  }
  if (canSend === false && !sendBlocked) {
    return "Read-only conversation";
  }
  return takenOver ? "You’re handling · Scout paused" : "Scout enabled";
}
export interface ConversationHandoff {
  id?: string;
  reason?: string;
  headline?: string;
  state?: string;
  atMs: number;
}
export function handoffReason(event: ConversationHandoff): string {
  const reasons: Record<string, string> = {
    possible_new_lead: "Scout handed an unrecognized sender’s message to your team.",
    wants_person: "The customer asked to speak with your team.",
    sms_undeliverable: "A previous text wasn’t delivered.",
  };
  return (
    reasons[event.reason ?? ""] ??
    (event.headline
      ? dashboardLine(event.headline)
      : "Scout flagged this conversation for your review.")
  );
}
