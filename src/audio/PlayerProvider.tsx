/**
 * The player: one streaming `<Audio>` element, an `AnalyserNode` tapped off it
 * for the gauge, and the queue rules from `queue.ts` on top.
 *
 * Signal chain:
 *
 *   <Audio> --> MediaElementAudioSourceNode --> AnalyserNode --> destination
 *
 * The `<Audio>` element streams from disk rather than decoding whole files
 * into `AudioBuffer`s. That distinction matters: a four-minute track decoded
 * to float32 stereo is ~84 MB, which a cheap head unit does not have to spare
 * for every track in a queue. Streaming through a media element keeps memory
 * flat and still gives the analyser real PCM to work with, so the bars on
 * screen are the actual spectrum of what you are hearing.
 *
 * Position is published as a Reanimated shared value, not React state, so the
 * seek dial animates on the UI thread and a moving needle costs no renders.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Audio,
  AudioContext,
  AudioManager,
  getAudioDuration,
  PlaybackNotificationManager,
  type AnalyserNode,
  type AudioTagHandle,
} from 'react-native-audio-api';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useLibrary } from '../library/LibraryProvider';
import type { PlaybackState, RepeatMode, Track } from '../types';
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
  moveInOrder,
  orderedTracks,
  playNext as playNextInQueue,
  removeAt,
  setRepeat,
  setShuffle,
  type QueueState,
} from './queue';

const STORAGE_KEY = 'player.state.v1';

/**
 * 2048 gives ~21 Hz resolution at 44.1 kHz — fine enough to separate bass
 * notes, coarse enough that one FFT per frame is cheap.
 */
const FFT_SIZE = 2048;

/**
 * The analyser's own smoothing is left low; the gauge does its own attack and
 * release on the UI thread, and doubling up makes the bars feel sluggish.
 */
const ANALYSER_SMOOTHING = 0.2;

interface PlayerValue {
  queue: QueueState;
  track: Track | null;
  state: PlaybackState;
  /** True while a track is loaded and advancing. */
  isPlaying: boolean;
  /** Seconds, on the UI thread. Read this from animated components. */
  position: SharedValue<number>;
  /** Seconds. Falls back to the track's reported duration until loaded. */
  duration: number;
  /** Whole seconds, for the numeric readout. Re-renders once per second. */
  elapsed: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Live analyser, or `null` before the first track loads. */
  analyser: AnalyserNode | null;
  /** Bumped whenever the analyser is (re)connected, to re-run the poller. */
  analyserEpoch: number;

  /**
   * Replaces the queue and starts playing.
   *
   * `shuffle` is explicit rather than read from the current queue, because a
   * caller that wants "shuffle this folder" would otherwise have to toggle
   * shuffle first and then call this — and the toggle has not landed in state
   * by the time the call runs.
   */
  playTracks: (
    tracks: Track[],
    startIndex: number,
    options?: { shuffle?: boolean }
  ) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  nextRepeatMode: () => void;
  enqueue: (tracks: Track[]) => void;
  playNext: (tracks: Track[]) => void;
  jumpToQueueSlot: (slot: number) => void;
  removeQueueSlot: (slot: number) => void;
  moveQueueSlot: (from: number, to: number) => void;
  clearQueue: () => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function usePlayer(): PlayerValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error('usePlayer must be used inside <PlayerProvider>');
  }
  return value;
}

/** What we persist across launches: ids, not whole tracks. */
interface PersistedPlayer {
  trackIds: string[];
  position: number;
  shuffle: boolean;
  repeat: RepeatMode;
  elapsed: number;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { byId, tracks: libraryTracks } = useLibrary();

  const [queue, setQueue] = useState<QueueState>(EMPTY_QUEUE);
  const [state, setState] = useState<PlaybackState>('idle');
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [analyserEpoch, setAnalyserEpoch] = useState(0);

  const position = useSharedValue(0);

  /**
   * Built in an effect rather than during render so React can discard and
   * remount this component (as it does in development) without leaking a
   * native audio context. The `<Audio>` element simply mounts a frame later.
   */
  const [context, setContext] = useState<AudioContext | null>(null);

  const audioRef = useRef<AudioTagHandle | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    const created = new AudioContext();
    contextRef.current = created;
    setContext(created);

