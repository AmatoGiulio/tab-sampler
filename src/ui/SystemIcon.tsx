interface SystemIconProps {
  name: 'plus' | 'download' | 'repeat';
  size?: number;
  strokeWidth?: number;
}

const paths = {
  plus: (
    <>
      <path d="M12 4.5v15" />
      <path d="M4.5 12h15" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.5" />
      <path d="m7.25 10.5 4.75 4.75 4.75-4.75" />
      <path d="M5.5 20.5h13" />
    </>
  ),
  // Two arrows chasing each other: reads as "repeat", where a single
  // counter-clockwise arrow reads as "undo".
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
} as const;

export function SystemIcon({
  name,
  size = 20,
  strokeWidth = 2,
}: SystemIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
