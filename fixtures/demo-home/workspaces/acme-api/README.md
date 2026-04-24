# acme-api

Internal README. See `CLAUDE.md` for Claude-specific context.

## Quick start
```bash
docker compose up -d postgres rabbitmq
make migrate-up
make run
```

API at `http://localhost:8080`. gRPC at `:9090`.
