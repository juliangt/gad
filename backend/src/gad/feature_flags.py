# backend/src/gad/feature_flags.py
"""Catálogo de feature flags y reglas de fail-open/fail-closed."""

# Flags que, si no existen en DB, se asumen deshabilitados (fail-closed).
FAIL_CLOSED_FLAGS = {"maintenance_block"}

# Flags que se seedean al arranque (todos en True salvo maintenance_block).
DEFAULT_FLAGS: dict[str, str] = {
    "venues_sponsors": "Módulo de venues sponsoreados y ofertas",
    "reviews": "Sistema de reseñas post-match",
    "availability": "Modo disponible (alerts)",
    "google_oauth": "Login con Google",
    "safety_sos": "Botón de SOS y compartir ubicación",
    "maintenance_block": "Complemento del modo mantenimiento (fail-closed)",
}
