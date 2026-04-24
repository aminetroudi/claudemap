# acme-web

Next.js 16 + Tailwind 4. TypeScript strict. Deployed to Vercel.

## Commands
```bash
bun install
bun run dev        # http://localhost:3000
bun run build
bun run lint
```

## Conventions
- Server components by default. Mark `"use client"` only when necessary.
- Co-locate component styles; never edit `globals.css` for one-off tweaks.
- Prefer `<Link prefetch={false}>` outside the main nav — prefetch storms were
  hammering the marketing pages during the 2026-03 launch.
