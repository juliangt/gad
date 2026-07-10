import { LogIn } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function LoginStub() {
  return (
    <div className="w-full h-[100dvh] bg-white flex items-center justify-center">
      <EmptyState
        icon={<LogIn className="w-12 h-12" />}
        title="Iniciar sesión — próximamente"
        description="El login real llega en la Fase 1."
      />
    </div>
  );
}
