# Spec: Preferencias del usuario como valores por defecto al crear un plan

## Descripción
Habilitar una nueva preferencia de vigencia de plan por defecto para los usuarios en su perfil, y utilizar tanto esta como la preferencia del radio de búsqueda por defecto como los valores iniciales en el formulario de creación de planes.

---

## Cambios Realizados

### 1. Backend

*   **Modelo de Base de Datos (`backend/src/gad/models/user.py`):**
    *   Añadida la columna `default_plan_validity_mins` (Integer, no nula, default `120`) a la tabla `user_preferences`.
*   **Schemas Pydantic (`backend/src/gad/schemas/user.py`):**
    *   Añadido el campo `default_plan_validity_mins` a `PreferencesIn` y `PreferencesOut` con validación `ge=0, le=1440`.
*   **Migración de Base de Datos (`backend/alembic/versions/`):**
    *   Creada una migración para añadir la columna a la tabla.
*   **Seed y Tests (`backend/scripts/seed.py`, `backend/tests/`):**
    *   Actualizado el seed de base de datos.
    *   Añadidos tests en `test_user_schemas.py`, `test_users_service.py` y `test_users_router.py` para asegurar el correcto almacenamiento y validación de la vigencia.

### 2. Frontend

*   **Tipos y Schemas Zod (`frontend/src/features/users/types.ts`, `frontend/src/features/users/schemas.ts`):**
    *   Soportado `default_plan_validity_mins` en la interfaz `UserPreferences` y `PreferencesIn`.
    *   Añadida validación Zod `.int().min(0).max(1440)`.
*   **Formulario de Preferencias (`frontend/src/features/users/components/PreferencesForm.tsx`):**
    *   Agregado el campo select "Vigencia del plan por defecto" con opciones para 1 hora (60m), 2 horas (120m), 3 horas (180m) y Resto del día (0).
*   **Creación de Planes (`frontend/src/features/plans/pages/CreatePlanPage.tsx`):**
    *   Consumo del hook `useMe()` para obtener el usuario autenticado.
    *   Uso de `useEffect` reactivo para inicializar `selectedValidity` y el valor del formulario de `search_radius_m` tan pronto como carguen las preferencias de usuario desde `useMe()`.

---

## Criterios de Aceptación
1. El usuario puede actualizar su vigencia por defecto desde la pantalla de edición de preferencias.
2. Al ingresar a la pantalla de crear un plan, los valores por defecto iniciales se leen directamente desde el perfil del usuario.
3. Se mantiene el fallback al comportamiento anterior si el perfil no ha cargado.
