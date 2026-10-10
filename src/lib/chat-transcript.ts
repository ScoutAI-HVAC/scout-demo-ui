export interface ChatBubble {
  id: string;
  role: "user" | "scout";
  text: string;
  at?: string;
}
function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (
          part &&
          typeof part === "object" &&
          (
            part as {
              type?: unknown;
            }
          ).type === "text"
        ) {
          const text = (
            part as {
              text?: unknown;
            }
          ).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}
function timestampOf(message: Record<string, unknown>): string | undefined {
  for (const key of ["timestamp", "ts", "createdAt"]) {
    const value = message[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
  }
  return undefined;
}
export function mapHistoryToBubbles(messages: unknown[]): ChatBubble[] {
  const bubbles: ChatBubble[] = [];
  for (const [index, raw] of messages.entries()) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const message = raw as Record<string, unknown>;
    const role = message.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const rawText = textFromContent(message.content);
    const text =
      role === "user" &&
      /\[(Document|Video) attached: mediaId [a-f0-9]{24}\.(pdf|txt|csv|xlsx|xls|docx|mp4|mov) /.test(
        rawText,
      )
        ? rawText.split("\n\n[Scout document context]\n")[0]
        : rawText;
    if (!text) {
      continue;
    }
    const meta = message.__openclaw as
      | {
          id?: unknown;
        }
      | undefined;
    const id = typeof meta?.id === "string" ? meta.id : `history-${index}`;
    bubbles.push({
      id,
      role: role === "user" ? "user" : "scout",
      text,
      at: timestampOf(message),
    });
  }
  return bubbles;
}
function wordsOf(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
export function restoreOwnerTurns(
  history: ChatBubble[],
  onDisk: ChatBubble[],
  opts: {
    complete: boolean;
  },
): ChatBubble[] {
  const ms = (at: string | undefined) => (at ? Date.parse(at) : Number.NaN);
  const shownIds = new Set(history.map((b) => b.id));
  const shownWords = history.filter((b) => b.role === "user").map((b) => wordsOf(b.text));
  const windowStart = ms(history[0]?.at);
  const openingQuestion =
    !opts.complete && history[0]?.role === "scout"
      ? onDisk.filter((b) => b.role === "user" && ms(b.at) < windowStart).at(-1)
      : undefined;
  const missing = onDisk.filter((b) => {
    if (b.role !== "user" || shownIds.has(b.id)) return false;
    const words = wordsOf(b.text);
    if (!words || shownWords.some((shown) => shown.includes(words))) return false;
    return opts.complete || b === openingQuestion || ms(b.at) >= windowStart;
  });
  if (missing.length === 0) {
    return history;
  }
  const merged = history.slice();
  for (const turn of missing) {
    const at = ms(turn.at);
    const before = Number.isNaN(at) ? -1 : merged.findIndex((b) => ms(b.at) > at);
    merged.splice(before === -1 ? merged.length : before, 0, turn);
  }
  return merged;
}
export function deltaFromChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") {
    return "";
  }
  const choices = (
    chunk as {
      choices?: unknown;
    }
  ).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }
  const delta = (
    choices[0] as {
      delta?: {
        content?: unknown;
      };
    }
  ).delta;
  return typeof delta?.content === "string" ? delta.content : "";
}
