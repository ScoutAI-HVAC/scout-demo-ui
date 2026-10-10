export interface InboxConversation {
  phoneE164: string;
  name: string | null;
  customerId: string | null;
  lastBody: string;
  lastAtMs: number;
  lastDirection: string;
  lastSendClass?: string | null;
  messageCount: number;
  awaitingReply: boolean;
  unread?: boolean;
  done?: boolean;
  takenOver?: boolean;
  needsYou?: boolean;
  scoutBooked?: {
    atMs: number;
    source: "voice" | "campaign" | "chat";
  };
}
export function waitingOnYou(c: Pick<InboxConversation, "unread" | "needsYou" | "done">): boolean {
  return (c.unread === true || c.needsYou === true) && c.done !== true;
}
export const NEEDS_YOU_TAB = "Needs you";
export function needsYouLabel(count: number): string {
  return `${count} ${count === 1 ? "needs" : "need"} you`;
}
export const INBOX_WAITING_EVENT = "scout:inbox-waiting";
export interface InboxCursor {
  before: number;
  beforePhone: string;
}
export interface InboxListBody {
  conversations: InboxConversation[];
  total?: number;
  truncated?: boolean;
  next?: InboxCursor | null;
  timezone?: string;
}
let inflight: Promise<InboxListBody> | null = null;
async function readList(url: string): Promise<InboxListBody> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Inbox read failed");
  }
  return (await res.json()) as InboxListBody;
}
export function fetchInboxList(cursor?: InboxCursor): Promise<InboxListBody> {
  if (cursor) {
    const query = new URLSearchParams({
      before: String(cursor.before),
      beforePhone: cursor.beforePhone,
    });
    return readList(`/api/inbox?${query}`);
  }
  if (inflight) {
    return inflight;
  }
  inflight = readList("/api/inbox").finally(() => {
    inflight = null;
  });
  return inflight;
}
function fingerprint(list: InboxConversation[]): string {
  return list
    .map(
      (c) =>
        `${c.phoneE164}|${c.lastAtMs}|${c.unread}|${c.done}|${c.takenOver}|${c.name}|${c.awaitingReply}|${c.messageCount}|${c.needsYou}|${c.scoutBooked?.atMs}|${c.lastSendClass}|${c.lastBody}`,
    )
    .join("\n");
}
export function mergePageOne(
  current: InboxConversation[],
  pageOne: InboxConversation[],
): InboxConversation[] {
  const onPageOne = new Set(pageOne.map((c) => c.phoneE164));
  const merged = [...pageOne, ...current.filter((c) => !onPageOne.has(c.phoneE164))];
  return fingerprint(current) === fingerprint(merged) ? current : merged;
}
export function appendOlderConversations(
  current: InboxConversation[],
  older: InboxConversation[],
): InboxConversation[] {
  const seen = new Set(current.map((c) => c.phoneE164));
  return [...current, ...older.filter((c) => !seen.has(c.phoneE164))];
}
