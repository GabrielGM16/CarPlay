/**
 * Finds the audio on the device and fills in its tags.
 *
 * Two stages, because they have very different costs:
 *
 *   `scanTracks`  asks MediaStore for every audio file. Fast, one query per
 *                 page, and enough to show a full library immediately.
 *   `tagTracks`   reads ID3 off each file to get artist, album and cover art.
 *                 Slow-ish, so it runs in the background after the list is
 *                 already on screen, a batch at a time.
 *
 * Splitting them is what makes a 3,000-file library usable a second after
 * launch instead of thirty seconds after launch.
 */
import * as MediaLibrary from 'expo-media-library/legacy';
import { PermissionsAndroid, Platform } from 'react-native';

import { device, type AudioAsset } from '../launcher/device';
import { folderOf, stripExtension } from '../lib/format';
import { readTags } from '../lib/id3';
import type { Track } from '../types';
import { audioPermissionFor } from './permissions';

/** MediaStore page size. Large enough that a big library is a few queries. */
const PAGE_SIZE = 500;

/** How many files to read tags from per batch before yielding to the UI. */
const TAG_BATCH_SIZE = 12;

/**
 * Extensions we hand to the audio engine. MediaStore occasionally reports
 * ringtones and voice memos in containers the decoder will not open, and a
 * track that fails to load is worse than one that was never listed.
 */
const PLAYABLE = new Set([
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'mp4',
  'm4b',
  'wma',
  'aiff',
  'aif',
  'mka',
]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function isPlayable(filename: string): boolean {
  return PLAYABLE.has(extensionOf(filename));
}

export interface PermissionResult {
  granted: boolean;
  /** True when the user denied and Android will not ask again. */
  blocked: boolean;
}

/**
 * Asks for audio read access.
 *
 * Only the audio permission is requested — asking for photo and video access
 * in a music player is the kind of thing that makes people say no.
 */
export async function requestAudioPermission(prompt = true): Promise<PermissionResult> {
  if (Platform.OS === 'android') {
    const permission = audioPermissionFor(Number(Platform.Version));
    if (await PermissionsAndroid.check(permission)) return { granted: true, blocked: false };
    if (!prompt) return { granted: false, blocked: false };
    const result = await PermissionsAndroid.request(permission);
    return {
      granted: result === PermissionsAndroid.RESULTS.GRANTED,
      blocked: result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  }
  const current = await MediaLibrary.getPermissionsAsync(false, ['audio']);
  if (current.granted) return { granted: true, blocked: false };

  if (!current.canAskAgain) {
    return { granted: false, blocked: true };
  }
  if (!prompt) return { granted: false, blocked: false };

  const asked = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  return { granted: asked.granted, blocked: !asked.granted && !asked.canAskAgain };
}

function toTrack(asset: AudioAsset | MediaLibrary.Asset): Track {
  return {
    id: asset.id,
    uri: asset.uri,
    filename: asset.filename,
    folder: folderOf(asset.uri),
    // MediaStore reports audio duration in seconds already.
    duration: Number.isFinite(asset.duration) ? asset.duration : 0,
    addedAt: asset.creationTime ?? 0,
    title: stripExtension(asset.filename),
    artist: null,
    album: null,
    artwork: null,
    tagged: false,
  };
}

export interface ScanProgress {
  /** Files found so far. */
  found: number;
}

/**
 * Lists every playable audio file on the device.
 *
 * `onProgress` fires once per page so a long scan can show a running count.
 * Pass an `AbortSignal` to stop a scan when the user leaves or rescans.
 */
export async function scanTracks(options: {
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
} = {}): Promise<Track[]> {
  const { onProgress, signal } = options;
  const tracks: Track[] = [];
  const seen = new Set<string>();

  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    if (signal?.aborted) return tracks;

    const useReadOnlyScan = Platform.OS === 'android' && Number(Platform.Version) < 33;
    if (useReadOnlyScan && !device) {
      throw new Error('Instala el nuevo APK para activar el acceso a audio en este Android.');
    }
    const page = useReadOnlyScan ? await device!.getAudioPage(Number(after ?? 0), PAGE_SIZE) : await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.audio],
      first: PAGE_SIZE,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    for (const asset of page.assets) {
      // MediaStore can report the same file twice across volumes.
      if (seen.has(asset.id) || !isPlayable(asset.filename)) continue;
      seen.add(asset.id);
      tracks.push(toTrack(asset));
    }

    onProgress?.({ found: tracks.length });

    hasNextPage = page.hasNextPage && page.assets.length > 0;
    after = page.endCursor;
  }

  return tracks.sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * Reads ID3 tags for tracks that do not have them yet.
 *
 * Reports a batch at a time through `onBatch` rather than resolving once at
 * the end, so the library fills in visibly while it works. Yields to the
 * event loop between batches to keep scrolling smooth.
 */
export async function tagTracks(
  tracks: Track[],
  options: {
    onBatch: (tagged: Track[]) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const { onBatch, signal } = options;
  const pending = tracks.filter((track) => !track.tagged);

  for (let i = 0; i < pending.length; i += TAG_BATCH_SIZE) {
    if (signal?.aborted) return;

    const batch = pending.slice(i, i + TAG_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (track): Promise<Track> => {
        const tags = await readTags(track.uri, track.id);
        return {
          ...track,
          // Keep the filename-derived title when the file has no title tag.
          title: tags.title ?? track.title,
          artist: tags.artist,
          album: tags.album,
          artwork: tags.artwork,
          tagged: true,
        };
      })
    );

    if (signal?.aborted) return;
    onBatch(results);

    // Hand the frame back so the list stays responsive during a long tag pass.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Merges tagged results into a track list, keyed by id, preserving order. */
export function mergeTracks(existing: Track[], updates: Track[]): Track[] {
  if (updates.length === 0) return existing;

  const byId = new Map(updates.map((track) => [track.id, track]));
  return existing.map((track) => byId.get(track.id) ?? track);
}

/**
 * Carries tags from a previous scan onto a fresh one, so a rescan does not
 * re-read every file just because one album was added.
 */
export function carryOverTags(fresh: Track[], previous: Track[]): Track[] {
  if (previous.length === 0) return fresh;

  const byId = new Map(previous.map((track) => [track.id, track]));

  return fresh.map((track) => {
    const old = byId.get(track.id);
    if (!old?.tagged) return track;
    return {
      ...track,
      title: old.title,
      artist: old.artist,
      album: old.album,
      artwork: old.artwork,
      tagged: true,
    };
  });
}
