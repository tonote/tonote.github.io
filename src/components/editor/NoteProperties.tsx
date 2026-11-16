import { noteKind } from '../../domain/noteKind';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../db/useColors';
import type { Color, Note } from '../../domain/types';
import { categoryColorToCss } from '../../domain/color';
import { Icon } from '../Icon';
import { Modal } from '../Modal';

export function NoteProperties({ note, disabled, onColorChange, onPinToggle, onEncryptToggle }: {
  note: Note;
  disabled: boolean;
  onColorChange: (color: Color) => void;
  onPinToggle: () => void;
  onEncryptToggle: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useColors();
  const [open, setOpen] = useState(false);
  const category = colors.find(color => color.id === note.color.id) ?? note.color;
  const choices = colors.some(color => color.id === note.color.id) ? colors : [note.color, ...colors];
  return <div className="note-properties">
    <button className="note-category-btn" type="button" disabled={disabled} onClick={() => setOpen(true)} aria-label={`${t('colors.title')}: ${category.theme.trim() || '###'}`}>
      <span className="color-dot" style={{ background: categoryColorToCss(category.value) }} />
      <span>{category.theme.trim() || '###'}</span>
    </button>
    {noteKind(note) !== 'folder' && <button className="icon-btn" type="button" disabled={disabled} aria-pressed={!!note.iv} aria-label={t(note.iv ? 'notes.decrypt' : 'notes.encrypt')} title={t(note.iv ? 'notes.decrypt' : 'notes.encrypt')} onClick={onEncryptToggle}>
      <Icon name={note.iv ? 'lock' : 'lockOpen'} />
    </button>}
    <button className="icon-btn" type="button" disabled={disabled} aria-pressed={note.pinned} aria-label={t(note.pinned ? 'notes.unpin' : 'notes.pin')} title={t(note.pinned ? 'notes.unpin' : 'notes.pin')} onClick={onPinToggle}>
      <Icon name={note.pinned ? 'pin' : 'pinOutline'} />
    </button>
    {open && <Modal label={t('colors.title')} onClose={() => setOpen(false)}>
      <h2>{t('colors.title')}</h2>
      <div className="category-choices">
        {choices.map(color => <button className="note-category-btn" key={color.id} type="button" aria-pressed={note.color.id === color.id} disabled={disabled} onClick={() => { onColorChange(color); setOpen(false); }}>
          <span className="color-dot" style={{ background: categoryColorToCss(color.value) }} />
          <span>{color.theme.trim() || '###'}</span>
        </button>)}
      </div>
      <div className="modal-actions"><button className="btn" type="button" onClick={() => setOpen(false)}>{t('common.close')}</button></div>
    </Modal>}
  </div>;
}
