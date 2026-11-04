// Provider de AniList (GraphQL). AniList sí envía CORS, así que se llama directo.
import { ANILIST } from '../config';
import { tr } from '../lib/i18n';
import * as storage from '../lib/storage';
import type {
  Detail,
  EntryInput,
  ListItem,
  ListStatus,
  MediaType,
  NextEpisode,
  SearchPage,
  Notification,
  Release,
  Status,
} from '../types';

const FROM_ANI: Record<string, Status> = {
  CURRENT: 'WATCHING',
  PLANNING: 'PLANNING',
  COMPLETED: 'COMPLETED',
  DROPPED: 'DROPPED',
  PAUSED: 'PAUSED',
  REPEATING: 'REPEATING',
};
const TO_ANI: Record<Status, string> = {
  WATCHING: 'CURRENT',
  PLANNING: 'PLANNING',
  COMPLETED: 'COMPLETED',
  DROPPED: 'DROPPED',
  PAUSED: 'PAUSED',
  REPEATING: 'REPEATING',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  { auth = true }: { auth?: boolean } = {},
): Promise<any> {
  const token = storage.getAnilistToken();
  if (auth && !token) throw new Error(tr('err.notAuthAni'));
  const res = await fetch(ANILIST.graphql, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    const e = json.errors[0];
    if (auth && (e.status === 400 || /token/i.test(e.message || ''))) {
      storage.clearProvider('anilist');
      throw new Error(tr('err.aniInvalid'));
    }
    throw new Error(e.message || tr('err.aniGeneric'));
  }
  return json.data;
}

export async function getViewer(): Promise<{ id: number; name: string }> {
  const cached = storage.getAnilistUser();
  if (cached) return cached;
  const data = await gql('query { Viewer { id name } }');
  storage.setAnilistUser(data.Viewer);
  return data.Viewer;
}

// Total de animes del perfil (estadística de AniList, "Total Anime"): una petición ligera.
export async function getAnimeTotal(): Promise<number> {
  const data = await gql('query { Viewer { statistics { anime { count } } } }');
  return data.Viewer?.statistics?.anime?.count || 0;
}

// Estados de AniList que corresponden a cada estado de lista ("viendo" incluye releyendo).
const ANI_STATUSES: Record<ListStatus, string[]> = {
  WATCHING: ['CURRENT', 'REPEATING'],
  COMPLETED: ['COMPLETED'],
  PAUSED: ['PAUSED'],
  DROPPED: ['DROPPED'],
  PLANNING: ['PLANNING'],
};

const LIST_QUERY = `
query ($userId: Int, $type: MediaType, $statuses: [MediaListStatus], $chunk: Int) {
  MediaListCollection(userId: $userId, type: $type, status_in: $statuses, sort: UPDATED_TIME_DESC, chunk: $chunk, perChunk: 500) {
    hasNextChunk
    lists {
      entries {
        id
        progress
        score(format: POINT_100)
        status
        updatedAt
        media {
          id
          status
          episodes
          chapters
          nextAiringEpisode { episode timeUntilAiring }
          title { userPreferred }
          coverImage { large }
        }
      }
    }
  }
}`;

function nextOf(n: any): NextEpisode | null {
  return n && n.episode != null && n.timeUntilAiring != null
    ? { episode: n.episode, at: Math.floor(Date.now() / 1000) + n.timeUntilAiring }
    : null;
}

function releaseOf(status: string): Release {
  return status === 'RELEASING' ? 'releasing' : status === 'FINISHED' ? 'finished' : 'other';
}

// Lista de un estado (anime o manga) del usuario, más reciente primero. AniList entrega la lista en
// bloques de 500; algunos usuarios además la separan por formato (varias listas "Completed …").
export async function getByStatus(type: MediaType, status: ListStatus): Promise<ListItem[]> {
  const viewer = await getViewer();
  const seen = new Set<number>();
  const rows: { item: ListItem; at: number }[] = [];
  for (let chunk = 1; chunk <= 20; chunk++) {
    const data = await gql(LIST_QUERY, {
      userId: viewer.id,
      type: type.toUpperCase(),
      statuses: ANI_STATUSES[status],
      chunk,
    });
    const col = data.MediaListCollection;
    for (const list of col?.lists || []) {
      for (const e of list.entries) {
        if (seen.has(e.media.id)) continue; // las listas personalizadas repiten entradas
        seen.add(e.media.id);
        rows.push({
          at: e.updatedAt || 0,
          item: {
            provider: 'anilist',
            id: e.media.id,
            title: e.media.title.userPreferred,
            total: (type === 'anime' ? e.media.episodes : e.media.chapters) || 0,
            image: e.media.coverImage?.large || '',
            status: FROM_ANI[e.status] || 'WATCHING',
            release: releaseOf(e.media.status),
            // Último episodio emitido (el siguiente a emitir menos 1).
            airingEp: e.media.nextAiringEpisode ? e.media.nextAiringEpisode.episode - 1 : null,
            next: nextOf(e.media.nextAiringEpisode),
            progress: e.progress || 0,
            score: e.score || 0,
          },
        });
      }
    }
    if (!col?.hasNextChunk) break;
  }
  return rows.sort((a, b) => b.at - a.at).map((r) => r.item);
}

