import { sessionToken, sessionActive } from '../sync/session';
import type { Attachment } from '../domain/types';
import { attachmentsRepo } from '../db/attachmentsRepo';
import { downloadBlob, findFileByName, findFolder } from '../gateway/drive';

export async function loadAttachment(attachment: Attachment): Promise<Blob> {
  const token = sessionToken();
  const guard = () => { if (!sessionActive(token)) throw new DOMException('Session ended', 'AbortError'); };
  const lookup = async (name: string, folder: string) => { const result = await findFileByName(name, folder); guard(); return result; };
  const cached = await attachmentsRepo.get(attachment.id); guard();
  if (cached?.pending) return cached.blob;
  let fileId = attachment.driveFileId;
  if (!fileId) {
    const folder = await findFolder('Notes Backup (com.gcteam.tonote)');
    guard();
    if (!folder) throw new Error('Attachment folder not found');
    // Current names include the owner; historical Android backups use the bare UUID.
    const file = (attachment.noteId ? await lookup(`tonote.attach.${attachment.noteId}.${attachment.id}`, folder.id) : null)
      ?? await lookup(attachment.id, folder.id);
    if (!file) throw new Error('Attachment not found');
    fileId = file.id;
  }
  const blob = await downloadBlob(fileId); guard();
  return blob;
}
