import { type ReactNode } from "react";
export const PAGE_TITLE =
  "font-display text-display font-medium leading-tight text-ink sm:text-4xl lg:text-5xl";
interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  above?: ReactNode;
  className?: string;
}
export default function PageHeader({
  title,
  subtitle,
  actions,
  above,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-6 ${className}`.trim()}>
      <div className="animate-fadeIn min-w-0">
        {above && <div className="mb-3 flex flex-wrap items-center gap-2.5">{above}</div>}
        <h1 className={PAGE_TITLE}>{title}</h1>
        {subtitle && (
          <div className="mt-2 max-w-2xl text-body leading-relaxed text-ink-3">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
