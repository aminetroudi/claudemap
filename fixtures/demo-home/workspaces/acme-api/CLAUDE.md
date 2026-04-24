# acme-api

Go service. REST + gRPC. PostgreSQL. Runs behind Envoy.

## Commands
```bash
make test           # unit + integration (spins up postgres)
make lint           # golangci-lint
make migrate-up     # apply pending migrations (requires DATABASE_URL)
```

## Layout
- `cmd/api` — binary entry point
- `internal/handlers` — HTTP + gRPC handlers
- `internal/store` — repository layer (sqlx)
- `internal/jobs` — background workers (RabbitMQ)
- `migrations/` — goose migrations

## Do / don't
- **Don't** mock the DB in integration tests — we use a real Postgres via
  `make test`. See `feedback_testing` memory for the reason.
- **Do** run `make lint` before pushing — CI will fail on a warning.
