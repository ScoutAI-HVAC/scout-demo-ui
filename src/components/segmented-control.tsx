"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export interface SegmentedOption<T extends string> {
  key: T;
  name: string;
  count?: number;
}
interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: SegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{
    left: number;
    width: number;
  } | null>(null);
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const selected = track.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!selected) return;
    setThumb({ left: selected.offsetLeft, width: selected.offsetWidth });
  }, []);
  useEffect(() => {
    measure();
  }, [measure, value, options]);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure]);
  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={label}
      className={`ios-segment ${className}`.trim()}
    >
      {thumb ? (
        <span
          aria-hidden="true"
          className="ios-segment-thumb"
          style={{ transform: `translateX(${thumb.left - 2}px)`, width: thumb.width }}
        />
      ) : null}
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          aria-label={option.count ? `${option.name}, ${option.count}` : option.name}
          className="ios-segment-option press"
        >
          {option.name}
          {option.count ? <span className="ml-1.5 opacity-55">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
