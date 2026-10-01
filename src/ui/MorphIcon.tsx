import { motion } from 'motion/react';

interface LineShape {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity?: number;
}

interface IconShape {
  lines: [LineShape, LineShape, LineShape];
  rotation?: number;
  rotationGroup?: string;
}

const collapsed: LineShape = {
  x1: 8,
  y1: 8,
  x2: 8,
  y2: 8,
  opacity: 0,
};

const shapes = {
  play: {
    lines: [
      { x1: 5, y1: 4, x2: 5, y2: 12 },
      { x1: 5, y1: 4, x2: 12, y2: 8 },
      { x1: 12, y1: 8, x2: 5, y2: 12 },
    ],
  },
  pause: {
    lines: [
      { x1: 6, y1: 4, x2: 6, y2: 12 },
      { x1: 10, y1: 4, x2: 10, y2: 12 },
      collapsed,
    ],
  },
  download: {
    lines: [
      { x1: 8, y1: 3, x2: 8, y2: 10 },
      { x1: 5, y1: 7, x2: 8, y2: 10 },
      { x1: 11, y1: 7, x2: 8, y2: 10 },
    ],
  },
  arrowRight: {
    rotationGroup: 'arrow',
    rotation: 0,
    lines: [
      { x1: 3, y1: 8, x2: 12, y2: 8 },
      { x1: 9, y1: 5, x2: 12, y2: 8 },
      { x1: 9, y1: 11, x2: 12, y2: 8 },
    ],
  },
  arrowDown: {
    rotationGroup: 'arrow',
    rotation: 90,
    lines: [
      { x1: 3, y1: 8, x2: 12, y2: 8 },
      { x1: 9, y1: 5, x2: 12, y2: 8 },
      { x1: 9, y1: 11, x2: 12, y2: 8 },
    ],
  },
} satisfies Record<string, IconShape>;

export type MorphIconName = keyof typeof shapes;

interface MorphIconProps {
  name: MorphIconName;
  size?: number;
  strokeWidth?: number;
}

const transition = {
  duration: 0.12,
  ease: [0.22, 0.9, 0.28, 1] as [number, number, number, number],
};

export function MorphIcon({
  name,
  size = 16,
  strokeWidth = 1.55,
}: MorphIconProps) {
  const shape = shapes[name];

  return (
    <motion.svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      initial={false}
    >
      <motion.g
        initial={false}
        animate={{ rotate: shape.rotation ?? 0 }}
        transition={transition}
        style={{ transformOrigin: '8px 8px' }}
      >
        {shape.lines.map((line, index) => (
          <motion.line
            key={index}
            initial={false}
            animate={{
              x1: line.x1,
              y1: line.y1,
              x2: line.x2,
              y2: line.y2,
              opacity: line.opacity ?? 1,
            }}
            transition={transition}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </motion.g>
    </motion.svg>
  );
}
