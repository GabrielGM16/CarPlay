/**
 * Pure rules behind the file explorer: ordering, what a file is, and how a
 * path climbs back to its storage root. IO lives in `FilesScreen` and the
 * native module; this is the part that can be wrong in silence.
 */
import type { FileEntry } from '../launcher/device';
import { stripExtension } from '../lib/format';
import type { Track } from '../types';
import { isPlayable } from './playable';

export type FileKind = 'folder' | 'audio' | 'video' | 'other';

const VIDEO = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', '3gp', 'm4v']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * `mp4` is listed as audio by the player, since many rips use it. Audio wins
 * here too, so an `.mp4` song stays playable from the explorer.
 */
export function kindOf(entry: Pick<FileEntry, 'name' | 'isDirectory'>): FileKind {
  if (entry.isDirectory) return 'folder';
  if (isPlayable(entry.name)) return 'audio';
  if (VIDEO.has(extensionOf(entry.name))) return 'video';
  return 'other';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Folders first, then files; each by name, with `Track 2` before `Track 10`. */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
}

/** The root that contains `path`, or `null` when it is outside every root. */
export function rootOf(path: string, roots: string[]): string | null {
  let best: string | null = null;
  for (const root of roots) {
    const inside = path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`);
    if (inside && (best === null || root.length > best.length)) best = root;
  }
  return best;
}

/** One level up, stopping at the storage root. `null` at the root itself. */
export function parentOf(path: string, roots: string[]): string | null {
  const root = rootOf(path, roots);
  if (root === null || path === root) return null;
  const slash = path.lastIndexOf('/');
  const parent = slash <= 0 ? '/' : path.slice(0, slash);
  return parent.length < root.length ? root : parent;
}

/** Each step from the root down to `path`, inclusive, as absolute paths. */
export function crumbsOf(path: string, roots: string[]): string[] {
  const root = rootOf(path, roots);
  if (root === null) return [path];
  const rest = path.slice(root.length).split('/').filter(Boolean);
  const out = [root];
  for (const segment of rest) out.push(`${out[out.length - 1]}/${segment}`);
  return out;
}

/** `file://` URI with each segment escaped, the form the scanner produces. */
export function fileUri(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * A playable track for a file found by browsing. Reuses the library's entry
 * when MediaStore already knows the file, so tags, artwork and queue restore
 * all carry over; otherwise builds a bare one keyed by path.
 */
export function trackForFile(
  path: string,
  libraryByUri: Map<string, Track>
): Track {
  const uri = fileUri(path);
  const known = libraryByUri.get(uri);
  if (known) return known;

  const slash = path.lastIndexOf('/');
  const filename = path.slice(slash + 1);
  return {
    id: `file:${path}`,
    uri,
    filename,
    folder: slash <= 0 ? '/' : path.slice(0, slash),
    duration: 0,
    addedAt: 0,
    title: stripExtension(filename),
    artist: null,
    album: null,
    artwork: null,
    tagged: false,
  };
}

/** `1536` -> `1.5 KB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
