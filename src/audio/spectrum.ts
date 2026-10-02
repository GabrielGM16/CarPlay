/**
 * Turns an `AnalyserNode`'s raw FFT output into the handful of bands the gauge
 * draws.
 *
 * The maths is separated from the polling so it can be tested: band mapping is
 * where a visualizer quietly goes wrong, and "the bars look a bit off" is not
 * something you can debug from a screenshot.
 *
 * Two things matter for a spectrum that reads as music rather than as noise:
 *
 *   Log spacing.  A linear split of 1024 bins puts everything you can hear in
 *                 a bass guitar into the first two bars and spends the other
 *                 forty-six on cymbals. Octaves are what we perceive, so the
 *                 bands are spaced by octave.
 *   A tilt.       Recorded music has far more energy low than high, so without
 *                 correction the treble end never moves. A gentle upward tilt
 *                 across the spectrum evens that out.
 */

/** Bands drawn around the gauge. Enough detail to read, few enough to see. */
export const BAND_COUNT = 56;

/** Below this, content is mostly room rumble and DC offset. */
const MIN_HZ = 40;

/** Above this there is rarely anything to look at in consumer music. */
const MAX_HZ = 14000;

/**
 * Per-octave boost, in dB, applied across the band range to compensate for
 * music's natural spectral slope.
 */
const TILT_DB_PER_OCTAVE = 2.2;

/**
 * Maps each band to a half-open range of FFT bins, `[edges[i], edges[i + 1])`.
 *
 * Bands are spaced geometrically between `minHz` and `maxHz`, then clamped so
 * every band covers at least one bin — at small FFT sizes the lowest bands
 * would otherwise collapse onto the same bin and render as identical bars.
 */
export function computeBandEdges(
  binCount: number,
  sampleRate: number,
  bandCount: number = BAND_COUNT,
  minHz: number = MIN_HZ,
  maxHz: number = MAX_HZ
): number[] {
  const nyquist = sampleRate / 2;
  const hzPerBin = nyquist / binCount;

  const lowHz = Math.max(minHz, hzPerBin);
  const highHz = Math.min(maxHz, nyquist);
  const ratio = Math.log2(highHz / lowHz);

  const edges: number[] = [];
  let previous = -1;

  for (let i = 0; i <= bandCount; i++) {
    const hz = lowHz * Math.pow(2, (ratio * i) / bandCount);
    // Each edge must advance by at least one bin to stay strictly increasing.
    const bin = Math.max(previous + 1, Math.round(hz / hzPerBin));
    edges.push(Math.min(bin, binCount));
    previous = edges[i];
  }

  return edges;
}

/**
 * Precomputed gain per band, as a linear multiplier. Index 0 is the lowest
 * band and gets no boost; the rest rise by `TILT_DB_PER_OCTAVE` per octave.
 */
export function computeBandGains(
  edges: number[],
  sampleRate: number,
  binCount: number,
  tiltDbPerOctave: number = TILT_DB_PER_OCTAVE
): number[] {
  const hzPerBin = sampleRate / 2 / binCount;
  const bandCount = edges.length - 1;
  const gains: number[] = [];

  const baseHz = Math.max(edges[0], 1) * hzPerBin;

  for (let i = 0; i < bandCount; i++) {
    const centreBin = (edges[i] + edges[i + 1]) / 2;
    const centreHz = Math.max(centreBin * hzPerBin, baseHz);
    const octaves = Math.log2(centreHz / baseHz);
    gains.push(Math.pow(10, (octaves * tiltDbPerOctave) / 20));
  }

  return gains;
}

/**
 * Reduces one frame of byte frequency data to `out`, as values in `[0, 1]`.
 *
 * Each band takes the peak of its bins rather than the mean: a mean smears a
 * single strong note across its whole band and reads as mush, while a peak
 * keeps the note visible. Mutates `out` in place — this runs ~30 times a
 * second and should not allocate.
 */
export function fillBands(
  frequencyData: Uint8Array,
  edges: number[],
  gains: number[],
  out: number[]
): void {
  const bandCount = edges.length - 1;

  for (let band = 0; band < bandCount; band++) {
    const from = edges[band];
    const to = Math.max(edges[band + 1], from + 1);

    let peak = 0;
    for (let bin = from; bin < to && bin < frequencyData.length; bin++) {
      const value = frequencyData[bin];
      if (value > peak) peak = value;
    }

    const level = (peak / 255) * gains[band];
    out[band] = level > 1 ? 1 : level;
  }
}

/**
 * Overall loudness of a frame, in `[0, 1]`, used for the gauge's needle and
 * the glow behind the artwork. This is the mean of the band levels, not their
 * peak, so it tracks how loud the music feels rather than jumping on a snare.
 */
export function overallLevel(bands: number[]): number {
  if (bands.length === 0) return 0;

  let sum = 0;
  for (const band of bands) sum += band;
  return sum / bands.length;
}

/**
 * Exponential smoothing with separate attack and release, the way a VU meter
 * behaves: rise almost immediately, fall back slowly. Without the asymmetry a
 * spectrum either lags the beat or flickers.
 *
 * `dt` is in seconds; the coefficients are per-second so the motion does not
 * change with frame rate.
 */
export function smoothToward(
  current: number,
  target: number,
  dt: number,
  attackPerSecond: number,
  releasePerSecond: number
): number {
  'worklet';
  const rate = target > current ? attackPerSecond : releasePerSecond;
  // 1 - e^(-rate * dt) is the fraction of the gap to close this frame.
  const alpha = 1 - Math.exp(-rate * Math.max(dt, 0));
  return current + (target - current) * alpha;
}

/** Rise fast enough to land on the beat. */
export const ATTACK_PER_SECOND = 22;

/** Fall slowly enough to read as decay rather than flicker. */
export const RELEASE_PER_SECOND = 6;
