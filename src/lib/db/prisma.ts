import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 dropped the bundled Rust query engine: every database needs an
// explicit driver adapter. @prisma/adapter-pg wraps node-postgres (pure JS,
// no native binary), which also happens to be what keeps this project's
// tooling portable across the driver-adapter/queryCompiler architecture and
// edge-friendly deployments.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

declare global {
  var __prisma: ReturnType<typeof createPrismaClient> | undefined;
}

// Reuse a single client across hot-reloads in dev so we don't exhaust the
// database's connection limit every time a Server Action file is edited.
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
