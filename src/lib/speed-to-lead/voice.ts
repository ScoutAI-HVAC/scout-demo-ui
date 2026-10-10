import type { Source } from "./model";
export type StlVoiceMode = "live" | "mock" | "disabled";
export type StlVoiceProvider = "vapi" | "mock" | "twilio" | "telnyx" | "plivo";
export type StlVoiceCapability = {
  mode: StlVoiceMode;
  capabilities: {
    liveOutbound: boolean;
    parallelSms: boolean;
    voicemailFallback: boolean;
  };
  provider?: StlVoiceProvider;
  notes?: string;
};
export type StlVoiceInitiateRequest = {
  action: "initiate_callback";
  leadId: string;
  source: Source;
  to?: string;
};
export type StlVoiceInitiateResult = {
  ok: boolean;
  initiated: boolean;
  mode: StlVoiceMode;
  callId?: string;
  notes?: string;
  error?: string;
};
const VOICE_PATH = "/api/speed-to-lead/voice";
export async function fetchStlVoiceCapability(): Promise<StlVoiceCapability> {
  const res = await fetch(VOICE_PATH, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Couldn't load voice capability.");
  }
  return (await res.json()) as StlVoiceCapability;
}
export async function initiateStlCallback(input: {
  leadId: string;
  source: Source;
  to?: string;
}): Promise<StlVoiceInitiateResult> {
  const res = await fetch(VOICE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "initiate_callback",
      leadId: input.leadId,
      source: input.source,
      ...(input.to ? { to: input.to } : {}),
    } satisfies StlVoiceInitiateRequest),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<StlVoiceInitiateResult>;
  const mode = body.mode;
  if (mode !== "live" && mode !== "mock" && mode !== "disabled") {
    const error = typeof body.error === "string" ? body.error : "Couldn't start the callback.";
    throw new Error(error);
  }
  return {
    ok: body.ok === true,
    initiated: body.initiated === true,
    mode,
    ...(typeof body.callId === "string" ? { callId: body.callId } : {}),
    ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
    ...(typeof body.error === "string" ? { error: body.error } : {}),
  };
}
