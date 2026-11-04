import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from '../hooks';

// Botón flotante "volver arriba": aparece al bajar y sube con scroll suave.
export default function ScrollTop() {
  const t = useT();
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  return (
    <button
      type="button"
      className={`totop${show ? ' show' : ''}`}
      aria-label={t('ui.top')}
      title={t('ui.top')}
      tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}
