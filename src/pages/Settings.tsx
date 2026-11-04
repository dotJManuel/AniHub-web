import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { SubHeader } from '../components/Header';
import Segmented from '../components/Segmented';
import { useAuthStatus, useLang, usePref, useScale, useT, useTheme, useToast } from '../hooks';
import * as auth from '../lib/auth';
import { agoLabel } from '../lib/format';
import type { LangPref } from '../lib/i18n';
import * as service from '../lib/service';
import * as storage from '../lib/storage';
import type { ScaleSetting, ServiceId, ThemePref } from '../types';

function useLastSync(p: ServiceId) {
  return useSyncExternalStore(storage.subscribe, () => storage.getLastSync(p), () => null);
}

function AccountRow({ id, tag, name, onConnect }: { id: ServiceId; tag: string; name: string; onConnect: () => void }) {
  const t = useT();
  const status = useAuthStatus();
  const queryClient = useQueryClient();
  const connected = status[id];
  const lastSync = useLastSync(id);
  const user = useQuery({
    queryKey: ['user', id],
    queryFn: () => service.getUser(id),
    enabled: connected,
    staleTime: Infinity,
    retry: false,
  });

  const disconnect = () => {
    auth.logout(id);
    queryClient.removeQueries({ queryKey: ['list', id] });
    queryClient.removeQueries({ queryKey: ['user', id] });
  };

  const parts = [t('set.connected')];
  if (user.data?.name) parts.push(`@${user.data.name}`);
  if (lastSync) parts.push(t('set.sync', { ago: agoLabel(lastSync) }));

  return (
    <div className="acct">
      <span className="tag mono">{tag}</span>
      <div className="info">
        <b>{name}</b>
        <span className={`state mono${connected ? '' : ' off'}`}>{connected ? parts.join(' · ') : t('set.notConnected')}</span>
      </div>
      <div className="acts">
        <button className={`btn${connected ? '' : ' pri'}`} onClick={onConnect}>
          {connected ? t('set.reconnect') : t('set.connect')}
        </button>
        {connected && (
          <button className="btn ghost" onClick={disconnect}>
            {t('set.disconnect')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const t = useT();
  const toast = useToast();
  const { pref: theme, setPref: setTheme } = useTheme();
  const { pref: langPref, setPref: setLang } = useLang();
  const [scale, setScale] = useScale();
  const [activeTab] = usePref('activeTab', 'mal');
  const [defaultSource, setDefaultSource] = usePref('defaultSource', activeTab);
  const status = useAuthStatus();
  const [active, setActive] = useState('cuentas');
  const [msg, setMsg] = useState('');

  const SECTIONS = [
    { id: 'cuentas', label: t('set.accounts') },
    { id: 'apariencia', label: t('set.appearance') },
  ];

  // Resalta en la navegación lateral la sección que está a la vista.
  useEffect(() => {
    const els = ['cuentas', 'apariencia'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Igual que antes: avisa y lanza el login (lógica de OAuth sin cambios).
  const connect = (label: string, fn: () => void) => {
    setMsg(t('set.opening', { site: label }));
    try {
      fn();
    } catch (e) {
      setMsg('');
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <SubHeader backLabel={t('back.generic')} path="~/settings" narrow />
      <main className="container narrow settings has-nav">
        <nav className="snav" aria-label={t('set.navAria')}>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''} onClick={() => setActive(s.id)}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="scol">
          <h1>{t('set.title')}</h1>

          <section id="cuentas" className="panel">
            <div className="panel-head">
              <h2>{t('set.connectedAccounts')}</h2>
              <p className="sub">{t('set.accountsSub')}</p>
            </div>
            <AccountRow id="anilist" tag="AL" name="AniList" onConnect={() => connect('AniList', auth.loginAnilist)} />
            <AccountRow id="mal" tag="MAL" name="MyAnimeList" onConnect={() => connect('MyAnimeList', auth.loginMal)} />
            {msg && <p className="sub" style={{ padding: '0 20px 16px' }}>{msg}</p>}
          </section>

          <section id="apariencia" className="panel pad">
            <h2>{t('set.appearance')}</h2>
            <div className="pref-row">
              <div className="t">
                <b>{t('set.language')}</b>
                <span>{t('set.languageSub')}</span>
              </div>
              <Segmented<LangPref>
                className="sans flat"
                label={t('set.language')}
                value={langPref}
                onChange={setLang}
                options={[
                  { id: 'system', label: t('set.system') },
                  { id: 'es', label: 'Español' },
                  { id: 'en', label: 'English' },
                ]}
              />
            </div>
            <div className="hr" />
            <div className="pref-row">
              <div className="t">
                <b>{t('set.theme')}</b>
                <span>{t('set.themeSub')}</span>
              </div>
              <Segmented<ThemePref>
                className="sans flat"
                label={t('set.theme')}
                value={theme}
                onChange={setTheme}
                options={[
                  { id: 'system', label: t('set.system') },
                  { id: 'light', label: t('set.light') },
                  { id: 'dark', label: t('set.dark') },
                ]}
              />
            </div>
            {status.mal && status.anilist && (
              <>
                <div className="hr" />
                <div className="pref-row">
                  <div className="t">
                    <b>{t('set.defaultSource')}</b>
                    <span>{t('set.defaultSourceSub')}</span>
                  </div>
                  <Segmented<ServiceId>
                    className="sans flat"
                    label={t('set.defaultSource')}
                    value={defaultSource as ServiceId}
                    onChange={setDefaultSource}
                    options={[
                      { id: 'mal', label: 'MyAnimeList' },
                      { id: 'anilist', label: 'AniList' },
                    ]}
                  />
                </div>
              </>
            )}
            <div className="hr" />
            <div className="pref-row">
              <div className="t">
                <b>{t('set.scale')}</b>
                <span>{t('set.scaleSub')}</span>
              </div>
              <Segmented<ScaleSetting>
                className="sans flat"
                label={t('set.scale')}
                value={scale}
                onChange={setScale}
                options={[
                  { id: '10', label: '0–10' },
                  { id: '100', label: '0–100' },
                  { id: 'orig', label: t('set.scaleOrig') },
                ]}
              />
            </div>
          </section>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
