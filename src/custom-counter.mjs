export const emptyCounters = () => ({ entries: [], selected: null });
export function restoreCounters(saved) {
  const entries = [], seen = new Set();
  for (const item of Array.isArray(saved?.entries) ? saved.entries : []) {
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.text !== 'string' || !item.text.trim()) continue;
    seen.add(item.id);
    entries.push({ id: item.id, text: item.text.trim().slice(0, 1000), count: Number.isSafeInteger(item.count) && item.count >= 0 ? item.count : 0 });
  }
  return { entries, selected: entries.some(item => item.id === saved?.selected) ? saved.selected : entries[0]?.id ?? null };
}
export function addCounter(counters, id, text) {
  const clean = text.trim().slice(0, 1000);
  if (!clean || !id || counters.entries.some(item => item.id === id)) return counters;
  return { entries: [...counters.entries, { id, text: clean, count: 0 }], selected: id };
}
export function changeCounter(counters, id, action) {
  if (!['increment', 'reset'].includes(action)) return counters;
  return { ...counters, entries: counters.entries.map(item => item.id !== id ? item : {
    ...item, count: action === 'reset' ? 0 : Math.min(Number.MAX_SAFE_INTEGER, item.count + 1),
  }) };
}
export function editCounter(counters, id, text) {
  const clean = text.trim().slice(0, 1000);
  if (!clean) return counters;
  return { ...counters, entries: counters.entries.map(item => item.id === id ? { ...item, text: clean } : item) };
}
