// Provider de AniList (GraphQL). AniList sí envía CORS, así que se llama directo.
import { ANILIST } from '../config';
import * as storage from '../lib/storage';
import type {
  Detail,
  EntryInput,
  ListItem,
  MediaType,
  NextEpisode,
  Notification,
  NotificationKind,
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
  if (auth && !token) throw new Error('No autenticado en AniList.');
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
      throw new Error('La sesión de AniList no es válida. Vuelve a conectar.');
    }
    throw new Error(e.message || 'Error de AniList');
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

const LIST_QUERY = `
query ($userId: Int, $type: MediaType) {
  MediaListCollection(userId: $userId, type: $type, status_in: [CURRENT, REPEATING]) {
    lists {
      entries {
        id
        progress
        score(format: POINT_100)
        status
        media {
          id
          status
          episodes
          chapters
          idMal
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

export async function getCurrent(type: MediaType): Promise<ListItem[]> {
  const viewer = await getViewer();
  const data = await gql(LIST_QUERY, { userId: viewer.id, type: type.toUpperCase() });
  const items: ListItem[] = [];
  for (const list of data.MediaListCollection?.lists || []) {
    for (const e of list.entries) {
      items.push({
        provider: 'anilist',
        id: e.media.id,
        idMal: e.media.idMal || null,
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
      });
    }
  }
  return items;
}

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
function humanStatus(s: string) {
  const map: Record<string, string> = {
    RELEASING: 'En emisión',
    FINISHED: 'Finalizado',
    NOT_YET_RELEASED: 'Sin estrenar',
    CANCELLED: 'Cancelado',
    HIATUS: 'En pausa',
  };
  return map[s] || s || '—';
}

const DETAIL_QUERY = `
query ($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    id idMal type siteUrl
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
    idMal: m.idMal || null,
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
    status: humanStatus(m.status),
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

function notifText(n: any): { kind: NotificationKind; text: string; url?: string; image?: string } | null {
  const user = n.user?.name || 'Alguien';
  const media = n.media?.title?.userPreferred || '';
  const cover = n.media?.coverImage?.medium || '';
  const avatar = n.user?.avatar?.medium || '';
  switch (n.__typename) {
    case 'AiringNotification':
      return { kind: 'episode', text: `Episodio ${n.episode} de ${media}`, url: n.media?.siteUrl, image: cover };
    case 'RelatedMediaAdditionNotification':
      return { kind: 'site', text: media, url: n.media?.siteUrl, image: cover };
    case 'FollowingNotification':
      return { kind: 'follow', text: `${user} empezó a seguirte`, url: n.user?.siteUrl, image: avatar };
    case 'ActivityMentionNotification':
      return { kind: 'activity', text: `${user} te mencionó`, image: avatar };
    case 'ActivityReplyNotification':
      return { kind: 'activity', text: `${user} respondió a tu actividad`, image: avatar };
    case 'ActivityLikeNotification':
      return { kind: 'activity', text: `A ${user} le gustó tu actividad`, image: avatar };
    case 'ActivityReplyLikeNotification':
      return { kind: 'activity', text: `A ${user} le gustó tu respuesta`, image: avatar };
    case 'ThreadCommentReplyNotification':
      return { kind: 'thread', text: `${user} respondió en ${n.thread?.title || 'un hilo'}`, url: n.thread?.siteUrl, image: avatar };
    case 'MediaDataChangeNotification':
      return { kind: 'data', text: `${media}: datos actualizados`, url: n.media?.siteUrl, image: cover };
    case 'MediaMergeNotification':
      return { kind: 'data', text: `${media}: entradas fusionadas`, url: n.media?.siteUrl, image: cover };
    case 'MediaDeletionNotification':
      return { kind: 'data', text: `${n.deletedMediaTitle || 'Una entrada'} fue eliminada` };
    default:
      return null;
  }
}

function mapNotifications(data: any): Notification[] {
  const out: Notification[] = [];
  for (const n of data.Page?.notifications || []) {
    const m = notifText(n);
    if (m) {
      out.push({
        id: n.id,
        kind: m.kind,
        text: m.text,
        url: m.url || '',
        image: m.image || '',
        createdAt: n.createdAt || 0,
      });
    }
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

// --- Consultas públicas (sin token) para cruzar MAL <-> AniList ---------------

// Próximo episodio de varios animes de MAL, por idMal, en una sola petición.
export async function getAiringByMalIds(
  malIds: number[],
): Promise<Map<number, { next: NextEpisode | null; airingEp: number | null }>> {
  const out = new Map<number, { next: NextEpisode | null; airingEp: number | null }>();
  const ids = [...new Set(malIds)].slice(0, 50);
  if (!ids.length) return out;
  const data = await gql(
    `query ($ids: [Int]) {
      Page(perPage: 50) {
        media(idMal_in: $ids, type: ANIME) { idMal nextAiringEpisode { episode timeUntilAiring } }
      }
    }`,
    { ids },
    { auth: false },
  );
  for (const m of data.Page?.media || []) {
    const next = nextOf(m.nextAiringEpisode);
    out.set(m.idMal, { next, airingEp: next ? next.episode - 1 : null });
  }
  return out;
}

