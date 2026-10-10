"use client";
import { useSyncExternalStore } from "react";
import type { ScoutImpact } from "./scout-impact";
const POLL_MS = 60000;
type Snapshot = {
  impact: ScoutImpact | null;
  failed: boolean;
};
const EMPTY: Snapshot = { impact: null, failed: false };
let snapshot = EMPTY;
let loading = false;
let readAtMs = 0;
let controller: AbortController | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}
async function refresh() {
  if (loading || !controller) return;
  const { signal } = controller;
  loading = true;
  readAtMs = Date.now();
  try {
    const response = await fetch("/api/scout-impact", { cache: "no-store", signal });
    if (!response.ok) {
      throw new Error("Unavailable");
    }
    const body = await response.json();
    if (
      [body.total, body.recovered, body.estimated].some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    ) {
      throw new Error("Unknown total");
    }
    if (!signal.aborted) publish({ impact: body, failed: false });
  } catch {
    if (!signal.aborted) publish({ impact: snapshot.impact, failed: true });
  } finally {
    loading = false;
  }
}
function onVisibility() {
  if (!document.hidden && Date.now() - readAtMs >= POLL_MS) void refresh();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    controller = new AbortController();
    void refresh();
    timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    controller?.abort();
    controller = null;
    loading = false;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    snapshot = EMPTY;
  };
}
export function useScoutImpact() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
