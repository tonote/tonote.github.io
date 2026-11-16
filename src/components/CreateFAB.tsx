import { Icon } from './Icon';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { navStore } from '../state/navStore';
import { useReadOnly } from '../state/accessStore';
export function CreateFAB({ folderId, colorId }: { folderId?: string | null; colorId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const storedFolderId = navStore((s) => s.currentFolderId);
  const currentFolderId = folderId === undefined ? storedFolderId : folderId;

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>('.fab-btn')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const createNote = useCallback(
    (menuKey: string) => {
      if (readOnly) return;
      const kinds: Record<string, string> = { text: 'plain', checklist: 'list', rich: 'rich', folder: 'folder' };
      const params = new URLSearchParams({ kind: kinds[menuKey] ?? 'plain' });
      if (colorId) params.set('color', colorId);
      if (currentFolderId) params.set('parent', currentFolderId);
      navigate(`/note/new?${params}`);
      setOpen(false);
    },
    [currentFolderId, colorId, navigate, readOnly],
  );

  if (readOnly) return null;
  return (
    <div className="create-fab" ref={rootRef}>
      {open && (
        <div className="fab-menu">
          <button onClick={() => createNote('text')}>
            <Icon name="text" />{t('notes.create_text')}
          </button>
          <button onClick={() => createNote('checklist')}>
            <Icon name="list" />{t('notes.create_checklist')}
          </button>
          <button onClick={() => createNote('rich')}>
            <Icon name="edit" />{t('notes.create_rich')}
          </button>
          <button onClick={() => createNote('folder')}>
            <Icon name="folder" />{t('notes.create_folder')}
          </button>
        </div>
      )}
      <button
        className="fab-btn"
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={t('notes.new_note')}
        aria-expanded={open}
      >
        <Icon name={open ? 'close' : 'add'} />
      </button>
    </div>
  );
}
