"use client";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import { handoffReason, type ConversationHandoff } from "@/lib/conversation-status";
export default function ConversationHandoffCard({
  event,
  onHandled,
}: {
  event: ConversationHandoff;
  onHandled: () => void | Promise<void>;
}) {
  const { displayText } = useCampaignPhonePrivacy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [handled, setHandled] = useState(false);
  const settled = handled || event.state === "dismissed" || event.state === "resolved";
  async function markHandled() {
    if (!event.id || busy) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/insights/${encodeURIComponent(event.id)}/dismiss`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || typeof result.dismissed !== "boolean") {
        throw new Error("Update failed");
      }
      await onHandled();
      if (result.dismissed) {
        setHandled(true);
      }
      window.dispatchEvent(new Event("scout:handoff-updated"));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`rounded-2xl py-1 pr-1.5 pl-4 text-body ${settled ? "bg-ink/5 text-ink-3" : "bg-golden-tint text-ink-2"}`}
    >
      <div className="flex min-h-11 items-center gap-2.5">
        {!settled && (
          <TriangleAlert
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className="shrink-0 text-golden"
          />
        )}
        <p className="min-w-0 flex-1 py-1.5">
          {displayText(handoffReason(event))}
          {settled && <span className="ml-2 text-label">Handled</span>}
        </p>
        {!settled && event.id && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void markHandled()}
            className="min-h-11 shrink-0 rounded-full px-3.5 font-semibold text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-50"
          >
            {busy ? "Updating…" : "Dismiss"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="pb-2 text-label text-alarm">
          Couldn’t update this issue. Please try again.
        </p>
      )}
    </div>
  );
}
