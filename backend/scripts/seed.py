"""Puebla la BD con un dataset de prueba rico e idempotente.

Uso:
    python -m scripts.seed           # siembra si no existe
    python -m scripts.seed --reset   # trunca todo y resiembra
"""
import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from gad.auth.service import register
from gad.db import async_session_maker
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan, complete_match
from gad.models.availability import Availability
from gad.models.enums import (
    ActivityType,
    ContactType,
    GenderPreference,
    GroupSizePreference,
    NotificationType,
    PlanMode,
)
from gad.models.review import Review
from gad.models.safety import TrustedContact
from gad.models.user import User, UserPreferences
from gad.notifications.service import create_notification
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.schemas.auth import RegisterIn

ADMIN_EMAIL = "admin@gad.test"
TEST_PASSWORD = "Test1234"

# Tablas a limpiar en --reset, en orden de FK inverso (hijas antes que padres).
# Orden: reviews, messages, match_participants, matches, plan_applications, plans,
# availability, notifications, push_subscriptions, trusted_contacts, safety_events,
# safety_sessions, blocks, user_preferences, reports, users.
RESET_TABLES = [
    "reviews",
    "messages",
    "match_participants",
    "matches",
    "plan_applications",
    "plans",
    "availability",
    "notifications",
    "push_subscriptions",
    "trusted_contacts",
    "safety_events",
    "safety_sessions",
    "blocks",
    "user_preferences",
    "reports",
    "users",
]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
async def _get_user(session, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def _reset_all_tables(session) -> None:
    """DELETE FROM en orden de FK inverso. Usa SQL crudo para evitar cargar modelos."""
    from sqlalchemy import text

    print("--reset: eliminando datos existentes (orden FK inverso)...")
    # DELETE FROM en orden FK inverso: primero tablas hijas (reviews, messages...),
    # luego intermedias, y por último users (padre de casi todo vía ON DELETE CASCADE).
    # Aunque las FK tienen ON DELETE CASCADE, hacemos el DELETE explícito en orden
    # para ser predecibles y compatibles con cualquier configuración de BD.
    for table in RESET_TABLES:
        await session.execute(text(f'DELETE FROM {table}'))
        print(f"  DELETE FROM {table}")
    await session.commit()


async def _ensure_user(session, email: str, display_name: str) -> User:
    """Crea el usuario vía register() si no existe, y lo devuelve cargado."""
    existing = await _get_user(session, email)
    if existing is not None:
        print(f"  usuario ya existe: {email}")
        return existing
    await register(
        session,
        RegisterIn(email=email, password=TEST_PASSWORD, display_name=display_name),
    )
    user = await _get_user(session, email)
    assert user is not None, f"No se pudo crear/obtener usuario {email}"
    print(f"  usuario creado: {email}")
    return user


async def _set_preferences(
    session,
    user: User,
    *,
    activity_types: list[str],
    group_size: GroupSizePreference,
    gender_pref: GenderPreference,
    age_min: int,
    age_max: int,
    radius: int = 2000,
) -> None:
    prefs = user.preferences
    if prefs is None:
        prefs = UserPreferences(user_id=user.id)
        user.preferences = prefs
        session.add(prefs)
    prefs.activity_types = activity_types
    prefs.group_size_preference = group_size
    prefs.gender_preference = gender_pref
    prefs.age_range_min = age_min
    prefs.age_range_max = age_max
    prefs.default_search_radius_m = radius
    await session.commit()


# --------------------------------------------------------------------------- #
# Seed principal
# --------------------------------------------------------------------------- #
async def run_seed(reset: bool = False) -> None:
    async with async_session_maker() as session:
        # --- Idempotencia / reset ---
        if reset:
            await _reset_all_tables(session)
        else:
            existing = await _get_user(session, ADMIN_EMAIL)
            if existing is not None:
                print("Seed ya aplicado, nada que hacer")
                return

        # --- Usuarios ---
        print("Creando usuarios...")
        admin = await _ensure_user(session, "admin@gad.test", "Admin GAD")
        admin.is_admin = True
        await session.commit()

        alice = await _ensure_user(session, "alice@gad.test", "Alice")
        bob = await _ensure_user(session, "bob@gad.test", "Bob")
        carol = await _ensure_user(session, "carol@gad.test", "Carol")
        diana = await _ensure_user(session, "diana@gad.test", "Diana")

        # --- Preferencias ---
        print("Configurando preferencias...")
        await _set_preferences(
            session, alice,
            activity_types=[ActivityType.coffee.value, ActivityType.food.value],
            group_size=GroupSizePreference.one_on_one,
            gender_pref=GenderPreference.any_,
            age_min=21, age_max=35, radius=2000,
        )
        await _set_preferences(
            session, bob,
            activity_types=[ActivityType.drinks.value, ActivityType.walk.value],
            group_size=GroupSizePreference.either,
            gender_pref=GenderPreference.same,
            age_min=25, age_max=40, radius=3000,
        )
        await _set_preferences(
            session, carol,
            activity_types=[
                ActivityType.coffee.value,
                ActivityType.walk.value,
                ActivityType.food.value,
            ],
            group_size=GroupSizePreference.small_group,
            gender_pref=GenderPreference.any_,
            age_min=23, age_max=30, radius=2500,
        )
        await _set_preferences(
            session, diana,
            activity_types=[ActivityType.drinks.value, ActivityType.food.value],
            group_size=GroupSizePreference.one_on_one,
            gender_pref=GenderPreference.mixed,
            age_min=28, age_max=45, radius=2000,
        )
        # Admin: defaults (UserPreferences creado vacío con defaults del modelo)
        await _set_preferences(
            session, admin,
            activity_types=[ActivityType.coffee.value],
            group_size=GroupSizePreference.either,
            gender_pref=GenderPreference.any_,
            age_min=18, age_max=99, radius=2000,
        )
        print("  preferencias aplicadas para los 5 usuarios")

        # --- Planes ---
        print("Creando planes...")
        now = datetime.now(UTC)
        plans_created = []

        plan_specs = [
            {
                "host": alice,
                "activity_type": ActivityType.coffee,
                "mode": PlanMode.now,
                "scheduled_at": None,
                "title": "Café en Palermo",
                "description": "Charla relajada con un buen café.",
                "lat": -34.5772, "lng": -58.4307, "label": "Palermo Hollywood",
                "max_participants": 1, "search_radius_m": 2000,
            },
            {
                "host": bob,
                "activity_type": ActivityType.walk,
                "mode": PlanMode.scheduled,
                "scheduled_at": now + timedelta(hours=2),
                "title": "Paseo por Bosques de Palermo",
                "description": "Caminata por los bosques.",
                "lat": -34.5696, "lng": -58.4103, "label": "Bosques de Palermo",
                "max_participants": 1, "search_radius_m": 2000,
            },
            {
                "host": carol,
                "activity_type": ActivityType.food,
                "mode": PlanMode.now,
                "scheduled_at": None,
                "title": "Almuerzo en Belgrano",
                "description": "Almuerzo tranquilo en Belgrano R.",
                "lat": -34.5627, "lng": -58.4543, "label": "Belgrano R",
                "max_participants": 2, "search_radius_m": 2000,
            },
            {
                "host": diana,
                "activity_type": ActivityType.drinks,
                "mode": PlanMode.scheduled,
                "scheduled_at": now + timedelta(days=1),
                "title": "Cervezas en San Telmo",
                "description": "Salida de cervezas artesanales.",
                "lat": -34.6212, "lng": -58.3731, "label": "San Telmo",
                "max_participants": 1, "search_radius_m": 2000,
            },
        ]

        for spec in plan_specs:
            plan_in = PlanIn(
                activity_type=spec["activity_type"],
                mode=spec["mode"],
                scheduled_at=spec["scheduled_at"],
                window_minutes=120,
                max_participants=spec["max_participants"],
                title=spec["title"],
                description=spec["description"],
                location=PlanLocationIn(
                    lat=spec["lat"], lng=spec["lng"], label=spec["label"]
                ),
                search_radius_m=spec["search_radius_m"],
            )
            try:
                plan = await create_plan(session, spec["host"], plan_in)
                plans_created.append(plan)
                print(f"  plan creado: {plan.title} (id={plan.id})")
            except Exception as exc:  # noqa: BLE001 - best-effort en seed
                print(f"  warn: create_plan falló para '{plan_in.title}': {exc}")

        # --- Postulación + aceptación + match ---
        print("Creando postulación, aceptación y match...")
        match_created = None
        application = None
        if plans_created:
            plan_alice = plans_created[0]  # Café en Palermo (max_participants=1)
            try:
                application = await apply_to_plan(
                    session, bob, plan_alice.id,
                    ApplicationIn(message="¡Me encantaría un café!"),
                )
                print(f"  postulación creada: {application.id}")
            except Exception as exc:  # noqa: BLE001
                print(f"  warn: apply_to_plan falló: {exc}")

            if application is not None:
                try:
                    match_created = await accept_application(
                        session, alice, application.id
                    )
                    if match_created is not None:
                        print(f"  match creado: {match_created.id}")
                    else:
                        print("  accept_application no llenó el plan (match=None)")
                except Exception as exc:  # noqa: BLE001
                    print(f"  warn: accept_application falló: {exc}")

                if match_created is not None:
                    try:
                        match_created = await complete_match(
                            session, alice, match_created.id
                        )
                        print(f"  match completado: {match_created.id}")
                    except Exception as exc:  # noqa: BLE001
                        print(f"  warn: complete_match falló: {exc}")

        # --- Reseñas ---
        print("Creando reseñas...")
        reviews_created = 0
        if match_created is not None:
            review_ab = Review(
                match_id=match_created.id,
                reviewer_id=alice.id,
                reviewee_id=bob.id,
                rating=5,
                comment="Excelente compañía, puntual",
            )
            review_ba = Review(
                match_id=match_created.id,
                reviewer_id=bob.id,
                reviewee_id=alice.id,
                rating=4,
                comment="Muy buen café",
            )
            session.add_all([review_ab, review_ba])
            try:
                await session.commit()
                reviews_created = 2
                print("  reseñas creadas: Alice->Bob (5), Bob->Alice (4)")
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                print(f"  warn: no se pudieron crear reseñas: {exc}")

        # --- Notificaciones extra ---
        print("Creando notificaciones de ejemplo...")
        notifs_created = 0
        try:
            await create_notification(
                session, bob.id,
                NotificationType.new_application,
                {"plan_id": str(plans_created[0].id) if plans_created else None,
                 "applicant_id": str(bob.id)},
            )
            notifs_created += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  warn: notificación para bob falló: {exc}")
        try:
            await create_notification(
                session, alice.id,
                NotificationType.match,
                {"match_id": str(match_created.id) if match_created else None,
                 "plan_id": str(plans_created[0].id) if plans_created else None},
            )
            notifs_created += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  warn: notificación para alice falló: {exc}")
        try:
            await create_notification(
                session, carol.id,
                NotificationType.plan_alert,
                {"plan_id": str(plans_created[2].id) if len(plans_created) > 2 else None},
            )
            notifs_created += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  warn: notificación para carol falló: {exc}")
        print(f"  notificaciones creadas: {notifs_created}")

        # --- Trusted contacts ---
        print("Creando contactos de confianza...")
        trusted_created = 0
        tc_alice = TrustedContact(
            user_id=alice.id,
            contact_type=ContactType.email,
            contact_value="amiga@ejemplo.com",
            label="Amiga",
        )
        tc_bob = TrustedContact(
            user_id=bob.id,
            contact_type=ContactType.phone,
            contact_value="+5491100000000",
            label="Hermana",
        )
        session.add_all([tc_alice, tc_bob])
        try:
            await session.commit()
            trusted_created = 2
            print("  trusted contacts: Alice (email), Bob (phone)")
        except Exception as exc:  # noqa: BLE001
            await session.rollback()
            print(f"  warn: trusted contacts fallaron: {exc}")

        # --- Availability ---
        print("Creando registros de availability...")
        avail_created = 0
        expires = now + timedelta(hours=2)
        avail_specs = [
            (carol, -34.5627, -58.4543, 2500,
             [ActivityType.coffee.value, ActivityType.walk.value]),
            (diana, -34.6212, -58.3731, 2000,
             [ActivityType.drinks.value, ActivityType.food.value]),
        ]
        for user, lat, lng, radius, activities in avail_specs:
            avail = Availability(
                user_id=user.id,
                location_grid=WKTElement(f"POINT({lng} {lat})", srid=4326),
                radius_m=radius,
                activity_filter=activities,
                expires_at=expires,
                active=True,
            )
            session.add(avail)
            try:
                await session.commit()
                avail_created += 1
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                print(f"  warn: availability para {user.email} falló: {exc}")
        print(f"  availability creada: {avail_created} registros")

        # --- Resumen ---
        print()
        print("✓ Seed completado")
        print("  Usuarios: 5 (admin@gad.test, alice@, bob@, carol@, diana@)")
        print(f"  Planes: {len(plans_created)}")
        print(f"  Matches: {1 if match_created else 0}"
              + (" (completado)" if match_created else ""))
        print(f"  Reseñas: {reviews_created}")
        print(f"  Notificaciones: {notifs_created}")
        print(f"  Trusted contacts: {trusted_created}")
        print(f"  Availability: {avail_created}")
        print(f"  Credenciales: todos con password {TEST_PASSWORD}")
        print(f"  Admin: {ADMIN_EMAIL} / {TEST_PASSWORD}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Puebla la BD con un dataset de prueba idempotente"
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Trunca todas las tablas y resiembra desde cero",
    )
    args = parser.parse_args()
    asyncio.run(run_seed(reset=args.reset))


if __name__ == "__main__":
    main()
