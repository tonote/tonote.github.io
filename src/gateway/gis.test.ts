import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Node versions exposing an unavailable native localStorage can shadow jsdom's.
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    get length() { return values.size; },
  });
});

describe('gis module — getAccessToken expiry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    sessionStorage.clear(); window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no token has been set', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const { getAccessToken } = await import('../gateway/gis');
    expect(getAccessToken()).toBeNull();
  });

  it('returns null/false when no token set', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const { getAccessToken, isAuthenticated } = await import('../gateway/gis');
    expect(getAccessToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});

function setupGisEnvironment() {
  const capturedCalls: Array<{ prompt: string }> = [];

  const mockScript = {
    id: 'gis-script',
    src: '',
    async: true,
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };

  const origGetById = document.getElementById.bind(document);
  vi.spyOn(document, 'getElementById').mockImplementation((id) => {
    if (id === 'gis-script') return null as unknown as HTMLElement;
    return origGetById(id);
  });
  vi.spyOn(document, 'createElement').mockReturnValue(mockScript as unknown as HTMLScriptElement);
  vi.spyOn(document.head, 'appendChild').mockImplementation(() => {
    if (mockScript.onload) mockScript.onload();
    return document.createElement('script');
  });

  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (resp: { access_token: string; expires_in: number }) => void }) => {
          const client = {
            requestAccessToken: vi.fn((opts: { prompt: string }) => {
              capturedCalls.push(opts);
              config.callback({ access_token: 'test-token', expires_in: 3600 });
            }),
          };
          return client;
        },
      },
    },
  });

  return { capturedCalls };
}

