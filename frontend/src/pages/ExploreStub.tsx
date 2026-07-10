import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function ExploreStub() {
  return (
    <div className="w-full h-[100dvh] bg-gray-100 flex items-center justify-center">
      <EmptyState
        icon={<Compass className="w-12 h-12" />}
        title="Explorar — próximamente"
        description="El mapa con planes reales llega en la Fase 3."
      />
    </div>
  );
}
