import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server serve JS/CSS chunks to devices on the LAN (e.g.
  // testing from a phone at the "Network" URL `next dev` prints). Without
  // this, those requests are silently blocked, React never hydrates, and
  // forms fall back to a plain HTML GET submit (credentials end up in the
  // URL query string and nothing actually logs in).
  allowedDevOrigins: ["192.168.18.39"],

  // Local pre-push verification builds (see scripts/build-verify.mjs) use a
  // separate dist dir from `next dev`'s default `.next` — both write to the
  // same folder otherwise, and running `next dev` + `next build`
  // concurrently on this machine has corrupted the dev cache before (a
  // 500 "Unexpected end of JSON input" mid-session). Only the verify
  // script sets this env var; Vercel's real build never does, so
  // production keeps using the standard `.next`.
  ...(process.env.LOCAL_VERIFY_BUILD ? { distDir: ".next-verify" } : {}),
};

export default nextConfig;
