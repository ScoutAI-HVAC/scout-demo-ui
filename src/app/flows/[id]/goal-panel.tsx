"use client";
import { useState } from "react";
import { campaignGoals, goalFor, type CampaignGoal } from "@/lib/campaign-goal";
import { BookingsPanel, type FlowBookingConfig } from "./bookings-panel";
export function GoalPanel({
  flowId,
  flow,
  onSaved,
}: {
  flowId: string;
  flow: {
    goal?: CampaignGoal;
    replyTools?: Array<"equipment_capture">;
    state: string;
    booking?: FlowBookingConfig;
    segment: {
      source: string;
    };
  };
  onSaved: () => Promise<unknown>;
}) {
  const current = goalFor(flow);
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: selected, ...(selected !== "book" ? { booking: null } : {}) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The goal wasn’t saved. Try again.");
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The goal wasn’t saved. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="mt-10 rounded-[20px] bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="text-title font-semibold text-ink">The goal</h2>
      <p className="mt-1 text-body text-ink-3">
        {campaignGoals.find((goal) => goal.value === current)?.description}
      </p>

      {flow.state === "draft" &&
        !flow.replyTools?.includes("equipment_capture") &&
        current !== "collect" &&
        flow.segment.source !== "overdue_ar" && (
          <p className="mt-2 text-body text-ink-3">
            To collect equipment details, ask Scout in this campaign’s chat to check CRM support and
            prepare the equipment permission for review.
          </p>
        )}
      {flow.state === "draft" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            aria-label="Campaign goal"
            value={selected}
            disabled={saving}
            onChange={(event) => setSelected(event.target.value as CampaignGoal)}
            className="select-warm min-h-11 max-w-full sm:max-w-sm"
          >
            {campaignGoals.map((goal) => (
              <option
                key={goal.value}
                value={goal.value}
                disabled={
                  (goal.value === "collect" && flow.segment.source !== "overdue_ar") ||
                  (goal.value === "update_records" &&
                    !flow.replyTools?.includes("equipment_capture"))
                }
              >
                {goal.label}
              </option>
            ))}
          </select>
          {selected !== current ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="secondary-control"
            >
              {saving ? "Saving…" : "Save goal"}
            </button>
          ) : null}
          {selected !== current && selected !== "book" && flow.booking?.enabled ? (
            <p className="text-label text-ink-3">
              Saving this goal turns off automatic booking for this campaign.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-body font-semibold text-ink">
          {campaignGoals.find((goal) => goal.value === current)?.label}
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-body text-alarm">
          {error}
        </p>
      ) : null}
      {current === "book" ? (
        <BookingsPanel
          flowId={flowId}
          state={flow.state}
          booking={flow.booking}
          onSaved={onSaved}
        />
      ) : (
        <p className="mt-4 text-body text-ink-3">
          {current === "collect"
            ? "Success means an observed invoice payment, not a promise to pay. Scout uses the invoice’s current payment details."
            : current === "update_records"
              ? "Scout confirms the customer’s property and equipment details before saving them to your CRM. Conflicting details are kept for review. Replies alone do not mean a record was saved."
              : "Scout asks about the offer and helps with replies. Your office handles the next step. Replies are shown for review, not counted as confirmed interest."}
        </p>
      )}
    </section>
  );
}
