export const DRIVE_FOLDER_NAME = 'Notes Backup (com.gcteam.tonote)';
export const CONFIG_FILE_NAME = 'tonote.sync.json';
export const noteFileName = (id: string) => `tonote.note.${id}.json`;
export const attachmentFileName = (noteId: string, id: string) => `tonote.attach.${noteId}.${id}`;
export const LEGACY_BACKUP_FILE = 'notes_backup.json';
export const SCHEMA_VERSION = 3;
export const TRASH_DAYS = 15;
export const DAY_MS = 86400000;
