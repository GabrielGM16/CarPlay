/**
 * The gauge: cover art set into a dial, with the track's live spectrum drawn
 * around its rim.
 *
 * This is the one place in the app allowed to be expressive, so it is the only
 * place doing per-frame drawing. Three things make it read as an instrument
 * rather than as a media-player visualizer:
 *
 *   The spectrum is mirrored.  Bass sits at six o'clock and treble at twelve,
 *                              rising symmetrically up both sides, so the ring
 *                              is balanced instead of sweeping one way.
 *   Colour encodes frequency.  A sweep gradient maps angle to colour, and
 *                              because angle *is* frequency here, the hue of
 *                              a bar tells you what it represents: deep blue
 *                              low, cyan-white high. One shader, no per-bar
 *                              bookkeeping.
 *   It has graduations.        Every bar keeps a minimum length and every
 *                              eighth is longer, so at rest the ring reads as
 *                              a dial face rather than as something switched
 *                              off.
 *
 * Attack and release are applied on the UI thread, not to the analyser's own
 * smoothing, so the bars can rise on the beat and fall like a VU meter.
 */
import { Canvas, Circle, Path, RadialGradient, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import { Glyph } from './Glyph';
import {
  ATTACK_PER_SECOND,
  BAND_COUNT,
  RELEASE_PER_SECOND,
  smoothToward,
} from '../audio/spectrum';
import type { Spectrum } from '../audio/useSpectrum';
import { color } from '../theme';

/** Bass-to-treble colour ramp. Angle maps to frequency, so hue does too. */
const BASS = '#1B6E92';
const MID = color.dial;
const TREBLE = '#BEEEFF';

/** Bar geometry, as fractions of the gauge radius. */
const RIM_INSET = 0.035;
const BAR_START = 0.685;

/** Kept lit at rest so the ring reads as graduations, in points. */
const MIN_BAR = 3;

/** Every eighth graduation is longer, the way a dial face marks its scale. */
const MAJOR_EVERY = 8;
const MAJOR_EXTRA = 4;

export interface GaugeProps {
  /** Overall diameter in points. */
  size: number;
  /** Cover art URI, or `null` for the fallback plate. */
  artwork: string | null;
  spectrum: Spectrum;
  /** Drives the glow behind the art; also lets the ring settle when false. */
  active: boolean;
}

export function Gauge({ size, artwork, spectrum, active }: GaugeProps) {
  const centre = size / 2;
  const radiusOuter = centre;
  const barEnd = radiusOuter * (1 - RIM_INSET);
  const barStart = radiusOuter * BAR_START;
  const barSpan = barEnd - barStart - MIN_BAR;
  const artRadius = barStart - size * 0.035;
  const barWidth = Math.max(2.5, (size * 0.9 * Math.PI) / (BAND_COUNT * 2) * 0.5);

  /**
   * Band levels after attack/release, held on the UI thread. The poller writes
   * raw levels into `spectrum.bands`; this is what actually gets drawn.
   */
  const smoothed = useSharedValue<number[]>(new Array(BAND_COUNT).fill(0));
  const glow = useSharedValue(0);

  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const target = spectrum.bands.value;
    const current = smoothed.value;
    const next = new Array<number>(BAND_COUNT);

    for (let i = 0; i < BAND_COUNT; i++) {
      next[i] = smoothToward(
        current[i] ?? 0,
        target[i] ?? 0,
        dt,
        ATTACK_PER_SECOND,
        RELEASE_PER_SECOND
      );
    }

    smoothed.value = next;
    // The glow lags further behind than the bars, so it breathes with the
    // track instead of flickering with every transient.
    glow.value = smoothToward(glow.value, spectrum.level.value, dt, 8, 2.5);
  }, true);

  /**
   * Graduation geometry, precomputed once. Each band contributes two bars,
   * mirrored across the vertical axis: bass at the bottom, treble at the top.
   */
  const marks = useMemo(() => {
    const step = Math.PI / BAND_COUNT;
    const out: { sin: number; cos: number; base: number }[] = [];

    for (let band = 0; band < BAND_COUNT; band++) {
      // Measured from six o'clock so band 0 lands at the bottom.
      const theta = Math.PI - (band + 0.5) * step;
      const base = MIN_BAR + (band % MAJOR_EVERY === 0 ? MAJOR_EXTRA : 0);

      out.push({ sin: Math.sin(theta), cos: Math.cos(theta), base });
      out.push({ sin: -Math.sin(theta), cos: Math.cos(theta), base });
    }
    return out;
  }, []);

  const barPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const levels = smoothed.value;

    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i];
      // Two bars per band, so integer-divide back to the band index.
      const level = levels[i >> 1] ?? 0;
      const length = mark.base + level * barSpan;

      const x1 = centre + mark.sin * barStart;
      const y1 = centre + mark.cos * barStart;
      const x2 = centre + mark.sin * (barStart + length);
      const y2 = centre + mark.cos * (barStart + length);

      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
    }

    return path;
  });

  const glowOpacity = useDerivedValue(() =>
    active ? 0.1 + glow.value * 0.5 : 0
  );

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Light spilling out from behind the art, following the loudness. */}
        <Circle cx={centre} cy={centre} r={barStart} opacity={glowOpacity}>
          <RadialGradient
            c={vec(centre, centre)}
            r={barStart}
            colors={[MID, 'rgba(55,182,233,0.05)', 'transparent']}
            positions={[0, 0.7, 1]}
          />
        </Circle>

        <Path
          path={barPath}
          style="stroke"
          strokeWidth={barWidth}
          strokeCap="round"
        >
          <SweepGradient
            c={vec(centre, centre)}
            colors={[MID, BASS, MID, TREBLE, MID]}
            positions={[0, 0.25, 0.5, 0.75, 1]}
          />
        </Path>
      </Canvas>

      {/* The art sits above the canvas; the bars never reach under it. */}
      <View
        style={[
          styles.art,
          {
            left: centre - artRadius,
            top: centre - artRadius,
            width: artRadius * 2,
            height: artRadius * 2,
            borderRadius: artRadius,
          },
        ]}
      >
        {artwork ? (
          <Image
            source={{ uri: artwork }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.plate}>
            <Glyph name="note" size={artRadius * 0.5} color={color.faint} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  art: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: color.graphite,
    borderWidth: 1,
    borderColor: color.seam,
  },
  plate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.graphite,
  },
});
