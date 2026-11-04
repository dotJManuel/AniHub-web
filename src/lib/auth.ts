// OAuth por redirección de página completa (no hay chrome.identity en la web).
//
// - AniList: implicit grant. Vuelve a /callback#access_token=...
// - MAL: authorization code + PKCE plain. Vuelve a /callback?code=...&state=...
//   El intercambio del code y el refresh pasan por el proxy, que añade el
//   client_secret (nunca viaja en el bundle del navegador).

import { ANILIST, DEFAULT_CLIENT_IDS, MAL, PROXY_URL, redirectUri } from '../config';
import { tr } from './i18n';
import * as storage from './storage';

const PENDING_KEY = 'oauth:pending';

interface Pending {
  provider: 'anilist' | 'mal';
  state?: string;
  verifier?: string;
}

export function getClientIds() {
  const s = storage.getSettings();
  return {
    anilist: s.anilistClientId || DEFAULT_CLIENT_IDS.anilist,
    mal: s.malClientId || DEFAULT_CLIENT_IDS.mal,
  };
}

function randomString(length = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

function setPending(p: Pending) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}
function takePending(): Pending | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  try {
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

// --- Inicio de sesión (redirige fuera de la app) ----------------------------

export function loginAnilist(): void {
  const { anilist } = getClientIds();
  if (!anilist) throw new Error(tr('err.noAniListId'));
  setPending({ provider: 'anilist' });
  // AniList toma el Redirect URL registrado en la app; no se pasa como parámetro.
  window.location.assign(
    `${ANILIST.authorize}?client_id=${encodeURIComponent(anilist)}&response_type=token`,
  );
}

export function loginMal(): void {
  const { mal } = getClientIds();
  if (!mal) throw new Error(tr('err.noMalId'));
  const verifier = randomString(96); // PKCE plain: challenge === verifier
  const state = randomString(16);
  setPending({ provider: 'mal', state, verifier });
  window.location.assign(
    `${MAL.authorize}?response_type=code&client_id=${encodeURIComponent(mal)}` +
      `&code_challenge=${verifier}&code_challenge_method=plain` +
      `&state=${state}&redirect_uri=${encodeURIComponent(redirectUri())}`,
  );
}

// --- Retorno de OAuth (/callback) -------------------------------------------

export async function completeLogin(): Promise<'anilist' | 'mal'> {
  const pending = takePending();
  if (!pending) throw new Error(tr('err.noLogin'));

  if (pending.provider === 'anilist') {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = params.get('access_token');
    if (!token) throw new Error(tr('err.noAniListToken'));
    storage.setAnilistToken(token);
    return 'anilist';
  }

  const query = new URLSearchParams(window.location.search);
  const err = query.get('error');
  if (err) throw new Error(query.get('error_description') || err);
  if (query.get('state') !== pending.state) throw new Error(tr('err.state'));
  const code = query.get('code');
  if (!code || !pending.verifier) throw new Error(tr('err.noMalCode'));

  const json = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(),
    client_id: getClientIds().mal,
  });
  saveMal(json);
  return 'mal';
}

// --- Tokens MAL --------------------------------------------------------------

interface MalTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
  error?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<MalTokenResponse> {
  const res = await fetch(`${PROXY_URL}/api/mal/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as MalTokenResponse;
  if (!json.access_token) throw new Error(json.message || json.error || tr('err.malToken'));
  return json;
}

function saveMal(json: MalTokenResponse) {
  storage.setMalTokens({
    access: json.access_token!,
    refresh: json.refresh_token || '',
    expires: Date.now() + (Number(json.expires_in) || 0) * 1000,
  });
}

async function refreshMal(): Promise<boolean> {
  const t = storage.getMalTokens();
  if (!t?.refresh) return false;
  try {
    saveMal(
      await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: t.refresh,
        client_id: getClientIds().mal,
      }),
    );
    return true;
  } catch {
    storage.clearProvider('mal');
    return false;
  }
}

// Devuelve un access_token de MAL válido (renueva si está por expirar).
export async function ensureMalToken(): Promise<string> {
  const t = storage.getMalTokens();
  if (!t) throw new Error(tr('err.notAuthMal'));
  if (t.expires && Date.now() > t.expires - 24 * 60 * 60 * 1000) {
    if (!(await refreshMal())) throw new Error(tr('err.malExpired'));
    return storage.getMalTokens()!.access;
  }
  return t.access;
}

export function status(): { anilist: boolean; mal: boolean } {
  return { anilist: !!storage.getAnilistToken(), mal: !!storage.getMalTokens() };
}

export function logout(provider: 'anilist' | 'mal') {
  storage.clearProvider(provider);
}
