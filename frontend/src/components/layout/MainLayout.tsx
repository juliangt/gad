import { Outlet, NavLink } from 'react-router-dom';
import { Search, MessageCircle, User } from 'lucide-react';

export function MainLayout() {
  return (
    <div className="relative min-h-[100dvh] w-full bg-gray-50 flex flex-col">
      {/* Area de contenido principal */}
      <main className="flex-1 w-full pb-24">
        <Outlet />
      </main>

      {/* Barra de navegación inferior flotante tipo cápsula */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg z-50 bg-white/95 backdrop-blur-md border border-gray-100 rounded-full shadow-2xl px-8 py-2.5">
        <div className="flex items-center justify-around">
          <NavLink
            to="/explore"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
              }`
            }
          >
            <Search className="w-6 h-6 stroke-[2.5]" />
            <span>Explorar</span>
          </NavLink>

          <NavLink
            to="/matches"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
              }`
            }
          >
            <MessageCircle className="w-6 h-6 stroke-[2]" />
            <span>Matches</span>
          </NavLink>

          <NavLink
            to="/me"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
              }`
            }
          >
            <User className="w-6 h-6 stroke-[2]" />
            <span>Perfil</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
