"use client";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "@/components/button";
import { shopNumberCopy } from "@/lib/shop-number-labels";
import { normalizeShopTrade, shopTradeCopy, type ShopTrade } from "@/lib/shop-trades";
interface NumberRow {
  path: string;
  default: number;
  unit: string;
  note?: string;
  override: number | null;
}
function summarizeNote(note: string): {
  summary: string;
  truncated: boolean;
} {
  const trimmed = note.trim();
  const firstSentence = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0]?.trim();
  const summary =
    firstSentence && firstSentence.length <= 160
      ? firstSentence
      : `${trimmed.slice(0, 140).trimEnd()}…`;
  return { summary, truncated: summary.length < trimmed.length };
}
export default function ShopNumbersSection({
  trade,
}: {
  trade?: ShopTrade;
} = {}) {
  const [rows, setRows] = useState<NumberRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/numbers");
        if (!res.ok) {
          if (!cancelled) {
            setLoadFailed(true);
          }
          return;
        }
        const body: {
          numbers?: NumberRow[];
        } = await res.json();
        if (cancelled) {
          return;
        }
        if (!Array.isArray(body.numbers)) {
          setLoadFailed(true);
          return;
        }
        setRows(body.numbers);
        const initial: Record<string, string> = {};
        for (const row of body.numbers) {
          initial[row.path] = row.override === null ? "" : String(row.override);
        }
        setValues(initial);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  async function saveNumbers() {
    setSaving(true);
    setSaveNote(null);
    setSaveError(null);
    try {
      const overrides: Record<string, number> = {};
      for (const [path, raw] of Object.entries(values)) {
        const trimmed = raw.trim();
        if (!trimmed) {
          continue;
        }
        overrides[path] = Number(trimmed);
      }
      const res = await fetch("/api/settings/numbers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const body = await res.json();
      if (!res.ok || body.success !== true) {
        setSaveError(String(body.error ?? "Save failed."));
        return;
      }
      setSaveNote("Saved. Scout quotes your numbers from its next chat on.");
    } catch {
      setSaveError("Save failed. Is Scout running?");
    } finally {
      setSaving(false);
    }
  }
  if (loadFailed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-golden-tint px-4 py-3">
        <AlertCircle size={18} className="shrink-0 text-copper" />
        <p className="text-body text-ink">
          Could not load the numbers list. It lives on Scout, and Scout is unreachable right now.
        </p>
      </div>
    );
  }
  const isHvac = normalizeShopTrade(trade) === "hvac";
  const visibleRows =
    rows?.filter((row) => isHvac || !row.path.startsWith("equipmentServiceLifeYears.")) ?? null;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-semibold text-ink">Your shop&apos;s numbers</h3>
        <p className="mt-1 text-label text-ink-3">{shopTradeCopy(trade).numbersHint}</p>
      </div>

      {visibleRows === null ? (
        <div className="flex items-center gap-2 text-label text-ink-3">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {visibleRows.map((row) => {
            const copy = shopNumberCopy(row.path);
            const expanded = expandedNotes[row.path] === true;
            const toggleNote = (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedNotes((current) => ({ ...current, [row.path]: !expanded }))
                  }
                  className="font-medium text-ink-2 underline underline-offset-2"
                >
                  {copy.help
                    ? expanded
                      ? "Hide"
                      : "Why this default"
                    : expanded
                      ? "Less"
                      : "More"}
                </button>
              </>
            );
            return (
              <div
                key={row.path}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper-2 px-4 py-3"
              >
                <div className="min-w-[14rem] flex-1">
                  <p className="text-body font-medium text-ink">{copy.label}</p>
                  {copy.help ? (
                    <p className="text-label text-ink-3">
                      {copy.help} Default: {row.default} {row.unit}.{row.note ? toggleNote : null}
                      {expanded && row.note ? <span className="mt-1 block">{row.note}</span> : null}
                    </p>
                  ) : (
                    <p className="text-label text-ink-3">
                      Default: {row.default} {row.unit}
                      {row.note
                        ? (() => {
                            const { summary, truncated } = summarizeNote(row.note);
                            return (
                              <>
                                {" · "}
                                {expanded ? row.note : summary}
                                {truncated ? toggleNote : null}
                              </>
                            );
                          })()
                        : null}
                    </p>
                  )}
                </div>
                <input
                  aria-label={copy.label}
                  type="number"
                  inputMode="decimal"
                  value={values[row.path] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [row.path]: event.target.value }))
                  }
                  placeholder={`${row.default}`}
                  className="field w-28 py-2"
                />
              </div>
            );
          })}
        </div>
      )}

      {saveNote && (
        <div className="flex items-center gap-3 rounded-2xl bg-sage-tint px-4 py-3">
          <CheckCircle2 size={18} className="shrink-0 text-sage-deep" />
          <p className="text-body text-ink">{saveNote}</p>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-3 rounded-2xl bg-terracotta-tint px-4 py-3">
          <AlertCircle size={18} className="shrink-0 text-terracotta-deep" />
          <p className="text-body text-ink">{saveError}</p>
        </div>
      )}

      <Button
        variant="primary"
        size="md"
        onClick={saveNumbers}
        disabled={saving || rows === null}
        icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}
      >
        Save numbers
      </Button>
    </div>
  );
}
