import type { SyncGateway } from './gatewayTypes';
import { sendPending } from './engine';
import { syncStore } from '../state/syncStore';
import { PasswordSyncError } from './gatewayTypes';
import { syncEnabled } from './session';
import { accessStore } from '../state/accessStore';
import { DriveError } from '../gateway/drive';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleNoteSync(noteId: string, gateway: SyncGateway): void {
  cancelNoteSync(noteId);
  if (!syncEnabled() || accessStore.getState().mode !== 'readwrite') return;
  timers.set(noteId, setTimeout(() => {
    timers.delete(noteId);
    void syncNoteNow(noteId, gateway).catch(error => { reportSyncError(error); if (!(error instanceof PasswordSyncError)) window.dispatchEvent(new Event('tonote-local-change')); });
  }, 2000));
}
export function cancelNoteSync(id: string) { const timer = timers.get(id); if (timer) clearTimeout(timer); timers.delete(id); }
export function cancelAllNoteSync() { for (const id of timers.keys()) cancelNoteSync(id); }
export function syncNoteNow(id: string, gateway: SyncGateway) { return sendPending(gateway, id); }
export function reportSyncError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  // The auth store exposes the action to renew access; do not leave a raw 401
  // error behind after the user has successfully continued with Google.
  if (error instanceof DriveError && error.status === 401) return;
  if (error instanceof PasswordSyncError) syncStore.getState().setCryptoConflict({ remoteChecker: error.remoteChecker, remoteSalt: error.remoteSalt });
  else syncStore.getState().setError(error instanceof Error ? error.message : String(error));
}
