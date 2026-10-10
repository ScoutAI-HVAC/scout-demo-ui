import { Check, CheckCheck, Clock3 } from "lucide-react";
import { useShopClock } from "@/components/shop-clock";
import { shopTime } from "@/lib/shop-time";
import {
  SOURCE_NAMES,
  STAGE_NAMES,
  type Lead,
  type Message,
  type Source,
} from "@/lib/speed-to-lead/model";
export const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink/6 px-4 text-body font-semibold text-ink-2 transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";
export const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-body font-semibold text-on-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40";
export const input =
  "quiet-focus min-h-11 min-w-0 rounded-full bg-ink/6 px-4 text-body-lg text-ink outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-sage/40 sm:text-body";
export function SourceMark({ source }: { source: Source }) {
  const colors: Record<Source, string> = {
    google_lsa: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    meta: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    thumbtack: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    angi: "bg-red-500/10 text-red-500 dark:text-red-300",
    yelp: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
    website: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-title font-bold ${colors[source]}`}
    >
      {{ google_lsa: "G", meta: "∞", thumbtack: "t", angi: "A", yelp: "✳", website: "W" }[source]}
    </span>
  );
}
export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/6 px-2 py-0.5 text-label font-medium text-ink-2">
      <span className="text-terracotta">
        {{ google_lsa: "G", meta: "∞", thumbtack: "t", angi: "A", yelp: "✳", website: "W" }[source]}
      </span>
      {SOURCE_NAMES[source]}
    </span>
  );
}
export function StageBadge({ stage }: { stage: Lead["stage"] }) {
  const colors = {
    booked: "bg-sage-tint text-sage-deep",
    unbooked: "bg-golden-tint text-ink-2",
    excused: "bg-ink/6 text-ink-3",
    not_delivered: "bg-alarm-tint text-alarm",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold whitespace-nowrap ${colors[stage]}`}
    >
      {stage === "booked" && <Check size={12} strokeWidth={2.2} />}
      {STAGE_NAMES[stage]}
    </span>
  );
}
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ink/8 font-semibold text-ink-2 ${small ? "h-10 w-10 text-label" : "h-11 w-11 text-body"}`}
    >
      {name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}
export function MessageBubble({ message }: { message: Message }) {
  const clock = useShopClock();
  const outbound = message.speaker !== "customer";
  const fill =
    message.speaker === "customer"
      ? "rounded-bl-md bg-ink/6"
      : message.speaker === "owner"
        ? "rounded-br-md bg-golden-tint"
        : "rounded-br-md bg-sage-tint";
  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-[20px] px-4 py-2.5 text-body-lg leading-snug break-words whitespace-pre-wrap text-ink sm:max-w-[75%] sm:text-body sm:leading-relaxed ${fill}`}
      >
        {message.text}
      </div>
      <div className="mt-1 flex items-center gap-1 px-2 text-caption text-ink-3">
        <time dateTime={new Date(message.at).toISOString()}>{shopTime(message.at, clock)}</time>
        {outbound && (
          <>
            <span>· {message.speaker === "owner" ? "You" : "Scout"}</span>
            {message.delivery === "sending" ? (
              <>
                <Clock3 size={12} /> Sending
              </>
            ) : message.delivery === "failed" ? (
              <span className="font-semibold text-alarm">Not delivered</span>
            ) : message.delivery === "delivered" ? (
              <CheckCheck size={13} aria-label="Delivered" />
            ) : message.delivery === "sent" ? (
              <span>Sent</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
