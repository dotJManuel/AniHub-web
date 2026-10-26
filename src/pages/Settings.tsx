import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import { redirectUri } from '../config';
import { useAuthStatus, useToast } from '../hooks';
import * as auth from '../lib/auth';
import * as storage from '../lib/storage';

export default function Settings() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const status = useAuthStatus();
  const [msg, setMsg] = useState('');

  const initial = storage.getSettings();
  const [aniId, setAniId] = useState(initial.anilistClientId || '');
  const [malId, setMalId] = useState(initial.malClientId || '');
  const ids = auth.getClientIds();

  const connect = (label: string, fn: () => void) => {
    // Guarda los IDs escritos antes de salir hacia el login.
    storage.setSettings({ anilistClientId: aniId.trim(), malClientId: malId.trim() });
    setMsg(`Opening ${label} login…`);
    try {
      fn();
    } catch (e) {
      setMsg('');
      toast((e as Error).message, true);
    }
  };

  const disconnect = (p: 'anilist' | 'mal') => {
    auth.logout(p);
    queryClient.removeQueries({ queryKey: ['list', p] });
  };

  const row = (p: 'anilist' | 'mal', label: string, login: () => void) => (
    <tr>
      <td>
        <span className={`pill ${status[p] ? 'on' : 'off'}`} /> <b>{label}</b>
      </td>
      <td className="muted">{status[p] ? 'Connected' : 'Not connected'}</td>
      <td>
        <div className="row end">
          <button className="btn-accent" onClick={() => connect(label, login)}>
            {status[p] ? 'Reconnect' : 'Connect'}
          </button>
          {status[p] && <button onClick={() => disconnect(p)}>Disconnect</button>}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="app">
      <Header />
      <main className="content">
        <button className="back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          ← Back
        </button>
        <div className="panel">
          <h2>Connect accounts</h2>
          <p className="muted">Inicia sesión con tus cuentas de MyAnimeList y AniList.</p>
          <table>
            <tbody>
              {row('anilist', 'AniList', auth.loginAnilist)}
              {row('mal', 'MyAnimeList', auth.loginMal)}
            </tbody>
          </table>
          <p className="muted">{msg}</p>
        </div>

        <div className="panel">
          <h2>Client IDs</h2>
          <p className="muted">
            Opcional: si lo dejas vacío se usa el de la build. Registra tu app en cada sitio con este Redirect URL:
          </p>
          <p>
            <code className="redirect">{redirectUri()}</code>
          </p>
          <label htmlFor="ani-id">AniList Client ID</label>
          <input
            id="ani-id"
            type="text"
            inputMode="numeric"
            placeholder={ids.anilist || 'p. ej. 12345'}
            value={aniId}
            onChange={(e) => setAniId(e.target.value)}
          />
          <label htmlFor="mal-id">MyAnimeList Client ID</label>
          <input
            id="mal-id"
            type="text"
            placeholder={ids.mal || 'client id'}
            value={malId}
            onChange={(e) => setMalId(e.target.value)}
          />
          <button
            className="save-ids"
            onClick={() => {
              storage.setSettings({ anilistClientId: aniId.trim(), malClientId: malId.trim() });
              toast('Guardado');
            }}
          >
            Guardar
          </button>
        </div>
      </main>
    </div>
  );
}
