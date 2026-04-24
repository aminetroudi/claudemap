---
name: code-sweep
description: Scan the working tree for leftover TODO/FIXME markers and produce a short punch list grouped by file. Use when the user asks for a todo audit, backlog snapshot, or "what's half-finished in this repo".
---

# code-sweep

Walk the repo (respecting `.gitignore`), grep for `TODO`, `FIXME`, `XXX`, `HACK`. Group hits by file, include one-line context.

## How to respond
1. Run `rg -n --no-heading 'TODO|FIXME|XXX|HACK'` (or grep fallback).
2. Group by file, sort by count descending.
3. Report top 10 files, collapse the rest under a count.
