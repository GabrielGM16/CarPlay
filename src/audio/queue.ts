/**
 * Queue, shuffle and repeat logic.
 *
 * Pure and synchronous: every function takes a queue and returns a new one,
 * with no audio engine involved. That keeps the rules that are easy to get
 * subtly wrong — what shuffle does to the track you are already hearing, what
 * "previous" means three seconds into a song — under test.
 *
 * The model separates two orders:
 *   `tracks`   what was enqueued, never reordered by shuffle
 *   `order`    indices into `tracks`, the sequence playback follows
 *   `position` index into `order`, not into `tracks`
 *
 * The Queue screen renders `order`, so it always shows what actually plays
 * next rather than the order things happened to be added in.
 */
import type { RepeatMode, Track } from '../types';

export interface QueueState {
  tracks: Track[];
  order: number[];
  /** Index into `order`. `-1` when the queue is empty. */
  position: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

/** Injectable for deterministic tests. Must return a float in `[0, 1)`. */
export type Random = () => number;

export const EMPTY_QUEUE: QueueState = {
  tracks: [],
  order: [],
  position: -1,
  shuffle: false,
  repeat: 'off',
};

// ---------------------------------------------------------------- primitives

function sequential(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

/** Fisher-Yates, unbiased, on a copy. */
function shuffled(values: number[], random: Random): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds a play order that starts on `firstTrackIndex`.
 * When shuffling, everything after the first slot is randomised — so turning
 * shuffle on never interrupts what is currently playing.
 */
function buildOrder(
  trackCount: number,
  firstTrackIndex: number,
  shuffle: boolean,
  random: Random
): number[] {
  const all = sequential(trackCount);
  if (!shuffle) return all;

  const rest = all.filter((index) => index !== firstTrackIndex);
  const tail = shuffled(rest, random);
  return firstTrackIndex >= 0 && firstTrackIndex < trackCount
    ? [firstTrackIndex, ...tail]
    : tail;
}

// -------------------------------------------------------------------- reading

/** The track now playing, or `null` for an empty queue. */
export function currentTrack(state: QueueState): Track | null {
  const trackIndex = state.order[state.position];
  return trackIndex === undefined ? null : (state.tracks[trackIndex] ?? null);
}

/** Tracks in the order playback will reach them. What the Queue screen shows. */
export function orderedTracks(state: QueueState): Track[] {
  return state.order
    .map((index) => state.tracks[index])
    .filter((track): track is Track => track !== undefined);
}

/** Tracks still to come, not counting the one playing. */
export function upcomingTracks(state: QueueState): Track[] {
  return orderedTracks(state).slice(state.position + 1);
}

export function isEmpty(state: QueueState): boolean {
  return state.order.length === 0;
}

/** Combined duration of everything in the queue, in seconds. */
export function totalDuration(state: QueueState): number {
  return state.tracks.reduce((sum, track) => sum + track.duration, 0);
}

// -------------------------------------------------------------------- writing

/**
 * Starts a new queue from `tracks`, playing the one at `startIndex`.
 * `startIndex` is an index into `tracks` as given, before any shuffling.
 */
export function createQueue(
  tracks: Track[],
  startIndex: number,
  options: { shuffle?: boolean; repeat?: RepeatMode; random?: Random } = {}
): QueueState {
  const { shuffle = false, repeat = 'off', random = Math.random } = options;

  if (tracks.length === 0) {
    return { ...EMPTY_QUEUE, shuffle, repeat };
  }

  const clampedStart = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  const order = buildOrder(tracks.length, clampedStart, shuffle, random);

  return {
    tracks: [...tracks],
    order,
    position: order.indexOf(clampedStart),
    shuffle,
    repeat,
  };
}

/**
 * Turns shuffle on or off without changing what is playing.
 *
 * Off re-establishes the queue's own order and re-finds the current track in
 * it, so the song after this one is the one that follows it on the album.
 */
export function setShuffle(
  state: QueueState,
  shuffle: boolean,
  random: Random = Math.random
): QueueState {
  if (shuffle === state.shuffle) return state;
  if (isEmpty(state)) return { ...state, shuffle };

  const currentTrackIndex = state.order[state.position];
  const order = buildOrder(
    state.tracks.length,
    currentTrackIndex,
    shuffle,
    random
  );

  return {
    ...state,
    shuffle,
    order,
    position: order.indexOf(currentTrackIndex),
  };
}

export function setRepeat(state: QueueState, repeat: RepeatMode): QueueState {
  return state.repeat === repeat ? state : { ...state, repeat };
}

/** Cycles the repeat button: off -> all -> one -> off. */
export function cycleRepeat(mode: RepeatMode): RepeatMode {
  if (mode === 'off') return 'all';
  if (mode === 'all') return 'one';
  return 'off';
}

export interface AdvanceResult {
  state: QueueState;
  /**
   * `'track'`  move to a different track
   * `'repeat'` play the same track again from the start
   * `'stop'`   the queue is finished; hold on the last track, paused
   */
  action: 'track' | 'repeat' | 'stop';
}

/**
 * Moves to the next track.
 *
 * `auto` distinguishes a track ending on its own from the listener pressing
 * next. Under repeat-one an ended track repeats, but a deliberate press still
 * moves on — pressing next and hearing the same song again reads as a bug.
 */
export function advance(
  state: QueueState,
  options: { auto: boolean; random?: Random } = { auto: false }
): AdvanceResult {
  const { auto, random = Math.random } = options;

  if (isEmpty(state)) return { state, action: 'stop' };

  if (auto && state.repeat === 'one') {
    return { state, action: 'repeat' };
  }

  const last = state.order.length - 1;

  if (state.position < last) {
    return { state: { ...state, position: state.position + 1 }, action: 'track' };
  }

  // Past the end of the queue.
  if (state.repeat === 'all' || state.repeat === 'one') {
    // A fresh shuffle each lap, so a repeating queue is not the same 20 songs
    // in the same order forever.
    if (state.shuffle && state.tracks.length > 1) {
      const order = shuffled(sequential(state.tracks.length), random);
      return { state: { ...state, order, position: 0 }, action: 'track' };
    }
    return { state: { ...state, position: 0 }, action: 'track' };
  }

  if (!auto) {
    // Pressing next on the final track restarts it rather than doing nothing.
    return { state, action: 'repeat' };
  }

  return { state, action: 'stop' };
}

/** Seconds into a track after which "previous" restarts it instead of going back. */
export const RESTART_THRESHOLD_SECONDS = 3;

export interface BackResult {
  state: QueueState;
  action: 'track' | 'repeat';
}

/**
 * Moves to the previous track.
 *
 * Past `RESTART_THRESHOLD_SECONDS` into a song, "previous" restarts it —
 * the behaviour every other music player has, and the one you want when you
 * missed the opening bars.
 */
export function back(
  state: QueueState,
  elapsedSeconds: number = 0
): BackResult {
  if (isEmpty(state)) return { state, action: 'repeat' };

  if (elapsedSeconds > RESTART_THRESHOLD_SECONDS) {
    return { state, action: 'repeat' };
  }

  if (state.position > 0) {
    return { state: { ...state, position: state.position - 1 }, action: 'track' };
  }

  if (state.repeat === 'all') {
    return {
      state: { ...state, position: state.order.length - 1 },
      action: 'track',
    };
  }

  // At the top of the queue with repeat off: restart the first track.
  return { state, action: 'repeat' };
}

/** Jumps to a slot in the play order, as tapped in the Queue screen. */
export function jumpTo(state: QueueState, orderPosition: number): QueueState {
  if (orderPosition < 0 || orderPosition >= state.order.length) return state;
  return { ...state, position: orderPosition };
}

/** Jumps to a track by id, wherever it sits in the play order. */
export function jumpToTrackId(state: QueueState, trackId: string): QueueState {
  const trackIndex = state.tracks.findIndex((track) => track.id === trackId);
  if (trackIndex === -1) return state;

  const orderPosition = state.order.indexOf(trackIndex);
  return orderPosition === -1 ? state : { ...state, position: orderPosition };
}

/** Adds tracks to the end of the play order. */
export function appendTracks(state: QueueState, tracks: Track[]): QueueState {
  if (tracks.length === 0) return state;
  if (isEmpty(state)) {
    return createQueue(tracks, 0, {
      shuffle: state.shuffle,
      repeat: state.repeat,
    });
  }

  const firstNewIndex = state.tracks.length;
  const added = tracks.map((_, i) => firstNewIndex + i);

  return {
    ...state,
    tracks: [...state.tracks, ...tracks],
    order: [...state.order, ...added],
  };
}

/** Inserts tracks so they play directly after the current one. */
export function playNext(state: QueueState, tracks: Track[]): QueueState {
  if (tracks.length === 0) return state;
  if (isEmpty(state)) {
    return createQueue(tracks, 0, {
      shuffle: state.shuffle,
      repeat: state.repeat,
    });
  }

  const firstNewIndex = state.tracks.length;
  const added = tracks.map((_, i) => firstNewIndex + i);
  const order = [...state.order];
  order.splice(state.position + 1, 0, ...added);

  return { ...state, tracks: [...state.tracks, ...tracks], order };
}

export interface RemoveResult {
  state: QueueState;
  /** True when the removed slot was the one playing, so playback must move. */
  removedCurrent: boolean;
}

/**
 * Removes one slot from the play order.
 *
 * `tracks` is left alone: dropping an entry from it would shift every index in
 * `order`. Orphaned entries are harmless and get cleared on the next queue.
 */
export function removeAt(
  state: QueueState,
  orderPosition: number
): RemoveResult {
  if (orderPosition < 0 || orderPosition >= state.order.length) {
    return { state, removedCurrent: false };
  }

  const order = state.order.filter((_, i) => i !== orderPosition);
  const removedCurrent = orderPosition === state.position;

  if (order.length === 0) {
    return {
      state: { ...state, order, position: -1 },
      removedCurrent,
    };
  }

  // Removing something earlier in the order shifts the current slot down.
  let position = state.position;
  if (orderPosition < state.position) {
    position -= 1;
  } else if (removedCurrent) {
    // Hold the slot index so the next track slides into place.
    position = Math.min(state.position, order.length - 1);
  }

  return { state: { ...state, order, position }, removedCurrent };
}

/** Moves a slot within the play order, keeping the current track current. */
export function moveInOrder(
  state: QueueState,
  from: number,
  to: number
): QueueState {
  const size = state.order.length;
  if (from === to || from < 0 || from >= size || to < 0 || to >= size) {
    return state;
  }

  const playingTrackIndex = state.order[state.position];
  const order = [...state.order];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);

  return { ...state, order, position: order.indexOf(playingTrackIndex) };
}

/** Drops everything except the track now playing. */
export function clearUpcoming(state: QueueState): QueueState {
  if (isEmpty(state)) return state;
  const playingTrackIndex = state.order[state.position];
  return { ...state, order: [playingTrackIndex], position: 0 };
}
