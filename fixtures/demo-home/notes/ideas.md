# Ideas — drafts & spikes

Stuff worth prototyping, nowhere near committed.

- **Spike: replace custom queue with NATS JetStream.**
  Current bottleneck is fan-out fairness under bursty load. JetStream's work
  queue semantics would remove three custom retry layers. Budget: 3 days.
- **Dashboard: graph view for MCP server dependencies.**
  Which tools use which servers? Hidden coupling right now.
- **Skill: `wip-cleanup`.** Surface stale WIP branches older than 30 days and
  auto-compose a "close or rebase" PR draft.
- **Refactor:** pull `services/billing/` out of `backend/`, ship as an
  internal package before it eats the caller graph.
