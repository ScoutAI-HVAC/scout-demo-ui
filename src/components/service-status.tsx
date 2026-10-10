"use client";
import { useEffect, useState } from "react";
const UNAVAILABLE = "Service status is temporarily unavailable.";
const RECHECK_MS = 5000;
async function readStatus(): Promise<{
  status?: unknown;
  message?: unknown;
}> {
  try {
    const response = await fetch("/api/service-status", {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Unavailable");
    return await response.json();
  } catch {
    return { status: "unknown" };
  }
}
export default function ServiceStatus() {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let loading = false;
    let unknownReads = 0;
    let recheck: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (loading || document.hidden) return;
      loading = true;
      clearTimeout(recheck);
      try {
        const data = await readStatus();
        if (stopped) return;
        if (data.status === "checked") {
          unknownReads = 0;
          setNotice(null);
          return;
        }
        const message = typeof data.message === "string" ? data.message : UNAVAILABLE;
        if (data.status === "attention") {
          unknownReads = 0;
          setNotice(message);
          return;
        }
        unknownReads += 1;
        if (unknownReads >= 2) setNotice(message);
        else recheck = setTimeout(() => void refresh(), RECHECK_MS);
      } finally {
        loading = false;
      }
    }
    const onResume = () => void refresh();
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(recheck);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
    };
  }, []);
  return notice ? (
    <div role="status" className="mb-4 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink">
      {notice}
    </div>
  ) : null;
}
