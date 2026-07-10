// frontend/src/features/safety/pages/TrustedContactsPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Plus, Trash2, ShieldCheck, UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Spinner } from '../../../components/ui/Spinner';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import {
  useTrustedContacts,
  useAddTrustedContact,
  useDeleteTrustedContact,
} from '../hooks';
import { trustedContactSchema, type TrustedContactValues } from '../schemas';
import type { TrustedContactOut } from '../types';
import { ApiError } from '../../../api/errors';

const MAX_CONTACTS = 2;

export default function TrustedContactsPage() {
  const { data: contacts, isLoading, isError, error, refetch } = useTrustedContacts();
  const addContact = useAddTrustedContact();
  const deleteContact = useDeleteTrustedContact();
  const [pendingDelete, setPendingDelete] = useState<TrustedContactOut | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TrustedContactValues>({
    resolver: zodResolver(trustedContactSchema),
    defaultValues: { contact_type: 'email', contact_value: '', label: '' },
  });
  const contactType = watch('contact_type');

  const atLimit = (contacts?.length ?? 0) >= MAX_CONTACTS;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addContact.mutateAsync(values);
      toast.success('Contacto de confianza añadido.');
      reset();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === 'conflict') {
        toast.error(apiErr.detail || 'Alcanzaste el máximo de 2 contactos o ya existe.');
      } else {
        toast.error(apiErr?.detail ?? 'No pudimos añadir el contacto. Probá de nuevo.');
      }
    }
  });

  const onConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteContact.mutateAsync(target.id);
      toast.success('Contacto eliminado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos eliminar el contacto.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/me"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600" /> Contactos de confianza
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
        <section className="glass-panel rounded-2xl p-5">
          <p className="text-sm text-gray-600 leading-relaxed">
            Tus contactos de confianza reciben tu ubicación si activás un{' '}
            <strong>SOS</strong> durante un match. Podés añadir hasta{' '}
            <strong>{MAX_CONTACTS}</strong>.
          </p>
        </section>

        {/* Lista */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Guardados ({contacts?.length ?? 0}/{MAX_CONTACTS})
          </h2>
          {isLoading && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Spinner />
              <p className="text-sm text-gray-500">Cargando contactos…</p>
            </div>
          )}
          {isError && (
            <ErrorState
              message={(error as Error)?.message}
              onRetry={() => refetch()}
            />
          )}
          {!isLoading && !isError && (contacts?.length ?? 0) === 0 && (
            <EmptyState
              icon={<UserPlus className="w-10 h-10" />}
              title="Sin contactos todavía"
              description="Añadir un contacto de confianza para tu seguridad durante los matches."
            />
          )}
          {!isLoading && !isError && (contacts?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {contacts!.map((c) => (
                <li
                  key={c.id}
                  className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                    {c.contact_type === 'email' ? (
                      <Mail className="w-5 h-5" />
                    ) : (
                      <Phone className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.label}</p>
                    <p className="text-sm text-gray-500 truncate">{c.contact_value}</p>
                  </div>
                  <Badge variant="brand">
                    {c.contact_type === 'email' ? 'Email' : 'Teléfono'}
                  </Badge>
                  <button
                    onClick={() => setPendingDelete(c)}
                    className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Eliminar ${c.label}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Form añadir */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Añadir contacto
          </h2>
          {atLimit && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Alcanzaste el máximo de {MAX_CONTACTS} contactos. Eliminá uno para añadir otro.
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo</label>
              <div className="flex gap-2">
                {(['email', 'phone'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue('contact_type', t, { shouldValidate: true })}
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                      contactType === t
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    } ${atLimit ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {t === 'email' ? 'Email' : 'Teléfono'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {contactType === 'email' ? 'Email' : 'Teléfono'}
              </label>
              <Input
                type={contactType === 'email' ? 'email' : 'tel'}
                placeholder={contactType === 'email' ? 'nombre@email.com' : '+54 11 ...'}
                invalid={!!errors.contact_value}
                disabled={atLimit || addContact.isPending}
                {...register('contact_value')}
              />
              {errors.contact_value && (
                <p className="text-xs text-red-500 mt-1">{errors.contact_value.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Etiqueta (cómo lo conocés)
              </label>
              <Input
                placeholder="Ej: Mamá, Mejor amigo..."
                invalid={!!errors.label}
                disabled={atLimit || addContact.isPending}
                {...register('label')}
              />
              {errors.label && (
                <p className="text-xs text-red-500 mt-1">{errors.label.message}</p>
              )}
            </div>

            <Button type="submit" fullWidth loading={addContact.isPending} disabled={atLimit}>
              <Plus className="w-4 h-4" /> Añadir contacto
            </Button>
          </form>
        </section>
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
        title="Eliminar contacto"
        message={
          <>
            ¿Seguro que querés eliminar a{' '}
            <strong>{pendingDelete?.label}</strong> de tus contactos de confianza?
          </>
        }
        confirmLabel="Eliminar"
        danger
        loading={deleteContact.isPending}
      />
    </div>
  );
}
