import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { blankProgress, cities, countFor, dayKey, forSession, increment, initialState, isComplete, nextIncomplete, nextPrayer, planAlerts, prayerTimes, recentUnfinished, restoreState, sessionKey, timeLabel, undo } from '../src/core.mjs';
const catalog = JSON.parse(fs.readFileSync(new URL('../src/adhkar.json', import.meta.url), 'utf8'));
const items = forSession(catalog, 'morning');

test('Bundled content has stable IDs, sources and valid repetition counts', () => {
  assert.equal(new Set(catalog.map(i => i.id)).size, catalog.length);
  assert.equal(catalog.length, 27);
  for (const item of catalog) {
    assert.ok(Number.isInteger(item.repetitions) && item.repetitions > 0);
    const source = new URL(item.sourceURL);
    assert.equal(source.protocol, 'https:');
    assert.ok(['islamweb.net', 'www.islamweb.net'].includes(source.hostname));
    assert.match(source.pathname, /^\/ar\/(library\/content|fatwa|article)\//);
    for (const extra of item.extraSources ?? []) assert.ok(['islamweb.net', 'www.islamweb.net'].includes(new URL(extra.url).hostname));
    assert.ok(item.morning.length > 10 && item.source.length > 5);
  }
});
test('Counter clamps at target and undo crosses the boundary without changing other dhikr', () => {
  const items = ['ikhlas', 'falaq'].map(id => catalog.find(item => item.id === id));
  let p = blankProgress();
  for (let i = 0; i < 6; i++) p = increment(p, items[0]);
  assert.equal(countFor(p, items[0]), 3);
  assert.equal(p.history.length, 3);
  p = increment(p, items[1]);
  p = undo(p); assert.equal(p.selected, items[1].id); assert.equal(countFor(p, items[1]), 0);
  p = undo(p); assert.equal(p.selected, items[0].id); assert.equal(countFor(p, items[0]), 2);
});
test('Selecting the last dhikr does not falsely complete the skipped items', () => {
  let p = blankProgress();
  const last = items.at(-1);
  for (let i = 0; i < last.repetitions; i++) p = increment(p, last);
  assert.equal(isComplete(p, items), false);
  assert.equal(nextIncomplete(p, items, items.length - 1), items[0].id);
});
test('Completion requires all repetitions; undo reopens session', () => {
  let p = blankProgress();
  for (const item of items) for (let i = 0; i < item.repetitions; i++) p = increment(p, item);
  assert.equal(isComplete(p, items), true);
  assert.equal(nextIncomplete(p, items, 0), null);
  assert.equal(isComplete(undo(p), items), false);
});
test('Morning, evening and dates remain independent through save/restore', () => {
  const state = initialState();
  state.sessions[sessionKey('morning', '2026-10-02')] = increment(blankProgress(), items[0]);
  state.sessions[sessionKey('evening', '2026-10-02')] = increment(blankProgress(), items[1]);
  state.settings.prayer.dhuhr.delay = 37;
  const restored = restoreState(JSON.parse(JSON.stringify(state)), items);
  assert.equal(countFor(restored.sessions['2026-10-02:morning'], items[0]), 1);
  assert.equal(countFor(restored.sessions['2026-10-02:evening'], items[0]), 0);
  assert.equal(recentUnfinished(restored, 'morning', '2026-10-03', items), '2026-10-02');
  assert.equal(restored.settings.prayer.dhuhr.delay, 37);
  assert.equal(restored.settings.prayer.fajr.delay, 20);
});
test('Malformed saved state is rejected; numbers are bounded', () => {
  assert.throws(() => restoreState({ version: 2 }, items));
  const state = initialState(); state.settings.prayer.fajr.delay = -100; state.settings.fontSize = 900;
  const restored = restoreState(state, items);
  assert.equal(restored.settings.prayer.fajr.delay, 0);
  assert.equal(restored.settings.fontSize, 44);
});
test('Prayer dates use selected city, even when device is across the date boundary', () => {
  const date = new Date('2026-10-02T22:30:00Z');
  assert.equal(dayKey(date, 'Asia/Qatar'), '2026-10-03');
  assert.equal(dayKey(date, 'America/Los_Angeles'), '2026-10-02');
  const state = initialState();
  const times = prayerTimes(date, state.settings);
  assert.equal(times.length, 5);
  for (const t of times) assert.equal(dayKey(t.date, 'Asia/Qatar'), '2026-10-03');
  for (let i = 1; i < times.length; i++) assert.ok(times[i].date > times[i - 1].date);
});
test('Prayer calculations do not drift when device timezone changes', () => {
  const code = "import {prayerTimes,initialState} from './src/core.mjs'; console.log(JSON.stringify(prayerTimes(new Date('2026-10-02T22:30:00Z'),initialState().settings).map(p=>p.date.toISOString())))";
  const run = TZ => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ } }).toString();
  assert.equal(run('Pacific/Honolulu'), run('Asia/Tokyo'));
});
test('Offsets apply before iqama, including minute/hour rollover', () => {
  const date = new Date('2026-10-03T08:00:00Z'), state = initialState();
  const original = prayerTimes(date, state.settings)[1];
  state.settings.prayer.dhuhr.adjustment = 7; state.settings.prayer.dhuhr.delay = 65;
  const changed = prayerTimes(date, state.settings)[1];
  assert.equal(changed.date - original.date, 7 * 60000);
  assert.equal(changed.iqamaDate - changed.date, 65 * 60000);
  assert.match(timeLabel(changed.iqamaDate, state.settings.city.zone), /^\d{1,2}:\d{2} [صم]$/);
});
test('Next prayer rolls to tomorrow after Isha, respecting enabled iqama', () => {
  const settings = initialState().settings, date = new Date('2026-10-03T00:00:00Z');
  const isha = prayerTimes(date, settings).at(-1);
  assert.equal(nextPrayer(new Date(isha.date.getTime() + 1000), settings).awaitingIqama, true);
  const next = nextPrayer(new Date(isha.iqamaDate.getTime() + 1000), settings);
  assert.equal(next.id, 'fajr');
  assert.equal(dayKey(next.date, settings.city.zone), '2026-10-04');
});
test('Notification queue is future-only, unique, chronological and capped', () => {
  const now = new Date('2026-10-03T08:00:00Z'), state = initialState();
  state.settings.reminders.morning.enabled = true; state.settings.reminders.evening.enabled = true;
  const plans = planAlerts(now, state, items, { deviceZone: 'Asia/Qatar' });
  assert.equal(plans.length, 60); assert.equal(new Set(plans.map(p => p.id)).size, 60);
  plans.forEach((plan, i) => { assert.ok(plan.date > now); if (i) assert.ok(plan.date >= plans[i - 1].date); });
});
test('Completing morning suppresses only its own dated reminder', () => {
  const state = initialState(), now = new Date('2026-10-03T00:00:00Z');
  Object.values(state.settings.prayer).forEach(p => { p.athan = false; p.iqama = false; });
  state.settings.reminders.morning.enabled = true; state.settings.reminders.evening.enabled = true;
  let p = blankProgress(); for (const item of items) for (let i = 0; i < item.repetitions; i++) p = increment(p, item);
  state.sessions['2026-10-03:morning'] = p;
  const plans = planAlerts(now, state, items, { deviceZone: 'Asia/Qatar' });
  assert.ok(!plans.some(p => p.id === 'reminder:2026-10-03:morning'));
  assert.ok(plans.some(p => p.id === 'reminder:2026-10-03:evening'));
  assert.ok(plans.some(p => p.id === 'reminder:2026-10-04:morning'));
});
test('Every offered city computes five valid prayers', () => {
  for (const city of cities) { const settings = initialState().settings; settings.city = city; assert.equal(prayerTimes(new Date('2026-10-03T12:00:00Z'), settings).length, 5); }
});

