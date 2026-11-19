import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useT } from '../hooks';
import { IconBell, IconGrid, IconSearch, IconSliders } from './Icons';
import { useUnreadCount } from './Header';

// Geometría de la barra flotante (px). Ver el valle en `barPath`.
const H = 50; // alto de la barra
const R = 18; // radio de las esquinas
const HW = 38; // medio ancho del valle
const K1 = 23; // suavidad del hombro
const K2 = 38; // fondo plano
const DEPTH = 42; // profundidad del valle
const CIRCLE = 36; // diámetro del círculo
const MIN_CX = R + HW; // el valle no puede acercarse más que esto a los bordes
const DURATION = 520; // ms

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// Contorno de la barra: esquinas redondas y, si hay opción activa (cx), un valle en forma de S centrado en cx.
function barPath(W: number, cx: number | null): string {
  const top =
    cx == null
      ? `H ${W - R}`
      : `H ${cx - HW} C ${cx - HW + K1} 0 ${cx - K2} ${DEPTH} ${cx} ${DEPTH} C ${cx + K2} ${DEPTH} ${cx + HW - K1} 0 ${cx + HW} 0 H ${W - R}`;
  return `M ${R} 0 ${top} A ${R} ${R} 0 0 1 ${W} ${R} V ${H - R} A ${R} ${R} 0 0 1 ${W - R} ${H} H ${R} A ${R} ${R} 0 0 1 0 ${H - R} V ${R} A ${R} ${R} 0 0 1 ${R} 0 Z`;
}

interface Item {
  to: string;
  key: 'nav.list' | 'nav.search' | 'nav.activity' | 'nav.settings';
  icon: ReactNode;
  exact?: boolean;
  badge?: boolean;
}

// Barra inferior flotante de móvil: Lista · Buscar · Actividad · Ajustes.
// "Buscar" abre el buscador global (anime y manga). Un valle animado marca la opción activa.
export default function BottomNav() {
  const t = useT();
  const { pathname } = useLocation();
  const unread = useUnreadCount();

  const items: Item[] = [
    { to: '/', key: 'nav.list', icon: <IconGrid size={20} />, exact: true },
    { to: '/search', key: 'nav.search', icon: <IconSearch size={20} /> },
    { to: '/notifications', key: 'nav.activity', icon: <IconBell size={20} />, badge: !!unread.data },
    { to: '/settings', key: 'nav.settings', icon: <IconSliders size={20} /> },
  ];

  const routeIdx = items.findIndex((i) => (i.exact ? pathname === i.to : pathname.startsWith(i.to)));
  // Respuesta inmediata: al tocar una opción el valle ya se mueve; la ruta real lo confirma (o lo corrige) después.
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => setPending(null), [pathname]);
  const activeIdx = pending ?? (routeIdx >= 0 ? routeIdx : null);

  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const circleRef = useRef<HTMLSpanElement>(null);
  const cxRef = useRef<number | null>(null); // cx dibujado ahora mismo
  const rafRef = useRef(0);
  const idxRef = useRef<number | null>(activeIdx);
  idxRef.current = activeIdx;
  const placed = useRef(false);

  const draw = (cx: number | null) => {
    const nav = navRef.current;
    const path = pathRef.current;
    const circle = circleRef.current;
    if (!nav || !path || !circle) return;
    const W = nav.clientWidth;
    path.ownerSVGElement?.setAttribute('viewBox', `0 0 ${W} ${H}`);
    path.setAttribute('d', barPath(W, cx));
    if (cx == null) {
      circle.style.opacity = '0';
    } else {
      circle.style.opacity = '1';
      circle.style.transform = `translateX(${cx - CIRCLE / 2}px)`;
    }
    cxRef.current = cx;
  };

  // Coloca el valle bajo la opción idx. `animate` mueve el valle con rebote; si no, se dibuja directo.
  const place = (idx: number | null, animate: boolean) => {
    const nav = navRef.current;
    const row = rowRef.current;
    if (!nav || !row) return;
    cancelAnimationFrame(rafRef.current);
    const W = nav.clientWidth;
    if (!W) return;
    const links = Array.from(row.children) as HTMLElement[];

    if (idx == null) {
      links.forEach((l) => l.style.setProperty('--dx', '0px'));
      draw(null);
      return;
    }

    // Centro natural de la opción (sin transformaciones) y centro del valle limitado a los bordes.
    const link = links[idx];
    const natural = link.offsetLeft + link.offsetWidth / 2;
    const target = Math.min(Math.max(natural, MIN_CX), W - MIN_CX);
    links.forEach((l, i) => l.style.setProperty('--dx', i === idx ? `${target - natural}px` : '0px'));

    const from = cxRef.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce || from == null || from === target) {
      draw(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      const cx = from + (target - from) * easeOutBack(p);
      draw(Math.min(Math.max(cx, MIN_CX), W - MIN_CX));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else draw(target);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Cambio de opción activa: anima, salvo la primera colocación.
  useLayoutEffect(() => {
    place(activeIdx, placed.current);
    placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  // Cambios de tamaño (giro de pantalla, teclado…): se redibuja sin animar.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => {
      nav.classList.add('is-static');
      place(idxRef.current, false);
      requestAnimationFrame(() => nav.classList.remove('is-static'));
    });
    ro.observe(nav);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav className="bnav" ref={navRef} aria-label={t('nav.main')}>
      <svg className="bnav-bg" aria-hidden="true" width="100%" height="100%">
        <path ref={pathRef} d="" />
      </svg>
      <span className="bnav-circle" ref={circleRef} aria-hidden="true" />
      <div className="bnav-row" ref={rowRef}>
        {items.map((it, i) => (
          <Link
            key={it.to}
            to={it.to}
            className={activeIdx === i ? 'on' : ''}
            aria-current={routeIdx === i ? 'page' : undefined}
            onClick={() => setPending(i === routeIdx ? null : i)}
          >
            {it.icon}
            <span className="sr-only">{t(it.key)}</span>
            {it.badge && <span className="nav-dot" aria-hidden="true" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}
