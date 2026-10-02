/**
 * Seek control, drawn as a tuning dial.
 *
 * A radio dial rather than a progress pill, because that is the vernacular of
 * the object this app lives inside, and because graduations give you something
 * to read: how far in you are, and how much is left, without parsing a number.
 *
 * Two details earn their keep on a moving screen:
 *
 *   The needle is predicted.  The engine reports position a few times a
 *                             second. Left alone the needle would step; a
 *                             frame callback advances it by elapsed time and
 *                             reconciles whenever a real report lands, so it
 *                             glides.
 *   The target is generous.   The dial draws 18 points tall but takes touches
 *                             across the full height of its row, because
 *                             hitting a thin line in a moving car does not
 *                             work.
 */
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { formatTime } from '../lib/format';
import { color, space, TOUCH, type } from '../theme';

/** Distance between graduations, in points. */
const TICK_SPACING = 7;

/** Every fifth graduation is taller, so the scale is countable. */
const MAJOR_EVERY = 5;

const TICK_MINOR = 9;
const TICK_MAJOR = 18;

/** Past this gap between predicted and reported time, snap instead of easing. */
const SNAP_THRESHOLD_SECONDS = 0.45;

export interface DialSeekBarProps {
  /** Authoritative position from the engine, in seconds. */
  position: SharedValue<number>;
  /** Track length in seconds. `0` disables the control. */
  duration: number;
  /** Whole seconds elapsed, for the left-hand readout. */
  elapsed: number;
  isPlaying: boolean;
  onSeek: (seconds: number) => void;
}

