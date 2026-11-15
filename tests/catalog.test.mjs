import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blankProgress, countFor, completedCount, forSession, increment, initialState, isComplete, nextIncomplete, planAlerts, restoreState, undo } from '../src/core.mjs';
const catalog = JSON.parse(fs.readFileSync(new URL('../src/adhkar.json', import.meta.url), 'utf8'));
const morningOrder = ['ayat-kursi', 'ikhlas', 'falaq', 'nas', 'asbahna-mulk', 'bika-asbahna', 'sayyid-istighfar', 'ushhiduka', 'nimah', 'afini', 'hamm', 'hasbi', 'afiyah', 'fatir', 'bismillah', 'raditu', 'hayy-qayyum', 'rabb-alamin', 'fitrah', 'tahlil', 'subhanallah', 'adada-khalqih', 'ilm-nafi', 'istighfar', 'salawat'];
const eveningOrder = ['ayat-kursi', 'baqarah-last', 'ikhlas', 'falaq', 'nas', 'asbahna-mulk', 'bika-asbahna', 'sayyid-istighfar', 'ushhiduka', 'nimah', 'afini', 'hamm', 'hasbi', 'afiyah', 'fatir', 'bismillah', 'raditu', 'hayy-qayyum', 'rabb-alamin', 'fitrah', 'tahlil', 'subhanallah', 'kalimat', 'istighfar', 'salawat'];

test('Both sessions match all 25 entries in the supplied screenshot order', () => {
  assert.deepEqual(forSession(catalog, 'morning').map(i => i.id), morningOrder);
  assert.deepEqual(forSession(catalog, 'evening').map(i => i.id), eveningOrder);
  const plain = text => text.normalize('NFD').replace(/[\u064b-\u065f\u0670]/g, '');
  for (const id of ['asbahna-mulk', 'bika-asbahna', 'ushhiduka', 'nimah', 'rabb-alamin', 'fitrah']) {
    const item = catalog.find(i => i.id === id);
    assert.ok(item.eveningTitle && item.evening);
    assert.notEqual(item.evening, item.morning);
    if (id !== 'bika-asbahna') assert.ok(!plain(item.evening).includes('اصبح'));
  }
  assert.match(plain(catalog.find(i => i.id === 'bika-asbahna').evening), /واليك المصير/);
});

test('The nine-entry saved version migrates without losing counts, selection, history or settings', () => {
  const oldIds = ['ikhlas', 'falaq', 'nas', 'sayyid-istighfar', 'bika-asbahna', 'bismillah', 'afiyah', 'fatir', 'subhanallah'];
  const state = initialState();
  state.settings.fontSize = 38;
  for (const kind of ['morning', 'evening']) {
    let p = blankProgress();
    for (const id of oldIds) p = increment(p, catalog.find(i => i.id === id));
    for (let n = 0; n < 6; n++) p = increment(p, catalog.find(i => i.id === 'subhanallah'));
    state.sessions[`2026-10-03:${kind}`] = p;
  }
  const restored = restoreState(JSON.parse(JSON.stringify(state)), catalog);
  assert.equal(restored.settings.fontSize, 38);
  for (const kind of ['morning', 'evening']) {
    const p = restored.sessions[`2026-10-03:${kind}`], old = state.sessions[`2026-10-03:${kind}`];
    assert.equal(p.selected, old.selected);
    assert.deepEqual(p.history, old.history);
    for (const id of oldIds) assert.equal(p.counts[id], old.counts[id]);
    assert.equal(p.counts['ayat-kursi'], 0);
    assert.equal(Object.keys(p.counts).length, 25);
    assert.equal(p.counts[kind === 'morning' ? 'baqarah-last' : 'ilm-nafi'], undefined);
    assert.equal(undo(p).counts.subhanallah, 6);
  }
});

test('Only the 25 items for that session determine completion and notification suppression', () => {
  const state = initialState(), now = new Date('2026-10-03T00:00:00Z');
  Object.values(state.settings.prayer).forEach(p => { p.athan = false; p.iqama = false; });
  state.settings.reminders.morning.enabled = true;
  state.settings.reminders.evening.enabled = true;
  for (const kind of ['morning', 'evening']) {
    const items = forSession(catalog, kind);
    let p = blankProgress();
    for (const item of items) for (let n = 0; n < item.repetitions; n++) p = increment(p, item);
    state.sessions[`2026-10-03:${kind}`] = p;
    assert.equal(completedCount(p, items), 25);
    assert.equal(isComplete(p, items), true);
    assert.equal(nextIncomplete(p, items, 24), null);
  }
  let plans = planAlerts(now, state, catalog, { deviceZone: 'Asia/Qatar' });
  assert.ok(!plans.some(p => p.id.startsWith('reminder:2026-10-03:')));
  state.sessions['2026-10-03:evening'] = undo(state.sessions['2026-10-03:evening']);
  plans = planAlerts(now, state, catalog, { deviceZone: 'Asia/Qatar' });
  assert.ok(plans.some(p => p.id === 'reminder:2026-10-03:evening'));
  assert.ok(!plans.some(p => p.id === 'reminder:2026-10-03:morning'));
});
