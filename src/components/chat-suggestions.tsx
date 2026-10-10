"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { InsightTile } from "@/components/insight-tiles";
const POLL_MS = 45000;
const SELECTION_KEY = "scout-suggestion-selections";
const QUESTIONS = [
  [
    "Who's waiting on us?",
    "Who needs a reply or a callback from us? Show me the highest-priority items.",
  ],
  ["Where's the money?", "What are we owed, and which overdue invoices need attention first?"],
  [
    "What's on the board?",
    "What visits are booked today, and is anything on the schedule missing an assignment?",
  ],
  [
    "Which quotes need a look?",
    "Which open estimates are aging, and what follow-up would you recommend?",
  ],
  [
    "How's this week shaping up?",
    "Review this week's booked visits and any gaps you can verify in the calendar.",
  ],
  [
    "Who haven't we seen lately?",
    "Which customers haven't had a service visit recently? Explain the dates and criteria you used.",
  ],
  [
    "What came in this week?",
    "Review recorded payments this week. Separate collected cash from booked or invoiced value.",
  ],
  [
    "Any equipment worth checking?",
    "Which customers have documented aging equipment or open service recommendations? Use only recorded CRM facts.",
  ],
  [
    "What needs attention tomorrow?",
    "Review tomorrow's visits, assignments and any missing details that need office attention.",
  ],
] as const;
function localDay(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function dailyStarters(day: string) {
  if (!day) return [];
  const offset = (Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000) % 3) * 3;
  return QUESTIONS.slice(offset, offset + 3).map(([title, question], index) => ({
    id: `starter-${offset + index}`,
    title,
    prompt: `${question} Just review the records; don't send reminders, contact anyone or change anything. If data is unavailable, say so.`,
  }));
}
type Selection = {
  day: string;
  ids: string[];
};
function readSelections(day: string): Selection {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? "null");
    if (
      stored &&
      typeof stored === "object" &&
      "day" in stored &&
      stored.day === day &&
      "ids" in stored &&
      Array.isArray(stored.ids)
    ) {
      return { day, ids: stored.ids.filter((id): id is string => typeof id === "string") };
    }
  } catch {}
  return { day, ids: [] };
}
interface Suggestions {
  insights: InsightTile[];
  unavailable: boolean;
  starters: ReturnType<typeof dailyStarters>;
  selected: string[];
  select: (id: string) => void;
  dismiss: (id: string) => void;
  dismissError: string | null;
}
const Context = createContext<Suggestions | null>(null);
export function useChatSuggestions() {
  const value = useContext(Context);
  if (!value) throw new Error("Chat suggestions require their provider");
  return value;
}
export function ChatSuggestionsProvider({ children }: { children: ReactNode }) {
  const [insights, setInsights] = useState<InsightTile[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ day: "", ids: [] });
  const selectionRef = useRef(selection);
  const pending = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false;
    let loading = false;
    function syncDay() {
      const day = localDay(new Date());
      if (selectionRef.current.day === day) return;
      selectionRef.current = readSelections(day);
      setSelection(selectionRef.current);
    }
    async function refresh() {
      syncDay();
      if (loading || document.hidden) return;
      loading = true;
      try {
        const response = await fetch("/api/insights", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("Insights unavailable");
        const data = (await response.json()) as {
          insights?: InsightTile[];
        };
        if (!Array.isArray(data.insights)) throw new Error("Insights unavailable");
        if (!stopped) {
          setInsights(data.insights);
          setUnavailable(false);
        }
      } catch {
        if (!stopped) setUnavailable(true);
      } finally {
        loading = false;
      }
    }
    const wake = () => {
      void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== SELECTION_KEY) return;
      selectionRef.current = readSelections(localDay(new Date()));
      setSelection(selectionRef.current);
    };
    wake();
    const timer = setInterval(wake, POLL_MS);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("storage", storage);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function select(id: string) {
    const day = localDay(new Date());
    const previous = selectionRef.current.day === day ? selectionRef.current : readSelections(day);
    const next = { day, ids: [...new Set([...previous.ids, id])] };
    selectionRef.current = next;
    setSelection(next);
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(next));
    } catch {}
  }
  async function dismiss(id: string) {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setDismissed((ids) => [...new Set([...ids, id])]);
    setDismissError(null);
    try {
      const response = await fetch(`/api/insights/${encodeURIComponent(id)}/dismiss`, {
        method: "POST",
        keepalive: true,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Couldn't save selection");
    } catch {
      setDismissed((ids) => ids.filter((value) => value !== id));
      setDismissError(id);
    } finally {
      pending.current.delete(id);
    }
  }
  return (
    <Context.Provider
      value={{
        insights: insights.filter((tile) => !dismissed.includes(tile.id)),
        unavailable,
        starters: dailyStarters(selection.day).filter(
          (starter) => !selection.ids.includes(starter.id),
        ),
        selected: selection.ids,
        select,
        dismiss: (id) => {
          void dismiss(id);
        },
        dismissError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
