/** Tests for the folder tree and the path formatters the explorer relies on. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFolderTree,
  collectTracks,
  findFolder,
  pathToFolder,
} from '../tree.ts';
import {
  basename,
  decodePath,
  folderOf,
  formatRuntime,
  formatTime,
  prettyPath,
  stripExtension,
  trackCount,
} from '../../lib/format.ts';
import type { Track } from '../../types.ts';

const ROOT = '/storage/emulated/0';

function at(folder: string, filename: string, duration = 200): Track {
  return {
    id: `${folder}/${filename}`,
    uri: `file://${folder}/${filename}`,
    filename,
    folder,
    duration,
    addedAt: 0,
    title: stripExtension(filename),
    artist: null,
    album: null,
    artwork: null,
    tagged: false,
  };
}

function names(nodes: { name: string }[]): string[] {
  return nodes.map((n) => n.name);
}

function filenames(tracks: Track[]): string[] {
  return tracks.map((t) => t.filename);
}

// ----------------------------------------------------------------- formatters

describe('formatTime', () => {
  it('formats under an hour as m:ss', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(7), '0:07');
    assert.equal(formatTime(59), '0:59');
    assert.equal(formatTime(60), '1:00');
    assert.equal(formatTime(238), '3:58');
  });

  it('formats an hour or more as h:mm:ss', () => {
    assert.equal(formatTime(3600), '1:00:00');
    assert.equal(formatTime(3723), '1:02:03');
  });

  it('truncates fractional seconds rather than rounding up', () => {
    assert.equal(formatTime(59.9), '0:59');
  });

  it('reads as zero for nonsense input', () => {
    assert.equal(formatTime(-5), '0:00');
    assert.equal(formatTime(NaN), '0:00');
    assert.equal(formatTime(Infinity), '0:00');
  });
});

describe('formatRuntime', () => {
  it('reads in minutes under an hour', () => {
    assert.equal(formatRuntime(60), '1 min');
    assert.equal(formatRuntime(2880), '48 min');
  });

  it('reads in hours and minutes above one hour', () => {
    assert.equal(formatRuntime(8040), '2 h 14 min');
    assert.equal(formatRuntime(7200), '2 h');
  });

  it('reads as zero for nonsense input', () => {
    assert.equal(formatRuntime(0), '0 min');
    assert.equal(formatRuntime(-1), '0 min');
    assert.equal(formatRuntime(NaN), '0 min');
  });
});

describe('stripExtension', () => {
  it('drops the last extension', () => {
    assert.equal(stripExtension('Song.mp3'), 'Song');
    assert.equal(stripExtension('Song.live.flac'), 'Song.live');
  });

  it('leaves a name with no extension alone', () => {
    assert.equal(stripExtension('Song'), 'Song');
  });

  it('treats a leading dot as part of the name', () => {
    assert.equal(stripExtension('.hidden'), '.hidden');
  });
});

describe('folderOf and decodePath', () => {
  it('returns the containing directory', () => {
    assert.equal(folderOf('file:///storage/emulated/0/Music/a.mp3'), '/storage/emulated/0/Music');
  });

  it('percent-decodes escaped path segments', () => {
    assert.equal(folderOf('file:///Music/Sigur%20R%C3%B3s/a.mp3'), '/Music/Sigur Rós');
    assert.equal(decodePath('file:///a%20b'), '/a b');
  });

  it('survives a malformed escape rather than throwing', () => {
    assert.equal(decodePath('file:///bad%zz'), '/bad%zz');
  });

  it('returns the root for a file directly at it', () => {
    assert.equal(folderOf('file:///a.mp3'), '/');
  });
});

describe('basename', () => {
  it('returns the last segment', () => {
    assert.equal(basename('/storage/emulated/0/Music'), 'Music');
    assert.equal(basename('/Music/'), 'Music');
    assert.equal(basename('Music'), 'Music');
  });

  it('returns the root for the root', () => {
    assert.equal(basename('/'), '/');
  });
});

describe('prettyPath', () => {
  it('names the user storage root', () => {
    assert.equal(prettyPath('/storage/emulated/0'), 'Internal storage');
    assert.equal(prettyPath('/sdcard'), 'Internal storage');
  });

  it('drops the internal storage prefix', () => {
    assert.equal(prettyPath('/storage/emulated/0/Music/Rock'), 'Music/Rock');
  });

  it('labels a removable volume by its id shape', () => {
    assert.equal(prettyPath('/storage/1A2B-3C4D'), 'SD card');
    assert.equal(prettyPath('/storage/1A2B-3C4D/Music'), 'SD card/Music');
  });

  it('keeps a named volume as given', () => {
    assert.equal(prettyPath('/storage/usbdrive/Music'), 'usbdrive/Music');
  });

  it('leaves an unrecognised path untouched', () => {
    assert.equal(prettyPath('/data/local/Music'), '/data/local/Music');
  });
});

describe('trackCount', () => {
  it('agrees in number', () => {
    assert.equal(trackCount(0), '0 tracks');
    assert.equal(trackCount(1), '1 track');
    assert.equal(trackCount(7), '7 tracks');
  });
});

// ----------------------------------------------------------------------- tree

describe('buildFolderTree', () => {
  it('returns null for no tracks', () => {
    assert.equal(buildFolderTree([]), null);
  });

  it('collapses the chain down to the first meaningful folder', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/Music`, 'a.mp3'),
      at(`${ROOT}/Music`, 'b.mp3'),
    ]);

    assert.ok(tree);
    assert.equal(tree.path, `${ROOT}/Music`);
    assert.equal(tree.name, 'Music');
    assert.deepEqual(filenames(tree.tracks), ['a.mp3', 'b.mp3']);
  });

  it('stops collapsing where the tree branches', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/Music/Rock`, 'a.mp3'),
      at(`${ROOT}/Podcasts`, 'b.mp3'),
    ]);

    assert.ok(tree);
    assert.equal(tree.path, ROOT);
    assert.deepEqual(names(tree.children), ['Music', 'Podcasts']);
  });

  it('stops collapsing where a folder holds tracks of its own', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/Music`, 'loose.mp3'),
      at(`${ROOT}/Music/Rock`, 'a.mp3'),
    ]);

    assert.ok(tree);
    assert.equal(tree.path, `${ROOT}/Music`);
    assert.deepEqual(filenames(tree.tracks), ['loose.mp3']);
    assert.deepEqual(names(tree.children), ['Rock']);
  });

  it('nests subfolders and counts tracks through the whole subtree', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/Music`, 'loose.mp3'),
      at(`${ROOT}/Music/Rock/Queen`, 'a.mp3'),
      at(`${ROOT}/Music/Rock/Queen`, 'b.mp3'),
      at(`${ROOT}/Music/Jazz`, 'c.mp3'),
    ]);

    assert.ok(tree);
    assert.equal(tree.totalTracks, 4);
    assert.deepEqual(names(tree.children), ['Jazz', 'Rock']);

    const rock = tree.children.find((c) => c.name === 'Rock');
    assert.ok(rock);
    assert.equal(rock.totalTracks, 2);
    assert.equal(rock.tracks.length, 0);
    assert.equal(rock.children[0].name, 'Queen');
    assert.equal(rock.children[0].totalTracks, 2);
  });

  it('sorts folders and tracks the way a person reads a list', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/M/b`, 'x.mp3'),
      at(`${ROOT}/M/a`, 'y.mp3'),
      at(`${ROOT}/M`, '10 ten.mp3'),
      at(`${ROOT}/M`, '2 two.mp3'),
      at(`${ROOT}/M`, '1 one.mp3'),
    ]);

    assert.ok(tree);
    assert.deepEqual(names(tree.children), ['a', 'b']);
    // Numeric-aware: 2 before 10, not "10" before "2".
    assert.deepEqual(filenames(tree.tracks), ['1 one.mp3', '2 two.mp3', '10 ten.mp3']);
  });

  it('keeps separate storage volumes side by side', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/Music`, 'a.mp3'),
      at('/storage/1A2B-3C4D/Music', 'b.mp3'),
    ]);

    assert.ok(tree);
    assert.equal(tree.path, '/storage');
    assert.deepEqual(names(tree.children), ['1A2B-3C4D', 'emulated']);
  });
});

describe('findFolder', () => {
  const tree = buildFolderTree([
    at(`${ROOT}/Music`, 'loose.mp3'),
    at(`${ROOT}/Music/Rock/Queen`, 'a.mp3'),
    at(`${ROOT}/Music/Jazz`, 'c.mp3'),
  ]);

  it('finds the root', () => {
    assert.equal(findFolder(tree, `${ROOT}/Music`)?.name, 'Music');
  });

  it('finds a deep folder', () => {
    assert.equal(findFolder(tree, `${ROOT}/Music/Rock/Queen`)?.name, 'Queen');
  });

  it('returns null for a path that is not in the tree', () => {
    assert.equal(findFolder(tree, `${ROOT}/Music/Nope`), null);
    assert.equal(findFolder(null, '/anything'), null);
  });

  it('does not match a folder whose name merely shares a prefix', () => {
    const shared = buildFolderTree([
      at(`${ROOT}/M/Rock`, 'a.mp3'),
      at(`${ROOT}/M/Rockabilly`, 'b.mp3'),
    ]);
    assert.equal(findFolder(shared, `${ROOT}/M/Rockabilly`)?.name, 'Rockabilly');
    assert.equal(findFolder(shared, `${ROOT}/M/Rock`)?.name, 'Rock');
  });
});

describe('pathToFolder', () => {
  const tree = buildFolderTree([
    at(`${ROOT}/Music`, 'loose.mp3'),
    at(`${ROOT}/Music/Rock/Queen`, 'a.mp3'),
  ]);

  it('returns the chain from the root down', () => {
    const chain = pathToFolder(tree, `${ROOT}/Music/Rock/Queen`);
    assert.deepEqual(names(chain), ['Music', 'Rock', 'Queen']);
  });

  it('returns just the root for the root', () => {
    assert.deepEqual(names(pathToFolder(tree, `${ROOT}/Music`)), ['Music']);
  });

  it('returns nothing for an unknown path', () => {
    assert.deepEqual(pathToFolder(tree, '/nope'), []);
    assert.deepEqual(pathToFolder(null, '/nope'), []);
  });
});

describe('collectTracks', () => {
  it('takes this folder first, then each subfolder depth-first', () => {
    const tree = buildFolderTree([
      at(`${ROOT}/M`, 'loose.mp3'),
      at(`${ROOT}/M/a`, 'a1.mp3'),
      at(`${ROOT}/M/a/deep`, 'a2.mp3'),
      at(`${ROOT}/M/b`, 'b1.mp3'),
    ]);

    assert.ok(tree);
    assert.deepEqual(filenames(collectTracks(tree)), [
      'loose.mp3',
      'a1.mp3',
      'a2.mp3',
      'b1.mp3',
    ]);
  });

  it('returns a single folder as-is', () => {
    const tree = buildFolderTree([at(`${ROOT}/M`, 'only.mp3')]);
    assert.ok(tree);
    assert.deepEqual(filenames(collectTracks(tree)), ['only.mp3']);
  });
});
