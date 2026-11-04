import type { NextEpisode, ScaleSetting, ServiceId } from '../types';
import { tr } from './i18n';

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

// --- Tiempo --------------------------------------------------------------

// "3d", "5h", "40m" para la insignia de la tarjeta.
// Capítulos de atraso: episodios ya emitidos que aún no he visto (solo si el sitio informa del último emitido; AniList).
export function behindOf(i: { airingEp: number | null; progress: number; release: string }): number {
  return i.release === 'releasing' && i.airingEp != null ? Math.max(0, i.airingEp - (i.progress || 0)) : 0;
}

// Próxima emisión estimada a partir del `broadcast` de MAL (día de la semana + hora, en horario de Japón, UTC+9).
// MAL no da el número del próximo episodio ni su fecha exacta: esto es solo el siguiente "hueco" semanal. Segundos Unix o null.
export function nextBroadcastAt(broadcast: { day_of_the_week?: string; start_time?: string } | undefined, nowMs = Date.now()): number | null {
  const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(String(broadcast?.day_of_the_week || '').toLowerCase());
  const m = /^(\d{1,2}):(\d{2})/.exec(broadcast?.start_time || '');
  if (day < 0 || !m) return null;
  const JST = 9 * 3600 * 1000;
  const jst = new Date(nowMs + JST); // los getUTC* de esta fecha equivalen a la hora de pared en Japón
  const delta = day - jst.getUTCDay();
  const slot = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + delta, Number(m[1]), Number(m[2])) - JST;
  let at = slot;
  while (at <= nowMs) at += 7 * 86400 * 1000;
  return Math.floor(at / 1000);
}

// Momento de la próxima emisión de un item (exacta en AniList, estimada en MAL) o Infinity si no se conoce.
export function nextTime(i: { next: { at: number } | null; nextAt?: number | null }): number {
  return i.next?.at ?? i.nextAt ?? Infinity;
}

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
  if (s < 45) return tr('ago.moment');
  const m = Math.floor(s / 60);
  if (m < 60) return tr('ago.min', { n: Math.max(1, m) });
  const h = Math.floor(m / 60);
  if (h < 24) return tr('ago.hour', { n: h });
  return tr('ago.day', { n: Math.floor(h / 24) });
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
