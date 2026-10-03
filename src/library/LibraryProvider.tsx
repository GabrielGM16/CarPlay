/**
 * Owns the device's music: permission, scanning, tagging and the folder tree.
 *
 * The library is cached to storage, so a relaunch shows the full list
 * immediately and then reconciles against MediaStore in the background. On a
 * head unit that boots with the ignition, that difference is the whole
 * experience.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { FolderNode, Track } from '../types';
import {
  carryOverTags,
  mergeTracks,
  requestAudioPermission,
  scanTracks,
  tagTracks,
} from './scan';
import { buildFolderTree } from './tree';

const STORAGE_KEY = 'library.tracks.v1';

export type LibraryStatus =
  | 'idle'
  | 'requesting-permission'
  | 'denied'
  | 'error'
  | 'scanning'
  | 'ready';

interface LibraryValue {
  status: LibraryStatus;
  /** Every playable file, newest first. */
  tracks: Track[];
  /** The same tracks as a browsable folder hierarchy. */
  tree: FolderNode | null;
  /** Files found so far during a scan. */
  found: number;
  /** How many tracks still have no tags read. */
  untagged: number;
  /** True when Android will not prompt for permission again. */
  permissionBlocked: boolean;
  error: string | null;
  /** Re-queries MediaStore, keeping tags already read. */
  rescan: () => void;
  /** Prompts for audio access, then scans. */
  grantAccess: () => void;
  byId: (id: string) => Track | undefined;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function useLibrary(): LibraryValue {
  const value = useContext(LibraryContext);
  if (!value) {
    throw new Error('useLibrary must be used inside <LibraryProvider>');
  }
  return value;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LibraryStatus>('idle');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [found, setFound] = useState(0);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkingPermission = useRef(false);

  /** Aborts an in-flight scan or tag pass when a new one starts, or on unmount. */
  const runRef = useRef<AbortController | null>(null);

  /**
   * Tagging updates arrive in batches while the user may also be rescanning.
   * Buffering into a ref and flushing on a timer keeps a 3,000-file tag pass
   * from causing 250 renders.
   */
  const pendingTags = useRef<Track[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTags = useCallback(() => {
    flushTimer.current = null;
    const batch = pendingTags.current;
    if (batch.length === 0) return;
    pendingTags.current = [];
    setTracks((current) => mergeTracks(current, batch));
  }, []);

  const queueTagFlush = useCallback(
    (batch: Track[]) => {
      pendingTags.current.push(...batch);
      if (flushTimer.current === null) {
        flushTimer.current = setTimeout(flushTags, 400);
      }
    },
    [flushTags]
  );

  const persist = useCallback((toSave: Track[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {
      // A cache write failing costs a slower next launch, nothing more.
    });
  }, []);

  /**
   * Scans MediaStore and then reads tags for anything new.
   * `previous` supplies tags already read, so a rescan is cheap.
   */
  const runScan = useCallback(
    async (previous: Track[]) => {
      runRef.current?.abort();
      const controller = new AbortController();
      runRef.current = controller;
      pendingTags.current = [];
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
      flushTimer.current = null;

      setError(null);
      setStatus('scanning');
      setFound(previous.length);

      try {
        const fresh = await scanTracks({
          signal: controller.signal,
          onProgress: ({ found: count }) => setFound(count),
        });
        if (controller.signal.aborted) return;

        const withTags = carryOverTags(fresh, previous);
        setTracks(withTags);
        setStatus('ready');
        persist(withTags);

        await tagTracks(withTags, {
          signal: controller.signal,
          onBatch: queueTagFlush,
        });
        if (controller.signal.aborted) return;

        // One final flush, then persist the completed tag pass.
        flushTags();
        setTracks((current) => {
          persist(current);
          return current;
        });
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'No se pudo leer la biblioteca.');
          setStatus('error');
        }
      }
    },
    [flushTags, persist, queueTagFlush]
  );

  const grantAccess = useCallback(() => {
    if (checkingPermission.current) return;
    checkingPermission.current = true;
    void (async () => {
      try {
        setError(null);
        setStatus('requesting-permission');
        const { granted, blocked } = await requestAudioPermission();
        setPermissionBlocked(blocked);
        if (!granted) {
          runRef.current?.abort();
          setStatus('denied');
          return;
        }
        await runScan([]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo solicitar el permiso.');
        setStatus('error');
      } finally {
        checkingPermission.current = false;
      }
    })();
  }, [runScan]);

  const rescan = useCallback((prompt = true) => {
    if (checkingPermission.current) return;
    checkingPermission.current = true;
    void (async () => {
      try {
        setError(null);
        const { granted, blocked } = await requestAudioPermission(prompt);
        if (prompt || granted) setPermissionBlocked(blocked);
        if (!granted) {
          runRef.current?.abort();
          setStatus('denied');
          return;
        }
        await runScan(tracks);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo comprobar el permiso.');
        setStatus('error');
      } finally {
        checkingPermission.current = false;
      }
    })();
  }, [runScan, tracks]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') rescan(false);
    });
    return () => subscription.remove();
  }, [rescan]);

  // Load the cache, then reconcile against the device.
  useEffect(() => {
    let cancelled = false;
    checkingPermission.current = true;

    void (async () => {
      let cached: Track[] = [];
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) cached = parsed as Track[];
        }
      } catch {
        // A corrupt cache is discarded rather than repaired.
      }

      if (cancelled) return;

      if (cached.length > 0) {
        setTracks(cached);
        setFound(cached.length);
        setStatus('ready');
      }

      try {
        const { granted, blocked } = await requestAudioPermission(false);
        if (cancelled) return;
        setPermissionBlocked(blocked);
        if (!granted) {
          setStatus('denied');
          return;
        }
        await runScan(cached);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'No se pudo comprobar el permiso.');
          setStatus('error');
        }
      } finally {
        checkingPermission.current = false;
      }
    })();

    return () => {
      cancelled = true;
      runRef.current?.abort();
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
    };
    // Runs once on mount: `runScan` closes over only stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tree = useMemo(() => buildFolderTree(tracks), [tracks]);

  const index = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks]
  );
  const byId = useCallback((id: string) => index.get(id), [index]);

  const untagged = useMemo(
    () => tracks.reduce((count, track) => count + (track.tagged ? 0 : 1), 0),
    [tracks]
  );

  const value = useMemo<LibraryValue>(
    () => ({
      status,
      tracks,
      tree,
      found,
      untagged,
      permissionBlocked,
      error,
      rescan,
      grantAccess,
      byId,
    }),
    [status, tracks, tree, found, untagged, permissionBlocked, error, rescan, grantAccess, byId]
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}
