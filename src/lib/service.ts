// Fachada por servicio. Cada pestaña de la UI usa esto para su propio sitio.
import * as anilist from '../providers/anilist';
import * as mal from '../providers/mal';
import { computeStatus } from './model';
import * as storage from './storage';
import type {
  Detail,
  EntryInput,
  Extras,
  ListStatus,
  MediaType,
  Notification,
  SearchPage,
  ServiceId,
  ServiceList,
} from '../types';

export async function getList(service: ServiceId, status: ListStatus = 'WATCHING'): Promise<ServiceList> {
  const out: ServiceList = { service, anime: [], manga: [], errors: [] };
  const provider = service === 'mal' ? mal : anilist;
  await Promise.all(
    (['anime', 'manga'] as MediaType[]).map(async (type) => {
      try {
        out[type] = await provider.getByStatus(type, status);
      } catch (e) {
        out.errors.push(`${type}: ${(e as Error).message}`);
      }
    }),
  );
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

// Buscador global: una página (12) de resultados de un tipo, solo en el sitio indicado.
export function searchPage(service: ServiceId, q: string, type: MediaType, page: number): Promise<SearchPage> {
  return service === 'mal' ? mal.searchPage(q, type, page) : anilist.searchPage(q, type, page);
}
