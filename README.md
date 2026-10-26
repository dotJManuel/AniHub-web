# AniHub Web — PWA

Versión web instalable (PWA) de la extensión **AniDual**: lista de MyAnimeList y AniList en un solo lugar, con +1/−1 de progreso, detalle editable y notificaciones de AniList. Proyecto **independiente** de la extensión (`../anidual`).

**Stack:** React 18 · TypeScript · Vite · `vite-plugin-pwa` · React Router · TanStack Query. Proxy de MAL como funciones de Vercel.

## Estructura

```
anihub/
├─ src/               app (lib/, providers/, pages/, components/)
├─ api/mal/           funciones de Vercel: token.js y proxy.js
├─ server/mal.js      lógica del proxy (compartida con el dev server de Vite)
├─ public/            icon.svg + íconos PWA generados
├─ vercel.json        fallback SPA (excluye /api)
└─ worker/            (opcional/legacy) mismo proxy como Cloudflare Worker
```

## Por qué hay un proxy

MAL no envía cabeceras CORS: el navegador no puede llamar a su API ni a su endpoint de token. Las funciones de `api/mal/`:

- `POST /api/mal/token` → intercambia `code`/`refresh_token` y **añade el `client_secret`** (solo existe en el servidor).
- `ANY /api/mal/proxy?_p=/<ruta>` → reenvía a `api.myanimelist.net/v2`.
- Web y proxy comparten dominio, así que no hay CORS; se rechaza cualquier `Origin` distinto.

AniList y Jikan sí permiten CORS y se llaman directo desde el navegador.

## Desarrollo local

1. Registra una app en AniList y otra en MAL con Redirect URL `http://localhost:5173/callback` (MAL: tipo *web*).
2. Crea `.env.local` (ver `.env.example`):
   ```
   VITE_ANILIST_CLIENT_ID=...
   VITE_MAL_CLIENT_ID=...
   MAL_CLIENT_SECRET=...        # sin prefijo VITE_: nunca llega al navegador
   ```
3. `npm install` y `npm run dev` → <http://localhost:5173>. El dev server sirve `/api/mal/*` con la misma lógica que Vercel.
4. En **Ajustes** conecta AniList y MyAnimeList.

## Publicar: GitHub → Vercel

1. Repo en GitHub (solo esta carpeta). `.gitignore` ya excluye `.env*`, `.dev.vars`, `node_modules` y `dist`.
2. En Vercel: *Add New → Project → Import* el repo. Framework: **Vite** (autodetectado), build `npm run build`, salida `dist`.
3. Variables de entorno (Production): `VITE_ANILIST_CLIENT_ID`, `VITE_MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`. Deja `VITE_PROXY_URL` sin definir.
4. Deploy. Registra `https://<proyecto>.vercel.app/callback` como Redirect URL en las apps de AniList y MAL de producción.
5. Cada `git push` a `main` redespliega. Si cambias una variable, haz *Redeploy* (las `VITE_*` se fijan en el build).

## Notas

- Los tokens se guardan en `localStorage`. Es una app solo-cliente, sin sesiones propias.
- Regenerar íconos tras cambiar `public/icon.svg`: `npm run icons`.
- Más adelante se puede empaquetar como TWA (PWABuilder/Bubblewrap) para Play Store sin cambiar el código.
