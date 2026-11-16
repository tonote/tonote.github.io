import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { analyticsStore, refreshAnalyticsConsent, screenName, track } from './index';

export function AnalyticsObserver() {
  const { pathname } = useLocation();
  const enabled = analyticsStore(s => s.enabled);
  const status = useAuthStore(s => s.status);
  const previous = useRef('');
  useEffect(() => {
    // Consent is shared by tabs in the same browser.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'tonote.analytics.enabled') refreshAnalyticsConsent();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (!enabled) { previous.current = ''; return; }
    if (status === 'loading') return;
    const tag = status === 'signed-in' ? screenName(pathname) : 'auth';
    // Query edits and private note identifiers never become analytics parameters.
    if (previous.current === tag) return;
    previous.current = tag;
    track('page_view', { screen_name: tag });
    track('show_fragment', { tag });
  }, [pathname, enabled, status]);
  return null;
}
