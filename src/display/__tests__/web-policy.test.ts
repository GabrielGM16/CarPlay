import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canNavigateInsidePanel } from '../web-policy.ts';

test('web links and the blank loading page stay inside the launcher', () => {
  assert.equal(canNavigateInsidePanel('https://m.youtube.com/watch?v=123'), true);
  assert.equal(canNavigateInsidePanel('https://accounts.google.com'), true);
  assert.equal(canNavigateInsidePanel('about:blank'), true);
});
test('app handoffs and unsafe or invalid schemes are blocked', () => {
  for (const url of ['intent://youtube/#Intent;scheme=https;end', 'vnd.youtube:123', 'market://details?id=x', 'file:///sdcard/Music', 'javascript:alert(1)', 'http://example.com', 'invalid']) {
    assert.equal(canNavigateInsidePanel(url), false, url);
  }
});