describe('GIS session stability during authorization attempts', () => {
  let gis: typeof import('./gis');
  beforeEach(async () => {
    vi.restoreAllMocks(); vi.resetModules(); sessionStorage.clear(); window.localStorage.clear(); setupGisEnvironment();
    gis = await import('./gis'); await gis.initGis(); await gis.signIn();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  function pendingClients() {
    const configs: google.accounts.oauth2.TokenClientConfig[] = [];
    const request = vi.fn();
    vi.spyOn(google.accounts.oauth2, 'initTokenClient').mockImplementation(config => {
      configs.push(config); return { requestAccessToken: request };
    });
    return { configs, request };
  }
  it.each(['popup_closed', 'popup_failed_to_open'])('preserves a valid token when %s occurs', async type => {
    const { configs } = pendingClients();
    const attempt = gis.signIn(); const failed = expect(attempt).rejects.toMatchObject({ type });
    configs[0].error_callback!({ type, message: type }); await failed;
    expect(gis.getAccessToken()).toBe('test-token');
    vi.resetModules(); const restored = await import('./gis'); await restored.initGis();
    expect(restored.getAccessToken()).toBe('test-token');
  });
  it('rejects an OAuth denial immediately instead of waiting for a timeout or dropping the previous token', async () => {
    const { configs } = pendingClients();
    const attempt = gis.signIn(); const failed = expect(attempt).rejects.toThrow('GOOGLE_OAUTH_access_denied');
    configs[0].callback({ error: 'access_denied' }); await failed;
    expect(gis.getAccessToken()).toBe('test-token');
  });
  it('coalesces repeated clicks into one authorization request', async () => {
    const { configs, request } = pendingClients();
    const first = gis.signIn(), second = gis.signIn();
    expect(first).toBe(second); expect(request).toHaveBeenCalledOnce();
    configs[0].callback({ access_token: 'fresh-token', expires_in: 3600 }); await first;
    expect(gis.getAccessToken()).toBe('fresh-token');
  });
  it('ignores late responses from a timed-out request while a newer request is pending', async () => {
    vi.useFakeTimers(); const { configs } = pendingClients();
    const first = gis.signIn(); const expired = expect(first).rejects.toThrow('GIS_TIMEOUT');
    await vi.advanceTimersByTimeAsync(30000); await expired;
    const second = gis.signIn(); let completed = false; void second.then(() => { completed = true; });
    configs[0].callback({ access_token: 'late-token', expires_in: 3600 });
    configs[0].error_callback!({ type: 'popup_closed', message: 'late close' });
    await Promise.resolve(); expect(completed).toBe(false); expect(gis.getAccessToken()).toBe('test-token');
    configs[1].callback({ access_token: 'fresh-token', expires_in: 3600 }); await second;
    expect(gis.getAccessToken()).toBe('fresh-token');
  });
  it('does not revive a signed-out session when an old Google popup finishes later', async () => {
    const { configs } = pendingClients();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const attempt = gis.signIn(); const cancelled = expect(attempt).rejects.toThrow('GOOGLE_SIGN_IN_CANCELLED');
    await gis.signOut(); await cancelled;
    configs[0].callback({ access_token: 'late-token', expires_in: 3600 });
    expect(gis.getAccessToken()).toBeNull(); expect(window.localStorage.length).toBe(0);
  });
  it('does not replace a valid session with an invalid token response', async () => {
    const { configs } = pendingClients();
    const attempt = gis.signIn(); const failed = expect(attempt).rejects.toThrow('GOOGLE_OAUTH_INVALID_RESPONSE');
    configs[0].callback({ access_token: 'invalid-token', expires_in: NaN }); await failed;
    expect(gis.getAccessToken()).toBe('test-token');
  });
});

describe('gis module — signIn prompt parameter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    sessionStorage.clear(); window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests only web scopes without inheriting previous project grants', async () => {
    setupGisEnvironment();
    const initTokenClient = vi.spyOn(google.accounts.oauth2, 'initTokenClient');
    const { initGis } = await import('../gateway/gis');
    await initGis();

    expect(initTokenClient).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
      include_granted_scopes: false,
    }));
  });

  it('restores a valid session after reload without opening a popup', async () => {
    const { capturedCalls } = setupGisEnvironment();
    const first = await import('./gis');
    await first.initGis();
    await first.signIn();
    vi.resetModules();
    const reloaded = await import('./gis');
    await reloaded.initGis();
    expect(reloaded.getAccessToken()).toBe('test-token');
    expect(capturedCalls).toHaveLength(1);
  });

  it('does not restore an expired session', async () => {
    vi.useFakeTimers();
    setupGisEnvironment();
    const first = await import('./gis');
    await first.initGis();
    await first.signIn();
    await vi.advanceTimersByTimeAsync(3_600_000);
    vi.resetModules();
    const reloaded = await import('./gis');
    await reloaded.initGis();
    expect(reloaded.getAccessToken()).toBeNull();
    expect(reloaded.hasExpiredSession()).toBe(true);
    expect(window.localStorage.getItem('tonote.oauth:')).not.toContain('test-token');
  });

  it('clears persisted access on sign-out even when revocation fails', async () => {
    setupGisEnvironment();
    const first = await import('./gis');
    await first.initGis();
    await first.signIn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await first.signOut();
    fetchMock.mockRestore();
    vi.resetModules();
    const reloaded = await import('./gis');
    await reloaded.initGis();
    expect(reloaded.getAccessToken()).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('ignores malformed session data', async () => {
    window.localStorage.setItem('tonote.oauth:', '{bad json');
    setupGisEnvironment();
    const gis = await import('./gis');
    await gis.initGis();
    expect(gis.getAccessToken()).toBeNull();
  });

  it('signIn passes consent prompt to requestAccessToken', async () => {
    const { capturedCalls } = setupGisEnvironment();

    const { signIn, initGis } = await import('../gateway/gis');
    await initGis();
    await signIn('consent');

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].prompt).toBe('consent');
  });

  it('signIn defaults to empty prompt when called without argument', async () => {
    const { capturedCalls } = setupGisEnvironment();

    const { signIn, initGis } = await import('../gateway/gis');
    await initGis();
    await signIn();

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].prompt).toBe('');
  });

  it('signIn rejects with timeout if neither callback fires within 30s', async () => {
    vi.useFakeTimers();

    // Set up a tokenClient where requestAccessToken does NOT fire any callback
    const mockScript = {
      id: 'gis-script',
      src: '',
      async: true,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };

    const origGetById = document.getElementById.bind(document);
    vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'gis-script') return null as unknown as HTMLElement;
      return origGetById(id);
    });
    vi.spyOn(document, 'createElement').mockReturnValue(mockScript as unknown as HTMLScriptElement);
    vi.spyOn(document.head, 'appendChild').mockImplementation(() => {
      if (mockScript.onload) mockScript.onload();
      return document.createElement('script');
    });

    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: () => {
            return {
              requestAccessToken: vi.fn(() => {
                // Deliberately do nothing — no callback, no error_callback
              }),
            };
          },
        },
      },
    });

    const { signIn, initGis } = await import('../gateway/gis');
    await initGis();

    const promise = signIn().catch((e) => e);

    // Advance timers by 30 seconds
    await vi.advanceTimersByTimeAsync(30_000);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('GIS_TIMEOUT');
  });

  it('signIn timeout does not fire if callback resolves within 30s', async () => {
    vi.useFakeTimers();

    let storedCallback: ((resp: { access_token: string; expires_in: number }) => void) | null = null;

    const mockScript = {
      id: 'gis-script',
      src: '',
      async: true,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };

    const origGetById = document.getElementById.bind(document);
    vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'gis-script') return null as unknown as HTMLElement;
      return origGetById(id);
    });
    vi.spyOn(document, 'createElement').mockReturnValue(mockScript as unknown as HTMLScriptElement);
    vi.spyOn(document.head, 'appendChild').mockImplementation(() => {
      if (mockScript.onload) mockScript.onload();
      return document.createElement('script');
    });

    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (resp: { access_token: string; expires_in: number }) => void }) => {
            storedCallback = config.callback;
            return {
              requestAccessToken: vi.fn(() => {
                // Do nothing immediately — we'll trigger callback manually
              }),
            };
          },
        },
      },
    });

    const { signIn, initGis } = await import('../gateway/gis');
    await initGis();

    const promise = signIn();

    // Simulate callback after 5 seconds
    await vi.advanceTimersByTimeAsync(5_000);
    if (storedCallback) {
      storedCallback({ access_token: 'test-token', expires_in: 3600 });
    }

    // Should resolve, not timeout
    await expect(promise).resolves.toBeUndefined();

    // Advance past 30s to confirm timeout doesn't retroactively fire
    await vi.advanceTimersByTimeAsync(30_000);
  });
});

