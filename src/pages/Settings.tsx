import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav';
import { SubHeader } from '../components/Header';
import Segmented from '../components/Segmented';
import { redirectUri } from '../config';
import { useAuthStatus, usePref, useScale, useTheme, useToast } from '../hooks';
import * as auth from '../lib/auth';
import { agoLabel } from '../lib/format';
import * as service from '../lib/service';
import * as storage from '../lib/storage';
import type { ScaleSetting, ServiceId, ThemePref } from '../types';

const SECTIONS = [
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'apariencia', label: 'Apariencia' },
  { id: 'api', label: 'API · Client IDs' },
];

function useLastSync(p: ServiceId) {
  return useSyncExternalStore(storage.subscribe, () => storage.getLastSync(p), () => null);
}

function AccountRow({ id, tag, name, onConnect }: { id: ServiceId; tag: string; name: string; onConnect: () => void }) {
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

  const parts = ['● conectado'];
  if (user.data?.name) parts.push(`@${user.data.name}`);
  if (lastSync) parts.push(`sync ${agoLabel(lastSync)}`);

  return (
    <div className="acct">
      <span className="tag mono">{tag}</span>
      <div className="info">
        <b>{name}</b>
        <span className={`state mono${connected ? '' : ' off'}`}>{connected ? parts.join(' · ') : '○ sin conectar'}</span>
      </div>
      <div className="acts">
        <button className={`btn${connected ? '' : ' pri'}`} onClick={onConnect}>
          {connected ? 'Reconectar' : 'Conectar'}
        </button>
        {connected && (
          <button className="btn ghost" onClick={disconnect}>
            Desconectar
          </button>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const { pref: theme, setPref: setTheme } = useTheme();
  const [scale, setScale] = useScale();
  const [activeTab] = usePref('activeTab', 'mal');
  const [defaultSource, setDefaultSource] = usePref('defaultSource', activeTab);
  const [active, setActive] = useState('cuentas');
  const [msg, setMsg] = useState('');

  const initial = storage.getSettings();
  const [aniId, setAniId] = useState(initial.anilistClientId || '');
  const [malId, setMalId] = useState(initial.malClientId || '');
  const ids = auth.getClientIds();
  const redirect = redirectUri();

  // Resalta en la navegación lateral la sección que está a la vista.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
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

  const persistIds = () => storage.setSettings({ anilistClientId: aniId.trim(), malClientId: malId.trim() });

  // Igual que antes: guarda los IDs escritos y lanza el login (lógica de OAuth sin cambios).
  const connect = (label: string, fn: () => void) => {
    persistIds();
    setMsg(`Abriendo login de ${label}…`);
    try {
      fn();
    } catch (e) {
      setMsg('');
      toast((e as Error).message, true);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redirect);
      toast('Redirect URL copiada');
    } catch {
      toast('No se pudo copiar; selecciónala a mano', true);
    }
  };

  return (
    <>
      <SubHeader backLabel="Volver" path="~/settings" narrow />
      <main className="container narrow settings has-nav">
        <nav className="snav" aria-label="Secciones de ajustes">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''} onClick={() => setActive(s.id)}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="scol">
          <h1>Ajustes</h1>

          <section id="cuentas" className="panel">
            <div className="panel-head">
              <h2>Cuentas conectadas</h2>
              <p className="sub">Inicia sesión con MyAnimeList y AniList para sincronizar tus listas.</p>
            </div>
            <AccountRow id="anilist" tag="AL" name="AniList" onConnect={() => connect('AniList', auth.loginAnilist)} />
            <AccountRow id="mal" tag="MAL" name="MyAnimeList" onConnect={() => connect('MyAnimeList', auth.loginMal)} />
            {msg && <p className="sub" style={{ padding: '0 20px 16px' }}>{msg}</p>}
          </section>

          <section id="apariencia" className="panel pad">
            <h2>Apariencia</h2>
            <div className="pref-row">
              <div className="t">
                <b>Tema</b>
                <span>Sistema sigue la preferencia de tu dispositivo.</span>
              </div>
              <Segmented<ThemePref>
                className="sans flat"
                label="Tema"
                value={theme}
                onChange={setTheme}
                options={[
                  { id: 'system', label: 'Sistema' },
                  { id: 'light', label: 'Claro' },
                  { id: 'dark', label: 'Oscuro' },
                ]}
              />
            </div>
            <div className="hr" />
            <div className="pref-row">
              <div className="t">
                <b>Fuente predeterminada</b>
                <span>La lista que se abre al entrar.</span>
              </div>
              <Segmented<ServiceId>
                className="sans flat"
                label="Fuente predeterminada"
                value={defaultSource as ServiceId}
                onChange={setDefaultSource}
                options={[
                  { id: 'mal', label: 'MyAnimeList' },
                  { id: 'anilist', label: 'AniList' },
                ]}
              />
            </div>
            <div className="hr" />
            <div className="pref-row">
              <div className="t">
                <b>Escala de puntuación</b>
                <span>Unifica cómo se muestran los scores en las tarjetas.</span>
              </div>
              <Segmented<ScaleSetting>
                className="sans flat"
                label="Escala de puntuación"
                value={scale}
                onChange={setScale}
                options={[
                  { id: '10', label: '0–10' },
                  { id: '100', label: '0–100' },
                  { id: 'orig', label: 'Original' },
                ]}
              />
            </div>
          </section>

          <section id="api" className="panel pad">
            <div className="panel-head" style={{ padding: 0 }}>
              <h2>
                Client IDs <span className="opt">opcional</span>
              </h2>
              <p className="sub">
                Si los dejas vacíos se usa el de la build. Registra tu app en cada sitio con este Redirect URL:
              </p>
            </div>
            <div className="urlbox">
              <code>{redirect}</code>
              <button className="btn sm" onClick={copy}>
                Copiar
              </button>
            </div>
            <div className="idgrid">
              <div>
                <label className="lbl" htmlFor="al">ANILIST CLIENT ID</label>
                <input
                  id="al"
                  className="field"
                  inputMode="numeric"
                  placeholder={ids.anilist || '55082'}
                  value={aniId}
                  onChange={(e) => setAniId(e.target.value)}
                />
              </div>
              <div>
                <label className="lbl" htmlFor="mal">MYANIMELIST CLIENT ID</label>
                <input
                  id="mal"
                  className="field"
                  placeholder={ids.mal ? `${ids.mal.slice(0, 4)}…${ids.mal.slice(-6)}` : 'client id'}
                  value={malId}
                  onChange={(e) => setMalId(e.target.value)}
                />
              </div>
            </div>
            <div className="end">
              <button
                className="btn pri"
                onClick={() => {
                  persistIds();
                  toast('Guardado');
                }}
              >
                Guardar
              </button>
            </div>
          </section>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
