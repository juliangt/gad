// frontend/src/features/safety/components/ShareLinkCard.tsx
import { useState } from 'react';
import { Link2, Copy, Check, Trash2, QrCode, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useCreateShareLink, useRevokeShareLink } from '../hooks';
import { ApiError } from '../../../api/errors';

export interface ShareLinkCardProps {
  matchId: string;
}

/** Construye la URL pública absoluta a partir del path relativo "/s/<token>". */
function buildPublicUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function ShareLinkCard({ matchId }: ShareLinkCardProps) {
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const publicUrl = token ? buildPublicUrl(`/s/${token}`) : '';

  const handleCreate = async () => {
    try {
      const out = await createLink.mutateAsync(matchId);
      setToken(out.token);
      toast.success('Link de seguimiento creado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos crear el link.');
    }
  };

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success('Link copiado al portapapeles.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No pudimos copiar. Copialo a mano.');
    }
  };

  const handleRevoke = async () => {
    if (!token) return;
    const t = token;
    setConfirmRevoke(false);
    try {
      await revokeLink.mutateAsync({ matchId, token: t });
      setToken(null);
      setShowQr(false);
      toast.success('Link revocado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos revocar el link.');
    }
  };

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Link de seguimiento</h2>
        </div>
        {token && <Badge variant="success">Activo</Badge>}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        Compartí este link para que alguien de confianza vea tu ubicación en tiempo real, sin
        necesidad de cuenta. Revocalo cuando termines.
      </p>

      {!token ? (
        <Button onClick={handleCreate} loading={createLink.isPending} fullWidth>
          <Link2 className="w-4 h-4" /> Crear link de seguimiento
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={publicUrl}
              className="flex-1 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 font-mono truncate"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" size="md" onClick={handleCopy} aria-label="Copiar">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowQr((s) => !s)}>
              <QrCode className="w-4 h-4" /> {showQr ? 'Ocultar QR' : 'Ver QR'}
            </Button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-600 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRevoke(true)}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Revocar
            </Button>
          </div>

          {showQr && token && (
            <div className="flex justify-center py-3 bg-white rounded-xl border border-gray-100">
              <QRCodeSVG value={publicUrl} size={160} level="M" />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={handleRevoke}
        title="Revocar link"
        message="Una vez revocado, el link dejará de funcionar inmediatamente. Nadie podrá ver tu ubicación con ese link."
        confirmLabel="Revocar link"
        danger
        loading={revokeLink.isPending}
      />
    </section>
  );
}
