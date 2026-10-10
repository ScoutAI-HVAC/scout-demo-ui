"use client";
import {
  ArrowUp,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Phone,
  RotateCcw,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  appendOlderConversations,
  fetchInboxList,
  INBOX_WAITING_EVENT,
  type InboxConversation,
  type InboxCursor,
  type InboxListBody,
  mergePageOne,
  NEEDS_YOU_TAB,
  waitingOnYou,
} from "@/app/inbox/inbox-list";
import { matchesInboxSearch, searchesMessages } from "@/app/inbox/inbox-search";
import { smsLength } from "@/app/inbox/sms-segments";
import CampaignInboxFilter, { type CampaignFilter } from "@/components/campaign-inbox-filter";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import ConversationContext from "@/components/conversation-context";
import ConversationHandoffCard from "@/components/conversation-handoff";
import { CrmCustomerLink } from "@/components/crm-link";
import { initials, JourneyDrawer } from "@/components/customer-profile";
import GrowingTextarea, { submitOnEnter } from "@/components/growing-textarea";
import MobileConversation from "@/components/mobile-conversation";
import SegmentedControl from "@/components/segmented-control";
import { useShopClock } from "@/components/shop-clock";
import { useAppUpdateHold } from "@/lib/app-update";
import { replyOwnership, type ConversationHandoff } from "@/lib/conversation-status";
import { inboxSurface } from "@/lib/inbox-surface";
import { sentenceCase } from "@/lib/pro-case";
import { safeTimeZone, shopDate, shopStamp, type ShopClock } from "@/lib/shop-time";
type Conversation = InboxConversation;
type DeliveryStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed" | "canceled";
interface ThreadMessage {
  direction: string;
  body: string;
  atMs: number;
  sendClass: string;
  status?: DeliveryStatus;
  errorCode?: number | null;
  sid?: string;
}
interface Thread {
  escalations?: ConversationHandoff[];
  name: string | null;
  phoneE164: string;
  messages: ThreadMessage[];
  takenOver?: boolean;
  canSend?: boolean;
  sendBlocked?: {
    code: string;
    reason: string;
  };
  optedOut?: boolean;
  optedOutAtMs?: number;
  unansweredInbound?: boolean;
  timezone?: string;
  loading?: boolean;
}
const DELIVERY_REASONS: Record<number, string> = {
  21211: "invalid number",
  21614: "not a mobile number",
  30003: "unreachable",
  30005: "unknown number",
  30006: "landline",
  30007: "carrier filtered",
  30008: "unknown error",
  30034: "A2P not registered",
};
function deliveryLabel(m: ThreadMessage): {
  text: string;
  failed: boolean;
} | null {
  if (m.direction === "inbound" || !m.status) {
    return null;
  }
  if (m.status === "delivered") {
    return { text: "Delivered", failed: false };
  }
  if (m.status === "undelivered" || m.status === "failed") {
    const code = m.errorCode;
    const reason =
      typeof code === "number"
        ? (DELIVERY_REASONS[code] ?? `delivery failed (code ${code})`)
        : null;
    return { text: reason ? `Not delivered - ${reason}` : "Not delivered", failed: true };
  }
  if (m.status === "canceled") {
    return { text: "Not sent", failed: true };
  }
  return null;
}
function canonicalPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, "");
  if (!digits) {
    return raw.trim();
  }
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? `+1${national}` : `+${digits}`;
}
function normalizeThread(body: Thread): Thread {
  return { ...body, timezone: safeTimeZone(body.timezone) };
}
function when(ms: number, clock: ShopClock): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return "now";
  }
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  return shopDate(ms, clock, { month: "short", day: "numeric" }, { autoYear: true });
}
const MAX_TEXT_CHARS = 1500;
const TAB_NAMES = { unread: NEEDS_YOU_TAB, all: "All", done: "Done" } as const;
const FIELD =
  "flex min-w-0 items-center rounded-full bg-ink/6 focus-within:ring-2 focus-within:ring-sage/40";
const GROWING_FIELD =
  "flex min-w-0 items-end rounded-[22px] bg-ink/6 focus-within:ring-2 focus-within:ring-sage/40";