export const getCurrent = (type: MediaType) => getByStatus(type, 'WATCHING');

export async function save(mediaId: number, progress: number, status: Status) {
  const data = await gql(
    `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id status progress }
    }`,
    { mediaId, progress, status: TO_ANI[status] || 'CURRENT' },
  );
  return data.SaveMediaListEntry;
}

function cap(s: string) {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
}
function fuzzyToStr(fd?: { year?: number; month?: number; day?: number } | null) {
  if (fd && fd.year && fd.month && fd.day) {
    return `${String(fd.year).padStart(4, '0')}-${String(fd.month).padStart(2, '0')}-${String(fd.day).padStart(2, '0')}`;
  }
  return '';
}
function strToFuzzy(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : { year: null, month: null, day: null };
}
// El estado de emisión se guarda como código de AniList (RELEASING, FINISHED…); la UI lo traduce.
const statusCode = (s: string) => s || '';

const DETAIL_QUERY = `
query ($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    id type siteUrl
    title { userPreferred romaji english native }
    coverImage { large }
    bannerImage
    averageScore meanScore popularity favourites
    rankings { rank type allTime }
    status episodes chapters volumes format season seasonYear
    nextAiringEpisode { episode timeUntilAiring }
    genres
    description(asHtml: false)
    studios(isMain: true) { nodes { name } }
    externalLinks { site url type icon color }
    characters(sort: ROLE, perPage: 12) {
      edges { role node { name { userPreferred } image { medium } } }
    }
    mediaListEntry {
      score(format: POINT_100) progress status
      startedAt { year month day }
      completedAt { year month day }
    }
  }
}`;

export async function getDetail(id: number, type: MediaType): Promise<Detail> {
  const data = await gql(DETAIL_QUERY, { id: Number(id), type: type.toUpperCase() });
  const m = data.Media;
  const ratedRank = (m.rankings || []).find((r: any) => r.type === 'RATED' && r.allTime)?.rank ?? null;
  const links: any[] = m.externalLinks || [];
  const toLink = (l: any) => ({ site: l.site, url: l.url, icon: l.icon || '' });
  return {
    provider: 'anilist',
    id: m.id,
    type,
    siteUrl: m.siteUrl,
    title: m.title.userPreferred,
    titles: { romaji: m.title.romaji, english: m.title.english, native: m.title.native },
    image: m.coverImage?.large || '',
    banner: m.bannerImage || '',
    score: m.averageScore ?? m.meanScore ?? null,
    scoreMax: 100,
    rank: ratedRank,
    popularity: m.popularity ?? null,
    members: m.favourites ?? null,
    membersLabel: 'Favorites',
    status: statusCode(m.status),
    release: releaseOf(m.status),
    airingEp: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : null,
    next: nextOf(m.nextAiringEpisode),
    episodes: (type === 'anime' ? m.episodes : m.chapters) ?? null,
    volumes: m.volumes ?? null,
    format: m.format || '',
    season: m.season ? `${cap(m.season)} ${m.seasonYear || ''}`.trim() : '',
    genres: m.genres || [],
    studios: (m.studios?.nodes || []).map((s: any) => s.name),
    source: '',
    description: m.description || '',
    externalLinks: links.filter((l) => l.type !== 'STREAMING').map(toLink),
    streaming: links.filter((l) => l.type === 'STREAMING').map(toLink),
    characters: (m.characters?.edges || []).map((e: any) => ({
      name: e.node.name.userPreferred,
      role: cap(e.role || ''),
      image: e.node.image?.medium || '',
    })),
    my: {
      status: FROM_ANI[m.mediaListEntry?.status] || null,
      score: m.mediaListEntry?.score || 0,
      scoreMax: 100,
      progress: m.mediaListEntry?.progress || 0,
      startDate: fuzzyToStr(m.mediaListEntry?.startedAt),
      finishDate: fuzzyToStr(m.mediaListEntry?.completedAt),
    },
  };
}

export async function saveEntry(id: number, entry: EntryInput) {
  return gql(
    `mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress, startedAt: $startedAt, completedAt: $completedAt) { id }
    }`,
    {
      mediaId: Number(id),
      status: TO_ANI[entry.status] || 'CURRENT',
      scoreRaw: Number(entry.score) || 0,
      progress: Number(entry.progress) || 0,
      startedAt: strToFuzzy(entry.startDate),
      completedAt: strToFuzzy(entry.finishDate),
    },
  );
}

const NOTIF_FIELDS = `
      __typename
      ... on AiringNotification { id type episode createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on FollowingNotification { id type createdAt user { name siteUrl avatar { medium } } }
      ... on ActivityMentionNotification { id type createdAt user { name avatar { medium } } }
      ... on ActivityReplyNotification { id type createdAt user { name avatar { medium } } }
      ... on ActivityLikeNotification { id type createdAt user { name avatar { medium } } }
      ... on ActivityReplyLikeNotification { id type createdAt user { name avatar { medium } } }
      ... on ThreadCommentReplyNotification { id type createdAt user { name avatar { medium } } thread { title siteUrl } }
      ... on RelatedMediaAdditionNotification { id type createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on MediaDataChangeNotification { id type createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on MediaMergeNotification { id type createdAt media { title { userPreferred } siteUrl coverImage { medium } } }
      ... on MediaDeletionNotification { id type createdAt deletedMediaTitle }`;

