// frontend/src/features/matching/components/ConfirmActionDialog.tsx
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Wrapper fino sobre el ConfirmDialog de F0 para reusarlo en
 * "finalizar match", "cancelar match", "retirar postulación", etc.
 * Expone props con defaults es-AR.
 */
export function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      loading={loading}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
