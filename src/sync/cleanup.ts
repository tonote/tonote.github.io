import { db } from '../db/database';
import type { SyncGateway } from './gatewayTypes';

/** Only a complete, successful active refresh may migrate or collect files.
 * The folder catalogue and accepted documents survive deleted note content. */
export async function cleanupPublished(gw: SyncGateway, folder: string, check: () => void): Promise<void> {
  check();
  const records = await db.syncRecords.toArray();
  const published = records.filter(record => record.remote && record.accepted).map(record => record.accepted!);
  const tasks = await db.cleanup.toArray(); check();
  const collected = new Set(await gw.maintainAttachments(folder, published, tasks)); check();
  await db.transaction('rw', db.cleanup, async () => {
    check();
    for (const task of tasks) if (collected.has(task.attachmentId)) await db.cleanup.delete(task.id);
  });
}
