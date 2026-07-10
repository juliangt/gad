// frontend/src/features/users/components/VerificationBadge.tsx
import { ShieldCheck, Mail, CircleCheck } from 'lucide-react';
import type { VerificationLevel } from '@/types/enums';
import { VERIFICATION_LABELS } from '../constants';
import { Badge } from '@/components/ui/Badge';

export function VerificationBadge({ level }: { level: VerificationLevel }) {
  if (level === 'none') {
    return (
      <Badge variant="neutral">
        <CircleCheck className="w-3.5 h-3.5" />
        {VERIFICATION_LABELS.none}
      </Badge>
    );
  }
  const Icon = level === 'email' ? Mail : ShieldCheck;
  return (
    <Badge variant="success">
      <Icon className="w-3.5 h-3.5" />
      {VERIFICATION_LABELS[level]}
    </Badge>
  );
}
