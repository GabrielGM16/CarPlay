/**
 * The icon set, drawn as paths rather than pulled from a font.
 *
 * Every glyph is built on a 24-unit grid with a 1.7-unit stroke and round
 * caps, so at the sizes a car UI needs they read as one family of instrument
 * markings rather than as assorted downloads. Transport symbols are solid
 * because a filled triangle is legible at a glance and an outlined one is not.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color as palette } from '../theme';

export type GlyphName =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'gauge'
  | 'folder'
  | 'folder-open'
  | 'queue'
  | 'apps'
  | 'note'
  | 'back'
  | 'forward'
  | 'close'
  | 'plus'
  | 'play-next'
  | 'remove'
  | 'split'
  | 'refresh'
  | 'volume'
  | 'up'
  | 'down';

interface Drawing {
  /** Stroked outline paths. */
  stroke?: string[];
  /** Solid paths. */
  fill?: string[];
  /** Circles, given as `[cx, cy, r]`, stroked unless `fill` is set. */
  circles?: [number, number, number, number?][];
  /** Rects, given as `[x, y, w, h, radius]`, always solid. */
  rects?: [number, number, number, number, number][];
}

const GLYPHS: Record<GlyphName, Drawing> = {
  // Transport: solid, so they hold up at a glance and in peripheral vision.
  play: { fill: ['M8 5.2 19 12 8 18.8Z'] },
  pause: {
    rects: [
      [7.5, 5, 3.2, 14, 1.2],
      [13.3, 5, 3.2, 14, 1.2],
    ],
  },
  next: {
    fill: ['M6.5 5.6 15 12l-8.5 6.4Z'],
    rects: [[16.4, 5.6, 2.4, 12.8, 1.1]],
  },
  previous: {
    fill: ['M17.5 5.6 9 12l8.5 6.4Z'],
    rects: [[5.2, 5.6, 2.4, 12.8, 1.1]],
  },

  // Crossing arrows, the only sensible way to say "not in order".
  shuffle: {
    stroke: [
      'M3.5 7h3.2c1.5 0 2.4.7 3.3 1.9l4 5.4c.9 1.2 1.8 1.8 3.3 1.8h2.2',
      'M3.5 17h3.2c1.5 0 2.4-.6 3.3-1.8l.9-1.2',
      'M13.8 9.9l.4-.6c.9-1.2 1.8-1.9 3.3-1.9h2.5',
      'M17.8 4.6 20.8 7.4 17.8 10.2',
      'M17.8 13.4 20.8 16.1 17.8 18.9',
    ],
  },
  repeat: {
    stroke: [
      'M7.2 4.8h9.6a3.4 3.4 0 0 1 3.4 3.4v3',
      'M16.8 19.2H7.2a3.4 3.4 0 0 1-3.4-3.4v-3',
      'M17.6 2.4 20.2 4.8 17.6 7.2',
      'M6.4 16.8 3.8 19.2 6.4 21.6',
    ],
  },
  // Same loop, with a numeral inside it.
  'repeat-one': {
    stroke: [
      'M7.2 4.8h9.6a3.4 3.4 0 0 1 3.4 3.4v3',
      'M16.8 19.2H7.2a3.4 3.4 0 0 1-3.4-3.4v-3',
      'M17.6 2.4 20.2 4.8 17.6 7.2',
      'M6.4 16.8 3.8 19.2 6.4 21.6',
      'M10.9 10.4 12.4 9.4v5.2',
    ],
  },

  // Navigation: a dial face, a folder, a list, a grid of keys.
  gauge: {
    stroke: ['M4.6 17.6a9 9 0 1 1 14.8 0', 'M12 12l4.2-3.4'],
    circles: [[12, 17.6, 1.5, 1]],
  },
  folder: {
    stroke: [
      'M3.5 7.6a1.8 1.8 0 0 1 1.8-1.8h3.4l1.9 2.2h8.1a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z',
    ],
  },
  'folder-open': {
    stroke: [
      'M3.5 18.2V7.6a1.8 1.8 0 0 1 1.8-1.8h3.4l1.9 2.2h8.1a1.8 1.8 0 0 1 1.8 1.8v1.4',
      'M3.5 18.2 6 11.6h15.2l-2.5 6.6a1.8 1.8 0 0 1-1.7 1.2H5.3a1.8 1.8 0 0 1-1.8-1.2Z',
    ],
  },
  queue: {
    stroke: ['M4 7h11', 'M4 12h11', 'M4 17h7'],
    circles: [[17.8, 16.4, 2.6]],
  },
  apps: {
    rects: [
      [4.4, 4.4, 6, 6, 1.6],
      [13.6, 4.4, 6, 6, 1.6],
      [4.4, 13.6, 6, 6, 1.6],
      [13.6, 13.6, 6, 6, 1.6],
    ],
  },
  note: {
    stroke: ['M9.4 17.4V6.2l8.4-1.8v10.8'],
    circles: [
      [6.8, 17.4, 2.6, 1],
      [15.2, 15.2, 2.6, 1],
    ],
  },

  // Chevrons and marks.
  back: { stroke: ['M14.8 5.6 8.4 12l6.4 6.4'] },
  forward: { stroke: ['M9.2 5.6 15.6 12l-6.4 6.4'] },
  up: { stroke: ['M5.6 14.8 12 8.4l6.4 6.4'] },
  down: { stroke: ['M5.6 9.2 12 15.6l6.4-6.4'] },
  close: { stroke: ['M6.4 6.4l11.2 11.2', 'M17.6 6.4 6.4 17.6'] },
  plus: { stroke: ['M12 5.2v13.6', 'M5.2 12h13.6'] },
  'play-next': {
    fill: ['M5.5 6.2 12.5 12l-7 5.8Z'],
    stroke: ['M16.4 12h5', 'M18.9 9.5v5'],
  },
  remove: { stroke: ['M6 12h12'] },

  // Two panes, one lit: the app is sharing the screen.
  split: {
    stroke: ['M3.6 6.4a1.8 1.8 0 0 1 1.8-1.8h13.2a1.8 1.8 0 0 1 1.8 1.8v11.2a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8Z'],
    rects: [[4.4, 5.4, 6.4, 13.2, 1]],
  },
  refresh: {
    stroke: [
      'M20 12a8 8 0 1 1-2.6-5.9',
      'M20.4 4v4.4H16',
    ],
  },
  volume: {
    stroke: [
      'M4 9.6h3.2L11.4 6v12L7.2 14.4H4Z',
      'M15 9.4a3.6 3.6 0 0 1 0 5.2',
      'M17.8 6.8a7.2 7.2 0 0 1 0 10.4',
    ],
  },
};

export interface GlyphProps {
  name: GlyphName;
  /** Edge length in points. The grid scales to fit. */
  size?: number;
  color?: string;
  /** Stroke weight on the 24-unit grid. */
  weight?: number;
}

export function Glyph({
  name,
  size = 26,
  color = palette.illum,
  weight = 1.7,
}: GlyphProps) {
  const drawing = GLYPHS[name];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {drawing.stroke?.map((d, i) => (
        <Path
          key={`s${i}`}
          d={d}
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {drawing.fill?.map((d, i) => (
        <Path key={`f${i}`} d={d} fill={color} />
      ))}
      {drawing.circles?.map(([cx, cy, r, solid], i) => (
        <Circle
          key={`c${i}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={solid ? color : 'none'}
          stroke={solid ? 'none' : color}
          strokeWidth={weight}
        />
      ))}
      {drawing.rects?.map(([x, y, w, h, r], i) => (
        <Rect key={`r${i}`} x={x} y={y} width={w} height={h} rx={r} fill={color} />
      ))}
    </Svg>
  );
}
