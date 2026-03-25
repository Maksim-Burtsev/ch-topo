.PHONY: install dev up down lint lint-fix test check build
.DEFAULT_GOAL := dev

install:
	npm install

up:
	docker compose up -d

down:
	docker compose down

dev: up
	npm run dev

lint:
	npm run typecheck
	npm run lint
	npm run format:check

lint-fix:
	npm run lint:fix
	npm run format

test:
	npm run test

check: lint test

build:
	npm run build
