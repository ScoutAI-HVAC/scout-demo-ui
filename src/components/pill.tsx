import { type ReactNode } from "react";
import { toneSurface, type Tone } from "@/lib/tone";
const SIZE = {
  sm: "px-2 py-0.5 text-micro",
  md: "px-2.5 py-0.5 text-caption",
  lg: "px-3 py-1.5 text-label",
} as const;
interface PillProps {
  children: ReactNode;
  tone?: Tone;
  size?: keyof typeof SIZE;
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  className?: string;
}
export default function Pill({
  children,
  tone = "neutral",
  size = "md",
  icon,
  onClick,
  active = false,
  title,
  className = "",
}: PillProps) {
  const base = `inline-flex items-center gap-1.5 rounded-pill font-semibold ${SIZE[size]} ${className}`;
  const surface = active ? "bg-ink text-paper" : toneSurface(tone);
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${base} ${surface} transition-colors`}
      >
        {icon}
        {children}
      </button>
    );
  }
  return (
    <span className={`${base} ${surface}`} title={title}>
      {icon}
      {children}
    </span>
  );
}
