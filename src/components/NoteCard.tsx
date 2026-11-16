import { HighlightedText } from './HighlightedText';
import { NoteDates } from './NoteDates';
import { searchExcerpt } from '../domain/findMatches';
import { stripHtml } from '../domain/search';
import { Icon } from './Icon';
import type { CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categoryColorToCss, categoryTextToCss } from '../domain/color';
import { noteKind } from '../domain/noteKind';
import { cryptoStore } from '../state/cryptoStore';
import { readChecklist } from '../domain/checkings';
import { SafeHtml } from './SafeHtml';
import type { Note } from '../domain/types';

interface NoteCardProps {
  note: Note;
  query?: string;
}

export function NoteCard({ note, query = '' }: NoteCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const unlocked = cryptoStore((s) => s.unlocked);
  const encryptionSalt = cryptoStore((s) => s.salt);
  const kind = noteKind(note);
  const category = note.color;

  const isEncrypted = !!note.iv;
  const isLocked = isEncrypted && (!unlocked || (!!note.encryptionSalt && note.encryptionSalt !== encryptionSalt));
  const items = kind === 'list' && !isLocked ? readChecklist(note.content, note.checkings) : [];
  const checked = items.filter((item) => item.state === 1).length;

  const handleCardClick = () => {
    const path = kind === 'folder' && note.state === 0 && !isLocked && !query ? `/folder/${note.id}` : `/note/${note.id}`;
    navigate(query ? `${path}?${new URLSearchParams({ q: query })}` : path, { state: { returnTo: location.pathname + location.search } });
  };

  const renderPreview = () => {
    if (isLocked) return null; // title shows "🔒 Locked"

    if (query.trim()) {
      const text = kind === 'rich' ? stripHtml(note.content) : note.content;
      return <p className="card-preview"><HighlightedText text={searchExcerpt(text, query)} query={query} /></p>;
    }
    switch (kind) {
      case 'plain':
        return <p className="card-preview">{note.content}</p>;
      case 'rich':
        return (
          <div className="card-preview">
            <SafeHtml html={note.content} />
          </div>
        );
      case 'list': {
        return <ul className="card-checklist">{items.slice(0, 6).map((item, i) => <li key={i} className={item.state === 1 ? 'checked' : ''}>{item.state !== 2 && <Icon name={item.state === 1 ? 'check' : 'unchecked'} />}<span>{item.text}</span></li>)}</ul>;
      }
      case 'folder':
        return null;
    }
  };

  const title = isLocked
    ? t('notes.locked')
    : note.title;

  const edited = new Date(note.edited);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const editedLabel = edited.toDateString() === now.toDateString()
    ? t('notes.today')
    : edited.toDateString() === yesterday.toDateString()
      ? t('notes.yesterday')
      : edited.toLocaleDateString(i18n?.resolvedLanguage, {
        day: 'numeric', month: 'short',
        ...(edited.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
      });

  const value = category.value >>> 0;
  const style: CSSProperties = (value >>> 24) === 255
    ? { background: categoryColorToCss(value), color: categoryTextToCss(value) } : {};

  return (
    <div className="note-card" style={style} onClick={handleCardClick} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleCardClick(); } }} role="button" tabIndex={0}>
      <div
        className="color-stripe"
        style={{ background: categoryColorToCss(category.value) }}
      />
      <div className="card-body">
        {(title || kind === 'folder' || isLocked) && <h3 className="card-title"><span><HighlightedText text={title || '###'} query={query} /></span></h3>}
        {renderPreview()}
      </div>
      <NoteDates events={note.events} />
      <div className="card-footer">
        <span className="card-metadata">
          <time dateTime={edited.toISOString()} title={edited.toLocaleString(i18n?.resolvedLanguage)}>{editedLabel}</time>
          <span className="card-category">{category.theme.trim() || '###'}</span>
        </span>
        {kind === 'list' && !isLocked && <span className="checklist-summary">{checked}/{items.filter((item) => item.state !== 2).length}</span>}
        <span className="card-icons">
          {note.attachments.length > 0 && <span aria-label={t('notes.attachments')}><Icon name="attachment" /></span>}
          {note.pinned && <span aria-label={t('notes.pin')}><Icon name="pin" /></span>}
          {isEncrypted && <span aria-label={t('nav.secured')}><Icon name="lock" /></span>}
          {kind === 'folder' && <span aria-label={t('notes.create_folder')}><Icon name="folder" /></span>}
        </span>
      </div>
    </div>
  );
}
