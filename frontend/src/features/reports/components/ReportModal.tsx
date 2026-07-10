// frontend/src/features/reports/components/ReportModal.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { useReportUser } from '../hooks';
import { ApiError } from '../../../api/errors';

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  /** ID del usuario a reportar. */
  userId: string;
  /** Nombre para mostrar en el header. */
  userDisplayName?: string;
}

const COMMON_REASONS = [
  'Perfil falso',
  'Spam o estafa',
  'Acoso o mal comportamiento',
  'Contenido inapropiado',
  'Otro',
];

/**
 * Modal reutilizable para reportar usuarios (POST /users/{id}/report).
 * Rate-limit 10/día en backend. reason 1..50, description max 1000.
 */
export function ReportModal({
  open,
  onClose,
  userId,
  userDisplayName,
}: ReportModalProps) {
  const report = useReportUser();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);

  const reasonValid = reason.trim().length >= 1 && reason.trim().length <= 50;
  const descriptionValid = description.length <= 1000;
  const canSubmit = reasonValid && descriptionValid && !report.isPending;

  const reset = () => {
    setReason('');
    setDescription('');
    setTouched(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    try {
      await report.mutateAsync({
        userId,
        reason: reason.trim(),
        description: description.trim() || null,
      });
      toast.success('Reporte enviado. Gracias por ayudar a mantener seguro a GAD.');
      handleClose();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === 'rate_limit_exceeded' || apiErr?.status === 429) {
        toast.error('Alcanzaste el límite diario de reportes (10/día).');
      } else if (apiErr?.status === 422) {
        toast.error(apiErr.detail ?? 'No podés reportar a este usuario.');
      } else {
        toast.error(apiErr?.detail ?? 'No pudimos enviar el reporte.');
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2 text-red-600">
          <Flag className="w-5 h-5" /> Reportar usuario
        </span>
      }
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={report.isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={report.isPending} disabled={!canSubmit}>
            Enviar reporte
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-gray-700">
        {userDisplayName && (
          <p>
            Estás por reportar a <strong>{userDisplayName}</strong>. Nuestro equipo de moderación
            revisará el caso.
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Motivo</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Ej: Perfil falso"
            maxLength={50}
            invalid={touched && !reasonValid}
            disabled={report.isPending}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COMMON_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                disabled={report.isPending}
                className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {r}
              </button>
            ))}
          </div>
          {touched && !reasonValid && (
            <p className="text-xs text-red-500 mt-1">Ingresá un motivo (1 a 50 caracteres).</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Detalles <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="Contanos qué pasó, con el mayor detalle posible."
            invalid={!descriptionValid}
            disabled={report.isPending}
          />
          {!descriptionValid && (
            <p className="text-xs text-red-500 mt-1">Máximo 1000 caracteres.</p>
          )}
          <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/1000</p>
        </div>
      </div>
    </Modal>
  );
}
