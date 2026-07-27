#!/usr/bin/env node
// Stage the publishable server bundle into dist/.
//
// `next build` with output:'standalone' emits .next/standalone/, but that tree is
// NOT publishable as-is. Two corrections are applied here:
//
// 1. It is over-inclusive. Next copies the project's own files alongside the
//    traced server — src/, fixtures/, plans/, .claude/, tsconfig, bun.lock, the
//    docker files. None of it is needed to run server.js, and shipping it leaks
//    repo internals into every install. So this stages an ALLOWLIST, not the
//    whole directory.
//
// 2. It is missing the two asset trees the server reads from disk by path rather
//    than by require, so tracing never sees them:
//        .next/static -> dist/.next/static   (JS/CSS chunks the browser requests)
//        public       -> dist/public         (icons, manifest)
//    Omitting either yields a server that boots and then serves an unstyled page
//    with 404ing chunks. Documented at
//    node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
//
// public/screenshots/ is skipped: ~1.1MB of README imagery that no route or
// manifest entry references, so it would be dead weight in every install.

import { cp, rm, mkdir, access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const STANDALONE = path.join(ROOT, ".next", "standalone");

/** The only entries of .next/standalone/ that belong in the package. */
const KEEP = ["server.js", "node_modules", ".next"];

/** Assets under public/ that are README-only and must not ship. */
const PUBLIC_SKIP = new Set(["screenshots"]);

// sharp is an optionalDependency of next, pulled in by the base next-server trace
// for next/image optimization. It is dropped here, for two reasons:
//
//  - Unreachable: this app imports next/image nowhere (no Image component in src/),
//    so the image optimizer never runs and never requires it. Verified by booting
//    dist/server.js without it and exercising every route — all 200, no require error.
//  - Wrong to publish: the traced copy is @img/sharp-libvips-linux-x64, host-specific
//    native binaries. Baking those into a tarball ships the build machine's
//    architecture to everyone who installs. It is also 33MB of the 51MB trace.
//
// Not done via outputFileTracingExcludes: that option is keyed by route glob and
// only applies to per-route traces, so it never matches the base server trace.
// If next/image is ever added, declare sharp a real optionalDependency so npm
// resolves the correct binary per platform — do not re-bake this one.
const PRUNE = ["node_modules/sharp", "node_modules/@img"];

// Files that embed the build machine's absolute project path, and the placeholder
// it is rewritten to. Next serializes the resolved config into both, leaving
// outputFileTracingRoot / turbopack.root / appDir pointing at wherever the build
// happened — so an unscrubbed tarball publishes the builder's $HOME layout (and
// username) to everyone who installs it.
//
// All three are build-time metadata: the standalone server resolves its real root
// from __dirname at startup, which is why substituting a placeholder is safe. The
// clean-directory install check in the release checklist is what proves it.
const PATH_SCRUB_FILES = ["server.js", ".next/required-server-files.json"];
const SCRUB_PLACEHOLDER = "/claudemap-build";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(STANDALONE))) {
    throw new Error(
      ".next/standalone missing — run `next build` with output:'standalone' first",
    );
  }

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const entry of KEEP) {
    const src = path.join(STANDALONE, entry);
    if (!(await exists(src))) {
      throw new Error(`standalone layout changed: expected ${entry} in .next/standalone`);
    }
    await cp(src, path.join(DIST, entry), { recursive: true });
  }

  // Client chunks. Must land at dist/.next/static to match the asset URLs the
  // built HTML already points at.
  await cp(path.join(ROOT, ".next", "static"), path.join(DIST, ".next", "static"), {
    recursive: true,
  });

  // Static assets, minus README imagery. Copied from the repo rather than from
  // the standalone tree so the skip list actually applies.
  const publicSrc = path.join(ROOT, "public");
  if (await exists(publicSrc)) {
    const publicDest = path.join(DIST, "public");
    await mkdir(publicDest, { recursive: true });
    for (const entry of await readdir(publicSrc, { withFileTypes: true })) {
      if (PUBLIC_SKIP.has(entry.name)) continue;
      await cp(path.join(publicSrc, entry.name), path.join(publicDest, entry.name), {
        recursive: true,
      });
    }
  }

  for (const rel of PRUNE) {
    await rm(path.join(DIST, rel), { recursive: true, force: true });
  }

  // Scrub the build machine's path out of the serialized config. Split/join rather
  // than a regex so no character in ROOT is treated as a metacharacter.
  for (const rel of PATH_SCRUB_FILES) {
    const file = path.join(DIST, rel);
    const before = await readFile(file, "utf8");
    const after = before.split(ROOT).join(SCRUB_PLACEHOLDER);
    if (after !== before) await writeFile(file, after);
  }

  // Fail loudly rather than publish a leak: if Next starts embedding the build
  // path somewhere new, this catches it at pack time instead of on npm.
  const leaks = [];
  for (const rel of ["server.js", ".next/required-server-files.json"]) {
    if ((await readFile(path.join(DIST, rel), "utf8")).includes(ROOT)) leaks.push(rel);
  }
  if (leaks.length) {
    throw new Error(`build path still embedded in: ${leaks.join(", ")}`);
  }

  // Next copies the root package.json into the standalone tree. Ours declares
  // `bin` and `files`, which has no business being restated inside the payload,
  // so it is replaced with the minimum server.js needs: a CommonJS marker that
  // keeps the traced tree resolving as CJS.
  await writeFile(
    path.join(DIST, "package.json"),
    `${JSON.stringify({ name: "claudemap-server", private: true, type: "commonjs" }, null, 2)}\n`,
  );

  if (!(await exists(path.join(DIST, "server.js")))) {
    throw new Error("staged dist/ has no server.js — standalone layout changed");
  }

  console.log("staged dist/ (entry: dist/server.js)");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
