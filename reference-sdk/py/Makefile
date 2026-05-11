# Convenience wrapper around the dev container.
# Every target except `image` and `shell` runs INSIDE the container so
# the host stays free of Python / uv / pytest dependencies.

COMPOSE := docker compose
SERVICE := py-sdk

.PHONY: help image shell install build test lint typecheck check clean

help:
	@printf '%s\n' \
	  'ECL Python reference SDK — dev container targets' \
	  '' \
	  '  make image      Build the dev image' \
	  '  make shell      Drop into an interactive shell in the container' \
	  '  make install    uv sync (install all deps from lockfile)' \
	  '  make build      uv build (wheel + sdist) + zipapp vendor bundle' \
	  '  make test       uv run pytest' \
	  '  make lint       uv run ruff check + ruff format --check' \
	  '  make typecheck  uv run mypy src' \
	  '  make check      install + build + test + lint + typecheck (CI parity)' \
	  '  make clean      Remove the container, image, and uv-cache volume' \
	  ''

image:
	$(COMPOSE) build $(SERVICE)

shell:
	$(COMPOSE) run --rm $(SERVICE)

install:
	$(COMPOSE) run --rm $(SERVICE) uv sync

build:
	$(COMPOSE) run --rm $(SERVICE) bash -c 'uv build && mkdir -p dist && python -m zipapp src -o dist/eidolons-ecl-sdk.bundle.pyz -m "eidolons_ecl.__main__:main" -p "/usr/bin/env python3"'

test:
	$(COMPOSE) run --rm $(SERVICE) uv run pytest

lint:
	$(COMPOSE) run --rm $(SERVICE) bash -c 'uv run ruff check . && uv run ruff format --check .'

typecheck:
	$(COMPOSE) run --rm $(SERVICE) uv run mypy src

check: install build test lint typecheck

clean:
	$(COMPOSE) down --volumes --remove-orphans
	docker rmi eidolons-ecl-py-sdk-dev:latest 2>/dev/null || true
