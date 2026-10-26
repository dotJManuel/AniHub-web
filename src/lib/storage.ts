// Wrapper sobre localStorage. Los tokens viven en claves de primer nivel;
// las preferencias en `settings`. Cada escritura emite un evento para que la UI
// reaccione (p. ej. al conectar o desconectar una cuenta).

const EVENT = 'anihub:storage';

export interface Settings {
  anilistClientId?: string;
  malClientId?: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export const getSettings = (): Settings => read<Settings>('settings') || {};
export const setSettings = (patch: Settings) => write('settings', { ...getSettings(), ...patch });

export const getAnilistToken = () => read<string>('anilistToken');
export const setAnilistToken = (t: string | null) => write('anilistToken', t);

export interface MalTokens {
  access: string;
  refresh: string;
  expires: number;
}
export const getMalTokens = () => read<MalTokens>('malTokens');
export const setMalTokens = (t: MalTokens | null) => write('malTokens', t);

export const getAnilistUser = () => read<{ id: number; name: string }>('anilistUser');
export const setAnilistUser = (u: { id: number; name: string } | null) => write('anilistUser', u);

export function clearProvider(provider: 'anilist' | 'mal') {
  if (provider === 'anilist') {
    setAnilistToken(null);
    setAnilistUser(null);
  } else {
    setMalTokens(null);
  }
}

// Preferencias de UI por dispositivo (pestaña activa, etc.).
export const getPref = (k: string): string | null => {
  try {
    return localStorage.getItem(`pref:${k}`);
  } catch {
    return null;
  }
};
export const setPref = (k: string, v: string) => {
  try {
    localStorage.setItem(`pref:${k}`, v);
  } catch {
    /* no-op */
  }
};
