/**
 * Reads ID3 tags off a file on disk and caches any embedded cover art.
 *
 * expo-media-library reports filename and duration for audio, but not artist,
 * album or cover art, so we read the tags ourselves. Only the head of each
 * file is touched: `FileHandle` gives synchronous random access, so a 9 MB MP3
 * costs one ~200 KB read rather than a full decode.
 *
 * All byte-level parsing lives in `id3-parse.ts`; this module is the IO shell.
 */
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import {
  EMPTY_TAGS,
  hasAnyTag,
  isId3v2Header,
  parseId3v1,
  parseId3v2Frames,
  readId3v2Header,
  stripTagPrefixes,
  type Picture,
} from './id3-parse';

export interface Id3Tags {
  title: string | null;
  artist: string | null;
  album: string | null;
  /** `file://` URI of the extracted cover, written into the artwork cache. */
  artwork: string | null;
}

const EMPTY: Id3Tags = { title: null, artist: null, album: null, artwork: null };

/**
 * Hard ceiling on how much of a tag we will read. Covers a tag with a
 * high-resolution embedded cover while refusing to pull a whole album-length
 * file into memory if a size field is corrupt.
 */
const MAX_TAG_BYTES = 4 * 1024 * 1024;

/** Cover art larger than this is skipped rather than cached. */
const MAX_ARTWORK_BYTES = 3 * 1024 * 1024;

const ARTWORK_DIR = 'artwork';

function artworkDir(): Directory {
  const dir = new Directory(Paths.cache, ARTWORK_DIR);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

/**
 * Writes cover bytes into the artwork cache and returns the file URI.
 * Keyed by track id, so a rescan reuses what is already on disk.
 */
function cacheArtwork(trackId: string, picture: Picture): string | null {
  const { data, mime } = picture;
  if (data.length === 0 || data.length > MAX_ARTWORK_BYTES) return null;

  try {
    const safeId = trackId.replace(/[^A-Za-z0-9_-]/g, '_');
    const file = new File(artworkDir(), `${safeId}.${extensionForMime(mime)}`);

    if (!file.exists) {
      file.create({ overwrite: true, intermediates: true });
      // `subarray` views share the tag buffer; copy so we hand over exact bytes.
      file.write(new Uint8Array(data));
    }
    return file.uri;
  } catch {
    // A cache write failing is not worth failing the whole tag read over.
    return null;
  }
}

/** Removes every cached cover. */
export function clearArtworkCache(): void {
  try {
    const dir = new Directory(Paths.cache, ARTWORK_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to do — the cache is best-effort by design.
  }
}

/**
 * Reads tags for one track.
 *
 * Never throws: an unreadable or untagged file resolves to all-null, which the
 * caller renders as filename-only. `trackId` keys the artwork cache entry.
 */
export async function readTags(uri: string, trackId: string): Promise<Id3Tags> {
  let handle: ReturnType<File['open']> | null = null;

  try {
    const file = new File(uri);
    if (!file.exists) return EMPTY;

    handle = file.open(FileMode.ReadOnly);
    const fileSize = handle.size ?? 0;
    if (fileSize < 10) return EMPTY;

    const header = handle.readBytes(10);

    if (isId3v2Header(header)) {
      const { majorVersion, flags, size } = readId3v2Header(header);
      const toRead = Math.min(size, MAX_TAG_BYTES, fileSize - 10);

      if (toRead > 0) {
        const body = handle.readBytes(toRead);
        const frames = stripTagPrefixes(body, majorVersion, flags);
        const parsed = parseId3v2Frames(frames, majorVersion);

        if (hasAnyTag(parsed)) {
          return {
            title: parsed.title,
            artist: parsed.artist,
            album: parsed.album,
            artwork: parsed.picture
              ? cacheArtwork(trackId, parsed.picture)
              : null,
          };
        }
      }
    }

    // No usable v2 tag — try the v1 block at the very end of the file.
    if (fileSize >= 128) {
      handle.offset = fileSize - 128;
      const v1 = parseId3v1(handle.readBytes(128));
      return {
        title: v1.title,
        artist: v1.artist,
        album: v1.album,
        artwork: null,
      };
    }

    return EMPTY;
  } catch {
    return EMPTY;
  } finally {
    try {
      handle?.close();
    } catch {
      // Already closed, or never opened.
    }
  }
}

export { EMPTY_TAGS };
