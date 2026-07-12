import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import { formatRelativeTime } from '../../../lib/format';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { AdminNav } from '../components/AdminNav';
import {
  useAdminPlanDetail,
  useAdminPlanApplications,
  useAdminPlanMatches,
  useAdminHidePlan,
  useAdminUnhidePlan,
  useAdminClosePlan,
  useAdminCancelMatch,
} from '../hooks';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'success',
  matched: 'brand',
  closed: 'neutral',
  cancelled: 'danger',
  expired: 'warning',
};

const ACTIVITY_LABELS: Record<string, string> = {
  coffee: 'Café',
  drinks: 'Trago',
  food: 'Comida',
  walk: 'Caminata',
  park: 'Parque',
  event: 'Evento',
  other: 'Otro',
};

// Ícono simple para el marcador del plan (sin la imagen default rota de Leaflet).
const planDetailIcon = L.divIcon({
  className: 'bg-transparent',
  html: '<div style="width:18px;height:18px;background:#4f46e5;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function PlanDetailAdminPage() {
  const { id } = useParams<{ id: string }>();
  const planId = id ?? '';
  const { data: plan, isLoading, isError, refetch } = useAdminPlanDetail(planId);

  const hide = useAdminHidePlan();
  const unhide = useAdminUnhidePlan();
  const close = useAdminClosePlan();
  const cancelMatch = useAdminCancelMatch();
  const busy =
    hide.isPending || unhide.isPending || close.isPending || cancelMatch.isPending;

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link
            to="/admin/plans"
            className="inline-flex items-center gap-1 text-sm text-gray-600 mb-2"
          >
            <ArrowLeft size={16} /> Planes
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Detalle de plan</h1>
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : plan ? (
          <>
            {/* Cabecera del plan */}
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="font-bold text-gray-900">{plan.title}</h2>
                <Badge variant="neutral">
                  {ACTIVITY_LABELS[plan.activity_type] ?? plan.activity_type}
                </Badge>
                <Badge variant={STATUS_VARIANT[plan.status] ?? 'neutral'}>{plan.status}</Badge>
                <Badge variant={plan.mode === 'now' ? 'success' : 'brand'}>{plan.mode}</Badge>
                {plan.hidden_by_host && <Badge variant="warning">Oculto por host</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Host</dt>
                  <dd>
                    <Link
                      to={`/admin/users/${plan.host_id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {plan.host_name}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Email host</dt>
                  <dd className="truncate">{plan.host_email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Participantes</dt>
                  <dd>
                    {plan.current_participants}/{plan.max_participants}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Vigencia</dt>
                  <dd>{plan.window_minutes} min</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Radio</dt>
                  <dd>{plan.search_radius_m} m</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Creado</dt>
                  <dd>{formatRelativeTime(plan.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Expira</dt>
                  <dd>{formatRelativeTime(plan.expires_at)}</dd>
                </div>
                {plan.scheduled_at && (
                  <div>
                    <dt className="text-gray-500">Agendado</dt>
                    <dd>{formatRelativeTime(plan.scheduled_at)}</dd>
                  </div>
                )}
              </dl>
              {plan.description && (
                <p className="text-sm text-gray-700 mt-3">{plan.description}</p>
              )}

              {/* Acciones */}
              <div className="flex gap-2 mt-4 flex-wrap">
                {plan.hidden_by_host ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => unhide.mutate(planId)}
                    disabled={busy}
                  >
                    Mostrar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => hide.mutate(planId)}
                    disabled={busy}
                  >
                    Ocultar
                  </Button>
                )}
                {(plan.status === 'open' || plan.status === 'matched') && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => close.mutate(planId)}
                    disabled={busy}
                  >
                    Cerrar plan
                  </Button>
                )}
              </div>
            </div>

            {/* Mapa de la ubicación (centro del grid) */}
            <div className="glass-panel rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Ubicación (centro de grilla)
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {plan.location_label} · ~{plan.search_radius_m} m de radio
              </p>
              <div style={{ height: '240px' }} className="rounded-lg overflow-hidden">
                <MapContainer
                  center={[plan.location_lat, plan.location_lng]}
                  zoom={14}
                  zoomControl={false}
                  className="w-full h-full"
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer url={TILE_URL} />
                  <Marker
                    position={[plan.location_lat, plan.location_lng]}
                    icon={planDetailIcon}
                  />
                  <Circle
                    center={[plan.location_lat, plan.location_lng]}
                    radius={plan.search_radius_m}
                    pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.1 }}
                  />
                </MapContainer>
              </div>
            </div>

            {/* Aplicaciones */}
            <ApplicationsSection planId={planId} />

            {/* Matches */}
            <MatchesSection
              planId={planId}
              onCancelMatch={(mId) => cancelMatch.mutate(mId)}
              busy={busy}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}

// ---------------- Applications ----------------

interface Applicant {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}
interface ApplicationItem {
  id: string;
  plan_id: string;
  applicant: Applicant;
  status: string;
  message: string | null;
  created_at: string;
  decided_at: string | null;
}

function ApplicationsSection({ planId }: { planId: string }) {
  const query = useAdminPlanApplications(planId);
  const apps = (query.data ?? []) as ApplicationItem[];

  return (
    <section className="glass-panel rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        Aplicaciones
        <span className="text-xs font-normal text-gray-500">({apps.length})</span>
      </h3>
      {query.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner size="md" />
        </div>
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar las aplicaciones"
          onRetry={() => query.refetch()}
        />
      ) : apps.length === 0 ? (
        <EmptyState title="Sin aplicaciones" description="Nadie aplicó a este plan." />
      ) : (
        <ul className="space-y-2">
          {apps.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {a.applicant.display_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {a.applicant.verification_level} · Rep.{' '}
                    {a.applicant.reputation_score.toFixed(1)} ·{' '}
                    {formatRelativeTime(a.created_at)}
                  </p>
                  {a.message && (
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">{a.message}</p>
                  )}
                </div>
                <Badge variant={STATUS_VARIANT[a.status] ?? 'neutral'}>{a.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------- Matches ----------------

interface Participant {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}
interface MatchItem {
  id: string;
  plan_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  location_sharing_active: boolean;
  participants: Participant[];
}

function MatchesSection({
  planId,
  onCancelMatch,
  busy,
}: {
  planId: string;
  onCancelMatch: (matchId: string) => void;
  busy: boolean;
}) {
  const query = useAdminPlanMatches(planId);
  const matches = (query.data ?? []) as MatchItem[];

  return (
    <section className="glass-panel rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        Matches
        <span className="text-xs font-normal text-gray-500">({matches.length})</span>
      </h3>
      {query.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner size="md" />
        </div>
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar los matches"
          onRetry={() => query.refetch()}
        />
      ) : matches.length === 0 ? (
        <EmptyState title="Sin matches" description="Este plan no tuvo matches." />
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[m.status] ?? 'neutral'}>{m.status}</Badge>
                    {m.location_sharing_active && (
                      <Badge variant="brand">Ubicación activa</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Inicio: {formatRelativeTime(m.started_at)} ·{' '}
                    {m.participants.length} participantes
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">
                    {m.participants.map((p) => p.display_name).join(', ')}
                  </p>
                </div>
                {m.status === 'active' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onCancelMatch(m.id)}
                    disabled={busy}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
