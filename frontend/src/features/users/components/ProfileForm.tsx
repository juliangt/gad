import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Smile, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useMe, useUpdateMe } from '../hooks';
import { userUpdateSchema, type UserUpdateFormValues } from '../schemas';

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
    control,
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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Género
        </label>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => {
            const options = [
              {
                value: 'male',
                label: 'Hombre',
                icon: (props: React.SVGProps<SVGSVGElement>) => (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
                    <circle cx="10" cy="14" r="5" />
                    <path d="M19 5v6M13 5h6M13.5 10.5 19 5" />
                  </svg>
                ),
              },
              {
                value: 'female',
                label: 'Mujer',
                icon: (props: React.SVGProps<SVGSVGElement>) => (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
                    <circle cx="12" cy="9" r="6" />
                    <path d="M12 15v8M9 19h6" />
                  </svg>
                ),
              },
              { value: 'nonbinary', label: 'No binario', icon: Smile },
              { value: 'undisclosed', label: 'Prefiero no decirlo', icon: HelpCircle },
            ] as const;

            return (
              <div className="grid grid-cols-4 gap-2">
                {options.map((o) => {
                  const Icon = o.icon;
                  const isSelected = field.value === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => field.onChange(o.value)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all gap-1.5 min-h-[84px] ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/50 text-brand-600'
                          : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${isSelected ? 'text-brand-500' : 'text-gray-400'}`} />
                      <span className="text-[10px] font-medium leading-tight text-center">
                        {o.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          }}
        />
        {errors.gender && <p className="text-xs text-red-600 mt-1">{errors.gender.message}</p>}
      </div>

      <Button type="submit" loading={update.isPending || isSubmitting}>
        Guardar cambios
      </Button>
    </form>
  );
}
