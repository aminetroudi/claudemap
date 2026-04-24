---
name: Auth-v2 rollout
description: Auth middleware rewrite driven by legal/compliance, not tech debt
type: project
---

The auth middleware rewrite is driven by legal/compliance requirements
around session token storage, not tech-debt cleanup.

**Why:** Legal flagged the old storage format during the 2026-Q1 audit.
Server-side rotation every 24h is a hard requirement.

**How to apply:** Scope decisions should favor compliance wins over
developer ergonomics. Dual-read/dual-write phases land before 2026-06-02.
