import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useMe, useUpdateMe } from '../hooks';
import { userUpdateSchema, type UserUpdateFormValues } from '../schemas';
import { GENDER_OPTIONS } from '../constants';

/**
 * Edición del perfil del usuario autenticado (PATCH /me).
 *
 * NOTA: `userUpdateSchema` y `UserUpdateIn` incluyen `locale`/`timezone`, pero
 * `UserDetail` (GET /me) no los devuelve, por lo que no hay fuente para
 * precargarlos. Se omiten para no pisarlos con null en cada guardado.
 */
export function ProfileForm() {
  const { data: me } = useMe();
  const update = useUpdateMe();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserUpdateFormValues>({
    resolver: zodResolver(userUpdateSchema),
    // `values` re-sincroniza cuando `me` carga o cambia externamente.
    values: me
      ? {
          display_name: me.display_name,
          bio: me.bio ?? '',
          birth_date: me.birth_date ?? '',
          gender: me.gender,
        }
      : undefined,
    mode: 'onBlur',
  });

  const onSubmit = (values: UserUpdateFormValues) => {
    update.mutate(
      {
        display_name: values.display_name,
        bio: values.bio ? values.bio : null,
        birth_date: values.birth_date ? values.birth_date : null,
        gender: values.gender ?? null,
      },
      {
        onSuccess: () => toast.success('Perfil actualizado'),
        onError: () => toast.error('No se pudo guardar. Intentá de nuevo.'),
      },
    );
  };

  if (!me) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre visible
        </label>
        <Input
          id="display_name"
          placeholder="¿Cómo te llaman?"
          invalid={Boolean(errors.display_name)}
          {...register('display_name')}
        />
        {errors.display_name && (
          <p className="text-xs text-red-600 mt-1">{errors.display_name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
          Bio
        </label>
        <Textarea
          id="bio"
          rows={4}
          maxLength={500}
          placeholder="Contá algo sobre vos (máx. 500 caracteres)"
          invalid={Boolean(errors.bio)}
          {...register('bio')}
        />
        {errors.bio && <p className="text-xs text-red-600 mt-1">{errors.bio.message}</p>}
      </div>

      <div>
        <label htmlFor="birth_date" className="block text-sm font-medium text-gray-700 mb-1">
          Fecha de nacimiento
        </label>
        <Input
          id="birth_date"
          type="date"
          invalid={Boolean(errors.birth_date)}
          {...register('birth_date')}
        />
        {errors.birth_date && (
          <p className="text-xs text-red-600 mt-1">{errors.birth_date.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
          Género
        </label>
        <select
          id="gender"
          defaultValue={me.gender}
          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          {...register('gender')}
        >
          {GENDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {errors.gender && <p className="text-xs text-red-600 mt-1">{errors.gender.message}</p>}
      </div>

      <Button type="submit" loading={update.isPending || isSubmitting}>
        Guardar cambios
      </Button>
    </form>
  );
}
