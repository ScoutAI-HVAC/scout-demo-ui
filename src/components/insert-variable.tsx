"use client";
import { Braces } from "lucide-react";
import { useEffect, useRef, useState } from "react";
export interface PlaceholderOption {
  name: string;
  label: string;
  example: string;
}
export default function InsertVariable({
  options,
  onInsert,
}: {
  options: PlaceholderOption[];
  onInsert: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  if (options.length === 0) return null;
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => `${o.label} ${o.name}`.toLowerCase().includes(needle))
    : options;
  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
        }}
        className="inline-flex items-center gap-1.5 rounded-pill border border-tan-soft bg-paper-2 px-2.5 py-1 text-label font-medium text-ink-3 hover:text-ink"
      >
        <Braces size={12} />
        Insert variable
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-80 rounded-xl border border-tan-soft bg-paper p-2 shadow-card">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: name, amount, invoice…"
            className="w-full rounded-lg border border-tan-soft bg-cream px-2.5 py-1.5 text-body text-ink outline-none"
          />
          <div className="mt-1 max-h-56 overflow-y-auto">
            {shown.map((o) => (
              <button
                key={o.name}
                type="button"
                onClick={() => {
                  onInsert(o.name);
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-paper-2"
              >
                <span className="text-body text-ink">{o.label}</span>
                <span className="shrink-0 text-label text-ink-3">e.g. {o.example}</span>
              </button>
            ))}
            {shown.length === 0 ? (
              <div className="px-2 py-2 text-label text-ink-3">Nothing matches.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
