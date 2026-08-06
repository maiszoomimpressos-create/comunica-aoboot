import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
