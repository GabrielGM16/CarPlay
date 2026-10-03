import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignPanel, DEFAULT_DISPLAY, restoreDisplay } from '../preferences.ts';

test('corrupt display settings fall back to usable panels', () => {
  assert.deepEqual(restoreDisplay(null), DEFAULT_DISPLAY);
  assert.deepEqual(restoreDisplay({ count: 99, musicStyle: 'bad', panels: ['bad'] }), DEFAULT_DISPLAY);
});
test('valid styles and all four panes survive a restart', () => {
  const saved = { count: 4, musicStyle: 'cover', panels: ['youtube', 'now-playing', 'maps', 'queue'] };
  assert.deepEqual(restoreDisplay(saved), saved);
});
test('duplicate or malformed persisted panes never create two music views', () => {
  const restored = restoreDisplay({ panels: ['now-playing', 'now-playing', 'now-playing', 'now-playing'] });
  assert.equal(new Set(restored.panels).size, 4);
  assert.deepEqual(restoreDisplay({ panels: 42 }).panels, DEFAULT_DISPLAY.panels);
});
test('moving music to another pane swaps rather than creating a second analyser poller', () => {
  const original = ['now-playing', 'library', 'queue', 'youtube'] as const;
  assert.deepEqual(assignPanel([...original], 1, 'now-playing'), ['library', 'now-playing', 'queue', 'youtube']);
  assert.deepEqual(original, ['now-playing', 'library', 'queue', 'youtube']);
});
test('replacing a pane and invalid indices preserve the other panes', () => {
  assert.deepEqual(assignPanel([...DEFAULT_DISPLAY.panels], 3, 'maps'), ['now-playing', 'library', 'queue', 'maps']);
  assert.deepEqual(assignPanel([...DEFAULT_DISPLAY.panels], 8, 'maps'), DEFAULT_DISPLAY.panels);
});