    return () => {
      contextRef.current = null;
      connectedRef.current = false;
      setAnalyser(null);
      void created.close();
    };
  }, []);

  /**
   * Playback intent, separate from `state`. The `<Audio>` element is told to
   * play on every track change; this records whether that is what we want, so
   * an auto-advance keeps playing and a manual pause is not undone.
   */
  const wantsPlayRef = useRef(false);

  /** Latest queue and elapsed time for callbacks that must not re-subscribe. */
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const elapsedRef = useRef(0);

  const track = useMemo(() => currentTrack(queue), [queue]);
  const isPlaying = state === 'playing' || state === 'buffering';

  const duration = loadedDuration > 0 ? loadedDuration : (track?.duration ?? 0);

  // ------------------------------------------------------------- audio session

  useEffect(() => {
    // A car is the one place "keep playing over everything else" is wrong:
    // navigation prompts have to cut through, so we take a session that ducks
    // rather than one that demands exclusivity.
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
      iosOptions: ['allowBluetoothA2DP', 'allowAirPlay'],
    });
    AudioManager.observeAudioInterruptions(true);
    void AudioManager.setAudioSessionActivity(true);

    const interruption = AudioManager.addSystemEventListener(
      'interruption',
      ({ type, shouldResume }) => {
        if (type === 'began') {
          audioRef.current?.pause();
          setState('paused');
        } else if (shouldResume && wantsPlayRef.current) {
          audioRef.current?.play();
          setState('playing');
        }
      }
    );

    const routeChange = AudioManager.addSystemEventListener(
      'routeChange',
      ({ reason }) => {
        // Unplugging headphones or losing Bluetooth should not blast the
        // cabin speakers, which is what resuming on the new route would do.
        if (reason === 'OldDeviceUnavailable') {
          audioRef.current?.pause();
          wantsPlayRef.current = false;
          setState('paused');
        }
      }
    );

    return () => {
      interruption?.remove();
      routeChange?.remove();
    };
  }, []);

  // --------------------------------------------------------------- transport

  const play = useCallback(() => {
    if (!audioRef.current) return;
    wantsPlayRef.current = true;
    void contextRef.current?.resume();
    audioRef.current.play();
    setState('playing');
  }, []);

  const pause = useCallback(() => {
    wantsPlayRef.current = false;
    audioRef.current?.pause();
    setState('paused');
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.min(Math.max(seconds, 0), Math.max(duration, 0));
      audioRef.current?.seekToTime(clamped);
      position.value = clamped;
      elapsedRef.current = clamped;
      setElapsed(Math.floor(clamped));
    },
    [duration, position]
  );

  const toggle = useCallback(() => {
    if (isEmpty(queueRef.current)) return;
    if (wantsPlayRef.current) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  /** Moves the queue and starts the new track, or restarts the current one. */
  const applyMove = useCallback(
    (result: { state: QueueState; action: 'track' | 'repeat' | 'stop' }) => {
      if (result.action === 'stop') {
        wantsPlayRef.current = false;
        audioRef.current?.pause();
        audioRef.current?.seekToTime(0);
        position.value = 0;
        elapsedRef.current = 0;
        setElapsed(0);
        setState('paused');
        setQueue(result.state);
        return;
      }

      if (result.action === 'repeat') {
        // Same track: seek home rather than reloading the source.
        audioRef.current?.seekToTime(0);
        position.value = 0;
        elapsedRef.current = 0;
        setElapsed(0);
        setQueue(result.state);
        if (wantsPlayRef.current) audioRef.current?.play();
        return;
      }

      // A different track: the `source` prop change loads it, and `onLoad`
      // starts playback if that is still what we want.
      position.value = 0;
      elapsedRef.current = 0;
      setElapsed(0);
      setLoadedDuration(0);
      setQueue(result.state);
    },
    [position]
  );

  const next = useCallback(() => {
    applyMove(advance(queueRef.current, { auto: false }));
  }, [applyMove]);

  const previous = useCallback(() => {
    applyMove(back(queueRef.current, elapsedRef.current));
  }, [applyMove]);

  const playTracks = useCallback(
    (
      selection: Track[],
      startIndex: number,
      options: { shuffle?: boolean } = {}
    ) => {
      if (selection.length === 0) return;
      const current = queueRef.current;
      const fresh = createQueue(selection, startIndex, {
        shuffle: options.shuffle ?? current.shuffle,
        repeat: current.repeat,
      });

      position.value = 0;
      elapsedRef.current = 0;
      setElapsed(0);
      setLoadedDuration(0);
      wantsPlayRef.current = true;
      setQueue(fresh);
    },
    [position]
  );

  const setVolume = useCallback((next_: number) => {
    const clamped = Math.min(Math.max(next_, 0), 1);
    audioRef.current?.setVolume(clamped);
    setVolumeState(clamped);
  }, []);

  const toggleShuffle = useCallback(() => {
    setQueue((current) => setShuffle(current, !current.shuffle));
  }, []);

  const nextRepeatMode = useCallback(() => {
    setQueue((current) => setRepeat(current, cycleRepeat(current.repeat)));
  }, []);

  const enqueue = useCallback(
    (selection: Track[]) => {
      const wasEmpty = isEmpty(queueRef.current);
      setQueue((current) => appendTracks(current, selection));
      if (wasEmpty) wantsPlayRef.current = true;
    },
    []
  );

  const playNext = useCallback((selection: Track[]) => {
    const wasEmpty = isEmpty(queueRef.current);
    setQueue((current) => playNextInQueue(current, selection));
    if (wasEmpty) wantsPlayRef.current = true;
  }, []);

  const jumpToQueueSlot = useCallback(
    (slot: number) => {
      const moved = jumpTo(queueRef.current, slot);
      if (moved === queueRef.current) return;
      wantsPlayRef.current = true;
      applyMove({ state: moved, action: 'track' });
    },
    [applyMove]
  );

  const removeQueueSlot = useCallback(
    (slot: number) => {
      const { state: nextState, removedCurrent } = removeAt(
        queueRef.current,
        slot
      );
      if (nextState === queueRef.current) return;

      if (removedCurrent) {
        // The slot now holds a different track, so reload from the top.
        applyMove({
          state: nextState,
          action: isEmpty(nextState) ? 'stop' : 'track',
        });
      } else {
        setQueue(nextState);
      }
    },
    [applyMove]
  );

  const moveQueueSlot = useCallback((from: number, to: number) => {
    setQueue((current) => moveInOrder(current, from, to));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((current) => clearUpcoming(current));
  }, []);

  // ----------------------------------------------------- media notification

  /**
   * The notification is also how the steering-wheel and head-unit hardware
   * keys reach us, so it stays up whenever a track is loaded.
   */
  useEffect(() => {
    if (!track) {
      void PlaybackNotificationManager.hide();
      return;
    }

    void PlaybackNotificationManager.show({
      title: track.title,
      artist: track.artist ?? 'Unknown artist',
      album: track.album ?? undefined,
      artwork: track.artwork ?? undefined,
      duration: duration > 0 ? duration : undefined,
      elapsedTime: elapsed,
      state: isPlaying ? 'playing' : 'paused',
    });
  }, [track, duration, elapsed, isPlaying]);

  useEffect(() => {
    const subscriptions = [
      PlaybackNotificationManager.addEventListener(
        'playbackNotificationPlay',
        () => play()
      ),
      PlaybackNotificationManager.addEventListener(
        'playbackNotificationPause',
        () => pause()
      ),
      PlaybackNotificationManager.addEventListener(
        'playbackNotificationNextTrack',
        () => next()
      ),
      PlaybackNotificationManager.addEventListener(
        'playbackNotificationPreviousTrack',
        () => previous()
      ),
      PlaybackNotificationManager.addEventListener(
        'playbackNotificationStop',
        () => pause()
      ),
      PlaybackNotificationManager.addEventListener(
        'playbackNotificationSeekTo',
        ({ value }) => seekTo(value)
      ),
    ];

    return () => {
      for (const subscription of subscriptions) subscription?.remove();
    };
  }, [play, pause, next, previous, seekTo]);

  // ------------------------------------------------------------- persistence

  // Restore the queue once the library has something to resolve ids against.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || libraryTracks.length === 0) return;
    restoredRef.current = true;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw) as PersistedPlayer;
        const restored = saved.trackIds
          .map((id) => byId(id))
          .filter((found): found is Track => found !== undefined);

        if (restored.length === 0) return;

        const slot = Math.min(Math.max(saved.position, 0), restored.length - 1);

        // Restored in play order, so shuffle stays off for the rebuilt queue
        // while the flag itself is preserved for the next toggle.
        setQueue({
          ...createQueue(restored, slot, { repeat: saved.repeat }),
          shuffle: saved.shuffle,
        });

        // Loaded paused: an app that starts blasting music on boot is not one
        // you want wired into a car.
        wantsPlayRef.current = false;
        position.value = saved.elapsed;
        elapsedRef.current = saved.elapsed;
        setElapsed(Math.floor(saved.elapsed));
        setState('paused');
      } catch {
        // A corrupt saved queue is simply not restored.
      }
    })();
  }, [libraryTracks.length, byId, position]);

  // Save on queue changes, and once a second while playing via `elapsed`.
  useEffect(() => {
    if (isEmpty(queue)) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return;
    }

    const payload: PersistedPlayer = {
      trackIds: orderedTracks(queue).map((t) => t.id),
      position: queue.position,
      shuffle: queue.shuffle,
      repeat: queue.repeat,
      elapsed: elapsedRef.current,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [queue]);

  // --------------------------------------------------------- the audio element

  /**
   * Resolves the real duration of the loaded file.
   *
   * MediaStore's figure is usually right but is wrong often enough to matter —
   * VBR rips in particular — and a seek dial scaled to the wrong length is
   * worse than no dial. `getAudioDuration` reads it from the container.
   */
  useEffect(() => {
    if (!track) {
      setLoadedDuration(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const seconds = await getAudioDuration(track.uri);
        if (!cancelled && Number.isFinite(seconds) && seconds > 0) {
          setLoadedDuration(seconds);
        }
      } catch {
        // Fall back to whatever MediaStore reported for this track.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track]);

  /**
   * Taps the analyser off the media element. Runs once: the `<Audio>` element
   * stays mounted across tracks, so its source node outlives any one track and
   * connecting again would double the signal.
   */
  const connectAnalyser = useCallback(() => {
    if (connectedRef.current) return;

    const context = contextRef.current;
    const handle = audioRef.current;
    if (!context || !handle) return;

    try {
      const source = context.createMediaElementSource(handle);
      const node = context.createAnalyser();
      node.fftSize = FFT_SIZE;
      node.smoothingTimeConstant = ANALYSER_SMOOTHING;

      source.connect(node);
      node.connect(context.destination);

      connectedRef.current = true;
      setAnalyser(node);
      setAnalyserEpoch((epoch) => epoch + 1);
    } catch {
      // Without the analyser the player still works; the gauge falls back to
      // level-free motion rather than taking the screen down with it.
      connectedRef.current = true;
    }
  }, []);

  const handleLoad = useCallback(() => {
    connectAnalyser();
    if (wantsPlayRef.current) {
      void contextRef.current?.resume();
      audioRef.current?.play();
      setState('playing');
    } else {
      setState('paused');
    }
  }, [connectAnalyser]);

  const handlePositionChange = useCallback(
    (seconds: number) => {
      position.value = seconds;
      elapsedRef.current = seconds;

      // Only re-render when the displayed second actually changes.
      const whole = Math.floor(seconds);
      setElapsed((current) => (current === whole ? current : whole));
    },
    [position]
  );

  const handleEnded = useCallback(() => {
    applyMove(advance(queueRef.current, { auto: true }));
  }, [applyMove]);

  const handleError = useCallback(() => {
    // A file that will not open should not stall the queue — skip it.
    const result = advance(queueRef.current, { auto: true });
    if (result.action === 'stop') {
      wantsPlayRef.current = false;
      setState('paused');
      return;
    }
    applyMove(result);
  }, [applyMove]);

  const value = useMemo<PlayerValue>(
    () => ({
      queue,
      track,
      state,
      isPlaying,
      position,
      duration,
      elapsed,
      volume,
      shuffle: queue.shuffle,
      repeat: queue.repeat,
      analyser,
      analyserEpoch,
      playTracks,
      toggle,
      play,
      pause,
      next,
      previous,
      seekTo,
      setVolume,
      toggleShuffle,
      nextRepeatMode,
      enqueue,
      playNext,
      jumpToQueueSlot,
      removeQueueSlot,
      moveQueueSlot,
      clearQueue,
    }),
    [
      queue,
      track,
      state,
      isPlaying,
      position,
      duration,
      elapsed,
      volume,
      analyser,
      analyserEpoch,
      playTracks,
      toggle,
      play,
      pause,
      next,
      previous,
      seekTo,
      setVolume,
      toggleShuffle,
      nextRepeatMode,
      enqueue,
      playNext,
      jumpToQueueSlot,
      removeQueueSlot,
      moveQueueSlot,
      clearQueue,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      {track && context ? (
        <Audio
          ref={audioRef}
          context={context}
          source={{ uri: track.uri }}
          preload="auto"
          volume={volume}
          onLoad={handleLoad}
          onEnded={handleEnded}
          onError={handleError}
          onPositionChange={handlePositionChange}
          onWaiting={() => setState('buffering')}
          onPlaying={() => setState('playing')}
        />
      ) : null}
      {children}
    </PlayerContext.Provider>
  );
}
