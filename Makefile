# Makefile for PhotoCat development and deployment

.PHONY: help install test lint format clean deploy migrate

help:
	@echo "PhotoCat - Make targets"
	@echo ""
	@echo "  install     Install dependencies"
	@echo "  test        Run tests"
	@echo "  lint        Run linters"
	@echo "  format      Format code"
	@echo "  clean       Clean build artifacts"
	@echo "  migrate     Run database migrations"
	@echo "  deploy      Deploy to GCP"
	@echo "  dev         Run development server"

install:
	pip install --upgrade pip
	pip install -e ".[dev]"

test:
	pytest -v --cov=photocat --cov-report=term-missing

lint:
	ruff check src tests
	mypy src

format:
	black src tests
	ruff check --fix src tests

clean:
	rm -rf build dist *.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete

migrate:
	alembic upgrade head

migrate-create:
	@read -p "Migration name: " name; \
	alembic revision --autogenerate -m "$$name"

deploy:
	gcloud builds submit --config=cloudbuild.yaml

dev:
	TOKENIZERS_PARALLELISM=false python3 -m uvicorn photocat.api:app --reload --host 0.0.0.0 --port 8080

ingest:
	@echo "Usage: make ingest DIR=/path/to/images TENANT=demo"
	@echo "Example: make ingest DIR=~/Pictures/test TENANT=demo"

worker:
	WORKER_MODE=true python -m photocat.worker

docker-build:
	docker build -t photocat:local .

docker-run:
	docker run -p 8080:8080 --env-file .env photocat:local
