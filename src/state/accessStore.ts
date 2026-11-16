import { create } from 'zustand';
import { db } from '../db/database';
import { sessionActive, sessionToken } from '../sync/session';

export type AccessMode = 'checking' | 'readonly' | 'readwrite';
export const accessStore = create<{ mode: AccessMode }>(() => ({ mode: 'checking' }));
export const useReadOnly = () => accessStore(state => state.mode !== 'readwrite');
export class ReadOnlyError extends Error {
  constructor() { super('This backup is read-only. Enable synchronization in the Android app to edit notes.'); this.name = 'ReadOnlyError'; }
}
export function assertWritable() { if (accessStore.getState().mode !== 'readwrite') throw new ReadOnlyError(); }
export async function selectAccessMode(mode: Exclude<AccessMode, 'checking'>, check: () => void = () => {}) {
  const token = sessionToken();
  await db.transaction('rw', db.kv, async () => {
    check();
    await db.kv.put({ key: 'access-mode', value: mode });
    check();
  });
  if (sessionActive(token)) { check(); accessStore.setState({ mode }); }
}
export async function restoreAccessMode() {
  const token = sessionToken();
  const mode = (await db.kv.get('access-mode'))?.value;
  if (sessionActive(token)) accessStore.setState({ mode: mode === 'readonly' || mode === 'readwrite' ? mode : 'checking' });
}
