import { db } from './database';
import { NOTE_STATE } from '../domain/types';
import { computeCascade, listDescendantIds } from '../domain/folders';
import { queueNote, marker, scheduleCleanup } from '../sync/local';
import { DAY_MS, TRASH_DAYS } from '../sync/constants';
import { assertWritable } from '../state/accessStore';

export async function changeNoteState(id: string, action: 'restore' | 'trash' | 'purge'): Promise<string[]> {
  assertWritable();
  return db.transaction('rw', db.notes, db.outbox, db.syncRecords, db.cleanup, db.kv, async () => {
    assertWritable();
    const all = await db.notes.toArray();
    const note = all.find(item => item.id === id);
    if (!note) return [];
    const now = Date.now();
    const config = (await db.kv.get('sync-config'))?.value as { trashRetentionDays?: number } | undefined;
    const retention = (config?.trashRetentionDays ?? TRASH_DAYS) * DAY_MS;
    if (action === 'purge' || (action === 'trash' && note.iv)) {
      if (action === 'purge' && note.state !== NOTE_STATE.REMOVED && note.state !== NOTE_STATE.PARENT_REMOVED) throw new Error('Only trash can be permanently deleted');
      const ids = [id, ...listDescendantIds(id, all)];
      for (const noteId of ids) {
        const item = all.find(n => n.id === noteId)!;
        const deleted = marker({ ...item, trashedAt: now, purgeAfter: now + retention }, now);
        await scheduleCleanup(item, deleted);
        await queueNote(deleted);
        if (item.iv) for (const attachment of item.attachments) await db.kv.delete(`attachment:${attachment.id}`);
      }
      return ids;
    }
    const state = action === 'restore' ? NOTE_STATE.NONE : NOTE_STATE.REMOVED;
    const changes = computeCascade(id, state, all);
    const changed = all.filter(item => item.id === id || changes.has(item.id));
    for (const item of changed) {
      const updated = { ...item, state: item.id === id ? state : changes.get(item.id)! as typeof item.state, edited: now };
      if (action === 'trash') { updated.trashedAt = now; updated.purgeAfter = now + retention; }
      else { delete updated.trashedAt; delete updated.purgeAfter; }
      if (item.id === id && action === 'restore' && item.parentId) {
        const parent = all.find(candidate => candidate.id === item.parentId);
        if (!parent || parent.state !== NOTE_STATE.NONE) delete updated.parentId;
      }
      await queueNote(updated);
    }
    return changed.map(item => item.id);
  });
}
