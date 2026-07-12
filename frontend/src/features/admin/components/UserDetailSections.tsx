/**
 * Secciones del historial 360° de un usuario en el panel admin.
 *
 * Tres tarjetas apiladas (planes, reportes, reseñas) que consumen los hooks
 * de historial (`useAdminUserPlans`, `useAdminUserReports`, `useAdminUserReviews`).
 * Sigue el patrón `glass-panel` + `Badge` usado en el resto de la feature.
 */
import { Star, Flag } from 'lucide-react';
import { formatRelativeTime } from '../../../lib/format';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import {
  useAdminUserPlans,
  useAdminUserReports,
  useAdminUserReviews,
} from '../hooks';
import type { AdminReviewOut, ReportOut } from '../types';

export interface UserDetailSectionsProps {
  userId: string;
}

// Mapeo de estados libres del backend a variantes válidas de `Badge`.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'warning',
  resolved: 'success',
  closed: 'brand',
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
  banned: 'danger',
  expired: 'neutral',
  matched: 'brand',
  cancelled: 'danger',
  canceled: 'danger',
};

function badgeVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? 'neutral';
}

/** Encabezado de sección con título y contador opcional. */
function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        {title}
        {typeof count === 'number' && (
          <span className="text-xs font-normal text-gray-500">({count})</span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** Bloque de carga centrado, reutilizable dentro de cada tarjeta. */
function InlineLoading() {
  return (
    <div className="flex justify-center py-6">
      <Spinner size="md" />
    </div>
  );
}

// ---------------- Plans ----------------

function PlansSection({ userId }: { userId: string }) {
  const query = useAdminUserPlans(userId);
  const plans = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SectionCard title="Planes" count={plans.length || undefined}>
      {query.isLoading ? (
        <InlineLoading />
      ) : query.isError ? (
        <ErrorState title="No se pudieron cargar los planes" onRetry={() => query.refetch()} />
      ) : plans.length === 0 ? (
        <EmptyState title="Sin planes" description="Este usuario aún no creó planes." />
      ) : (
        <>
          <ul className="space-y-2">
            {plans.map((plan) => (
              <li key={plan.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{plan.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {plan.activity_type} · {formatRelativeTime(plan.created_at)}
                    </p>
                  </div>
                  <Badge variant={badgeVariant(plan.status)}>{plan.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
          {query.hasNextPage && (
            <div className="flex justify-center mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ---------------- Reports ----------------

function ReportItem({ report }: { report: ReportOut }) {
  return (
    <li className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{report.reason}</p>
          {report.description && (
            <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{report.description}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Reportado: <span className="font-mono">{report.reported_id.slice(0, 8)}</span> ·{' '}
            {formatRelativeTime(report.created_at)}
          </p>
        </div>
        <Badge variant={badgeVariant(report.status)}>{report.status}</Badge>
      </div>
    </li>
  );
}

function ReportsSection({ userId }: { userId: string }) {
  const query = useAdminUserReports(userId);
  const filed = query.data?.filed ?? [];
  const received = query.data?.received ?? [];

  return (
    <SectionCard title="Reportes">
      {query.isLoading ? (
        <InlineLoading />
      ) : query.isError ? (
        <ErrorState title="No se pudieron cargar los reportes" onRetry={() => query.refetch()} />
      ) : filed.length === 0 && received.length === 0 ? (
        <EmptyState title="Sin reportes" description="Este usuario no tiene reportes." />
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Emitidos ({filed.length})
            </p>
            {filed.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Ninguno</p>
            ) : (
              <ul className="space-y-2">
                {filed.map((r) => (
                  <ReportItem key={r.id} report={r} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Recibidos ({received.length})
            </p>
            {received.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Ninguno</p>
            ) : (
              <ul className="space-y-2">
                {received.map((r) => (
                  <ReportItem key={r.id} report={r} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------- Reviews ----------------

function ReviewItem({ review }: { review: AdminReviewOut }) {
  return (
    <li className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-0.5 text-amber-500"
              aria-label={`Puntuación: ${review.rating}`}
            >
              <Star className="w-4 h-4 fill-current" aria-hidden="true" />
              <span className="text-sm font-semibold text-gray-900">{review.rating}</span>
            </span>
            {review.flag && (
              <Badge variant="warning">
                <Flag className="w-3 h-3" aria-hidden="true" />
                {review.flag}
              </Badge>
            )}
          </div>
          {review.comment && (
            <p className="text-sm text-gray-700 mt-1 line-clamp-2">{review.comment}</p>
          )}
          {review.created_at && (
            <p className="text-xs text-gray-500 mt-1">{formatRelativeTime(review.created_at)}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function ReviewsSection({ userId }: { userId: string }) {
  const query = useAdminUserReviews(userId);
  const given = query.data?.given ?? [];
  const received = query.data?.received ?? [];

  return (
    <SectionCard title="Reseñas">
      {query.isLoading ? (
        <InlineLoading />
      ) : query.isError ? (
        <ErrorState title="No se pudieron cargar las reseñas" onRetry={() => query.refetch()} />
      ) : given.length === 0 && received.length === 0 ? (
        <EmptyState title="Sin reseñas" description="Este usuario no tiene reseñas." />
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Emitidas ({given.length})
            </p>
            {given.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Ninguna</p>
            ) : (
              <ul className="space-y-2">
                {given.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Recibidas ({received.length})
            </p>
            {received.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Ninguna</p>
            ) : (
              <ul className="space-y-2">
                {received.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function UserDetailSections({ userId }: UserDetailSectionsProps) {
  return (
    <div className="space-y-4">
      <PlansSection userId={userId} />
      <ReportsSection userId={userId} />
      <ReviewsSection userId={userId} />
    </div>
  );
}
