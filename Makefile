PYTHON_BIN ?= python3.12
VENV := backend/.venv/bin

.PHONY: setup backend-setup frontend-setup dev-backend dev-frontend check backend-check frontend-check e2e

setup: backend-setup frontend-setup

backend-setup:
	$(PYTHON_BIN) -m venv backend/.venv
	$(VENV)/python -m pip install --upgrade pip
	$(VENV)/python -m pip install -r backend/requirements-dev.txt
	test -f backend/.env || cp backend/.env.example backend/.env

frontend-setup:
	cd frontend && npm ci

dev-backend:
	cd backend && .venv/bin/python manage.py runserver 127.0.0.1:8000

dev-frontend:
	cd frontend && npm run dev

backend-check:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . \
		&& .venv/bin/mypy . && .venv/bin/python -m pytest

frontend-check:
	cd frontend && npm run lint && npm run format:check && npm run typecheck \
		&& npm test && npm run build

check: backend-check frontend-check

e2e:
	cd frontend && npm run test:e2e
