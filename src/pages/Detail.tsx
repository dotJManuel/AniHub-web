import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SubHeader } from '../components/Header';
import { IconArrowUpRight, IconClose, IconPlay } from '../components/Icons';
import StatPanel, { type StatCell } from '../components/StatPanel';
import { siteName } from '../components/Tile';
import { useToast } from '../hooks';
import { cleanSynopsis, fmtNum, initials, longCountdown, slugify } from '../lib/format';
import * as service from '../lib/service';
import type { Detail as DetailT, EntryInput, Link as LinkT, MediaType, ServiceId, ServiceList, Status } from '../types';

const STATUS_LABEL = (type: MediaType): [Status, string][] => [
  ['WATCHING', type === 'anime' ? 'Viendo' : 'Leyendo'],
  ['COMPLETED', 'Completado'],
  ['PAUSED', 'En pausa'],
  ['DROPPED', 'Dropeado'],
  ['PLANNING', 'Pendiente'],
];

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function Detail() {
  const params = useParams();
  const svc = params.service as ServiceId;
  const type = params.type as MediaType;
  const id = Number(params.id);

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
  const merged: DetailT | null = detail.data
    ? {
        ...detail.data,
        characters: extras.data?.characters ?? detail.data.characters,
        streaming: extras.data?.streaming ?? detail.data.streaming,
        externalLinks: extras.data?.externalLinks ?? detail.data.externalLinks,
      }
    : null;

  return (
    <>
      <SubHeader backLabel="Mi lista" path={`~/${type}/${merged ? slugify(merged.title) : '…'}`}>
        {/* Cada sitio es independiente: el detalle muestra y guarda solo en el sitio desde el que se abrió. */}
        <span className="pill" title="Fuente de los datos">{siteName(svc)}</span>
      </SubHeader>
      <main className="container detail">
        {detail.isPending && <div className="empty">Cargando detalle…</div>}
        {detail.isError && (
          <div className="banner err">
            <p>{(detail.error as Error).message}</p>
          </div>
        )}
        {merged && (
          <DetailBody
            key={`${svc}-${type}-${id}`}
            d={merged}
            loadingExtras={svc === 'mal' && extras.isPending}
          />
        )}
      </main>
    </>
  );
}

