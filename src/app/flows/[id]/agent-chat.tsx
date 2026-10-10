"use client";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import GrowingTextarea, { submitOnEnter } from "@/components/growing-textarea";
import { useAppUpdateHold } from "@/lib/app-update";
import { streamScoutTurn } from "@/lib/scout-stream";
import { CAMPAIGN_BUTTONS, CAMPAIGN_CONTROLS_BRIEF } from "../campaign-controls";
import { CampaignReply, CAMPAIGN_VOICE, LAST_VISIT_AUDIENCE } from "../campaign-reply";
interface Bubble {
  role: "user" | "scout";
  text: string;
}
function contextHeader(flowId: string, flowName: string, state: string): string {
  return (
    `[Context: you are the agent for flow ${flowId} ("${flowName}", ${state}). ${CAMPAIGN_VOICE}` +
    `Use the current campaign readout supplied with this turn. If it is unavailable, call flows_get before answering about its numbers or messages; ` +
    `Honor its saved goal: book appointments, collect payments, update customer records, or find interested customers. Do not substitute another goal. Explain what counts as success; a reply alone is not confirmed interest, a booking, or money collected. For equipment collection, preserve the approved reply capability and ask for typed label details and the service address; SMS photos are not readable by this tool. New greetings use {{customer_first_name}}. Goal changes are draft-only and must be requested by the owner. ` +
    `For audience questions explain its saved segment params, exclusions, snapshot age, warnings and evidence; never invent CRM facts or imply a fresh scan. ` +
    `Questions are read-only. Only edit when the owner requests a change. Supported edits are name, messages, window and caps on draft or paused flows. On drafts you can also remove or add exact CRM customer IDs with flows_update; to keep ONLY specific people, use keepCustomerIds against the complete saved list instead of just adding them. Resolve ambiguous names first, and read flows_get afterward to verify the selected count. Manual additions are owner choices, not proof of segment eligibility. Touch offsets use days after enrollment. For dated campaigns use startsAt and expiresAt with explicit timezone offsets; those are enforced independently of daily send hours. ` +
    `On a draft, change supported filters for this SAME segment source with segmentParams in flows_update: read first, preserve unchanged filters, rebuild and verify the new audience. For another source or a new campaign, direct the owner to Create a new campaign. Do not create another flow in this thread. ` +
    LAST_VISIT_AUDIENCE +
    `${CAMPAIGN_CONTROLS_BRIEF}]\n\n`
  );
}
const CONTEXT_STRIP = /^\[Context: you are the agent for flow [^\]]*\]\s*/;
const KICKOFF_MARK = "[kickoff]";
export function AgentChat({
  flowId,
  flowName,
  flowState,
  onFlowChanged,
}: {
  flowId: string;
  flowName: string;
  flowState: string;
  onFlowChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  useAppUpdateHold(streaming || draft.trim() !== "");
  const { displayText } = useCampaignPhonePrivacy();
  const [streamText, setStreamText] = useState("");
  const [toolLine, setToolLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runTurn = async (message: string, echo: string | null) => {
    setError(null);
    setStreaming(true);
    setStreamText("");
    setToolLine(null);
    if (echo !== null) {
      setBubbles((cur) => [...(cur ?? []), { role: "user", text: echo }]);
    }
    try {
      const result = await streamScoutTurn(
        flowId,
        contextHeader(flowId, flowName, flowState) + message,
        (s) => {
          setStreamText(s.text);
          setToolLine(s.toolLine);
        },
        { campaignId: flowId },
      );
      if (result.error) {
        setError(result.error);
      }
      if (result.text) {
        setBubbles((cur) => [...(cur ?? []), { role: "scout", text: result.text }]);
      }
    } catch {
      setError("The agent could not take that - try again.");
    } finally {
      setStreaming(false);
      setStreamText("");
      setToolLine(null);
      onFlowChanged();
    }
  };
  useEffect(() => {
    if (!open || bubbles !== null) {
      return;
    }
    void (async () => {
      let history: Bubble[] = [];
      try {
        const res = await fetch("/api/chat", {
          headers: { "x-scout-chat-thread": flowId },
          cache: "no-store",
        });
        const body = (await res.json()) as {
          messages?: Bubble[];
        };
        history = (body.messages ?? [])
          .map((b) =>
            b.role === "user"
              ? Object.assign({}, b, {
                  text: b.text
                    .replace(/^\[Campaign readout\][\s\S]*?\[\/Campaign readout\]\s*/, "")
                    .replace(CONTEXT_STRIP, ""),
                })
              : b,
          )
          .filter((b) => !(b.role === "user" && b.text.startsWith(KICKOFF_MARK)));
      } catch {}
      setBubbles(
        history.length
          ? history
          : [
              {
                role: "scout",
                text:
                  flowState === "draft" || flowState === "paused"
                    ? `What would you like to change or check about ${flowName}?`
                    : `What would you like to know about ${flowName}?`,
              },
            ],
      );
    })();
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [bubbles, streamText, open]);
  const send = () => {
    const text = draft.trim();
    if (!text || streaming) {
      return;
    }
    setDraft("");
    void runTurn(text, text);
  };
  if (!open) {
    return (
      <section className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] bg-sage-tint px-4 py-4">
        <div className="min-w-0 flex-1 basis-52">
          <h2 className="flex items-center gap-2 text-body-lg font-semibold text-ink">
            <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" className="text-sage-deep" />
            Your campaign agent
          </h2>
          <p className="mt-1 text-body text-ink-2">
            {flowState === "draft" || flowState === "paused"
              ? "Ask why these customers were chosen, or refine the messages and timing."
              : `Ask about this audience and its results. Tap ${CAMPAIGN_BUTTONS.stop} to pause the campaign before editing.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-full bg-paper px-5 text-body font-semibold text-ink shadow-soft transition-transform active:scale-[0.97]"
          aria-expanded="false"
        >
          Talk to agent
        </button>
      </section>
    );
  }
  return (
    <div className="mt-5 overflow-hidden rounded-[20px] bg-paper shadow-card">
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage-deep">
          <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="text-body-lg font-semibold text-ink">This agent</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="-mr-1.5 ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper-2 active:bg-paper-2"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[360px] min-h-[120px] overflow-y-auto overscroll-contain px-4 py-3"
      >
        {bubbles === null ? (
          <p className="text-body text-ink-3">Loading the conversation…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {bubbles.map((b, i) =>
              b.role === "user" ? (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] rounded-3xl bg-terracotta-tint px-3.5 py-2 text-body-lg break-words whitespace-pre-wrap text-ink"
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
                {streamText ? (
                  <CampaignReply text={streamText} streaming />
                ) : (
                  <span className="flex items-center gap-2 text-body text-ink-3">
                    <span className="h-2 w-2 shrink-0 animate-breathe rounded-full bg-sage" />
                    {displayText(toolLine ?? "Thinking it through…")}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {error ? (
        <div
          role="alert"
          className="mx-3 mb-2 rounded-2xl bg-alarm-tint px-4 py-2.5 text-body text-alarm"
        >
          {error}
        </div>
      ) : null}
      <form
        className="px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2 rounded-[24px] bg-paper-2 py-1.5 pr-1.5 pl-4 transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--color-terracotta)_50%,transparent)]">
          <GrowingTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Ask a question or request a change…"
            aria-label="Message this campaign agent"
            disabled={streaming || bubbles === null}
            className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-body-lg text-ink quiet-focus placeholder:text-ink-4 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || !draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terracotta text-on-accent transition-colors disabled:bg-tan-soft disabled:text-ink-4"
            aria-label="Send"
          >
            <ArrowUp size={18} strokeWidth={2.2} />
          </button>
        </div>
      </form>
    </div>
  );
}
