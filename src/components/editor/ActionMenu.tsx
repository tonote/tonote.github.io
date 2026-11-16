import { Icon } from '../Icon';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecryptedNotes } from '../../db/useDecrypted';
import { noteKind } from '../../domain/noteKind';
import type { Note, NoteKind } from '../../domain/types';

interface ActionMenuProps {
  note: Note;
  onKindChange: (kind: NoteKind) => void;
  onDelete: () => void;
  onArchive?: () => void;
  onMoveToFolder?: (folderId: string) => void;
}

export function ActionMenu({
  note,
  onKindChange,
  onDelete,
  onArchive,
  onMoveToFolder,
}: ActionMenuProps) {
  const { t } = useTranslation();
  const { notes } = useDecryptedNotes({});
  const [open, setOpen] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const kind = noteKind(note);

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMoveMode(false);
      }
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setMoveMode(false); menuRef.current?.querySelector<HTMLButtonElement>('.menu-toggle')?.focus(); } };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', escape); };
  }, [open]);

  const handleKindSwitch = (newKind: NoteKind) => {
    if (newKind === kind) return;
    onKindChange(newKind);
    setOpen(false);
  };

  const folders = notes.filter((n) => n.checkings === 'f' && n.state === 0);


  return (
    <div className="action-menu" ref={menuRef}>
      <button
        className="menu-toggle"
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={t('common.actions')}
        aria-expanded={open}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-dropdown">
          {/* Move to folder */}
          {onMoveToFolder && (
            <button
              onClick={() => setMoveMode(!moveMode)}
              type="button"
            >
              {t('notes.move')}
            </button>
          )}

          {moveMode && folders.length > 0 && (
            <div className="folder-move-list">
              {folders
                .filter((f) => f.id !== note.id)
                .map((f) => (
                  <button
                    key={f.id}
                    className="folder-move-btn"
                    onClick={() => {
                      onMoveToFolder?.(f.id);
                      setOpen(false);
                      setMoveMode(false);
                    }}
                    type="button"
                  >
                    <Icon name="folder" /> {f.title.trim() || '###'}
                  </button>
                ))}
              {folders.length === 0 && (
                <span className="no-folders">{t('notes.no_folders')}</span>
              )}
            </div>
          )}

          {/* Kind switch */}
          {kind !== 'folder' && <div className="kind-row">
            <button
              className={`kind-btn ${kind === 'plain' ? 'active' : ''}`}
              onClick={() => handleKindSwitch('plain')}
              type="button"
            >
              {t('notes.create_text')}
            </button>
            <button
              className={`kind-btn ${kind === 'rich' ? 'active' : ''}`}
              onClick={() => handleKindSwitch('rich')}
              type="button"
            >
              {t('notes.create_rich')}
            </button>
            <button
              className={`kind-btn ${kind === 'list' ? 'active' : ''}`}
              onClick={() => handleKindSwitch('list')}
              type="button"
            >
              {t('notes.create_checklist')}
            </button>
          </div>}

          <div className="menu-divider" />

          {kind !== 'folder' && onArchive && <button onClick={() => { onArchive(); setOpen(false); }} type="button">
            {t('notes.archive')}
          </button>}

          {/* Delete */}
          <button className="danger-btn" onClick={() => { onDelete(); setOpen(false); }} type="button">
            {t('notes.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
