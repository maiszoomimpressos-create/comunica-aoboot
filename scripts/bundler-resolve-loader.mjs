// Minimal Node ESM loader hook that makes plain `node` resolve modules the
// way a bundler (webpack/Turbopack) does, for two cases plain Node doesn't
// handle on its own:
//
//  1. Extensionless/bare relative specifiers — e.g. Prisma's `prisma-client`
//     generator emits `from "./enums"` with no extension, assuming whoever
//     consumes it is a bundler.
//  2. The project's `@/*` -> `./src/*` path alias (tsconfig `compilerOptions.
//     paths`), which only bundlers and the TS compiler understand natively.
//
// Used by scripts/run-ts.mjs so standalone TS scripts (seed, one-off db
// helpers) can import the same `@/lib/...` modules the Next.js app does,
// without pulling in tsx/ts-node (whose esbuild dependency's native binary
// is blocked on this machine — see README).
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(projectRoot, "src");
const candidateExtensions = [".ts", ".mts", ".js", ".mjs"];

function resolveWithExtensions(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;
  for (const ext of candidateExtensions) {
    if (existsSync(basePath + ext)) return basePath + ext;
  }
  for (const ext of candidateExtensions) {
    const indexPath = path.join(basePath, "index" + ext);
    if (existsSync(indexPath)) return indexPath;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = resolveWithExtensions(path.join(srcDir, specifier.slice(2)));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw err;
    if (!context.parentURL) throw err;

    const baseDir = path.dirname(fileURLToPath(context.parentURL));
    const basePath = path.resolve(baseDir, specifier);
    const resolved = resolveWithExtensions(basePath);
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
    throw err;
  }
}
