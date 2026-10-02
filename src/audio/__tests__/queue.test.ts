/**
 * Tests for the queue, shuffle and repeat rules.
 *
 * Randomness is injected everywhere it matters, so shuffle behaviour is
 * asserted exactly rather than "probably".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advance,
  appendTracks,
  back,
  clearUpcoming,
  createQueue,
  currentTrack,
  cycleRepeat,
  EMPTY_QUEUE,
  isEmpty,
  jumpTo,
  jumpToTrackId,
  moveInOrder,
  orderedTracks,
  playNext,
  removeAt,
  RESTART_THRESHOLD_SECONDS,
  setRepeat,
  setShuffle,
  totalDuration,
  upcomingTracks,
  type QueueState,
  type Random,
} from '../queue.ts';
import type { Track } from '../../types.ts';

// ------------------------------------------------------------------ fixtures

function track(name: string, duration = 180): Track {
  return {
    id: `id-${name}`,
    uri: `file:///music/${name}.mp3`,
    filename: `${name}.mp3`,
    folder: '/music',
    duration,
    addedAt: 0,
    title: name,
    artist: null,
    album: null,
    artwork: null,
    tagged: true,
  };
}

const A = track('a');
const B = track('b');
const C = track('c');
const D = track('d');
const FOUR = [A, B, C, D];

/** Always picks the last candidate, which reverses Fisher-Yates' tail. */
const pickLast: Random = () => 0.999999;

/** Always picks index 0, the other extreme of the swap. */
const pickFirst: Random = () => 0;

/** Deterministic walk through a fixed list of values, cycling. */
function seeded(values: number[]): Random {
  let i = 0;
  return () => values[i++ % values.length];
}

function titles(tracks: Track[]): string[] {
  return tracks.map((t) => t.title);
}

function playing(state: QueueState): string | null {
  return currentTrack(state)?.title ?? null;
}

// --------------------------------------------------------------------- basics

describe('createQueue', () => {
  it('starts on the chosen track in sequential order', () => {
    const queue = createQueue(FOUR, 2);
    assert.deepEqual(queue.order, [0, 1, 2, 3]);
    assert.equal(queue.position, 2);
    assert.equal(playing(queue), 'c');
  });

  it('is empty for no tracks but keeps the chosen modes', () => {
    const queue = createQueue([], 0, { shuffle: true, repeat: 'all' });
    assert.equal(isEmpty(queue), true);
    assert.equal(queue.position, -1);
    assert.equal(currentTrack(queue), null);
    assert.equal(queue.shuffle, true);
    assert.equal(queue.repeat, 'all');
  });

  it('clamps a start index outside the list', () => {
    assert.equal(playing(createQueue(FOUR, 99)), 'd');
    assert.equal(playing(createQueue(FOUR, -5)), 'a');
  });

  it('puts the chosen track first when starting shuffled', () => {
    const queue = createQueue(FOUR, 2, { shuffle: true, random: pickLast });
    assert.equal(queue.order[0], 2);
    assert.equal(queue.position, 0);
    assert.equal(playing(queue), 'c');
    // Every track still appears exactly once.
    assert.deepEqual([...queue.order].sort(), [0, 1, 2, 3]);
  });
});

describe('reading a queue', () => {
  it('lists tracks in play order, not the order they were added', () => {
    const queue = createQueue(FOUR, 0, { shuffle: true, random: pickFirst });
    assert.deepEqual(titles(orderedTracks(queue)), titles(
      queue.order.map((i) => FOUR[i])
    ));
  });

  it('reports what is still to come', () => {
    const queue = createQueue(FOUR, 1);
    assert.deepEqual(titles(upcomingTracks(queue)), ['c', 'd']);
  });

  it('reports nothing upcoming on the last track', () => {
    const queue = createQueue(FOUR, 3);
    assert.deepEqual(upcomingTracks(queue), []);
  });

  it('sums durations', () => {
    assert.equal(totalDuration(createQueue([track('x', 90), track('y', 30)], 0)), 120);
    assert.equal(totalDuration(EMPTY_QUEUE), 0);
  });
});

// -------------------------------------------------------------------- shuffle

