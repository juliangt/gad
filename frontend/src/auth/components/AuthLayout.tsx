import type { ReactNode } from 'react';
import { Compass } from 'lucide-react';

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Layout compartido para login/registro/forgot/reset. Fondo de marca + panel glass. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-5 py-8 bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-600/30">
            <Compass className="w-6 h-6" />
          </div>
          <span className="text-2xl font-extrabold text-gray-900 tracking-tight">GAD</span>
        </div>

        <div className="w-full glass-panel rounded-3xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-gray-900 text-center">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-500 text-center mt-1 mb-5">{subtitle}</p>
          )}
          <div className={subtitle ? '' : 'mt-5'}>{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-gray-600">{footer}</div>}
      </div>
    </div>
  );
}
