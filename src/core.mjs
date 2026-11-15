import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import { DateTime } from 'luxon';
import { emptyCounters, restoreCounters } from './custom-counter.mjs';

export const prayers = [
  { id: 'fajr', title: 'الفجر' }, { id: 'dhuhr', title: 'الظهر' }, { id: 'asr', title: 'العصر' },
  { id: 'maghrib', title: 'المغرب' }, { id: 'isha', title: 'العشاء' },
];
export const kinds = [{ id: 'morning', title: 'أذكار الصباح', icon: 'sunny-outline' }, { id: 'evening', title: 'أذكار المساء', icon: 'moon-outline' }];
export const methods = { Qatar: 'قطر', UmmAlQura: 'أم القرى', Kuwait: 'الكويت', Dubai: 'دبي', MuslimWorldLeague: 'رابطة العالم الإسلامي', Egyptian: 'الهيئة المصرية للمساحة', Karachi: 'جامعة كراتشي' };
export const cities = [
  { id: 'doha', name: 'الدوحة', latitude: 25.2854, longitude: 51.531, zone: 'Asia/Qatar', method: 'Qatar' },
  { id: 'riyadh', name: 'الرياض', latitude: 24.7136, longitude: 46.6753, zone: 'Asia/Riyadh', method: 'UmmAlQura' },
  { id: 'makkah', name: 'مكة المكرمة', latitude: 21.4225, longitude: 39.8262, zone: 'Asia/Riyadh', method: 'UmmAlQura' },
  { id: 'madinah', name: 'المدينة المنورة', latitude: 24.4672, longitude: 39.6111, zone: 'Asia/Riyadh', method: 'UmmAlQura' },
  { id: 'kuwait', name: 'الكويت', latitude: 29.3759, longitude: 47.9774, zone: 'Asia/Kuwait', method: 'Kuwait' },
  { id: 'dubai', name: 'دبي', latitude: 25.2048, longitude: 55.2708, zone: 'Asia/Dubai', method: 'Dubai' },
  { id: 'manama', name: 'المنامة', latitude: 26.2235, longitude: 50.5876, zone: 'Asia/Bahrain', method: 'MuslimWorldLeague' },
  { id: 'muscat', name: 'مسقط', latitude: 23.588, longitude: 58.3829, zone: 'Asia/Muscat', method: 'MuslimWorldLeague' },
];
export function initialState() {
  return { version: 1, settings: { city: { ...cities[0] }, hanafi: false, ramadanAdjustment: true, theme: 'system', fontSize: 30, haptics: true,
    prayer: Object.fromEntries(prayers.map(p => [p.id, { athan: true, iqama: true, delay: 20, adjustment: 0 }])),
    reminders: { morning: { enabled: false, hour: 7, minute: 0 }, evening: { enabled: false, hour: 17, minute: 0 } },
  }, sessions: {}, customCounters: emptyCounters() };
}
export const clamp = (v, min, max, fallback = min) => Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
export const blankProgress = () => ({ counts: {}, selected: null, history: [] });
export const dayKey = (date = new Date(), zone) => DateTime.fromJSDate(date, zone ? { zone } : {}).toISODate();
export const sessionKey = (kind, day) => `${day}:${kind}`;
export const forSession = (items, kind) => items.filter(item => !item.sessions || item.sessions.includes(kind));
export const countFor = (p, item) => clamp(p?.counts?.[item.id] ?? 0, 0, item.repetitions);
export const isComplete = (p, items) => items.length > 0 && items.every(item => countFor(p, item) === item.repetitions);
export const completedCount = (p, items) => items.filter(item => countFor(p, item) === item.repetitions).length;
export const started = p => Object.values(p?.counts ?? {}).some(n => n > 0);
export function increment(p, item) {
  if (countFor(p, item) >= item.repetitions) return p;
  return { counts: { ...p.counts, [item.id]: countFor(p, item) + 1 }, selected: item.id, history: [...p.history, item.id].slice(-512) };
}
export function undo(p) {
  const id = p.history.at(-1);
  if (!id) return p;
  return { ...p, counts: { ...p.counts, [id]: Math.max(0, (p.counts[id] ?? 0) - 1) }, selected: id, history: p.history.slice(0, -1) };
}
export function completeSession(progress, items) {
  let completed = progress;
  for (const item of items) {
    while (countFor(completed, item) < item.repetitions) completed = increment(completed, item);
  }
  return completed;
}
export function nextIncomplete(p, items, from) {
  for (let step = 1; step <= items.length; step++) {
    const item = items[(from + step) % items.length];
    if (countFor(p, item) < item.repetitions) return item.id;
  }
  return null;
}
export function recentUnfinished(state, kind, day, items) {
  const sessionItems = forSession(items, kind);
  return Object.keys(state.sessions).filter(key => key.endsWith(`:${kind}`) && key.slice(0, 10) < day && started(state.sessions[key]) && !isComplete(state.sessions[key], sessionItems)).sort().at(-1)?.slice(0, 10) ?? null;
}
export function restoreState(saved, items) {
  if (!saved || saved.version !== 1 || typeof saved.sessions !== 'object' || !saved.sessions || !saved.settings) throw new Error('Invalid saved state');
  const state = initialState(), s = saved.settings;
  state.customCounters = restoreCounters(saved.customCounters);
  const c = s.city;
  if (c && typeof c.name === 'string' && Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90 && Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180 && DateTime.now().setZone(c.zone).isValid && methods[c.method]) state.settings.city = { ...c, name: c.name.slice(0, 100) };
  state.settings.theme = ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system';
  state.settings.fontSize = clamp(s.fontSize, 24, 44, 30);
  for (const key of ['hanafi', 'ramadanAdjustment', 'haptics']) if (typeof s[key] === 'boolean') state.settings[key] = s[key];
  for (const prayer of prayers) {
    const p = s.prayer?.[prayer.id];
    if (p) state.settings.prayer[prayer.id] = { athan: p.athan !== false, iqama: p.iqama !== false, delay: clamp(p.delay, 0, 120, 20), adjustment: clamp(p.adjustment, -30, 30, 0) };
  }
  for (const { id } of kinds) {
    const r = s.reminders?.[id];
    if (r) state.settings.reminders[id] = { enabled: r.enabled === true, hour: clamp(r.hour, 0, 23), minute: clamp(r.minute, 0, 59) };
  }
  for (const [key, p] of Object.entries(saved.sessions)) {
    if (!/^\d{4}-\d{2}-\d{2}:(morning|evening)$/.test(key) || !p) continue;
    const sessionItems = forSession(items, key.split(':')[1]);
    state.sessions[key] = {
      counts: Object.fromEntries(sessionItems.map(item => [item.id, countFor(p, item)])),
      selected: sessionItems.some(i => i.id === p.selected) ? p.selected : null,
      history: Array.isArray(p.history) ? p.history.filter(id => sessionItems.some(i => i.id === id)).slice(-512) : [],
    };
  }
  return state;
}
export function prayerTimes(date, settings) {
  const { city } = settings;
  const local = DateTime.fromJSDate(date, { zone: city.zone });
  if (!local.isValid || !methods[city.method]) return [];
  const coordinates = new Coordinates(city.latitude, city.longitude);
  const params = CalculationMethod[city.method]();
  params.madhab = settings.hanafi ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.recommended(coordinates);
  if (settings.ramadanAdjustment && ['Qatar', 'UmmAlQura'].includes(city.method)) {
    const month = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { timeZone: city.zone, month: 'numeric' }).format(date);
    if (Number(month) === 9) params.ishaInterval += 30;
  }
  const result = new PrayerTimes(coordinates, new Date(local.year, local.month - 1, local.day, 12), params);
  return prayers.map(prayer => {
    const pref = settings.prayer[prayer.id];
    const athan = new Date(result[prayer.id].getTime() + pref.adjustment * 60000);
    return { ...prayer, date: athan, iqamaDate: new Date(athan.getTime() + pref.delay * 60000) };
  }).filter(p => Number.isFinite(p.date.getTime())).sort((a, b) => a.date - b.date);
}
export function nextPrayer(now, settings) {
  const local = DateTime.fromJSDate(now, { zone: settings.city.zone });
  const today = prayerTimes(now, settings);
  const iqama = today.find(p => p.date <= now && p.iqamaDate > now && settings.prayer[p.id].iqama);
  if (iqama) return { ...iqama, awaitingIqama: true };
  return [...today, ...prayerTimes(local.plus({ days: 1 }).toJSDate(), settings)].find(p => p.date > now) ?? null;
}
export const timeLabel = (date, zone) => {
  const local = DateTime.fromJSDate(date, { zone }).setLocale('en');
  return `${local.toFormat('h:mm')} ${local.hour < 12 ? 'ص' : 'م'}`;
};

