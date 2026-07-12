import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Flag, Users, CalendarDays, Star, Settings } from 'lucide-react';
import { cn } from '../../../lib/utils';

const ITEMS = [
  { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/admin/reports', label: 'Reportes', icon: Flag, end: false },
  { to: '/admin/users', label: 'Usuarios', icon: Users, end: false },
  { to: '/admin/plans', label: 'Planes', icon: CalendarDays, end: false },
  { to: '/admin/reviews', label: 'Reseñas', icon: Star, end: false },
  { to: '/admin/settings', label: 'Configuración', icon: Settings, end: false },
];

export function AdminNav() {
  return (
    <nav aria-label="Panel de administración" className="flex gap-1 overflow-x-auto py-2">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap',
              isActive ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100',
            )
          }
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