describe('setShuffle', () => {
  it('keeps the current track playing when switched on', () => {
    const queue = createQueue(FOUR, 2);
    const shuffledQueue = setShuffle(queue, true, pickLast);

    assert.equal(playing(shuffledQueue), 'c');
    assert.equal(shuffledQueue.order[shuffledQueue.position], 2);
    assert.deepEqual([...shuffledQueue.order].sort(), [0, 1, 2, 3]);
  });

  it('keeps the current track playing when switched off', () => {
    const queue = createQueue(FOUR, 3, { shuffle: true, random: pickLast });
    assert.equal(playing(queue), 'd');

    const sequentialQueue = setShuffle(queue, false);
    assert.equal(playing(sequentialQueue), 'd');
    assert.deepEqual(sequentialQueue.order, [0, 1, 2, 3]);
    assert.equal(sequentialQueue.position, 3);
  });

  it('restores album order for what plays next when switched off', () => {
    const queue = setShuffle(createQueue(FOUR, 1, { shuffle: true, random: pickLast }), false);
    assert.equal(playing(queue), 'b');
    assert.deepEqual(titles(upcomingTracks(queue)), ['c', 'd']);
  });

  it('is a no-op when the mode already matches', () => {
    const queue = createQueue(FOUR, 1);
    assert.equal(setShuffle(queue, false), queue);
  });

  it('records the mode on an empty queue without touching the order', () => {
    const queue = setShuffle(EMPTY_QUEUE, true);
    assert.equal(queue.shuffle, true);
    assert.deepEqual(queue.order, []);
  });

  it('produces a full permutation for a known seed', () => {
    // Fisher-Yates over [1,2,3] with these draws is fully determined.
    const queue = createQueue(FOUR, 0, {
      shuffle: true,
      random: seeded([0, 0.5, 0.9]),
    });
    assert.equal(queue.order[0], 0);
    assert.deepEqual([...queue.order].sort(), [0, 1, 2, 3]);
    assert.equal(new Set(queue.order).size, 4);
  });
});

describe('cycleRepeat', () => {
  it('walks off -> all -> one -> off', () => {
    assert.equal(cycleRepeat('off'), 'all');
    assert.equal(cycleRepeat('all'), 'one');
    assert.equal(cycleRepeat('one'), 'off');
  });
});

// -------------------------------------------------------------------- advance

describe('advance', () => {
  it('moves to the next track mid-queue', () => {
    const { state, action } = advance(createQueue(FOUR, 1), { auto: true });
    assert.equal(action, 'track');
    assert.equal(playing(state), 'c');
  });

  it('stops at the end with repeat off when the track ended on its own', () => {
    const { state, action } = advance(createQueue(FOUR, 3), { auto: true });
    assert.equal(action, 'stop');
    assert.equal(playing(state), 'd');
  });

  it('restarts the last track when next is pressed with repeat off', () => {
    const { state, action } = advance(createQueue(FOUR, 3), { auto: false });
    assert.equal(action, 'repeat');
    assert.equal(playing(state), 'd');
  });

  it('wraps to the start with repeat all', () => {
    const queue = setRepeat(createQueue(FOUR, 3), 'all');
    const { state, action } = advance(queue, { auto: true });
    assert.equal(action, 'track');
    assert.equal(playing(state), 'a');
  });

  it('repeats the same track when one ends under repeat one', () => {
    const queue = setRepeat(createQueue(FOUR, 1), 'one');
    const { state, action } = advance(queue, { auto: true });
    assert.equal(action, 'repeat');
    assert.equal(playing(state), 'b');
    assert.equal(state.position, 1);
  });

  it('still moves on when next is pressed under repeat one', () => {
    const queue = setRepeat(createQueue(FOUR, 1), 'one');
    const { state, action } = advance(queue, { auto: false });
    assert.equal(action, 'track');
    assert.equal(playing(state), 'c');
  });

  it('wraps under repeat one when next is pressed on the last track', () => {
    const queue = setRepeat(createQueue(FOUR, 3), 'one');
    const { state, action } = advance(queue, { auto: false });
    assert.equal(action, 'track');
    assert.equal(playing(state), 'a');
  });

  it('reshuffles for the next lap of a shuffled repeating queue', () => {
    const queue: QueueState = {
      tracks: FOUR,
      order: [2, 0, 3, 1],
      position: 3,
      shuffle: true,
      repeat: 'all',
    };

    const { state, action } = advance(queue, { auto: true, random: pickFirst });
    assert.equal(action, 'track');
    assert.equal(state.position, 0);
    assert.deepEqual([...state.order].sort(), [0, 1, 2, 3]);
  });

  it('stops on an empty queue', () => {
    const { action } = advance(EMPTY_QUEUE, { auto: true });
    assert.equal(action, 'stop');
  });

  it('wraps a single-track queue under repeat all without reshuffling', () => {
    const queue = setRepeat(createQueue([A], 0, { shuffle: true }), 'all');
    const { state, action } = advance(queue, { auto: true });
    assert.equal(action, 'track');
    assert.equal(playing(state), 'a');
  });
});

