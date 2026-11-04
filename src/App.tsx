import { useCallback, useRef, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ToastContext, useApplyLang, useApplyTheme, type ToastFn } from './hooks';
import * as storage from './lib/storage';
import Home from './pages/Home';
import Search from './pages/Search';
import Detail from './pages/Detail';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Callback from './pages/Callback';

// Al abrir la app (una vez por sesión) se muestra la "Fuente predeterminada" de Ajustes.
function applyDefaultSource() {
  try {
    if (sessionStorage.getItem('anihub:init')) return;
    sessionStorage.setItem('anihub:init', '1');
    const def = storage.getPref('defaultSource');
    if (def === 'mal' || def === 'anilist') storage.setPref('activeTab', def);
  } catch {
    /* sin sessionStorage */
  }
}
applyDefaultSource();

export default function App() {
  useApplyTheme();
  useApplyLang();
  const [toast, setToast] = useState<{ msg: string; err: boolean; show: boolean }>({
    msg: '',
    err: false,
    show: false,
  });
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback<ToastFn>((msg, isErr = false) => {
    setToast({ msg, err: isErr, show: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast((t) => ({ ...t, show: false })), 2600);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/detail/:service/:type/:id" element={<Detail />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <div className={`toast${toast.show ? ' show' : ''}${toast.err ? ' err' : ''}`} role="status">
        {toast.msg}
      </div>
    </ToastContext.Provider>
  );
}
