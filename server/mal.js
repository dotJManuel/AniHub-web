// Proxy de MyAnimeList (lógica compartida entre las funciones de Vercel y el
// servidor de desarrollo de Vite). Trabaja con Request/Response estándar.
//
// MAL no envía cabeceras CORS: el navegador no puede llamar a su API ni a su
// endpoint de token. Aquí:
//   POST /api/mal/token          -> intercambia code / refresh_token por tokens,
//                                   añadiendo el client_secret (solo existe aquí).
//   ANY  /api/mal/proxy/<ruta>   -> reenvía a https://api.myanimelist.net/v2/<ruta>
//                                   con el Authorization del cliente.
//
// Variables de entorno: MAL_CLIENT_SECRET y, opcional, MAL_CLIENT_ID
// (si no está, se usa VITE_MAL_CLIENT_ID).

const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const MAL_API_BASE = 'https://api.myanimelist.net/v2';
const GRANTS = new Set(['authorization_code', 'refresh_token']);
const PROXY_PREFIX = '/api/mal/proxy';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// La web y el proxy comparten dominio: si llega un Origin distinto, se rechaza.
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function clientId(env) {
  return env.MAL_CLIENT_ID || env.VITE_MAL_CLIENT_ID || '';
}

export async function handleToken(request, env) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'origin_not_allowed' }, 403);
  if (!clientId(env) || !env.MAL_CLIENT_SECRET) return json({ error: 'server_not_configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!GRANTS.has(body.grant_type)) return json({ error: 'unsupported_grant_type' }, 400);
  if (body.client_id !== clientId(env)) return json({ error: 'invalid_client' }, 400);

  const params = new URLSearchParams({
    client_id: clientId(env),
    client_secret: env.MAL_CLIENT_SECRET,
    grant_type: body.grant_type,
  });
  if (body.grant_type === 'authorization_code') {
    if (!body.code || !body.code_verifier || !body.redirect_uri) return json({ error: 'invalid_request' }, 400);
    params.set('code', body.code);
    params.set('code_verifier', body.code_verifier);
    params.set('redirect_uri', body.redirect_uri);
  } else {
    if (!body.refresh_token) return json({ error: 'invalid_request' }, 400);
    params.set('refresh_token', body.refresh_token);
  }

  const res = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function handleApi(request) {
  if (!sameOrigin(request)) return json({ error: 'origin_not_allowed' }, 403);

  const url = new URL(request.url);
  const rest = url.pathname.startsWith(PROXY_PREFIX) ? url.pathname.slice(PROXY_PREFIX.length) : '';
  if (!/^\/[A-Za-z0-9_@/.-]*$/.test(rest) || rest.includes('..')) return json({ error: 'invalid_path' }, 400);

  const auth = request.headers.get('Authorization');
  if (!auth) return json({ error: 'unauthorized' }, 401);

  const headers = { Authorization: auth };
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers['Content-Type'] = contentType;

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const res = await fetch(`${MAL_API_BASE}${rest}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
