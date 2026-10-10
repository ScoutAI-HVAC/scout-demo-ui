"use client";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessagesSquare,
  Mic,
  PanelLeftClose,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Square,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ActivityTicker } from "@/components/activity-ticker";
import ChatGreeting from "@/components/chat-greeting";
import { ChatSuggestionsProvider, useChatSuggestions } from "@/components/chat-suggestions";
import { CONSOLE_SLOT_ID, setDockClearance } from "@/components/dock";
import GrowingTextarea from "@/components/growing-textarea";
import ScoutBrandMark from "@/components/scout-brand-mark";
import ScoutBuddy from "@/components/scout-buddy";
import ScoutBuddyPuppet from "@/components/scout-buddy-puppet";
import { ScoutPriorities } from "@/components/scout-priorities";
import { useShopClock } from "@/components/shop-clock";
import { useAppUpdateHold } from "@/lib/app-update";
import {
  ATTACH_ACCEPT,
  ATTACH_TITLE,
  ATTACHMENT_LINE,
  attachmentContentType,
  attachmentMarker,
  attachmentProblem,
  kindOfMediaId,
} from "@/lib/chat-attachments";
import {
  adoptThread,
  listThreads,
  pinThread,
  rememberThread,
  summarizeThread,
  removeThread,
  renameThread,
  threadTitle,
  type ThreadMeta,
} from "@/lib/chat-threads";
import type { ChatBubble } from "@/lib/chat-transcript";
import { features } from "@/lib/features";
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: {
        results: ArrayLike<
          {
            isFinal: boolean;
          } & ArrayLike<{
            transcript: string;
          }>
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
};
import { useBuddyStore } from "@/lib/buddy-store";
import { normalizeScoutText, renderProse, renderScoutBlocks } from "@/lib/scout-prose";
import { shopDate, shopDayKey, shopTime, type ShopClock } from "@/lib/shop-time";
const THREAD_STORAGE_KEY = "scout-chat-thread";
const RAIL_STORAGE_KEY = "scout-chat-rail";
const PENDING_STORAGE_KEY = "scout-chat-pending";
const RECENT_CHATS = 5;
const ASK_BAR_DEFAULT_CLEARANCE = 136;
const PENDING_POLL_INTERVAL_MS = 2500;
const PENDING_POLL_TIMEOUT_MS = 15 * 60000;
const ANSWER_GRACE_MS = 4000;
const STREAM_IDLE_TIMEOUT_MS = 60000;
const STOPPED = "scout-turn-stopped";
const IDLE_TIMEOUT = "scout-turn-idle-timeout";
const SEND_RETRY_DELAYS_MS = [2000, 5000, 10000];
const RETRYABLE_SEND_STATUSES = new Set([502, 503, 504]);
const RECOVERY_POLL_INTERVAL_MS = 2500;
const RECOVERY_WINDOW_MS = 90000;
const RECOVERY_ABSENT_READS = 2;
const NAVIGATED = "scout-turn-navigated";
const SWITCHED = "scout-turn-switched";
interface PendingMarker {
  text: string;
  startedAt: number;
  priorTurns?: number;
}
function welcomeBubble(): ChatBubble {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return {
    id: "welcome",
    role: "scout",
    text: `Good ${part}. Let me know if you need help with anything.`,
  };
}
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function formatTime(ts: string | undefined, clock: ShopClock) {
  const ms = ts ? Date.parse(ts) : Number.NaN;
  return shopTime(ms, clock);
}
function dayKey(ts: string | undefined, clock: ShopClock) {
  const ms = ts ? Date.parse(ts) : Number.NaN;
  return shopDayKey(ms, clock);
}
function formatDay(ts: string, clock: ShopClock) {
  const now = Date.now();
  const key = dayKey(ts, clock);
  if (key === shopDayKey(now, clock)) return "Today";
  if (key === shopDayKey(now - 86400000, clock)) return "Yesterday";
  return shopDate(Date.parse(ts), clock, { weekday: "long", month: "long", day: "numeric" });
}
function mintThreadId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function readThreadId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(THREAD_STORAGE_KEY);
  if (existing) return existing;
  const minted = mintThreadId();
  window.localStorage.setItem(THREAD_STORAGE_KEY, minted);
  return minted;
}
function repliedTo(history: ChatBubble[], pendingText: string, priorTurns = 0): boolean {
  const text = pendingText.trim();
  let seen = 0;
  for (let i = 0; i < history.length; i++) {
    const bubble = history[i];
    if (bubble.role === "user" && bubble.text.trim() === text) {
      seen++;
      if (seen > priorTurns) {
        return history.slice(i + 1).some((m) => m.role === "scout");
      }
    }
  }
  return false;
}
function turnInHistory(history: ChatBubble[], text: string, priorTurns = 0): boolean {
  return (
    history.filter((m) => m.role === "user" && m.text.trim() === text.trim()).length > priorTurns
  );
}
function pendingKeyFor(thread: string): string {
  return thread ? `${PENDING_STORAGE_KEY}:${thread}` : PENDING_STORAGE_KEY;
}
function readPending(thread: string): PendingMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const legacy = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (legacy && !window.localStorage.getItem(pendingKeyFor(thread))) {
      window.localStorage.setItem(pendingKeyFor(thread), legacy);
      window.localStorage.removeItem(PENDING_STORAGE_KEY);
    }
    const raw = window.localStorage.getItem(pendingKeyFor(thread));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMarker;
    if (!parsed.text || !Number.isFinite(parsed.startedAt)) return null;
    if (Date.now() - parsed.startedAt > PENDING_POLL_TIMEOUT_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writePending(thread: string, marker: PendingMarker | null) {
  if (typeof window === "undefined") return;
  if (marker) {
    window.localStorage.setItem(pendingKeyFor(thread), JSON.stringify(marker));
  } else {
    window.localStorage.removeItem(pendingKeyFor(thread));
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
  }
}
const SCOUT_PROSE = "w-full min-w-0 break-words text-body-lg leading-7 text-ink [&>p:empty]:h-1";
function threadAge(lastAt: number, clock: ShopClock): string {
  const mins = Math.floor((Date.now() - lastAt) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return shopDate(lastAt, clock, { month: "short", day: "numeric" });
}
export default function ChatPage() {
  return (
    <ChatSuggestionsProvider>
      <ChatScene />
    </ChatSuggestionsProvider>
  );
}
function ChatScene() {
  const suggestions = useChatSuggestions();
  const clock = useShopClock();
  const [messages, setMessages] = useState<ChatBubble[]>([welcomeBubble()]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolActivity, setToolActivity] = useState<
    Array<{
      label: string;
      pending: number;
      isError?: boolean;
    }>
  >([]);
  const [thinking, setThinking] = useState(false);
  const [toolResultSeq, setToolResultSeq] = useState(0);
  const [decidingNext, setDecidingNext] = useState(false);
  useEffect(() => {
    if (toolResultSeq === 0) {
      return;
    }
    setDecidingNext(true);
    const timer = setTimeout(() => setDecidingNext(false), ANSWER_GRACE_MS);
    return () => clearTimeout(timer);
  }, [toolResultSeq]);
  const unsentRef = useRef<Set<string>>(new Set());
  const [railOpen, setRailOpen] = useState(false);
  const [showAllRecents, setShowAllRecents] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [stagedPhoto, setStagedPhoto] = useState<{
    mediaId: string;
    fileName: string;
    note?: string;
  } | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const dictationBaseRef = useRef("");
  const dictationFinalsRef = useRef("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const dropFileRef = useRef<(file: File, othersDropped: number) => void>(() => {});
  useEffect(() => {
    if (!features.chatPhotoAttach) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDropActive(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropActive(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropActive(false);
      const files = e.dataTransfer?.files;
      if (files?.length) dropFileRef.current(files[0], files.length - 1);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const resumePendingTurnRef = useRef<((thread: string) => void) | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RAIL_STORAGE_KEY);
      if (saved === "open") setRailOpen(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_STORAGE_KEY, railOpen ? "open" : "closed");
    } catch {}
  }, [railOpen]);
  const [sidebarChatsSlot, setSidebarChatsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const check = () => {
      const el = document.getElementById("scout-sidebar-chats-slot");
      setSidebarChatsSlot((cur) => (cur === el ? cur : el));
    };
    check();
    const timer = setInterval(check, 600);
    return () => clearInterval(timer);
  }, []);
  const [threadList, setThreadList] = useState<ThreadMeta[]>([]);
  const titleAttemptsRef = useRef(new Set<string>());
  const titleBusyRef = useRef(false);
  useEffect(() => {
    if (isLoading || titleBusyRef.current) return;
    const thread = threadList.find(
      (t) => !t.renamed && !t.summary && !titleAttemptsRef.current.has(t.id),
    );
    if (!thread) return;
    titleAttemptsRef.current.add(thread.id);
    titleBusyRef.current = true;
    void fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: thread.id }),
      signal: AbortSignal.timeout(30000),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          title?: unknown;
        };
        if (typeof body.title === "string") summarizeThread(thread.id, body.title);
      })
      .catch(() => {})
      .finally(() => {
        titleBusyRef.current = false;
        setThreadList(listThreads());
      });
  }, [threadList, isLoading]);
  const sendSeqRef = useRef(0);
  const thinkingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [dayPart, setDayPart] = useState("Morning");
  const [reconnecting, setReconnecting] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  useAppUpdateHold(
    isLoading ||
      input.trim() !== "" ||
      isListening ||
      isRecording ||
      isTranscribing ||
      uploadingPhoto ||
      stagedPhoto !== null,
  );
  const [consoleSlot, setConsoleSlot] = useState<HTMLElement | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const turnStartedAtRef = useRef(0);
  const threadRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const engagedRef = useRef(false);
  const followReplyRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerSelection = useRef<{
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
    scrollTop: number;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startingRef = useRef(false);
  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadHistory = useCallback(async (): Promise<ChatBubble[]> => {
    const res = await fetch("/api/chat", {
      headers: { "x-scout-chat-thread": threadRef.current },
    });
    if (!res.ok) throw new Error(`history ${res.status}`);
    const data = (await res.json()) as {
      messages: ChatBubble[];
    };
    return data.messages;
  }, []);
  useEffect(() => {
    threadRef.current = readThreadId();
    for (const t of listThreads()) {
      if (!t.title) removeThread(t.id, { tombstone: false });
    }
    setThreadList(listThreads());
    void fetch("/api/chat/threads", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            threads?: Array<{
              id: string;
              title: string;
              lastAt: number;
              summary?: string;
            }>;
          } | null,
        ) => {
          if (cancelled || !data?.threads?.length) return;
          for (const t of data.threads) {
            adoptThread(t.id, t.title, t.lastAt);
            if (t.summary) summarizeThread(t.id, t.summary);
          }
          setThreadList(listThreads());
        },
      )
      .catch(() => {});
    let cancelled = false;
    const forThread = threadRef.current;
    const stale = () => cancelled || threadRef.current !== forThread;
    void (async () => {
      try {
        const history = await loadHistory();
        if (stale()) return;
        setMessages(history.length > 0 ? history : [welcomeBubble()]);
      } catch {
        if (!stale()) setSendError("Couldn't load the conversation - check the connection.");
      }
      if (!stale()) {
        resumePendingTurnRef.current?.(threadRef.current);
      }
    })();
    void fetch("/api/transcribe")
      .then((res) => res.json())
      .then((data: { available?: boolean }) => {
        if (!cancelled) setMicAvailable(Boolean(data.available));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (pendingPollRef.current) clearInterval(pendingPollRef.current);
      abortRef.current?.abort(NAVIGATED);
      listeningRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [loadHistory]);
  useEffect(() => {
    if (!engagedRef.current || !followReplyRef.current || document.querySelector("dialog[open]")) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
    lastScrollYRef.current = window.scrollY;
  }, [messages, streamText, isLoading]);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const measureLatest = useCallback(() => {
    const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    setAwayFromLatest(gap > 240);
  }, []);
  useEffect(() => {
    measureLatest();
    window.addEventListener("scroll", measureLatest, { passive: true });
    window.addEventListener("resize", measureLatest);
    return () => {
      window.removeEventListener("scroll", measureLatest);
      window.removeEventListener("resize", measureLatest);
    };
  }, [measureLatest]);
  useEffect(measureLatest, [messages, streamText, measureLatest]);
  const jumpToLatest = () => {
    followReplyRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };
  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    let touchY = 0;
    const inChat = (target: EventTarget | null) =>
      !(
        target instanceof Element &&
        target.closest("dialog, aside, input, textarea, [contenteditable='true']")
      );
    const wheel = (event: WheelEvent) => {
      if (inChat(event.target) && event.deltaY < 0) followReplyRef.current = false;
    };
    const touchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const touchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY;
      if (inChat(event.target) && y > touchY) followReplyRef.current = false;
      touchY = y;
    };
    const key = (event: KeyboardEvent) => {
      if (inChat(event.target) && ["ArrowUp", "PageUp", "Home"].includes(event.key))
        followReplyRef.current = false;
    };
    const scroll = () => {
      const y = window.scrollY;
      if (y < lastScrollYRef.current - 1) followReplyRef.current = false;
      else if (
        y > lastScrollYRef.current &&
        document.documentElement.scrollHeight - y - window.innerHeight < 80
      )
        followReplyRef.current = true;
      lastScrollYRef.current = y;
    };
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll);
    };
  }, []);
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);
  useEffect(() => {
    const hour = new Date().getHours();
    setDayPart(hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening");
  }, []);
  useEffect(() => {
    if (!isLoading) {
      setElapsedSec(0);
      return;
    }
    if (!turnStartedAtRef.current) turnStartedAtRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - turnStartedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoading]);
  const askBarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = askBarRef.current;
    if (!bar) return;
    const publish = () => {
      const room = Math.ceil(bar.getBoundingClientRect().height) + 70;
      setDockClearance(document.body, room > ASK_BAR_DEFAULT_CLEARANCE ? `${room}px` : null);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.body.style.removeProperty("--dock-clearance");
    };
  }, [consoleSlot]);
  useLayoutEffect(() => {
    const selection = composerSelection.current;
    composerSelection.current = null;
    const input = inputRef.current;
    if (!selection || !input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(selection.start, selection.end, selection.direction);
    input.scrollTop = selection.scrollTop;
  }, [consoleSlot]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 640px)");
    const syncConsoleSlot = () => {
      const slot = document.getElementById(CONSOLE_SLOT_ID);
      const host = slot?.parentElement ?? slot;
      const visible =
        !desktop.matches &&
        slot?.isConnected &&
        host &&
        (typeof host.checkVisibility !== "function" || host.checkVisibility());
      const nextSlot = visible ? slot : null;
      const input = inputRef.current;
      const moving = input && (nextSlot ? !nextSlot.contains(input) : !input.closest(".ask-bar"));
      if (moving && document.activeElement === input) {
        composerSelection.current = {
          start: input.selectionStart,
          end: input.selectionEnd,
          direction: input.selectionDirection,
          scrollTop: input.scrollTop,
        };
      }
      setConsoleSlot(nextSlot);
    };
    syncConsoleSlot();
    desktop.addEventListener("change", syncConsoleSlot);
    const onReturn = () => {
      if (document.visibilityState === "hidden") return;
      syncConsoleSlot();
      if (!abortRef.current && !pendingPollRef.current) {
        void loadHistory()
          .then((historyMessages) => {
            if (historyMessages.length > 0) {
              setMessages((cur) => (historyMessages.length >= cur.length ? historyMessages : cur));
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      desktop.removeEventListener("change", syncConsoleSlot);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [loadHistory]);
  function stopTurn(
    reason: string,
    opts: {
      keepPending?: boolean;
    } = {},
  ) {
    const thread = threadRef.current;
    abortRef.current?.abort(reason);
    abortRef.current = null;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (pendingPollRef.current) {
      clearInterval(pendingPollRef.current);
      pendingPollRef.current = null;
    }
    if (!opts.keepPending) writePending(thread, null);
    setStreamText("");
    setToolActivity([]);
    setToolResultSeq(0);
    setDecidingNext(false);
    setThinking(false);
    if (thinkingFallbackRef.current) {
      clearTimeout(thinkingFallbackRef.current);
      thinkingFallbackRef.current = null;
    }
    setIsLoading(false);
    setReconnecting(false);
    turnStartedAtRef.current = 0;
  }
  async function stagePhoto(file: File, othersDropped = 0) {
    const uploadThread = threadRef.current;
    const problem = attachmentProblem(file);
    if (problem) {
      setSendError(problem);
      return;
    }
    setUploadingPhoto(true);
    setSendError(null);
    try {
      const res = await fetch("/api/chat/media", {
        method: "POST",
        headers: {
          "content-type": attachmentContentType(file.name, file.type) ?? "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name || "attachment"),
        },
        body: file,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
      const body = (await res.json()) as {
        mediaId: string;
        fileName: string;
        note?: string;
      };
      const oneAtATime = othersDropped
        ? "Scout takes one file at a time, so only this one was attached."
        : "";
      if (threadRef.current === uploadThread)
        setStagedPhoto({
          mediaId: body.mediaId,
          fileName: body.fileName,
          note: [body.note, oneAtATime].filter(Boolean).join(" ") || undefined,
        });
    } catch (err) {
      if (threadRef.current === uploadThread)
        setSendError((err as Error).message || "Could not attach the file.");
    } finally {
      setUploadingPhoto(false);
    }
  }
  useEffect(() => {
    dropFileRef.current = (file, othersDropped) => {
      if (!uploadingPhoto) void stagePhoto(file, othersDropped);
    };
  });
  async function send(textOverride?: string, fresh = false) {
    if (textOverride === undefined && uploadingPhoto) return;
    stopDictation();
    const raw = (textOverride ?? input).trim();
    const marker =
      textOverride === undefined && stagedPhoto
        ? attachmentMarker(stagedPhoto.mediaId, stagedPhoto.fileName)
        : null;
    const attachmentPrompt = marker?.startsWith("[Document")
      ? "Review this document and show me the extracted data. Don't change CRM records or contact anyone until I confirm."
      : "";
    const text = marker
      ? `${raw || attachmentPrompt}${raw || attachmentPrompt ? "\n\n" : ""}${marker}`
      : raw;
    if (!text) return;
    if (fresh) {
      stopTurn(SWITCHED, { keepPending: true });
      threadRef.current = mintThreadId();
      window.localStorage.setItem(THREAD_STORAGE_KEY, threadRef.current);
      setMessages([welcomeBubble()]);
    }
    if (isLoading && !fresh) {
      if (abortRef.current) return;
      stopTurn(STOPPED);
    }
    if (marker) setStagedPhoto(null);
    setInput("");
    setSendError(null);
    const now = Date.now();
    const localId = `local-${now}`;
    const priorTurns = fresh
      ? 0
      : messages.filter(
          (m) => m.role === "user" && m.text.trim() === text && !unsentRef.current.has(m.id),
        ).length;
    setMessages((cur) => [
      ...cur,
      {
        id: localId,
        role: "user",
        text,
        at: new Date(now).toISOString(),
      },
    ]);
    engagedRef.current = true;
    followReplyRef.current = true;
    sendSeqRef.current += 1;
    const titleThread = threadRef.current;
    rememberThread(threadRef.current, text.replace(ATTACHMENT_LINE, "$2"));
    setThreadList(listThreads());
    setIsLoading(true);
    setStreamText("");
    setToolActivity([]);
    setToolResultSeq(0);
    setDecidingNext(false);
    setThinking(false);
    if (thinkingFallbackRef.current) {
      clearTimeout(thinkingFallbackRef.current);
    }
    thinkingFallbackRef.current = setTimeout(() => {
      setThinking(true);
    }, 2500);
    turnStartedAtRef.current = now;
    writePending(threadRef.current, { text, startedAt: now, priorTurns });
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrentTurn = () => abortRef.current === controller;
    const armIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => controller.abort(IDLE_TIMEOUT),
        STREAM_IDLE_TIMEOUT_MS,
      );
    };
    armIdleTimer();
    const streamTurn = async (
      res: Response,
    ): Promise<{
      full: string;
      sawDone: boolean;
      streamError: string;
    }> => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let full = "";
      let sawDone = false;
      let snapshotPending = false;
      let streamError = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!isCurrentTurn()) break;
          armIdleTimer();
          buffered += decoder.decode(value, { stream: true });
          const events = buffered.split("\n\n");
          buffered = events.pop() ?? "";
          for (const event of events) {
            for (const line of event.split("\n")) {
              if (!line.startsWith("data:")) continue;
              try {
                const payload = JSON.parse(line.slice(5)) as {
                  delta?: string;
                  snapshot?: string;
                  done?: boolean;
                  error?: string;
                  keepalive?: boolean;
                  tool?: {
                    label?: string;
                    phase?: string;
                    isError?: boolean;
                  };
                  thinking?: boolean;
                };
                if (payload.thinking) {
                  setThinking(true);
                }
                if (payload.tool && typeof payload.tool.label === "string") {
                  setThinking(false);
                  const { label, phase, isError } = payload.tool;
                  setToolActivity((cur) => {
                    if (phase === "start") {
                      const existing = cur.find((a) => a.label === label);
                      if (existing) {
                        return cur.map((a) =>
                          a.label === label ? { ...a, pending: a.pending + 1 } : a,
                        );
                      }
                      return [...cur, { label, pending: 1 }];
                    }
                    if (phase === "result") {
                      setToolResultSeq((n) => n + 1);
                      return cur.map((a) =>
                        a.label === label
                          ? {
                              ...a,
                              pending: Math.max(0, a.pending - 1),
                              ...(isError ? { isError: true } : {}),
                            }
                          : a,
                      );
                    }
                    return cur;
                  });
                }
                if (payload.error) {
                  streamError = payload.error;
                }
                if (payload.done) {
                  sawDone = true;
                }
                if (typeof payload.snapshot === "string" && payload.snapshot) {
                  full = payload.snapshot;
                  snapshotPending = true;
                  setStreamText(full);
                }
                if (payload.delta) {
                  full = snapshotPending ? payload.delta : full + payload.delta;
                  snapshotPending = false;
                  setStreamText(full);
                }
              } catch {}
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          throw err;
        }
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return { full, sawDone, streamError };
    };
    const recoverTurn = async (): Promise<
      | {
          kind: "replied";
          history: ChatBubble[];
        }
      | {
          kind: "lost";
        }
      | {
          kind: "gone";
        }
      | {
          kind: "aborted";
        }
    > => {
      const deadline = Date.now() + RECOVERY_WINDOW_MS;
      let absentReads = 0;
      for (;;) {
        if (!isCurrentTurn() || controller.signal.aborted) {
          return { kind: "aborted" };
        }
        try {
          const history = await loadHistory();
          if (repliedTo(history, text, priorTurns)) {
            return { kind: "replied", history };
          }
          if (!turnInHistory(history, text, priorTurns)) {
            absentReads++;
            if (absentReads >= RECOVERY_ABSENT_READS) {
              return { kind: "lost" };
            }
          } else {
            absentReads = 0;
          }
        } catch {}
        if (Date.now() >= deadline) {
          return { kind: "gone" };
        }
        await new Promise((resolve) => {
          setTimeout(resolve, RECOVERY_POLL_INTERVAL_MS);
        });
      }
    };
    let landed = false;
    try {
      let retriesUsed = 0;
      for (;;) {
        if (!isCurrentTurn() || controller.signal.aborted) {
          return;
        }
        let res: Response | null = null;
        let edgeFailure: Error | null = null;
        try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-scout-chat-thread": threadRef.current,
            },
            body: JSON.stringify({ message: text }),
            signal: controller.signal,
          });
        } catch (err) {
          if (controller.signal.aborted) {
            throw err;
          }
          edgeFailure = err instanceof Error ? err : new Error(String(err));
        }
        if (res && RETRYABLE_SEND_STATUSES.has(res.status)) {
          edgeFailure = new Error(`Send failed (${res.status}) - try again`);
        }
        if (res && !edgeFailure) {
          if (!res.ok || !res.body) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(data.error ?? `Send failed (${res.status}) - try again`);
          }
          setReconnecting(false);
          landed = true;
          const { full, sawDone, streamError } = await streamTurn(res);
          if (!isCurrentTurn()) return;
          if (streamError) {
            throw new Error(streamError);
          }
          if (sawDone) {
            if (!full) {
              throw new Error("Scout did not answer that - try again.");
            }
            setMessages((cur) => [
              ...cur,
              {
                id: `scout-${Date.now()}`,
                role: "scout",
                text: full,
                at: new Date().toISOString(),
              },
            ]);
            return;
          }
          setReconnecting(true);
          const outcome = await recoverTurn();
          if (outcome.kind === "aborted") {
            return;
          }
          if (outcome.kind === "replied") {
            if (!isCurrentTurn()) return;
            setMessages(outcome.history.length > 0 ? outcome.history : [welcomeBubble()]);
            return;
          }
          if (outcome.kind === "gone") {
            throw new Error(
              "Lost the connection to Scout mid-answer - that may not have gone through. Send it again.",
            );
          }
          landed = false;
          edgeFailure = new Error("message never landed");
        }
        if (retriesUsed >= SEND_RETRY_DELAYS_MS.length) {
          throw new Error(
            "Couldn't reach Scout - it may be mid-update. That message didn't go through - send it again in a moment.",
          );
        }
        setReconnecting(true);
        const delay = SEND_RETRY_DELAYS_MS[retriesUsed];
        retriesUsed++;
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    } catch (err) {
      if (controller.signal.reason === NAVIGATED) return;
      if (!isCurrentTurn()) return;
      if (!landed) unsentRef.current.add(localId);
      const timedOut = controller.signal.reason === IDLE_TIMEOUT;
      setSendError(timedOut ? "Scout stopped responding - try that again." : errorText(err));
    } finally {
      titleAttemptsRef.current.delete(titleThread);
      if (controller.signal.reason !== NAVIGATED && isCurrentTurn()) stopTurn(STOPPED);
    }
  }
  function resumePendingTurn(thread: string) {
    const pending = readPending(thread);
    if (!pending || threadRef.current !== thread) {
      return;
    }
    engagedRef.current = true;
    followReplyRef.current = true;
    setMessages((cur) =>
      cur.some((m) => m.role === "user" && m.text === pending.text)
        ? cur
        : [
            ...cur,
            {
              id: `pending-${pending.startedAt}`,
              role: "user",
              text: pending.text,
              at: new Date(pending.startedAt).toISOString(),
            },
          ],
    );
    setIsLoading(true);
    turnStartedAtRef.current = pending.startedAt;
    const pollThread = thread;
    const pollIsCurrent = () => threadRef.current === pollThread;
    const stopPolling = () => {
      if (pendingPollRef.current) clearInterval(pendingPollRef.current);
      pendingPollRef.current = null;
    };
    stopPolling();
    pendingPollRef.current = setInterval(async () => {
      const timedOut = Date.now() - pending.startedAt > PENDING_POLL_TIMEOUT_MS;
      const giveUp = () => {
        stopPolling();
        if (!pollIsCurrent()) return;
        setIsLoading(false);
        writePending(pollThread, null);
        setSendError("Scout never answered that one - send it again.");
      };
      try {
        const history = await loadHistory();
        if (!pollIsCurrent()) {
          stopPolling();
          return;
        }
        if (repliedTo(history, pending.text, pending.priorTurns ?? 0)) {
          setMessages(history.length > 0 ? history : [welcomeBubble()]);
          setIsLoading(false);
          writePending(pollThread, null);
          stopPolling();
        } else if (timedOut) {
          giveUp();
        }
      } catch {
        if (timedOut) {
          giveUp();
        }
      }
    }, PENDING_POLL_INTERVAL_MS);
  }
  resumePendingTurnRef.current = resumePendingTurn;
  const selectChatRef = useRef<(id: string | null) => void>(() => {});
  selectChatRef.current = (id) => {
    if (id) void switchThread(id);
    else newChat();
  };
  useEffect(() => {
    const select = (event: Event) => {
      const id: unknown = (event as CustomEvent).detail;
      if (id === null || (typeof id === "string" && /^[a-z0-9-]{1,40}$/.test(id))) {
        selectChatRef.current(id);
      }
    };
    window.addEventListener("scout-select-chat", select);
    return () => window.removeEventListener("scout-select-chat", select);
  }, []);
  async function switchThread(id: string) {
    if (id === threadRef.current) {
      return;
    }
    stopTurn(SWITCHED, { keepPending: true });
    engagedRef.current = true;
    followReplyRef.current = true;
    window.localStorage.setItem(THREAD_STORAGE_KEY, id);
    threadRef.current = id;
    setStagedPhoto(null);
    setMessages([welcomeBubble()]);
    setSendError(null);
    const seqAtSwitch = sendSeqRef.current;
    try {
      const restored = await loadHistory();
      if (threadRef.current === id && sendSeqRef.current === seqAtSwitch) {
        setMessages(restored.length > 0 ? restored : [welcomeBubble()]);
        resumePendingTurn(id);
      }
    } catch {}
  }
  function newChat() {
    const currentMeta = threadList.find((t) => t.id === threadRef.current);
    const conversationBlank = messages.length <= 1 && !currentMeta?.title;
    if (conversationBlank && !isLoading) {
      inputRef.current?.focus();
      return;
    }
    stopTurn(STOPPED);
    const minted = mintThreadId();
    window.localStorage.setItem(THREAD_STORAGE_KEY, minted);
    threadRef.current = minted;
    setStagedPhoto(null);
    setMessages([welcomeBubble()]);
    setSendError(null);
    inputRef.current?.focus();
  }
  function commitRename() {
    const id = renamingId;
    if (!id) return;
    renameThread(id, renameDraft);
    setThreadList(listThreads());
    setRenamingId(null);
    setRenameDraft("");
  }
  function togglePin(id: string, pinned: boolean) {
    pinThread(id, pinned);
    setThreadList(listThreads());
  }
  function deleteThread(id: string) {
    if (id === threadRef.current) {
      resetChat();
    } else {
      removeThread(id);
      setThreadList(listThreads());
    }
  }
  function resetChat() {
    stopTurn(STOPPED);
    removeThread(threadRef.current);
    const minted = mintThreadId();
    window.localStorage.setItem(THREAD_STORAGE_KEY, minted);
    threadRef.current = minted;
    setThreadList(listThreads());
    setMessages([welcomeBubble()]);
    setSendError(null);
  }
  function speechEngine(): (new () => SpeechRecognitionLike) | undefined {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }
  function cleanDictation(raw: string): string {
    const t = raw.replace(/\s+/g, " ").trim();
    return t ? t[0].toUpperCase() + t.slice(1) : "";
  }
  function startDictation() {
    const Engine = speechEngine();
    if (!Engine || listeningRef.current) return;
    setRecordError(null);
    const rec = new Engine();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    dictationBaseRef.current = input.trim();
    dictationFinalsRef.current = "";
    rec.onresult = (e) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finals += ` ${transcript}`;
        else interim += ` ${transcript}`;
      }
      dictationFinalsRef.current = finals;
      const spoken = cleanDictation(`${finals} ${interim}`);
      setInput([dictationBaseRef.current, spoken].filter(Boolean).join(" "));
    };
    rec.onend = () => {
      if (!listeningRef.current) {
        setIsListening(false);
        return;
      }
      const finals = cleanDictation(dictationFinalsRef.current);
      if (finals) {
        dictationBaseRef.current = [dictationBaseRef.current, finals].filter(Boolean).join(" ");
        dictationFinalsRef.current = "";
      }
      try {
        rec.start();
      } catch {}
    };
    rec.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        listeningRef.current = false;
        setIsListening(false);
        setRecordError("Mic permission denied - enable it in your browser settings.");
      }
    };
    recognitionRef.current = rec;
    listeningRef.current = true;
    setIsListening(true);
    rec.start();
    inputRef.current?.focus();
  }
  function stopDictation() {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setIsListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    inputRef.current?.focus();
  }
  async function startRecording() {
    setRecordError(null);
    if (startingRef.current || isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordError("Microphone isn't supported in this browser.");
      return;
    }
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        setIsRecording(false);
        if (blob.size < 1000) {
          setRecordError(
            "That recording was too short to hear - tap the mic, speak for a moment, then tap again to stop.",
          );
          return;
        }
        setIsTranscribing(true);
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": blob.type },
            body: blob,
          });
          const data = (await res.json().catch(() => ({}))) as {
            transcript?: string;
            error?: string;
          };
          if (!res.ok) {
            setRecordError(data.error ?? `Transcription failed (${res.status}). Try again.`);
            return;
          }
          const transcript = (data.transcript ?? "").trim();
          if (!transcript) {
            setRecordError("Didn't catch that - try again.");
            return;
          }
          setInput((cur) => (cur.trim() ? `${cur.trim()} ${transcript}` : transcript));
          inputRef.current?.focus();
        } catch (err) {
          setRecordError(errorText(err));
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      startingRef.current = false;
    } catch (err) {
      startingRef.current = false;
      setRecordError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Mic permission denied - enable it in your browser settings."
          : err instanceof Error
            ? err.message
            : "Couldn't start recording.",
      );
    }
  }
  function toggleVoice() {
    if (isTranscribing) return;
    if (isListening) {
      stopDictation();
    } else if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      mediaRecorderRef.current = null;
    } else if (speechEngine()) {
      startDictation();
    } else {
      void startRecording();
    }
  }
  const conversationEmpty = messages.every((m) => m.id === "welcome");
  const setWelcome = useBuddyStore((state) => state.setWelcome);
  useEffect(() => {
    setWelcome(conversationEmpty);
    return () => setWelcome(false);
  }, [conversationEmpty, setWelcome]);
  const composerStatus = Boolean(
    sendError ||
    recordError ||
    isListening ||
    isRecording ||
    isTranscribing ||
    uploadingPhoto ||
    stagedPhoto,
  );
  const composerRow = (
    <div className="scout-composer-row relative flex items-end gap-2">
      <ScoutBuddy />
      {composerStatus && (
        <div
          className="absolute bottom-full left-0 right-0 mb-3 rounded-2xl bg-paper px-4 py-2.5 text-body text-ink shadow-card"
          role="status"
        >
          {sendError ? (
            <span className="text-alarm">{sendError}</span>
          ) : recordError ? (
            <span className="text-alarm">{recordError}</span>
          ) : isListening ? (
            <span className="inline-flex items-center gap-2 text-terracotta-deep">
              <span className="h-2 w-2 animate-pulse rounded-full bg-terracotta" />
              Listening… speak away, tap the mic when you&apos;re done
            </span>
          ) : isRecording ? (
            <span className="inline-flex items-center gap-2 text-alarm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-alarm" />
              Recording… tap the mic to stop
            </span>
          ) : isTranscribing ? (
            <span className="inline-flex items-center gap-2 text-ink-2">
              <Loader2 size={16} strokeWidth={1.8} className="animate-spin" />
              Transcribing…
            </span>
          ) : uploadingPhoto ? (
            <span className="inline-flex items-center gap-2 text-ink-2">
              <Loader2 size={16} strokeWidth={1.8} className="animate-spin" />
              Reading attachment…
            </span>
          ) : stagedPhoto ? (
            <span className="-my-1 -mr-2 flex items-center gap-2.5 text-ink">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-ink-2">
                <AttachmentIcon mediaId={stagedPhoto.mediaId} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{stagedPhoto.fileName}</span>
                {stagedPhoto.note && (
                  <span className="block text-label text-ink-3">{stagedPhoto.note}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStagedPhoto(null)}
                aria-label="Remove attachment"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </span>
          ) : null}
        </div>
      )}
      {features.chatPhotoAttach && (
        <>
          <input
            id="chat-photo-picker"
            type="file"
            accept={ATTACH_ACCEPT}
            aria-label="File to attach"
            className="peer sr-only"
            disabled={uploadingPhoto}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void stagePhoto(file);
            }}
          />
          <label
            htmlFor="chat-photo-picker"
            title={ATTACH_TITLE}
            className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta/70 hover:bg-paper-2 hover:text-ink sm:mb-0.5 ${uploadingPhoto ? "pointer-events-none opacity-50" : ""}`}
          >
            <Plus size={21} strokeWidth={1.8} />
          </label>
        </>
      )}
      {(micAvailable || speechSupported) && (
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={
            isListening ? "Stop dictating" : isRecording ? "Stop recording" : "Dictate a message"
          }
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:mb-0.5 ${
            isListening
              ? "bg-terracotta text-on-accent"
              : isRecording
                ? "bg-alarm-tint text-alarm"
                : "text-ink-2 hover:bg-paper-2 hover:text-ink"
          }`}
        >
          {isListening && (
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full bg-terracotta/40"
            />
          )}
          <Mic size={20} strokeWidth={1.8} className="relative" />
        </button>
      )}
      <GrowingTextarea
        id="scout-composer"
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onPaste={(e) => {
          const files = e.clipboardData?.files;
          if (
            !features.chatPhotoAttach ||
            uploadingPhoto ||
            !files?.length ||
            e.clipboardData.getData("text/plain").trim()
          )
            return;
          e.preventDefault();
          void stagePhoto(files[0], files.length - 1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Ask Scout anything..."
        className="min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-body-lg text-ink outline-none placeholder:text-ink-3 sm:min-h-11 sm:py-2.5"
      />

      {isLoading ? (
        <button
          type="button"
          onClick={() => stopTurn(STOPPED)}
          aria-label="Stop"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-ink-2 sm:mb-0.5"
        >
          <Square size={13} fill="currentColor" strokeWidth={0} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void send()}
          disabled={uploadingPhoto || (input.trim().length === 0 && !stagedPhoto)}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terracotta text-on-accent transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:bg-tan-soft disabled:text-ink-4 sm:mb-0.5"
        >
          <ArrowUp size={20} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
  const composer = consoleSlot?.isConnected ? (
    createPortal(
      <div className="mb-2 w-[min(40rem,calc(100vw-var(--shell-left,0px)-3rem))] px-1">
        {composerRow}
      </div>,
      consoleSlot,
    )
  ) : (
    <div
      ref={askBarRef}
      className="ask-bar fixed bottom-7 z-40 w-[min(48rem,calc(100%-var(--shell-left,0px)-3rem))] -translate-x-1/2 rounded-[33px] p-2 pl-3 sm:p-2.5 sm:pl-4"
      style={{ left: "calc(50% + var(--shell-left, 0px) / 2)" }}
    >
      {composerRow}
    </div>
  );
  const threadRow = (t: ThreadMeta) => {
    const active = t.id === threadRef.current;
    const label = threadTitle(t);
    if (renamingId === t.id) {
      return (
        <form
          key={t.id}
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
          className="flex min-h-10 items-center rounded-full bg-paper px-4"
        >
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setRenamingId(null);
              }
            }}
            aria-label={`Rename ${label}`}
            className="w-full bg-transparent text-body text-ink outline-none"
          />
        </form>
      );
    }
    const rowAction =
      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 opacity-70 transition-[opacity,color,background-color] hover:bg-paper-2 hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100";
    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer?.setData("text/plain", t.id);
          setDraggingId(t.id);
        }}
        onDragEnd={() => setDraggingId(null)}
        onMouseLeave={() => setConfirmDeleteId((c) => (c === t.id ? null : c))}
        className={`group/row relative flex min-h-10 items-center rounded-full transition-colors ${active ? "bg-paper" : "hover:bg-paper"}`}
      >
        <button
          type="button"
          onClick={() => void switchThread(t.id)}
          title={`${label} · ${threadAge(t.lastAt, clock)}`}
          className={`min-w-0 flex-1 py-2 pl-4 text-left text-body ${
            confirmDeleteId === t.id
              ? "pr-28"
              : "pr-4 sm:group-focus-within/row:pr-24 sm:group-hover/row:pr-24"
          } ${active ? "font-semibold text-ink" : "text-ink-2"}`}
        >
          <span className="block truncate">{label}</span>
        </button>
        <div className="absolute inset-y-0 right-1 flex items-center">
          <button
            type="button"
            onClick={() => togglePin(t.id, !t.pinned)}
            aria-label={`${t.pinned ? "Unpin" : "Pin"} ${label}`}
            title={t.pinned ? "Unpin" : "Pin this chat"}
            className={rowAction}
          >
            <Pin size={15} strokeWidth={1.8} className={t.pinned ? "fill-current" : undefined} />
          </button>
          <button
            type="button"
            onClick={() => {
              setRenamingId(t.id);
              setRenameDraft(label);
            }}
            aria-label={`Rename ${label}`}
            title="Rename"
            className={rowAction}
          >
            <Pencil size={15} strokeWidth={1.8} />
          </button>
          {confirmDeleteId === t.id ? (
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteId(null);
                deleteThread(t.id);
              }}
              aria-label={`Confirm delete ${label}`}
              title="This removes the chat for good"
              className="flex h-7 shrink-0 items-center justify-center rounded-full px-2.5 text-label font-semibold text-alarm transition-colors hover:bg-alarm-tint"
            >
              Sure?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(t.id)}
              aria-label={`Delete chat ${label}`}
              title="Delete this chat"
              className={`${rowAction} hover:text-alarm`}
            >
              <Trash2 size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    );
  };
  const pinnedThreads = threadList.filter((t) => t.pinned);
  const recentThreads = threadList.filter((t) => !t.pinned);
  const shownRecents = showAllRecents
    ? recentThreads
    : recentThreads.filter((t, i) => i < RECENT_CHATS || t.id === threadRef.current);
  const sectionLabel = "px-4 pt-4 pb-1.5 text-label font-semibold text-ink-3";
  const libraryRows = (
    <>
      {(pinnedThreads.length > 0 || draggingId !== null) && (
        <div
          role="group"
          aria-label="Pinned chats"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (draggingId) togglePin(draggingId, true);
            setDraggingId(null);
          }}
          className={`space-y-0.5 rounded-3xl transition-colors ${draggingId !== null ? "bg-terracotta-tint pb-1" : ""}`}
        >
          <p className={sectionLabel}>Pinned</p>
          {pinnedThreads.map(threadRow)}
          {pinnedThreads.length === 0 && (
            <p className="px-4 py-2 text-body text-ink-3">Drop here to pin</p>
          )}
        </div>
      )}
      <div
        role="group"
        aria-label="Recent chats"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingId) togglePin(draggingId, false);
          setDraggingId(null);
        }}
        className="space-y-0.5"
      >
        {recentThreads.length > 0 && <p className={sectionLabel}>Recent</p>}
        {shownRecents.map(threadRow)}
        {shownRecents.length < recentThreads.length && (
          <button
            type="button"
            onClick={() => setShowAllRecents(true)}
            className="flex min-h-10 w-full items-center rounded-full px-4 text-left text-body text-ink-3 transition-colors hover:bg-paper hover:text-ink"
          >
            See all
          </button>
        )}
      </div>
    </>
  );
  const railLink =
    "flex min-h-10 w-full items-center gap-3 rounded-full px-4 text-left text-body font-semibold transition-colors hover:bg-paper";
  const newChatPill = (
    <button type="button" onClick={newChat} className={`${railLink} text-ink`}>
      <Plus size={19} strokeWidth={1.8} />
      New chat
    </button>
  );
  const railInner = (
    <>
      <div className="px-1 pb-1">{newChatPill}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {libraryRows}
        {threadList.length === 0 && (
          <p className="px-4 py-2 text-body text-ink-3">Your conversations will collect here.</p>
        )}
      </div>

      <div className="px-1 pt-1">
        <a href="/report" className={`${railLink} text-ink-2 hover:text-ink`}>
          <FileText size={19} strokeWidth={1.8} />
          Monthly report
        </a>
      </div>
    </>
  );
  const desktopRail = sidebarChatsSlot ? (
    createPortal(
      <div className="flex min-h-0 flex-1 flex-col" role="complementary" aria-label="Chats">
        {railInner}
      </div>,
      sidebarChatsSlot,
    )
  ) : (
    <>
      <aside
        aria-label="Chats"
        inert={!railOpen}
        className={`fixed top-20 bottom-6 left-[calc(var(--shell-left,0px)+12px)] z-40 hidden w-[264px] flex-col rounded-[28px] bg-paper-2/95 px-2 pb-3 shadow-lift backdrop-blur-md transition-transform duration-200 sm:flex ${railOpen ? "translate-x-0" : "pointer-events-none -translate-x-[130%]"}`}
      >
        <div className="flex items-center justify-between pt-3 pr-1 pb-2 pl-5">
          <span className="text-title font-semibold text-ink">Chats</span>
          <button
            type="button"
            onClick={() => setRailOpen(false)}
            aria-label="Collapse chats"
            aria-expanded={railOpen}
            title="Collapse"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-paper hover:text-ink"
          >
            <PanelLeftClose size={19} strokeWidth={1.8} />
          </button>
        </div>
        {railInner}
      </aside>

      {!railOpen && (
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          aria-label="Open chats"
          title="Chats"
          className="fixed top-20 left-[calc(var(--shell-left,0px)+12px)] z-40 hidden h-11 w-11 items-center justify-center rounded-full bg-paper text-ink-2 shadow-card transition-colors hover:text-ink sm:flex"
        >
          <MessagesSquare size={19} strokeWidth={1.8} />
        </button>
      )}
    </>
  );
  return (
    <div className="mobile-chat-scene flex flex-col">
      {desktopRail}

      <div className={conversationEmpty ? "sm:pt-4" : "sm:pt-2"}>
        <ActivityTicker onDiscuss={(q) => void send(q, true)} />
      </div>
      {conversationEmpty && (
        <header className="mobile-chat-welcome order-1 mx-auto mb-7 w-full max-w-3xl flex-col sm:mb-0 sm:flex sm:min-h-[calc(100vh-8rem-var(--dock-clearance,8.5rem))] sm:items-center sm:justify-center sm:text-center">
          <div className="animate-fadeIn stagger-1 mb-4 flex justify-center sm:mb-5">
            <div className="h-16 w-14 sm:h-24 sm:w-20">
              <ScoutBuddyPuppet />
            </div>
          </div>
          <ChatGreeting dayPart={dayPart} />

          <div>
            <p className="mt-3 text-body text-ink-3 sm:text-body-lg">What can I help with today?</p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {suggestions.starters.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => {
                    suggestions.select(starter.id);
                    void send(starter.prompt, true);
                  }}
                  className="min-h-11 rounded-full bg-paper-2 px-4 py-2 text-body text-ink transition-colors hover:bg-tan-soft active:bg-tan-soft"
                >
                  {starter.title}
                </button>
              ))}
            </div>
          </div>
        </header>
      )}
      {!conversationEmpty && awayFromLatest && (
        <button
          type="button"
          aria-label="Jump to the latest message"
          onClick={jumpToLatest}
          className="chat-jump-latest animate-fadeIn flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink shadow-lift transition-colors hover:bg-paper-2"
        >
          <ArrowDown size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      <div className={`order-2 ${composerStatus ? "invisible" : ""}`}>
        <ScoutPriorities onDiscuss={(q) => void send(q, true)} />
      </div>
      <div className="order-3 mx-auto w-full min-w-0 max-w-3xl">
        {!conversationEmpty && (
          <div className="flex items-center justify-between pt-2 pb-6">
            <div className="flex items-center gap-2.5">
              <ScoutBrandMark size={28} />
              <span className="text-body-lg font-semibold text-ink">Scout</span>
              <span className="flex items-center gap-1.5 text-label text-ink-3">
                <span className="h-2 w-2 rounded-full bg-sage" />
                Online
              </span>
            </div>
            <button
              type="button"
              onClick={resetChat}
              className="flex min-h-10 items-center gap-2 rounded-full px-3.5 text-body text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
              title="Clear conversation"
            >
              <Trash2 size={16} strokeWidth={1.8} />
              <span>Clear</span>
            </button>
          </div>
        )}

        <div aria-label="Conversation" className="space-y-6 pt-2">
          {(conversationEmpty ? [] : messages).map((msg, idx) => {
            const key = dayKey(msg.at, clock);
            const showDayDivider = key !== "" && key !== dayKey(messages[idx - 1]?.at, clock);
            const mine = msg.role === "user";
            return (
              <Fragment key={msg.id}>
                {showDayDivider && msg.at && (
                  <p className="pt-2 text-center text-label font-medium text-ink-3">
                    {formatDay(msg.at, clock)}
                  </p>
                )}
                <div
                  className={`group/msg animate-fadeIn flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  {mine ? (
                    <div className="max-w-[85%] overflow-hidden break-words rounded-3xl bg-terracotta-tint px-4 py-2.5 text-body-lg text-ink sm:max-w-[75%]">
                      {msg.text.split("\n").map((line, i) => (
                        <p key={i} className={i > 0 ? "mt-1.5" : ""}>
                          {ATTACHMENT_LINE.test(line) ? (
                            <span className="inline-flex items-center gap-2">
                              <AttachmentIcon
                                mediaId={line.match(/mediaId ([^ ]+)/)?.[1] ?? ""}
                                size={18}
                              />
                              {line.match(ATTACHMENT_LINE)?.[2]}
                            </span>
                          ) : (
                            renderProse(line)
                          )}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className={SCOUT_PROSE}>{renderScoutBlocks(msg.text)}</div>
                  )}
                  <p className="mt-1 hidden px-1 text-label text-ink-3 opacity-0 transition-opacity group-hover/msg:opacity-100 [@media(hover:hover)]:block">
                    {formatTime(msg.at, clock)}
                  </p>
                </div>
              </Fragment>
            );
          })}

          {isLoading && (
            <div className={`animate-fadeIn ${SCOUT_PROSE}`}>
              {toolActivity.length > 0 && (
                <div className={`space-y-1 ${streamText ? "mb-3" : ""}`}>
                  {toolActivity.map((a) => (
                    <div key={a.label} className="flex items-center gap-2 text-body text-ink-3">
                      {a.pending > 0 ? (
                        <Loader2
                          size={16}
                          strokeWidth={1.8}
                          className="shrink-0 animate-spin text-terracotta"
                        />
                      ) : a.isError ? (
                        <span className="w-4 shrink-0 text-center font-bold text-terracotta">
                          !
                        </span>
                      ) : (
                        <Check size={16} strokeWidth={1.8} className="shrink-0 text-moss" />
                      )}
                      <span>
                        {a.label}
                        {a.isError ? " - hit a snag" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {streamText ? (
                renderScoutBlocks(streamText)
              ) : (
                <>
                  {toolActivity.length === 0 ? (
                    <div className="flex items-center gap-2 text-body text-ink-3">
                      <Loader2
                        size={16}
                        strokeWidth={1.8}
                        className="shrink-0 animate-spin text-terracotta"
                      />
                      {reconnecting
                        ? "Reconnecting to Scout…"
                        : thinking
                          ? "Thinking it through…"
                          : "Scout is working…"}
                    </div>
                  ) : (
                    toolActivity.every((activity) => activity.pending === 0) && (
                      <div
                        role="status"
                        className="mt-1 flex items-center gap-2 text-body text-ink-3"
                      >
                        <Loader2
                          size={16}
                          strokeWidth={1.8}
                          className="shrink-0 animate-spin text-terracotta"
                        />
                        {decidingNext
                          ? "Deciding what to check next…"
                          : "Putting your answer together…"}
                      </div>
                    )
                  )}
                  {elapsedSec >= 30 && (
                    <p className="mt-2 text-body text-ink-3">
                      Still on it - {elapsedSec}s. Big questions can take a minute or two.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div ref={messagesEndRef} className="scroll-mb-[var(--dock-clearance,8.5rem)]" />
        </div>
      </div>

      {composer}
      {dropActive &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-paper/85 p-6"
          >
            <div className="flex flex-col items-center gap-3 rounded-[28px] bg-paper-2 px-10 py-9 text-center shadow-card">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-tint text-terracotta-deep">
                <Paperclip size={24} strokeWidth={1.8} />
              </span>
              <p className="text-title text-ink">Drop to attach</p>
              <p className="max-w-sm text-body text-ink-2">
                Photos, videos, PDFs, Word, Excel, CSV or text files.
                <br />
                One file, up to 10 MB.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
function AttachmentIcon({ mediaId, size }: { mediaId: string; size: number }) {
  const kind = kindOfMediaId(mediaId);
  const Icon =
    kind === "Photo"
      ? ImageIcon
      : kind === "Video"
        ? Video
        : /\.(xlsx|xls|csv)$/.test(mediaId)
          ? FileSpreadsheet
          : FileText;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
