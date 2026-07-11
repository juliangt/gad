// frontend/src/features/venues/components/VenueMarker.tsx
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { VenueListItem } from '../types';
import type { OfferRedemption } from '../../../types/enums';

/** Ícono distintivo para venues sponsoreados (ámbar/dorado). */
export const venueIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="relative z-10 w-8 h-8 bg-amber-400 border-2 border-white rounded-full shadow-md flex items-center justify-center">
        <span class="text-[10px] font-bold text-amber-900">$</span>
      </div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const REDEMPTION_LABELS: Record<OfferRedemption, string> = {
  mention: 'Mencioná la app',
  code: 'Mostrá este código',
  qr: 'Escaneá el QR',
};

export function VenueMarker({ venue }: { venue: VenueListItem }) {
  const offer = venue.offers[0];
  return (
    <Marker position={[venue.lat, venue.lng]} icon={venueIcon}>
      <Popup>
        <div className="flex flex-col gap-1 max-w-[200px]">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-900">{venue.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-amber-600 font-bold">
              Sponsor
            </span>
          </div>
          {offer && (
            <>
              <p className="text-sm font-medium text-gray-800">{offer.title}</p>
              <p className="text-xs text-gray-600">{offer.description}</p>
              <p className="text-xs text-gray-500">
                Canje: <span className="font-medium">{REDEMPTION_LABELS[offer.redemption_method]}</span>
              </p>
            </>
          )}
          <p className="text-[10px] text-gray-400 italic mt-1">
            Oferta gestionada directamente con el local. GAD no se responsabiliza por su disponibilidad.
          </p>
        </div>
      </Popup>
    </Marker>
  );
}
