import { NavLink, useLocation } from 'react-router-dom';
import { useT } from '../hooks';
import { IconBell, IconGrid, IconSearch, IconSliders } from './Icons';
import { useUnreadCount } from './Header';

// Barra inferior de móvil: Lista · Buscar · Actividad · Ajustes.
// "Buscar" abre el buscador global (anime y manga).
export default function BottomNav() {
  const t = useT();
  const { pathname } = useLocation();
  const unread = useUnreadCount();

  return (
    <nav className="bnav" aria-label={t('nav.main')}>
      <NavLink to="/" end className={() => (pathname === '/' ? 'on' : '')}>
        <IconGrid />
        {t('nav.list')}
      </NavLink>
      <NavLink to="/search" className={() => (pathname === '/search' ? 'on' : '')}>
        <IconSearch size={20} />
        {t('nav.search')}
      </NavLink>
      <NavLink to="/notifications" className={() => (pathname === '/notifications' ? 'on' : '')}>
        <IconBell size={20} />
        {t('nav.activity')}
        {!!unread.data && <span className="nav-dot" />}
      </NavLink>
      <NavLink to="/settings" className={() => (pathname === '/settings' ? 'on' : '')}>
        <IconSliders size={20} />
        {t('nav.settings')}
      </NavLink>
    </nav>
  );
}
