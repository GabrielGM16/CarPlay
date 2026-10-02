/** Tests for the FFT-to-bands maths behind the gauge. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BAND_COUNT,
  computeBandEdges,
  computeBandGains,
  fillBands,
  overallLevel,
  smoothToward,
} from '../spectrum.ts';

const SAMPLE_RATE = 44100;
const BIN_COUNT = 1024; // fftSize 2048

describe('computeBandEdges', () => {
  it('returns one more edge than there are bands', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, 32);
    assert.equal(edges.length, 33);
  });

  it('increases strictly, so no two bands read the same bins', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, BAND_COUNT);
    for (let i = 1; i < edges.length; i++) {
      assert.ok(
        edges[i] > edges[i - 1],
        `edge ${i} (${edges[i]}) should exceed edge ${i - 1} (${edges[i - 1]})`
      );
    }
  });

  it('stays inside the available bins', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, BAND_COUNT);
    assert.ok(edges[0] >= 0);
    assert.ok(edges[edges.length - 1] <= BIN_COUNT);
  });

  it('spaces bands by octave, so each is wider than the last', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, 24);
    const widthOf = (i: number) => edges[i + 1] - edges[i];

    // Compare the bottom and top of the range rather than every neighbour:
    // the lowest bands are floored to one bin, which flattens them.
    assert.ok(
      widthOf(22) > widthOf(2),
      `top band width ${widthOf(22)} should exceed bottom band width ${widthOf(2)}`
    );
  });

  it('still produces a usable mapping at a small FFT size', () => {
    // 64 bins is 344 Hz each — every low band floors to a distinct bin.
    const edges = computeBandEdges(64, SAMPLE_RATE, BAND_COUNT);
    assert.equal(edges.length, BAND_COUNT + 1);
    for (let i = 1; i < edges.length; i++) {
      assert.ok(edges[i] > edges[i - 1]);
    }
    assert.ok(edges[edges.length - 1] <= 64);
  });

  it('adapts to a different sample rate', () => {
    const at44k = computeBandEdges(BIN_COUNT, 44100, 32);
    const at96k = computeBandEdges(BIN_COUNT, 96000, 32);
    // At 96 kHz each bin spans more Hz, so 14 kHz lands on a lower bin.
    assert.ok(at96k[32] < at44k[32]);
  });
});

describe('computeBandGains', () => {
  it('returns one gain per band', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, 32);
    assert.equal(computeBandGains(edges, SAMPLE_RATE, BIN_COUNT).length, 32);
  });

  it('boosts high bands more than low ones', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, 32);
    const gains = computeBandGains(edges, SAMPLE_RATE, BIN_COUNT);

    assert.ok(gains[0] >= 1);
    assert.ok(gains[31] > gains[0]);
    // Monotonic: no band is quieter than the one below it.
    for (let i = 1; i < gains.length; i++) {
      assert.ok(gains[i] >= gains[i - 1] - 1e-9);
    }
  });

  it('applies no tilt when asked for none', () => {
    const edges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, 16);
    const gains = computeBandGains(edges, SAMPLE_RATE, BIN_COUNT, 0);
    for (const gain of gains) {
      assert.ok(Math.abs(gain - 1) < 1e-9);
    }
  });
});

describe('fillBands', () => {
  const edges = [0, 2, 4, 8];
  const flatGains = [1, 1, 1];

  it('normalises byte data into 0..1', () => {
    const data = new Uint8Array([255, 255, 128, 128, 0, 0, 0, 0]);
    const out = [0, 0, 0];
    fillBands(data, edges, flatGains, out);

    assert.equal(out[0], 1);
    assert.ok(Math.abs(out[1] - 128 / 255) < 1e-9);
    assert.equal(out[2], 0);
  });

  it('takes the peak of a band, not its mean', () => {
    // A single loud bin beside silence should still read loud.
    const data = new Uint8Array([255, 0, 0, 0, 0, 0, 0, 0]);
    const out = [0, 0, 0];
    fillBands(data, edges, flatGains, out);
    assert.equal(out[0], 1);
  });

  it('clamps above 1 once the tilt is applied', () => {
    const data = new Uint8Array([200, 200, 200, 200, 200, 200, 200, 200]);
    const out = [0, 0, 0];
    fillBands(data, edges, [1, 4, 8], out);
    assert.equal(out[1], 1);
    assert.equal(out[2], 1);
  });

  it('reads silence as zero across every band', () => {
    const out = [1, 1, 1];
    fillBands(new Uint8Array(8), edges, flatGains, out);
    assert.deepEqual(out, [0, 0, 0]);
  });

  it('mutates in place rather than allocating', () => {
    const out = [0, 0, 0];
    const before = out;
    fillBands(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]), edges, flatGains, out);
    assert.equal(out, before);
  });

  it('does not read past the end of a short data frame', () => {
    const out = [0, 0, 0];
    // Edges reach bin 8 but only 3 bins of data arrived.
    fillBands(new Uint8Array([255, 255, 255]), edges, flatGains, out);
    assert.equal(out[0], 1);
    assert.equal(out[2], 0);
  });

  it('handles a real band mapping without producing NaN', () => {
    const realEdges = computeBandEdges(BIN_COUNT, SAMPLE_RATE, BAND_COUNT);
    const realGains = computeBandGains(realEdges, SAMPLE_RATE, BIN_COUNT);
    const data = new Uint8Array(BIN_COUNT);
    for (let i = 0; i < BIN_COUNT; i++) data[i] = (i * 7) % 256;

    const out = new Array(BAND_COUNT).fill(0);
    fillBands(data, realEdges, realGains, out);

    for (const value of out) {
      assert.ok(Number.isFinite(value), 'band level should be finite');
      assert.ok(value >= 0 && value <= 1, `band level ${value} out of range`);
    }
  });
});

describe('overallLevel', () => {
  it('averages the bands', () => {
    assert.equal(overallLevel([0, 1]), 0.5);
    assert.equal(overallLevel([0.25, 0.25, 0.25, 0.25]), 0.25);
  });

  it('is zero for no bands and for silence', () => {
    assert.equal(overallLevel([]), 0);
    assert.equal(overallLevel([0, 0, 0]), 0);
  });

  it('does not spike on one loud band', () => {
    const level = overallLevel([1, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(level < 0.2, `a single peak should stay low, got ${level}`);
  });
});

describe('smoothToward', () => {
  it('rises faster than it falls', () => {
    const up = smoothToward(0, 1, 1 / 60, 22, 6);
    const down = 1 - smoothToward(1, 0, 1 / 60, 22, 6);
    assert.ok(up > down, `attack ${up} should exceed release ${down}`);
  });

  it('closes on the target without overshooting', () => {
    let value = 0;
    for (let i = 0; i < 200; i++) {
      value = smoothToward(value, 1, 1 / 60, 22, 6);
      assert.ok(value <= 1 + 1e-9, `overshot to ${value}`);
    }
    assert.ok(value > 0.99);
  });

  it('settles at the target from above', () => {
    let value = 1;
    for (let i = 0; i < 400; i++) {
      value = smoothToward(value, 0, 1 / 60, 22, 6);
      assert.ok(value >= -1e-9);
    }
    assert.ok(value < 0.01);
  });

  it('moves the same distance per second whatever the frame rate', () => {
    // One 100 ms step should land close to ten 10 ms steps.
    const oneBigStep = smoothToward(0, 1, 0.1, 22, 6);

    let stepped = 0;
    for (let i = 0; i < 10; i++) {
      stepped = smoothToward(stepped, 1, 0.01, 22, 6);
    }

    assert.ok(
      Math.abs(oneBigStep - stepped) < 0.02,
      `frame-rate dependent: ${oneBigStep} vs ${stepped}`
    );
  });

  it('holds still when already at the target', () => {
    assert.equal(smoothToward(0.5, 0.5, 1 / 60, 22, 6), 0.5);
  });

  it('does not move backwards on a zero or negative dt', () => {
    assert.equal(smoothToward(0.4, 1, 0, 22, 6), 0.4);
    assert.equal(smoothToward(0.4, 1, -1, 22, 6), 0.4);
  });
});