const PANE = "lg:h-[calc(100dvh-18.5rem)] lg:min-h-[32rem]";
function Initials({ name, className }: { name: string | null; className: string }) {
  const letters = initials(name);
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 items-center justify-center rounded-full bg-ink/8 font-semibold text-ink-2 ${className}`}
    >
      {letters === "?" ? <Phone size={17} strokeWidth={1.8} /> : letters}
    </span>
  );
}
function bookedOn(booked: NonNullable<InboxConversation["scoutBooked"]>, clock: ShopClock) {
  return shopDate(booked.atMs, clock, { month: "short", day: "numeric" }, { autoYear: true });
}
function ScoutBookedTag({
  booked,
  clock,
}: {
  booked: NonNullable<InboxConversation["scoutBooked"]>;
  clock: ShopClock;
}) {
  return (
    <span
      title={`Scout booked them ${bookedOn(booked, clock)}`}
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-booked px-2 py-0.5 text-label font-semibold text-on-booked"
    >
      <CalendarCheck aria-hidden="true" size={12} strokeWidth={2} className="shrink-0" />
      <span className="truncate">Scout booked</span>
    </span>
  );
}
export default function InboxPage() {
  const { displayPhone: formatPhone, displayText } = useCampaignPhonePrivacy();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sharedPhone, setSharedPhone] = useState<{
    phone: string;
    customers: number;
    names: string[];
  } | null>(null);
  useEffect(() => {
    if (!selected) {
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/inbox/campaigns?phone=${encodeURIComponent(selected)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as {
              sharedPhone?: {
                customers?: unknown;
                names?: unknown;
              };
            })
          : null,
      )
      .then((body) => {
        const shared = body?.sharedPhone;
        setSharedPhone(
          typeof shared?.customers === "number" && shared.customers > 1
            ? {
                phone: selected,
                customers: shared.customers,
                names: Array.isArray(shared.names)
                  ? shared.names.filter((n): n is string => typeof n === "string")
                  : [],
              }
            : null,
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [selected]);
  useEffect(() => {
    if (conversations) {
      window.dispatchEvent(
        new CustomEvent(INBOX_WAITING_EVENT, { detail: conversations.filter(waitingOnYou).length }),
      );
    }
  }, [conversations]);
  const [listError, setListError] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  useEffect(() => {
    const phone = new URLSearchParams(window.location.search).get("phone");
    if (phone) {
      setSelected(canonicalPhone(phone));
    }
  }, []);
  const [listTimezone, setListTimezone] = useState<string | undefined>(undefined);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [listTruncated, setListTruncated] = useState(false);
  const [nextCursor, setNextCursor] = useState<InboxCursor | null | undefined>(undefined);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const notePageOne = (body: InboxListBody) => {
    setListTotal(typeof body.total === "number" ? body.total : null);
    setListTruncated(body.truncated === true);
    setNextCursor((cur) => {
      if (body.truncated !== true) {
        return null;
      }
      return cur === undefined ? (body.next ?? null) : cur;
    });
  };
  const loadOlder = async () => {
    if (!nextCursor || olderLoading) {
      return;
    }
    setOlderLoading(true);
    setOlderError(false);
    try {
      const body = await fetchInboxList(nextCursor);
      setConversations((cur) => appendOlderConversations(cur ?? [], body.conversations ?? []));
      if (typeof body.total === "number") {
        setListTotal(body.total);
      }
      setNextCursor(body.next ?? null);
    } catch {
      setOlderError(true);
    } finally {
      setOlderLoading(false);
    }
  };
  const [profileFor, setProfileFor] = useState<{
    phone: string;
    fallbackName: string | null;
    customerId?: string | null;
    scoutBooked?: Conversation["scoutBooked"];
  } | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const shopClock = useShopClock();
  const listClock: ShopClock = { ...shopClock, shop: shopClock.shop ?? listTimezone };
  const threadClock: ShopClock = { ...shopClock, shop: shopClock.shop ?? thread?.timezone };
  const selectedRow = conversations?.find((c) => c.phoneE164 === selected);
  const namedRow = selectedRow?.name ? selectedRow : undefined;
  const headerName = namedRow ? namedRow.name : (thread?.name ?? null);
  const selectedBooked = namedRow?.scoutBooked;
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);
  const listLoaded = conversations !== null;
  useEffect(() => {
    const el = messagesRef.current;
    const count = thread?.messages.length ?? 0;
    if (!el || count === 0) {
      lastCountRef.current = 0;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    const grew = count > lastCountRef.current;
    const switched = lastCountRef.current === 0;
    lastCountRef.current = count;
    if (switched || (grew && nearBottom)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [thread, listLoaded]);
  const threadShown = thread !== null;
  useEffect(() => {
    const el = messagesRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      const shrunk = height - el.clientHeight;
      height = el.clientHeight;
      if (shrunk > 0 && el.scrollHeight - el.scrollTop - el.clientHeight - shrunk < 120) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selected, threadShown, listLoaded]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftFor = (phone: string) => drafts[phone] ?? "";
  const setDraft = (phone: string, value: string) =>
    setDrafts((cur) => {
      if (!value) {
        const next = { ...cur };
        delete next[phone];
        return next;
      }
      return { ...cur, [phone]: value };
    });
  const [sending, setSending] = useState(false);
  useAppUpdateHold(sending || Object.values(drafts).some((draft) => draft.trim() !== ""));
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [resumeConfirm, setResumeConfirm] = useState<string | null>(null);
  const [tab, setTab] = useState<"unread" | "all" | "done">("unread");
  const [youOnly, setYouOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [textMatches, setTextMatches] = useState<{
    q: string;
    phones: Set<string> | null;
  } | null>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  useEffect(() => {
    const q = query.trim();
    if (!searchesMessages(q)) {
      setTextMatches(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/inbox/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (res) =>
          res.ok
            ? ((await res.json()) as {
                phones?: unknown;
              })
            : null,
        )
        .then((body) => {
          setTextMatches({
            q,
            phones: Array.isArray(body?.phones)
              ? new Set(body.phones.filter((p): p is string => typeof p === "string"))
              : null,
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setTextMatches({ q, phones: null });
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchRetry]);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>({ kind: "all" });
  useEffect(() => {
    if (
      campaignFilter.kind === "loading" ||
      (campaignFilter.kind === "ready" && selected && !campaignFilter.phones.has(selected))
    ) {
      setSelected(null);
    }
  }, [campaignFilter, selected]);
  const recentMarksRef = useRef(
    new Map<
      string,
      {
        action: "read" | "done" | "reopen";
        at: number;
      }
    >(),
  );
  const markState = (phone: string, action: "read" | "done" | "reopen") => {
    recentMarksRef.current.set(phone, { action, at: Date.now() });
    setConversations((cur) => {
      if (!cur) {
        return cur;
      }
      return cur.map((c) => {
        if (c.phoneE164 !== phone) {
          return c;
        }
        if (action === "read") {
          return Object.assign({}, c, { unread: false });
        }
        if (action === "done") {
          return Object.assign({}, c, { unread: false, done: true });
        }
        return Object.assign({}, c, { done: false });
      });
    });
    void fetch("/api/inbox/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, action }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(String(res.status));
        }
      })
      .catch(() => {
        void fetchInboxList()
          .then((body) => {
            if (body?.conversations) {
              setConversations((cur) =>
                cur ? mergePageOne(cur, body.conversations) : body.conversations,
              );
              notePageOne(body);
            }
          })
          .catch(() => {});
      });
  };
  useEffect(() => {
    if (!selected || !conversations) {
      return;
    }
    const row = conversations.find((c) => c.phoneE164 === selected);
    if (row?.unread) {
      markState(selected, "read");
    }
  }, [selected, conversations]);
  const openThread = (phone: string) => {
    setSelected(phone);
    const row = conversations?.find((c) => c.phoneE164 === phone);
    if (row?.unread) {
      markState(phone, "read");
    }
  };
  const reloadThread = async (phone: string) => {
    try {
      const res = await fetch(`/api/inbox/thread?phone=${encodeURIComponent(phone)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Thread read failed");
      }
      const body = normalizeThread((await res.json()) as Thread);
      setThread((cur) => (cur?.phoneE164 === phone ? body : cur));
      setThreadError((cur) => (cur === phone ? null : cur));
    } catch {
      setThreadError(phone);
    }
  };
  const sendText = async (phone: string) => {
    const body = draftFor(phone).trim();
    if (!body || sending || thread?.phoneE164 !== phone || thread.optedOut) {
      return;
    }
    setSending(true);
    setSendError(null);
    setSendNotice(null);
    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, body, surface: inboxSurface("messages") }),
      });
      if (res.ok) {
        setDraft(phone, "");
        const payload = (await res.json().catch(() => ({}))) as {
          recorded?: boolean;
        };
        if (payload.recorded === false) {
          setSendNotice("Sent, but not saved to this thread yet - do not resend.");
        }
        await reloadThread(phone);
      } else {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (res.status === 504) {
          setDraft(phone, "");
        }
        setSendError(payload.error ?? "The text could not be sent.");
        if (payload.code) {
          await reloadThread(phone);
        }
      }
    } catch {
      setSendError("The text could not be sent.");
    } finally {
      setSending(false);
    }
  };
  const takeOver = async () => {
    if (!selected || controlBusy) {
      return;
    }
    setControlBusy(true);
    setSendError(null);
    try {
      const res = await fetch("/api/inbox/takeover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: selected, surface: inboxSurface("messages") }),
      });
      if (res.ok) {
        await reloadThread(selected);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setSendError(body.error ?? "Scout could not be paused on this thread.");
    } catch {
      setSendError("Scout could not be paused on this thread.");
    } finally {
      setControlBusy(false);
    }
  };
  const resumeScout = async (confirmed = false) => {
    if (!selected || controlBusy) {
      return;
    }
    if (!confirmed && thread?.phoneE164 === selected && thread.unansweredInbound) {
      setResumeConfirm(selected);
      return;
    }
    setResumeConfirm(null);
    setControlBusy(true);
    setSendError(null);
    try {
      const res = await fetch("/api/inbox/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: selected, surface: inboxSurface("messages") }),
      });
      if (res.ok) {
        await reloadThread(selected);
      } else {
        setSendError("Scout could not be resumed. Please try again.");
      }
    } catch {
      setSendError("Scout could not be resumed. Please try again.");
    } finally {
      setControlBusy(false);
    }
  };
  useEffect(() => {
    void (async () => {
      try {
        const body = await fetchInboxList();
        setConversations(body.conversations);
        notePageOne(body);
        setListTimezone(safeTimeZone(body.timezone));
        setListError(false);
      } catch {
        setListError(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (!selected) {
      setThread(null);
      return undefined;
    }
    let cancelled = false;
    setThreadError(null);
    setSendError(null);
    setSendNotice(null);
    setResumeConfirm(null);
    setThread((cur) => {
      if (cur?.phoneE164 === selected) {
        return cur;
      }
      const row = conversations?.find((c) => c.phoneE164 === selected);
      return { name: row?.name ?? null, phoneE164: selected, messages: [], loading: true };
    });
    void (async () => {
      try {
        const res = await fetch(`/api/inbox/thread?phone=${encodeURIComponent(selected)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Thread read failed");
        }
        const body = normalizeThread((await res.json()) as Thread);
        if (!cancelled) {
          setThread(body);
          setThreadError(null);
        }
      } catch {
        if (!cancelled) {
          setThreadError(selected);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden || !selected) {
        return;
      }
      try {
        const res = await fetch(`/api/inbox/thread?phone=${encodeURIComponent(selected)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Thread read failed");
        }
        const body = normalizeThread((await res.json()) as Thread);
        if (stopped || body.phoneE164 !== selected) {
          return;
        }
        setThreadError(null);
        setThread((cur) => {
          if (!cur || cur.phoneE164 !== body.phoneE164) {
            return cur;
          }
          const statuses = (t: Thread) => t.messages.map((m) => m.status ?? "").join(",");
          const same =
            !cur.loading &&
            cur.messages.length === body.messages.length &&
            cur.messages[cur.messages.length - 1]?.atMs ===
              body.messages[body.messages.length - 1]?.atMs &&
            statuses(cur) === statuses(body) &&
            cur.name === body.name &&
            cur.takenOver === body.takenOver &&
            cur.canSend === body.canSend &&
            cur.sendBlocked?.reason === body.sendBlocked?.reason &&
            cur.optedOut === body.optedOut &&
            cur.unansweredInbound === body.unansweredInbound &&
            JSON.stringify(cur.escalations) === JSON.stringify(body.escalations);
          return same ? cur : body;
        });
      } catch {
        if (!stopped) {
          setThreadError(selected);
        }
      }
    };
    const timer = setInterval(() => void tick(), 4000);
    const onVisible = () => {
      if (!document.hidden) {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("scout:handoff-updated", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("scout:handoff-updated", onVisible);
    };
  }, [selected]);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden) {
        return;
      }
      try {
        const body = await fetchInboxList();
        if (stopped || !body.conversations) {
          return;
        }
        setListError(false);
        setListTimezone(safeTimeZone(body.timezone));
        notePageOne(body);
        setConversations((cur) => {
          const marks = recentMarksRef.current;
          const overlaid = (body.conversations ?? []).map((c) => {
            const mark = marks.get(c.phoneE164);
            if (!mark || Date.now() - mark.at > 15000) {
              return c;
            }
            if (mark.action === "read") {
              return Object.assign({}, c, { unread: false });
            }
            if (mark.action === "done") {
              return Object.assign({}, c, { unread: false, done: true });
            }
            return Object.assign({}, c, { done: false });
          });
          if (!cur) {
            return overlaid;
          }
          return mergePageOne(cur, overlaid);
        });
      } catch {
        if (!stopped) {
          setListError(true);
        }
      }
    };
    const timer = setInterval(() => void tick(), 12000);
    const onVisible = () => {
      if (!document.hidden) {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("scout:handoff-updated", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("scout:handoff-updated", onVisible);
    };
  }, []);
  const label = (
    c:
      | Conversation
      | {
          name: string | null;
          phoneE164: string;
        },
  ) => displayText(c.name ?? formatPhone(c.phoneE164));
  const needsAttention = waitingOnYou;
  const campaignConversations = (conversations ?? []).filter(
    (c) =>
      campaignFilter.kind === "all" ||
      (campaignFilter.kind === "ready" && campaignFilter.phones.has(c.phoneE164)),
  );
  const conversationSummary = (phone: string, scoutBooked: Conversation["scoutBooked"]) => {
    if (phone !== selected || !thread || thread.loading) {
      return null;
    }
    const row = conversations?.find((conversation) => conversation.phoneE164 === selected);
    return (
      <ConversationContext
        key={`${selected}:${row?.customerId ?? ""}`}
        phone={selected}
        customerId={row?.customerId}
        messages={thread.messages}
        canSend={thread.canSend}
        sendBlocked={thread.sendBlocked?.reason}
        done={row?.done}
        optedOut={thread.optedOut}
        optedOutAtMs={thread.optedOutAtMs}
        timezone={threadClock.shop}
        unavailable={threadError === selected}
        scoutBooked={scoutBooked}
      />
    );
  };
  return (
    <div className="pt-2">
      <p className="text-label font-bold tracking-[0.14em] uppercase text-ink-3">Texts</p>
      <h1 className="greeting mt-3 mb-5 sm:mb-6">
        Every <em>conversation.</em>
      </h1>

      {listError ? (
        <div role="alert" className="mb-4 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink">
          Couldn't refresh your texts.{" "}
          {conversations ? "Showing the last loaded conversations. " : ""}We'll keep trying.
        </div>
      ) : null}

      {conversations !== null && conversations.length > 0 && (
        <div className="mb-5 grid gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6">
            <CampaignInboxFilter onChange={setCampaignFilter} />
            <div className={`${FIELD} gap-2.5 px-4 lg:w-full lg:max-w-sm lg:justify-self-end`}>
              <Search
                aria-hidden="true"
                size={18}
                strokeWidth={1.8}
                className="shrink-0 text-ink-3"
              />
              <input
                aria-label="Search conversations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="quiet-focus min-h-11 min-w-0 flex-1 bg-transparent text-body-lg text-ink outline-none placeholder:text-ink-3 sm:text-body"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:text-ink"
                >
                  <X aria-hidden="true" size={17} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SegmentedControl
              label="Filter conversations"
              value={tab}
              onChange={setTab}
              className="inbox-status-tabs min-w-0 flex-1"
              options={[
                {
                  key: "unread",
                  name: TAB_NAMES.unread,
                  count: campaignConversations.filter(needsAttention).length,
                },
                {
                  key: "all",
                  name: TAB_NAMES.all,
                  count: campaignConversations.filter((c) => !c.done).length,
                },
                {
                  key: "done",
                  name: TAB_NAMES.done,
                  count: campaignConversations.filter((c) => c.done).length,
                },
              ]}
            />
            <button
              type="button"
              onClick={() => setYouOnly((v) => !v)}
              aria-pressed={youOnly}
              title="Only conversations you have taken over"
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-body font-semibold transition-colors ${youOnly ? "bg-golden-tint text-ink" : "bg-ink/6 text-ink-2 hover:text-ink"}`}
            >
              <UserRound aria-hidden="true" size={16} strokeWidth={1.8} />
              You
              {youOnly && <Check aria-hidden="true" size={15} strokeWidth={2} />}
            </button>
          </div>
        </div>
      )}
      {conversations === null ? (
        listError ? null : (
          <div className="text-body text-ink-3">Loading your texts…</div>
        )
      ) : conversations.length === 0 && !listError ? (
        <div className="flex flex-col items-center gap-3 rounded-[28px] bg-paper px-6 py-16 text-center shadow-soft">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-tint text-terracotta-deep">
            <MessageSquare size={24} strokeWidth={1.8} />
          </span>
          <div className="text-title font-semibold text-ink">No texts yet</div>
          <div className="max-w-sm text-body text-ink-3">
            When Scout texts a customer or one texts back, the whole conversation shows up here.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-5 min-[90rem]:grid-cols-[minmax(0,320px)_minmax(0,1fr)_260px]">
          <div className={`min-w-0 lg:flex lg:flex-col ${PANE} ${selected ? "hidden" : ""}`}>
            <h2 className="sr-only">Conversations</h2>
            <div className="-mx-1 space-y-1 px-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-2">
              {(() => {
                const q = query.trim();
                const answered = textMatches?.q === q ? textMatches : null;
                const bodyHits = answered?.phones ?? undefined;
                const shownIn = (c: InboxConversation, t: typeof tab) => {
                  if (youOnly && c.takenOver !== true) {
                    return false;
                  }
                  if (!matchesInboxSearch(c, query, bodyHits)) {
                    return false;
                  }
                  if (t === "unread") {
                    return needsAttention(c);
                  }
                  if (t === "done") {
                    return c.done === true;
                  }
                  return c.done !== true;
                };
                const visible = campaignConversations.filter((c) => shownIn(c, tab));
                if (visible.length === 0) {
                  if (campaignFilter.kind === "loading" || campaignFilter.kind === "error") {
                    return (
                      <div className="px-5 py-12 text-center text-body text-ink-3">
                        {campaignFilter.kind === "loading"
                          ? "Checking campaign membership…"
                          : "Campaign conversations are unavailable. Choose all campaigns to view the inbox."}
                      </div>
                    );
                  }
                  const otherTabs = q
                    ? (tab === "done"
                        ? (["all"] as const)
                        : tab === "all"
                          ? (["done"] as const)
                          : (["all", "done"] as const)
                      )
                        .map((t) => ({
                          t,
                          n: campaignConversations.filter((c) => shownIn(c, t)).length,
                        }))
                        .filter(({ n }) => n > 0)
                    : [];
                  const otherTabButtons =
                    otherTabs.length > 0 ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        {otherTabs.map(({ t, n }) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className="min-h-11 rounded-full bg-ink/6 px-5 text-body font-semibold text-ink-2 transition-colors hover:text-ink"
                          >
                            {n} in {TAB_NAMES[t]}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  if (searchesMessages(q) && !answered) {
                    return (
                      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-body text-ink-3">
                        <div
                          role="status"
                          aria-label="Searching messages"
                          className="flex items-center gap-2"
                        >
                          <Loader2
                            aria-hidden="true"
                            size={16}
                            strokeWidth={1.8}
                            className="animate-spin"
                          />
                          Searching messages…
                        </div>
                        {otherTabButtons}
                      </div>
                    );
                  }
                  if (answered && answered.phones === null) {
                    return (
                      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-body text-ink-3">
                        <div role="alert">Couldn't finish searching your messages.</div>
                        <button
                          type="button"
                          onClick={() => setSearchRetry((n) => n + 1)}
                          className="min-h-11 rounded-full bg-ink/6 px-5 text-body font-semibold text-ink-2 transition-colors hover:text-ink"
                        >
                          Try again
                        </button>
                        {otherTabButtons}
                      </div>
                    );
                  }
                  if (q) {
                    const unloaded =
                      listTruncated &&
                      [...(answered?.phones ?? [])].some(
                        (phone) => !conversations?.some((c) => c.phoneE164 === phone),
                      );
                    return (
                      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-body text-ink-3">
                        {otherTabButtons
                          ? `No match in ${TAB_NAMES[tab]}.`
                          : unloaded
                            ? "Matches are in older conversations. Load older to see them."
                            : `No conversations match “${q}”${tab === "all" ? "" : ` in ${TAB_NAMES[tab]}`}.`}
                        {otherTabButtons}
                        {otherTabButtons && unloaded ? (
                          <span>More are in older conversations. Load older to see them.</span>
                        ) : null}
                      </div>
                    );
                  }
                  const zero = !listError && tab === "unread";
                  return (
                    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-body text-ink-3">
                      {zero ? (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-tint text-sage-deep">
                          <Check aria-hidden="true" size={22} strokeWidth={1.8} />
                        </span>
                      ) : null}
                      {listError
                        ? "Conversations may be out of date."
                        : tab === "unread"
                          ? "Inbox zero. Nothing needs you."
                          : tab === "done"
                            ? "Nothing marked done yet."
                            : "No conversations here."}
                    </div>
                  );
                }
                return visible.map((c) => {
                  const unread = c.unread === true && c.done !== true;
                  return (
                    <div
                      key={c.phoneE164}
                      data-unread={unread ? "true" : "false"}
                      className={`flex items-start rounded-2xl pr-1 pl-2 transition-colors ${
                        selected === c.phoneE164
                          ? "bg-paper shadow-soft"
                          : unread
                            ? "bg-terracotta-tint/45 hover:bg-terracotta-tint/70"
                            : "hover:bg-ink/4 active:bg-ink/6"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openThread(c.phoneE164)}
                        className="flex min-w-0 flex-1 items-start gap-3 py-3 text-left"
                      >
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span
                            aria-label={unread ? "Unread" : undefined}
                            className={`h-2 w-2 rounded-full ${unread ? "bg-terracotta" : ""}`}
                          />
                          <Initials name={c.name} className="flex h-11 w-11 text-body" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span
                              className={`truncate text-body-lg text-ink ${unread ? "font-bold" : "font-semibold"}`}
                            >
                              {label(c)}
                            </span>

                            {c.awaitingReply ? (
                              <span className="shrink-0 rounded-full bg-sage-tint px-2 text-label font-semibold text-sage-deep">
                                Reply
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`mt-0.5 block truncate text-body ${unread ? "text-ink-2" : "text-ink-3"}`}
                          >
                            {c.lastDirection === "inbound"
                              ? ""
                              : c.lastSendClass === "owner"
                                ? "You: "
                                : "Scout: "}
                            {displayText(c.lastBody)}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {c.takenOver ? (
                              <span className="rounded-full bg-golden-tint px-2 py-0.5 text-label font-semibold whitespace-nowrap text-ink-2">
                                {replyOwnership({ takenOver: true })}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-label font-medium text-sage-deep">
                                <Sparkles aria-hidden="true" size={12} strokeWidth={2} />
                                {replyOwnership({ takenOver: false })}
                              </span>
                            )}
                            {c.needsYou && (
                              <span
                                title="An open issue needs review. This does not change who replies."
                                className="rounded-full bg-alarm-tint px-2 py-0.5 text-label font-semibold whitespace-nowrap text-alarm"
                              >
                                Needs attention
                              </span>
                            )}
                            {c.scoutBooked ? (
                              <ScoutBookedTag booked={c.scoutBooked} clock={listClock} />
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col items-end pt-3">
                        <span
                          className={`pr-2 text-label ${unread ? "font-semibold text-terracotta-deep" : "text-ink-3"}`}
                        >
                          {when(c.lastAtMs, listClock)}
                        </span>

                        {c.done ? (
                          <button
                            type="button"
                            onClick={() => markState(c.phoneE164, "reopen")}
                            aria-label={`Reopen ${label(c)}`}
                            title="Move back to the inbox"
                            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
                          >
                            <RotateCcw size={17} strokeWidth={1.8} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markState(c.phoneE164, "done")}
                            aria-label={`Done with ${label(c)}`}
                            title="Done - a new text from them reopens it"
                            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-sage-tint hover:text-sage-deep"
                          >
                            <Check size={19} strokeWidth={1.8} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}

              {listTruncated && listTotal !== null ? (
                <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
                  <p role="status" className="text-label text-ink-3">
                    Showing {conversations.length} of {listTotal} conversations
                  </p>
                  {olderError ? (
                    <p role="alert" className="text-label text-ink-2">
                      Couldn't load older conversations. Try again.
                    </p>
                  ) : null}
                  {nextCursor ? (
                    <button
                      type="button"
                      onClick={() => void loadOlder()}
                      disabled={olderLoading}
                      aria-busy={olderLoading}
                      className="min-h-11 rounded-full bg-ink/6 px-5 text-body font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
                    >
                      {olderLoading ? "Loading…" : "Load older"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <MobileConversation
            active={Boolean(selected)}
            className={`min-w-0 overflow-hidden bg-paper shadow-soft sm:rounded-[28px] lg:flex lg:flex-col ${PANE} ${selected ? "" : "hidden min-[90rem]:col-span-2"}`}
          >
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center text-body text-ink-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/5 text-ink-3">
                  <MessageSquare aria-hidden="true" size={24} strokeWidth={1.8} />
                </span>
                Pick a conversation to read it.
              </div>
            ) : thread === null ? (
              <div className="px-5 py-6 text-body text-ink-3">Loading…</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 sm:gap-2 sm:px-3 sm:py-3">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Back to all conversations"
                    title="Back"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink active:bg-ink/6"
                  >
                    <ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setProfileFor({
                        phone: thread.phoneE164,
                        fallbackName: headerName,
                        customerId: conversations?.find((c) => c.phoneE164 === selected)
                          ?.customerId,
                        scoutBooked: selectedBooked,
                      })
                    }
                    aria-label={`Open profile for ${label({ name: headerName, phoneE164: thread.phoneE164 })}${selectedBooked ? `, Scout booked ${bookedOn(selectedBooked, listClock)}` : ""}`}
                    title="Open profile"
                    className="flex min-w-[10rem] flex-1 items-center gap-3 rounded-2xl py-1 pr-2 text-left transition-colors hover:bg-ink/4"
                  >
                    <Initials name={headerName} className="hidden h-10 w-10 text-label sm:flex" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-0.5 text-body-lg font-semibold text-ink">
                        <span className="truncate">
                          {displayText(headerName ?? formatPhone(thread.phoneE164))}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                          className="shrink-0 text-ink-4"
                        />
                      </span>
                      {headerName ? (
                        <span className="block truncate text-label text-ink-3">
                          {formatPhone(thread.phoneE164)}
                        </span>
                      ) : null}
                      {sharedPhone?.phone === thread.phoneE164 ? (
                        <span
                          data-shared-phone="true"
                          title={
                            sharedPhone.names.length > 1
                              ? `Shared number: ${sharedPhone.names.map((n) => displayText(n)).join(", ")}`
                              : undefined
                          }
                          className="block truncate text-label font-semibold text-ink-2"
                        >
                          Shared by {sharedPhone.customers} customers
                        </span>
                      ) : null}
                      {(() => {
                        const muted =
                          threadError === selected ||
                          (!thread.canSend && !thread.sendBlocked) ||
                          thread.optedOut;
                        return (
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              role="status"
                              aria-label="Reply ownership"
                              className={`flex min-w-0 items-center gap-1.5 text-label font-semibold ${
                                muted
                                  ? "text-ink-3"
                                  : thread.takenOver
                                    ? "text-ink-2"
                                    : "text-sage-deep"
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${muted ? "bg-ink-4" : thread.takenOver ? "bg-golden" : "bg-sage"}`}
                              />
                              {replyOwnership({
                                unavailable: threadError === selected,
                                optedOut: thread.optedOut,
                                canSend: thread.canSend,
                                takenOver: thread.takenOver,
                                sendBlocked: Boolean(thread.sendBlocked),
                              })}
                            </span>
                            {selectedBooked ? (
                              <ScoutBookedTag booked={selectedBooked} clock={listClock} />
                            ) : null}
                          </span>
                        );
                      })()}
                    </span>
                  </button>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setProfileFor({
                          phone: thread.phoneE164,
                          fallbackName: headerName,
                          customerId: conversations?.find((c) => c.phoneE164 === selected)
                            ?.customerId,
                          scoutBooked: selectedBooked,
                        })
                      }
                      className="hidden min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink/6 px-4 text-body font-semibold text-ink-2 transition-colors hover:text-ink sm:flex min-[90rem]:hidden"
                    >
                      <UserRound aria-hidden="true" size={16} strokeWidth={1.8} />
                      Profile
                    </button>

                    <span data-header-crm="true" className="hidden sm:block min-[90rem]:hidden">
                      <CrmCustomerLink
                        customerId={
                          conversations?.find((c) => c.phoneE164 === selected)?.customerId
                        }
                        className="lg:w-11 lg:px-0"
                        labelClassName="lg:hidden"
                      />
                    </span>

                    {(() => {
                      const row = conversations?.find((c) => c.phoneE164 === selected);
                      if (!row) {
                        return null;
                      }
                      return row.done ? (
                        <button
                          type="button"
                          onClick={() => markState(row.phoneE164, "reopen")}
                          className="min-h-11 shrink-0 rounded-full bg-ink/6 px-4 text-body font-semibold text-ink-2 transition-colors hover:text-ink"
                        >
                          Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markState(row.phoneE164, "done")}
                          title="Done - a new text from them reopens it"
                          className="min-h-11 shrink-0 rounded-full bg-sage-deep px-4 text-body font-semibold text-on-accent transition-[filter] hover:brightness-110"
                        >
                          Done
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {thread.optedOut ? (
                  <div
                    role="status"
                    aria-label="Consent"
                    className="mx-3 mb-2 rounded-2xl bg-ink/5 px-4 py-2.5 text-body text-ink-2 sm:mx-4"
                  >
                    <strong className="font-semibold text-ink">
                      {thread.optedOutAtMs
                        ? `Opted out - STOP on ${shopDate(thread.optedOutAtMs, threadClock, { month: "short", day: "numeric" }, { autoYear: true })}`
                        : "Opted out - STOP received"}
                    </strong>
                    {" · "}Texting is off until they text back; give them a call instead.
                  </div>
                ) : null}
                {threadError === selected ? (
                  <div
                    role="alert"
                    className="mx-3 mb-2 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink sm:mx-4"
                  >
                    Couldn't refresh this conversation.{" "}
                    {thread.messages.length > 0 ? "Showing the last loaded messages. " : ""}We'll
                    keep trying.
                  </div>
                ) : null}
                <div
                  ref={messagesRef}
                  className="conversation-messages flex min-h-0 flex-col overflow-y-auto overscroll-contain px-3 py-3 [mask-image:linear-gradient(to_bottom,transparent,black_1rem)] sm:max-h-[55vh] sm:px-6 lg:max-h-none lg:flex-1 [&>:first-child]:mt-auto"
                >
                  {thread.messages.length === 0 ? (
                    <div className="text-body text-ink-3">
                      {threadError === selected
                        ? null
                        : thread.loading
                          ? "Loading…"
                          : "No messages in this thread."}
                    </div>
                  ) : (
                    thread.messages.map((m, i) => {
                      const inbound = m.direction === "inbound";
                      const owner = !inbound && m.sendClass === "owner";
                      const speaker = inbound ? "" : owner ? "You · " : "Scout · ";
                      const prev = thread.messages[i - 1];
                      const sameTurn =
                        prev !== undefined &&
                        (prev.direction === "inbound") === inbound &&
                        (inbound || (prev.sendClass === "owner") === owner);
                      return (
                        <div
                          key={i}
                          className={`flex flex-col ${inbound ? "items-start" : "items-end"} ${i === 0 ? "" : sameTurn ? "mt-1.5" : "mt-4"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-[20px] px-4 py-2.5 text-body-lg leading-snug break-words text-ink sm:max-w-[75%] sm:text-body sm:leading-relaxed ${
                              inbound
                                ? "rounded-bl-md bg-ink/6"
                                : owner
                                  ? "rounded-br-md bg-golden-tint"
                                  : "rounded-br-md bg-sage-tint"
                            }`}
                          >
                            {displayText(m.body)}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-1.5 px-2 text-caption">
                            <span className="text-ink-3">
                              {speaker}
                              {shopStamp(m.atMs, threadClock)}
                            </span>

                            {(() => {
                              const delivery = deliveryLabel(m);
                              if (!delivery) {
                                return null;
                              }
                              return (
                                <span
                                  role="status"
                                  aria-label="Delivery status"
                                  data-failed={delivery.failed ? "true" : "false"}
                                  className={
                                    delivery.failed ? "font-semibold text-alarm" : "text-ink-3"
                                  }
                                >
                                  {delivery.text}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2 px-3 pt-1 pb-3 sm:px-4 sm:pb-4">
                  {sendError && (
                    <div
                      role="alert"
                      className="rounded-2xl bg-alarm-tint px-4 py-2.5 text-body text-alarm"
                    >
                      {sentenceCase(sendError)}
                    </div>
                  )}
                  {sendNotice && !sendError ? (
                    <div
                      role="status"
                      aria-label="Send notice"
                      className="rounded-2xl bg-golden-tint px-4 py-2.5 text-body text-ink-2"
                    >
                      {sendNotice}
                    </div>
                  ) : null}
                  {(() => {
                    const open =
                      threadError !== selected
                        ? (thread.escalations?.filter((event) => event.state === "open") ?? [])
                        : [];
                    if (open.length === 0) {
                      return null;
                    }
                    return (
                      <div className="max-h-40 space-y-1.5 overflow-y-auto overscroll-contain">
                        {open.length > 1 ? (
                          <p className="px-4 pt-1 text-label font-semibold text-ink-2">
                            Needs attention · {open.length}
                          </p>
                        ) : null}
                        {open.map((event) => (
                          <ConversationHandoffCard
                            key={event.id ?? `${event.atMs}:${event.reason}`}
                            event={event}
                            onHandled={() => reloadThread(thread.phoneE164)}
                          />
                        ))}
                      </div>
                    );
                  })()}
                  {thread.takenOver && threadError !== selected ? (
                    resumeConfirm === selected ? (
                      <div className="rounded-2xl bg-golden-tint p-3">
                        <p role="alert" className="px-1 text-body leading-relaxed text-ink">
                          Their last message won&apos;t be answered automatically - Scout only
                          speaks on their next text. Reply first, or let Scout wait.
                        </p>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setResumeConfirm(null)}
                            className="min-h-11 shrink-0 rounded-full bg-paper px-4 text-body font-semibold text-ink-2 hover:text-ink"
                          >
                            Keep replying
                          </button>
                          <button
                            type="button"
                            onClick={() => void resumeScout(true)}
                            disabled={controlBusy}
                            className="min-h-11 shrink-0 rounded-full bg-sage-deep px-4 text-body font-semibold text-on-accent disabled:opacity-50"
                          >
                            Let Scout continue anyway
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void resumeScout()}
                          disabled={controlBusy}
                          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-sage-tint px-4 text-body font-semibold text-sage-deep transition-[filter] hover:brightness-95 disabled:opacity-50"
                        >
                          <Sparkles aria-hidden="true" size={16} strokeWidth={1.8} />
                          Let Scout continue
                        </button>
                      </div>
                    )
                  ) : null}
                  {!thread.takenOver &&
                  (thread.canSend || thread.sendBlocked) &&
                  threadError !== selected ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void takeOver()}
                        disabled={controlBusy}
                        className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ink/6 px-4 text-body font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
                      >
                        <UserRound aria-hidden="true" size={16} strokeWidth={1.8} />
                        I&apos;ll take this one
                      </button>
                    </div>
                  ) : null}

                  {thread.sendBlocked && !thread.canSend && !thread.optedOut ? (
                    <div
                      role="status"
                      aria-label="Texting"
                      data-send-blocked={thread.sendBlocked.code}
                      className="rounded-2xl bg-ink/5 px-4 py-2.5 text-body text-ink-2"
                    >
                      {thread.sendBlocked.reason}
                    </div>
                  ) : null}
                  {thread.canSend
                    ? (() => {
                        const phone = thread.phoneE164;
                        const draft = draftFor(phone);
                        const length = smsLength(draft);
                        const blocked = sending || thread.optedOut === true;
                        return (
                          <div key={phone}>
                            <form
                              className="flex items-end gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void sendText(phone);
                              }}
                            >
                              <div className={`${GROWING_FIELD} flex-1 px-4`}>
                                <GrowingTextarea
                                  aria-label="Your reply"
                                  value={draft}
                                  onChange={(e) => setDraft(phone, e.target.value)}
                                  onKeyDown={submitOnEnter}
                                  maxLength={MAX_TEXT_CHARS}
                                  placeholder={
                                    thread.optedOut
                                      ? "They opted out - texting is off"
                                      : thread.takenOver
                                        ? "Reply as yourself…"
                                        : "Reply & pause Scout…"
                                  }
                                  disabled={blocked}
                                  className="quiet-focus min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-body-lg text-ink outline-none placeholder:text-ink-3 disabled:opacity-60 sm:py-3 sm:text-body"
                                />
                              </div>
                              <button
                                type="submit"
                                aria-label={sending ? "Sending…" : "Send"}
                                title="Send"
                                disabled={blocked || !draft.trim()}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-deep text-on-accent transition-opacity disabled:opacity-30"
                              >
                                <ArrowUp aria-hidden="true" size={20} strokeWidth={2.2} />
                              </button>
                            </form>

                            {draft.length > 0 ? (
                              <div
                                role="status"
                                aria-label="Message length"
                                className={`mt-1.5 px-4 text-caption ${length.segments > 3 ? "text-alarm" : "text-ink-3"}`}
                              >
                                {length.chars} / {MAX_TEXT_CHARS} · {length.segments}{" "}
                                {length.segments === 1 ? "segment" : "segments"}
                                {length.encoding === "UCS-2" ? " · emoji shortens each" : ""}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()
                    : null}
                </div>
              </>
            )}
          </MobileConversation>
          {selected && thread && !thread.loading ? (
            <div className="hidden min-w-0 sm:block lg:col-span-2 min-[90rem]:col-span-1 min-[90rem]:h-[calc(100dvh-18.5rem)] min-[90rem]:min-h-[32rem] min-[90rem]:overflow-y-auto">
              <JourneyDrawer
                key={`${selected}:${conversations?.find((conversation) => conversation.phoneE164 === selected)?.customerId ?? ""}`}
                asPane
                phone={selected}
                fallbackName={headerName}
                customerId={
                  conversations?.find((conversation) => conversation.phoneE164 === selected)
                    ?.customerId
                }
                refreshKey={thread.messages.at(-1)?.atMs}
                context={conversationSummary(selected, selectedBooked)}
                surface="messages"
              />
            </div>
          ) : null}
        </div>
      )}

      {profileFor ? (
        <JourneyDrawer
          phone={profileFor.phone}
          fallbackName={profileFor.fallbackName}
          customerId={profileFor.customerId}
          refreshKey={profileFor.phone === selected ? thread?.messages.at(-1)?.atMs : undefined}
          context={conversationSummary(profileFor.phone, profileFor.scoutBooked)}
          surface="messages"
          onClose={() => setProfileFor(null)}
        />
      ) : null}
    </div>
  );
}
