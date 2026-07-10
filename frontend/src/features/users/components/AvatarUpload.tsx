// frontend/src/features/users/components/AvatarUpload.tsx
import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useMe, useUploadAvatar } from '../hooks';
import { UserAvatar } from './UserAvatar';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (validación de UI; el backend impone el suyo)
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export function AvatarUpload() {
  const { data: me } = useMe();
  const upload = useUploadAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Genera dataURL para preview local; limpia al desmontar/cambiar.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      toast.error('Formato no válido. Usá PNG, JPEG o WEBP.');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('La imagen pesa más de 5 MB.');
      return;
    }
    setFile(f);
  };

  const onSave = () => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => {
        toast.success('Avatar actualizado');
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      },
      onError: () => toast.error('No se pudo subir el avatar. Intentá de nuevo.'),
    });
  };

  const onCancel = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (!me) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative group"
        aria-label="Cambiar avatar"
      >
        <UserAvatar url={preview ?? me.avatar_url} name={me.display_name} size="xl" />
        <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg group-active:scale-95 transition-transform">
          <Camera className="w-4 h-4" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={onSelect}
      />

      {file && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" loading={upload.isPending} onClick={onSave}>
            Guardar avatar
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={upload.isPending}>
            Cancelar
          </Button>
        </div>
      )}
      {upload.isPending && !file && (
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…
        </span>
      )}
    </div>
  );
}
