// frontend/src/features/safety/components/SosButton.tsx
import { useEffect, useState } from 'react';
import { AlertOctagon, Siren, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { useSos } from '../hooks';
import { getCurrentPosition } from '../../../lib/geo';
import { ApiError } from '../../../api/errors';

export interface SosButtonProps {
  matchId: string;
}

const CONFIRM_TEXT = 'SOS';

/**
 * Botón SOS safety-critical. Doble confirmación:
 *  1. Botón rojo "Activar SOS" → abre modal explicativo grave.
 *  2. Modal pide escribir literalmente "SOS" para habilitar el botón confirmar.
 *  3. Confirmar → obtiene ubicación (best-effort) → POST /safety/{match_id}/sos.
 *
 * Si el GPS falla, se envía el SOS igual con coords {0,0} como sentinel
 * (el backend lo registra; mejor un SOS sin coords que ningún SOS).
 * El resultado (event_id) se muestra en un modal de éxito.
 */
export function SosButton({ matchId }: SosButtonProps) {
  const sos = useSos();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ event_id: string; message: string } | null>(null);

  // Reset del campo al cerrar.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const canConfirm = typed.trim().toUpperCase() === CONFIRM_TEXT;

  const handleActivate = async () => {
    let lat = 0;
    let lng = 0;
    let geoWarning = '';
    try {
      const pos = await getCurrentPosition();
      lat = pos.latitude;
      lng = pos.longitude;
    } catch {
      geoWarning = 'No pudimos obtener tu ubicación GPS. Se enviará el SOS igual.';
    }

    try {
      const out = await sos.mutateAsync({ matchId, lat, lng });
      setResult(out);
      setOpen(false);
      if (geoWarning) toast.warning(geoWarning);
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(
        apiErr?.detail ?? 'No pudimos activar el SOS. Intentá de nuevo o llamá a emergencias.',
      );
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-red-600 text-white font-bold text-base shadow-lg shadow-red-600/30 hover:bg-red-700 active:scale-[0.98] transition"
        aria-label="Activar SOS"
      >
        <Siren className="w-5 h-5" />
        Activar SOS
      </button>

      {/* Modal de doble confirmación */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2 text-red-600">
            <AlertOctagon className="w-6 h-6" /> Confirmar SOS
          </span>
        }
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sos.isPending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleActivate}
              loading={sos.isPending}
              disabled={!canConfirm}
            >
              <Siren className="w-4 h-4" /> Enviar SOS ahora
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="font-semibold text-red-800 mb-1">¿Estás en peligro?</p>
            <p className="text-red-700">
              Al activar el SOS, notificaremos a tu par y a tus contactos de confianza con tu
              ubicación actual. Usalo solo en una emergencia real.
            </p>
          </div>
          <p>
            Para confirmar, escribí <strong className="tracking-widest">SOS</strong> en el campo de
            abajo. Esto evita activaciones accidentales.
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Escribí SOS"
            aria-label="Escribí SOS para confirmar"
            autoComplete="off"
            disabled={sos.isPending}
            className="text-center tracking-widest font-bold"
          />
          <p className="text-xs text-gray-500">
            En una emergencia médica o de seguridad, llamá también a los servicios de emergencia de
            tu zona.
          </p>
        </div>
      </Modal>

      {/* Modal de éxito */}
      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title={
          <span className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-6 h-6" /> SOS enviado
          </span>
        }
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setResult(null)}>Entendido</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-gray-700">
          <p>{result?.message ?? 'Tu alerta fue enviada.'}</p>
          {result?.event_id && (
            <div className="flex items-center gap-2">
              <Badge variant="neutral">ID del evento</Badge>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded">{result.event_id}</code>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Guardá este ID por si necesitás referenciarlo con soporte.
          </p>
        </div>
      </Modal>
    </>
  );
}
