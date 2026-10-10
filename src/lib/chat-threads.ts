export const THREADS_STORAGE_KEY = "scout-chat-threads";
export const TOMBSTONES_STORAGE_KEY = "scout-chat-tombstones";
const MAX_THREADS = 30;
const MAX_TITLE_CHARS = 80;
const MAX_TOMBSTONES = 200;
const GREETING_ONLY = /^(hi|hey|hello|ok|okay|thanks|thank you)[!. ]*$/i;
export function threadTitle(thread: Pick<ThreadMeta, "title" | "renamed" | "summary">): string {
  if (thread.renamed) return thread.title;
  if (thread.summary) return thread.summary;
  return GREETING_ONLY.test(thread.title.trim())
    ? "New conversation"
    : thread.title || "Untitled chat";
}
export interface ThreadMeta {
  id: string;
  title: string;
  summary?: string;
  lastAt: number;
  renamed?: boolean;
  pinned?: boolean;
}
function readAll(): ThreadMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ThreadMeta =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as ThreadMeta).id === "string" &&
        typeof (t as ThreadMeta).title === "string" &&
        typeof (t as ThreadMeta).lastAt === "number",
    );
  } catch {
    return [];
  }
}
function writeAll(threads: ThreadMeta[]): void {
  if (typeof window === "undefined") return;
  const kept = [...threads]
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.lastAt - a.lastAt)
    .slice(0, MAX_THREADS);
  try {
    window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(kept));
  } catch {}
}
function mutate(
  apply: (current: ThreadMeta[]) => {
    next: ThreadMeta[];
    removedIds?: string[];
  },
): void {
  const { next, removedIds = [] } = apply(readAll());
  const claimed = new Set(next.map((t) => t.id));
  const removed = new Set(removedIds);
  const concurrent = readAll().filter((t) => !claimed.has(t.id) && !removed.has(t.id));
  writeAll([...next, ...concurrent].sort((a, b) => b.lastAt - a.lastAt));
}
export function listThreads(): ThreadMeta[] {
  return readAll();
}
export function summarizeThread(id: string, summary: string): void {
  const clean = summary.trim();
  if (!clean || clean.length > MAX_TITLE_CHARS) return;
  mutate((threads) => ({
    next: threads.map((thread) =>
      thread.id === id && !thread.renamed ? { ...thread, summary: clean } : thread,
    ),
  }));
}
function readTombstones(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TOMBSTONES_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
function recordTombstone(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = [id, ...readTombstones().filter((t) => t !== id)].slice(0, MAX_TOMBSTONES);
    window.localStorage.setItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}
export function adoptThread(id: string, title: string, lastAt: number): void {
  if (!id || readTombstones().includes(id)) return;
  const clean = title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS) || "Recovered chat";
  mutate((threads) => {
    if (threads.some((t) => t.id === id)) {
      return { next: threads };
    }
    const at = Number.isFinite(lastAt) && lastAt > 0 ? lastAt : Date.now();
    return { next: [...threads, { id, title: clean, lastAt: at }] };
  });
}
export function rememberThread(id: string, firstMessage?: string): void {
  if (!id) return;
  mutate((threads) => {
    const existing = threads.find((t) => t.id === id);
    const greetingOnly = existing && !existing.renamed && GREETING_ONLY.test(existing.title.trim());
    const title =
      (!greetingOnly && existing?.title) ||
      (firstMessage ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS) ||
      existing?.title ||
      "";
    const next: ThreadMeta = {
      id,
      title,
      lastAt: Date.now(),
      ...(existing?.renamed ? { renamed: true } : {}),
      ...(existing?.pinned ? { pinned: true } : {}),
      ...(existing?.summary ? { summary: existing.summary } : {}),
    };
    return { next: [next, ...threads.filter((t) => t.id !== id)] };
  });
}
export function renameThread(id: string, title: string): void {
  if (!id) return;
  const clean = title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS);
  if (!clean) return;
  mutate((threads) => {
    const existing = threads.find((t) => t.id === id);
    if (!existing) {
      return { next: threads };
    }
    return {
      next: [{ ...existing, title: clean, renamed: true }, ...threads.filter((t) => t.id !== id)],
    };
  });
}
export function pinThread(id: string, pinned: boolean): void {
  if (!id) return;
  mutate((threads) => {
    const existing = threads.find((t) => t.id === id);
    if (!existing) {
      return { next: threads };
    }
    const { pinned: _dropped, ...rest } = existing;
    return {
      next: [pinned ? { ...rest, pinned: true } : rest, ...threads.filter((t) => t.id !== id)],
    };
  });
}
export function removeThread(
  id: string,
  opts?: {
    tombstone?: boolean;
  },
): void {
  if (opts?.tombstone !== false) {
    recordTombstone(id);
  }
  mutate((threads) => ({
    next: threads.filter((t) => t.id !== id),
    removedIds: [id],
  }));
}
