import type { NextEpisode, ScaleSetting, ServiceId } from '../types';

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtNum = (n: number) => n.toLocaleString('en-US');

// "Black Clover 2nd Season" -> "black-clover-2nd-season" (para la ruta `~/anime/<slug>`).
export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'titulo'
  );
}

// Para el buscador local: sin tildes ni mayúsculas.
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function initials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '··';
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}

// --- Puntuaciones --------------------------------------------------------

// Escala nativa de la lista de cada servicio: AniList se pide en POINT_100, MAL es 0–10.
export const nativeScale = (p: ServiceId) => (p === 'anilist' ? 100 : 10);

function trim(n: number) {
  return String(Math.round(n * 10) / 10);
}

// Convierte la nota de la tarjeta a la escala elegida en Ajustes. "orig" = sin convertir.
export function displayScore(score: number, provider: ServiceId, scale: ScaleSetting): string {
  const from = nativeScale(provider);
  if (scale === 'orig' || Number(scale) === from) return trim(score);
  return trim(Number(scale) === 10 ? score / 10 : score * 10);
}

// Convierte una nota entre las escalas nativas de AniList (0–100) y MAL (0–10).
export function convertScore(score: number, from: ServiceId, to: ServiceId): number {
  if (from === to) return score;
  return to === 'mal' ? Math.round(score / 10) : Math.round(score * 10);
}

// --- Tiempo --------------------------------------------------------------

// "3d", "5h", "40m" para la insignia de la tarjeta.
export function shortCountdown(next: NextEpisode, now = Date.now()): string {
  const sec = Math.max(0, next.at - Math.floor(now / 1000));
  const d = Math.floor(sec / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(sec / 3600);
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(sec / 60))}m`;
}

// "5d 04h" para el panel de detalle.
export function longCountdown(next: NextEpisode, now = Date.now()): string {
  const sec = Math.max(0, next.at - Math.floor(now / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d >= 1) return `${d}d ${pad2(h)}h`;
  if (h >= 1) return `${h}h ${pad2(m)}m`;
  return `${Math.max(1, m)}m`;
}

// "hace 2 min" a partir de un instante en ms.
export function agoLabel(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 45) return 'hace un momento';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

// "1d", "5h", "30m" para las filas de actividad (unix en segundos).
export function timeAgo(unix: number, now = Date.now()): string {
  if (!unix) return '';
  const s = Math.floor(now / 1000) - unix;
  if (s < 60) return `${Math.max(s, 0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// --- Sinopsis ------------------------------------------------------------

// Quita HTML (<br>, <i>…) y extrae "(Source: X)" / "[Written by MAL Rewrite]".
export function cleanSynopsis(raw: string): { text: string; source: string } {
  if (!raw) return { text: '', source: '' };
  let text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;/g, "'")
    .trim();

  let source = '';
  const m = /\(\s*Source:\s*([^)]+?)\s*\)\s*$/i.exec(text) || /\[\s*Source:\s*([^\]]+?)\s*\]\s*$/i.exec(text);
  if (m) {
    source = m[1].trim();
    text = text.slice(0, m.index).trim();
  }
  // MAL añade "[Written by MAL Rewrite]": no es una fuente, solo se descarta.
  text = text.replace(/\[\s*Written by MAL Rewrite\s*\]\s*$/i, '').trim();
  return { text: text.replace(/\n{3,}/g, '\n\n'), source };
}
