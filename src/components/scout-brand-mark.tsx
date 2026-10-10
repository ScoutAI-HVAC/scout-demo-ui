export default function ScoutBrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="scout-brand-mark inline-grid shrink-0"
      style={{ width: size, height: size }}
    >
      <img
        src="/icons/scout-brand-v1/scout-mark-ink-192.webp"
        alt=""
        width={size}
        height={size}
        className="scout-brand-mark-ink col-start-1 row-start-1 h-full w-full"
      />
      <img
        src="/icons/scout-brand-v1/scout-mark-cream-192.webp"
        alt=""
        width={size}
        height={size}
        className="scout-brand-mark-cream col-start-1 row-start-1 h-full w-full"
      />
    </span>
  );
}
