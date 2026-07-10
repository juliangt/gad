import { useParams } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function PublicShareStub() {
  const { token } = useParams<{ token: string }>();
  return (
    <div className="w-full h-[100dvh] bg-white flex items-center justify-center">
      <EmptyState
        icon={<Share2 className="w-12 h-12" />}
        title="Vista compartida — próximamente"
        description={`Token: ${token ?? '—'}. La vista pública llega en la Fase 6.`}
      />
    </div>
  );
}
