import { UserPlus } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function RegisterStub() {
  return (
    <div className="w-full h-[100dvh] bg-white flex items-center justify-center">
      <EmptyState
        icon={<UserPlus className="w-12 h-12" />}
        title="Crear cuenta — próximamente"
        description="El registro real llega en la Fase 1."
      />
    </div>
  );
}
