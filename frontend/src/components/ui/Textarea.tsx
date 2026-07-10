import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-4 py-3 rounded-xl bg-gray-50 border text-gray-900 placeholder:text-gray-400 resize-none',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        invalid ? 'border-red-400 focus:ring-red-500' : 'border-gray-200',
        className,
      )}
      {...rest}
    />
  );
});
