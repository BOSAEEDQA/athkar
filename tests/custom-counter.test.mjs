import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCounters, addCounter, changeCounter, restoreCounters, editCounter } from '../src/custom-counter.mjs';
import { initialState, restoreState } from '../src/core.mjs';

test('Independent custom counts survive saving and restoration; reset affects only the chosen dhikr', () => {
  const state = initialState();
  state.sessions['2026-10-05:morning'] = { counts: {}, selected: null, history: [] };
  let counters = addCounter(emptyCounters(), 'one', '  سبحان الله  ');
  for (let i = 0; i < 157; i++) counters = changeCounter(counters, 'one', 'increment');
  counters = addCounter(counters, 'two', 'الحمد لله');
  counters = changeCounter(counters, 'two', 'increment');
  state.customCounters = counters;
  const restored = restoreState(JSON.parse(JSON.stringify(state)), []);
  assert.deepEqual(restored.customCounters.entries.map(item => item.count), [157, 1]);
  assert.equal(restored.customCounters.selected, 'two');
  assert.equal(restored.customCounters.entries[0].text, 'سبحان الله');
  const reset = changeCounter(restored.customCounters, 'one', 'reset');
  assert.deepEqual(reset.entries.map(item => item.count), [0, 1]);
  assert.equal(restored.customCounters.entries[0].count, 157);
  const edited = editCounter(restored.customCounters, 'one', 'ذكر معدّل');
  assert.equal(edited.entries[0].count, 157);
  assert.equal(edited.selected, 'two');
  assert.equal(edited.entries[0].text, 'ذكر معدّل');
  assert.deepEqual(Object.keys(restored.sessions), ['2026-10-05:morning']);
});

test('Old saves migrate safely and invalid counters cannot break restoration', () => {
  const legacy = initialState();
  delete legacy.customCounters;
  assert.deepEqual(restoreState(legacy, []).customCounters, emptyCounters());
  assert.equal(addCounter(emptyCounters(), 'empty', '   ').entries.length, 0);
  const counters = restoreCounters({ selected: 'missing', entries: [null, { id: 'a', text: 'ذكر', count: -5 }, { id: 'a', text: 'duplicate', count: 3 }, { id: 'b', text: 'ذكر آخر', count: 10000 }] });
  assert.equal(counters.selected, 'a');
  assert.deepEqual(counters.entries.map(item => item.count), [0, 10000]);
  assert.deepEqual(restoreCounters(counters), counters);
});
