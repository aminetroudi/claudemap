---
name: csv-wizard
description: Inspect, pivot, and aggregate CSV files without leaving the terminal. Use when the user asks to summarize a CSV, count distinct values in a column, or pivot by a key.
---

# csv-wizard

Lightweight CSV analysis using standard Unix tools + `awk` / `csvkit` when available.

## Recipes
- **Row count:** `wc -l < file.csv` (subtract 1 for header)
- **Distinct in column N:** `awk -F, 'NR>1 {print $N}' file.csv | sort -u`
- **Top-K values:** `awk -F, 'NR>1 {c[$N]++} END{for(k in c) print c[k],k}' | sort -rn | head -K`

Prefer `csvkit` (`csvcut`, `csvstat`, `csvsql`) when columns contain embedded commas.
