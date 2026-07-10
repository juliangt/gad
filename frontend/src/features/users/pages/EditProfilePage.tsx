import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/auth/useAuth';
import { useDeleteMe } from '../hooks';
import { AvatarUpload } from '../components/AvatarUpload';
import { ProfileForm } from '../components/ProfileForm';
import { PreferencesForm } from '../components/PreferencesForm';
import { SectionCard } from './_SectionCard';

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const deleteMe = useDeleteMe();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirmDelete = () => {
    deleteMe.mutate(undefined, {
      onSuccess: async () => {
        toast.success('Cuenta eliminada');
        await logout();
        navigate('/register', { replace: true });
      },
      onError: () => {
        toast.error('No se pudo eliminar la cuenta. Intentá de nuevo.');
        setConfirmOpen(false);
      },
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top overflow-y-auto">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <Link
          to="/me"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Editar perfil</h1>
      </div>

      <div className="flex-1 px-6 py-6 flex flex-col gap-6 max-w-md mx-auto w-full">
        <SectionCard title="Avatar">
          <AvatarUpload />
        </SectionCard>

        <SectionCard title="Datos personales">
          <ProfileForm />
        </SectionCard>

        <SectionCard title="Preferencias">
          <PreferencesForm />
        </SectionCard>

        <SectionCard title="Zona de peligro" tone="danger">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Borramos tu cuenta de forma permanente (soft-delete). Esta acción no se puede deshacer.
            </p>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="w-4 h-4" /> Eliminar mi cuenta
            </Button>
          </div>
        </SectionCard>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="¿Eliminar tu cuenta?"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              loading={deleteMe.isPending}
              onClick={onConfirmDelete}
            >
              Sí, eliminar
            </Button>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Se cerrará tu sesión y no podrás volver a entrar con este email. Esta acción es definitiva.
        </p>
      </Modal>
    </div>
  );
}
