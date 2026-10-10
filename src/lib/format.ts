import type { Call } from "@/lib/api";
import { sentenceCase } from "@/lib/pro-case";
import { shopDate, shopDayKey, shopTime, type ShopClock } from "@/lib/shop-time";
export function resolvedViaLabel(via: Call["callbackResolvedVia"]): string {
  switch (via) {
    case "outbound_call":
      return "Scout called back";
    case "inbound_call":
      return "They called in";
    case "sms":
      return "Resolved by text";
    default:
      return "Marked by you";
  }
}
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
export function formatTalkTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0 min";
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)} sec`;
  }
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function safeDate(iso: string | undefined | null): Date | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function formatTime(iso: string | undefined | null, clock: ShopClock = {}): string {
  const d = safeDate(iso);
  if (!d) {
    return "";
  }
  return shopTime(d.getTime(), clock);
}
export function formatShortDate(iso: string | undefined | null, clock: ShopClock = {}): string {
  const d = safeDate(iso);
  if (!d) {
    return "";
  }
  return shopDate(d.getTime(), clock, { month: "short", day: "numeric" }, { autoYear: true });
}
export function formatDateTime(iso: string | undefined | null, clock: ShopClock = {}): string {
  const d = safeDate(iso);
  if (!d) {
    return "";
  }
  if (shopDayKey(d.getTime(), clock) === shopDayKey(Date.now(), clock)) {
    return `Today, ${shopTime(d.getTime(), clock)}`;
  }
  return `${shopDate(d.getTime(), clock, { month: "short", day: "numeric" })}, ${shopTime(d.getTime(), clock)}`;
}
export function formatPhone(raw?: string | null): string {
  if (!raw) {
    return "";
  }
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) {
    return raw.trim();
  }
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}
export function humanizePhones(text: string): string {
  if (!text) {
    return text;
  }
  return text.replace(/\+\d{10,11}\b/g, (m) => formatPhone(m) || m);
}
export function dashboardLine(raw: string): string {
  const text = humanizePhones(raw)
    .replace(/^the customer at\s+/i, "")
    .replace(
      /\s+needs a human\s*[—–-]\s*sms[ _]undeliverable\b/gi,
      ": Text message wasn't delivered",
    )
    .replace(/\s+needs a human\s*[—–-]\s*wants[ _]person\b/gi, " asked to speak with your team")
    .replace(/\bneeds a human\b/gi, "needs attention")
    .replace(/\bpossible[ _]new[ _]lead\b/gi, "New text to review")
    .replace(/\s+[—–-]\s+([a-z]?)/gi, (_match, letter: string) => `. ${letter.toUpperCase()}`);
  return sentenceCase(text);
}
export function tidyLine(text: string, max = 120): string {
  const t = humanizePhones(text.replace(/\s+/g, " ").trim());
  if (t.length <= max) {
    return t.replace(/[,;:\s]+$/, "");
  }
  const sliced = t.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[,;:\s]+$/, "")}…`;
}
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/g;
export function getInitials(name?: string): string {
  if (!name) {
    return "?";
  }
  const parts = name.replace(BIDI_CONTROLS, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = Array.from(parts[0]);
  if (parts.length === 1) {
    return first.slice(0, 2).join("").toUpperCase();
  }
  return (first[0] + Array.from(parts[parts.length - 1])[0]).toUpperCase();
}
const AVATAR_TONES = [
  "bg-terracotta-tint text-terracotta-deep",
  "bg-sage-tint text-sage-deep",
  "bg-golden-tint text-copper",
  "bg-skyblue-tint text-skyblue",
  "bg-lavender-tint text-lavender",
  "bg-copper-tint text-copper",
];
export function colorForName(name?: string): string {
  if (!name) {
    return "bg-paper-2 text-ink-3";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}
