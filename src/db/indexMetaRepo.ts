import { db } from './database.js';
import type { IndexMeta } from './database.js';
import { normalizeEncodedBytes } from '../crypto/aes.js';
import { accessStore } from '../state/accessStore';

export const indexMetaRepo = {
  async forDisplay(): Promise<IndexMeta | undefined> {
    if (accessStore.getState().mode === 'readwrite') return indexMetaRepo.get();
    const keys = (await db.kv.get('backup-keys'))?.value as { salt: string; checker: string } | null | undefined;
    return keys ? { key: 'current', ...keys } : undefined;
  },
  async get(): Promise<IndexMeta | undefined> {
    const meta = await db.indexMeta.get('current');
    if (meta?.checker) meta.checker = normalizeEncodedBytes(meta.checker);
    if (meta?.salt) meta.salt = normalizeEncodedBytes(meta.salt);
    return meta;
  },

  async set(meta: IndexMeta): Promise<void> {
    await db.indexMeta.put(meta);
  },
};
