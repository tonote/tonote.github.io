import { create } from 'zustand';
import { liveQuery } from 'dexie';
import type { Subscription } from 'dexie';
import { db } from '../db/database.js';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'crypto-conflict';

export interface SyncProgress {
  phase: 'checking' | 'migration' | 'loading' | 'notes' | 'saving';
  completed?: number;
  total?: number;
}

interface CryptoConflictInfo {
  remoteChecker: string;
  remoteSalt: string;
}

interface SyncStore {
  progress: SyncProgress | null;
  setProgress: (progress: SyncProgress | null) => void;
  status: SyncStatus;
  lastSyncAt: number | null;
  pending: number;
  lastError: string | null;
  cryptoConflict?: CryptoConflictInfo;
  setStatus: (s: SyncStatus) => void;
  setPending: (n: number) => void;
  setError: (msg: string | null) => void;
  markSynced: () => void;
  setCryptoConflict: (params: CryptoConflictInfo) => void;
  clearCryptoConflict: () => void;
}

export const syncStore = create<SyncStore>((set) => ({
  progress: null,
  setProgress: (progress) => set({ progress }),
  status: 'idle',
  lastSyncAt: null,
  pending: 0,
  lastError: null,
  cryptoConflict: undefined,

  setStatus: (s) => set({ status: s }),
  setPending: (n) => set({ pending: n }),
  setError: (msg) => {
    if (msg) {
      set({ status: 'error', lastError: msg });
    } else {
      set({ lastError: null });
    }
  },
  markSynced: () => set({ status: 'idle', lastSyncAt: Date.now(), lastError: null }),
  setCryptoConflict: (params) => set({ status: 'crypto-conflict', cryptoConflict: params }),
  clearCryptoConflict: () => set({ cryptoConflict: undefined, status: 'idle' }),
}));

let _subscription: Subscription | null = null;
let _databaseName: string | undefined;

export function initSyncStore(): void {
  if (_subscription && _databaseName === db.name) return;
  _subscription?.unsubscribe();
  _databaseName = db.name;
  const obs = liveQuery(() => db.outbox.count());
  _subscription = obs.subscribe({
    next(count) {
      syncStore.getState().setPending(count);
    },
  });
}
