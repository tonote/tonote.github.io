export const DRIVE_FOLDER_NAME = 'Notes Backup (com.gcteam.tonote)';
export const CONFIG_FILE_NAME = 'tonote.sync.json';
export const noteFileName = (id: string) => `tonote.note.${id}.json`;
export const LEGACY_BACKUP_FILE = 'notes_backup.json';
export const SCHEMA_VERSION = 3;
export const TRASH_DAYS = 15;
export const DAY_MS = 86400000;
export const attachmentFileName = (noteId: string, attachmentId: string) => `tonote.attach.${noteId}.${attachmentId}`;
export const ATTACHMENT_MAINTENANCE_BATCH_SIZE = 20;