test('Hanbali Asr uses the earlier shadow factor; changing it preserves other prayers and reschedules iqama', () => {
  const date = new Date('2026-10-03T00:00:00Z');
  const state = initialState();
  state.settings.hanafi = false;
  const hanbali = prayerTimes(date, state.settings);
  const hanbaliPlans = planAlerts(date, state, catalog, { deviceZone: 'Asia/Qatar' });
  state.settings.hanafi = true;
  const restored = restoreState(JSON.parse(JSON.stringify(state)), catalog);
  assert.equal(restored.settings.hanafi, true);
  const hanafi = prayerTimes(date, restored.settings);
  for (const before of hanbali) {
    const after = hanafi.find(p => p.id === before.id);
    if (before.id === 'asr') {
      assert.ok(after.date > before.date);
      assert.equal(after.iqamaDate - after.date, state.settings.prayer.asr.delay * 60000);
    } else assert.equal(after.date.getTime(), before.date.getTime());
  }
  const hanafiPlans = planAlerts(date, restored, catalog, { deviceZone: 'Asia/Qatar' });
  for (const prefix of ['athan:asr:', 'iqama:asr:']) {
    assert.ok(hanafiPlans.find(p => p.id.startsWith(prefix)).date > hanbaliPlans.find(p => p.id.startsWith(prefix)).date);
  }
  restored.settings.hanafi = false;
  const savedAgain = restoreState(JSON.parse(JSON.stringify(restored)), catalog);
  assert.equal(savedAgain.settings.hanafi, false);
  assert.equal(prayerTimes(date, savedAgain.settings).find(p => p.id === 'asr').date.getTime(), hanbali.find(p => p.id === 'asr').date.getTime());
});
