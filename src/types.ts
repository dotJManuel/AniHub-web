export type ServiceId = 'mal' | 'anilist';
export type MediaType = 'anime' | 'manga';
export type Status = 'WATCHING' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';
export type Release = 'releasing' | 'finished' | 'other';

export interface ListItem {
  provider: ServiceId;
  id: number;
  title: string;
  total: number;
  image: string;
  status: Status;
  release: Release;
  airingEp: number | null;
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
  airingEp: number | null;
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

export interface Notification {
  id: number;
  text: string;
  url: string;
  image: string;
  createdAt: number;
}
