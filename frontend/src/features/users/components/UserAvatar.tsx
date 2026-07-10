// frontend/src/features/users/components/UserAvatar.tsx
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  url: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'w-10 h-10 text-base',
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
};

export function UserAvatar({ url, name, size = 'md', className }: UserAvatarProps) {
  const initial = name && name.length > 0 ? name.charAt(0).toUpperCase() : '?';

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn('rounded-full object-cover bg-gray-100', SIZE[size], className)}
      />
    );
  }

  return (
    <div
      aria-label={name || 'Avatar'}
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shadow-lg',
        'bg-gradient-to-br from-brand-400 to-brand-600',
        SIZE[size],
        className,
      )}
    >
      {initial}
    </div>
  );
}
