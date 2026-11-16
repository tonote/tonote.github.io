import { useAuthStore } from '../state/authStore';
import { useTranslation } from 'react-i18next';

export function AuthScreen() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const signIn = useAuthStore((s) => s.signIn);
  const needsAuthorization = useAuthStore(s => s.needsAuthorization);
  const authorizing = useAuthStore(s => s.authorizing);
  const authError = useAuthStore(s => s.authError);

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <div className="logo">{t('app.title')}</div>
        <div className="spinner-large" />
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="logo">{t('app.title')}</div>
      <button className="google-button" disabled={authorizing} onClick={() => void signIn()} type="button">
        <img
          className="google-button__icon"
          src="/assets/google-icon.svg"
          alt=""
          width="18"
          height="18"
        />
        <span className="google-button__text">{t(authorizing ? 'auth.loading' : needsAuthorization ? 'auth.continue' : 'auth.sign_in')}</span>
      </button>
      {authError && <p role="status">{t('auth.failed')}</p>}
    </div>
  );
}
