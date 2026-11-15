import { restoreState } from './core.mjs';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export function createBackup(data, date = new Date()) {
  return JSON.stringify({ format: 'athkar-backup', version: 1, exportedAt: date.toISOString(), data }, null, 2);
}
export function parseBackup(text, items) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES) throw new Error('الملف كبير جدًا أو غير صالح.');
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '').trim()); }
  catch { throw new Error('تعذّر قراءة النسخة؛ اختر ملف الأذكار أو الصق النص كاملًا.'); }
  if (value?.format && (value.format !== 'athkar-backup' || value.version !== 1)) throw new Error('هذه النسخة غير مدعومة.');
  const saved = value?.format === 'athkar-backup' ? value.data : value;
  if (!saved || saved.version !== 1 || !saved.settings || !saved.sessions || Array.isArray(saved.sessions)) throw new Error('هذا ليس ملف بيانات الأذكار.');
  if (saved.customCounters != null) {
    const entries = saved.customCounters.entries;
    if (!Array.isArray(entries) || entries.some(e => !e || typeof e.id !== 'string' || !e.id || typeof e.text !== 'string' || !e.text.trim() || e.text.length > 1000 || !Number.isSafeInteger(e.count) || e.count < 0) || new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('بيانات العدّادات غير صالحة؛ لم تتغير بياناتك الحالية.');
  }
  try { return restoreState(saved, items); }
  catch { throw new Error('تعذّر استرجاع النسخة؛ لم تتغير بياناتك الحالية.'); }
}
