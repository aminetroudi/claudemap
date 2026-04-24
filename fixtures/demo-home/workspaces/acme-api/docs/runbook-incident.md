# Runbook — request latency spike

## Symptom
p95 latency > 800ms on `/v1/orders`. Pages fire via the Grafana board
`grafana.internal/d/api-latency`.

## First checks
1. RabbitMQ depth (`rabbitmqctl list_queues name messages | sort -k2 -rn | head`)
2. Postgres active connections vs max
3. Upstream gRPC error rate on `inventory-service`

## Known causes
- Migration lock — long DDL holding row locks. `pg_cancel_backend(pid)`.
- RabbitMQ consumer panic — check `journalctl -u rabbitmq` for crash loops.
