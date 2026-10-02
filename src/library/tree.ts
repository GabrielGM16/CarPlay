/**
 * Builds the browsable folder tree from a flat list of scanned tracks.
 *
 * Pure — no filesystem access. The scanner already knows every audio file's
 * path, so the tree is derived rather than walked, which keeps it correct
 * under Android's scoped storage where directory listing is unreliable.
 *
 * Single-child directories holding no tracks are collapsed, so the explorer
 * opens on `Music` rather than making you tap through
 * `storage -> emulated -> 0 -> Music`.
 */
import type { FolderNode, Track } from '../types';
import { basename } from '../lib/format';

interface MutableNode {
  path: string;
  name: string;
  children: Map<string, MutableNode>;
  tracks: Track[];
  totalTracks: number;
}

function makeNode(path: string, name: string): MutableNode {
  return { path, name, children: new Map(), tracks: [], totalTracks: 0 };
}

/** Splits `/storage/emulated/0/Music` into its non-empty segments. */
function segments(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/** Compares strings the way a person reads a file list: case- and digit-aware. */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortTracks(a: Track, b: Track): number {
  return compareNames(a.filename, b.filename);
}

/**
 * Walks the tree bottom-up filling in `totalTracks`, and sorts children and
 * tracks at every level.
 */
function finalise(node: MutableNode): FolderNode {
  const children = [...node.children.values()]
    .map(finalise)
    .sort((a, b) => compareNames(a.name, b.name));

  const tracks = [...node.tracks].sort(sortTracks);
  const totalTracks =
    tracks.length + children.reduce((sum, child) => sum + child.totalTracks, 0);

  return { path: node.path, name: node.name, children, tracks, totalTracks };
}

/**
 * Drops leading directories that hold no tracks and only one subdirectory.
 * Stops as soon as a level has tracks of its own or branches.
 */
function collapse(root: MutableNode): MutableNode {
  let node = root;
  while (node.tracks.length === 0 && node.children.size === 1) {
    const only = node.children.values().next().value;
    if (!only) break;
    node = only;
  }
  return node;
}

/**
 * Groups tracks into a folder hierarchy.
 *
 * Returns `null` when there are no tracks, which the explorer renders as its
 * empty state rather than an empty root folder.
 */
export function buildFolderTree(tracks: Track[]): FolderNode | null {
  if (tracks.length === 0) return null;

  const root = makeNode('/', '/');

  for (const track of tracks) {
    let node = root;
    let path = '';

    for (const segment of segments(track.folder)) {
      path += `/${segment}`;
      let child = node.children.get(segment);
      if (!child) {
        child = makeNode(path, segment);
        node.children.set(segment, child);
      }
      node = child;
    }

    node.tracks.push(track);
  }

  const collapsed = collapse(root);
  const finalised = finalise(collapsed);

  // A collapsed root keeps its full path but should read as its own folder.
  return { ...finalised, name: basename(finalised.path) };
}

/** Depth-first lookup of a folder by its absolute path. */
export function findFolder(root: FolderNode | null, path: string): FolderNode | null {
  if (!root) return null;
  if (root.path === path) return root;

  // Only descend into branches whose path actually prefixes the target.
  for (const child of root.children) {
    if (path === child.path || path.startsWith(`${child.path}/`)) {
      return findFolder(child, path);
    }
  }
  return null;
}

/**
 * The chain of folders from the tree root down to `path`, for the explorer's
 * breadcrumb. Always starts with the root; empty when the path is not found.
 */
export function pathToFolder(
  root: FolderNode | null,
  path: string
): FolderNode[] {
  if (!root) return [];
  if (root.path === path) return [root];

  for (const child of root.children) {
    if (path === child.path || path.startsWith(`${child.path}/`)) {
      const rest = pathToFolder(child, path);
      return rest.length > 0 ? [root, ...rest] : [];
    }
  }
  return [];
}

/**
 * Every track under a folder, in the order the explorer shows them: this
 * folder's own tracks first, then each subfolder's, depth-first.
 *
 * This is what "play this folder" enqueues.
 */
export function collectTracks(folder: FolderNode): Track[] {
  const out = [...folder.tracks];
  for (const child of folder.children) {
    out.push(...collectTracks(child));
  }
  return out;
}
