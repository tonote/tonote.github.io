import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('authStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'account-a', email: 'user@gmail.com' }) }));
  });

  it('initializes with loading status', async () => {
    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('fake-token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');
    expect(useAuthStore.getState().status).toBe('loading');
  });

  it('transitions to signed-in after init + signIn success', async () => {
    const mockInitGis = vi.fn().mockResolvedValue(undefined);
    const mockSignIn = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: mockInitGis,
      signIn: mockSignIn,
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('fake-token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().init();

    expect(mockInitGis).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signed-in');
  });

  it('transitions to signed-out when not authenticated after init', async () => {
    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue(null),
      isAuthenticated: vi.fn().mockReturnValue(false),
    }));

    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().init();

    expect(useAuthStore.getState().status).toBe('signed-out');
  });

  it('transitions to signed-out after init failure', async () => {
    const mockInitGis = vi.fn().mockRejectedValue(new Error('GIS load failed'));

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: mockInitGis,
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue(null),
      isAuthenticated: vi.fn().mockReturnValue(false),
    }));

    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().init();

    expect(useAuthStore.getState().status).toBe('signed-out');
  });
  it('restores a valid session despite a temporary Google popup SDK load failure', async () => {
    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockRejectedValue(new Error('Google SDK unavailable')),
      signIn: vi.fn(), signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('valid-token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));
    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().status).toBe('signed-in');
    expect(useAuthStore.getState().email).toBe('user@gmail.com');
  });

  it('transitions to signed-in after manual signIn', async () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: mockSignIn,
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().signIn();

    expect(mockSignIn).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signed-in');
  });

  it('stays signed-out when manual signIn fails', async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error('Sign-in denied'));

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: mockSignIn,
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue(null),
      isAuthenticated: vi.fn().mockReturnValue(false),
    }));

    const { useAuthStore } = await import('../state/authStore');
    useAuthStore.setState({ status: 'signed-out' });
    await useAuthStore.getState().signIn();

    expect(useAuthStore.getState().status).toBe('signed-out');
  });

  it('transitions to signed-out after signOut', async () => {
    const mockSignOut = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: mockSignOut,
      getAccessToken: vi.fn().mockReturnValue('token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');
    useAuthStore.setState({ status: 'signed-in' });
    await useAuthStore.getState().signOut();

    expect(mockSignOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signed-out');
  });

  it('populates email and avatar on signIn with profile fetch', async () => {
    const mockUserInfo = { sub: 'account-a', email: 'user@gmail.com', picture: 'https://example.com/photo.jpg' };

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUserInfo),
    });
    vi.stubGlobal('fetch', mockFetch);

    await useAuthStore.getState().signIn();

    const state = useAuthStore.getState();
    expect(state.email).toBe('user@gmail.com');
    expect(state.avatar).toBe('https://example.com/photo.jpg');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      }),
    );
  });

  it('refuses to sync without a verified account identity', async () => {
    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }));

    await useAuthStore.getState().signIn();

    const state = useAuthStore.getState();
    expect(state.status).toBe('signed-out');
    expect(state.email).toBeUndefined();
    expect(state.avatar).toBeUndefined();
  });

  it('init() prepares GIS without opening an OAuth popup', async () => {
    const mockInitGis = vi.fn().mockResolvedValue(undefined);
    const mockSignIn = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: mockInitGis,
      signIn: mockSignIn,
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('fake-token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().init();

    expect(mockInitGis).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signIn() does not force repeated consent', async () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../gateway/gis', () => ({
      subscribeSessionChanges: vi.fn(() => () => {}), hasExpiredSession: vi.fn(() => false), setLoginHint: vi.fn(), invalidateAccessToken: vi.fn(),
      initGis: vi.fn().mockResolvedValue(undefined),
      signIn: mockSignIn,
      signOut: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('token'),
      isAuthenticated: vi.fn().mockReturnValue(true),
    }));

    const { useAuthStore } = await import('../state/authStore');
    await useAuthStore.getState().signIn();

    expect(mockSignIn).toHaveBeenCalledWith('');
  });
});
