interface LoopIconProps {
  size?: number;
}

export function LoopIcon({ size = 16 }: LoopIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
    >
      <path
        d="M7.7 6.15A7 7 0 1 1 5.2 15.7"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M4.9 6.45 7.95 6 8.35 9.05"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
