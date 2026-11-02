import { NavLink, useLocation } from 'react-router-dom';
import { IconBell, IconGrid, IconSearch, IconSliders } from './Icons';
import { useUnreadCount } from './Header';

// Barra inferior de móvil: Lista · Buscar · Actividad · Ajustes.
// "Buscar" lleva a la lista y enfoca el buscador local (no hay búsqueda global).
export default function BottomNav() {
  const { pathname, search } = useLocation();
  const unread = useUnreadCount();
  const searching = pathname === '/' && search.includes('buscar');

  return (
    <nav className="bnav" aria-label="Navegación principal">
      <NavLink to="/" end className={() => (pathname === '/' && !searching ? 'on' : '')}>
        <IconGrid />
        Lista
      </NavLink>
      <NavLink to="/?buscar=1" className={() => (searching ? 'on' : '')}>
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
