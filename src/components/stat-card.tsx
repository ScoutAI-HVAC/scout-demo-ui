import { TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode } from "react";
import Card from "@/components/card";
import { tone as toneClasses, type Tone } from "@/lib/tone";
interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  delta?: number;
  sub?: ReactNode;
  variant?: "boxed" | "plain" | "mini" | "metric";
}
function Delta({ delta }: { delta: number }) {
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-semibold ${up ? "bg-sage-tint text-sage-deep" : "bg-terracotta-tint text-terracotta-deep"}`}
    >
      <Icon size={11} strokeWidth={2.4} />
      {up ? "+" : ""}
      {delta}%
    </span>
  );
}
export default function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  delta,
  sub,
  variant = "boxed",
}: StatCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  if (variant === "metric") {
    return (
      <dl className="min-w-0 bg-paper p-4 sm:p-5">
        <dt className="flex items-center gap-2 text-label font-semibold leading-snug text-ink-2">
          {icon && (
            <span aria-hidden="true" className="shrink-0 text-ink-3">
              {icon}
            </span>
          )}
          {label}
        </dt>
        <dd className="mt-3 break-words font-tabular text-h1 font-semibold leading-tight tracking-tight text-ink sm:text-display">
          {value}
        </dd>
        {sub && <dd className="mt-2 text-caption leading-relaxed text-ink-3">{sub}</dd>}
        {hasDelta && (
          <dd className="mt-2">
            <Delta delta={delta} />
          </dd>
        )}
      </dl>
    );
  }
  const body = (
    <>
      {(icon || hasDelta) && (
        <div className="flex items-center justify-between">
          {icon && (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses(tone).icon}`}
            >
              {icon}
            </span>
          )}
          {hasDelta && <Delta delta={delta} />}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <p className="font-display font-tabular text-display font-medium leading-none text-ink">
          {value}
        </p>
        <p className="text-label font-medium leading-snug text-ink-3">{label}</p>
        {sub && <p className="text-caption leading-snug text-ink-3">{sub}</p>}
      </div>
    </>
  );
  if (variant === "mini") {
    return (
      <div className="rounded-xl bg-paper-2 px-3 py-2">
        <p className="text-caption font-semibold text-ink-3">{label}</p>
        <p className="font-tabular text-body font-medium text-ink">{value}</p>
      </div>
    );
  }
  if (variant === "plain") {
    return <div className="flex flex-col gap-3">{body}</div>;
  }
  return (
    <Card interactive className="flex flex-col gap-3">
      {body}
    </Card>
  );
}
