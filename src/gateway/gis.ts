// Build-time constant injected by vite.config.ts. In dev mode it's the local
// client_id read from ../client_secret.json; in production it's VITE_OAUTH_CLIENT_ID.
declare const __OAUTH_CLIENT_ID__: string;

const CLIENT_ID = typeof __OAUTH_CLIENT_ID__ === 'string' ? __OAUTH_CLIENT_ID__ : '';
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let accessToken: string | null = null;
let expiresAt = 0;
let loginHint: string | undefined;
let sessionPresent = false;
let sessionStored = false;

const SESSION_KEY = `tonote.oauth:${CLIENT_ID}`;
type Session = { accessToken: string | null; expiresAt: number; loginHint?: string };
export type SessionChange = 'changed' | 'expired' | 'signed-out';
const listeners = new Set<(change: SessionChange) => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function persistSession(): void {
  sessionPresent = true;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, expiresAt, loginHint }));
    sessionStored = true;
  }
  catch { /* Keep the in-memory session when storage is unavailable. */ }
}

function readSession(): Session | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if ((saved.accessToken !== null && (typeof saved.accessToken !== 'string' || !saved.accessToken)) ||
        typeof saved.expiresAt !== 'number' || !Number.isFinite(saved.expiresAt)) return null;
    return { accessToken: saved.accessToken, expiresAt: saved.expiresAt,
      loginHint: typeof saved.loginHint === 'string' ? saved.loginHint : undefined };
  } catch { return null; }
}

function scheduleExpiry(): void {
  clearTimeout(expiryTimer);
  expiryTimer = undefined;
  // This timer only updates local UI; it never contacts Google.
  if (accessToken && listeners.size) expiryTimer = setTimeout(() => getAccessToken(), Math.max(0, Math.min(2_147_483_647, expiresAt - Date.now() - 60_000)));
}

function notify(change: SessionChange): void {
  for (const listener of listeners) listener(change);
}

function clearSession(): void {
  accessToken = null;
  expiresAt = 0;
  loginHint = undefined;
  sessionPresent = false;
  sessionStored = false;
  scheduleExpiry();
  try { window.localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

function restoreSession(): void {
  try {
    const saved = readSession();
    sessionPresent = saved !== null;
    sessionStored = saved !== null;
    accessToken = saved?.accessToken ?? null;
    expiresAt = saved?.expiresAt ?? 0;
    loginHint = saved?.loginHint;
    if (accessToken && expiresAt <= Date.now() + 60_000) {
      accessToken = null; expiresAt = 0; persistSession();
    }
    scheduleExpiry();
  } catch { /* Storage may be disabled; keep the in-memory session. */ }
}

function sharedSessionChanged(event: StorageEvent): void {
  if (event.storageArea !== window.localStorage || (event.key !== null && event.key !== SESSION_KEY)) return;
  const previous = accessToken, previousExpiry = expiresAt, previouslyPresent = sessionPresent;
  restoreSession(); // Read the latest value, since storage events can be queued.
  if (previous === accessToken && previousExpiry === expiresAt && previouslyPresent === sessionPresent &&
      event.key !== null && sessionPresent) return;
  ++requestId;
  rejectSignIn(new Error('GOOGLE_SESSION_CHANGED'));
  notify(accessToken ? 'changed' : hasExpiredSession() ? 'expired' : 'signed-out');
}

export function subscribeSessionChanges(listener: (change: SessionChange) => void): () => void {
  if (!listeners.size) window.addEventListener('storage', sharedSessionChanged);
  listeners.add(listener); scheduleExpiry();
  return () => {
    listeners.delete(listener); scheduleExpiry();
    if (!listeners.size) window.removeEventListener('storage', sharedSessionChanged);
  };
}

export function hasExpiredSession(): boolean {
  return sessionPresent && !accessToken;
}

/** Remember the verified subject only as an OAuth account-selection hint. */
export function setLoginHint(subject: string, token: string): void {
  if (accessToken !== token) return;
  try { if (readSession()?.accessToken !== token) return; } catch { /* In-memory session only. */ }
  loginHint = subject; persistSession();
}

/** A late 401 for an older token must not invalidate a newer one. */
export function invalidateAccessToken(token: string): void {
  if (accessToken !== token) return;
  // Another tab may have renewed access before its storage event reached us.
  try {
    const saved = readSession();
    if (saved?.accessToken !== token && (saved || sessionStored)) {
      restoreSession();
      notify(accessToken ? 'changed' : hasExpiredSession() ? 'expired' : 'signed-out');
      return;
    }
  } catch { /* Storage may be disabled. */ }
  accessToken = null; expiresAt = 0;
  persistSession(); scheduleExpiry(); notify('expired');
}

let scriptLoadPromise: Promise<void> | null = null;
let pendingResolve: ((value: void) => void) | null = null;
let pendingReject: ((reason?: unknown) => void) | null = null;
let pendingSignIn: Promise<void> | null = null;
let requestId = 0;

function sharedSessionVersion(): string | undefined {
  try {
    const saved = readSession();
    return JSON.stringify(saved ? [saved.accessToken, saved.expiresAt] : null);
  } catch { return undefined; }
}

function resolveSignIn(): void {
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingReject = null;
  resolve?.();
}

function rejectSignIn(reason: unknown): void {
  const reject = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  reject?.(reason);
}

function createTokenClient(attemptId = 0, sessionVersion?: string): void {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    // Do not inherit unrelated grants from other clients in this Google project.
    include_granted_scopes: false,
    callback: (resp) => {
      if (!pendingResolve || attemptId !== requestId) return;
      // A sign-out or renewal in another tab wins even before its storage event
      // is delivered to this tab. Hint-only changes do not cancel authorization.
      if (sessionVersion !== undefined && sharedSessionVersion() !== sessionVersion) {
        restoreSession();
        ++requestId; rejectSignIn(new Error('GOOGLE_SESSION_CHANGED'));
        notify(accessToken ? 'changed' : hasExpiredSession() ? 'expired' : 'signed-out');
        return;
      }
      if (resp.error) { rejectSignIn(new Error(`GOOGLE_OAUTH_${resp.error}`)); return; }
      if (typeof resp.access_token === 'string' && resp.access_token && typeof resp.expires_in === 'number' && Number.isFinite(resp.expires_in) && resp.expires_in > 0) {
        accessToken = resp.access_token;
        expiresAt = Date.now() + resp.expires_in * 1000;
        persistSession(); scheduleExpiry();
        resolveSignIn();
      } else rejectSignIn(new Error('GOOGLE_OAUTH_INVALID_RESPONSE'));
    },
    error_callback: (err) => {
      if (!pendingReject || attemptId !== requestId) return;
      // Closing or blocking a popup does not invalidate an existing token.
      rejectSignIn(err);
    },
  });
}

