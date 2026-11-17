import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * In dev mode, read the local OAuth client_id from ../client_secret.json
 * (the Google Cloud download — lives OUTSIDE the repo, never committed).
 * Only `client_id` is extracted; the client_secret itself is never touched
 * (GIS uses only the client_id). Returns '' in production or if the file is
 * missing — then we fall back to VITE_OAUTH_CLIENT_ID from `.env`.
 */
function readLocalClientId(mode: string): string {
  if (mode !== 'development') return '';
  try {
    const raw = readFileSync(resolve(projectRoot, '../client_secret.json'), 'utf-8');
    const j = JSON.parse(raw) as { installed?: { client_id?: string }; web?: { client_id?: string } };
    return j?.installed?.client_id ?? j?.web?.client_id ?? '';
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => {
  // Load .env / .env.[mode] / .env.local so we can read VITE_OAUTH_CLIENT_ID here.
  const env = loadEnv(mode, projectRoot, '');
  // Dev: prefer the local client_id (from ../client_secret.json) so OAuth
  // consent works on http://localhost. Prod: falls through to the .env value
  // (the tonote.github.io client). One single constant flows into the bundle.
  const clientId = readLocalClientId(mode) || env.VITE_OAUTH_CLIENT_ID || '';

  return {
    base: '/',
    // Must match the local OAuth client's authorized JavaScript origin.
    server: { host: 'localhost', port: 5000, strictPort: true },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['to-note.ico', 'icon-192.png', '.nojekyll'],
        manifest: {
          name: 'ToNote',
          short_name: 'ToNote',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
          theme_color: '#2e7d32',
          background_color: '#ffffff',
          display: 'standalone',
        },
        workbox: {
          navigateFallback: '/index.html',
          // HashRouter only needs the app shell at / or /index.html. Static
          // pages (including malformed Android links) must never open notes.
          navigateFallbackAllowlist: [/^\/(?:index\.html)?(?:\?|$)/],
          runtimeCaching: [{
            urlPattern: ({ url, request, sameOrigin }) => sameOrigin && request.mode === 'navigate' && /\/{2,}/.test(url.pathname),
            handler: async ({ url }) => {
              const target = new URL(url.href);
              target.pathname = target.pathname.replace(/\/{2,}/g, '/');
              return Response.redirect(target.href, 302);
            },
          }],
        },
      }),
    ],
    // Single build-time constant: dev-id in dev, prod-id in prod. No ternary
    // in app source, no client_id leak across environments.
    define: {
      __OAUTH_CLIENT_ID__: JSON.stringify(clientId),
    },
  };
});
