// frontend/src/features/plans/components/MyPlanCard.tsx
import { Calendar, Clock, MapPin, Pencil, Trash2, Users, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { ACTIVITY_META } from '../constants';
import type { MyPlanItem } from '../types';
import type { PlanStatus } from '../../../types/enums';

interface Props {
  plan: MyPlanItem;
  onEdit: (plan: MyPlanItem) => void;
  onDelete: (plan: MyPlanItem) => void;
}

const STATUS_META: Record<PlanStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Abierto', variant: 'success' },
  matched: { label: 'Matcheado', variant: 'brand' },
  closed: { label: 'Cerrado', variant: 'neutral' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
  expired: { label: 'Expirado', variant: 'neutral' },
};

export function MyPlanCard({ plan, onEdit, onDelete }: Props) {
  const navigate = useNavigate();
  const meta = ACTIVITY_META[plan.activity_type] ?? ACTIVITY_META.other;
  const ActivityIcon = meta.icon;
  const statusMeta = STATUS_META[plan.status];
  const isOpen = plan.status === 'open';
  const hasPending = plan.pending_applications_count > 0;

  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-900/5 flex items-center justify-center text-gray-700">
          <ActivityIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-base leading-tight">
            {plan.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{plan.location_label}</span>
          </div>
        </div>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5">
          {plan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
          {plan.mode === 'now' ? 'Ahora' : 'Agendado'}
        </div>
        <div className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {plan.current_participants}/{plan.max_participants}
        </div>
      </div>

      {/* Contador de postulantes — link a la página de aplicaciones */}
      <button
        type="button"
        onClick={() => navigate(`/plans/${plan.id}/applications`)}
        disabled={!isOpen && !hasPending}
        className="flex items-center gap-2 text-sm font-medium disabled:opacity-40 active:scale-95 transition-transform"
        style={{ color: hasPending ? '#dc2626' : '#1f2937' }}
      >
        <UserPlus className="w-4 h-4" />
        {plan.pending_applications_count === 0
          ? 'Sin postulantes'
          : `${plan.pending_applications_count} postulante${plan.pending_applications_count === 1 ? '' : 's'}`}
        {hasPending && (
          <Badge variant="warning">Nuevos</Badge>
        )}
      </button>

      {/* Acciones */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <button
          type="button"
          onClick={() => onEdit(plan)}
          disabled={!isOpen}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-600 disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Pencil className="w-4 h-4" />
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(plan)}
          disabled={!isOpen}
          className="flex items-center gap-1.5 text-sm font-medium text-red-600 ml-auto disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Trash2 className="w-4 h-4" />
          Eliminar
        </button>
      </div>
    </div>
  );
}
