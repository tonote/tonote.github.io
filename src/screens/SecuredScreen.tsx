import { NOTE_STATE } from '../domain/types';
import { settingsStore } from '../state/settingsStore';
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecryptedNotes } from '../db/useDecrypted';
import { cryptoStore } from '../state/cryptoStore';
import { NoteGrid } from '../components/NoteGrid';
import { UnlockDialog } from '../components/UnlockDialog';

/**
 * SecuredScreen shows encrypted notes. If not unlocked, shows UnlockDialog.
 * Once unlocked, filters notes to show only those with `iv` set (encrypted).
 */
export function SecuredScreen() {
  const { t } = useTranslation();
  const layout = settingsStore((s) => s.layout);
  const unlocked = cryptoStore((s) => s.unlocked);
  const [showUnlock, setShowUnlock] = useState(!unlocked);

  const { notes, loading } = useDecryptedNotes({ state: NOTE_STATE.NONE });

  const encryptedNotes = useMemo(() => {
    if (!unlocked) return [];
    return notes.filter((n) => n.iv !== undefined);
  }, [notes, unlocked]);

  const handleUnlockClose = useCallback(() => {
    // Check if actually unlocked after dialog closes
    const isUnlocked = cryptoStore.getState().unlocked;
    if (isUnlocked) {
      setShowUnlock(false);
    }
    // If still not unlocked, keep showing (or dismiss — user chose cancel)
    setShowUnlock(false);
  }, []);

  if (loading) {
    return <div className="note-list-empty">{t('auth.loading')}</div>;
  }

  return (
    <div className="note-list">
      {!unlocked && (
        <div className="note-list-empty"><p>{t('secured.unlock_required')}</p><button className="btn btn-primary" onClick={() => setShowUnlock(true)}>{t('notes.unlock')}</button></div>
      )}

      {unlocked && encryptedNotes.length === 0 && (
        <div className="note-list-empty">{t('secured.no_encrypted')}</div>
      )}

      {unlocked && encryptedNotes.length > 0 && (
        <>
          <div className={`search-header ${layout === 'list' ? 'note-content-list' : ''}`}>
            {t('secured.encrypted_notes_count', { count: encryptedNotes.length })}
          </div>
          <NoteGrid notes={encryptedNotes} layout={layout} />
        </>
      )}

      <UnlockDialog open={showUnlock} onClose={handleUnlockClose} />
    </div>
  );
}
