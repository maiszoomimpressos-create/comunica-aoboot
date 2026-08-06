// Runs a production build for local pre-push verification, into a
// dedicated dist dir (.next-verify, see next.config.ts) so it never
// collides with a concurrently-running `next dev` (which writes to the
// default `.next`). Use this instead of `npm run build:webpack` when you
// just want to catch build errors before pushing — `next dev` on port 3006
// stays up the whole time, no need to kill/restart it around a verification
// build anymore.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build", "--webpack"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, LOCAL_VERIFY_BUILD: "1" },
});

process.exit(result.status ?? 1);
