---
name: Testing feedback
description: Integration tests must use a real database, never mocks
type: feedback
---

Integration tests must hit a real database, not mocks.

**Why:** Prior incident (Q1 2026) — mocked tests passed while the production
migration silently broke. Mock/prod divergence masked the bug until rollout.

**How to apply:** Anytime a test touches a DB call, use an ephemeral real
Postgres (docker-compose test profile). Push back if someone suggests mocking.
