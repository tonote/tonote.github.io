import { DEFAULT_CATEGORY } from './color';
import type { Color, Note, NoteKind } from './types';

export function createNoteDraft(kind: NoteKind, parentId?: string, color: Color = DEFAULT_CATEGORY): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), created: now, edited: now,
    title: '', content: '', checkings: kind === 'folder' ? 'f' : kind === 'rich' ? 'h' : kind === 'list' ? '0' : '',
    color: { ...color },
    notify: false, showInWidget: false, pinned: false, state: 0,
    events: [], attachments: [], priority: 0,
    ...(parentId ? { parentId } : {}),
  };
}

export function hasNoteContent(note: Note): boolean {
  if (note.title.trim() || note.attachments.length || note.events.some(event => typeof event.when === 'number' && Number.isFinite(event.when))) return true;
  if (note.checkings === 'f') return false;
  const text = note.checkings.startsWith('h')
    ? new DOMParser().parseFromString(note.content, 'text/html').body.textContent ?? ''
    : note.content;
  return text.trim().length > 0;
}
