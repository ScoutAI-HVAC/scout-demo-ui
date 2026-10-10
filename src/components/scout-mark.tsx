const DIAMOND = "M12 3 16.4 12 12 21 7.6 12Z";
const NORTH = "M12 3 16.4 12 7.6 12Z";
export default function ScoutMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10.1" opacity="0.35" />
      <path d={NORTH} fill="currentColor" stroke="none" />
      <path d={DIAMOND} />
    </svg>
  );
}
