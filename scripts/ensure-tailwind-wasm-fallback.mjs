// Some Windows machines run an Application Control Policy (WDAC / Smart App
// Control) that blocks loading unsigned native ".node" binaries downloaded by
// npm. That breaks Tailwind CSS v4's native "Oxide" engine, which has no
// automatic JS/WASM fallback wired into a plain `npm install` (unlike
// Next.js's own SWC, which already falls back to a WASM build on its own).
//
// Tailwind v4 does publish a WASM build of the same engine
// (@tailwindcss/oxide-wasm32-wasi), but npm's platform check skips it during
// a normal install because its declared cpu ("wasm32") never matches a real
// machine's cpu ("x64"/"arm64"). We force-install it here as a safety net.
//
// This is a no-op cost if the native binary already loads fine (the default
// on most machines, and in CI/Vercel) — Tailwind still prefers native when
// available and only falls back to this package if native loading fails.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const fallbackPkg = "@tailwindcss/oxide-wasm32-wasi@4.3.3";
const alreadyInstalled = existsSync(
  "node_modules/@tailwindcss/oxide-wasm32-wasi"
);

if (process.platform === "win32" && !alreadyInstalled) {
  try {
    execSync(`npm install ${fallbackPkg} --no-save --force`, {
      stdio: "inherit",
    });
  } catch {
    // Best-effort only: if this fails, the native binary is presumably fine
    // on this machine and no fallback is needed.
  }
}
