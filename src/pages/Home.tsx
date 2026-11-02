import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { MainHeader } from '../components/Header';
import { IconSearch } from '../components/Icons';
import StatPanel from '../components/StatPanel';
import Tile, { siteName } from '../components/Tile';
import { useAuthStatus, usePref, useScale, useSource, useToast } from '../hooks';
import { fmtNum, normalize, pad2 } from '../lib/format';
import * as service from '../lib/service';
import type { ListItem, MediaType, Release, ServiceId, ServiceList } from '../types';

type Filter = 'all' | 'releasing' | 'finished';

export default function Home() {
  const status = useAuthStatus();
  const [source, setSource] = useSource();
  const [typePref, setType] = usePref('activeType', 'anime');
  const type = typePref as MediaType;
  const [filter, setFilter] = useState<Filter>('all');
  const [byScore, setByScore] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [scale] = useScale();
  const [busyId, setBusyId] = useState<number | null>(null);

  // Pestaña "Buscar" de la barra móvil: enfoca el buscador local.
  useEffect(() => {
    if (params.has('buscar')) {
      searchRef.current?.focus();
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const connected = status[source];
  const list = useQuery({
    queryKey: ['list', source],
    queryFn: () => service.getList(source),
    enabled: connected,
  });

  // +1 / −1 con actualización optimista; si la API falla se revierte solo esa tarjeta.
  const setProgressLocal = (svc: ServiceId, t: MediaType, id: number, progress: number) =>
    queryClient.setQueryData<ServiceList>(['list', svc], (old) =>
      old ? { ...old, [t]: old[t].map((x) => (x.id === id ? { ...x, progress } : x)) } : old,
    );

  const step = useMutation({
    mutationFn: ({ item, next }: { item: ListItem; next: number }) =>
      service.setProgress(source, type, item.id, next, item.total),
    onMutate: ({ item, next }) => {
      setBusyId(item.id);
      setProgressLocal(source, type, item.id, next);
      return { prev: item.progress };
    },
    onError: (e: Error, { item }, ctx) => {
      if (ctx) setProgressLocal(source, type, item.id, ctx.prev);
      toast(`No se guardó: ${e.message}`, true);
    },
    onSuccess: (_r, { next }) => toast(`Guardado en ${siteName(source)} (${next})`),
    onSettled: () => setBusyId(null),
  });

  const data = list.data;
  const items = data?.[type] ?? [];

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter((i) => (!q || normalize(i.title).includes(q)) && (filter === 'all' || i.release === filter));
  }, [items, query, filter]);

  const groups = useMemo(() => {
    const defs: [Release, string][] =
      type === 'anime'
        ? [['releasing', 'AIRING'], ['finished', 'FINISHED AIRING'], ['other', 'OTHER']]
        : [['releasing', 'PUBLISHING'], ['finished', 'FINISHED'], ['other', 'OTHER']];
    return defs
      .map(([key, label]) => {
        const g = filtered.filter((i) => i.release === key);
        return { key, label, items: byScore ? [...g].sort((a, b) => b.score - a.score) : g };
      })
      .filter((g) => g.items.length);
  }, [filtered, type, byScore]);

  const epsSeen = (data?.anime ?? []).reduce((a, i) => a + i.progress, 0);
  const filters: { id: Filter; label: string }[] =
    type === 'anime'
      ? [{ id: 'all', label: 'Todos' }, { id: 'releasing', label: 'En emisión' }, { id: 'finished', label: 'Finalizado' }]
      : [{ id: 'all', label: 'Todos' }, { id: 'releasing', label: 'Publicando' }];

  const pickType = (t: MediaType) => {
    setType(t);
    setFilter('all');
  };

  return (
    <>
      <MainHeader source={source} onSource={setSource} />
      <main className="container page has-nav">
        <section className="titlebar">
          <div>
            <span className="route">~/library/{source === 'mal' ? 'myanimelist' : 'anilist'}</span>
            <h1>Mi lista</h1>
          </div>
          {data && (
            <StatPanel
              cols={3}
              cells={[
                { k: 'WATCHING', v: pad2(data.anime.length) },
                { k: 'READING', v: pad2(data.manga.length) },
                { k: 'EPS VISTOS', v: fmtNum(epsSeen), accent: true },
              ]}
            />
          )}
        </section>

        {!connected ? (
          <div className="banner">
            <p>Todavía no conectaste {siteName(source)}.</p>
            <Link to="/settings" className="btn pri">
              Conectar {siteName(source)}
            </Link>
          </div>
        ) : (
          <>
            <section className="toolbar">
              <div className="tabs" role="tablist">
                {(['anime', 'manga'] as MediaType[]).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={type === t}
                    className={`tab${type === t ? ' on' : ''}`}
                    onClick={() => pickType(t)}
                  >
                    {t === 'anime' ? 'Anime' : 'Manga'} <span className="cnt">{data ? data[t].length : '·'}</span>
                  </button>
                ))}
              </div>
              <div className="filters">
                <div className="chips scroll">
                  {filters.map((f) => (
                    <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
                      {f.label}
                    </button>
                  ))}
                  <button className={`chip${byScore ? ' on' : ''}`} onClick={() => setByScore((v) => !v)} aria-pressed={byScore}>
                    Score ↓
                  </button>
                </div>
                <label className="searchbox">
                  <IconSearch />
                  <input
                    ref={searchRef}
                    className="search"
                    type="search"
                    placeholder="Buscar en tu lista…"
                    aria-label="Buscar en tu lista"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
            </section>

            {list.isPending && (
              <div className="skeleton">
                <div className="cards">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div className="card" key={i} />
                  ))}
                </div>
              </div>
            )}
            {list.isError && <div className="banner err"><p>{(list.error as Error).message}</p></div>}
            {data?.errors.length ? (
              <div className="banner err">
                {data.errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            ) : null}
            {data && !groups.length && (
              <div className="empty">{query ? 'Sin resultados para tu búsqueda.' : 'Nada por aquí.'}</div>
            )}

            {groups.map((g) => (
              <section className="group" key={g.key}>
                <div className="grp-head">
                  <span className="lbl mono">// {g.label}</span>
                  <span className="count">{pad2(g.items.length)}</span>
                  <span className="rule" />
                </div>
                <div className="cards">
                  {g.items.map((item) => (
                    <Tile
                      key={item.id}
                      item={item}
                      type={type}
                      scale={scale}
                      busy={busyId === item.id}
                      onStep={(d) => {
                        const next = Math.max(0, item.total ? Math.min(item.total, item.progress + d) : item.progress + d);
                        if (next !== item.progress) step.mutate({ item, next });
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
