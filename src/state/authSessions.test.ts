import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionChange } from '../gateway/gis';

let auth: typeof import('./authStore').useAuthStore;
let session: typeof import('../sync/session');
let listener: (change: SessionChange) => void;
let token: string | null;
let expired: boolean;
let fetchProfile: ReturnType<typeof vi.fn>;
const login = vi.fn(), logout = vi.fn(), activate = vi.fn(), lock = vi.fn(), stop = vi.fn(), pause = vi.fn();
const profile = (sub: string) => ({ ok: true, json: async () => ({ sub, email: `${sub}@example.com` }) });

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  token = 'token-a'; expired = false;
  fetchProfile = vi.fn().mockResolvedValue(profile('account-a'));
  vi.stubGlobal('fetch', fetchProfile);
  login.mockResolvedValue(undefined); logout.mockResolvedValue(undefined); activate.mockResolvedValue(undefined);
  vi.doMock('../gateway/gis', () => ({
    initGis: vi.fn().mockResolvedValue(undefined),
    getAccessToken: () => token, isAuthenticated: () => !!token, hasExpiredSession: () => expired,
    signIn: login, signOut: logout, setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
    subscribeSessionChanges: vi.fn(fn => { listener = fn; return () => {}; }),
  }));
  vi.doMock('../sync/engine', () => ({ exclusive: (task: () => Promise<void>) => task() }));
  vi.doMock('../db/database', async importOriginal => ({ ...await importOriginal<object>(), activateAccount: activate }));
  vi.doMock('./syncTriggers', () => ({ stopSyncWork: stop, pauseSyncWork: pause }));
  vi.doMock('./cryptoStore', () => ({ cryptoStore: { getState: () => ({ lock }) } }));
  vi.doMock('./accessStore', async importOriginal => ({ ...await importOriginal<object>(), restoreAccessMode: vi.fn() }));
  auth = (await import('./authStore')).useAuthStore;
  session = await import('../sync/session');
  await auth.getState().init();
  vi.clearAllMocks();
});
afterEach(() => { session.endSession(); vi.unstubAllGlobals(); });

it('keeps the editor mounted and local account available when the token expires', () => {
  token = null; expired = true; listener('expired');
  expect(auth.getState()).toMatchObject({ status: 'signed-in', accountId: 'account-a', needsAuthorization: true });
  expect(session.syncEnabled()).toBe(false); expect(pause).toHaveBeenCalledOnce();
  expect(lock).not.toHaveBeenCalled(); expect(activate).not.toHaveBeenCalled(); expect(fetchProfile).not.toHaveBeenCalled();
});

it('renews the same account without reactivating the database or locking notes', async () => {
  token = null; expired = true; listener('expired');
  login.mockImplementation(async () => { token = 'renewed-a'; expired = false; });
  const statuses: string[] = []; const unsubscribe = auth.subscribe(s => statuses.push(s.status));
  const localChanges = vi.fn(); window.addEventListener('tonote-local-change', localChanges);
  try {
    expect(await auth.getState().signIn()).toBe(true);
    expect(login).toHaveBeenCalledExactlyOnceWith('');
    expect(auth.getState()).toMatchObject({ status: 'signed-in', accountId: 'account-a', needsAuthorization: false, authorizing: false });
    expect(statuses).not.toContain('loading'); expect(session.syncEnabled()).toBe(true);
    expect(activate).not.toHaveBeenCalled(); expect(lock).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
    expect(localChanges).toHaveBeenCalledOnce(); // Queue sending only; no full catalog refresh.
  } finally { unsubscribe(); window.removeEventListener('tonote-local-change', localChanges); }
});

it('accepts the same account’s token from another tab without another popup', async () => {
  token = 'other-tab-a'; listener('changed');
  expect(session.syncEnabled()).toBe(false);
  await vi.waitFor(() => expect(auth.getState().authorizing).toBe(false));
  expect(session.syncEnabled()).toBe(true); expect(login).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled(); expect(lock).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
});

it('verifies a changed account before switching databases and resumes only afterwards', async () => {
  let finish!: (response: ReturnType<typeof profile>) => void;
  fetchProfile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  token = 'token-b'; listener('changed');
  expect(session.syncEnabled()).toBe(false); expect(activate).not.toHaveBeenCalled();
  finish(profile('account-b'));
  await vi.waitFor(() => expect(auth.getState().accountId).toBe('account-b'));
  expect(activate).toHaveBeenCalledExactlyOnceWith('account-b'); expect(lock).toHaveBeenCalledOnce();
  expect(session.syncEnabled()).toBe(true);
});

it('does not sync an unverified token if profile verification fails', async () => {
  fetchProfile.mockRejectedValueOnce(new Error('offline'));
  token = 'unverified-b'; listener('changed');
  await vi.waitFor(() => expect(auth.getState().authorizing).toBe(false));
  expect(auth.getState()).toMatchObject({ status: 'signed-in', accountId: 'account-a', needsAuthorization: true });
  expect(session.syncEnabled()).toBe(false); expect(activate).not.toHaveBeenCalled();
});

it('preserves the open note after a cancelled renewal and allows another click', async () => {
  token = null; expired = true; listener('expired');
  login.mockRejectedValueOnce(new Error('popup_closed'));
  expect(await auth.getState().signIn()).toBe(false);
  expect(auth.getState()).toMatchObject({ status: 'signed-in', needsAuthorization: true, authorizing: false, authError: true });
  expect(session.syncEnabled()).toBe(false); expect(logout).not.toHaveBeenCalled();
  login.mockImplementationOnce(async () => { token = 'renewed-a'; });
  expect(await auth.getState().signIn()).toBe(true); expect(auth.getState().authError).toBe(false);
});

it('cancelling a popup preserves an already verified valid session', async () => {
  login.mockRejectedValueOnce(new Error('popup_closed'));
  expect(await auth.getState().signIn()).toBe(false);
  expect(auth.getState()).toMatchObject({ status: 'signed-in', needsAuthorization: false, authorizing: false });
  expect(session.syncEnabled()).toBe(true); expect(logout).not.toHaveBeenCalled();
});

it('coalesces repeated renewal clicks before opening Google', async () => {
  let finish!: () => void; login.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const first = auth.getState().signIn(), second = auth.getState().signIn();
  expect(first).toBe(second); expect(login).toHaveBeenCalledOnce();
  finish(); await first;
});

it('logs out locally when another tab signs out without revoking access a second time', () => {
  token = null; listener('signed-out');
  expect(auth.getState()).toMatchObject({ status: 'signed-out', accountId: undefined, email: undefined, needsAuthorization: false });
  expect(session.syncEnabled()).toBe(false); expect(lock).toHaveBeenCalledOnce(); expect(logout).not.toHaveBeenCalled();
});

it('ignores profile verification that finishes after another tab has logged out', async () => {
  let finish!: (response: ReturnType<typeof profile>) => void;
  fetchProfile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  token = 'token-b'; listener('changed');
  token = null; listener('signed-out'); finish(profile('account-b'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(auth.getState().status).toBe('signed-out'); expect(activate).not.toHaveBeenCalled(); expect(session.syncEnabled()).toBe(false);
});
