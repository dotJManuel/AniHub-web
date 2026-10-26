import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Header from '../components/Header';
import { useAuthStatus } from '../hooks';
import * as service from '../lib/service';
import type { Notification } from '../types';

function timeAgo(unix: number) {
  if (!unix) return '';
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return `${Math.max(s, 0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Row({ n }: { n: Notification }) {
  const inner = (
    <>
      {n.image && <img className="notif-img" src={n.image} alt="" loading="lazy" />}
      <div className="notif-body">
        <span className="notif-text">{n.text}</span>
        <span className="notif-time">{timeAgo(n.createdAt)}</span>
      </div>
    </>
  );
  return n.url ? (
    <a className="notif" href={n.url} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className="notif">{inner}</div>
  );
}

// Solo AniList (MyAnimeList no tiene API de notificaciones).
export default function Notifications() {
  const navigate = useNavigate();
  const status = useAuthStatus();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: service.getNotifications,
    enabled: status.anilist,
  });

  return (
    <div className="app">
      <Header />
      <main className="content">
        <button className="back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          ← Back
        </button>
        {!status.anilist ? (
          <div className="notif-empty">
            Conecta AniList para ver notificaciones. <Link to="/settings">Ajustes</Link>
          </div>
        ) : q.isPending ? (
          <div className="empty">Loading notifications…</div>
        ) : q.isError ? (
          <div className="banner err">{(q.error as Error).message}</div>
        ) : (
          <>
            <div className="notif-source ani">AniList{q.data.length ? ` · ${q.data.length}` : ''}</div>
            {q.data.length ? (
              <div className="notif-list">{q.data.map((n) => <Row key={n.id} n={n} />)}</div>
            ) : (
              <div className="notif-empty">No notifications.</div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
