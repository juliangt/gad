import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

interface ResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
  temporaryPassword: string | null;
  loading: boolean;
}

export function ResetPasswordModal({ open, onClose, temporaryPassword, loading }: ResetPasswordModalProps) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (temporaryPassword) {
      navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Contraseña restablecida">
      {loading ? (
        <p className="text-gray-600">Generando contraseña temporal…</p>
      ) : temporaryPassword ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Compartí esta contraseña con el usuario. Se muestra una sola vez y sus sesiones fueron cerradas.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-3">
            <code className="flex-1 font-mono text-sm break-all">{temporaryPassword}</code>
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-gray-600">No se pudo generar la contraseña.</p>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}
