import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStatus, useTheme } from '../hooks';
import * as service from '../lib/service';
import type { ServiceId } from '../types';
import { IconArrowLeft, IconBell, IconMoon, IconRefresh, IconSliders, IconSun } from './Icons';
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
  const { resolved, toggle } = useTheme();
  return (
    <button className="ibtn" onClick={toggle} aria-label="Cambiar tema" title="Cambiar tema">
      {resolved === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="AniHub — inicio">
      <span className="logo-mark mono">&gt;_</span>
      <span className="logo-word mono">anihub</span>
    </Link>
  );
}

// Header principal (Lista): logo, fuente MAL | AniList y acciones.
export function MainHeader({ source, onSource }: { source: ServiceId; onSource: (s: ServiceId) => void }) {
  const status = useAuthStatus();
  const queryClient = useQueryClient();
  const syncing = useIsFetching({ queryKey: ['list'] }) > 0;
  const unread = useUnreadCount();

  const sync = () => {
    queryClient.invalidateQueries({ queryKey: ['list'] });
    queryClient.invalidateQueries({ queryKey: ['unread'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <header className="hdr">
      <div className="hdr-in container">
        <Logo />
        <Segmented className="hdr-seg" label="Fuente" value={source} options={SOURCES} onChange={onSource} />
        <div className="grow" />
        <div className="hdr-actions">
          <button className={`ibtn${syncing ? ' spin' : ''}`} onClick={sync} aria-label="Sincronizar" title="Sincronizar">
            <IconRefresh />
          </button>
          {status.anilist && (
            <Link to="/notifications" className="ibtn hide-m" aria-label="Notificaciones" title="Notificaciones">
              <IconBell />
              {!!unread.data && <span className="dot" />}
            </Link>
          )}
          <ThemeButton />
          <Link to="/settings" className="ibtn hide-m" aria-label="Ajustes" title="Ajustes">
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
