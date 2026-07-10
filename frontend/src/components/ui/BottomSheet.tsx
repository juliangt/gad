import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
}

export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-5 shadow-2xl max-h-[85vh] overflow-y-auto hide-scrollbar"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        {title && (
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
