"use client";
import { Headphones, MessageCircle, PhoneForwarded } from "lucide-react";
import { useEffect, useState } from "react";
import type { Call } from "@/lib/api";
import { features } from "@/lib/features";
import { colorForName, formatDuration, formatPhone, getInitials } from "@/lib/format";
interface Props {
  call: Call;
  onListen: (call: Call) => void;
  onWhisper: (call: Call) => void;
  onTakeOver: (call: Call) => void;
}
export default function LiveCallCard({ call, onListen, onWhisper, onTakeOver }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const elapsedSec = Math.max(0, Math.floor((now - new Date(call.startedAt).getTime()) / 1000));
  const recentTurns = (call.turns ?? []).slice(-3);
  const initials = getInitials(call.callerName);
  const avatarBg = colorForName(call.callerName ?? call.callerPhone);
  return (
    <div className="overflow-hidden rounded-2xl bg-paper shadow-soft">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-body font-semibold ${avatarBg}`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-body-lg font-semibold text-ink">
                {call.callerName || "Unknown caller"}
              </h3>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sage-tint px-2 py-0.5 text-label font-semibold text-sage-deep">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sage opacity-75 motion-safe:animate-ping"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-deep"></span>
                </span>
                Live
              </span>
            </div>
            <p className="text-body text-ink-3">{formatPhone(call.callerPhone)}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-tabular text-title font-semibold text-ink">
            {formatDuration(elapsedSec)}
          </div>
          <div className="text-label text-ink-3">Duration</div>
        </div>
      </div>

      <div className="mx-2 mb-2 rounded-xl bg-paper-2/60 px-3 py-3 sm:px-4">
        <div className="mb-2 text-label font-semibold text-ink-3">Live transcript</div>
        {recentTurns.length === 0 ? (
          <div className="rounded-xl bg-paper px-4 py-3 text-center text-body text-ink-3">
            Waiting for first turn…
          </div>
        ) : (
          <div className="space-y-2">
            {recentTurns.map((turn, idx) => {
              const isScout = turn.speaker === "scout";
              const isLast = idx === recentTurns.length - 1;
              return (
                <div
                  key={idx}
                  className={`flex ${isScout ? "justify-start" : "justify-end"} ${isLast ? "animate-fadeIn" : ""}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-body ${isScout ? "bg-paper text-ink-2" : "bg-terracotta text-on-accent"}`}
                  >
                    <div
                      className={`mb-0.5 text-label font-semibold ${isScout ? "text-ink-3" : "text-on-accent/80"}`}
                    >
                      {isScout ? "Scout" : call.callerName || "Caller"}
                    </div>
                    <p className="leading-snug">{turn.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {features.liveCallControls && (
        <div className="grid grid-cols-3 gap-2 px-2 pb-2">
          <button
            onClick={() => onListen(call)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-paper-2 px-3 text-body font-semibold text-ink-2 transition-colors hover:bg-terracotta-tint hover:text-terracotta-deep"
          >
            <Headphones size={16} strokeWidth={1.8} />
            Listen
          </button>
          <button
            onClick={() => onWhisper(call)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-paper-2 px-3 text-body font-semibold text-ink-2 transition-colors hover:bg-terracotta-tint hover:text-terracotta-deep"
          >
            <MessageCircle size={16} strokeWidth={1.8} />
            Whisper
          </button>
          <button
            onClick={() => onTakeOver(call)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-paper-2 px-3 text-body font-semibold text-ink-2 transition-colors hover:bg-golden-tint hover:text-copper"
          >
            <PhoneForwarded size={16} strokeWidth={1.8} />
            Take Over
          </button>
        </div>
      )}
    </div>
  );
}
