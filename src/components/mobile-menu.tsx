"use client";
import { FileText, Menu, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { needsYouLabel } from "@/app/inbox/inbox-list";
import Wordmark from "@/components/wordmark";
import { workspaceNav } from "@/components/workspace-nav";
import {
  adoptThread,
  listThreads,
  pinThread,
  removeThread,
  renameThread,
  summarizeThread,
  threadTitle,
  type ThreadMeta,
} from "@/lib/chat-threads";
import { useInboxWaitingCount } from "@/lib/use-inbox-waiting";
const RECENT_CHATS = 5;
const LONG_PRESS_MS = 450;
const ROW = "flex min-h-12 items-center gap-3.5 rounded-2xl px-3.5 transition-colors";
export default function MobileMenu({ speedToLead = false }: { speedToLead?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const press = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    held: boolean;
    x: number;
    y: number;
  }>({ held: false, x: 0, y: 0 });
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [rename, setRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const waiting = useInboxWaitingCount(true);
  function close() {
    if (dialog.current?.open) dialog.current.close();
    setOpen(false);
  }
  useEffect(() => {
    close();
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    setThreads(listThreads());
    void fetch("/api/chat/threads", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then(
        (
          body: {
            threads?: ThreadMeta[];
          } | null,
        ) => {
          if (stopped || !Array.isArray(body?.threads)) return;
          for (const thread of body.threads) {
            if (typeof thread.id !== "string" || typeof thread.title !== "string") continue;
            adoptThread(thread.id, thread.title, thread.lastAt);
            if (typeof thread.summary === "string") summarizeThread(thread.id, thread.summary);
          }
          setThreads(listThreads());
        },
      )
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [open]);
  function selectThread(id: string | null) {
    close();
    if (pathname === "/chat") {
      window.dispatchEvent(new CustomEvent("scout-select-chat", { detail: id }));
      return;
    }
    if (id) window.localStorage.setItem("scout-chat-thread", id);
    else window.localStorage.removeItem("scout-chat-thread");
    router.push("/chat");
  }
  function pressStart(id: string, event: PointerEvent) {
    clearTimeout(press.current.timer);
    press.current = {
      held: false,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press.current.held = true;
        setActionsFor(id);
      }, LONG_PRESS_MS),
    };
  }
  function pressMove(event: PointerEvent) {
    if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10)
      clearTimeout(press.current.timer);
  }
  function pressEnd() {
    clearTimeout(press.current.timer);
  }
  const needle = query?.trim().toLowerCase() ?? "";
  const matching = needle
    ? threads.filter((thread) => threadTitle(thread).toLowerCase().includes(needle))
    : threads;
  const visible = needle || showAll ? matching : matching.slice(0, RECENT_CHATS);
  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="chrome-button relative flex items-center justify-center text-ink"
        onClick={() => {
          dialog.current?.showModal();
          dialog.current?.focus();
          setOpen(true);
        }}
      >
        <Menu size={21} strokeWidth={1.8} />
        {waiting > 0 && (
          <span
            aria-hidden="true"
            data-inbox-badge="menu-button"
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-ink px-1 text-[10px] font-bold text-paper"
          >
            {waiting > 9 ? "9+" : waiting}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        tabIndex={-1}
        aria-label="Navigation and chats"
        onClose={() => {
          setOpen(false);
          setActionsFor(null);
          setRename(null);
          setShowAll(false);
          setQuery(null);
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="mobile-menu quiet-focus m-0 h-dvh max-h-none w-[min(86vw,340px)] max-w-none rounded-r-[28px] bg-cream p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex min-h-full flex-col px-3 pt-[calc(1rem+var(--safe-t))] pb-[calc(1rem+var(--safe-b))]">
          <div className="mb-5 flex items-center justify-between pl-3.5">
            <Wordmark size="md" interactive />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={close}
              className="chrome-button flex items-center justify-center"
            >
              <X size={20} strokeWidth={1.8} />
            </button>
          </div>
          <nav aria-label="Workspaces" className="space-y-1">
            {workspaceNav(speedToLead).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                aria-current={
                  pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined
                }
                className={`${ROW} text-title font-semibold tracking-[-0.01em] active:bg-paper-2 aria-[current=page]:bg-terracotta-tint aria-[current=page]:text-terracotta-deep`}
              >
                <Icon size={21} strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {href === "/inbox" && waiting > 0 && (
                  <span
                    aria-label={needsYouLabel(waiting)}
                    className="flex h-[22px] min-w-[22px] items-center justify-center rounded-pill bg-ink px-1.5 text-label font-bold text-paper"
                  >
                    {waiting > 9 ? "9+" : waiting}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-6 flex-1">
            <button
              type="button"
              onClick={() => selectThread(null)}
              className={`${ROW} w-full text-body-lg font-semibold active:bg-paper-2`}
            >
              <Plus size={21} strokeWidth={1.8} />
              New chat
            </button>
            <div className="flex items-center justify-between pt-5 pr-1 pb-1 pl-3.5">
              <h2 className="text-body font-semibold text-ink-3">Recent chats</h2>
              {threads.length > 0 && (
                <button
                  type="button"
                  aria-label="Search chats"
                  aria-pressed={query !== null}
                  onClick={() => setQuery(query === null ? "" : null)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 active:bg-paper-2"
                >
                  <Search size={18} strokeWidth={1.8} />
                </button>
              )}
            </div>
            {query !== null && (
              <input
                autoFocus
                type="search"
                aria-label="Find a chat"
                placeholder="Find a chat"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="quiet-focus mx-1 mb-2 min-h-11 w-[calc(100%-0.5rem)] rounded-full bg-paper-2 px-4 text-body-lg text-ink placeholder:text-ink-4"
              />
            )}
            {visible.map((thread) => (
              <div key={thread.id} className="rounded-2xl">
                {rename?.id === thread.id ? (
                  <form
                    className="p-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      renameThread(rename.id, rename.title);
                      setThreads(listThreads());
                      setRename(null);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={`Rename ${threadTitle(thread)}`}
                      maxLength={80}
                      value={rename.title}
                      onChange={(event) => setRename({ ...rename, title: event.target.value })}
                      className="min-h-11 w-full rounded-xl bg-paper-2 px-3 text-body-lg"
                    />
                    <button type="submit" className="min-h-11 px-2 text-body font-semibold">
                      Save name
                    </button>
                    <button
                      type="button"
                      onClick={() => setRename(null)}
                      className="min-h-11 px-2 text-body text-ink-3"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (press.current.held) {
                          press.current.held = false;
                          return;
                        }
                        selectThread(thread.id);
                      }}
                      onPointerDown={(event) => pressStart(thread.id, event)}
                      onPointerMove={pressMove}
                      onPointerUp={pressEnd}
                      onPointerLeave={pressEnd}
                      onPointerCancel={pressEnd}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setActionsFor(thread.id);
                      }}
                      className={`${ROW} min-w-0 flex-1 text-left text-body-lg font-medium select-none [-webkit-touch-callout:none] active:bg-paper-2`}
                    >
                      <span className="truncate">
                        {thread.pinned ? "★ " : ""}
                        {threadTitle(thread)}
                      </span>
                    </button>

                    <button
                      type="button"
                      aria-label={`Options for ${threadTitle(thread)}`}
                      aria-expanded={actionsFor === thread.id}
                      onClick={() => setActionsFor(actionsFor === thread.id ? null : thread.id)}
                      className="sr-only focus-visible:not-sr-only focus-visible:min-h-11 focus-visible:px-3"
                    >
                      Options
                    </button>
                  </div>
                )}
                {actionsFor === thread.id && rename?.id !== thread.id && (
                  <div className="flex flex-wrap gap-2 px-3.5 pb-3">
                    <button
                      type="button"
                      className="min-h-10 rounded-full bg-paper-2 px-4 text-body font-semibold"
                      onClick={() => {
                        setRename({ id: thread.id, title: threadTitle(thread) });
                        setActionsFor(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-full bg-paper-2 px-4 text-body font-semibold"
                      onClick={() => {
                        pinThread(thread.id, !thread.pinned);
                        setThreads(listThreads());
                        setActionsFor(null);
                      }}
                    >
                      {thread.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${threadTitle(thread)} from history`}
                      className="min-h-10 rounded-full bg-paper-2 px-4 text-body font-semibold text-alarm"
                      onClick={() => {
                        removeThread(thread.id);
                        setThreads(listThreads());
                        setActionsFor(null);
                        if (window.localStorage.getItem("scout-chat-thread") === thread.id)
                          selectThread(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!needle && !showAll && matching.length > RECENT_CHATS && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={`${ROW} w-full text-body-lg font-medium text-ink-3 active:bg-paper-2`}
              >
                See all
              </button>
            )}
            {needle && !matching.length && (
              <p className="px-3.5 py-2 text-body text-ink-3">No chats match.</p>
            )}
            {!threads.length && (
              <p className="px-3.5 py-2 text-body text-ink-3">
                Your conversations will appear here.
              </p>
            )}
          </div>
          <Link
            href="/report"
            onClick={close}
            className={`${ROW} mt-3 text-body-lg font-medium text-ink-2 active:bg-paper-2`}
          >
            <FileText size={20} strokeWidth={1.8} />
            Monthly report
          </Link>
        </div>
      </dialog>
    </>
  );
}
