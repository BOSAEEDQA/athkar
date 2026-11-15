import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankProgress, completeSession, forSession, initialState, isComplete, restoreState, sessionKey, undo } from '../src/core.mjs';

const catalog = JSON.parse(readFileSync(new URL('../src/adhkar.json', import.meta.url)));
test('Explicit completion fills skipped counts, persists only the chosen session, and supports undo', () => {
  const items = forSession(catalog, 'evening');
  const original = { ...blankProgress(), selected: items.at(-1).id, counts: { [items[0].id]: 1 } };
  const completed = completeSession(original, items);
  assert.equal(isComplete(completed, items), true);
  assert.equal(isComplete(original, items), false);
  assert.equal(completeSession(completed, items), completed);
  assert.equal(isComplete(undo(completed), items), false);
  const state = initialState();
  const key = sessionKey('evening', '2026-10-05');
  state.sessions[key] = completed;
  const restored = restoreState(JSON.parse(JSON.stringify(state)), catalog);
  assert.equal(isComplete(restored.sessions[key], items), true);
  assert.deepEqual(Object.keys(restored.sessions), [key]);
});
