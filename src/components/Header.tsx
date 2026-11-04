import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStatus, useT, useTheme } from '../hooks';
import * as service from '../lib/service';
import type { ServiceId } from '../types';
import { IconArrowLeft, IconBell, IconMoon, IconRefresh, IconSearch, IconSliders, IconSun } from './Icons';
import Segmented, { type SegOption } from './Segmented';

export const SOURCES: SegOption<ServiceId>[] = [
  { id: 'mal', label: 'MyAnimeList' },
  { id: 'anilist', label: 'AniList' },
];

// Notificaciones sin leer de AniList (MAL no tiene API de notificaciones).
export function useUnreadCount() {
  const status = useAuthStatus();
  return useQuery({
    queryKey: ['unread'],
    queryFn: service.getUnreadCount,
    enabled: status.anilist,
    refetchInterval: 5 * 60_000,
  });
}

export function ThemeButton() {
  const t = useT();
  const { resolved, toggle } = useTheme();
  return (
    <button className="ibtn" onClick={toggle} aria-label={t('hdr.theme')} title={t('hdr.theme')}>
      {resolved === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}

export function Logo() {
  const t = useT();
  return (
    <Link to="/" className="logo" aria-label={t('app.home')}>
      <span className="logo-mark" aria-hidden="true">
        {/* ojo estilo anime con destello (misma figura que el ícono de la PWA) */}
        <svg viewBox="120 110 272 272" width="22" height="22" fill="none">
          <path d="M146 250 Q256 146 366 250" stroke="currentColor" strokeWidth="32" strokeLinecap="round" />
          <circle cx="256" cy="288" r="64" fill="currentColor" />
          <circle cx="234" cy="266" r="22" fill="var(--ac)" />
          <path d="M364 150 L372 172 L394 180 L372 188 L364 210 L356 188 L334 180 L356 172 Z" fill="currentColor" />
        </svg>
      </span>
      <span className="logo-word mono">anihub</span>
    </Link>
  );
}

// Header principal (Lista): logo, fuente MAL | AniList y acciones.
export function MainHeader({
  source,
  onSource,
  hideSync,
}: {
  source: ServiceId;
  onSource: (s: ServiceId) => void;
  hideSync?: boolean;
}) {
  const t = useT();
  const status = useAuthStatus();
  const queryClient = useQueryClient();
  const syncing = useIsFetching({ queryKey: ['list'] }) > 0;
  const unread = useUnreadCount();
  const sources = SOURCES.filter((s) => status[s.id]);

  const sync = () => {
    queryClient.invalidateQueries({ queryKey: ['list'] });
    queryClient.invalidateQueries({ queryKey: ['unread'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <header className="hdr">
      <div className="hdr-in container">
        <Logo />
        {sources.length > 1 && (
          <Segmented className="hdr-seg" label={t('hdr.source')} value={source} options={sources} onChange={onSource} />
        )}
        <div className="grow" />
        <div className="hdr-actions">
          <Link to="/search" className="ibtn hide-m" aria-label={t('nav.search')} title={t('nav.search')}>
            <IconSearch />
          </Link>
          {!hideSync && (
            <button className={`ibtn${syncing ? ' spin' : ''}`} onClick={sync} aria-label={t('hdr.sync')} title={t('hdr.sync')}>
            <IconRefresh />
          </button>
          )}
          {status.anilist && (
            <Link to="/notifications" className="ibtn hide-m" aria-label={t('hdr.notifications')} title={t('hdr.notifications')}>
              <IconBell />
              {!!unread.data && <span className="dot" />}
            </Link>
          )}
          <ThemeButton />
          <Link to="/settings" className="ibtn hide-m" aria-label={t('nav.settings')} title={t('nav.settings')}>
            <IconSliders />
          </Link>
        </div>
      </div>
    </header>
  );
}

// Header secundario (Detalle, Ajustes, Actividad): volver + ruta + acciones.
export function SubHeader({
  backTo = '/',
  backLabel,
  path,
  narrow,
  children,
  showTheme = true,
}: {
  backTo?: string;
  backLabel: string;
  path: string;
  narrow?: boolean;
  children?: ReactNode;
  showTheme?: boolean;
}) {
  return (
    <header className="hdr">
      <div className={`hdr-in container${narrow ? ' narrow' : ''}`} style={{ gap: 12 }}>
        <Link to={backTo} className="btn">
          <IconArrowLeft size={16} />
          {backLabel}
        </Link>
        <span className="route-path">{path}</span>
        <div className="grow" />
        {children}
        {showTheme && <ThemeButton />}
      </div>
    </header>
  );
}
