import { AdminNav } from '../components/AdminNav';
import { AdminReviewRow } from '../components/AdminReviewRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminReviews, useAdminDeleteReview, useAdminCancelPlan } from '../hooks';

export default function ReviewsAdminPage() {
  const query = useAdminReviews();
  const remove = useAdminDeleteReview();
  const cancelPlan = useAdminCancelPlan();
  const reviews = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Reseñas flagged</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {query.isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {query.isError && <ErrorState title="No se pudieron cargar las reseñas" onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.isError && reviews.length === 0 && (
          <EmptyState title="Sin reseñas para moderar" description="No hay reseñas marcadas con flag." />
        )}

        <ul className="space-y-2">
          {reviews.map((r) => (
            <AdminReviewRow
              key={r.id}
              review={r}
              onDelete={(id) => remove.mutate(id)}
              busy={remove.isPending}
            />
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}

        {/* Acción auxiliar: cancelar un plan por ID (moderación). Se expone como utilidad. */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">Cancelar un plan por ID</summary>
          <CancelPlanForm onConfirm={(id) => cancelPlan.mutate(id)} busy={cancelPlan.isPending} />
        </details>
      </main>
    </div>
  );
}

function CancelPlanForm({ onConfirm, busy }: { onConfirm: (id: string) => void; busy: boolean }) {
  return (
    <form
      className="flex gap-2 mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const id = String(fd.get('planId') ?? '').trim();
        if (id) onConfirm(id);
      }}
    >
      <label className="sr-only" htmlFor="planId">ID del plan</label>
      <input
        id="planId"
        name="planId"
        required
        placeholder="UUID del plan"
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <Button type="submit" variant="danger" size="sm" loading={busy}>
        Cancelar plan
      </Button>
    </form>
  );
}
