---
name: deploy-preview
description: Spin up a per-branch preview environment of acme-api. Use when the user asks for a preview URL, a sandboxed deploy, or to test a PR against a shared DB fixture.
---

# deploy-preview (acme-api — project scope)

Creates an ephemeral namespace in the `previews` cluster with this branch's image.

## How to respond
1. Confirm the branch name (`git rev-parse --abbrev-ref HEAD`).
2. `./scripts/preview.sh create <branch>` (writes preview URL to stdout).
3. Report URL + TTL (previews self-destruct after 48h).

## When NOT to use
- Production hotfix — go through the normal release train.
- Any branch that touches `migrations/` — previews share the demo DB.
