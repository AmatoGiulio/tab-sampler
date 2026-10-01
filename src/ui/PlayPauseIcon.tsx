import { motion } from 'motion/react';

interface PlayPauseIconProps {
  playing: boolean;
  size?: number;
}

// Filled glyphs on a 24 grid, each built from the same two quadrilaterals:
// the triangle is split down the middle, and each half straightens into one
// pause bar. The icon stays one solid object whose geometry changes; nothing
// cross-fades. Fill plus a round-joined stroke of the same colour rounds the
// corners. The triangle sits right of centre so its centroid is centred.
const shapes = {
  play: {
    left: 'M8.5 5.5 L14 8.75 L14 15.25 L8.5 18.5 Z',
    right: 'M14 8.75 L19.5 12 L19.5 12 L14 15.25 Z',
  },
  pause: {
    left: 'M7 6 L9.5 6 L9.5 18 L7 18 Z',
    right: 'M14.5 6 L17 6 L17 18 L14.5 18 Z',
  },
} as const;

const transition = {
  duration: 0.2,
  ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
};

export function PlayPauseIcon({ playing, size = 24 }: PlayPauseIconProps) {
  const shape = playing ? shapes.pause : shapes.play;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <motion.path initial={false} animate={{ d: shape.left }} transition={transition} />
      <motion.path initial={false} animate={{ d: shape.right }} transition={transition} />
    </svg>
  );
}
