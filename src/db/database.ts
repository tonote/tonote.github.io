import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { SyncRecord, CleanupTask } from '../sync/types';
import type { Note, Color } from '../domain/types.js';

export interface IndexMeta {
  key: 'current';
  id?: string; // local metadata identifier
  updated?: number; // epoch ms
  schemaVersion?: number;
  checker?: string; // base64 (omitted when no encryption)
  salt?: string; // base64
}

export interface OutboxEntry {
  seq?: number;
  noteId: string;
  op: 'upsert' | 'delete';
  queuedAt: number;
}

export interface KvEntry {
  key: string;
  value: unknown;
}

export type Settings = {
  key: string;
  theme: 'light' | 'dark';
  layout: 'grid' | 'list';
  sortOrder: 'modified' | 'created' | 'priority';
  defaultKind: 'plain' | 'rich' | 'list';
  lastFolderId?: string;
};

export class TonoteDB extends Dexie {
  notes!: Table<Note, string>;
  colors!: Table<Color, string>;
  indexMeta!: Table<IndexMeta, string>;
  outbox!: Table<OutboxEntry, number>;
  settings!: Table<Settings, string>;
  kv!: Table<KvEntry, string>;

  syncRecords!: Table<SyncRecord, string>;
  cleanup!: Table<CleanupTask, string>;
  backupNotes!: Table<Note, string>;
  backupColors!: Table<Color, string>;

  constructor(name = 'tonote') {
    super(name);
    this.version(1).stores({
      notes: 'id, edited, state, parentId, pinned',
      colors: 'id, priority',
      indexMeta: 'key',
      outbox: '++seq, noteId, op, queuedAt',
      settings: 'key',
      kv: 'key',
    });
    this.version(2).stores({ syncRecords: 'id', cleanup: 'id, noteId' });
    this.version(3).stores({}).upgrade(async tx => {
      // Web only keeps bytes of new attachments awaiting upload. Old downloaded
      // or already uploaded copies can be fetched on demand from Drive.
      await tx.table<KvEntry, string>('kv').where('key').startsWith('attachment:')
        .filter(entry => (entry.value as { pending?: boolean } | null)?.pending !== true).delete();
    });
    this.version(4).stores({ backupNotes: 'id, edited, state, parentId, pinned', backupColors: 'id, priority' });
  }
}

export let db = new TonoteDB();

/** Call before mounting account UI; each account owns its queue, files and cache. */
export async function activateAccount(accountId: string): Promise<void> {
  const name = `tonote-account-${encodeURIComponent(accountId)}`;
  if (db.name === name) return;
  const previous = db;
  db = new TonoteDB(name);
  await db.open();
  previous.close();
}
