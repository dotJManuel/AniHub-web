import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as auth from '../lib/auth';

// Recibe el retorno de OAuth, guarda el token y vuelve a la lista.
export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  // StrictMode ejecuta los efectos dos veces en dev; el code de OAuth es de un solo uso.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    auth
      .completeLogin()
      .then(() => navigate('/', { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [navigate]);

  return (
    <div className="app">
      <main className="content">
        {error ? (
          <div className="banner err">
            {error}
            <br />
            <br />
            <Link to="/settings" className="btn">Volver a Ajustes</Link>
          </div>
        ) : (
          <div className="empty">Conectando…</div>
        )}
      </main>
    </div>
  );
}
