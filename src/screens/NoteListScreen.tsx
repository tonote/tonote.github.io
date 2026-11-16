import { useColors } from '../db/useColors';
import { categoryColorToCss } from '../domain/color';
import { NOTE_STATE } from '../domain/types';
import { Icon } from '../components/Icon';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Fragment } from 'react';
import { useDecryptedNotes } from '../db/useDecrypted';
import { navStore } from '../state/navStore';
import { settingsStore } from '../state/settingsStore';
import { NoteGrid } from '../components/NoteGrid';
import { CreateFAB } from '../components/CreateFAB';
import { buildBreadcrumb } from '../domain/breadcrumb';

interface NoteListScreenProps {
  folderId?: string | null;
  noteState?: number;
  colorId?: string;
}

export function NoteListScreen({ folderId, noteState, colorId }: NoteListScreenProps) {
  const { t } = useTranslation();
  const layout = settingsStore((s) => s.layout);
  const navigate = useNavigate();

  const storedFolderId = navStore((s) => s.currentFolderId);
  const currentFolderId = colorId ? null : folderId ?? storedFolderId;
  const sortOrder = settingsStore((s) => s.sortOrder);

  // Get notes for the current view
  const parentId = noteState !== undefined || colorId ? undefined : currentFolderId ?? null;
  const stateFilter = noteState ?? NOTE_STATE.NONE;
  const { notes, loading } = useDecryptedNotes({
    parentId,
    state: stateFilter,
    colorId,
    sort: sortOrder,
  });

  const { colors, loading: colorsLoading } = useColors();

  // For breadcrumb, we need all notes to build the chain
  const { notes: allNotes } = useDecryptedNotes();

  // Build breadcrumb for folder navigation
  const breadcrumb = noteState === undefined && !colorId
    ? buildBreadcrumb(currentFolderId, allNotes)
    : [];

  if (loading || colorsLoading) {
    return <div className="note-list-empty">{t('auth.loading')}</div>;
  }

  return (
    <div className="note-list">
      {breadcrumb.length > 0 && (
        <div className="breadcrumb">
          <a href="#/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            {t('nav.all_notes')}
          </a>
          {breadcrumb.map((crumb) => (
            <Fragment key={crumb.id}>
              <span> / </span>
              <a
                href={`#/folder/${crumb.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/folder/${crumb.id}`);
                }}
              >
                <span className="breadcrumb-color" aria-hidden="true" style={{ background: categoryColorToCss((colors.find(color => color.id === crumb.color.id) ?? crumb.color).value) }} />
                {crumb.title.trim() || '###'}
              </a>
            </Fragment>
          ))}
          <button className="icon-btn breadcrumb-edit" type="button" aria-label={t('common.edit_folder')} onClick={() => navigate(`/note/${currentFolderId}`)}><Icon name="edit" /></button>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="note-list-empty">{t('notes.empty')}</div>
      ) : (
        <NoteGrid notes={notes} layout={layout} />
      )}

      {noteState === undefined && <CreateFAB folderId={currentFolderId} colorId={colorId} />}
    </div>
  );
}
