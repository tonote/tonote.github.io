import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '../../domain/types';
import { loadAttachment } from '../../attachments/loadAttachment';
import { Icon } from '../Icon';
import { Modal } from '../Modal';

function AttachmentPreview({ attachment, localFile, onClose }: { attachment: Attachment; localFile?: File; onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');
    setError(false);
    void (localFile ? Promise.resolve(localFile) : loadAttachment(attachment)).then(blob => {
      if (!active) return;
      // Downloads are always inert; previews only use image/audio elements.
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment, localFile, attempt]);
  const name = attachment.name || attachment.id;
  return <Modal label={name} onClose={onClose}>
    <h2 className="attachment-name">{name}</h2>
    {!url && !error && <p role="status">{t('attachments.loading')}</p>}
    {error && <p role="alert">{t('attachments.load_failed')}</p>}
    {url && attachment.type === 0 && <img className="attachment-image" src={url} alt={name} onError={() => setError(true)} />}
    {url && attachment.type === 2 && <audio className="attachment-audio" controls src={url} onError={() => setError(true)} />}
    <div className="modal-actions">
      {error && <button className="btn" type="button" onClick={() => setAttempt(value => value + 1)}>{t('attachments.retry')}</button>}
      {url && <a className="btn" href={url} download={name}>{t('attachments.download')}</a>}
      <button className="btn" type="button" onClick={onClose}>{t('common.close')}</button>
    </div>
  </Modal>;
}

export function Attachments({ attachments, files, encrypted, readOnly = false, onAdd, onRemove }: {
  attachments: Attachment[];
  files: Map<string, File>;
  encrypted?: boolean;
  readOnly?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const attachment = attachments.find(item => item.id === selected);
  return <section className="editor-attachments" aria-label={t('attachments.title')}>
    <div className="attachments-heading">
      <h2>{t('attachments.title')}</h2>
      {!readOnly && <><button className="btn" type="button" onClick={() => input.current?.click()}><Icon name="attachment" />{t('attachments.add')}</button>
      <input ref={input} type="file" multiple hidden aria-label={t('attachments.add')} onChange={event => {
        onAdd(Array.from(event.target.files ?? []));
        event.target.value = '';
      }} /></>}
    </div>
    {encrypted && <p className="attachment-notice">{t('attachments.encryption_notice')}</p>}
    {attachments.length > 0 && <ul className="attachments-list">
      {attachments.map(item => <li key={item.id}>
        <button className="attachment-open" type="button" onClick={() => setSelected(item.id)}><Icon name="attachment" /><span className="attachment-name">{item.name || item.id}</span></button>
        {!readOnly && <button className="icon-btn" type="button" aria-label={t('attachments.remove', { name: item.name || item.id })} onClick={() => onRemove(item.id)}><Icon name="close" /></button>}
      </li>)}
    </ul>}
    {attachment && <AttachmentPreview attachment={attachment} localFile={files.get(attachment.id)} onClose={() => setSelected(null)} />}
  </section>;
}
