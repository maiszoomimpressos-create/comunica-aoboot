#!/usr/bin/env node
// Runs a standalone TypeScript file (prisma/seed.ts, one-off db scripts,
// etc.) under plain Node — no ts-node/tsx, whose esbuild dependency's native
// binary is blocked by this machine's Application Control Policy.
//
// Node 22+ strips TypeScript types natively; the only gap is that generated
// bundler-oriented code (e.g. Prisma's `prisma-client` generator) imports
// relative files without extensions, which Node's ESM resolver rejects. The
// loader registered below fills exactly that gap. See
// scripts/bundler-resolve-loader.mjs for details.
//
// Usage: node scripts/run-ts.mjs <path/to/file.ts> [...args]
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./bundler-resolve-loader.mjs", import.meta.url);

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/run-ts.mjs <path/to/file.ts>");
  process.exit(1);
}

await import(pathToFileURL(path.resolve(target)).href);
