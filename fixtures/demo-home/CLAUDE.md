# Global conventions

Preferences that apply everywhere.

- Response style: terse. Skip end-of-turn recaps.
- When writing code, prefer editing existing files over creating new ones.
- Never commit secrets. Flag `.env*` files in any diff review.
- Dates: use ISO 8601 (`YYYY-MM-DD`) in comments and memory entries.

## Tooling defaults

| Language | Formatter | Linter |
|----------|-----------|--------|
| Go       | gofumpt   | golangci-lint |
| TS / JS  | biome     | biome  |
| Python   | ruff fmt  | ruff check |
