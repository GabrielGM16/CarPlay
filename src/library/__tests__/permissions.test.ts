import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioPermissionFor } from '../permissions.ts';

test('head units before Android 13 use storage read permission', () => {
  for (const api of [26, 28, 29, 30, 31, 32]) {
    assert.equal(audioPermissionFor(api), 'android.permission.READ_EXTERNAL_STORAGE');
  }
});

test('Android 13 and later request audio without photo or video permissions', () => {
  for (const api of [33, 34, 35, 36]) {
    assert.equal(audioPermissionFor(api), 'android.permission.READ_MEDIA_AUDIO');
  }
});
