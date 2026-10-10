interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
}
export default function Wordmark({ size = "md", interactive = false }: WordmarkProps) {
  const sizes = {
    sm: "text-h2",
    md: "text-h1",
    lg: "text-4xl",
  } as const;
  return (
    <span
      className={`font-display font-medium leading-none text-ink ${sizes[size]} ${interactive ? "scout-wordmark" : ""}`}
    >
      scout
      <span className={`text-[#d97756] ${interactive ? "scout-dot inline-block" : ""}`}>.</span>
    </span>
  );
}
