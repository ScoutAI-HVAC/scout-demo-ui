"use client";
import { ArrowRight, ArrowUp, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import GrowingTextarea, { submitOnEnter } from "@/components/growing-textarea";
import { useAppUpdateHold } from "@/lib/app-update";
import { campaignGoals, type CampaignGoal } from "@/lib/campaign-goal";
import { phoneKeyboardOpen } from "@/lib/phone-keyboard";
import { streamScoutTurn } from "@/lib/scout-stream";
import { DELETE_DRAFT_HOW_TO } from "./campaign-controls";
import { CampaignReply, CAMPAIGN_VOICE, LAST_VISIT_AUDIENCE } from "./campaign-reply";
interface Bubble {
  role: "user" | "scout";
  text: string;
}
function kickoff(ask: string, goal: CampaignGoal): string {
  const outcomeBrief: Record<CampaignGoal, string> = {
    book: "Ask for a visit and leave automatic booking off until the owner configures technicians. Keep every touch focused on the visit; do not add record-update capabilities unless the owner explicitly requests them. ",
    collect:
      "Use actual overdue invoices and verified payment details. Keep every touch focused on the outstanding payment; do not add record-update capabilities unless the owner explicitly requests them. ",
    engage:
      "Ask about interest, with the office handling next steps. Keep every touch focused on positive customer intent; do not add record-update capabilities unless the owner explicitly requests them. ",
    update_records:
      "For equipment collection first call crm_equipmentProfile without a customerId to check native support, then include replyTools=[equipment_capture]. Explain that this lets Scout save customer-confirmed equipment at the correct property after approval. Ask customers to type the equipment label details and service address; do not request photos because SMS image reading is not supported. Unsupported native writes must be disclosed, never promised. ",
  };
  return (
    `[${CAMPAIGN_VOICE}The owner selected campaign goal=${goal}. Save this exact goal with flows_propose. Select only the reply tools needed for this outcome. ${outcomeBrief[goal]}` +
    `Never count a reply as proven interest, payment, or a booking. Use {{customer_first_name}} for greetings, not {{customer_name}}. Create a draft only; never approve or send.] ` +
    `[You are helping the owner build ONE new outreach agent (a flow). Interview them ` +
    `like a person: ONE short question per message, two sentences max. Learn what should ` +
    `happen, the offer in their own words (never invent prices), and what the customer ` +
    `should be asked to do. Clarify ambiguous customer criteria before building. Use CRM ` +
    `tools to verify that the requested list is supported; never invent matching customers ` +
    `or counts. Explain inclusions and exclusions, and ask about ambiguity one question at a time. ` +
    `Never substitute maintenance-due or dormant customers for all customers without the owner's agreement. ` +
    LAST_VISIT_AUDIENCE +
    `If the owner asks for old, older, or aging equipment without a numeric cutoff, ask what minimum age they mean before creating a draft. Never choose an arbitrary age or silently use the default. Preserve an explicit owner-provided cutoff. ` +
    `Aging-equipment audiences cover all recorded equipment types; furnace-only or heat-pump-only filtering is not supported by that segment. Do not claim an age-only draft is equipment-type-specific. Explain this limitation and obtain permission before creating a broader all-types draft; do not invent equipmentTypes or another unsupported qualifier. ` +
    `Use all_customers for the full existing customer book, with exact service cities when requested. ` +
    `For dated offers set startsAt and expiresAt with explicit timezone offsets from the shop clock; ` +
    `daily sending hours alone do not enforce a calendar expiry. Never invent a verified audience ` +
    `when the CRM reports incomplete coverage. ` +
    `For estimate audiences, distinguish estimate records, unique customers, and the final eligible recipients. A company-wide total is not the campaign count. Explain the chosen quote date range; do not silently replace all open estimates with a recent-only range. ` +
    `When the owner requests all outstanding estimates including older quotes, set includeAllAges=true with no maxDaysOld or date bounds. With no explicit date bounds, omitted or false keeps the legacy 90-day default. For only an older-than request, set createdBefore from the shop clock without inventing a createdAfter year or extra maxDaysOld. For ambiguous age scope ask before creating the draft. ` +
    `Default estimate follow-ups to 'your estimate' without {{estimate_number}} unless the CRM facts actually provide that optional number. ` +
    `For repair-history replacement audiences, repair_count means recorded completed repair jobs for the customer, rechecked against the CRM; it is not their entire repair history or proof those repairs belong to the selected unit. Never attribute that count to a specific furnace or heat pump. ` +
    (ask ? `They already told you: "${ask}". ` : "") +
    `When you have enough, create it with flows_propose - you pick the segment, how many ` +
    `texts and the spacing (a months-long drip is fine). Honor explicit caps with dailyBatchSize, maxTouches and cooldownDays. ` +
    `Read the saved draft with flows_get. Use flows_update on that same draft for supported name, goal, message, timing, cap, or exact-recipient edits. Audience source and filter criteria, including quote date bounds, cannot be changed with flows_update. If those are wrong, explain the mismatch and get the owner's permission before proposing a replacement; never silently duplicate the draft or claim its criteria were corrected. Wait for the saved audience scan before claiming a recipient count. Only when the saved draft matches their request, tell them it is ready to ` +
    `review with its exact /flows/<id> link. ${DELETE_DRAFT_HOW_TO} ` +
    `Every message must read like the owner or a tech personally texting a ` +
    `customer they know: short, warm, first person, one clear ask - never opt-out ` +
    `language, never corporate boilerplate. Do not ask about things you can decide yourself.]` +
    (ask ? `\n\n${ask}` : "\n\nI want to build a new agent.")
  );
}
const QUICK_STARTS = [
  {
    label: "Unpaid invoices",
    prompt: "Follow up on outstanding unpaid invoices.",
    goal: "collect",
  },
  {
    label: "Open estimates",
    prompt: "Follow up on outstanding estimates and find out who is interested in moving forward.",
    goal: "engage",
  },
  {
    label: "Past-due maintenance",
    prompt: "Invite customers who are due for maintenance and don’t already have a visit booked.",
    goal: "book",
  },
] as const;
export function BuilderChat({
  initialAsk,
  existingFlowIds,
  onClose,
  onCreated,
}: {
  initialAsk: string;
  existingFlowIds: string[];
  onClose: () => void;
  onCreated: (flowId: string) => void;
}) {
  const { displayText } = useCampaignPhonePrivacy();
  const [idea, setIdea] = useState(initialAsk);
  const [interviewing, setInterviewing] = useState(false);
  const [goal, setGoal] = useState<CampaignGoal>("book");
  const goalChosenRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  useAppUpdateHold(streaming || draft.trim() !== "");
  const [streamText, setStreamText] = useState("");
  const [toolLine, setToolLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const threadRef = useRef(`builder-${crypto.randomUUID()}`);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const knownIds = useRef(new Set(existingFlowIds));
  const runTurn = async (message: string, echo: string | null) => {
    setError(null);
    setStreaming(true);
    setElapsed(0);
    followRef.current = true;
    setStreamText("");
    setToolLine(null);
    if (echo !== null) {
      setBubbles((cur) => [...cur, { role: "user", text: echo }]);
    }
    const attempt = () =>
      streamScoutTurn(threadRef.current, message, (s) => {
        setStreamText(s.text);
        setToolLine(s.toolLine);
      });
    try {
      const result = await attempt();
      if (result.error) {
        setError(result.error);
      }
      if (result.text) {
        setBubbles((cur) => [...cur, { role: "scout", text: result.text }]);
      }
      try {
        const res = await fetch("/api/flows", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Draft list unavailable");
        }
        const body = (await res.json()) as {
          flows?: Array<{
            id: string;
            state: string;
            goal?: CampaignGoal;
          }>;
        };
        const linked = new Set(
          Array.from(result.text.matchAll(/\/flows\/([a-zA-Z0-9_-]+)/g), (match) => match[1]),
        );
        const fresh = (body.flows ?? []).find(
          (f) => f.state === "draft" && linked.has(f.id) && !knownIds.current.has(f.id),
        );
        if (fresh) {
          setCreatedId(fresh.id);
          if (fresh.goal !== goal) {
            setError(
              "The saved goal doesn’t match your selection. Review and correct the goal before approving this draft.",
            );
          }
        }
      } catch {
        setError(
          "The draft list couldn’t be checked. Open Campaigns to verify the draft before creating another.",
        );
      }
    } catch {
      setError(
        "The connection dropped. Check your campaigns before asking Scout to create another draft.",
      );
      if (echo !== null) {
        setDraft((current) => (current.trim() ? current : echo));
      }
    } finally {
      setStreaming(false);
      setStreamText("");
      setToolLine(null);
    }
  };
  useEffect(() => {
    if (followRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [bubbles, streamText]);
  useEffect(() => {
    if (!streaming) {
      return undefined;
    }
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [streaming]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const viewport = window.visualViewport;
    const fit = () => {
      const overlay = overlayRef.current;
      if (!viewport || !overlay) {
        return;
      }
      overlay.style.top = `${viewport.offsetTop}px`;
      overlay.style.height = `${viewport.height}px`;
      overlay.dataset.keyboard = String(phoneKeyboardOpen(viewport));
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") {
        return;
      }
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        last?.focus();
        event.preventDefault();
      }
      if (!event.shiftKey && document.activeElement === last) {
        first?.focus();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  const begin = () => {
    if (!idea.trim() || startedRef.current) {
      return;
    }
    startedRef.current = true;
    setInterviewing(true);
    void runTurn(kickoff(idea.trim(), goal), idea.trim());
  };
  const send = () => {
    const text = draft.trim();
    if (!text || streaming) {
      return;
    }
    setDraft("");
    void runTurn(text, text);
  };
  return (
    <div
      ref={overlayRef}
      className="group fixed inset-x-0 top-0 z-[60] flex h-dvh items-end justify-center bg-black/40 motion-safe:animate-[scout-backdrop-fade_200ms_ease-out_both] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="New campaign"
        tabIndex={-1}
        className={`relative flex h-[calc(100%-var(--safe-t)-10px)] w-full max-w-[760px] flex-col overflow-hidden rounded-t-[28px] bg-cream text-ink shadow-lift quiet-focus motion-safe:animate-[sheet-up_420ms_var(--ease-ios)_both] sm:max-h-full sm:rounded-[28px] sm:motion-safe:animate-[scout-modal-enter_240ms_var(--ease-warm)_both] ${interviewing ? "sm:h-[min(860px,100%)]" : "sm:h-auto"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!interviewing ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              begin();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-4 sm:px-10 sm:pt-9">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close agent builder"
                className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-transform active:scale-95 sm:top-5 sm:right-5"
              >
                <X size={20} strokeWidth={1.8} />
              </button>
              <p className="text-label font-semibold tracking-[0.12em] text-terracotta uppercase">
                New campaign
              </p>
              <h2 className="mt-2 font-display text-h1 text-ink sm:text-display">
                What’s the win?
              </h2>
              <p className="mt-2 max-w-xl text-body-lg text-ink-2">
                Pick a result. Scout helps with the people and the message. You review before
                anything sends.
              </p>
              <fieldset className="mt-6 grid gap-2 sm:grid-cols-2">
                <legend className="mb-2.5 text-body font-semibold text-ink-2">Campaign goal</legend>
                {campaignGoals.map((option) => {
                  const selected = goal === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer gap-3 rounded-2xl px-4 py-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-terracotta/70 ${selected ? "bg-sage-tint shadow-[inset_0_0_0_1.5px_var(--color-sage)]" : "bg-paper shadow-soft active:bg-paper-2"}`}
                    >
                      <input
                        type="radio"
                        name="campaign-goal"
                        value={option.value}
                        checked={selected}
                        onClick={() => {
                          goalChosenRef.current = true;
                        }}
                        onChange={() => {
                          goalChosenRef.current = true;
                          setGoal(option.value);
                        }}
                        className="sr-only"
                      />

                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${selected ? "bg-sage" : "shadow-[inset_0_0_0_1.5px_var(--color-ink-4)]"}`}
                      >
                        {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-body-lg font-semibold text-ink">
                          {option.label}
                        </span>
                        <span
                          className={`${selected ? "block" : "hidden sm:block"} mt-1 text-body text-ink-2`}
                        >
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <div className="mt-5 rounded-[20px] bg-paper shadow-soft transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--color-terracotta)_50%,transparent)]">
                <textarea
                  aria-label="Describe your agent"
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  rows={3}
                  placeholder="Find customers with older systems who haven’t booked maintenance this year…"
                  className="block w-full resize-none bg-transparent px-4 py-3.5 text-body-lg text-ink quiet-focus placeholder:text-ink-4"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_STARTS.map(({ label, prompt, goal: suggestedGoal }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setIdea(prompt);
                      if (!goalChosenRef.current) {
                        setGoal(suggestedGoal);
                      }
                    }}
                    className="min-h-10 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 transition-colors hover:text-ink active:bg-tan-soft"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col-reverse items-center gap-2.5 px-5 pt-3 pb-[calc(1rem+var(--safe-b))] sm:flex-row sm:justify-between sm:px-10 sm:pt-4 sm:pb-8">
              <p className="text-body text-ink-3">Draft only. You’re in control.</p>
              <button
                type="submit"
                disabled={!idea.trim()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-terracotta px-6 text-body-lg font-semibold text-on-accent transition-[transform,background-color] active:scale-[0.98] disabled:bg-tan-soft disabled:text-ink-4 sm:w-auto"
              >
                Build with Scout
                <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2 sm:px-6 sm:pt-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage">
                <Sparkles size={17} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-body-lg font-semibold text-ink">New campaign</h2>
                <p className="text-label text-ink-3">
                  Refine the audience, message, and follow-through with Scout.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-transform active:scale-95"
              >
                <X size={20} strokeWidth={1.8} />
              </button>
            </div>
            <div
              ref={scrollRef}
              onScroll={(event) => {
                const node = event.currentTarget;
                followRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <div className="mx-auto flex max-w-[680px] flex-col gap-5 px-4 py-4 sm:px-6">
                {bubbles.map((b, i) =>
                  b.role === "user" ? (
                    <div
                      key={i}
                      className="ml-auto max-w-[85%] rounded-3xl bg-terracotta-tint px-4 py-2.5 text-body-lg break-words whitespace-pre-wrap text-ink"
                    >
                      {displayText(b.text)}
                    </div>
                  ) : (
                    <div key={i} className="text-body-lg break-words whitespace-pre-wrap text-ink">
                      <CampaignReply text={b.text} />
                    </div>
                  ),
                )}
                {streaming ? (
                  <div className="text-body-lg break-words whitespace-pre-wrap text-ink">
                    {streamText ? <CampaignReply text={streamText} streaming /> : null}
                    <span
                      role="status"
                      className={`flex items-center gap-2 text-body text-ink-3 ${streamText ? "mt-2" : ""}`}
                    >
                      <span className="h-2 w-2 shrink-0 animate-breathe rounded-full bg-sage" />
                      {displayText(toolLine ?? "Scout is working on your campaign…")} · {elapsed}s
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            {error || createdId ? (
              <div className="mx-auto flex w-full max-w-[680px] shrink-0 flex-col gap-2 px-3 sm:px-6">
                {error ? (
                  <p
                    role="alert"
                    className="rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm"
                  >
                    {error}
                  </p>
                ) : null}
                {createdId ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[20px] bg-sage-tint px-4 py-3">
                    <span className="min-w-0 flex-1 basis-48 text-body font-semibold text-ink">
                      Your campaign draft is ready. Nothing has been sent.
                    </span>
                    <button
                      type="button"
                      onClick={() => onCreated(createdId)}
                      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-sage px-5 text-body font-semibold text-on-accent sm:w-auto"
                    >
                      Review campaign
                      <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <form
              className="mx-auto w-full max-w-[680px] shrink-0 px-3 pt-2 pb-[calc(0.75rem+var(--safe-b))] group-data-[keyboard=true]:pb-2 sm:px-6 sm:pb-6"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <div className="flex items-end gap-2 rounded-[26px] bg-paper py-1.5 pr-1.5 pl-5 shadow-card transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--color-terracotta)_50%,transparent),var(--shadow-card)]">
                <GrowingTextarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={submitOnEnter}
                  autoFocus
                  aria-label="Answer Scout"
                  placeholder="Answer Scout…"
                  className="min-w-0 flex-1 resize-none bg-transparent py-2 text-body-lg text-ink quiet-focus placeholder:text-ink-4"
                />
                <button
                  type="submit"
                  disabled={streaming || !draft.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terracotta text-on-accent transition-colors disabled:bg-tan-soft disabled:text-ink-4"
                  aria-label="Send"
                >
                  <ArrowUp size={20} strokeWidth={2.2} />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
