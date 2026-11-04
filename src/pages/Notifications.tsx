import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { SubHeader, useUnreadCount } from '../components/Header';
import { IconArrowLeft, IconCheckAll } from '../components/Icons';
import { useAuthStatus, useT, useToast, type TFn } from '../hooks';
import { initials, timeAgo } from '../lib/format';
import type { Key } from '../lib/i18n';
import * as service from '../lib/service';
import type { Notification } from '../types';

type Filter = 'all' | 'episode' | 'site';

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// La frase se arma aquí, en el idioma de la app; los nombres (usuario, título, hilo) vienen tal cual de AniList.
function notifText(n: Notification, t: TFn): string {
  const p = {
    user: n.user || t('notif.someone'),
    media: n.media,
    thread: n.thread || t('notif.thread'),
    ep: n.episode ?? '',
  };
  if (n.code === 'deleted' && !n.media) return t('notif.deleted', { media: t('notif.entry') });
  return t(`notif.${n.code}` as Key, p);
}

function Row({ n, unread, t }: { n: Notification; unread: boolean; t: TFn }) {
  const text = notifText(n, t);
  const h = hueOf(text);
  const inner = (
    <>
      <span
        className="th"
        style={{ background: `linear-gradient(160deg, oklch(0.52 0.13 ${h}), oklch(0.28 0.08 ${h}))` }}
      >
        {initials(text)}
        {n.image && <img src={n.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      </span>
      <span className="tx">
        <span className={`kind mono ${n.kind}`}>{t(`kind.${n.kind}` as Key)}</span>
        <span className="body">{text}</span>
      </span>
      <span className="side">
        <span className="ago">{timeAgo(n.createdAt)}</span>
        {unread && <span className="unread" aria-label={t('act.unread')} />}
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
  const t = useT();
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
      toast(t('act.markedAll'));
    },
    onError: (e: Error) => toast(t('act.markFail', { msg: e.message }), true),
  });

  // AniList no marca cada notificación: las N más recientes son las no leídas.
  const unreadIds = useMemo(() => new Set((q.data ?? []).slice(0, unreadCount).map((n) => n.id)), [q.data, unreadCount]);

  const sections = useMemo(() => {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const list = (q.data ?? []).filter((n) => filter === 'all' || n.kind === filter);
    return [
      { key: 'week', label: t('act.thisWeek'), items: list.filter((n) => n.createdAt >= weekAgo) },
      { key: 'before', label: t('act.earlier'), items: list.filter((n) => n.createdAt < weekAgo) },
    ].filter((s) => s.items.length);
  }, [q.data, filter, t]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('act.fAll') },
    { id: 'episode', label: t('act.fEpisodes') },
    { id: 'site', label: t('act.fSite') },
  ];

  return (
    <>
      <div className="hide-m">
        <SubHeader backLabel={t('back.list')} path="~/activity" />
      </div>
      <main className="container page has-nav" style={{ gap: 16 }}>
        <div className="act-head">
          <button className="ibtn hide-d" onClick={back} aria-label={t('back.generic')}>
            <IconArrowLeft />
          </button>
          <div className="ttl">
            <h1>{t('act.title')}</h1>
            {status.anilist && q.data && (
              <span className="meta">{t('act.meta', { n: q.data.length, u: unreadCount })}</span>
            )}
          </div>
          {status.anilist && unreadCount > 0 && (
            <>
              <button className="ibtn hide-d" onClick={() => markAll.mutate()} disabled={markAll.isPending} aria-label={t('act.markAll')}>
                <IconCheckAll />
              </button>
              <button className="btn hide-m" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                <IconCheckAll size={16} />
                {t('act.markAll')}
              </button>
            </>
          )}
        </div>

        {!status.anilist ? (
          <div className="banner">
            <p>{t('act.onlyAniList')}</p>
            <Link to="/settings" className="btn pri">
              {t('act.connectAniList')}
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
            {q.isPending && <div className="empty">{t('act.loading')}</div>}
            {q.isError && (
              <div className="banner err">
                <p>{(q.error as Error).message}</p>
              </div>
            )}
            {q.data && !sections.length && <div className="empty">{t('act.none')}</div>}
            <div className="act-list">
              {sections.map((s) => (
                <div key={s.key} style={{ display: 'contents' }}>
                  <div className="sec-head">
                    <span className="lbl mono">// {s.label}</span>
                    <span className="rule" />
                  </div>
                  {s.items.map((n) => (
                    <Row key={n.id} n={n} unread={unreadIds.has(n.id)} t={t} />
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
