// Fachada por servicio. Cada pestaña de la UI usa esto para su propio sitio.
import * as anilist from '../providers/anilist';
import * as mal from '../providers/mal';
import { computeStatus } from './model';
import { convertScore } from './format';
import * as storage from './storage';
import type {
  Detail,
  EntryInput,
  Extras,
  ListItem,
  MediaType,
  Notification,
  ServiceId,
  ServiceList,
} from '../types';

// MAL no tiene "próximo episodio": se pide a AniList por idMal (consulta pública, un
// solo request). Si falla, las tarjetas simplemente no muestran la insignia.
async function withAiring(items: ListItem[]): Promise<ListItem[]> {
  const airing = items.filter((i) => i.release === 'releasing');
  if (!airing.length) return items;
  try {
    const map = await anilist.getAiringByMalIds(airing.map((i) => i.id));
    return items.map((i) => {
      const hit = map.get(i.id);
      return hit ? { ...i, next: hit.next, airingEp: hit.airingEp } : i;
    });
  } catch {
    return items;
  }
}

export async function getList(service: ServiceId): Promise<ServiceList> {
  const out: ServiceList = { service, anime: [], manga: [], errors: [] };
  const provider = service === 'mal' ? mal : anilist;
  await Promise.all(
    (['anime', 'manga'] as MediaType[]).map(async (type) => {
      try {
        out[type] = await provider.getCurrent(type);
      } catch (e) {
        out.errors.push(`${type}: ${(e as Error).message}`);
      }
    }),
  );
  if (service === 'mal') out.anime = await withAiring(out.anime);
  if (!out.errors.length) storage.markSynced(service);
  return out;
}

export function getDetail(service: ServiceId, type: MediaType, id: number): Promise<Detail> {
  return service === 'mal' ? mal.getDetail(id, type) : anilist.getDetail(id, type);
}

// Solo MAL los pide aparte (Jikan); AniList ya los trae en getDetail.
export async function getExtras(service: ServiceId, type: MediaType, id: number): Promise<Extras | null> {
  return service === 'mal' ? mal.getExtras(id, type) : null;
}

// Id del mismo título en el otro servicio (null si no se puede emparejar).
// AniList -> MAL: Media.idMal. MAL -> AniList: Media(idMal:) público.
export async function getCounterpartId(
  service: ServiceId,
  type: MediaType,
  id: number,
  idMal: number | null,
): Promise<number | null> {
  if (service === 'anilist') return idMal;
  try {
    return await anilist.findIdByMal(id, type);
  } catch {
    return null;
  }
}

export async function setProgress(
  service: ServiceId,
  type: MediaType,
  id: number,
  progress: number,
  total: number,
) {
  const status = computeStatus(progress, Number(total) || 0);
  if (service === 'anilist') await anilist.save(id, progress, status);
  else await mal.save(id, type, progress, status);
  return { progress, status };
}

export function setEntry(service: ServiceId, type: MediaType, id: number, entry: EntryInput) {
  return service === 'mal' ? mal.saveEntry(id, type, entry) : anilist.saveEntry(id, entry);
}

// Guarda la misma entrada en uno o varios servicios, convirtiendo la nota a la escala de cada uno.
// `from` es el servicio en cuya escala está `entry.score`.
export async function setEntryEverywhere(
  type: MediaType,
  targets: { service: ServiceId; id: number }[],
  entry: EntryInput,
  from: ServiceId,
): Promise<{ service: ServiceId; error: string | null }[]> {
  return Promise.all(
    targets.map(async (t) => {
      try {
        await setEntry(t.service, type, t.id, { ...entry, score: convertScore(entry.score, from, t.service) });
        return { service: t.service, error: null };
      } catch (e) {
        return { service: t.service, error: (e as Error).message };
      }
    }),
  );
}

// MAL no tiene API de notificaciones.
export const getNotifications = (): Promise<Notification[]> => anilist.getNotifications();
export const getUnreadCount = () => anilist.getUnreadCount();
export const markNotificationsRead = () => anilist.markNotificationsRead();

// Usuario conectado de cada servicio (se guarda para no repetir la petición).
export async function getUser(service: ServiceId): Promise<{ id: number; name: string } | null> {
  if (service === 'mal') {
    const cached = storage.getMalUser();
    if (cached) return cached;
    const me = await mal.getMe();
    storage.setMalUser(me);
    return me;
  }
  const cached = storage.getAnilistUser();
  if (cached) return cached;
  return anilist.getViewer();
}
