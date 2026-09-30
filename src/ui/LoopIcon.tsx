interface LoopIconProps {
  size?: number;
}

export function LoopIcon({ size = 16 }: LoopIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
    >
      <path
        d="M4.25 5.25h5.9c1.48 0 2.6 1.08 2.6 2.55 0 .54-.15 1.02-.42 1.42"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="m10.7 3.75 1.9 1.5-1.9 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.75 10.75h-5.9c-1.48 0-2.6-1.08-2.6-2.55 0-.54.15-1.02.42-1.42"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="m5.3 12.25-1.9-1.5 1.9-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
