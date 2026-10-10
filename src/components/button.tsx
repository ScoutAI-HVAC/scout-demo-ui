import { type ButtonHTMLAttributes, type ReactNode } from "react";
const VARIANT = {
  primary: "bg-terracotta text-on-accent shadow-soft hover:bg-terracotta-deep",
  secondary: "bg-paper-2 text-ink hover:bg-tan-soft active:bg-tan-soft",
  ghost: "bg-transparent text-ink-2 hover:text-ink hover:bg-paper-2",
  danger: "bg-transparent text-ink-2 hover:bg-alarm-tint hover:text-alarm",
} as const;
const SIZE = {
  sm: "h-8 px-3 text-label",
  md: "h-10 px-4 text-body",
  lg: "h-11 px-5 text-body",
} as const;
const ICON_SIZE = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-11 w-11",
} as const;
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  icon?: ReactNode;
  iconOnly?: boolean;
  pill?: boolean;
}
export default function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  iconOnly = false,
  pill = false,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pill ? "rounded-pill" : "rounded-xl"} ${iconOnly ? ICON_SIZE[size] : SIZE[size]} ${VARIANT[variant]} ${className}`.trim()}
      {...rest}
    >
      {icon}
      {!iconOnly && children}
    </button>
  );
}
