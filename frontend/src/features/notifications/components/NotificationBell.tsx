import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUnreadCount, useNotifications, useMarkAllRead } from '../hooks';
import { NotificationItem } from './NotificationItem';

/**
 * Campana de notificaciones para el header. Muestra un badge con el count de
 * no leídas (polling) y un dropdown con las últimas 5. Link a /notifications
 * para ver todas.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: countData } = useUnreadCount();
  const { data } = useNotifications(false);
  const markAll = useMarkAllRead();

  const unread = countData?.count ?? 0;
  const recent = data?.pages.flatMap((p) => p.items).slice(0, 5) ?? [];

  // Cerrar al clic fuera.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const badgeLabel = unread > 99 ? '99+' : String(unread);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative p-2 rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Bell className="w-6 h-6 text-gray-700" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones recientes"
          className={cn(
            'absolute right-0 mt-2 w-[22rem] max-w-[92vw] z-50',
            'glass-panel rounded-2xl shadow-xl border border-gray-200 overflow-hidden',
          )}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Notificaciones</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                No tienes notificaciones.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recent.map((n) => (
                  <li key={n.id}>
                    <NotificationItem notification={n} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 p-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-medium text-brand-700 hover:bg-brand-50 rounded-lg py-2"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
