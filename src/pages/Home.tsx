import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import Tile, { siteName } from '../components/Tile';
import { useAuthStatus, usePref, useToast } from '../hooks';
import * as service from '../lib/service';
import type { ListItem, MediaType, Release, ServiceId, ServiceList } from '../types';

const TABS: { id: ServiceId; label: string }[] = [
  { id: 'mal', label: 'MyAnimeList' },
  { id: 'anilist', label: 'AniList' },
];

export default function Home() {
  const status = useAuthStatus();
  const visible = TABS.filter((t) => status[t.id]);
  const [pref, setPref] = usePref('activeTab', 'mal');
  const [type, setType] = usePref('activeType', 'anime');
  const queryClient = useQueryClient();

  // Si la pestaña guardada ya no está conectada, cae a la primera disponible.
  const active = (visible.find((t) => t.id === pref)?.id ?? visible[0]?.id) as ServiceId | undefined;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['list'] });

  return (
    <div className="app">
      <Header onRefresh={visible.length ? refresh : undefined}>
        {visible.length > 0 && (
          <div className="tabs">
            {visible.map((t) => (
              <button
                key={t.id}
                className={`tab ${t.id === 'mal' ? 'mal' : 'ani'}${t.id === active ? ' active' : ''}`}
                onClick={() => setPref(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </Header>
      <main className="content">
        {!active ? (
          <div className="banner">
            No accounts connected.
            <br />
            <br />
            <Link to="/settings" className="btn btn-accent">Open Settings to connect</Link>
          </div>
        ) : (
          <ServiceView service={active} type={type as MediaType} onType={setType} />
        )}
      </main>
    </div>
  );
}

function ServiceView({
  service: svc,
  type,
  onType,
}: {
  service: ServiceId;
  type: MediaType;
  onType: (t: string) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const list = useQuery({ queryKey: ['list', svc], queryFn: () => service.getList(svc) });

  const step = useMutation({
    mutationFn: ({ item, next }: { item: ListItem; next: number }) =>
      service.setProgress(svc, type, item.id, next, item.total),
    onMutate: ({ item }) => setBusyId(item.id),
    onSuccess: (_r, { item, next }) => {
      queryClient.setQueryData<ServiceList>(['list', svc], (old) =>
        old ? { ...old, [type]: old[type].map((x) => (x.id === item.id ? { ...x, progress: next } : x)) } : old,
      );
      toast(`Saved on ${siteName(svc)} (${next})`);
    },
    onError: (e: Error) => toast(e.message, true),
    onSettled: () => setBusyId(null),
  });

  if (list.isPending) return <div className="empty">Loading…</div>;
  if (list.isError) return <div className="banner err">{(list.error as Error).message}</div>;

  const data = list.data;
  const items = data[type];

  const order: [Release, string][] =
    type === 'anime'
      ? [['releasing', 'Airing'], ['finished', 'Finished Airing'], ['other', 'Other']]
      : [['releasing', 'Publishing'], ['finished', 'Finished'], ['other', 'Other']];

  return (
    <>
      {data.errors.length > 0 && (
        <div className="banner err">
          {data.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <div className="subtabs">
        {(['anime', 'manga'] as MediaType[]).map((t) => (
          <button key={t} className={`subtab${t === type ? ' active' : ''}`} onClick={() => onType(t)}>
            {t === 'anime' ? 'Anime' : 'Manga'} · {data[t].length}
          </button>
        ))}
      </div>
      {!items.length && <div className="empty">Nothing here.</div>}
      {order.map(([key, label]) => {
        const group = items.filter((i) => i.release === key);
        if (!group.length) return null;
        return (
          <section key={key}>
            <div className="section-title">
              {label} · {group.length}
            </div>
            <div className="grid">
              {group.map((item) => (
                <Tile
                  key={item.id}
                  item={item}
                  type={type}
                  busy={busyId === item.id}
                  onOpen={() => navigate(`/detail/${svc}/${type}/${item.id}`)}
                  onStep={(d) => step.mutate({ item, next: Math.max(0, item.progress + d) })}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
