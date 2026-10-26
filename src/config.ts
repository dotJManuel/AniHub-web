export const ANILIST = {
  authorize: 'https://anilist.co/api/v2/oauth/authorize',
  graphql: 'https://graphql.anilist.co',
};

export const MAL = {
  authorize: 'https://myanimelist.net/v1/oauth2/authorize',
};

// Proxy de MAL (funciones /api/mal/* del mismo dominio). MAL no envía cabeceras
// CORS, así que la API y el intercambio de token pasan por aquí; el Client Secret
// vive solo en el servidor. Vacío = mismo origen (lo normal).
export const PROXY_URL: string = ((import.meta.env.VITE_PROXY_URL as string | undefined) || '').replace(/\/$/, '');

// Client IDs públicos (no son secretos). Se pueden sobrescribir desde Ajustes.
export const DEFAULT_CLIENT_IDS = {
  anilist: (import.meta.env.VITE_ANILIST_CLIENT_ID as string | undefined) || '',
  mal: (import.meta.env.VITE_MAL_CLIENT_ID as string | undefined) || '',
};

export function redirectUri(): string {
  return `${window.location.origin}/callback`;
}