function DetailBody({ d, loadingExtras }: { d: DetailT; loadingExtras: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAnime = d.type === 'anime';

  // --- Vista previa de la portada (clic fuera o Esc para cerrar) ---
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  // --- Panel "Mi lista" ---
  const initial = useMemo<EntryInput>(
    () => ({
      status: d.my.status || 'WATCHING',
      score: d.my.score || 0,
      progress: d.my.progress || 0,
      startDate: d.my.startDate || '',
      finishDate: d.my.finishDate || '',
    }),
    [d.my],
  );
  // En móvil el panel va justo bajo la portada y arranca plegado (con un resumen); en escritorio siempre está abierto.
  const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
  const [open, setOpen] = useState(() => !isMobile());
  const [entry, setEntry] = useState<EntryInput>(initial);
  const [saved, setSaved] = useState<EntryInput>(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const patch = (p: Partial<EntryInput>) => {
    setFailed(false);
    setEntry((e) => ({ ...e, ...p }));
  };
  const dirty = JSON.stringify(entry) !== JSON.stringify(saved);
  const total = d.episodes || 0;
  const clampProgress = (n: number) => Math.max(0, total ? Math.min(total, n) : n);

  // Guarda solo en el sitio desde el que se abrió el detalle.
  const save = async () => {
    setSaving(true);
    try {
      await service.setEntry(d.provider, d.type, d.id, entry);
    } catch (e) {
      setSaving(false);
      setFailed(true);
      toast(`Falló en ${siteName(d.provider)}: ${(e as Error).message}`, true);
      return;
    }
    setSaving(false);
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
    setSaved(entry);
    if (isMobile()) setOpen(false);
    toast(`Guardado en ${siteName(d.provider)}`);
  };

  const statusName =
    entry.status === 'REPEATING'
      ? isAnime ? 'Reviendo' : 'Releyendo'
      : STATUS_LABEL(d.type).find(([v]) => v === entry.status)?.[1] ?? '';
  const summary = [
    statusName,
    `${isAnime ? 'EP' : 'CH'} ${entry.progress}${total ? ` / ${total}` : ''}`,
    entry.score > 0 ? `★ ${entry.score}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const syncLabel = saving ? '● guardando…' : failed ? '● error al guardar' : dirty ? '● sin guardar' : '● sincronizado';
  const syncCls = failed ? ' err' : dirty || saving ? ' dirty' : '';

  // --- Datos derivados ---
  const behind = d.airingEp != null ? Math.max(0, d.airingEp - (d.my.progress || 0)) : null;
  const syn = cleanSynopsis(d.description);
  const altTitles = [d.titles.english, d.titles.romaji, d.titles.native].filter(
    (t, i, a) => t && t !== d.title && a.indexOf(t) === i,
  );

  const cells: StatCell[] = [];
  if (d.score) cells.push({ k: 'SCORE', v: `${d.score}/${d.scoreMax}` });
  if (d.rank) cells.push({ k: 'RANKED', v: `#${fmtNum(d.rank)}` });
  if (d.popularity) cells.push({ k: 'POPULARITY', v: `#${fmtNum(d.popularity)}` });
  if (d.members != null) cells.push({ k: d.membersLabel.toUpperCase(), v: fmtNum(d.members) });
  cells.push({ k: isAnime ? 'EPISODES' : 'CHAPTERS', v: d.episodes != null ? fmtNum(d.episodes) : '—' });
  if (!isAnime && d.volumes) cells.push({ k: 'VOLUMES', v: fmtNum(d.volumes) });
  if (d.airingEp != null) cells.push({ k: 'AIRED', v: fmtNum(d.airingEp) });
  if (behind != null) cells.push({ k: 'BEHIND', v: fmtNum(behind) });
  if (d.provider === 'mal' && d.source) cells.push({ k: 'SOURCE', v: d.source.charAt(0).toUpperCase() + d.source.slice(1) });

  const studio = d.studios[0];
  const h = hueOf(d.title);

  return (
    <>
      {zoom && d.image && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={d.title} onClick={() => setZoom(false)}>
          <img src={d.image} alt={d.title} onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" aria-label="Cerrar" onClick={() => setZoom(false)}>
            <IconClose />
          </button>
        </div>
      )}

      <section className="hero">
        {d.image ? (
          <button className="hero-cover zoomable" onClick={() => setZoom(true)} title="Ver imagen completa" aria-label="Ver imagen completa">
            <img src={d.image} alt={d.title} />
          </button>
        ) : (
          <div
            className="hero-cover"
            style={{ background: `linear-gradient(160deg, oklch(0.52 0.13 ${h}), oklch(0.26 0.08 ${h}))` }}
          />
        )}
        <div className="hero-info">
          <div className="hero-head">
            <div className="row-wrap">
              <span className={`pill${d.release === 'releasing' ? ' live' : ''}`}>● {d.status}</span>
              {d.format && <span className="pill">{d.format}</span>}
              {d.season && <span className="pill">{d.season}</span>}
              {studio && <span className="pill">{studio}</span>}
            </div>
            <h1>{d.title}</h1>
            {altTitles.length > 0 && <p className="alt-title">{altTitles.join(' · ')}</p>}
          </div>
          <StatPanel cells={cells} />
          <div className="row-wrap gap10">
            <a className="btn" href={d.siteUrl} target="_blank" rel="noopener noreferrer">
              <IconArrowUpRight size={15} />
              Abrir en {siteName(d.provider)}
            </a>
            {d.streaming.map((l) => (
              <a key={l.url} className="btn" href={l.url} target="_blank" rel="noopener noreferrer">
                <IconPlay />
                {l.site}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="dbody">
        <div className="dmain">
          {syn.text && (
            <div className="dsec">
              <span className="lbl">// SINOPSIS</span>
              <p className="synopsis">{syn.text}</p>
              {syn.source && <span className="src-line">fuente: {syn.source}</span>}
            </div>
          )}
          {d.genres.length > 0 && (
            <div className="dsec">
              <span className="lbl">// GÉNEROS</span>
              <div className="row-wrap">
                {d.genres.map((g) => (
                  <span key={g} className="pill">{g}</span>
                ))}
              </div>
            </div>
          )}
          {d.characters.length > 0 && (
            <div className="dsec lg">
              <span className="lbl">// PERSONAJES</span>
              <div className="chars">
                {d.characters.map((c, i) => (
                  <div className="char" key={`${c.name}-${i}`}>
                    <span className="av" style={{ background: `oklch(0.45 0.1 ${hueOf(c.name)})` }}>
                      {initials(c.name)}
                      {c.image && <img src={c.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                    </span>
                    <span className="cn">
                      <b title={c.name}>{c.name}</b>
                      {c.role && <span>{c.role}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {loadingExtras && <span className="src-line">Cargando personajes y enlaces…</span>}
          {d.externalLinks.length > 0 && (
            <div className="dsec">
              <span className="lbl">// ENLACES</span>
              <div className="row-wrap">
                {d.externalLinks.map((l: LinkT) => (
                  <a key={l.url} className="pill" href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.site}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {open && <div className="sheet-backdrop hide-d" onClick={() => setOpen(false)} />}
        <aside className={`mylist${open ? '' : ' collapsed'}`} aria-label="Mi lista">
          <div className="mylist-head">
            <h2>Mi lista</h2>
            <span className={`sync-state${syncCls}`} role="status">{syncLabel}</span>
            <button
              className="btn sm hide-d mylist-toggle"
              aria-expanded={open}
              aria-controls="mylist-body"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Cerrar' : 'Editar'}
            </button>
          </div>
          <p className="mylist-sum mono hide-d">{summary}</p>

          <div className="mylist-body" id="mylist-body">

          <div className="fgroup">
            <span className="lbl">ESTADO</span>
            <div className="st-row">
              {STATUS_LABEL(d.type).map(([v, label]) => (
                <button key={v} className={`st${entry.status === v ? ' on' : ''}`} aria-pressed={entry.status === v} onClick={() => patch({ status: v })}>
                  {label}
                </button>
              ))}
              {entry.status === 'REPEATING' && (
                <button className="st on" aria-pressed="true">
                  {isAnime ? 'Reviendo' : 'Releyendo'}
                </button>
              )}
            </div>
          </div>

          <div className="fgroup">
            <label className="lbl" htmlFor="prog">PROGRESO · {isAnime ? 'EPISODIOS' : 'CAPÍTULOS'}</label>
            <div className="prog-ctl">
              <button className="mini" onClick={() => patch({ progress: clampProgress(entry.progress - 1) })} aria-label="Restar uno">−</button>
              <input
                id="prog"
                className="field"
                style={{ textAlign: 'center' }}
                type="number"
                inputMode="numeric"
                min={0}
                value={entry.progress}
                onChange={(e) => patch({ progress: clampProgress(Number(e.target.value) || 0) })}
              />
              <button className="mini plus" onClick={() => patch({ progress: clampProgress(entry.progress + 1) })} aria-label="Sumar uno">+</button>
            </div>
            {d.next && isAnime && (
              <span className="hint">Siguiente: EP {d.next.episode} · en {longCountdown(d.next)}</span>
            )}
          </div>

          <div className="fgroup">
            <label className="lbl" htmlFor="score">PUNTUACIÓN · 0–{d.my.scoreMax}</label>
            <input
              id="score"
              className="field"
              type="number"
              inputMode="numeric"
              min={0}
              max={d.my.scoreMax}
              value={entry.score}
              onChange={(e) => patch({ score: Math.max(0, Math.min(d.my.scoreMax, Number(e.target.value) || 0)) })}
            />
          </div>

          <div className="two">
            <div className="fgroup">
              <label className="lbl" htmlFor="sd">INICIO</label>
              <input id="sd" className="field" type="date" value={entry.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
            </div>
            <div className="fgroup">
              <label className="lbl" htmlFor="fd">FIN</label>
              <input id="fd" className="field" type="date" value={entry.finishDate} onChange={(e) => patch({ finishDate: e.target.value })} />
            </div>
          </div>

          <button className="save" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          </div>
        </aside>
      </section>
    </>
  );
}
