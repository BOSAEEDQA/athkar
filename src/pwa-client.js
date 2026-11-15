let snapshot = { status: 'loading', update: false };
const listeners = new Set();
let registration;
const publish = change => { snapshot = { ...snapshot, ...change }; for (const fn of listeners) fn(snapshot); };
export const offlineSnapshot = () => snapshot;
export function onOfflineChange(fn) { listeners.add(fn); fn(snapshot); return () => listeners.delete(fn); }
export function activateUpdate() {
  if (!registration?.waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
}
export async function registerOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { publish({ status: 'unsupported' }); return; }
  try {
    registration = await navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), { scope: './', updateViaCache: 'none' });
    const check = () => {
      publish({ update: !!registration.waiting && !!registration.active });
      const worker = registration.active;
      if (worker) {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => { publish({ status: event.data.ready ? 'ready' : 'error' }); channel.port1.close(); };
        worker.postMessage({ type: 'OFFLINE_STATUS' }, [channel.port2]);
      }
    };
    check();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'activated' || worker.state === 'installed') check();
        if (worker.state === 'redundant' && !registration.active) publish({ status: 'error' });
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', check);
    navigator.serviceWorker.ready.then(check);
    // Retry setup after an interrupted initial download, only while the app is open.
    window.addEventListener('online', () => registration.update().then(check).catch(() => {}));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  } catch { publish({ status: 'error' }); }
}
