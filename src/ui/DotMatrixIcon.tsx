import type { CSSProperties } from 'react';

export type DotMatrixIconName =
  | 'plus'
  | 'download'
  | 'repeat'
  | 'play'
  | 'pause';

interface DotMatrixIconProps {
  name: DotMatrixIconName;
  size?: number;
  className?: string;
}

const GRID = 7;
const STEP = 3;
const ORIGIN = 3;

const patterns: Record<DotMatrixIconName, readonly string[]> = {
  plus: [
    '0001000',
    '0001000',
    '0001000',
    '1111111',
    '0001000',
    '0001000',
    '0001000',
  ],
  download: [
    '0001000',
    '0001000',
    '0001000',
    '0101010',
    '0011100',
    '0001000',
    '1111111',
  ],
  repeat: [
    '0011110',
    '0100001',
    '1000001',
    '1000000',
    '1000001',
    '0100001',
    '0111100',
  ],
  play: [
    '0010000',
    '0011000',
    '0011100',
    '0011110',
    '0011100',
    '0011000',
    '0010000',
  ],
  pause: [
    '0110110',
    '0110110',
    '0110110',
    '0110110',
    '0110110',
    '0110110',
    '0110110',
  ],
};

export function DotMatrixIcon({
  name,
  size = 22,
  className = '',
}: DotMatrixIconProps) {
  const pattern = patterns[name];
  const style = { '--dot-matrix-size': `${size}px` } as CSSProperties;

  return (
    <svg
      aria-hidden="true"
      className={`dot-matrix-icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
    >
      {Array.from({ length: GRID * GRID }, (_, index) => {
        const row = Math.floor(index / GRID);
        const column = index % GRID;
        const lit = pattern[row]?.[column] === '1';

        return (
          <circle
            key={index}
            className={`dot-matrix-icon__dot ${lit ? 'is-lit' : ''}`}
            cx={ORIGIN + column * STEP}
            cy={ORIGIN + row * STEP}
            r="1.05"
          />
        );
      })}
    </svg>
  );
}