// ----------------------------------------------------------------------- back

describe('back', () => {
  it('goes to the previous track near the start of a song', () => {
    const { state, action } = back(createQueue(FOUR, 2), 1);
    assert.equal(action, 'track');
    assert.equal(playing(state), 'b');
  });

  it('restarts the song once past the threshold', () => {
    const queue = createQueue(FOUR, 2);
    const { state, action } = back(queue, RESTART_THRESHOLD_SECONDS + 0.5);
    assert.equal(action, 'repeat');
    assert.equal(playing(state), 'c');
    assert.equal(state.position, 2);
  });

  it('treats exactly the threshold as still going back', () => {
    const { action } = back(createQueue(FOUR, 2), RESTART_THRESHOLD_SECONDS);
    assert.equal(action, 'track');
  });

  it('restarts the first track with repeat off', () => {
    const { state, action } = back(createQueue(FOUR, 0), 0);
    assert.equal(action, 'repeat');
    assert.equal(playing(state), 'a');
  });

  it('wraps to the last track with repeat all', () => {
    const queue = setRepeat(createQueue(FOUR, 0), 'all');
    const { state, action } = back(queue, 0);
    assert.equal(action, 'track');
    assert.equal(playing(state), 'd');
  });

  it('handles an empty queue', () => {
    const { action } = back(EMPTY_QUEUE, 0);
    assert.equal(action, 'repeat');
  });
});

// -------------------------------------------------------------------- jumping

describe('jumpTo', () => {
  it('moves to a slot in the play order', () => {
    assert.equal(playing(jumpTo(createQueue(FOUR, 0), 3)), 'd');
  });

  it('ignores an out-of-range slot', () => {
    const queue = createQueue(FOUR, 0);
    assert.equal(jumpTo(queue, 9), queue);
    assert.equal(jumpTo(queue, -1), queue);
  });
});

describe('jumpToTrackId', () => {
  it('finds a track wherever shuffle put it', () => {
    const queue = createQueue(FOUR, 0, { shuffle: true, random: pickLast });
    const moved = jumpToTrackId(queue, C.id);
    assert.equal(playing(moved), 'c');
  });

  it('ignores an id that is not queued', () => {
    const queue = createQueue(FOUR, 0);
    assert.equal(jumpToTrackId(queue, 'id-nope'), queue);
  });
});

// ------------------------------------------------------------------- mutation

describe('appendTracks', () => {
  it('adds to the end of the play order', () => {
    const queue = appendTracks(createQueue([A, B], 0), [C, D]);
    assert.deepEqual(titles(orderedTracks(queue)), ['a', 'b', 'c', 'd']);
    assert.equal(playing(queue), 'a');
  });

  it('starts a queue when there was none, keeping the modes', () => {
    const queue = appendTracks({ ...EMPTY_QUEUE, repeat: 'all' }, [A, B]);
    assert.equal(playing(queue), 'a');
    assert.equal(queue.repeat, 'all');
  });

  it('ignores an empty addition', () => {
    const queue = createQueue(FOUR, 0);
    assert.equal(appendTracks(queue, []), queue);
  });
});