export function DialSeekBar({
  position,
  duration,
  elapsed,
  isPlaying,
  onSeek,
}: DialSeekBarProps) {
  const [width, setWidth] = useState(0);
  /** Non-null only while a finger is down, and then it owns the readout. */
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);

  /** Smoothed position actually drawn, in seconds. */
  const displayed = useSharedValue(0);
  /** Last value seen from the engine, to detect a fresh report. */
  const lastReport = useSharedValue(-1);

  const playing = useSharedValue(isPlaying);
  const durationSV = useSharedValue(duration);
  const widthSV = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const scrubFraction = useSharedValue(0);

  useEffect(() => {
    playing.value = isPlaying;
  }, [isPlaying, playing]);

  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);

  useEffect(() => {
    widthSV.value = width;
  }, [width, widthSV]);

  useFrameCallback((frame) => {
    if (scrubbing.value) return;

    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const reported = position.value;

    if (reported !== lastReport.value) {
      lastReport.value = reported;
      const gap = reported - displayed.value;
      // A seek, a track change or a long stall: jump. Otherwise close the
      // gap gradually so a late report does not make the needle twitch.
      displayed.value =
        Math.abs(gap) > SNAP_THRESHOLD_SECONDS
          ? reported
          : displayed.value + gap * 0.3;
    } else if (playing.value) {
      displayed.value += dt;
    }

    const total = durationSV.value;
    if (total > 0 && displayed.value > total) displayed.value = total;
    if (displayed.value < 0) displayed.value = 0;
  }, true);

  /** Fraction of the track drawn as elapsed, in `[0, 1]`. */
  const fraction = useDerivedValue(() => {
    if (scrubbing.value) return scrubFraction.value;
    const total = durationSV.value;
    if (total <= 0) return 0;
    const value = displayed.value / total;
    return value < 0 ? 0 : value > 1 ? 1 : value;
  });

  /** Graduation positions, recomputed only when the dial is resized. */
  const ticks = useMemo(() => {
    if (width <= 0) return [];
    const count = Math.max(2, Math.floor(width / TICK_SPACING));
    const gap = width / (count - 1);
    return Array.from({ length: count }, (_, i) => ({
      x: i * gap,
      height: i % MAJOR_EVERY === 0 ? TICK_MAJOR : TICK_MINOR,
    }));
  }, [width]);

  /** The full scale, drawn once behind everything in an unlit colour. */
  const scalePath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const tick of ticks) {
      path.moveTo(tick.x, TICK_MAJOR - tick.height);
      path.lineTo(tick.x, TICK_MAJOR);
    }
    return path;
  }, [ticks]);

  /** The graduations already passed, rebuilt as the needle advances. */
  const litPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const upTo = fraction.value * widthSV.value;

    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i];
      if (tick.x > upTo) break;
      path.moveTo(tick.x, TICK_MAJOR - tick.height);
      path.lineTo(tick.x, TICK_MAJOR);
    }
    return path;
  });

  const needlePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const x = fraction.value * widthSV.value;
    path.moveTo(x, -3);
    path.lineTo(x, TICK_MAJOR + 3);
    return path;
  });

  const reportScrub = useCallback((seconds: number) => {
    setScrubSeconds(seconds);
  }, []);

  const commitScrub = useCallback(
    (seconds: number) => {
      setScrubSeconds(null);
      onSeek(seconds);
    },
    [onSeek]
  );

  const gesture = useMemo(() => {
    const toFraction = (x: number) => {
      'worklet';
      const w = widthSV.value;
      if (w <= 0) return 0;
      const value = x / w;
      return value < 0 ? 0 : value > 1 ? 1 : value;
    };

    const pan = Gesture.Pan()
      .minDistance(0)
      .enabled(duration > 0)
      .onBegin((event) => {
        scrubbing.value = true;
        scrubFraction.value = toFraction(event.x);
        runOnJS(reportScrub)(scrubFraction.value * durationSV.value);
      })
      .onUpdate((event) => {
        const next = toFraction(event.x);
        const previousSecond = Math.floor(scrubFraction.value * durationSV.value);
        scrubFraction.value = next;
        const nextSecond = Math.floor(next * durationSV.value);
        // Only cross back to JS when the displayed second actually changes.
        if (nextSecond !== previousSecond) {
          runOnJS(reportScrub)(nextSecond);
        }
      })
      .onEnd(() => {
        const seconds = scrubFraction.value * durationSV.value;
        displayed.value = seconds;
        lastReport.value = seconds;
        scrubbing.value = false;
        runOnJS(commitScrub)(seconds);
      })
      .onTouchesCancelled(() => {
        scrubbing.value = false;
        runOnJS(setScrubSeconds)(null);
      });

    return pan;
  }, [
    commitScrub,
    displayed,
    durationSV,
    duration,
    lastReport,
    reportScrub,
    scrubFraction,
    scrubbing,
    widthSV,
  ]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const leftReadout = formatTime(scrubSeconds ?? elapsed);
  const remaining = Math.max(duration - (scrubSeconds ?? elapsed), 0);

  return (
    <View style={styles.row}>
      <Text style={[styles.time, scrubSeconds !== null && styles.timeScrubbing]}>
        {leftReadout}
      </Text>

      <GestureDetector gesture={gesture}>
        {/* The touch area is the whole row height; the dial is drawn inside it. */}
        <View style={styles.touchArea} onLayout={onLayout}>
          <View style={styles.dial}>
            {width > 0 ? (
              <Canvas style={styles.canvas}>
                <Path
                  path={scalePath}
                  style="stroke"
                  strokeWidth={1.5}
                  strokeCap="round"
                  color={color.faint}
                />
                <Path
                  path={litPath}
                  style="stroke"
                  strokeWidth={1.5}
                  strokeCap="round"
                  color={color.dial}
                />
                <Path
                  path={needlePath}
                  style="stroke"
                  strokeWidth={2.5}
                  strokeCap="round"
                  color={color.illum}
                />
              </Canvas>
            ) : null}
          </View>
        </View>
      </GestureDetector>

      <Text style={styles.time}>
        {duration > 0 ? `-${formatTime(remaining)}` : '--:--'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  time: {
    ...type.numeral,
    color: color.dim,
    width: 62,
    textAlign: 'center',
  },
  timeScrubbing: {
    color: color.illum,
  },
  touchArea: {
    flex: 1,
    height: TOUCH,
    justifyContent: 'center',
  },
  dial: {
    height: TICK_MAJOR + 6,
    justifyContent: 'center',
  },
  canvas: {
    flex: 1,
    // Room for the needle, which overshoots the graduations top and bottom.
    marginTop: 3,
  },
});
