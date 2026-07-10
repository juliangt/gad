import { cn } from '../../lib/utils';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClass = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-24 h-24 text-3xl',
} as const;

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold overflow-hidden bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md flex-shrink-0',
        sizeClass[size],
        className,
      )}
    >
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}
