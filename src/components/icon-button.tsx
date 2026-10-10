import { type ButtonHTMLAttributes, type ReactNode } from "react";
const VARIANT = {
  ghost: "text-ink-3 hover:bg-paper-2 hover:text-ink",
  primary: "bg-terracotta text-on-accent shadow-soft hover:bg-terracotta-deep",
  active: "bg-paper-2 text-ink",
  alarm: "bg-alarm text-on-accent hover:bg-alarm/90",
} as const;
const SIZE = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
} as const;
type Variant = keyof typeof VARIANT;
type Size = keyof typeof SIZE;
export function iconButtonClasses(opts?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  const { variant = "ghost", size = "md", className = "" } = opts ?? {};
  return `flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${SIZE[size]} ${VARIANT[variant]} ${className}`.trim();
}
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
}
export default function IconButton({
  icon,
  variant = "ghost",
  size = "md",
  className = "",
  ...rest
}: IconButtonProps) {
  return (
    <button type="button" className={iconButtonClasses({ variant, size, className })} {...rest}>
      {icon}
    </button>
  );
}
