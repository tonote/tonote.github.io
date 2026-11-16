import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });
afterEach(() => {
  document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').forEach(script => script.remove());
  delete (window as Window & { gtag?: unknown }).gtag;
  delete (window as Window & { dataLayer?: unknown }).dataLayer;
  window.history.replaceState({}, '', '/');
});

it('loads the existing stream only while enabled and checks again after loading', async () => {
  const { createClient } = await import('./client');
  expect(await createClient(() => false)).toBeNull();
  expect(document.querySelector('script[src*="googletagmanager.com/gtag/js"]')).toBeNull();
  let allowed = true;
  const pending = createClient(() => allowed);
  const script = document.querySelector<HTMLScriptElement>('script[src*="googletagmanager.com/gtag/js"]')!;
  expect(script.src).toContain('G-CC05CXL7PV');
  expect(script.referrerPolicy).toBe('no-referrer');
  allowed = false;
  script.dispatchEvent(new Event('load'));
  expect(await pending).toBeNull();
  expect((window as Window & { dataLayer?: unknown }).dataLayer).toBeUndefined();
});

it('sends sanitized events to the existing stream and disables collection on opt-out', async () => {
  window.history.replaceState({}, '', '/?private=query#/note/secret?q=private');
  const gtag = vi.fn();
  (window as Window & { gtag?: unknown }).gtag = gtag;
  const { createClient } = await import('./client');
  const pending = createClient(() => true);
  document.querySelector('script[src*="googletagmanager.com/gtag/js"]')!.dispatchEvent(new Event('load'));
  const client = (await pending)!;
  expect(gtag).toHaveBeenCalledWith('config', 'G-CC05CXL7PV', expect.objectContaining({
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    page_location: `${location.origin}/`, page_title: 'ToNote', page_referrer: '',
  }));
  client.send('page_view', { screen_name: 'editor' });
  expect(gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ send_to: 'G-CC05CXL7PV' }));
  expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/secret|private/);
  client.enable(false);
  expect(gtag).toHaveBeenLastCalledWith('consent', 'update', { analytics_storage: 'denied' });
});
