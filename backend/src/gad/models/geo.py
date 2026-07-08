# backend/src/gad/models/geo.py
"""Helpers geográficos: grid snap (~150m) y distancia haversine.

El grid snap redondea lat/lng a una grilla de ~150m para preservar privacidad:
la ubicación del usuario nunca se expone exacta hasta que hay match confirmado
(privacy-by-design, ver spec sección 5.1).
"""
import math

GRID_SIZE_M = 150.0
GRID_SIZE_DEG = GRID_SIZE_M / 111_320.0


def snap_to_grid(lat: float, lng: float) -> tuple[float, float]:
    """Redondea (lat, lng) al centro de una celda de ~150m."""
    grid_lat = round(lat / GRID_SIZE_DEG) * GRID_SIZE_DEG
    grid_lng = round(lng / GRID_SIZE_DEG) * GRID_SIZE_DEG
    return grid_lat, grid_lng


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia en metros entre dos puntos (haversine)."""
    R = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))
