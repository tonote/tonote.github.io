import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Note } from '../../domain/types';
import { downloadFile, exportFile, formats, type ExportFormat } from '../../export/files';
import { Modal } from '../Modal';

export function ExportDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function download() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const file = await exportFile(note, format, t, i18n.resolvedLanguage ?? i18n.language);
      if (!active.current) return;
      downloadFile(file, note.title, format, t('export.untitled'));
      onClose();
    } catch {
      if (active.current) { setFailed(true); setBusy(false); }
    }
  }

  return <Modal label={t('export.title')} onClose={onClose}>
    <form className="event-form" onSubmit={event => { event.preventDefault(); void download(); }}>
      <h2>{t('export.title')}</h2>
      <label>{t('export.format')}
        <select value={format} disabled={busy} onChange={event => setFormat(event.target.value as ExportFormat)}>
          {formats.map(value => <option key={value} value={value}>{value === 'md' ? 'Markdown' : value.toUpperCase()}</option>)}
        </select>
      </label>
      {note.iv && <p>{t('export.unencrypted')}</p>}
      {failed && <p className="error-msg" role="alert">{t('export.failed')}</p>}
      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose}>{t('settings.cancel')}</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>{t(busy ? 'export.preparing' : 'attachments.download')}</button>
      </div>
    </form>
  </Modal>;
}
