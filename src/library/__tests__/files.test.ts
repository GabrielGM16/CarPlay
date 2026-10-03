/** Tests for the file explorer's ordering, kinds and path walking. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  crumbsOf,
  fileUri,
  formatSize,
  kindOf,
  parentOf,
  rootOf,
  sortEntries,
  trackForFile,
} from '../files.ts';
import type { Track } from '../../types.ts';

const INTERNAL = '/storage/emulated/0';
const CARD = '/storage/1A2B-3C4D';
const ROOTS = [INTERNAL, CARD];

function entry(name: string, isDirectory = false) {
  return { name, path: `${INTERNAL}/${name}`, isDirectory, size: 0, modified: 0 };
}

describe('kindOf', () => {
  it('classifies folders, audio, video and the rest', () => {
    assert.equal(kindOf(entry('Music', true)), 'folder');
    assert.equal(kindOf(entry('song.FLAC')), 'audio');
    assert.equal(kindOf(entry('clip.mkv')), 'video');
    assert.equal(kindOf(entry('notes.txt')), 'other');
  });

  it('keeps mp4 playable as audio', () => {
    assert.equal(kindOf(entry('rip.mp4')), 'audio');
  });

  it('does not treat a dotfile name as an extension', () => {
    assert.equal(kindOf(entry('.mp3')), 'other');
  });
});

describe('sortEntries', () => {
  it('puts folders first, then numeric-aware names', () => {
    const sorted = sortEntries([
      entry('Track 10.mp3'),
      entry('b', true),
      entry('Track 2.mp3'),
      entry('A', true),
    ]).map((e) => e.name);
    assert.deepEqual(sorted, ['A', 'b', 'Track 2.mp3', 'Track 10.mp3']);
  });

  it('does not mutate its input', () => {
    const input = [entry('b'), entry('a')];
    sortEntries(input);
    assert.deepEqual(input.map((e) => e.name), ['b', 'a']);
  });
});

describe('rootOf / parentOf / crumbsOf', () => {
  it('finds the containing root without matching a sibling prefix', () => {
    assert.equal(rootOf(`${INTERNAL}/Music`, ROOTS), INTERNAL);
    assert.equal(rootOf('/storage/emulated/01/x', ROOTS), null);
  });

  it('climbs one level and stops at the root', () => {
    assert.equal(parentOf(`${CARD}/Music/Rock`, ROOTS), `${CARD}/Music`);
    assert.equal(parentOf(`${CARD}/Music`, ROOTS), CARD);
    assert.equal(parentOf(CARD, ROOTS), null);
  });

  it('lists each step from the root', () => {
    assert.deepEqual(crumbsOf(`${INTERNAL}/Music/Rock`, ROOTS), [
      INTERNAL,
      `${INTERNAL}/Music`,
      `${INTERNAL}/Music/Rock`,
    ]);
    assert.deepEqual(crumbsOf(INTERNAL, ROOTS), [INTERNAL]);
  });
});

describe('trackForFile', () => {
  it('escapes each path segment in the URI', () => {
    assert.equal(fileUri('/a b/c#d.mp3'), 'file:///a%20b/c%23d.mp3');
  });

  it('reuses the library entry for a known file', () => {
    const path = `${INTERNAL}/Music/song.mp3`;
    const known = { id: '42', uri: fileUri(path) } as Track;
    assert.equal(trackForFile(path, new Map([[known.uri, known]])), known);
  });

  it('builds a bare track keyed by path for an unknown file', () => {
    const track = trackForFile(`${INTERNAL}/Downloads/My Song.opus`, new Map());
    assert.equal(track.id, `file:${INTERNAL}/Downloads/My Song.opus`);
    assert.equal(track.title, 'My Song');
    assert.equal(track.folder, `${INTERNAL}/Downloads`);
    assert.equal(track.tagged, false);
  });
});

describe('formatSize', () => {
  it('scales through the units', () => {
    assert.equal(formatSize(512), '512 B');
    assert.equal(formatSize(1536), '1.5 KB');
    assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
    assert.equal(formatSize(300 * 1024 * 1024), '300 MB');
  });
});
