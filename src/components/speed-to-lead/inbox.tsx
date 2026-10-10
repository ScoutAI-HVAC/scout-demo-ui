"use client";
import {
  ArrowUp,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MobileConversation from "@/components/mobile-conversation";
import {
  SOURCE_NAMES,
  STAGE_NAMES,
  timeAgo,
  type Lead,
  type Stage,
} from "@/lib/speed-to-lead/model";
import { useLeadDemo } from "./demo-provider";
import { Avatar, button, input, MessageBubble, SourceBadge, StageBadge } from "./pieces";
import { useLiveThread } from "./use-live-thread";
export function LeadInbox({
  leads,
  selectedId,
  openLead,
}: {
  leads: Lead[];
  selectedId: string | null;
  openLead: (id: string) => void;
}) {
  const { state, dispatch, send } = useLeadDemo();
  const [draftState, setDraftState] = useState({ leadId: "", text: "" });
  const [mobileThread, setMobileThread] = useState(Boolean(selectedId));
  const [sort, setSort] = useState("recent");
  const thread = useRef<HTMLDivElement>(null);
  const ordered =
    sort === "oldest"
      ? [...leads].toReversed()
      : sort === "attention"
        ? [...leads].toSorted(
            (a, b) =>
              Number(a.reviewed) - Number(b.reviewed) ||
              Number(a.stage === "booked") - Number(b.stage === "booked"),
          )
        : leads;
  const lead = ordered.find((item) => item.id === selectedId) ?? ordered[0];
  const isLive = lead?.origin === "live";
  const live = useLiveThread(lead);
  const messages = isLive ? live.messages : (lead?.messages ?? []);
  const owner = isLive ? live.owner : lead?.owner;
  const draft = draftState.leadId === lead?.id ? draftState.text : "";
  const setDraft = (text: string) => setDraftState({ leadId: lead?.id ?? "", text });
  useEffect(() => {
    setDraftState({ leadId: "", text: "" });
    setMobileThread(Boolean(selectedId));
  }, [selectedId]);
  useEffect(() => {
    const el = thread.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lead?.id, messages.length, state.typingId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!lead || !draft.trim()) {
      return;
    }
    const recipient = lead.id;
    if (isLive) {
      if (!(await live.act("send", draft))) {
        return;
      }
    } else {
      send(recipient, draft);
    }
    setDraftState((current) =>
      current.leadId === recipient ? { leadId: recipient, text: "" } : current,
    );
  }
  return (
    <section
      className="grid grid-cols-1 gap-4 lg:h-[680px] lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)] lg:gap-5"
      aria-label="Lead conversations"
    >
      <aside className={`${mobileThread ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-col`}>
        <header className="flex items-center justify-between gap-2 pb-2 pl-1">
          <h2 className="text-body-lg font-semibold text-ink">
            Conversations <span className="ml-1 font-normal text-ink-3">{leads.length}</span>
          </h2>
          <label className="relative">
            <select
              aria-label="Sort conversations"
              className={`${input} appearance-none pr-10`}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
              <option value="attention">Needs review</option>
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.8}
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-3"
            />
          </label>
        </header>
        <div
          className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-1"
          aria-label="Conversation list"
        >
          {ordered.map((item) => (
            <div
              key={item.id}
              className={`flex items-start rounded-2xl pr-1 pl-3 transition-colors ${lead?.id === item.id ? "bg-paper shadow-soft" : "hover:bg-ink/4"}`}
            >
              <button
                onClick={() => {
                  setDraft("");
                  setMobileThread(true);
                  openLead(item.id);
                }}
                aria-pressed={lead?.id === item.id}
                className="flex min-w-0 flex-1 items-start gap-3 py-3 text-left"
              >
                <Avatar name={item.name} small />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-body-lg font-semibold text-ink">
                      {item.name}
                    </span>
                    {item.owner === "you" && (
                      <UserRound
                        size={14}
                        strokeWidth={2}
                        className="shrink-0 text-ink-2"
                        aria-label="You are handling this conversation"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-body text-ink-3">
                    {item.messages.at(-1)?.text}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StageBadge stage={item.stage} />
                    <SourceBadge source={item.source} />
                  </span>
                  {item.tags.length > 0 && (
                    <span className="mt-1 block truncate text-label text-ink-3">
                      {item.tags.join(" · ")}
                    </span>
                  )}
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-end pt-3">
                <span className="pr-2 text-label text-ink-3">
                  {timeAgo(item.receivedAt, state.now)}
                </span>
                <button
                  aria-label={`${item.reviewed ? "Unmark review for" : "Review"} ${item.name}`}
                  aria-pressed={item.reviewed}
                  title={item.reviewed ? "Reviewed" : "Mark reviewed"}
                  onClick={() => dispatch({ type: "review", id: item.id })}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${item.reviewed ? "text-sage-deep" : "text-ink-3 hover:bg-ink/6 hover:text-ink"}`}
                >
                  {item.reviewed ? (
                    <Check size={19} strokeWidth={1.8} />
                  ) : (
                    <Star size={18} strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>
          ))}
          {!leads.length && (
            <div className="px-4 py-12 text-center text-body text-ink-3">
              No matching conversations.
            </div>
          )}
        </div>
        <footer className="px-1 pt-2 text-label text-ink-3">
          {leads.length} conversations · shared lead history
        </footer>
      </aside>

      <MobileConversation
        active={mobileThread && Boolean(lead)}
        className={`${mobileThread ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col overflow-hidden bg-paper shadow-soft sm:rounded-[28px] ${mobileThread ? "sm:h-[650px] sm:max-h-[calc(100dvh-150px)] lg:h-auto lg:max-h-none" : ""}`}
      >
        {lead ? (
          <>
            <header className="flex items-center gap-2 px-2 py-2 sm:px-3 sm:py-3">
              <button
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-ink/6 hover:text-ink lg:hidden"
                aria-label="Back to conversations"
                onClick={() => setMobileThread(false)}
              >
                <ChevronLeft size={24} strokeWidth={1.8} />
              </button>
              <span className="hidden sm:inline-flex">
                <Avatar name={lead.name} />
              </span>
              <div className="min-w-0 flex-1 sm:pl-1">
                <h2 className="truncate text-body-lg font-semibold text-ink">{lead.name}</h2>
                <p className="truncate text-label text-ink-3">
                  {lead.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")} · Started{" "}
                  {timeAgo(lead.receivedAt, state.now)}
                </p>
              </div>
              <label className="relative shrink-0">
                <span className="sr-only">Conversation owner</span>
                <select
                  aria-label="Conversation owner"
                  disabled={isLive && (!live.canControl || live.busy)}
                  className={`${input} appearance-none pr-8 pl-3.5 font-semibold disabled:opacity-60`}
                  value={owner}
                  onChange={(event) =>
                    isLive
                      ? void live.act(event.target.value === "you" ? "takeover" : "resume")
                      : dispatch({
                          type: "owner",
                          id: lead.id,
                          owner: event.target.value as Lead["owner"],
                        })
                  }
                >
                  <option value="scout">✦ AI Agent</option>
                  <option value="you">You · takeover</option>
                </select>
                <ChevronDown
                  size={16}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
                />
              </label>
            </header>
            <div className="flex items-center gap-2 px-4 pb-2">
              <SourceBadge source={lead.source} />
              <span className="min-w-0 flex-1 truncate text-label text-ink-3">
                {lead.service} · {lead.area}
              </span>
              <label className="relative shrink-0">
                <span className="sr-only">Lead outcome</span>
                <select
                  aria-label="Lead outcome"
                  disabled={isLive}
                  className="quiet-focus min-h-9 appearance-none rounded-full bg-ink/6 pr-8 pl-3 text-body-lg text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 disabled:opacity-60 sm:text-body"
                  value={lead.stage}
                  onChange={(event) =>
                    dispatch({ type: "stage", id: lead.id, stage: event.target.value as Stage })
                  }
                >
                  {Object.entries(STAGE_NAMES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={15}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3"
                />
              </label>
            </div>
            <div
              ref={thread}
              className="conversation-messages flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-4 [mask-image:linear-gradient(to_bottom,transparent,black_1rem)] sm:px-5"
              aria-label={`Messages with ${lead.name}`}
              aria-live="polite"
            >
              {isLive ? (
                <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1 text-label font-medium text-sage-deep">
                  <ShieldCheck size={13} strokeWidth={1.8} />
                  Live lead · {SOURCE_NAMES[lead.source]}
                </div>
              ) : (
                <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-golden-tint px-3 py-1 text-center text-label font-medium text-ink-2">
                  <ShieldCheck size={13} strokeWidth={1.8} className="shrink-0" />
                  Simulated lead · {SOURCE_NAMES[lead.source]} · not a live partner message
                </div>
              )}
              {live.loading && isLive && (
                <p role="status" className="text-center text-body text-ink-3">
                  Loading conversation…
                </p>
              )}
              {live.error && isLive && (
                <p role="alert" className="text-center text-body text-alarm">
                  {live.error}
                </p>
              )}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {state.typingId === lead.id && (
                <div className="flex items-center justify-end gap-2 text-label text-terracotta-deep">
                  <Sparkles size={14} strokeWidth={1.8} />
                  <span className="motion-safe:animate-pulse">Scout is typing…</span>
                </div>
              )}
              {lead.stage === "booked" && (
                <div className="mx-auto flex w-fit items-start gap-2.5 rounded-2xl bg-sage-tint px-4 py-3 text-body text-sage-deep">
                  <CalendarCheck size={18} strokeWidth={1.8} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      {isLive ? "Live booking recorded" : "Simulated booking"}
                    </p>
                    <p className="mt-0.5 opacity-80">
                      {lead.appointment ??
                        (isLive
                          ? "Recorded in the paid-lead ledger"
                          : "Simulated demo appointment (not written to any CRM)")}
                    </p>
                  </div>
                </div>
              )}
              {lead.stage === "not_delivered" && (
                <p className="rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">
                  {isLive
                    ? "Scout could not confirm the first live response for this lead."
                    : "The last simulated message wasn't delivered. Take over to demonstrate a manual follow-up — still demo-only."}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center gap-1.5 px-4 pt-1 text-center text-label text-ink-3">
              {isLive && (live.loading || live.error) ? (
                <>Refreshing conversation status…</>
              ) : live.attention ? (
                <>{live.attention}</>
              ) : isLive && lead.responseHold ? (
                <>{lead.responseHold}</>
              ) : live.nativeProvider && !live.automatic ? (
                <>Replies send through Google. Automatic replies are off.</>
              ) : owner === "scout" ? (
                <>
                  <Sparkles size={13} strokeWidth={1.8} className="text-sage-deep" /> Scout is
                  handling this conversation
                </>
              ) : (
                <>
                  <UserRound size={13} strokeWidth={1.8} /> You're in control. Scout is paused.
                </>
              )}
            </div>
            <div className="px-3 pt-2 pb-3 sm:px-4 sm:pb-4">
              <form onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 rounded-[22px] bg-ink/6 px-4 focus-within:ring-2 focus-within:ring-sage/40">
                  <textarea
                    key={lead.id}
                    aria-label="Your reply"
                    rows={1}
                    maxLength={1500}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        if (draft.trim()) {
                          void submit(event);
                        }
                      }
                    }}
                    disabled={isLive && (!live.canSend || live.busy)}
                    placeholder={
                      isLive && lead.conversationEndAt
                        ? "Earlier conversation · open the latest lead to reply"
                        : "Type a reply as you…"
                    }
                    className="quiet-focus max-h-28 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-body-lg leading-snug text-ink outline-none [field-sizing:content] placeholder:text-ink-3 disabled:opacity-60 sm:text-body"
                  />
                </div>
                <button
                  type="submit"
                  aria-label={isLive ? "Send reply" : "Send demo reply"}
                  disabled={!draft.trim() || (isLive && (!live.canSend || live.busy))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-deep text-on-accent transition-opacity disabled:opacity-30"
                >
                  <ArrowUp size={20} strokeWidth={2.2} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-body text-ink-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/5">
              <MessageSquare size={24} strokeWidth={1.8} />
            </span>
            <p>Choose a conversation to see Scout at work.</p>
            <button className={button} onClick={() => setMobileThread(false)}>
              Back to conversations
            </button>
          </div>
        )}
      </MobileConversation>
    </section>
  );
}