const notifQuery = (reset: boolean) => `
query {
  Page(perPage: 25) {
    notifications(resetNotificationCount: ${reset}) { ${NOTIF_FIELDS} }
  }
}`;

type NotifParts = Pick<Notification, 'kind' | 'code' | 'user' | 'media' | 'thread' | 'episode' | 'url' | 'image'>;

// Datos de una notificación tal cual llegan de AniList (sin texto: la frase se arma en la UI).
function notifParts(n: any): NotifParts | null {
  const user = n.user?.name || '';
  const media = n.media?.title?.userPreferred || '';
  const cover = n.media?.coverImage?.medium || '';
  const avatar = n.user?.avatar?.medium || '';
  const base = { user, media, thread: n.thread?.title || '', episode: null as number | null, url: '', image: '' };
  switch (n.__typename) {
    case 'AiringNotification':
      return { ...base, kind: 'episode', code: 'airing', episode: n.episode ?? null, url: n.media?.siteUrl || '', image: cover };
    case 'RelatedMediaAdditionNotification':
      return { ...base, kind: 'site', code: 'site', url: n.media?.siteUrl || '', image: cover };
    case 'FollowingNotification':
      return { ...base, kind: 'follow', code: 'follow', url: n.user?.siteUrl || '', image: avatar };
    case 'ActivityMentionNotification':
      return { ...base, kind: 'activity', code: 'mention', image: avatar };
    case 'ActivityReplyNotification':
      return { ...base, kind: 'activity', code: 'reply', image: avatar };
    case 'ActivityLikeNotification':
      return { ...base, kind: 'activity', code: 'like', image: avatar };
    case 'ActivityReplyLikeNotification':
      return { ...base, kind: 'activity', code: 'replyLike', image: avatar };
    case 'ThreadCommentReplyNotification':
      return { ...base, kind: 'thread', code: 'threadReply', url: n.thread?.siteUrl || '', image: avatar };
    case 'MediaDataChangeNotification':
      return { ...base, kind: 'data', code: 'dataChange', url: n.media?.siteUrl || '', image: cover };
    case 'MediaMergeNotification':
      return { ...base, kind: 'data', code: 'merge', url: n.media?.siteUrl || '', image: cover };
    case 'MediaDeletionNotification':
      return { ...base, kind: 'data', code: 'deleted', media: n.deletedMediaTitle || '' };
    default:
      return null;
  }
}

function mapNotifications(data: any): Notification[] {
  const out: Notification[] = [];
  for (const n of data.Page?.notifications || []) {
    const p = notifParts(n);
    if (p) out.push({ id: n.id, createdAt: n.createdAt || 0, ...p });
  }
  return out;
}

export async function getNotifications(): Promise<Notification[]> {
  return mapNotifications(await gql(notifQuery(false)));
}

// Notificaciones sin leer (AniList no marca cada una: son las N más recientes).
export async function getUnreadCount(): Promise<number> {
  const data = await gql('query { Viewer { unreadNotificationCount } }');
  return data.Viewer?.unreadNotificationCount || 0;
}

// `resetNotificationCount: true` pone el contador de AniList en 0 al cargar.
export async function markNotificationsRead(): Promise<void> {
  await gql(notifQuery(true));
}


// --- Buscador global ----------------------------------------------------------

export const SEARCH_PAGE_SIZE = 12;

const SEARCH_QUERY = `
query ($q: String, $page: Int, $type: MediaType) {
  Page(page: $page, perPage: ${SEARCH_PAGE_SIZE}) {
    pageInfo { hasNextPage }
    media(search: $q, type: $type, sort: SEARCH_MATCH) { ...M }
  }
}
fragment M on Media {
  id
  format
  status
  episodes
  chapters
  averageScore
  startDate { year }
  title { userPreferred }
  coverImage { large }
  mediaListEntry { status }
}`;

// Una página de resultados de un tipo en AniList (solo AniList; no se cruza con MAL).
export async function searchPage(q: string, type: MediaType, page: number): Promise<SearchPage> {
  const data = await gql(SEARCH_QUERY, { q, type: type.toUpperCase(), page });
  const p = data.Page;
  return {
    items: (p?.media || []).map((m: any) => ({
      provider: 'anilist' as const,
      id: m.id as number,
      type,
      title: m.title.userPreferred as string,
      image: (m.coverImage?.large || '') as string,
      score: (m.averageScore ?? null) as number | null,
      format: m.format ? String(m.format).replace(/_/g, ' ') : '',
      year: (m.startDate?.year ?? null) as number | null,
      status: statusCode(m.status),
      total: ((type === 'anime' ? m.episodes : m.chapters) || 0) as number,
      inList: FROM_ANI[m.mediaListEntry?.status] || null,
    })),
    hasMore: !!p?.pageInfo?.hasNextPage,
  };
}
