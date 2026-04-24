---
name: daily-standup
description: Compose a three-line standup note from the last 24h of git activity and open tasks. Use when the user says "write my standup" or "what did I do yesterday".
---

# daily-standup

Produce three bullets: **Yesterday**, **Today**, **Blockers** — grounded in git log + open todos.

## How to respond
1. `git log --since="24 hours ago" --author="$(git config user.email)" --oneline`
2. Read current task list (if TaskList tool available).
3. Write three crisp bullets. No filler, no hedging.
