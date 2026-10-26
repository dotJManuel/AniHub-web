import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import { siteName } from '../components/Tile';
import { useToast } from '../hooks';
import * as service from '../lib/service';
import type { Detail as DetailT, EntryInput, Link as LinkT, MediaType, ServiceId, ServiceList, Status } from '../types';

function statusOptions(type: MediaType): [Status, string][] {
  const anime = type === 'anime';
  return [
    ['WATCHING', anime ? 'Watching' : 'Reading'],
    ['PLANNING', anime ? 'Plan to Watch' : 'Plan to Read'],
    ['COMPLETED', 'Completed'],
    ['PAUSED', 'On Hold'],
    ['DROPPED', 'Dropped'],
    ['REPEATING', anime ? 'Rewatching' : 'Rereading'],
  ];
}

function LinkChip({ l }: { l: LinkT }) {
  let host = '';
  try {
    host = new URL(l.url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const icon = l.icon || (host ? `https://www.google.com/s2/favicons?sz=64&domain=${host}` : '');
  return (
    <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-chip">
      {icon && <img className="link-ico" src={icon} alt="" />}
      <span>{l.site}</span>
    </a>
  );
}

export default function Detail() {
  const params = useParams();
  const svc = params.service as ServiceId;
  const type = params.type as MediaType;
  const id = Number(params.id);
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: ['detail', svc, type, id],
    queryFn: () => service.getDetail(svc, type, id),
  });
  // Jikan es lento y con rate-limit: se muestra el detalle ya y esto llega después.
  const extras = useQuery({
    queryKey: ['extras', svc, type, id],
    queryFn: () => service.getExtras(svc, type, id),
    enabled: svc === 'mal',
  });

  return (
    <div className="app">
      <Header />
      <main className="content">
        <div className="detail-topbar">
          <button className="back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            ← Back
          </button>
          {detail.data && (
            <a className="open-link" href={detail.data.siteUrl} target="_blank" rel="noopener noreferrer">
              ↗ Open on {siteName(svc)}
            </a>
          )}
        </div>
        {detail.isPending && <div className="empty">Loading details…</div>}
        {detail.isError && <div className="banner err">{(detail.error as Error).message}</div>}
        {detail.data && (
          <DetailBody
            key={`${svc}-${type}-${id}`}
            d={{
              ...detail.data,
              characters: extras.data?.characters ?? detail.data.characters,
              streaming: extras.data?.streaming ?? detail.data.streaming,
              externalLinks: extras.data?.externalLinks ?? detail.data.externalLinks,
            }}
            loadingExtras={svc === 'mal' && extras.isPending}
          />
        )}
      </main>
    </div>
  );
}

