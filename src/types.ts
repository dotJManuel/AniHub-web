export type ServiceId = 'mal' | 'anilist';
export type MediaType = 'anime' | 'manga';
export type Status = 'WATCHING' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';
export type Release = 'releasing' | 'finished' | 'other';

// Próximo episodio a emitir: `at` es el instante (epoch en segundos) en que sale.
export interface NextEpisode {
  episode: number;
  at: number;
}

export interface ListItem {
  provider: ServiceId;
  id: number;
  title: string;
  total: number;
  image: string;
  status: Status;
  release: Release;
  airingEp: number | null;
  next: NextEpisode | null;
  progress: number;
  score: number;
}

export interface ServiceList {
  service: ServiceId;
  anime: ListItem[];
  manga: ListItem[];
  errors: string[];
}

export interface Link {
  site: string;
  url: string;
  icon: string;
}

export interface Character {
  name: string;
  role: string;
  image: string;
}

export interface MyEntry {
  status: Status | null;
  score: number;
  scoreMax: number;
  progress: number;
  startDate: string;
  finishDate: string;
}

export interface Detail {
  provider: ServiceId;
  id: number;
  type: MediaType;
  siteUrl: string;
  title: string;
  titles: { romaji: string; english: string; native: string };
  image: string;
  banner: string;
  score: number | null;
  scoreMax: number;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  membersLabel: string;
  status: string;
  release: Release;
  airingEp: number | null;
  next: NextEpisode | null;
  episodes: number | null;
  volumes: number | null;
  format: string;
  season: string;
  genres: string[];
  studios: string[];
  source: string;
  description: string;
  externalLinks: Link[];
  streaming: Link[];
  characters: Character[];
  my: MyEntry;
}

export interface Extras {
  characters: Character[];
  streaming: Link[];
  externalLinks: Link[];
}

export interface EntryInput {
  status: Status;
  score: number;
  progress: number;
  startDate: string;
  finishDate: string;
}

export type NotificationKind = 'episode' | 'site' | 'follow' | 'activity' | 'thread' | 'data' | 'other';

export interface Notification {
  id: number;
  kind: NotificationKind;
  text: string;
  url: string;
  image: string;
  createdAt: number;
}

export type ScaleSetting = 'orig' | '10' | '100';
export type ThemePref = 'system' | 'light' | 'dark';

// Resultado del buscador global (de un solo sitio: cada sitio es independiente).
export interface SearchResult {
  provider: ServiceId;
  id: number;
  type: MediaType;
  title: string;
  image: string;
  score: number | null; // en la escala nativa del sitio
  format: string;
  year: number | null;
  status: string;
  total: number;
  inList: Status | null; // estado en tu lista, si ya está
}

// Una página (12) de resultados de un tipo, con la señal de si hay más.
export interface SearchPage {
  items: SearchResult[];
  hasMore: boolean;
}

// Estados de lista que se pueden ver en "Mi lista" (REPEATING cuenta como "viendo").
export type ListStatus = 'WATCHING' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING';
export const LIST_STATUSES: ListStatus[] = ['WATCHING', 'COMPLETED', 'PAUSED', 'DROPPED', 'PLANNING'];
