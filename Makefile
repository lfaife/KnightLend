# KnightLend. Run `make help` for targets.
VENV ?= .venv
PY := $(abspath $(VENV))/bin/python
PYTHON ?= python3
SERVER_PORT ?= 8000

.PHONY: help install dev dev-server dev-client seed test lint mongo mongo-down build

help:
	@echo "make install   create the Python venv, install server and client deps, create server/.env"
	@echo "make mongo     start MongoDB in Docker (optional; without it the server uses in-memory mongomock)"
	@echo "make seed      wipe and recreate demo data"
	@echo "make dev       run the FastAPI server (:$(SERVER_PORT)) and the Vite client (:5173) together"
	@echo "make test      run the pytest suite"
	@echo "make lint      ruff + TypeScript checks"

install:
	$(PYTHON) -m venv $(VENV)
	$(PY) -m pip install --upgrade pip -q
	$(PY) -m pip install -r server/requirements.txt -q
	@if [ ! -f server/.env ]; then \
		cp server/.env.example server/.env; \
		secret=$$($(PY) -c "import secrets;print(secrets.token_urlsafe(48))"); \
		sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$secret|" server/.env && rm -f server/.env.bak; \
		echo "Created server/.env with a random JWT_SECRET"; \
	fi
	cd client && npm install --no-audit --no-fund

dev:
	@$(MAKE) -j2 --no-print-directory dev-server dev-client

dev-server:
	cd server && $(PY) -m uvicorn app.main:app --reload --port $(SERVER_PORT)

dev-client:
	cd client && API_URL=http://localhost:$(SERVER_PORT) npm run dev

seed:
	cd server && $(PY) -m app.seed

test:
	cd server && $(PY) -m pytest -q

lint:
	cd server && $(PY) -m ruff check .
	cd client && npm run typecheck

build:
	cd client && npm run build

mongo:
	docker compose up -d mongo

mongo-down:
	docker compose down
