import { useEffect } from "react";
export function bundleBuildId(): string {
  return (process.env.SCOUT_BUILD_ID ?? "").trim();
}
export const CHECK_INTERVAL_MS = 5 * 60000;
export const FOREGROUND_RECHECK_MS = 30000;
export const RELOAD_COOLDOWN_MS = 10 * 60000;
export const TYPING_GRACE_MS = 5000;
const GUARD_KEY = "scout:app-update";
export async function fetchServerBuildId(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl("/api/build", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as {
      id?: unknown;
    };
    return typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  } catch {
    return null;
  }
}
export function claimReload(serverId: string, storage: Storage, nowMs = Date.now()): boolean {
  const current = bundleBuildId();
  if (!current || !serverId || serverId === current) {
    return false;
  }
  try {
    const raw = storage.getItem(GUARD_KEY);
    const last = raw
      ? (JSON.parse(raw) as {
          to?: unknown;
          at?: unknown;
        })
      : null;
    if (last?.to === serverId) {
      return false;
    }
    if (typeof last?.at === "number" && nowMs - last.at < RELOAD_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(GUARD_KEY, JSON.stringify({ from: current, to: serverId, at: nowMs }));
    return storage.getItem(GUARD_KEY) !== null;
  } catch {
    return false;
  }
}
const holds = new Set<symbol>();
export function holdAppUpdate(): () => void {
  const token = Symbol("app-update-hold");
  holds.add(token);
  return () => {
    holds.delete(token);
  };
}
export function useAppUpdateHold(active: boolean): void {
  useEffect(() => (active ? holdAppUpdate() : undefined), [active]);
}
const typedInto = new WeakSet<Element>();
let lastTypedAtMs = 0;
export function noteTyping(target: EventTarget | null, nowMs = Date.now()): void {
  if (target instanceof Element) {
    typedInto.add(target);
    lastTypedAtMs = nowMs;
  }
}
const TEXT_FIELDS = "textarea, input, [contenteditable]:not([contenteditable='false'])";
const NOT_TEXT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
function fieldText(el: Element): string {
  if (el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  if (el instanceof HTMLInputElement) {
    return NOT_TEXT.has(el.type) ? "" : el.value;
  }
  return el.textContent ?? "";
}
export function reloadBlocker(doc: Document = document, nowMs = Date.now()): string | null {
  if (doc.visibilityState !== "visible") {
    return "hidden";
  }
  if (holds.size > 0) {
    return "busy";
  }
  if (nowMs - lastTypedAtMs < TYPING_GRACE_MS) {
    return "typing";
  }
  for (const el of doc.querySelectorAll(TEXT_FIELDS)) {
    if (typedInto.has(el) && fieldText(el).trim()) {
      return "draft";
    }
  }
  if (doc.querySelector("[aria-modal='true'], dialog[open]")) {
    return "dialog";
  }
  return null;
}
export function resetAppUpdateForTest(): void {
  holds.clear();
  lastTypedAtMs = 0;
}
