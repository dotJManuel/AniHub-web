import { useCallback, useRef, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ToastContext, type ToastFn } from './hooks';
import Home from './pages/Home';
import Detail from './pages/Detail';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Callback from './pages/Callback';

export default function App() {
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
