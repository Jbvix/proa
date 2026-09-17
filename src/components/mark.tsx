export function ProaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M16 3 L28 27 H4 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16 10 L22 23 H10 Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
