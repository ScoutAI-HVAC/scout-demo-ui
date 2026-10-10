"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  initialDemoState,
  reduceDemo,
  type DemoAction,
  type DemoState,
} from "@/lib/speed-to-lead/demo-state";
import type { Source } from "@/lib/speed-to-lead/model";
type DemoContextValue = {
  isDemo: boolean;
  state: DemoState;
  dispatch: (action: DemoAction) => void;
  run: (source: Source) => string | null;
  reset: () => void;
  send: (id: string, text: string) => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);
export function DemoProvider({
  children,
  startedAt,
  isDemo = true,
}: {
  children: ReactNode;
  startedAt: number;
  isDemo?: boolean;
}) {
  const [state, reduce] = useReducer(reduceDemo, startedAt, (now) =>
    isDemo
      ? initialDemoState(now)
      : { leads: [], now, runningId: null, typingId: null, paused: [] },
  );
  const dispatch = useCallback(
    (action: DemoAction) => {
      if (!isDemo && action.type !== "syncLive" && action.type !== "review") return;
      reduce(action);
    },
    [isDemo],
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = useRef(false);
  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = false;
  }
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => {
    if (!state.runningId) {
      busy.current = false;
    }
  }, [state.runningId]);
  function later(ms: number, action: DemoAction) {
    const timer = setTimeout(() => {
      timers.current = timers.current.filter((item) => item !== timer);
      dispatch(action);
    }, ms);
    timers.current.push(timer);
  }
  function run(source: Source) {
    if (!isDemo || source === "website" || busy.current || state.paused.includes(source)) {
      return null;
    }
    busy.current = true;
    const now = Date.now();
    const id = `demo-run-${crypto.randomUUID()}`;
    dispatch({
      type: "new",
      lead: {
        id,
        origin: "demo",
        name: "Morgan Reed",
        phone: "+16195550190",
        source,
        stage: "unbooked",
        service: "Service request",
        area: "North Park",
        receivedAt: now,
        responseSeconds: null,
        qualified: false,
        bookedCents: 0,
        tags: ["New lead"],
        reviewed: false,
        owner: "scout",
        messages: [
          {
            id: `${id}-0`,
            speaker: "customer",
            text: "Hi! We need help with a repair at our home. Can someone come out today?",
            at: now,
          },
        ],
      },
    });
    later(800, { type: "typing", id });
    const steps = [
      {
        ms: 2200,
        speaker: "scout" as const,
        text: "Hi Morgan! Scout here. What do you need help with, and what neighborhood are you in?",
      },
      {
        ms: 5200,
        speaker: "customer" as const,
        text: "We're in North Park. A fixture needs attention.",
      },
      {
        ms: 8200,
        speaker: "scout" as const,
        text: "Thanks, that helps. We have a technician available today, 2–4 PM. Would that window work for you?",
      },
      {
        ms: 11200,
        speaker: "customer" as const,
        text: "Yes please! 126 Example Lane. I'll be home.",
      },
      {
        ms: 14500,
        speaker: "scout" as const,
        text: "You're booked for today, 2–4 PM. I've included your repair request in your visit notes. Your technician will text before heading over.",
      },
    ];
    steps.forEach((step, index) => {
      if (step.speaker === "scout") {
        later(step.ms - 1000, { type: "typing", id });
      }
      const messageId = `${id}-${index + 1}`;
      later(step.ms, {
        type: "message",
        id,
        message: {
          id: messageId,
          speaker: step.speaker,
          text: step.text,
          at: now + step.ms,
          ...(step.speaker === "scout" ? { delivery: "sending" } : {}),
        },
      });
      if (step.speaker === "scout") {
        later(step.ms + 500, { type: "delivered", id, messageId });
      }
    });
    later(15300, { type: "finish", id });
    return id;
  }
  function send(id: string, text: string) {
    const trimmed = text.trim();
    if (!isDemo || !trimmed) {
      return;
    }
    const messageId = crypto.randomUUID();
    dispatch({
      type: "message",
      id,
      message: {
        id: messageId,
        speaker: "owner",
        text: trimmed,
        at: Date.now(),
        delivery: "sending",
      },
    });
    later(650, { type: "delivered", id, messageId });
  }
  return (
    <DemoContext.Provider
      value={{
        isDemo,
        state,
        dispatch,
        run,
        send,
        reset: () => {
          if (!isDemo) return;
          clearTimers();
          dispatch({ type: "reset", now: Date.now() });
        },
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export function useLeadDemo() {
  const value = useContext(DemoContext);
  if (!value) {
    throw new Error("Lead demo provider is missing");
  }
  return value;
}
