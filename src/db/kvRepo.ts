import { db } from './database.js';

export const kvRepo = {
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const entry = await db.kv.get(key);
    if (entry === undefined) return defaultValue;
    return entry.value as T;
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.kv.put({ key, value });
  },

  async remove(key: string): Promise<void> {
    await db.kv.delete(key);
  },
};
