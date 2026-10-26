// Fachada por servicio. Cada pestaña de la UI usa esto para su propio sitio.
import * as anilist from '../providers/anilist';
import * as mal from '../providers/mal';
import { computeStatus } from './model';
import type {
  Detail,
  EntryInput,
  Extras,
  MediaType,
  Notification,
  ServiceId,
  ServiceList,
} from '../types';

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
