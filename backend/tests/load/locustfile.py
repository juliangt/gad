"""Escenario de load test para validar mitigaciones de abuso/DoS (issue #37).

Ejercicio los vectores:
- GET /plans (geo search) bajo carga.
- POST /auth/login (rate limited).
- GET /s/{token} (público, rate limited).

Uso:
    cd backend && uv run locust -f tests/load/locustfile.py --host http://localhost:8000
Abrí http://localhost:8089 y configurá users/spawn rate.

Criterio de éxito: la app mantiene disponibilidad (sin 5xx por agotamiento)
y responde 429 (no 500) bajo los picos.
"""
import os

from locust import HttpUser, between, task

TOKEN = os.environ.get("GAD_TEST_TOKEN", "fake-token")


class GADUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(5)
    def list_plans(self):
        # Geo search cara: ST_DWithin + ST_Distance.
        self.client.get(
            "/plans?lat=-34.59&lng=-58.43&radius=5000",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    @task(3)
    def login_attempt(self):
        # Rate limited a 5/min.
        self.client.post(
            "/auth/login",
            json={"email": "loadtest@example.com", "password": "wrong-password"},
        )

    @task(1)
    def public_location(self):
        # Endpoint público rate limited.
        self.client.get(f"/s/{TOKEN}")
