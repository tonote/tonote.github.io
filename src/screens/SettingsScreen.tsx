import { analyticsStore, setAnalyticsEnabled, track } from '../analytics';
import { Modal } from '../components/Modal';
import { PasswordField } from '../components/PasswordField';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsStore } from '../state/settingsStore';
import { useAuthStore } from '../state/authStore';
import { indexMetaRepo } from '../db/indexMetaRepo';
import { rotatePassword } from '../sync/passwordSync';
import { driveGateway } from '../sync/driveGateway';
import { cryptoStore } from '../state/cryptoStore';
import { syncNow } from '../state/syncTriggers';
import { useReadOnly } from '../state/accessStore';

export function SettingsScreen() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const analyticsEnabled = analyticsStore(s => s.enabled);
  const theme = settingsStore((s) => s.theme);
  const layout = settingsStore((s) => s.layout);
  const sortOrder = settingsStore((s) => s.sortOrder);
  const defaultKind = settingsStore((s) => s.defaultKind);
  const setTheme = settingsStore((s) => s.setTheme);
  const setLayout = settingsStore((s) => s.setLayout);
  const setSortOrder = settingsStore((s) => s.setSortOrder);
  const setDefaultKind = settingsStore((s) => s.setDefaultKind);
  const signOut = useAuthStore((s) => s.signOut);

  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [hasChecker, setHasChecker] = useState<boolean | null>(null);

  // Check if encryption is set up
  const checkEncryption = useCallback(async () => {
    const meta = await indexMetaRepo.get();
    setHasChecker(!!meta?.checker);
  }, []);

  // Run check on mount
  if (hasChecker === null) {
    void checkEncryption();
  }

  const handleChangePassword = useCallback(async () => {
    if (readOnly) return;
    if (!newPw || newPw !== confirmPw) { setPwError(t('unlock.wrong_password')); return; }
    setPwBusy(true); setPwError('');
    try {
      await rotatePassword(driveGateway.create(), oldPw, newPw);
      setPwDialogOpen(false); setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (error) { setPwError(error instanceof Error ? error.message : String(error)); }
    finally { setPwBusy(false); }
  }, [oldPw, newPw, confirmPw, t, readOnly]);

  const handleSetPassword = useCallback(async () => {
    if (readOnly) return;
    if (!newPw || newPw !== confirmPw) {
      setPwError(newPw !== confirmPw ? 'Passwords do not match' : 'Password cannot be empty');
      return;
    }

    setPwBusy(true);
    setPwError('');

    try {
      // First-time encryption setup: unlock() will derive and store checker+salt
      const ok = await cryptoStore.getState().unlock(newPw);
      if (!ok) {
        setPwError('Failed to derive encryption key');
        setPwBusy(false);
        return;
      }
      void syncNow();
      setHasChecker(true);
      setPwDialogOpen(false);
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      setPwError(e instanceof Error ? e.message : String(e));
    } finally {
      setPwBusy(false);
    }
  }, [newPw, confirmPw, readOnly]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <div className="settings-screen">
      <h2>{t('settings.title')}</h2>

      <section className="settings-section">
        <h3>{t('settings.appearance')}</h3>
        <div className="settings-row">
          <label>{t('settings.theme')}</label>
          <button className="btn" onClick={toggleTheme} type="button">
            {t(`settings.${theme}`)}
          </button>
        </div>
        <div className="settings-row">
          <label htmlFor="setting-layout">{t('settings.layout')}</label>
          <select
            id="setting-layout"
            value={layout}
            onChange={(e) => setLayout(e.target.value as 'grid' | 'list')}
          >
            <option value="grid">{t('settings.grid')}</option>
            <option value="list">{t('settings.list')}</option>
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="setting-sort_order">{t('settings.sort_order')}</label>
          <select
            id="setting-sort_order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'modified' | 'created')}
          >
            {sortOrder === 'priority' && <option value="priority">{t('settings.sort_priority')}</option>}
            <option value="created">{t('settings.sort_created')}</option>
            <option value="modified">{t('settings.sort_modified')}</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t('settings.notes')}</h3>
        <div className="settings-row">
          <label htmlFor="setting-default_kind">{t('settings.default_kind')}</label>
          <select
            id="setting-default_kind"
            value={defaultKind}
            onChange={(e) => setDefaultKind(e.target.value as 'plain' | 'rich' | 'list')}
          >
            <option value="plain">{t('notes.create_text')}</option>
            <option value="rich">{t('notes.create_rich')}</option>
            <option value="list">{t('notes.create_checklist')}</option>
          </select>
        </div>
      </section>

      {!readOnly && <section className="settings-section">
        <h3>{t('settings.encryption')}</h3>
        {hasChecker === true && (
          <div className="settings-row">
            <button
              className="btn"
              onClick={() => setPwDialogOpen(true)}
              type="button"
            >
              {t('settings.change_password')}
            </button>
          </div>
        )}
        {hasChecker === false && (
          <div className="settings-row">
            <button
              className="btn"
              onClick={() => setPwDialogOpen(true)}
              type="button"
            >
              {t('settings.set_password')}
            </button>
          </div>
        )}
      </section>}

      <section className="settings-section">
        <h3>{t('settings.analytics')}</h3>
        <div className="settings-row">
          <label htmlFor="setting-analytics">{t('settings.analytics_enabled')}</label>
          <input id="setting-analytics" type="checkbox" checked={analyticsEnabled} onChange={e => setAnalyticsEnabled(e.target.checked)} aria-describedby="analytics-description" />
        </div>
        <p id="analytics-description" className="settings-description">{t('settings.analytics_description')}</p>
      </section>

      <section className="settings-section">
        <h3>{t('settings.links')}</h3>
        <div className="settings-row">
          <a onClick={() => track('support_click', { source: 'settings' })} href="/donate.html" target="_blank" rel="noopener noreferrer">
            {t('settings.donate')}
          </a>
        </div>
        <div className="settings-row">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            {t('settings.privacy')}
          </a>
        </div>
        <div className="settings-row">
          <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">
            {t('settings.export_licenses')}
          </a>
        </div>
      </section>

      <section className="settings-section">
        <button className="btn danger-btn" onClick={() => signOut()} type="button">
          {t('settings.sign_out')}
        </button>
      </section>

      {/* Password dialog */}
      {pwDialogOpen && !readOnly && (
        <Modal label={hasChecker ? t('settings.change_password') : t('settings.set_password')} onClose={() => { if (!pwBusy) { setPwDialogOpen(false); setOldPw(''); setNewPw(''); setConfirmPw(''); setPwError(''); } }}>
          <form onSubmit={(e) => { e.preventDefault(); if (!pwBusy) void (hasChecker ? handleChangePassword() : handleSetPassword()); }}>
            <h3>
              {hasChecker ? t('settings.change_password') : t('settings.set_password')}
            </h3>

            {hasChecker && <PasswordField label={t('settings.old_password')} value={oldPw} onChange={setOldPw} disabled={pwBusy} />}
            <PasswordField label={t('settings.new_password')} value={newPw} onChange={setNewPw} autoComplete="new-password" disabled={pwBusy} />
            <PasswordField label={t('settings.confirm_password')} value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" disabled={pwBusy} />

            {pwError && <div className="error-msg">{pwError}</div>}

            <div className="modal-actions">
              <button
                className="btn"
                disabled={pwBusy}
                onClick={() => { setPwDialogOpen(false); setPwError(''); setOldPw(''); setNewPw(''); setConfirmPw(''); }}
                type="button"
              >
                {t('settings.cancel')}
              </button>
              <button
                className="btn btn-primary"
                disabled={pwBusy}
                type="submit"
              >
                {pwBusy ? '...' : t('settings.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
