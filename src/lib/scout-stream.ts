export async function streamScoutTurn(
  thread: string,
  message: string,
  onUpdate: (state: { text: string; toolLine: string | null }) => void,
  options?: {
    campaignId: string;
  },
): Promise<{
  text: string;
  error: string;
}> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-scout-chat-thread": thread },
    body: JSON.stringify({ message, ...(options ? { campaignId: options.campaignId } : {}) }),
  });
  if (!res.ok || !res.body) {
    throw new Error("send failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let full = "";
  let toolLine: string | null = null;
  let snapshotPending = false;
  let streamError = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const events = buffered.split("\n\n");
    buffered = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const payload = JSON.parse(line.slice(5)) as {
            delta?: string;
            snapshot?: string;
            error?: string;
            thinking?: boolean;
            tool?: {
              label?: string;
              phase?: string;
            };
          };
          if (payload.thinking) {
            toolLine = "Thinking it through…";
            onUpdate({ text: full, toolLine });
          }
          if (payload.tool?.label) {
            toolLine = payload.tool.phase === "start" ? payload.tool.label : null;
            onUpdate({ text: full, toolLine });
          }
          if (payload.error) streamError = payload.error;
          if (typeof payload.snapshot === "string" && payload.snapshot) {
            full = payload.snapshot;
            snapshotPending = true;
            toolLine = null;
            onUpdate({ text: full, toolLine });
          }
          if (payload.delta) {
            full = snapshotPending ? payload.delta : full + payload.delta;
            snapshotPending = false;
            toolLine = null;
            onUpdate({ text: full, toolLine });
          }
        } catch {}
      }
    }
  }
  return { text: full.trim(), error: streamError };
}
