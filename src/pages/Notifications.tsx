import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { SubHeader, useUnreadCount } from '../components/Header';
import { IconArrowLeft, IconCheckAll } from '../components/Icons';
import { useAuthStatus, useToast } from '../hooks';
import { initials, timeAgo } from '../lib/format';
import * as service from '../lib/service';
import type { Notification, NotificationKind } from '../types';

type Filter = 'all' | 'episode' | 'site';

const KIND_LABEL: Record<NotificationKind, string> = {
  episode: 'NUEVO EPISODIO',
  site: 'AÑADIDO AL SITIO',
  follow: 'NUEVO SEGUIDOR',
  activity: 'ACTIVIDAD',
  thread: 'FORO',
  data: 'CAMBIO EN EL SITIO',
  other: 'AVISO',
};

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function Row({ n, unread }: { n: Notification; unread: boolean }) {
  const h = hueOf(n.text);
  const inner = (
    <>
      <span
        className="th"
        style={{ background: `linear-gradient(160deg, oklch(0.52 0.13 ${h}), oklch(0.28 0.08 ${h}))` }}
      >
        {initials(n.text)}
        {n.image && <img src={n.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      </span>
      <span className="tx">
        <span className={`kind mono ${n.kind}`}>{KIND_LABEL[n.kind]}</span>
        <span className="body">{n.text}</span>
      </span>
      <span className="side">
        <span className="ago">{timeAgo(n.createdAt)}</span>
        {unread && <span className="unread" aria-label="Sin leer" />}
      </span>
    </>
  );
  return n.url ? (
    <a className="nrow" href={n.url} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className="nrow">{inner}</div>
  );
}

// Actividad: solo AniList (MyAnimeList no tiene API de notificaciones).
export default function Notifications() {
  const navigate = useNavigate();
  const status = useAuthStatus();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const q = useQuery({ queryKey: ['notifications'], queryFn: service.getNotifications, enabled: status.anilist });
  const unreadCount = useUnreadCount().data ?? 0;

  const markAll = useMutation({
    mutationFn: service.markNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData(['unread'], 0);
      toast('Todo marcado como leído');
    },
    onError: (e: Error) => toast(`No se pudo marcar: ${e.message}`, true),
  });

  // AniList no marca cada notificación: las N más recientes son las no leídas.
  const unreadIds = useMemo(() => new Set((q.data ?? []).slice(0, unreadCount).map((n) => n.id)), [q.data, unreadCount]);

  const sections = useMemo(() => {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const list = (q.data ?? []).filter((n) => filter === 'all' || n.kind === filter);
    return [
      { label: 'ESTA SEMANA', items: list.filter((n) => n.createdAt >= weekAgo) },
      { label: 'ANTES', items: list.filter((n) => n.createdAt < weekAgo) },
    ].filter((s) => s.items.length);
  }, [q.data, filter]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todo' },
    { id: 'episode', label: 'Episodios' },
    { id: 'site', label: 'Nuevos en el sitio' },
  ];

  return (
    <>
      <div className="hide-m">
        <SubHeader backLabel="Mi lista" path="~/activity" />
      </div>
      <main className="container page has-nav" style={{ gap: 16 }}>
        <div className="act-head">
          <button className="ibtn hide-d" onClick={back} aria-label="Volver">
            <IconArrowLeft />
          </button>
          <div className="ttl">
            <h1>Actividad</h1>
            {status.anilist && q.data && (
              <span className="meta">
                AniList · {q.data.length} · {unreadCount} sin leer
              </span>
            )}
          </div>
          {status.anilist && unreadCount > 0 && (
            <>
              <button className="ibtn hide-d" onClick={() => markAll.mutate()} disabled={markAll.isPending} aria-label="Marcar todo como leído">
                <IconCheckAll />
              </button>
              <button className="btn hide-m" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                <IconCheckAll size={16} />
                Marcar todo como leído
              </button>
            </>
          )}
        </div>

        {!status.anilist ? (
          <div className="banner">
            <p>Las notificaciones solo están disponibles con AniList; MyAnimeList no ofrece esa API.</p>
            <Link to="/settings" className="btn pri">
              Conectar AniList
            </Link>
          </div>
        ) : (
          <>
            <div className="chips scroll">
              {filters.map((f) => (
                <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {q.isPending && <div className="empty">Cargando actividad…</div>}
            {q.isError && (
              <div className="banner err">
                <p>{(q.error as Error).message}</p>
              </div>
            )}
            {q.data && !sections.length && <div className="empty">No hay notificaciones.</div>}
            <div className="act-list">
              {sections.map((s) => (
                <div key={s.label} style={{ display: 'contents' }}>
                  <div className="sec-head">
                    <span className="lbl mono">// {s.label}</span>
                    <span className="rule" />
                  </div>
                  {s.items.map((n) => (
                    <Row key={n.id} n={n} unread={unreadIds.has(n.id)} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
