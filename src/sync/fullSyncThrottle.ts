import { db } from '../db/database';

const INTERVAL_MS = 5000;
const STARTED_AT_KEY = 'full-sync-started-at';

/** Persist the slot before any Drive requests; an RW transaction also covers other tabs. */
export async function tryBeginFullSync(canStart: () => boolean): Promise<boolean> {
  if (!canStart()) return false;
  const database = db;
  return database.transaction('rw', database.kv, async () => {
    const previous = (await database.kv.get(STARTED_AT_KEY))?.value;
    if (!canStart()) return false;
    const now = Date.now();
    if (typeof previous === 'number' && Number.isFinite(previous) && previous <= now && now - previous < INTERVAL_MS) return false;
    await database.kv.put({ key: STARTED_AT_KEY, value: now });
    return true;
  });
}
