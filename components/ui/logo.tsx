type LogoProps = {
  variant?: "box" | "standalone";
  size?: number;
  className?: string;
};

/**
 * Popnorc mark — a popcorn bucket rendered as a minimal solid trapezoid.
 * "box" = dark rounded square background (used on dark surfaces, e.g. sidebar).
 * "standalone" = mark only, no background (used on light surfaces, e.g. marketing nav).
 */
export function Logo({ variant = "box", size = 32, className = "" }: LogoProps) {
  if (variant === "standalone") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className={className}
        aria-label="Popnorc"
      >
        <path d="M14 8 L50 8 L42 58 L22 58 Z" fill="#F5A623" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-label="Popnorc"
    >
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0A0A0B" />
      <path d="M21 22 L43 22 L39 51 L25 51 Z" fill="#F5A623" />
    </svg>
  );
}
