# Convenience wrapper around the dev container.
# Every target except `image` and `shell` runs INSIDE the container so
# the host stays free of Node / pnpm dependencies.

COMPOSE := docker compose
SERVICE := dev

.PHONY: help image shell install build test lint check clean

help:
	@printf '%s\n' \
	  'ECL TypeScript reference SDK — dev container targets' \
	  '' \
	  '  make image     Build the dev image' \
	  '  make shell     Drop into an interactive shell in the container' \
	  '  make install   pnpm install inside the container' \
	  '  make build     pnpm run build (tsc + vendor bundle)' \
	  '  make test      pnpm test (vitest)' \
	  '  make lint      pnpm run lint' \
	  '  make check     install + build + test + lint (CI parity)' \
	  '  make clean     Remove the container, image, and pnpm-store volume' \
	  ''

image:
	$(COMPOSE) build $(SERVICE)

shell:
	$(COMPOSE) run --rm $(SERVICE)

install:
	$(COMPOSE) run --rm $(SERVICE) pnpm install --frozen-lockfile

build:
	$(COMPOSE) run --rm $(SERVICE) pnpm run build

test:
	$(COMPOSE) run --rm $(SERVICE) pnpm test --run

lint:
	$(COMPOSE) run --rm $(SERVICE) pnpm run lint

check: install build test lint

clean:
	$(COMPOSE) down --volumes --remove-orphans
	docker rmi eidolons-ecl-ts-sdk-dev:latest 2>/dev/null || true
