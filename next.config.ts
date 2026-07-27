import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the npm package: `next build` emits
  // .next/standalone/server.js plus a minimal traced node_modules, so the
  // published tarball needs no `npm install` of next/react at the user's end.
  // scripts/build-dist.mjs stages it into dist/.
  output: "standalone",

  // NOTE: sharp is dropped from the payload, but NOT here. outputFileTracingExcludes
  // is keyed by route glob and only reaches per-route traces; sharp arrives via the
  // base next-server trace, which no route key (`/*` included) matches. It is pruned
  // in scripts/build-dist.mjs instead — see the rationale there.
};

export default nextConfig;
