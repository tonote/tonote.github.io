import { fullSync, sendPending } from '../sync/engine';
import { driveGateway } from '../sync/driveGateway';
import { syncStore, initSyncStore } from './syncStore';
import { reportSyncError, cancelAllNoteSync } from '../sync/editSync';
import { syncEnabled, sessionToken, sessionActive } from '../sync/session';
import { accessStore } from './accessStore';
import { tryBeginFullSync } from '../sync/fullSyncThrottle';

let inFlight: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let retryCount = 0;
let refreshAllowed = () => true;
export function syncNow({ allowHidden = false }: { allowHidden?: boolean } = {}): Promise<void> {
  const canRefresh = refreshAllowed;
  if (!canRefresh()) return Promise.resolve();
  if (inFlight) return inFlight;
  if (!syncEnabled() || (!allowHidden && document.visibilityState === 'hidden')) return Promise.resolve();
  const token = sessionToken();
  const task = (async () => {
    if (!navigator.onLine) { syncStore.getState().setStatus('offline'); return; }
    const canStart = () => sessionActive(token) && syncEnabled() && canRefresh() && navigator.onLine && (allowHidden || document.visibilityState !== 'hidden');
    try {
      if (!await tryBeginFullSync(canStart) || !canStart()) return;
    } catch (error) { if (sessionActive(token)) reportSyncError(error); return; }
    const previousStatus = syncStore.getState().status;
    syncStore.getState().setStatus('syncing');
    try {
      const result = await fullSync(driveGateway.create(), progress => { if (sessionActive(token)) syncStore.getState().setProgress(progress); }, { canRefresh });
      if (!sessionActive(token)) return;
      if (!result.deferred) syncStore.getState().markSynced();
      else syncStore.getState().setError('Some local changes still need synchronization');
    } catch (error) {
      if (sessionActive(token)) {
        if (error instanceof DOMException && error.name === 'AbortError') syncStore.getState().setStatus(previousStatus);
        else reportSyncError(error);
      }
    }
    finally { if (sessionActive(token)) syncStore.getState().setProgress(null); }
  })().finally(() => { if (inFlight === task) inFlight = null; });
  inFlight = task;
  return task;
}
function scheduleSending(delay = 2000) {
  if (retry) clearTimeout(retry);
  if (!syncEnabled() || accessStore.getState().mode !== 'readwrite') return;
  retry = setTimeout(() => {
    retry = undefined;
    if (!navigator.onLine || !syncEnabled()) return;
    const token = sessionToken();
    void sendPending(driveGateway.create()).then(() => {
      if (!sessionActive(token)) return;
      retryCount = 0;
    }).catch(error => {
      if (!sessionActive(token)) return;
      reportSyncError(error);
      if (error?.name === 'PasswordSyncError' || error?.name === 'AbortError') return;
      // Bound retries; no background polling/download of the catalog.
      if (retryCount++ < 5) scheduleSending(Math.min(64000, 1000 * 2 ** retryCount) + Math.random() * 1000);
    });
  }, delay);
}
export function pauseSyncWork() {
  inFlight = null;
  if (retry) clearTimeout(retry); retry = undefined; retryCount = 0; cancelAllNoteSync();
}
export function stopSyncWork() {
  refreshAllowed = () => true;
  pauseSyncWork();
}
export function initSyncTriggers(canRefresh: () => boolean = () => true): () => void {
  refreshAllowed = canRefresh;
  initSyncStore();
  // Loading a background tab still counts as opening the page. Returning to an
  // already loaded tab/app is deliberately not a refresh trigger.
  void syncNow({ allowHidden: true }); scheduleSending();
  const pageShown = (event: PageTransitionEvent) => { if (event.persisted) void syncNow({ allowHidden: true }); };
  const online = () => scheduleSending(0);
  const changed = () => scheduleSending();
  window.addEventListener('pageshow', pageShown);
  window.addEventListener('online', online);
  window.addEventListener('tonote-local-change', changed);
  return () => {
    window.removeEventListener('pageshow', pageShown);
    window.removeEventListener('online', online);
    window.removeEventListener('tonote-local-change', changed);
    stopSyncWork();
  };
}
