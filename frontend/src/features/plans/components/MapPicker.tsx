// frontend/src/features/plans/components/MapPicker.tsx
import { MapBackground, type MapBackgroundProps } from '../../../components/MapBackground';

/**
 * Wrapper sobre MapBackground que expone solo las props relevantes para
 * la selección de punto en el flujo de creación de plan.
 * Reenvía onMapClick, circle y pickerMarker a MapBackground.
 */
export interface MapPickerProps {
  userLocation: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
  circle: { center: [number, number]; radiusM: number } | null;
  pickerMarker?: [number, number] | null;
  className?: string;
}

export function MapPicker({
  userLocation,
  onMapClick,
  circle,
  pickerMarker,
  className,
}: MapPickerProps) {
  const props: MapBackgroundProps = {
    userLocation,
    plans: [],
    className,
    onMapClick,
    circle,
    pickerMarker,
  };
  return <MapBackground {...props} />;
}
