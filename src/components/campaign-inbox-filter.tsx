"use client";
import { ChevronDown, ListFilter } from "lucide-react";
import { useEffect, useId, useState } from "react";
export type CampaignFilter =
  | {
      kind: "all";
    }
  | {
      kind: "loading" | "error";
    }
  | {
      kind: "ready";
      phones: Set<string>;
    };
export default function CampaignInboxFilter({
  onChange,
}: {
  onChange(filter: CampaignFilter): void;
}) {
  const descriptionId = useId();
  const [campaigns, setCampaigns] = useState<Array<{
    id: string;
    name: string;
  }> | null>(null);
  const [listError, setListError] = useState(false);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/flows", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unavailable");
        const body = await res.json();
        if (!Array.isArray(body.flows)) throw new Error("Missing campaigns");
        setCampaigns(body.flows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListError(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected) {
      onChange({ kind: "all" });
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const res = await fetch(`/api/flows/${encodeURIComponent(selected)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Unavailable");
        const body = await res.json();
        if (!Array.isArray(body.enrollments)) throw new Error("Missing enrollment list");
        if (controller.signal.aborted) return;
        onChange({
          kind: "ready",
          phones: new Set(
            body.enrollments
              .filter((row: { phoneE164?: unknown }) => typeof row.phoneE164 === "string")
              .map((row: { phoneE164: string }) => row.phoneE164),
          ),
        });
        setStatus("idle");
      } catch {
        if (controller.signal.aborted) return;
        onChange({ kind: "error" });
        setStatus("error");
      }
    };
    onChange({ kind: "loading" });
    setStatus("loading");
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [selected, onChange]);
  return (
    <div className="min-w-0 text-label text-ink-3">
      <label className="relative flex w-full items-center rounded-full bg-ink/6 focus-within:ring-2 focus-within:ring-sage/40">
        <ListFilter
          aria-hidden="true"
          size={18}
          strokeWidth={1.8}
          className="pointer-events-none absolute left-4 text-sage-deep"
        />
        <span className="sr-only">Campaign</span>
        <select
          aria-label="Filter inbox by campaign"
          aria-describedby={selected || listError || status !== "idle" ? descriptionId : undefined}
          value={selected}
          disabled={!campaigns}
          onChange={(event) => setSelected(event.target.value)}
          className="quiet-focus min-h-11 w-full appearance-none truncate rounded-full bg-transparent py-2.5 pr-10 pl-11 text-body-lg font-semibold text-ink outline-none disabled:opacity-50 sm:text-body"
        >
          <option value="">All campaigns</option>
          {campaigns?.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={18}
          strokeWidth={1.8}
          className="pointer-events-none absolute right-4 text-ink-3"
        />
      </label>
      <p
        id={descriptionId}
        className={
          selected || listError || status !== "idle"
            ? "mt-2 max-w-sm px-4 text-label leading-relaxed"
            : "sr-only"
        }
        role="status"
      >
        {listError
          ? "Campaign list unavailable. Your inbox is still available."
          : status === "loading"
            ? "Loading campaign conversations…"
            : status === "error"
              ? "Campaign membership couldn't be checked. We'll retry shortly."
              : selected
                ? "Whole conversations with customers enrolled in this campaign—not only its messages."
                : "Includes voice-booking replies and everyday customer texts."}
      </p>
    </div>
  );
}
