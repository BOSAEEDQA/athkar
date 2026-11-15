import { MAX_BACKUP_BYTES } from './backup.mjs';

export async function exportBackupFile(text) {
  const name = `athkar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'نسخة أذكارك الاحتياطية' }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function chooseBackupFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,.txt,application/json,text/plain'; input.hidden = true;
    const finish = () => input.remove();
    input.oncancel = () => { finish(); resolve(null); };
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        if (file.size > MAX_BACKUP_BYTES) throw new Error('الملف كبير جدًا. اختر نسخة الأذكار الاحتياطية.');
        resolve(await file.text());
      } catch (e) { reject(e); }
      finally { finish(); }
    };
    document.body.append(input); input.click();
  });
}
