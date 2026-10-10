import { createDemoLeads } from "./fixtures";
import { SOURCES, type Lead, type Message, type Source, type Stage } from "./model";
export type DemoState = {
  leads: Lead[];
  now: number;
  runningId: string | null;
  typingId: string | null;
  paused: Source[];
};
export type DemoAction =
  | {
      type: "reset";
      now: number;
    }
  | {
      type: "new";
      lead: Lead;
    }
  | {
      type: "syncLive";
      leads: Lead[];
    }
  | {
      type: "message";
      id: string;
      message: Message;
    }
  | {
      type: "delivered";
      id: string;
      messageId: string;
    }
  | {
      type: "typing";
      id: string | null;
    }
  | {
      type: "finish";
      id: string;
    }
  | {
      type: "owner";
      id: string;
      owner: Lead["owner"];
    }
  | {
      type: "review";
      id: string;
    }
  | {
      type: "stage";
      id: string;
      stage: Stage;
    }
  | {
      type: "pause";
      source: Source;
    };
export function initialDemoState(now: number): DemoState {
  return { leads: createDemoLeads(now), now, runningId: null, typingId: null, paused: [] };
}
function leadFingerprint(lead: Lead): string {
  return JSON.stringify([
    lead.id,
    lead.origin,
    lead.name,
    lead.phone,
    lead.source,
    lead.stage,
    lead.service,
    lead.area,
    lead.receivedAt,
    lead.conversationEndAt,
    lead.responseSeconds,
    lead.qualified,
    lead.bookedCents,
    lead.bookedValueKnown,
    lead.owner,
    lead.appointment ?? null,
    lead.tags,
    lead.messages.map((message) => [
      message.id,
      message.speaker,
      message.text,
      message.at,
      message.delivery ?? null,
    ]),
  ]);
}
export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset") {
    return initialDemoState(action.now);
  }
  if (action.type === "syncLive") {
    const currentLive = state.leads.filter((lead) => lead.origin === "live");
    const same =
      currentLive.length === action.leads.length &&
      currentLive.every((lead) => {
        const next = action.leads.find((item) => item.id === lead.id);
        return next ? leadFingerprint(lead) === leadFingerprint(next) : false;
      });
    if (same) {
      return state;
    }
    return {
      ...state,
      leads: [...action.leads, ...state.leads.filter((lead) => lead.origin !== "live")].toSorted(
        (a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id),
      ),
      now: Math.max(state.now, action.leads[0]?.receivedAt ?? state.now),
    };
  }
  if (action.type === "pause") {
    const paused = state.paused.includes(action.source)
      ? state.paused.filter((source) => source !== action.source)
      : [...state.paused, action.source];
    const running = state.leads.find((lead) => lead.id === state.runningId);
    const stop = running && paused.includes(running.source);
    return { ...state, paused, ...(stop ? { runningId: null, typingId: null } : {}) };
  }
  if (action.type === "new") {
    if (
      !SOURCES.includes(action.lead.source) ||
      state.paused.includes(action.lead.source) ||
      state.runningId
    ) {
      return state;
    }
    return {
      ...state,
      leads: [action.lead, ...state.leads],
      runningId: action.lead.id,
      now: action.lead.receivedAt,
    };
  }
  if (action.type === "typing") {
    return action.id === state.runningId ? { ...state, typingId: action.id } : state;
  }
  const lead = state.leads.find((item) => item.id === action.id);
  if (!lead) {
    return state;
  }
  let updated = lead;
  let runningId = state.runningId;
  let typingId = state.typingId;
  if (action.type === "message") {
    if (
      action.message.speaker !== "owner" &&
      (state.runningId !== lead.id || lead.owner !== "scout")
    ) {
      return state;
    }
    if (lead.messages.some((message) => message.id === action.message.id)) {
      return state;
    }
    updated = {
      ...lead,
      messages: [...lead.messages, action.message],
      owner: action.message.speaker === "owner" ? "you" : lead.owner,
    };
    if (typingId === lead.id) {
      typingId = null;
    }
    if (action.message.speaker === "owner" && runningId === lead.id) {
      runningId = null;
    }
  } else if (action.type === "delivered") {
    const delivered = lead.messages.find((message) => message.id === action.messageId);
    updated = {
      ...lead,
      responseSeconds:
        lead.responseSeconds ??
        (delivered ? Math.max(0, Math.round((delivered.at - lead.receivedAt) / 1000)) : null),
      messages: lead.messages.map((message) =>
        message.id === action.messageId ? { ...message, delivery: "delivered" } : message,
      ),
    };
  } else if (action.type === "finish") {
    if (state.runningId !== lead.id || lead.owner !== "scout") {
      return state;
    }
    updated = {
      ...lead,
      stage: "booked",
      qualified: true,
      bookedCents: 28900,
      responseSeconds: 2,
      tags: ["Same day", "Booked by Scout"],
      appointment: "Today, 2–4 PM · demo appointment",
    };
    runningId = null;
    typingId = null;
  } else if (action.type === "owner") {
    updated = { ...lead, owner: action.owner };
    if (action.owner === "you" && runningId === lead.id) {
      runningId = null;
      typingId = null;
    }
  } else if (action.type === "review") {
    updated = { ...lead, reviewed: !lead.reviewed };
  } else if (action.type === "stage") {
    updated = {
      ...lead,
      stage: action.stage,
      qualified: action.stage === "booked" || action.stage === "unbooked",
      bookedCents: action.stage === "booked" ? lead.bookedCents || 28900 : lead.bookedCents,
    };
    if (runningId === lead.id) {
      runningId = null;
      typingId = null;
    }
  }
  return {
    ...state,
    leads: state.leads.map((item) => (item.id === lead.id ? updated : item)),
    runningId,
    typingId,
  };
}
