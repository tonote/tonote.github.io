import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { PasswordField } from './PasswordField';
import { syncStore } from '../state/syncStore';
import { reconcilePasswords } from '../sync/passwordSync';
import { driveGateway } from '../sync/driveGateway';

export function SyncPasswordDialog() {
  const { t } = useTranslation();
  const conflict = syncStore(s => s.cryptoConflict);
  const [dismissed, setDismissed] = useState<object>();
  const [oldPassword, setOld] = useState(''), [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!conflict || dismissed === conflict) return null;
  const close = () => { if (!busy) { setDismissed(conflict); setOld(''); setNew(''); setError(''); } };
  return <Modal label={t('sync.password_title')} onClose={close}>
    <form onSubmit={e => {
      e.preventDefault(); setBusy(true); setError('');
      void reconcilePasswords(driveGateway.create(), oldPassword, newPassword).then(() => { setOld(''); setNew(''); }).catch(e => setError(String(e.message ?? e))).finally(() => setBusy(false));
    }}>
      <h2>{t('sync.password_title')}</h2><p>{t('sync.password_description')}</p>
      <PasswordField label={t('settings.old_password')} value={oldPassword} onChange={setOld} disabled={busy} />
      <PasswordField label={t('sync.drive_password')} value={newPassword} onChange={setNew} disabled={busy} />
      {error && <p role="alert" className="error-msg">{error}</p>}
      <div className="modal-actions"><button type="button" className="btn" onClick={close} disabled={busy}>{t('settings.cancel')}</button><button type="submit" className="btn btn-primary" disabled={busy || !newPassword}>{t('sync.reconcile')}</button></div>
    </form>
  </Modal>;
}
