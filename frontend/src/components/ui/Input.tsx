import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full px-4 py-3 rounded-xl bg-gray-50 border text-gray-900 placeholder:text-gray-400',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        invalid ? 'border-red-400 focus:ring-red-500' : 'border-gray-200',
        className,
      )}
      {...rest}
    />
  );
});
