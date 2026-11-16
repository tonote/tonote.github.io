import { create } from 'zustand';
import { exclusive } from '../sync/engine';
import { activateAccount } from '../db/database';
import { beginSession, endSession } from '../sync/session';
import { pauseSyncWork, stopSyncWork } from './syncTriggers';
import { cryptoStore } from './cryptoStore';
import {
  initGis, signIn as gisSignIn, signOut as gisSignOut, isAuthenticated, getAccessToken,
  subscribeSessionChanges, hasExpiredSession, setLoginHint, invalidateAccessToken,
} from '../gateway/gis';
import { syncStore } from './syncStore';
import { accessStore, restoreAccessMode } from './accessStore';

let authAttempt = 0;
let unsubscribeSession: (() => void) | undefined;
let signingIn: Promise<boolean> | null = null;
let verifiedToken: string | null = null;

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  accountId?: string;
  email?: string;
  avatar?: string;
  needsAuthorization: boolean;
  authorizing: boolean;
  authError: boolean;
  init: () => Promise<void>;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

interface UserProfile { sub: string; email?: string; picture?: string }

async function fetchUserProfile(token: string): Promise<UserProfile> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) invalidateAccessToken(token);
  if (!resp.ok) throw new Error('Cannot establish Google account identity');
  const profile = await resp.json();
  if (typeof profile.sub !== 'string' || !profile.sub) throw new Error('Cannot establish Google account identity');
  return profile;
}

function pauseAuthorization() {
  endSession(); pauseSyncWork();
  syncStore.setState({ progress: null });
  if (syncStore.getState().status === 'syncing') syncStore.getState().setStatus('idle');
}

function signedOut() {
  verifiedToken = null;
  endSession(); stopSyncWork();
  cryptoStore.getState().lock();
  accessStore.setState({ mode: 'checking' });
  useAuthStore.setState({ status: 'signed-out', accountId: undefined, email: undefined, avatar: undefined,
    needsAuthorization: false, authorizing: false, authError: false });
  syncStore.getState().clearCryptoConflict();
  syncStore.setState({ lastSyncAt: null, lastError: null, pending: 0, progress: null });
}

async function acceptToken(attempt: number, token: string): Promise<boolean> {
  const profile = await fetchUserProfile(token);
  if (attempt !== authAttempt || getAccessToken() !== token) return false;
  const previous = useAuthStore.getState();
  const sameAccount = previous.status === 'signed-in' && previous.accountId === profile.sub;
  if (!sameAccount) {
    // Stop displaying the old account before switching its database.
    useAuthStore.setState({ status: 'loading' });
    endSession(); stopSyncWork(); cryptoStore.getState().lock();
    accessStore.setState({ mode: 'checking' });
    await exclusive(async () => {
      if (attempt !== authAttempt) return;
      await activateAccount(profile.sub);
      await restoreAccessMode();
    });
    if (attempt !== authAttempt || getAccessToken() !== token) return false;
    syncStore.getState().clearCryptoConflict();
    syncStore.setState({ lastSyncAt: null, lastError: null, pending: 0, progress: null });
  }
  setLoginHint(profile.sub, token);
  verifiedToken = token;
  beginSession();
  useAuthStore.setState({ status: 'signed-in', accountId: profile.sub, email: profile.email, avatar: profile.picture,
    needsAuthorization: false, authorizing: false, authError: false });
  // Resuming the same account must not remount the editor or fetch the catalog.
  // Only its already queued edits may resume uploading.
  if (sameAccount) window.dispatchEvent(new Event('tonote-local-change'));
  return true;
}

function authorizationFailed(attempt: number) {
  if (attempt !== authAttempt) return;
  const previous = useAuthStore.getState();
  if (previous.status === 'signed-in') {
    // A cancelled popup leaves the note and its local edits available.
    const canResume = isAuthenticated() && getAccessToken() === verifiedToken;
    if (canResume) beginSession();
    useAuthStore.setState({ authorizing: false, needsAuthorization: !canResume, authError: true });
  } else {
    signedOut();
    useAuthStore.setState({ needsAuthorization: hasExpiredSession(), authError: true });
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading', needsAuthorization: false, authorizing: false, authError: false,

  init: async () => {
    const attempt = ++authAttempt;
    unsubscribeSession?.();
    unsubscribeSession = subscribeSessionChanges(change => {
      const nextAttempt = ++authAttempt;
      pauseAuthorization();
      if (change === 'signed-out') { signedOut(); return; }
      if (change === 'expired') {
        if (useAuthStore.getState().status !== 'signed-in') signedOut();
        set({ needsAuthorization: true, authorizing: false });
        return;
      }
      const token = getAccessToken();
      if (!token) { set({ needsAuthorization: true, authorizing: false }); return; }
      set({ authorizing: true });
      void acceptToken(nextAttempt, token).catch(() => authorizationFailed(nextAttempt));
    });
    try {
      const gisReady = initGis();
      // A restored REST session does not depend on loading the popup SDK.
      if (isAuthenticated()) void gisReady.catch(() => {});
      else await gisReady;
      if (attempt !== authAttempt) return;
      const token = getAccessToken();
      if (token) await acceptToken(attempt, token);
      else set({ status: 'signed-out', needsAuthorization: hasExpiredSession() });
    } catch { authorizationFailed(attempt); }
  },

  signIn: () => {
    if (signingIn) return signingIn;
    const attempt = ++authAttempt;
    pauseAuthorization();
    set({ authorizing: true, authError: false });
    const task = (async () => {
      try {
        // Keep this call before the first await: the popup needs a user gesture.
        await gisSignIn('');
        if (attempt !== authAttempt) return false;
        const token = getAccessToken();
        if (!token) throw new Error('Missing Google access token');
        return await acceptToken(attempt, token);
      } catch { authorizationFailed(attempt); return false; }
    })().finally(() => { if (signingIn === task) signingIn = null; });
    signingIn = task;
    return task;
  },

  signOut: async () => {
    ++authAttempt;
    signedOut();
    try { await gisSignOut(); } catch { /* Local sign-out has already completed. */ }
  },
}));
