import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBackup, parseBackup } from '../src/backup.mjs';
import { initialState, prayerTimes } from '../src/core.mjs';
const items = JSON.parse(fs.readFileSync(new URL('../src/adhkar.json', import.meta.url)));
test('backup preserves counts, text, selection, sessions and prayer preferences', () => {
  const state = initialState();
  state.customCounters = { entries: [{ id: 'personal', text: 'سبحان الله', count: 1250 }], selected: 'personal' };
  state.settings.prayer.asr.adjustment = 3;
  state.settings.hanafi = true;
  state.sessions['2026-11-15:morning'] = { counts: { 'ayat-kursi': 1 }, selected: 'ayat-kursi', history: ['ayat-kursi'] };
  const restored = parseBackup(createBackup(state), items);
  assert.deepEqual(restored.customCounters, state.customCounters);
  assert.equal(restored.sessions['2026-11-15:morning'].counts['ayat-kursi'], 1);
  assert.deepEqual(prayerTimes(new Date('2026-11-15T09:00:00Z'), restored.settings), prayerTimes(new Date('2026-11-15T09:00:00Z'), state.settings));
});
test('raw Expo backup imports without requiring an envelope', () => {
  const state = initialState();
  state.customCounters.entries.push({ id: 'old', text: 'الحمد لله', count: 913 });
  assert.equal(parseBackup(JSON.stringify(state), items).customCounters.entries[0].count, 913);
});
test('reject unsupported and damaged backups without mutating existing state', () => {
  for (const text of ['{}', 'null', 'not json', JSON.stringify({ format: 'athkar-backup', version: 2 })]) assert.throws(() => parseBackup(text, items));
  const state = initialState();
  state.customCounters.entries.push({ id: 'x', text: 'ذكر', count: -1 });
  assert.throws(() => parseBackup(createBackup(state), items));
  assert.equal(state.customCounters.entries[0].count, -1);
});
