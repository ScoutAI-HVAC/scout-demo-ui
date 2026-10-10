export default function ScoutMascot({ className = "" }: { className?: string }) {
  return (
    <img
      src="/icons/scout-brand-v1/scout-buddy-256.webp"
      width={256}
      height={307}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`select-none object-contain ${className}`}
    />
  );
}
