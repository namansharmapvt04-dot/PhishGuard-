# PhishGuard — dev workflow shortcuts
# Usage: make <target>

.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down build logs ps migration migrate seed backend-sh frontend-sh clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Build and start all services
	$(COMPOSE) up -d --build

down: ## Stop all services
	$(COMPOSE) down

build: ## Rebuild images
	$(COMPOSE) build

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

ps: ## Show running services
	$(COMPOSE) ps

migration: ## Generate the initial Alembic migration from the models (run once)
	$(COMPOSE) exec backend alembic revision --autogenerate -m "init schema"

migrate: ## Apply database migrations
	$(COMPOSE) exec backend alembic upgrade head

seed: ## Seed ChromaDB with phishing patterns
	$(COMPOSE) exec backend python scripts/seed_chromadb.py

backend-sh: ## Open a shell in the backend container
	$(COMPOSE) exec backend sh

frontend-sh: ## Open a shell in the frontend container
	$(COMPOSE) exec frontend sh

clean: ## Stop services and remove volumes (DESTROYS data)
	$(COMPOSE) down -v