describe('playNext', () => {
  it('inserts directly after the current track', () => {
    const queue = playNext(createQueue([A, B], 0), [C]);
    assert.deepEqual(titles(orderedTracks(queue)), ['a', 'c', 'b']);
    assert.equal(playing(queue), 'a');
  });

  it('keeps the current track playing when inserting mid-queue', () => {
    const queue = playNext(createQueue(FOUR, 2), [track('x')]);
    assert.equal(playing(queue), 'c');
    assert.deepEqual(titles(upcomingTracks(queue)), ['x', 'd']);
  });

  it('starts a queue when there was none', () => {
    assert.equal(playing(playNext(EMPTY_QUEUE, [B])), 'b');
  });
});

describe('removeAt', () => {
  it('removes an upcoming slot without moving the current track', () => {
    const { state, removedCurrent } = removeAt(createQueue(FOUR, 1), 3);
    assert.equal(removedCurrent, false);
    assert.equal(playing(state), 'b');
    assert.deepEqual(titles(orderedTracks(state)), ['a', 'b', 'c']);
  });

  it('keeps the current track playing when an earlier slot goes', () => {
    const { state, removedCurrent } = removeAt(createQueue(FOUR, 2), 0);
    assert.equal(removedCurrent, false);
    assert.equal(playing(state), 'c');
    assert.deepEqual(titles(orderedTracks(state)), ['b', 'c', 'd']);
  });

  it('slides the next track into place when the current slot goes', () => {
    const { state, removedCurrent } = removeAt(createQueue(FOUR, 1), 1);
    assert.equal(removedCurrent, true);
    assert.equal(playing(state), 'c');
    assert.deepEqual(titles(orderedTracks(state)), ['a', 'c', 'd']);
  });

  it('steps back when the removed current slot was last', () => {
    const { state, removedCurrent } = removeAt(createQueue(FOUR, 3), 3);
    assert.equal(removedCurrent, true);
    assert.equal(playing(state), 'c');
  });

  it('empties the queue when the only track goes', () => {
    const { state, removedCurrent } = removeAt(createQueue([A], 0), 0);
    assert.equal(removedCurrent, true);
    assert.equal(isEmpty(state), true);
    assert.equal(currentTrack(state), null);
    assert.equal(state.position, -1);
  });

  it('ignores an out-of-range slot', () => {
    const queue = createQueue(FOUR, 0);
    assert.equal(removeAt(queue, 9).state, queue);
    assert.equal(removeAt(queue, -1).state, queue);
  });
});

describe('moveInOrder', () => {
  it('reorders upcoming tracks', () => {
    const queue = moveInOrder(createQueue(FOUR, 0), 3, 1);
    assert.deepEqual(titles(orderedTracks(queue)), ['a', 'd', 'b', 'c']);
    assert.equal(playing(queue), 'a');
  });

  it('keeps the same track playing when it is the one moved', () => {
    const queue = moveInOrder(createQueue(FOUR, 1), 1, 3);
    assert.equal(playing(queue), 'b');
    assert.deepEqual(titles(orderedTracks(queue)), ['a', 'c', 'd', 'b']);
  });

  it('keeps the same track playing when something moves across it', () => {
    const queue = moveInOrder(createQueue(FOUR, 2), 0, 3);
    assert.equal(playing(queue), 'c');
    assert.deepEqual(titles(orderedTracks(queue)), ['b', 'c', 'd', 'a']);
  });

  it('ignores a no-op or out-of-range move', () => {
    const queue = createQueue(FOUR, 0);
    assert.equal(moveInOrder(queue, 1, 1), queue);
    assert.equal(moveInOrder(queue, -1, 2), queue);
    assert.equal(moveInOrder(queue, 0, 9), queue);
  });
});

describe('clearUpcoming', () => {
  it('leaves only the track now playing', () => {
    const queue = clearUpcoming(createQueue(FOUR, 2));
    assert.deepEqual(titles(orderedTracks(queue)), ['c']);
    assert.equal(playing(queue), 'c');
    assert.equal(queue.position, 0);
  });

  it('handles an empty queue', () => {
    assert.equal(clearUpcoming(EMPTY_QUEUE), EMPTY_QUEUE);
  });
});
