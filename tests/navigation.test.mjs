import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blankProgress, increment, countFor, isComplete, initialState, restoreState, forSession } from '../src/core.mjs';
import { browseDhikr, horizontalSwipe, swipeStep } from '../src/navigation.mjs';
const items = forSession(JSON.parse(fs.readFileSync(new URL('../src/adhkar.json', import.meta.url), 'utf8')), 'morning');

test('Leave the 100-count dhikr early, return and resume without completing skipped items', () => {
  const index = items.findIndex(item => item.repetitions === 100);
  let p = blankProgress();
  for (let n = 0; n < 7; n++) p = increment(p, items[index]);
  const next = browseDhikr(p, items, index, 1);
  assert.equal(next.selected, items[(index + 1) % items.length].id);
  assert.deepEqual(next.counts, p.counts);
  assert.deepEqual(next.history, p.history);
  assert.equal(isComplete(next, items), false);
  const returned = browseDhikr(next, items, (index + 1) % items.length, -1);
  const state = initialState();
  state.sessions['2026-10-03:morning'] = returned;
  const restored = restoreState(JSON.parse(JSON.stringify(state)), items).sessions['2026-10-03:morning'];
  assert.equal(restored.selected, items[index].id);
  assert.equal(countFor(increment(restored, items[index]), items[index]), 8);
});

test('Browsing works in both directions on every dhikr, including completed items', () => {
  let p = blankProgress();
  for (const item of items) for (let n = 0; n < item.repetitions; n++) p = increment(p, item);
  for (let i = 0; i < items.length; i++) {
    assert.equal(browseDhikr(p, items, i, 1).selected, items[(i + 1) % items.length].id);
    assert.equal(browseDhikr(p, items, i, -1).selected, items[(i - 1 + items.length) % items.length].id);
  }
});

test('Horizontal gestures navigate; taps, vertical scrolling and diagonal drags do not', () => {
  assert.equal(horizontalSwipe({ dx: 22, dy: 4, numberActiveTouches: 1 }), true);
  assert.equal(horizontalSwipe({ dx: 22, dy: 4, numberActiveTouches: 2 }), false);
  assert.equal(swipeStep({ dx: 65, dy: 12 }), 1);
  assert.equal(swipeStep({ dx: -65, dy: 12 }), -1);
  for (const gesture of [{ dx: 3, dy: 2 }, { dx: 30, dy: 1 }, { dx: 20, dy: 100 }, { dx: 60, dy: 50 }]) {
    assert.equal(swipeStep(gesture), 0);
  }
  assert.equal(horizontalSwipe({ dx: 20, dy: 100, numberActiveTouches: 1 }), false);
});
