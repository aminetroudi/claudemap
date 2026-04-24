# Refactor plan — auth middleware swap

Out-of-band doc for the `auth-v2` rollout.

## Context
Legacy session-token storage doesn't meet the new compliance bar. Legal wants
server-side rotation every 24h with audit log.

## Phases
1. Dual-read: new middleware accepts v1 and v2 tokens.
2. Dual-write: issue v2 on login; keep v1 for 14 days.
3. Cut over: reject v1. 2026-06-02.
4. Remove v1 code path. 2026-07-01.

## Risks
- Long-lived mobile sessions may span the cutover. Ship the forced-refresh
  deeplink in the iOS 4.12 / Android 4.9 release before step 3.
