"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { inboxSurface } from "@/lib/inbox-surface";
import { liveThreadMessages, type LiveThread } from "@/lib/speed-to-lead/live-thread";
import type { Lead, Message } from "@/lib/speed-to-lead/model";
type GoogleThread = {
  id: string;
  canReply: boolean;
  takenOver?: boolean;
  automatic?: boolean;
  attention?: string;
  messages: Message[];
  pendingReply?: {
    outcome: string;
  };
};
const googleEndpoint = "/api/integrations/google-lsa";
export function useLiveThread(lead: Lead | undefined) {
  const phone = lead?.origin === "live" && /^\+[1-9]\d{7,14}$/.test(lead.phone) ? lead.phone : null;
  const googleId = lead?.origin === "live" ? lead.googleThreadId : undefined;
  const key = lead?.id ?? "";
  const activeKey = useRef(key);
  activeKey.current = key;
  const [state, setState] = useState<{
    key: string;
    thread?: LiveThread;
    google?: GoogleThread;
    error?: string;
  }>({
    key: "",
  });
  const pending = useRef(new Set<string>());
  const googleOperations = useRef(
    new Map<
      string,
      {
        id: string;
        body: string;
      }
    >(),
  );
  const requestSequence = useRef(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!phone && !googleId) return;
      const request = ++requestSequence.current;
      try {
        const response = googleId
          ? await fetch(googleEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "thread", id: googleId }),
              signal,
            })
          : await fetch(`/api/inbox/thread?phone=${encodeURIComponent(phone!)}`, {
              cache: "no-store",
              signal,
            });
        if (!response.ok) throw new Error("Couldn't load this conversation. Retrying…");
        const data = await response.json();
        if (
          !Array.isArray(data.messages) ||
          (googleId ? data.id !== googleId : data.phoneE164 !== phone)
        )
          throw new Error("Couldn't load this conversation. Retrying…");
        if (!signal?.aborted && activeKey.current === key && request === requestSequence.current)
          setState(googleId ? { key, google: data } : { key, thread: data });
      } catch {
        if (!signal?.aborted && activeKey.current === key && request === requestSequence.current)
          setState((previous) => ({
            key,
            thread: previous.key === key ? previous.thread : undefined,
            google: previous.key === key ? previous.google : undefined,
            error: "Couldn't load this conversation. Retrying…",
          }));
      }
    },
    [phone, key, googleId],
  );
  useEffect(() => {
    if (!phone && !googleId) return;
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        await load(controller.signal);
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [phone, googleId, load]);
  const current = state.key === key ? state : undefined;
  const canSend = Boolean(
    current?.google
      ? current.google.canReply && !current.error
      : phone &&
          current?.thread?.canSend &&
          !current.error &&
          !current.thread.optedOut &&
          lead?.conversationEndAt === undefined,
  );
  async function act(action: "send" | "takeover" | "resume", body?: string) {
    if ((action === "send" && !canSend) || !current || current.error || pending.current.has(key))
      return false;
    pending.current.add(key);
    setBusyKey(key);
    try {
      let operation = googleOperations.current.get(key);
      if (googleId && (!operation || operation.body !== body)) {
        operation = { id: crypto.randomUUID(), body: body ?? "" };
        googleOperations.current.set(key, operation);
      }
      const response = await fetch(googleId ? googleEndpoint : `/api/inbox/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          googleId
            ? {
                action: action === "send" ? "reply" : action,
                id: googleId,
                operationId: operation?.id,
                body,
              }
            : {
                phone,
                surface: inboxSurface("speed-to-lead"),
                ...(body === undefined ? {} : { body }),
              },
        ),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || (googleId && action === "send" && result.outcome !== "accepted")) {
        throw new Error(
          googleId
            ? "Google hasn't confirmed this reply. Check the conversation before trying again."
            : typeof result.error === "string"
              ? result.error
              : "Couldn't complete that action. Please retry.",
        );
      }
      googleOperations.current.delete(key);
      await load();
      return true;
    } catch (error) {
      if (activeKey.current === key)
        setState((previous) => ({
          ...previous,
          key,
          error: error instanceof Error ? error.message : "Couldn't complete that action.",
        }));
      return false;
    } finally {
      pending.current.delete(key);
      setBusyKey((value) => (value === key ? null : value));
    }
  }
  return {
    messages: current?.google
      ? current.google.messages
      : lead && current?.thread
        ? liveThreadMessages(lead, current.thread)
        : (lead?.messages ?? []),
    owner: (googleId ? current?.google?.takenOver : current?.thread?.takenOver)
      ? ("you" as const)
      : ("scout" as const),
    attention: current?.google?.attention,
    automatic: current?.google?.automatic,
    canControl: Boolean(current && !current.error),
    nativeProvider: Boolean(googleId),
    error:
      current?.error ??
      (current?.google &&
      ["sending", "uncertain"].includes(current.google.pendingReply?.outcome ?? "")
        ? "Google has not confirmed the last reply. Check it in Google before sending again."
        : undefined),
    loading: Boolean((phone || googleId) && !current),
    busy: busyKey === key,
    canSend,
    act,
  };
}
