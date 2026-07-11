import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Circle, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '../lib/utils';
import { venueIcon } from '../features/venues/components/VenueMarker';

// Using CartoDB Positron for a very clean, minimalist, light background
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

// Create a custom glassmorphic marker icon
const userIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `
    <div class="relative flex items-center justify-center w-12 h-12">
      <div class="absolute w-8 h-8 bg-brand-500 rounded-full opacity-20 animate-ping"></div>
      <div class="relative z-10 w-6 h-6 bg-brand-600 border-2 border-white rounded-full shadow-lg"></div>
    </div>
  `,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

const planIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="relative z-10 w-8 h-8 bg-white/80 backdrop-blur-md border border-white rounded-full shadow-md flex items-center justify-center">
        <div class="w-3 h-3 bg-gray-900 rounded-full"></div>
      </div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function getZoomForRadius(radiusM: number): number {
  if (radiusM <= 1000) return 14;
  if (radiusM <= 2000) return 13;
  return 12;
}

// Component to dynamically update map center and zoom if location or zoom changes
function MapCenterUpdater({
  center,
  zoom,
  offsetCenter,
}: {
  center: [number, number];
  zoom: number;
  offsetCenter?: boolean;
}) {
  const map = useMap();
  const isFirstRender = useRef(true);

  useEffect(() => {
    let finalCenter = center;
    if (offsetCenter) {
      const size = map.getSize();
      if (size.y > 0) {
        // Project the coordinate to pixel coordinates at the target zoom level,
        // add size.y / 4 to move the coordinate down in the viewport (making it appear higher),
        // then unproject it back to Lat/Lng.
        const targetPoint = map.project(center, zoom).add([0, size.y / 4]);
        const unprojected = map.unproject(targetPoint, zoom);
        finalCenter = [unprojected.lat, unprojected.lng];
      }
    }
    map.setView(finalCenter, zoom, { animate: !isFirstRender.current });
    isFirstRender.current = false;
  }, [center, zoom, map, offsetCenter]);
  return null;
}

// Captura clicks del mapa y los reenvía vía callback
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Dibuja el círculo de radio de búsqueda y el pin del punto elegido
function RadiusCircle({
  center,
  radiusM,
  pickerMarker,
}: {
  center: [number, number];
  radiusM: number;
  pickerMarker?: [number, number] | null;
}) {
  return (
    <>
      <Circle
        center={center}
        radius={radiusM}
        pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.08, weight: 1.5 }}
      />
      {pickerMarker && <Marker position={pickerMarker} icon={planIcon} />}
    </>
  );
}

interface PlanLocation {
  id: string;
  /** Latitud. En F3 se reemplaza por PlanListItem.location_lat. */
  lat: number;
  /** Longitud. En F3 se reemplaza por PlanListItem.location_lng. */
  lng: number;
}

export interface VenueMarkerLocation {
  id: string;
  lat: number;
  lng: number;
  /** Datos del venue para el popup. Si se omite, el marker no tiene popup. */
  venue?: {
    name: string;
    offers: Array<{
      title: string;
      description: string;
      redemption_method: 'code' | 'qr' | 'mention';
    }>;
  };
}

export interface MapBackgroundProps {
  userLocation: [number, number] | null;
  plans: PlanLocation[];
  venues?: VenueMarkerLocation[];
  className?: string;
  onPlanClick?: (planId: string) => void;
  onVenueClick?: (venueId: string) => void;
  /** Si está definido, el mapa captura clicks para elegir un punto. */
  onMapClick?: (lat: number, lng: number) => void;
  /** Si está definido, dibuja un círculo de radio de búsqueda. */
  circle?: { center: [number, number]; radiusM: number } | null;
  /** Pin del punto de referencia elegido (se dibuja junto al círculo). */
  pickerMarker?: [number, number] | null;
}

export function MapBackground({
  userLocation,
  plans,
  venues = [],
  className,
  onPlanClick,
  onVenueClick,
  onMapClick,
  circle,
  pickerMarker,
}: MapBackgroundProps) {
  // Default to Buenos Aires if no location
  const center: [number, number] = userLocation || [-34.5900, -58.4300];
  const zoom = circle ? getZoomForRadius(circle.radiusM) : 15;

  return (
    <div className={cn("absolute inset-0 z-0", className)}>
      <MapContainer 
        center={center} 
        zoom={zoom} 
        zoomControl={false} 
        className="w-full h-full"
      >
        <TileLayer url={TILE_URL} />
        {userLocation && (
          <MapCenterUpdater
            center={userLocation}
            zoom={zoom}
            offsetCenter={!!circle}
          />
        )}
        
        {userLocation && (
          <Marker position={userLocation} icon={userIcon} />
        )}
        
        {plans.map((plan) => (
          <Marker
            key={plan.id}
            position={[plan.lat, plan.lng]}
            icon={planIcon}
            eventHandlers={{
              click: () => onPlanClick?.(plan.id)
            }}
          />
        ))}
        {venues.map((v) => (
          <Marker
            key={`venue-${v.id}`}
            position={[v.lat, v.lng]}
            icon={venueIcon}
            eventHandlers={{
              click: () => onVenueClick?.(v.id),
            }}
          >
            {v.venue && (
              <Popup>
                <div className="flex flex-col gap-1 max-w-[200px]">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900">{v.venue.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 font-bold">
                      Sponsor
                    </span>
                  </div>
                  {v.venue.offers[0] && (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {v.venue.offers[0].title}
                      </p>
                      <p className="text-xs text-gray-600">{v.venue.offers[0].description}</p>
                    </>
                  )}
                  <p className="text-[10px] text-gray-400 italic mt-1">
                    Oferta gestionada directamente con el local. GAD no se responsabiliza por su disponibilidad.
                  </p>
                </div>
              </Popup>
            )}
          </Marker>
        ))}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        {circle && (
          <RadiusCircle center={circle.center} radiusM={circle.radiusM} pickerMarker={pickerMarker} />
        )}
      </MapContainer>
    </div>
  );
}
