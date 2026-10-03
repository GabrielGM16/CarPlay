/**
 * A low bar spectrum, mirrored about its centre line, for places too wide and
 * short for the gauge — under a web panel playing a video, for one.
 *
 * Same smoothing as the gauge, so the two read as the same instrument.
 */
import { Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import {
  ATTACK_PER_SECOND,
  BAND_COUNT,
  RELEASE_PER_SECOND,
  smoothToward,
} from '../audio/spectrum';
import type { Spectrum } from '../audio/useSpectrum';
import { color } from '../theme';

export function SpectrumStrip({ spectrum, height = 28 }: { spectrum: Spectrum; height?: number }) {
  const [width, setWidth] = useState(0);
  const smoothed = useSharedValue<number[]>(new Array(BAND_COUNT).fill(0));

  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const target = spectrum.bands.value;
    const current = smoothed.value;
    const next = new Array<number>(BAND_COUNT);
    for (let i = 0; i < BAND_COUNT; i++) {
      next[i] = smoothToward(current[i] ?? 0, target[i] ?? 0, dt, ATTACK_PER_SECOND, RELEASE_PER_SECOND);
    }
    smoothed.value = next;
  }, true);

  const path = useDerivedValue(() => {
    const out = Skia.Path.Make();
    if (width === 0) return out;
    const step = width / BAND_COUNT;
    const bar = Math.max(1.5, step * 0.55);
    const mid = height / 2;
    const levels = smoothed.value;
    for (let i = 0; i < BAND_COUNT; i++) {
      // A one-point stub at rest keeps the strip legible as a meter.
      const half = Math.max(0.5, (levels[i] ?? 0) * mid);
      out.addRect(Skia.XYWHRect(i * step + (step - bar) / 2, mid - half, bar, half * 2));
    }
    return out;
  });

  return (
    <View
      style={{ height }}
      pointerEvents="none"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={path}>
          <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={['#1B6E92', color.dial, '#BEEEFF']} />
        </Path>
      </Canvas>
    </View>
  );
}
