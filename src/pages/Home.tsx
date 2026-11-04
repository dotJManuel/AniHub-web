import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { MainHeader } from '../components/Header';
import { IconFilter, IconSearch } from '../components/Icons';
import StatPanel from '../components/StatPanel';
import Tile, { siteName } from '../components/Tile';
import { useAuthStatus, usePref, useScale, useSource, useT, useToast, type TFn } from '../hooks';
import { behindOf, fmtNum, nextTime, normalize, pad2 } from '../lib/format';
import * as service from '../lib/service';
import { LIST_STATUSES } from '../types';
import type { ListItem, ListStatus, MediaType, ServiceId, ServiceList } from '../types';

type Filter = 'all' | 'releasing' | 'finished';

// Cuántas tarjetas se dibujan por grupo antes de pedir "Mostrar más" (las listas completas pueden ser enormes).
const PAGE = 60;

const statusLabel = (t: TFn, s: ListStatus, type: MediaType) =>
  ({
    WATCHING: type === 'anime' ? t('st.watching') : t('st.reading'),
    COMPLETED: t('st.completed'),
    PAUSED: t('st.paused'),
    DROPPED: t('st.dropped'),
    PLANNING: t('st.planning'),
  })[s];

// Encabezado del grupo (mismo estilo mono en inglés que AIRING / FINISHED AIRING).
const STATUS_HEAD = (s: ListStatus, type: MediaType) =>
  ({
    WATCHING: type === 'anime' ? 'WATCHING' : 'READING',
    COMPLETED: 'COMPLETED',
    PAUSED: 'ON HOLD',
    DROPPED: 'DROPPED',
    PLANNING: type === 'anime' ? 'PLAN TO WATCH' : 'PLAN TO READ',
  })[s];

const STATUS_SLUG: Record<ListStatus, string> = {
  WATCHING: 'watching',
  COMPLETED: 'completed',
  PAUSED: 'on-hold',
  DROPPED: 'dropped',
  PLANNING: 'planned',
};

