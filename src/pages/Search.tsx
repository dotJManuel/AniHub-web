import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { MainHeader } from '../components/Header';
import { IconClose, IconSearch } from '../components/Icons';
import ResultCard from '../components/ResultCard';
import { siteName } from '../components/Tile';
import { useAuthStatus, useDebounced, useScale, useSource, useT } from '../hooks';
import { pad2 } from '../lib/format';
import * as service from '../lib/service';
import type { MediaType, SearchPage, SearchResult, ServiceId } from '../types';

type Filter = 'all' | MediaType;

// Una consulta paginada por tipo (12 por página). Al volver desde un detalle, TanStack Query
// conserva todas las páginas ya cargadas.
function useTypeSearch(source: ServiceId, q: string, type: MediaType, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['search', source, q, type],
    queryFn: ({ pageParam }) => service.searchPage(source, q, type, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: SearchPage, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled,
    staleTime: 5 * 60_000,
  });
}

// Une las páginas sin repetir títulos (una página nueva puede traslapar con la anterior).
function flatten(pages: SearchPage[] | undefined): SearchResult[] {
  const seen = new Set<number>();
  const out: SearchResult[] = [];
  for (const p of pages ?? []) {
    for (const r of p.items) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
  }
  return out;
}

// Buscador global: un solo cuadro busca anime y manga a la vez, en el sitio activo (MAL o AniList).
// La consulta vive en la URL (?q=), así al volver desde un detalle se conservan los resultados.
export default function Search() {
  const t = useT();
  const status = useAuthStatus();
  const [source, setSource] = useSource();
  const [scale] = useScale();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useDebounced(text.trim(), 350);

  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true });
  }, [q, setParams]);

  // La API de MAL exige 3 caracteres como mínimo; AniList acepta 2.
  const min = source === 'mal' ? 3 : 2;
  const connected = status[source];
  const ready = connected && q.length >= min;

  const anime = useTypeSearch(source, q, 'anime', ready);
  const manga = useTypeSearch(source, q, 'manga', ready);
  const queries = { anime, manga };

  const items = useMemo(
    () => ({ anime: flatten(anime.data?.pages), manga: flatten(manga.data?.pages) }),
    [anime.data, manga.data],
  );
  const loaded = !!anime.data || !!manga.data;
  const errors = [anime.error, manga.error].filter(Boolean).map((e) => (e as Error).message);

  const groups = useMemo(() => {
    const all: { type: MediaType; label: string }[] = [
      { type: 'anime', label: 'ANIME' },
      { type: 'manga', label: 'MANGA' },
    ];
    return all.filter((g) => (filter === 'all' || filter === g.type) && items[g.type].length);
  }, [items, filter]);

  const filters: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: t('search.all'), n: items.anime.length + items.manga.length },
    { id: 'anime', label: 'Anime', n: items.anime.length },
    { id: 'manga', label: 'Manga', n: items.manga.length },
  ];

  return (
    <>
      <MainHeader source={source} onSource={setSource} hideSync />
      <main className="container page has-nav">
        <section className="titlebar">
          <div>
            <span className="route">~/search/{source === 'mal' ? 'myanimelist' : 'anilist'}</span>
            <h1>{t('search.title')}</h1>
          </div>
        </section>

        {!connected ? (
          <div className="banner">
            <p>{status.mal || status.anilist ? t('search.connectToSearch', { site: siteName(source) }) : t('home.noAccount')}</p>
            <Link to="/settings" className="btn pri">
              {status.mal || status.anilist ? t('home.connectSite', { site: siteName(source) }) : t('home.connectAccount')}
            </Link>
          </div>
        ) : (
          <>
            <label className="searchbox big">
              <IconSearch />
              <input
                className="search"
                type="search"
                autoFocus
                placeholder={t('search.placeholder')}
                aria-label={t('search.aria')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {text && (
                <button type="button" className="clear" aria-label={t('search.clear')} onClick={() => setText('')}>
                  <IconClose size={16} />
                </button>
              )}
            </label>

            {ready && loaded && (
              <div className="chips scroll">
                {filters.map((f) => (
                  <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
                    {f.label} {f.n}
                  </button>
                ))}
              </div>
            )}

            {q.length < min && (
              <div className="empty">
                {q.length === 0
                  ? t('search.hintEmpty', { site: siteName(source) })
                  : t('search.hintMin', { n: min })}
              </div>
            )}
            {ready && anime.isPending && manga.isPending && (
              <div className="skeleton">
                <div className="cards">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div className="card" key={i} />
                  ))}
                </div>
              </div>
            )}
            {errors.length > 0 && (
              <div className="banner err">
                {errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            {ready && loaded && !groups.length && !errors.length && !anime.isPending && !manga.isPending && (
              <div className="empty">{t('search.noResults', { q })}</div>
            )}

            {groups.map((g) => {
              const qr = queries[g.type];
              return (
                <section className="group" key={g.type}>
                  <div className="grp-head">
                    <span className="lbl mono">// {g.label}</span>
                    <span className="count">{pad2(items[g.type].length)}</span>
                    <span className="rule" />
                  </div>
                  <div className="cards">
                    {items[g.type].map((r) => (
                      <ResultCard key={`${r.type}-${r.id}`} r={r} scale={scale} />
                    ))}
                  </div>
                  {qr.hasNextPage && (
                    <div className="loadmore">
                      <button className="btn" onClick={() => qr.fetchNextPage()} disabled={qr.isFetchingNextPage}>
                        {qr.isFetchingNextPage ? t('common.loading') : t('search.loadMore')}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
