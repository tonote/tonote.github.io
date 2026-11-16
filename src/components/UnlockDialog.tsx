import { Modal } from './Modal';
import { PasswordField } from './PasswordField';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cryptoStore } from '../state/cryptoStore';
import { syncStore } from '../state/syncStore';

interface UnlockDialogProps {
  open: boolean;
  onClose: () => void;
  /** If true, show crypto-conflict resolution options */
  cryptoConflictMode?: boolean;
}

export function UnlockDialog({ open, onClose, cryptoConflictMode }: UnlockDialogProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cryptoConflict = syncStore((s) => s.cryptoConflict);
  const showConflict = cryptoConflictMode ?? !!cryptoConflict;

  const handleSubmit = useCallback(async () => {
    if (!password.trim()) return;
    setBusy(true);
    setError('');

    try {
      const ok = await cryptoStore.getState().unlock(password);
      if (ok) {
        setPassword('');
        setError('');
        onClose();
      } else {
        setError(t('unlock.wrong_password'));
      }
    } catch {
      setError(t('unlock.error'));
    } finally {
      setBusy(false);
    }
  }, [password, onClose, t]);

  const dismiss = () => { if (busy) return; setPassword(''); setError(''); onClose(); };

  if (!open) return null;

  return (
    <Modal label={t('unlock.title')} onClose={dismiss}>
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) void handleSubmit(); }}>
        <h2>{t('unlock.title')}</h2>

        {showConflict && (
          <div className="crypto-conflict-info">
            <p>{t('unlock.crypto_conflict')}</p>
          </div>
        )}

        <PasswordField label={t('unlock.password')} value={password} onChange={setPassword} disabled={busy} />

        {error && <div className="error-msg" role="alert">{error}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={dismiss} disabled={busy} type="button">{t('unlock.cancel')}</button>
          <button className="btn btn-primary" disabled={busy || !password.trim()} type="submit">
            {busy ? '...' : t('unlock.submit')}
          </button>

        </div>

      </form>
    </Modal>
  );
}