export default function Home() {
  const t = useT();
  const status = useAuthStatus();
  const [source, setSource] = useSource();
  const [typePref, setType] = usePref('activeType', 'anime');
  const type = typePref as MediaType;
  const [statusPref, setStatusPref] = usePref('activeStatus', 'WATCHING');
  const listStatus = (LIST_STATUSES.includes(statusPref as ListStatus) ? statusPref : 'WATCHING') as ListStatus;
  const watching = listStatus === 'WATCHING';
  const [filter, setFilter] = useState<Filter>('all');
  // Orden: 'airing' = por fecha del próximo capítulo (por defecto), 'recent' = como llega de la API, 'score' = mejor puntuados.
  const [sort, setSort] = useState<'airing' | 'recent' | 'score'>('airing');
  const byScore = sort === 'score';
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  // Barra compacta: la búsqueda se abre con una lupa (en móvil) y los filtros viven en un menú.
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [scale] = useScale();
  const [busyId, setBusyId] = useState<number | null>(null);

  // El menú de filtros se cierra con un clic fuera o con Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Cada cambio de vista vuelve a mostrar la primera tanda de tarjetas.
  useEffect(() => setShown(PAGE), [source, type, listStatus, filter, query, sort]);

  const connected = status[source];
  const anyConnected = status.mal || status.anilist;
  // La lista "viendo" conserva su clave de siempre; el resto cuelga de ella (['list', sitio, estado]).
  const list = useQuery({
    queryKey: watching ? ['list', source] : ['list', source, listStatus],
    queryFn: () => service.getList(source, listStatus),
    enabled: connected,
  });

  // +1 / −1 con actualización optimista; si la API falla se revierte solo esa tarjeta.
  // (Solo existe en "viendo": en otros estados cambiar el progreso cambiaría también el estado.)
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
      toast(t('home.notSaved', { msg: e.message }), true);
    },
    onSuccess: (_r, { next }) => toast(t('home.saved', { site: siteName(source), n: next })),
    onSettled: () => setBusyId(null),
  });

  const data = list.data;
  const items = data?.[type] ?? [];

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter(
      (i) => (!q || normalize(i.title).includes(q)) && (!watching || filter === 'all' || i.release === filter),
    );
  }, [items, query, filter, watching]);

  const groups = useMemo(() => {
    // En "viendo" se agrupa por estado de emisión; en los demás estados es una sola lista (más reciente primero).
    const defs: [string, string, (i: ListItem) => boolean][] = watching
      ? type === 'anime'
        ? [['releasing', 'AIRING', (i) => i.release === 'releasing'], ['finished', 'FINISHED AIRING', (i) => i.release === 'finished'], ['other', 'OTHER', (i) => i.release === 'other']]
        : [['releasing', 'PUBLISHING', (i) => i.release === 'releasing'], ['finished', 'FINISHED', (i) => i.release === 'finished'], ['other', 'OTHER', (i) => i.release === 'other']]
      : [[listStatus, STATUS_HEAD(listStatus, type), () => true]];
    return defs
      .map(([key, label, pick]) => {
        const g = filtered.filter(pick);
        const ordered = byScore ? [...g].sort((a, b) => b.score - a.score) : g;
        // En Airing (anime): 1º los atrasados (más atraso arriba); luego, a quien le falte menos para su próximo capítulo.
        // Con orden por Score, el score desempata en lugar del tiempo.
        const items =
          watching && type === 'anime' && key === 'releasing'
            ? [...ordered].sort((a, b) => behindOf(b) - behindOf(a) || (sort === 'airing' ? nextTime(a) - nextTime(b) : 0))
            : ordered;
        return { key, label, items };
      })
      .filter((g) => g.items.length);
  }, [filtered, type, byScore, sort, watching, listStatus]);

  // Total de episodios vistos: estadística oficial del sitio (la lista "viendo" solo trae una parte).
  const eps = useQuery({
    queryKey: ['eps', source],
    queryFn: () => service.getEpisodesWatched(source),
    enabled: connected,
    staleTime: 10 * 60_000,
  });
  const filters: { id: Filter; label: string }[] =
    type === 'anime'
      ? [{ id: 'all', label: t('home.filterAll') }, { id: 'releasing', label: t('home.filterAiring') }, { id: 'finished', label: t('home.filterFinished') }]
      : [{ id: 'all', label: t('home.filterAll') }, { id: 'releasing', label: t('home.filterPublishing') }];

  const pickType = (t: MediaType) => {
    setType(t);
    setFilter('all');
  };
  const pickStatus = (s: ListStatus) => {
    setStatusPref(s);
    setFilter('all');
  };

  return (
    <>
      <MainHeader source={source} onSource={setSource} />
      <main className="container page has-nav">
        <section className="titlebar">
          <div>
            <span className="route">
              ~/library/{source === 'mal' ? 'myanimelist' : 'anilist'}
              {!watching && `/${STATUS_SLUG[listStatus]}`}
            </span>
            <h1>{t('home.myList')}</h1>
          </div>
          {data && watching && (
            <StatPanel
              cols={3}
              cells={[
                { k: 'WATCHING', v: pad2(data.anime.length) },
                { k: 'READING', v: pad2(data.manga.length) },
                { k: t('home.epsSeen'), v: eps.data != null ? fmtNum(eps.data) : '—', accent: true },
              ]}
            />
          )}
        </section>

        {!connected ? (
          <div className="banner">
            <p>{anyConnected ? t('home.notConnected', { site: siteName(source) }) : t('home.noAccount')}</p>
            <Link to="/settings" className="btn pri">
              {anyConnected ? t('home.connectSite', { site: siteName(source) }) : t('home.connectAccount')}
            </Link>
          </div>
        ) : (
          <>
            <section className="toolbar">
              <div className="toolbar-row">
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
                <span className="grow" />
                <label className="searchbox inline hide-m">
                  <IconSearch />
                  <input
                    className="search"
                    type="search"
                    placeholder={t('home.searchList')}
                    aria-label={t('home.searchList')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button
                  className={`ibtn sm hide-d${searchOpen || query ? ' active' : ''}`}
                  aria-label={t('home.searchList')}
                  aria-expanded={searchOpen}
                  onClick={() => setSearchOpen((v) => !v)}
                >
                  <IconSearch />
                </button>
                <div className="menu-wrap" ref={menuRef}>
                  <button
                    className={`ibtn sm${menuOpen ? ' active' : ''}`}
                    aria-label={t('home.filterMenu')}
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <IconFilter />
                    {(filter !== 'all' || byScore) && <span className="dot" />}
                  </button>
                  {menuOpen && (
                    <div className="popover" role="dialog" aria-label={t('home.filterMenu')}>
                      {watching && (
                        <div className="pop-sec">
                          <span className="lbl">{t('home.release')}</span>
                          <div className="chips wrap">
                            {filters.map((f) => (
                              <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="pop-sec">
                        <span className="lbl">{t('home.sort')}</span>
                        <div className="chips wrap">
                          {type === 'anime' && (
                            <button className={`chip${sort === 'airing' ? ' on' : ''}`} onClick={() => setSort('airing')} aria-pressed={sort === 'airing'}>
                              {t('home.sortAiring')}
                            </button>
                          )}
                          <button className={`chip${sort === 'recent' || (sort === 'airing' && type !== 'anime') ? ' on' : ''}`} onClick={() => setSort('recent')}>
                            {t('home.sortRecent')}
                          </button>
                          <button className={`chip${byScore ? ' on' : ''}`} onClick={() => setSort('score')} aria-pressed={byScore}>
                            Score ↓
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="chips scroll" role="group" aria-label={t('home.statusGroup')}>
                {LIST_STATUSES.map((s) => (
                  <button
                    key={s}
                    className={`chip${listStatus === s ? ' on' : ''}`}
                    aria-pressed={listStatus === s}
                    onClick={() => pickStatus(s)}
                  >
                    {statusLabel(t, s, type)}
                  </button>
                ))}
              </div>
              {(searchOpen || query) && (
                <label className="searchbox hide-d">
                  <IconSearch />
                  <input
                    className="search"
                    type="search"
                    autoFocus={searchOpen}
                    placeholder={t('home.searchList')}
                    aria-label={t('home.searchList')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              )}
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
              <div className="empty">
                {query
                  ? t('home.noResults')
                  : watching
                    ? t('home.nothing')
                    : t(type === 'anime' ? 'home.emptyAnime' : 'home.emptyManga', { status: statusLabel(t, listStatus, type) })}
              </div>
            )}

            {groups.map((g) => (
              <section className="group" key={g.key}>
                <div className="grp-head">
                  <span className="lbl mono">// {g.label}</span>
                  <span className="count">{pad2(g.items.length)}</span>
                  <span className="rule" />
                </div>
                <div className="cards">
                  {g.items.slice(0, shown).map((item) => (
                    <Tile
                      key={item.id}
                      item={item}
                      type={type}
                      scale={scale}
                      busy={busyId === item.id}
                      onStep={
                        watching
                          ? (d) => {
                              const next = Math.max(0, item.total ? Math.min(item.total, item.progress + d) : item.progress + d);
                              if (next !== item.progress) step.mutate({ item, next });
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
                {g.items.length > shown && (
                  <div className="loadmore">
                    <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
                      {t('home.showMore', { n: g.items.length - shown })}
                    </button>
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
