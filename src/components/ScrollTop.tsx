import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from '../hooks';

const OFFSET = 400;

// Botones flotantes para subir al inicio o bajar al final de la página (scroll suave).
export default function ScrollTop() {
  const t = useT();
  const { pathname } = useLocation();
  const [up, setUp] = useState(false);
  const [down, setDown] = useState(false);

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setUp(window.scrollY > OFFSET);
      setDown(max - window.scrollY > OFFSET);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // El contenido (listas, detalle) puede crecer después de montar.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [pathname]);

  const arrow = (d: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );

  return (
    <div className="fab">
      <button type="button" className={`fab-btn${up ? ' show' : ''}`} aria-label={t('ui.top')} title={t('ui.top')} tabIndex={up ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        {arrow('m18 15-6-6-6 6')}
      </button>
      <button type="button" className={`fab-btn${down ? ' show' : ''}`} aria-label={t('ui.bottom')} title={t('ui.bottom')} tabIndex={down ? 0 : -1} onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}>
        {arrow('m6 9 6 6 6-6')}
      </button>
    </div>
  );
}
