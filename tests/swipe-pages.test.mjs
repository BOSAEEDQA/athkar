import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwipeTracker } from '../src/swipe-tracker.mjs';
import { browseCounter } from '../src/custom-counter.mjs';

test('swipe both ways between counters, keeping exact saved counts and entries', () => {
  const counters = { entries: [{ id: 'a', text: 'سبحان الله', count: 1250 }, { id: 'b', text: 'الحمد لله', count: 307 }], selected: 'a' };
  const gesture = createSwipeTracker();
  gesture.start(1, 100, 100); gesture.move(1, 150, 103);
  const next = browseCounter(counters, gesture.end(1, 180, 105));
  assert.equal(next.selected, 'b');
  assert.equal(next.entries, counters.entries);
  assert.equal(gesture.blocksClick(), true);
  gesture.start(2, 180, 100);
  const previous = browseCounter(next, gesture.end(2, 100, 101));
  assert.equal(previous.selected, 'a');
  assert.deepEqual(previous.entries.map(e => e.count), [1250, 307]);
});
test('a tap counts, a short drag does not count or change pages, next tap works immediately', () => {
  const g = createSwipeTracker();
  g.start(1, 100, 100); assert.equal(g.end(1, 102, 101), 0); assert.equal(g.blocksClick(), false);
  g.start(2, 100, 100); assert.equal(g.end(2, 130, 101), 0); assert.equal(g.blocksClick(), true);
  g.start(3, 100, 100); assert.equal(g.end(3, 100, 100), 0); assert.equal(g.blocksClick(), false);
});
test('vertical scrolling, multitouch and cancelled gestures never navigate', () => {
  const g = createSwipeTracker();
  g.start(1, 100, 100); g.move(1, 102, 150);
  assert.equal(g.end(1, 250, 155), 0);
  g.start(2, 100, 100); g.move(2, 160, 100); g.cancel(); assert.equal(g.end(2, 180, 100), 0);
  g.start(3, 100, 100); g.start(4, 130, 100, false); assert.equal(g.end(3, 200, 100), 0);
});
test('zero or one custom counter cannot navigate or change its count', () => {
  const empty = { entries: [], selected: null };
  assert.equal(browseCounter(empty, 1), empty);
  const single = { entries: [{ id: 'a', text: 'ذكر', count: 20 }], selected: 'a' };
  assert.equal(browseCounter(single, -1), single);
});
