interface LoopIconProps {
  size?: number;
}

export function LoopIcon({ size = 30 }: LoopIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
    >
      <path
        d="M8.2 9.1A10.2 10.2 0 1 1 6.9 20.2"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
      />
      <path
        d="M5.3 7.7 9.05 8.2 8.55 11.95"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
