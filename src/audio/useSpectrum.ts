/**
 * Polls the analyser and publishes the band levels to the UI thread.
 *
 * The split of work is deliberate. Reading the FFT has to happen on the JS
 * thread, because that is where the analyser's JSI object lives, so it runs at
 * a fixed modest rate. The smoothing and drawing then happen on the UI thread
 * at display rate, reading the shared value. Polling at 30 Hz and animating at
 * 60 looks identical to polling at 60 and costs half as much on a head unit
 * that also has to decode audio.
 */
import { useEffect, useMemo } from 'react';
import type { AnalyserNode } from 'react-native-audio-api';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  BAND_COUNT,
  computeBandEdges,
  computeBandGains,
  fillBands,
  overallLevel,
} from './spectrum';

/** Analyser reads per second. Above this the bars gain nothing visible. */
const POLL_HZ = 30;

export interface Spectrum {
  /** `BAND_COUNT` levels in `[0, 1]`, low frequency first. Mutated in place. */
  bands: SharedValue<number[]>;
  /** Mean level in `[0, 1]`, for the needle and the glow. */
  level: SharedValue<number>;
}

/**
 * Subscribes to `analyser` while `active`.
 *
 * `epoch` exists because the analyser is recreated when the audio context is,
 * and an identity check alone would not catch a replacement that happens to be
 * allocated at the same address. Passing the provider's epoch re-arms the
 * poller on every reconnection.
 *
 * Returns shared values that stay stable across renders, so the gauge can hold
 * onto them.
 */
export function useSpectrum(
  analyser: AnalyserNode | null,
  active: boolean,
  epoch: number
): Spectrum {
  const bands = useSharedValue<number[]>(new Array(BAND_COUNT).fill(0));
  const level = useSharedValue(0);

  useEffect(() => {
    if (!analyser || !active) {
      // Let the gauge fall to rest rather than freezing mid-beat.
      bands.value = new Array(BAND_COUNT).fill(0);
      level.value = 0;
      return;
    }

    const binCount = analyser.frequencyBinCount;
    const sampleRate = analyser.context.sampleRate;

    const edges = computeBandEdges(binCount, sampleRate, BAND_COUNT);
    const gains = computeBandGains(edges, sampleRate, binCount);

    // Reused across frames: this loop must not allocate.
    const frequencyData = new Uint8Array(binCount);
    const scratch = new Array<number>(BAND_COUNT).fill(0);

    const interval = setInterval(() => {
      try {
        analyser.getByteFrequencyData(frequencyData);
      } catch {
        // The context can close under us mid-poll; the next tick will stop.
        return;
      }

      fillBands(frequencyData, edges, gains, scratch);

      // A fresh array per frame rather than `modify` with a worklet: a worklet
      // would have to capture and re-serialise `scratch` on every call, which
      // costs more than the 56-element copy it was meant to avoid.
      bands.value = scratch.slice();
      level.value = overallLevel(scratch);
    }, 1000 / POLL_HZ);

    return () => clearInterval(interval);
  }, [analyser, active, epoch, bands, level]);

  return useMemo(() => ({ bands, level }), [bands, level]);
}
