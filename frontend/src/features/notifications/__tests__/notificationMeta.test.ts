import { describe, it, expect } from 'vitest';
import { getNotificationMeta, NOTIFICATION_META, isNotificationType } from '../notificationMeta';

describe('notificationMeta', () => {
  it('expone un meta para cada NotificationType del contrato', () => {
    const allTypes = [
      'new_application',
      'match',
      'new_message',
      'safety',
      'review',
      'plan_alert',
    ] as const;
    for (const t of allTypes) {
      const meta = getNotificationMeta(t);
      expect(meta).toBeDefined();
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.icon).toBe('string');
      expect(['brand', 'success', 'warning', 'danger', 'info']).toContain(meta.tone);
    }
  });

  it('getNotificationMeta devuelve un fallback seguro para tipo desconocido', () => {
    const meta = getNotificationMeta('unknown_type' as never);
    expect(meta.label).toBe('Notificación');
    expect(meta.tone).toBe('brand');
  });

  it('isNotificationType valida valores del enum', () => {
    expect(isNotificationType('match')).toBe(true);
    expect(isNotificationType('new_message')).toBe(true);
    expect(isNotificationType('bogus')).toBe(false);
    expect(isNotificationType('')).toBe(false);
  });

  it('NOTIFICATION_META tiene exactamente 6 entradas', () => {
    expect(Object.keys(NOTIFICATION_META)).toHaveLength(6);
  });
});