function DetailBody({ d, loadingExtras }: { d: DetailT; loadingExtras: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const totalLabel = d.type === 'anime' ? 'Episodes' : 'Chapters';
  const behind = d.airingEp != null ? Math.max(0, d.airingEp - (d.my.progress || 0)) : 0;

  const [entry, setEntry] = useState<EntryInput>({
    status: d.my.status || 'WATCHING',
    score: d.my.score || 0,
    progress: d.my.progress || 0,
    startDate: d.my.startDate || '',
    finishDate: d.my.finishDate || '',
  });
  const patch = (p: Partial<EntryInput>) => setEntry((e) => ({ ...e, ...p }));

  // Vista previa de la portada a tamaño completo; se cierra con clic fuera o Esc.
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const save = useMutation({
    mutationFn: () => service.setEntry(d.provider, d.type, d.id, entry),
    onSuccess: () => {
      // Mantiene la lista en caché sincronizada con lo guardado.
      queryClient.setQueryData<ServiceList>(['list', d.provider], (old) =>
        old
          ? {
              ...old,
              [d.type]: old[d.type].map((x) =>
                x.id === d.id ? { ...x, progress: entry.progress, score: entry.score } : x,
              ),
            }
          : old,
      );
      queryClient.invalidateQueries({ queryKey: ['detail', d.provider, d.type, d.id] });
      toast(`Saved on ${siteName(d.provider)}`);
    },
    onError: (e: Error) => toast(e.message, true),
  });

  const stat = (k: string, v: React.ReactNode) => (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );

  return (
    <>
      {zoom && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={d.title} onClick={() => setZoom(false)}>
          <img src={d.image} alt={d.title} onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" aria-label="Cerrar" onClick={() => setZoom(false)}>
            ✕
          </button>
        </div>
      )}
      <div className="detail-head">
        {d.image && (
          <img
            className="cover zoomable"
            src={d.image}
            alt={d.title}
            title="Ver imagen completa"
            onClick={() => setZoom(true)}
          />
        )}
        <div className="detail-headinfo">
          <div className="detail-title">{d.title}</div>
          {d.titles.english && d.titles.english !== d.title && <div className="muted">{d.titles.english}</div>}
          <div className="meta">
            {d.format && <span className="tag">{d.format}</span>}
            <span className="tag">{d.status}</span>
            {d.season && <span className="tag">{d.season}</span>}
            {behind > 0 && <span className="tag behind-tag">⏳ {behind} behind</span>}
          </div>
        </div>
      </div>

      <div className="stats">
        {stat('Score', d.score ? `${d.score} /${d.scoreMax}` : '—')}
        {stat('Ranked', d.rank ? `#${d.rank}` : '—')}
        {stat('Popularity', d.popularity ? `#${d.popularity}` : '—')}
        {stat(d.membersLabel, d.members != null ? d.members.toLocaleString() : '—')}
        {stat(totalLabel, d.episodes ?? '—')}
        {d.type === 'manga' && stat('Volumes', d.volumes ?? '—')}
        {d.airingEp != null && stat('Aired', d.airingEp)}
        {d.airingEp != null && stat('Behind', behind)}
      </div>

      <div className="section-title">My List</div>
      <form
        className="edit"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Status
          <select value={entry.status} onChange={(e) => patch({ status: e.target.value as Status })}>
            {statusOptions(d.type).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="edit-row">
          <label>
            My Score (0–{d.my.scoreMax})
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={d.my.scoreMax}
              value={entry.score}
              onChange={(e) => patch({ score: Number(e.target.value) })}
            />
          </label>
          <label>
            Progress{d.episodes ? ` (/${d.episodes})` : ''}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={entry.progress}
              onChange={(e) => patch({ progress: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="edit-row">
          <label>
            Start Date
            <input type="date" value={entry.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
          </label>
          <label>
            Finish Date
            <input type="date" value={entry.finishDate} onChange={(e) => patch({ finishDate: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="btn-accent save" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      {d.genres.length > 0 && (
        <>
          <div className="section-title">Genres</div>
          <div className="chips">{d.genres.map((g) => <span key={g} className="chip">{g}</span>)}</div>
        </>
      )}
      {d.studios.length > 0 && (
        <>
          <div className="section-title">Studios</div>
          <div className="chips">{d.studios.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        </>
      )}
      {d.source && (
        <>
          <div className="section-title">Source</div>
          <div className="desc">{d.source}</div>
        </>
      )}
      {d.description && (
        <>
          <div className="section-title">Synopsis</div>
          <div className="desc" style={{ whiteSpace: 'pre-line' }}>{d.description}</div>
        </>
      )}
      {d.streaming.length > 0 && (
        <>
          <div className="section-title">Streaming</div>
          <div className="links">{d.streaming.map((l) => <LinkChip key={l.url} l={l} />)}</div>
        </>
      )}
      {d.externalLinks.length > 0 && (
        <>
          <div className="section-title">External Links</div>
          <div className="links">{d.externalLinks.map((l) => <LinkChip key={l.url} l={l} />)}</div>
        </>
      )}
      {d.characters.length > 0 && (
        <>
          <div className="section-title">Characters</div>
          <div className="chars">
            {d.characters.map((c, i) => (
              <div className="char" key={`${c.name}-${i}`}>
                {c.image && <img className="cover" src={c.image} alt="" loading="lazy" />}
                <div className="char-name">{c.name}</div>
                {c.role && <div className="muted role">{c.role}</div>}
              </div>
            ))}
          </div>
        </>
      )}
      {loadingExtras && <div className="notif-empty">Loading characters &amp; links…</div>}
      <p className="muted foot">
        <Link to="/">← Volver a la lista</Link>
      </p>
    </>
  );
}
