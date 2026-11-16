import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), enable: vi.fn() }));
vi.mock('./client', () => ({ createClient: mocks.create }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubEnv('VITE_ANALYTICS_DEBUG', 'true');
  mocks.create.mockResolvedValue({ send: mocks.send, enable: mocks.enable });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('enables analytics by default and respects a saved opt-out', async () => {
  let analytics = await import('./index');
  expect(analytics.analyticsStore.getState().enabled).toBe(true);
  analytics.setAnalyticsEnabled(false);
  vi.resetModules();
  analytics = await import('./index');
  expect(analytics.analyticsStore.getState().enabled).toBe(false);
});

it('does not load the client or replay events recorded before consent', async () => {
  const analytics = await import('./index');
  analytics.setAnalyticsEnabled(false);
  analytics.track('support_click', { source: 'toolbar' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(mocks.create).not.toHaveBeenCalled();
  analytics.setAnalyticsEnabled(true);
  analytics.track('theme_change', { theme: 'dark' });
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
  expect(mocks.send).toHaveBeenCalledWith('theme_change', { theme: 'dark' });
});

it('drops in-flight events when consent is revoked and reuses the client on re-enable', async () => {
  let finish!: (value: { send: typeof mocks.send; enable: typeof mocks.enable }) => void;
  mocks.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const analytics = await import('./index');
  analytics.setAnalyticsEnabled(true);
  analytics.track('page_view', { screen_name: 'notes' });
  analytics.track('show_fragment', { tag: 'notes' });
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  analytics.setAnalyticsEnabled(false);
  finish({ send: mocks.send, enable: mocks.enable });
  await vi.waitFor(() => expect(mocks.enable).toHaveBeenCalledWith(false));
  expect(mocks.send).not.toHaveBeenCalled();
  expect(window.localStorage.getItem('tonote.analytics.enabled')).toBe('false');
  analytics.setAnalyticsEnabled(true);
  analytics.track('page_view', { screen_name: 'settings' });
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

it('ignores SDK failure and retries on a later event', async () => {
  mocks.create.mockRejectedValueOnce(new Error('blocked'));
  const analytics = await import('./index');
  analytics.setAnalyticsEnabled(true);
  expect(() => analytics.track('page_view', { screen_name: 'notes' })).not.toThrow();
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  analytics.track('page_view', { screen_name: 'settings' });
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
});

it('does not collect in local development without the debug override', async () => {
  vi.stubEnv('VITE_ANALYTICS_DEBUG', 'false');
  const analytics = await import('./index');
  analytics.setAnalyticsEnabled(true);
  analytics.track('page_view', { screen_name: 'notes' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(mocks.create).not.toHaveBeenCalled();
});

it('maps routes to fixed names without private identifiers or query contents', async () => {
  const { screenName } = await import('./index');
  expect(screenName('/note/private-id')).toBe('editor');
  expect(screenName('/folder/private-id')).toBe('folder');
  expect(screenName('/color/private-id')).toBe('category');
  expect(screenName('/secret')).toBe('unknown');
  expect(screenName('/search')).toBe('search');
});
