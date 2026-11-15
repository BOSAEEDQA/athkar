// A synchronous write on each action survives immediately closing the app.
// Keep a separate key from the former Expo/web preview.
export const STORAGE_KEY = 'athkar-offline-state-v1';
const RECOVERY_KEY = `${STORAGE_KEY}-before-import`;
export function readLocal() { return localStorage.getItem(STORAGE_KEY); }
export function writeLocal(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
export function keepBeforeImport(data) { localStorage.setItem(RECOVERY_KEY, JSON.stringify(data)); }
export function readBeforeImport() { return localStorage.getItem(RECOVERY_KEY); }