describe('shared Google sessions and renewal', () => {
  const key = 'tonote.oauth:';
  let gis: typeof import('./gis');
  let unsubscribe: (() => void) | undefined;
  function changed(value: object | null, eventKey: string | null = key, area = window.localStorage) {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
    window.dispatchEvent(Object.assign(new Event('storage'), { key: eventKey, storageArea: area }));
  }
  beforeEach(async () => {
    vi.restoreAllMocks(); vi.resetModules(); vi.useFakeTimers();
    sessionStorage.clear(); setupGisEnvironment();
    gis = await import('./gis'); await gis.initGis(); await gis.signIn();
  });
  afterEach(() => { unsubscribe?.(); unsubscribe = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('restores the shared token in a new tab with empty sessionStorage', async () => {
    sessionStorage.clear(); vi.resetModules();
    const tab = await import('./gis'); await tab.initGis();
    expect(tab.getAccessToken()).toBe('test-token');
  });
  it('adopts a renewed token from another tab without opening a popup', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    const request = vi.spyOn(google.accounts.oauth2, 'initTokenClient');
    changed({ accessToken: 'other-tab-token', expiresAt: Date.now() + 3_600_000 });
    expect(gis.getAccessToken()).toBe('other-tab-token');
    expect(listener).toHaveBeenCalledExactlyOnceWith('changed'); expect(request).not.toHaveBeenCalled();
  });
  it('expires locally without a network request and remembers the account for the next click', async () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    gis.setLoginHint('verified-subject', 'test-token');
    const request = vi.spyOn(google.accounts.oauth2, 'initTokenClient');
    const fetch = vi.spyOn(globalThis, 'fetch');
    await vi.advanceTimersByTimeAsync(3_540_000);
    expect(gis.getAccessToken()).toBeNull(); expect(gis.hasExpiredSession()).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith('expired');
    expect(request).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(key)).not.toContain('test-token');
    const client = { requestAccessToken: vi.fn() };
    let config!: google.accounts.oauth2.TokenClientConfig;
    request.mockImplementation(c => { config = c; return client; });
    const promise = gis.signIn();
    expect(client.requestAccessToken).toHaveBeenCalledExactlyOnceWith({ prompt: '', login_hint: 'verified-subject' });
    config.callback({ access_token: 'renewed', expires_in: 3600 }); await promise;
    expect(gis.getAccessToken()).toBe('renewed');
  });
  it('propagates logout even after this tab has already expired', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    gis.invalidateAccessToken('test-token'); listener.mockClear();
    changed(null);
    expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out'); expect(gis.hasExpiredSession()).toBe(false);
  });
  it('ignores other OAuth clients and sessionStorage events', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'tonote.oauth:another-client', storageArea: window.localStorage }));
    window.dispatchEvent(Object.assign(new Event('storage'), { key, storageArea: sessionStorage }));
    expect(listener).not.toHaveBeenCalled(); expect(gis.getAccessToken()).toBe('test-token');
  });
  it('uses the current shared value when an old storage event arrives late', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    window.localStorage.setItem(key, JSON.stringify({ accessToken: 'latest-token', expiresAt: Date.now() + 3_600_000 }));
    window.dispatchEvent(Object.assign(new Event('storage'), { key, storageArea: window.localStorage, newValue: null }));
    expect(gis.getAccessToken()).toBe('latest-token'); expect(listener).toHaveBeenCalledExactlyOnceWith('changed');
  });
  it('does not discard another tab’s new token on a late 401 or expiry timer', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    window.localStorage.setItem(key, JSON.stringify({ accessToken: 'new-token', expiresAt: Date.now() + 3_600_000 }));
    gis.invalidateAccessToken('test-token');
    expect(gis.getAccessToken()).toBe('new-token'); expect(listener).toHaveBeenCalledExactlyOnceWith('changed');
    gis.invalidateAccessToken('test-token'); expect(gis.getAccessToken()).toBe('new-token');
  });
  it('does not turn a shared logout into an expired local session before the storage event arrives', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    window.localStorage.removeItem(key);
    gis.invalidateAccessToken('test-token');
    expect(gis.getAccessToken()).toBeNull(); expect(gis.hasExpiredSession()).toBe(false);
    expect(window.localStorage.getItem(key)).toBeNull(); expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out');
  });
  it('cancels an open popup after logout in another tab and ignores its late response', async () => {
    unsubscribe = gis.subscribeSessionChanges(vi.fn());
    let config!: google.accounts.oauth2.TokenClientConfig;
    vi.spyOn(google.accounts.oauth2, 'initTokenClient').mockImplementation(c => { config = c; return { requestAccessToken: vi.fn() }; });
    const attempt = gis.signIn(); const cancelled = expect(attempt).rejects.toThrow('GOOGLE_SESSION_CHANGED');
    changed(null); await cancelled;
    config.callback({ access_token: 'late-token', expires_in: 3600 });
    expect(gis.getAccessToken()).toBeNull(); expect(window.localStorage.getItem(key)).toBeNull();
  });
  it('rejects a late popup response when another tab logged out before its storage event arrived', async () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    let config!: google.accounts.oauth2.TokenClientConfig;
    vi.spyOn(google.accounts.oauth2, 'initTokenClient').mockImplementation(c => { config = c; return { requestAccessToken: vi.fn() }; });
    const attempt = gis.signIn(); const cancelled = expect(attempt).rejects.toThrow('GOOGLE_SESSION_CHANGED');
    window.localStorage.removeItem(key);
    config.callback({ access_token: 'late-token', expires_in: 3600 }); await cancelled;
    expect(gis.getAccessToken()).toBeNull(); expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out');
    expect(window.localStorage.getItem(key)).toBeNull();
  });
  it('does not process account-hint changes as a new token', () => {
    const listener = vi.fn(); unsubscribe = gis.subscribeSessionChanges(listener);
    gis.setLoginHint('verified-subject', 'test-token');
    window.dispatchEvent(Object.assign(new Event('storage'), { key, storageArea: window.localStorage }));
    expect(listener).not.toHaveBeenCalled();
  });
  it('keeps a working in-memory token if persistent storage is blocked', async () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    await gis.signIn(); expect(gis.getAccessToken()).toBe('test-token');
  });
});
