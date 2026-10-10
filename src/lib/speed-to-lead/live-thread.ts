import type { Lead, Message } from "./model";
export type LiveThread = {
  phoneE164: string;
  messages: {
    direction: string;
    body: string;
    atMs: number;
    sendClass: string;
  }[];
  takenOver?: boolean;
  canSend?: boolean;
  optedOut?: boolean;
};
export function liveThreadMessages(lead: Lead, thread: LiveThread): Message[] {
  if (thread.phoneE164 !== lead.phone) return lead.messages;
  const messages: Message[] = thread.messages
    .filter(
      (message) =>
        message.atMs >= lead.receivedAt &&
        (lead.conversationEndAt === undefined || message.atMs < lead.conversationEndAt),
    )
    .map((message, index) => ({
      id: `${lead.id}-sms-${message.atMs}-${index}`,
      speaker:
        message.direction === "inbound"
          ? "customer"
          : message.sendClass === "owner"
            ? "owner"
            : "scout",
      text: message.body,
      at: message.atMs,
      ...(message.direction === "outbound" ? { delivery: "sent" as const } : {}),
    }));
  const seed = lead.messages.filter(
    (message) =>
      !messages.some(
        (sms) =>
          sms.speaker === message.speaker &&
          sms.text === message.text &&
          Math.abs(sms.at - message.at) < 10000,
      ),
  );
  return [...seed, ...messages].toSorted((a, b) => a.at - b.at);
}