export function planAlerts(now, state, items, { deviceZone = DateTime.local().zoneName, limit = 60 } = {}) {
  const result = [], settings = state.settings;
  const base = DateTime.fromJSDate(now, { zone: settings.city.zone }).startOf('day');
  for (let day = -1; day < 14; day++) {
    for (const prayer of prayerTimes(base.plus({ days: day }).toJSDate(), settings)) {
      const p = settings.prayer[prayer.id], id = `${prayer.id}:${prayer.date.getTime()}`;
      if (p.athan && prayer.date > now) result.push({ id: `athan:${id}`, date: prayer.date, title: `حان وقت ${prayer.title}`, body: `${settings.city.name} · وقت الأذان`, session: null });
      if (p.iqama && prayer.iqamaDate > now) result.push({ id: `iqama:${id}`, date: prayer.iqamaDate, title: `تذكير إقامة ${prayer.title}`, body: `بعد الأذان بـ ${p.delay} دقيقة · تذكيرك الشخصي`, session: null });
    }
  }
  const deviceDay = DateTime.fromJSDate(now, { zone: deviceZone }).startOf('day');
  for (let day = 0; day < 14; day++) for (const kind of kinds) {
    const r = settings.reminders[kind.id];
    const date = deviceDay.plus({ days: day }).set({ hour: r.hour, minute: r.minute });
    const key = sessionKey(kind.id, date.toISODate());
    if (r.enabled && date.toMillis() > now.getTime() && !isComplete(state.sessions[key], forSession(items, kind.id))) result.push({ id: `reminder:${key}`, date: date.toJSDate(), title: kind.title, body: 'لحظات من الذكر والسكينة', session: kind.id });
  }
  return result.sort((a, b) => a.date - b.date).slice(0, Math.max(0, limit));
}
