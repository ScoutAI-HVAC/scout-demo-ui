import Pill from "@/components/pill";
import type { Tone } from "@/lib/tone";
export type EstimateStatus =
  | "pending_approval"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "cold"
  | "expired";
export type JobPriority = "emergency" | "urgent" | "normal";
interface BadgeProps {
  tone?: Tone;
  label: string;
  dot?: boolean;
}
export default function Badge({ tone = "neutral", label, dot = false }: BadgeProps) {
  return (
    <Pill
      tone={tone}
      icon={dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : undefined}
    >
      {label}
    </Pill>
  );
}
const STATUS: Record<
  EstimateStatus,
  {
    tone: Tone;
    label: string;
  }
> = {
  pending_approval: { tone: "golden", label: "Awaiting approval" },
  sent: { tone: "skyblue", label: "Sent" },
  viewed: { tone: "golden", label: "Viewed" },
  accepted: { tone: "sage", label: "Won" },
  declined: { tone: "alarm", label: "Declined" },
  cold: { tone: "neutral", label: "Cold" },
  expired: { tone: "neutral", label: "Expired" },
};
export function statusLabel(status: EstimateStatus): string {
  return (STATUS[status] ?? STATUS.sent).label;
}
export function StatusBadge({ status }: { status: EstimateStatus }) {
  const s = STATUS[status] ?? STATUS.sent;
  return <Badge tone={s.tone} label={s.label} />;
}
const PRIORITY: Record<
  JobPriority,
  {
    tone: Tone;
    label: string;
  }
> = {
  emergency: { tone: "alarm", label: "Emergency" },
  urgent: { tone: "golden", label: "Urgent" },
  normal: { tone: "skyblue", label: "Normal" },
};
export function PriorityBadge({ priority }: { priority: JobPriority }) {
  const p = PRIORITY[priority];
  return <Badge tone={p.tone} label={p.label} dot />;
}
