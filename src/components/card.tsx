import { type ElementType, type ReactNode } from "react";
import { tone as toneClasses, type Tone } from "@/lib/tone";
const RADIUS = {
  md: "rounded-2xl",
  lg: "rounded-3xl",
} as const;
const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
  xl: "p-8",
} as const;
const SHADOW = {
  soft: "shadow-soft",
  card: "shadow-card",
  none: "",
} as const;
interface CardProps {
  children: ReactNode;
  as?: ElementType;
  radius?: keyof typeof RADIUS;
  padding?: keyof typeof PADDING;
  shadow?: keyof typeof SHADOW;
  tone?: Tone;
  interactive?: boolean;
  className?: string;
}
export default function Card({
  children,
  as: Tag = "div",
  radius = "md",
  padding = "md",
  shadow = "soft",
  tone,
  interactive = false,
  className = "",
}: CardProps) {
  const surface = tone ? toneClasses(tone).bg : "bg-paper";
  return (
    <Tag
      className={`${RADIUS[radius]} ${surface} ${PADDING[padding]} ${SHADOW[shadow]} ${interactive ? "hover-lift" : ""} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
