# Makefile de GAD — wrappers sobre docker compose para el stack full-stack.
#
# Requisitos: docker y docker compose (plugin) instalados, y un archivo .env
# con POSTGRES_PASSWORD y JWT_SECRET (ver .env.example).
#
# Todos los targets usan COMPOSE_FILES para soportar a la vez el modo
# prod-like (default) y el modo dev (HMR). Cambiar con:
#   make up          -> prod-like (nginx)
#   make up-dev      -> dev (Vite HMR + uvicorn --reload)
#
# Para forzar un perfil distinto en un comando puntual, exportar COMPOSE_ARGS,
# pero lo recomendado es usar los targets `-dev`.

# Compose: base siempre, override solo cuando DEV=1.
BASE      := docker-compose.yml
DEV_FILE  := docker-compose.dev.yml

ifeq ($(DEV),1)
	COMPOSE := docker compose -f $(BASE) -f $(DEV_FILE)
else
	COMPOSE := docker compose -f $(BASE)
endif

# Servicios sobre los que opera la mayoría de los targets.
API  := api
WEB  := web
DB   := db
SEED := seed

.DEFAULT_GOAL := help

## ---------- Ayuda ----------

.PHONY: help
help: ## Muestra esta lista de targets.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ---------- Levantar / frenar ----------

.PHONY: up
up: ## Levanta el stack prod-like en foreground (con build).
	$(COMPOSE) up --build

.PHONY: up-d
up-d: ## Levanta el stack prod-like en background (detached).
	$(COMPOSE) up --build -d

.PHONY: up-dev
up-dev: ## Levanta el stack de desarrollo (HMR + reload) en foreground.
	DEV=1 $(MAKE) up

.PHONY: up-dev-d
up-dev-d: ## Levanta el stack de desarrollo en background (detached).
	DEV=1 $(MAKE) up-d

.PHONY: down
down: ## Frena y elimina los contenedores (mantiene volúmenes).
	$(COMPOSE) down

.PHONY: stop
stop: ## Frena los contenedores sin eliminarlos.
	$(COMPOSE) stop

.PHONY: start
start: ## Arranca contenedores previamente frenados con `stop`.
	$(COMPOSE) start

.PHONY: restart
restart: ## Reinicia todos los servicios.
	$(COMPOSE) restart

.PHONY: restart-api
restart-api: ## Reinicia solo la API.
	$(COMPOSE) restart $(API)

.PHONY: restart-web
restart-web: ## Reinicia solo el frontend.
	$(COMPOSE) restart $(WEB)

## ---------- Build e imágenes ----------

.PHONY: build
build: ## (Re)construye las imágenes sin levantar el stack.
	$(COMPOSE) build

.PHONY: pull
pull: ## Descarga imágenes base actualizadas (db, redis).
	$(COMPOSE) pull $(DB) redis

## ---------- Observabilidad ----------

.PHONY: ps
ps: ## Lista los servicios y su estado.
	$(COMPOSE) ps

.PHONY: logs
logs: ## Logs de todos los servicios (follow).
	$(COMPOSE) logs -f

.PHONY: logs-api
logs-api: ## Logs de la API (follow).
	$(COMPOSE) logs -f $(API)

.PHONY: logs-web
logs-web: ## Logs del frontend (follow).
	$(COMPOSE) logs -f $(WEB)

.PHONY: logs-db
logs-db: ## Logs de la base de datos (follow).
	$(COMPOSE) logs -f $(DB)

.PHONY: health
health: ## Comprueba el health endpoint de la API.
	@echo "GET /health ->"
	@curl -fsS http://localhost:8000/health || (echo "API no responde. ¿Está levantada? (make up)" && exit 1)

## ---------- Base de datos y seed ----------

.PHONY: migrate
migrate: ## Corre las migraciones de Alembic (upgrade head).
	$(COMPOSE) run --rm $(API) alembic upgrade head

.PHONY: migrate-new
migrate-new: ## Crea una migración vacía. Uso: make migrate-new NAME=crear_tabla
	@test -n "$(NAME)" || (echo "Uso: make migrate-new NAME=<nombre>" && exit 1)
	$(COMPOSE) run --rm $(API) alembic revision -m "$(NAME)"

.PHONY: seed
seed: ## Aplica el seed (idempotente: no duplica si ya existe).
	$(COMPOSE) run --rm $(SEED) python -m scripts.seed

.PHONY: seed-reset
seed-reset: ## Trunca los datos y vuelve a sembrar (--reset).
	$(COMPOSE) run --rm $(SEED) python -m scripts.seed --reset

.PHONY: db-shell
db-shell: ## Abre un psql interactivo contra la base de datos.
	$(COMPOSE) exec $(DB) psql -U $${POSTGRES_USER:-gad} -d $${POSTGRES_DB:-gad}

.PHONY: db-reset
db-reset: ## DESTRUCTIVO: borra el volumen de DB y vuelve a crearla (migraciones + seed).
	@echo "Esto borra TODOS los datos (volumen gad_pgdata). Ctrl-C para cancelar."
	@sleep 3
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d $(DB) redis
	@echo "Esperando a que la DB esté sana..."
	@$(COMPOSE) up --build -d $(API)
	@echo "Esperando a que la API aplique migraciones..."
	@sleep 10
	$(COMPOSE) run --rm $(SEED) python -m scripts.seed
	@echo "DB regenerada y sembrada. Levantá el resto con: make up-d"

## ---------- Shell / acceso ----------

.PHONY: shell-api
shell-api: ## Abre una shell dentro del contenedor de la API.
	$(COMPOSE) exec $(API) sh

.PHONY: shell-web
shell-web: ## Abre una shell dentro del contenedor del frontend.
	$(COMPOSE) exec $(WEB) sh

## ---------- Tests ----------

.PHONY: test
test: ## Corre la suite de tests del backend (con testcontainers, en Docker).
	@cd backend && ./run-tests-docker.sh

.PHONY: test-file
test-file: ## Corre un subset de tests. Uso: make test-file FILE=tests/test_auth.py
	@test -n "$(FILE)" || (echo "Uso: make test-file FILE=<ruta>" && exit 1)
	@cd backend && ./run-tests-docker.sh $(FILE)

.PHONY: test-fe
test-fe: ## Corre los tests unitarios del frontend (Vitest).
	@cd frontend && npm test -- --run

.PHONY: test-e2e
test-e2e: ## Corre los tests E2E (Playwright). Requiere el stack prod-like levantado.
	@cd frontend && npm run test:e2e

.PHONY: test-e2e-ui
test-e2e-ui: ## Inspector interactivo de Playwright.
	@cd frontend && npm run test:e2e:ui

.PHONY: lint
lint: ## Lintea frontend y backend.
	@cd frontend && npm run lint || echo "(frontend sin script lint)"
	@cd backend && (test -f .lint.sh && ./.lint.sh || echo "(backend sin script lint)")

## ---------- Limpieza ----------

.PHONY: clean
clean: ## Frena y elimina contenedores, redes E imágenes (sin tocar volúmenes).
	$(COMPOSE) down --rmi local

.PHONY: nuke
nuke: ## DESTRUCTIVO: borra TODO (contenedores, imágenes y volúmenes, incluida la DB).
	@echo "Esto borra contenedores, imágenes Y volúmenes (datos incluidos). Ctrl-C para cancelar."
	@sleep 3
	$(COMPOSE) down -v --rmi local
