---
name: Grafana — API latency board
description: grafana.internal/d/api-latency is the oncall dashboard for request-path regressions
type: reference
---

`grafana.internal/d/api-latency` is the latency board oncall watches.
If you're editing request-path code in `acme-api`, glance at this before and
after merge — p95 regressions there page someone within minutes.
