/**
 * The spectrum of everything the tablet is playing — YouTube in a web panel,
 * Spotify in split screen — read from Android's session-0 Visualizer.
 *
 * Android files this under the microphone permission, though it reads the
 * output mix, not the mic. Some vendor builds refuse session 0 outright; then
 * `available` stays false and the gauge simply rests.
 *
 * The native visualizer is one per process, so subscribers share it through a
 * reference count rather than each starting and stopping their own.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { device, type VisualizerLayout } from '../launcher/device';
import {
  BAND_COUNT,
  computeBandEdges,
  computeBandGains,
  fillBands,
  overallLevel,
} from './spectrum';
import type { Spectrum } from './useSpectrum';

const PERMISSION = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

/** Whether this APK and Android version can read the system mix at all. */
export const systemSpectrumSupported =
  Platform.OS === 'android' && typeof device?.startVisualizer === 'function';

export async function hasSystemAudioPermission(): Promise<boolean> {
  if (!systemSpectrumSupported) return false;
  return PermissionsAndroid.check(PERMISSION);
}

export async function requestSystemAudioPermission(): Promise<boolean> {
  if (!systemSpectrumSupported) return false;
  const result = await PermissionsAndroid.request(PERMISSION, {
    title: 'Ondas con todo el audio',
    message:
      'Para mover las ondas con YouTube u otras apps, Android pide el permiso de micrófono. ' +
      'La app solo lee el sonido que sale de la tablet; no graba el micrófono.',
    buttonPositive: 'Continuar',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * The permission as state, rechecked when the app returns to the foreground —
 * the user may have granted or revoked it in Settings meanwhile.
 */
export function useSystemAudioPermission(): [granted: boolean, request: () => void] {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!systemSpectrumSupported) return;
    const check = () => void hasSystemAudioPermission().then(setGranted).catch(() => {});
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, []);

  const request = useCallback(() => {
    void requestSystemAudioPermission().then(setGranted).catch(() => {});
  }, []);

  return [granted, request];
}

type Listener = (bins: number[]) => void;

const listeners = new Set<Listener>();
let layout: Promise<VisualizerLayout | null> | null = null;
let subscription: { remove(): void } | null = null;

function subscribe(listener: Listener): Promise<VisualizerLayout | null> {
  listeners.add(listener);
  if (!layout) {
    subscription = device?.addListener?.('onSpectrum', ({ bins }) => {
      for (const each of listeners) each(bins);
    }) ?? null;
    const started = device!.startVisualizer!().catch(() => null);
    layout = started;
    // A refusal is not cached: the next subscriber, e.g. after the permission
    // is granted, tries again.
    void started.then((shape) => {
      if (!shape && layout === started) {
        subscription?.remove();
        subscription = null;
        layout = null;
      }
    });
  }
  return layout;
}

function unsubscribe(listener: Listener) {
  listeners.delete(listener);
  if (listeners.size > 0 || !layout) return;
  subscription?.remove();
  subscription = null;
  layout = null;
  void device?.stopVisualizer?.().catch(() => {});
}

/**
 * Subscribes to the system mix while `active`. Same shape as `useSpectrum`,
 * so the gauge cannot tell the two sources apart.
 */
export function useSystemSpectrum(active: boolean): Spectrum & { available: boolean } {
  const bands = useSharedValue<number[]>(new Array(BAND_COUNT).fill(0));
  const level = useSharedValue(0);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!active || !systemSpectrumSupported) {
      bands.value = new Array(BAND_COUNT).fill(0);
      level.value = 0;
      return;
    }

    let cancelled = false;
    let map: ((bins: number[]) => void) | null = null;

    const listener: Listener = (bins) => map?.(bins);

    void subscribe(listener).then((shape) => {
      if (cancelled) return;
      setAvailable(shape !== null);
      if (!shape) return;

      const edges = computeBandEdges(shape.binCount, shape.sampleRate, BAND_COUNT);
      const gains = computeBandGains(edges, shape.sampleRate, shape.binCount);
      // Reused across frames: events arrive ~20 times a second.
      const frame = new Uint8Array(shape.binCount);
      const scratch = new Array<number>(BAND_COUNT).fill(0);

      map = (bins) => {
        frame.set(bins.length > frame.length ? bins.slice(0, frame.length) : bins);
        fillBands(frame, edges, gains, scratch);
        bands.value = scratch.slice();
        level.value = overallLevel(scratch);
      };
    });

    return () => {
      cancelled = true;
      unsubscribe(listener);
      bands.value = new Array(BAND_COUNT).fill(0);
      level.value = 0;
    };
  }, [active, bands, level]);

  return useMemo(() => ({ bands, level, available }), [bands, level, available]);
}
