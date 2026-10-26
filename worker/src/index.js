// Proxy de MyAnimeList para AniHub (Cloudflare Worker).
//
// MAL no envía cabeceras CORS, así que el navegador no puede llamar a su API ni a
// su endpoint de token. Este Worker:
//   POST /mal/token       -> intercambia code / refresh_token por tokens, añadiendo
//                            el client_secret (que vive solo aquí, como secret).
//   ANY  /mal/api/<ruta>  -> reenvía a https://api.myanimelist.net/v2/<ruta>
//                            con el Authorization del cliente.
//
// Variables: MAL_CLIENT_ID (var), MAL_CLIENT_SECRET (secret),
//            ALLOWED_ORIGINS (var, lista separada por comas).

const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const MAL_API_BASE = 'https://api.myanimelist.net/v2';
const GRANTS = new Set(['authorization_code', 'refresh_token']);

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return origin && list.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function handleToken(request, env, origin) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, origin);
  }
  if (!GRANTS.has(body.grant_type)) return json({ error: 'unsupported_grant_type' }, 400, origin);
  if (body.client_id !== env.MAL_CLIENT_ID) return json({ error: 'invalid_client' }, 400, origin);

  const params = new URLSearchParams({
    client_id: env.MAL_CLIENT_ID,
    client_secret: env.MAL_CLIENT_SECRET,
    grant_type: body.grant_type,
  });
  if (body.grant_type === 'authorization_code') {
    if (!body.code || !body.code_verifier || !body.redirect_uri) {
      return json({ error: 'invalid_request' }, 400, origin);
    }
    params.set('code', body.code);
    params.set('code_verifier', body.code_verifier);
    params.set('redirect_uri', body.redirect_uri);
  } else {
    if (!body.refresh_token) return json({ error: 'invalid_request' }, 400, origin);
    params.set('refresh_token', body.refresh_token);
  }

  const res = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function handleApi(request, url, origin) {
  const rest = url.pathname.slice('/mal/api'.length);
  if (!/^\/[A-Za-z0-9_@/.-]*$/.test(rest) || rest.includes('..')) {
    return json({ error: 'invalid_path' }, 400, origin);
  }
  const auth = request.headers.get('Authorization');
  if (!auth) return json({ error: 'unauthorized' }, 401, origin);

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
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }
    // Sin Origin permitido no se atiende (evita que otros sitios usen tu proxy).
    if (!origin) return new Response(JSON.stringify({ error: 'origin_not_allowed' }), { status: 403 });

    try {
      if (url.pathname === '/mal/token') return await handleToken(request, env, origin);
      if (url.pathname.startsWith('/mal/api/')) return await handleApi(request, url, origin);
    } catch (e) {
      return json({ error: 'proxy_error', message: String(e && e.message ? e.message : e) }, 502, origin);
    }
    return json({ error: 'not_found' }, 404, origin);
  },
};
