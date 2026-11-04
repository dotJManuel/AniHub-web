import { NavLink, useLocation } from 'react-router-dom';
import { IconBell, IconGrid, IconSearch, IconSliders } from './Icons';
import { useUnreadCount } from './Header';

// Barra inferior de móvil: Lista · Buscar · Actividad · Ajustes.
// "Buscar" abre el buscador global (anime y manga).
export default function BottomNav() {
  const { pathname } = useLocation();
  const unread = useUnreadCount();

  return (
    <nav className="bnav" aria-label="Navegación principal">
      <NavLink to="/" end className={() => (pathname === '/' ? 'on' : '')}>
        <IconGrid />
        Lista
      </NavLink>
      <NavLink to="/search" className={() => (pathname === '/search' ? 'on' : '')}>
        <IconSearch size={20} />
        Buscar
      </NavLink>
      <NavLink to="/notifications" className={() => (pathname === '/notifications' ? 'on' : '')}>
        <IconBell size={20} />
        Actividad
        {!!unread.data && <span className="nav-dot" />}
      </NavLink>
      <NavLink to="/settings" className={() => (pathname === '/settings' ? 'on' : '')}>
        <IconSliders size={20} />
        Ajustes
      </NavLink>
    </nav>
  );
}
