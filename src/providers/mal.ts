// Provider de MyAnimeList (API v2 REST), siempre a través del proxy (sin CORS en MAL).
import { PROXY_URL } from '../config';
import { ensureMalToken } from '../lib/auth';
import type {
  Detail,
  EntryInput,
  Extras,
  ListItem,
  MediaType,
  Release,
  Status,
} from '../types';

const FROM_MAL: Record<string, Status> = {
  watching: 'WATCHING',
  reading: 'WATCHING',
  completed: 'COMPLETED',
  on_hold: 'PAUSED',
  dropped: 'DROPPED',
  plan_to_watch: 'PLANNING',
  plan_to_read: 'PLANNING',
};

function toMalStatus(canonical: Status, type: MediaType): string {
  switch (canonical) {
    case 'WATCHING':
    case 'REPEATING':
      return type === 'anime' ? 'watching' : 'reading';
    case 'COMPLETED':
      return 'completed';
    case 'PAUSED':
      return 'on_hold';
    case 'DROPPED':
      return 'dropped';
    case 'PLANNING':
    default:
      return type === 'anime' ? 'plan_to_watch' : 'plan_to_read';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function apiFetch(path: string, opts: { method?: string; body?: string } = {}): Promise<any> {
  const token = await ensureMalToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(`${PROXY_URL}/api/mal/proxy${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Respuesta inesperada de MyAnimeList.');
  }
  if (json.error) throw new Error(json.message || json.error);
  return json;
}

function releaseOf(status: string): Release {
  if (status === 'currently_airing' || status === 'currently_publishing') return 'releasing';
  if (status === 'finished_airing' || status === 'finished') return 'finished';
  return 'other';
}

export async function getCurrent(type: MediaType): Promise<ListItem[]> {
  const listPath = type === 'anime' ? 'animelist' : 'mangalist';
  const status = type === 'anime' ? 'watching' : 'reading';
  const fields =
    type === 'anime'
      ? 'list_status,num_episodes,status,main_picture,alternative_titles'
      : 'list_status,num_chapters,status,main_picture,alternative_titles';
  const data = await apiFetch(`/users/@me/${listPath}?status=${status}&limit=1000&nsfw=true&fields=${fields}`);
  const items: ListItem[] = [];
  for (const row of data.data || []) {
    const node = row.node;
    const ls = row.list_status || {};
    items.push({
      provider: 'mal',
      id: node.id,
      title: node.title,
      total: (type === 'anime' ? node.num_episodes : node.num_chapters) || 0,
      image: node.main_picture?.large || node.main_picture?.medium || '',
      status: FROM_MAL[ls.status] || 'WATCHING',
      airingEp: null,
      release: releaseOf(node.status),
      progress: (type === 'anime' ? ls.num_episodes_watched : ls.num_chapters_read) || 0,
      score: ls.score || 0,
    });
  }
  return items;
}

export async function save(id: number, type: MediaType, progress: number, status: Status) {
  const field = type === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';
  const body = new URLSearchParams({
    status: toMalStatus(status, type),
    [field]: String(progress),
  }).toString();
  return apiFetch(`/${type}/${id}/my_list_status`, { method: 'PUT', body });
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function humanStatus(s: string) {
  const map: Record<string, string> = {
    currently_airing: 'En emisión',
    finished_airing: 'Finalizado',
    not_yet_aired: 'Sin estrenar',
    currently_publishing: 'Publicándose',
    finished: 'Finalizado',
    on_hiatus: 'En pausa',
    discontinued: 'Discontinuado',
    not_yet_published: 'Sin publicar',
  };
  return map[s] || s || '—';
}

// Jikan: API no oficial de MAL (sí tiene CORS). La API oficial no expone
// personajes ni enlaces de streaming/externos.
async function jikan(path: string): Promise<any> {
  const res = await fetch(`https://api.jikan.moe/v4${path}`);
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  return res.json();
}

export async function getExtras(id: number, type: MediaType): Promise<Extras> {
  const out: Extras = { characters: [], streaming: [], externalLinks: [] };
  const [chars, stream, ext] = await Promise.allSettled([
    jikan(`/${type}/${id}/characters`),
    type === 'anime' ? jikan(`/anime/${id}/streaming`) : Promise.resolve(null),
    jikan(`/${type}/${id}/external`),
  ]);
  if (chars.status === 'fulfilled' && chars.value?.data) {
    out.characters = chars.value.data.slice(0, 12).map((c: any) => ({
      name: c.character?.name || '',
      role: c.role || '',
      image: c.character?.images?.jpg?.image_url || '',
    }));
  }
  if (stream.status === 'fulfilled' && stream.value?.data) {
    out.streaming = stream.value.data.map((s: any) => ({ site: s.name, url: s.url, icon: '' }));
  }
  if (ext.status === 'fulfilled' && ext.value?.data) {
    out.externalLinks = ext.value.data.map((e: any) => ({ site: e.name, url: e.url, icon: '' }));
  }
  return out;
}

export async function getDetail(id: number, type: MediaType): Promise<Detail> {
  const common =
    'id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,' +
    'popularity,num_list_users,genres,media_type,status,rating,source,studios,my_list_status';
  const fields = type === 'anime' ? `${common},num_episodes,start_season` : `${common},num_chapters,num_volumes`;
  const m = await apiFetch(`/${type}/${id}?fields=${fields}`);
  const ls = m.my_list_status || {};
  return {
    provider: 'mal',
    id: m.id,
    type,
    siteUrl: `https://myanimelist.net/${type}/${m.id}`,
    title: m.title,
    titles: {
      romaji: m.alternative_titles?.ja || '',
      english: m.alternative_titles?.en || '',
      native: '',
    },
    image: m.main_picture?.large || m.main_picture?.medium || '',
    banner: '',
    score: m.mean ?? null,
    scoreMax: 10,
    rank: m.rank ?? null,
    popularity: m.popularity ?? null,
    members: m.num_list_users ?? null,
    membersLabel: 'Members',
    status: humanStatus(m.status),
    airingEp: null,
    episodes: (type === 'anime' ? m.num_episodes : m.num_chapters) || null,
    volumes: m.num_volumes || null,
    format: m.media_type ? String(m.media_type).toUpperCase() : '',
    season: m.start_season ? `${cap(m.start_season.season)} ${m.start_season.year}` : '',
    genres: (m.genres || []).map((g: any) => g.name),
    studios: (m.studios || []).map((s: any) => s.name),
    source: m.source ? String(m.source).replace(/_/g, ' ') : '',
    description: m.synopsis || '',
    externalLinks: [],
    streaming: [],
    characters: [],
    my: {
      status: FROM_MAL[ls.status] || null,
      score: ls.score || 0,
      scoreMax: 10,
      progress: (type === 'anime' ? ls.num_episodes_watched : ls.num_chapters_read) || 0,
      startDate: ls.start_date || '',
      finishDate: ls.finish_date || '',
    },
  };
}

export async function saveEntry(id: number, type: MediaType, entry: EntryInput) {
  const field = type === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';
  const body = new URLSearchParams({
    status: toMalStatus(entry.status, type),
    score: String(Number(entry.score) || 0),
    [field]: String(Number(entry.progress) || 0),
    start_date: entry.startDate || '',
    finish_date: entry.finishDate || '',
  }).toString();
  return apiFetch(`/${type}/${id}/my_list_status`, { method: 'PUT', body });
}
