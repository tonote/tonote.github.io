import { db } from './database.js';
import type { OutboxEntry } from './database.js';

export const outboxRepo = {
  async enqueue(entry: Omit<OutboxEntry, 'seq'>): Promise<OutboxEntry> {
    const seq = await db.outbox.add(entry as OutboxEntry);
    return { ...entry, seq: seq as number };
  },

  async all(): Promise<OutboxEntry[]> {
    return db.outbox.toArray();
  },

  async remove(seq: number): Promise<void> {
    await db.outbox.delete(seq);
  },

  async clear(): Promise<void> {
    await db.outbox.clear();
  },
};
