import { Link } from 'react-router-dom';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';

/**
 * Header con la campana de notificaciones. En las páginas de dominio que
 * renderizan su propio header (p. ej. NotificationsPage), este componente es
 * opcional; está pensado para layouts globales si se añaden más adelante.
 */
export function Header({ title = 'GAD' }: { title?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/explore" className="font-bold text-gray-900" aria-label="Ir a inicio">
          {title}
        </Link>
        <NotificationBell />
      </div>
    </header>
  );
}
