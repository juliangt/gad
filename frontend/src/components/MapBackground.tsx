import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '../lib/utils';

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

// Component to dynamically update map center if location changes
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
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

export interface MapBackgroundProps {
  userLocation: [number, number] | null;
  plans: PlanLocation[];
  className?: string;
  onPlanClick?: (planId: string) => void;
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
  className,
  onPlanClick,
  onMapClick,
  circle,
  pickerMarker,
}: MapBackgroundProps) {
  // Default to Buenos Aires if no location
  const center: [number, number] = userLocation || [-34.5900, -58.4300];

  return (
    <div className={cn("absolute inset-0 z-0", className)}>
      <MapContainer 
        center={center} 
        zoom={15} 
        zoomControl={false} 
        className="w-full h-full"
      >
        <TileLayer url={TILE_URL} />
        {userLocation && <MapCenterUpdater center={userLocation} />}
        
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
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        {circle && (
          <RadiusCircle center={circle.center} radiusM={circle.radiusM} pickerMarker={pickerMarker} />
        )}
      </MapContainer>
    </div>
  );
}
