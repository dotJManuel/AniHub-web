import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En desarrollo sirve /api/mal/* con la misma lógica que las funciones de Vercel
// (sin necesitar `vercel dev`). Lee MAL_CLIENT_SECRET de .env.local.
function malApiDev(): Plugin {
  return {
    name: 'anihub-mal-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0];
        const isToken = path === '/api/mal/token';
        const isProxy = path.startsWith('/api/mal/proxy/');
        if (!isToken && !isProxy) return next();

        const { handleToken, handleApi } = await import('./server/mal.js');
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers,
          body: hasBody ? Buffer.concat(chunks) : undefined,
        });
        const response = isToken ? await handleToken(request, env) : await handleApi(request);
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    malApiDev(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'AniHub — Anime & Manga Tracker',
        short_name: 'AniHub',
        description: 'Tu lista de MyAnimeList y AniList en un solo lugar.',
        lang: 'es',
        theme_color: '#0f1116',
        background_color: '#0f1116',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Nunca interceptar el retorno de OAuth ni el proxy.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Portadas y avatares de AniList/MAL: se muestran offline tras la primera carga.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