export function initGis(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  restoreSession();

  const loading = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('gis-script');
    if (existing) {
      if (typeof google !== 'undefined' && typeof google.accounts?.oauth2?.initTokenClient === 'function') {
        createTokenClient();
        resolve();
        return;
      }
      // Script tag exists but not loaded yet — wait for onload
      existing.addEventListener('load', () => {
        createTokenClient();
        resolve();
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load GIS script')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      createTokenClient();
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load GIS script'));
    document.head.appendChild(script);
  });
  scriptLoadPromise = loading;
  void loading.catch(() => {
    if (scriptLoadPromise !== loading) return;
    scriptLoadPromise = null;
    document.getElementById('gis-script')?.remove();
  });
  return loading;
}

export function getAccessToken(): string | null {
  if (accessToken && Date.now() >= expiresAt - 60_000) invalidateAccessToken(accessToken);
  return accessToken;
}

export function signIn(prompt: '' | 'consent' | 'select_account' = ''): Promise<void> {
  if (pendingSignIn) return pendingSignIn;
  if (!tokenClient) {
    // Retry loading a previously failed SDK, but do not open a popup later from
    // a background callback: a subsequent user click must start authorization.
    void initGis().catch(() => {});
    if (!tokenClient) return Promise.reject(new Error('GIS_NOT_READY'));
  }
  const attemptId = ++requestId;
  let resolve!: () => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
  pendingSignIn = promise;
  const timeout = setTimeout(() => {
    if (attemptId === requestId) rejectSignIn(new Error('GIS_TIMEOUT'));
  }, 30_000);
  pendingResolve = () => { clearTimeout(timeout); pendingSignIn = null; resolve(); };
  pendingReject = (reason) => { clearTimeout(timeout); pendingSignIn = null; reject(reason); };
  try {
    // A client per attempt prevents late callbacks from completing a newer login.
    createTokenClient(attemptId, sharedSessionVersion());
    tokenClient.requestAccessToken({ prompt, ...(loginHint && prompt !== 'select_account' ? { login_hint: loginHint } : {}) });
  } catch (error) { rejectSignIn(error); }
  return promise;
}

export async function signOut(): Promise<void> {
  ++requestId;
  rejectSignIn(new Error('GOOGLE_SIGN_IN_CANCELLED'));
  const token = accessToken;
  clearSession();
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
      });
    } catch {
      // Ignore network errors during revoke
    }
  }
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
