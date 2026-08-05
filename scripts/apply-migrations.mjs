// Applies every not-yet-recorded migration under prisma/migrations/*
// directly via node-postgres and records each in `_prisma_migrations`,
// because this machine can't run `prisma migrate dev/deploy` (its native
// schema-engine binary is blocked by a Windows Application Control Policy —
// see README). On any unrestricted machine, use the normal
// `npm run db:migrate:deploy` instead; this script exists purely so that
// history stays compatible with it (same table, same checksum, same
// migration_name as prisma migrate would use).
//
// Generalizes the earlier one-off scripts/apply-init-migration.mjs (which
// was hardcoded to a single migration folder) — every future module adds a
// migration folder here and this script picks it up automatically, applied
// in filename order, each in its own transaction.
import "dotenv/config";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.join(__dirname, "..", "prisma", "migrations");

function listMigrationDirs() {
  return readdirSync(migrationsRoot)
    .filter((name) => statSync(path.join(migrationsRoot, name)).isDirectory())
    .sort(); // migration folders are timestamp-prefixed, so lexicographic = chronological
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    );
  `);
}

async function isApplied(migrationName) {
  const result = await client.query(
    `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL`,
    [migrationName]
  );
  return result.rowCount > 0;
}

async function applyMigration(migrationName) {
  const sqlPath = path.join(migrationsRoot, migrationName, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, now(), 1)`,
      [randomUUID(), checksum, migrationName]
    );
    await client.query("COMMIT");
    console.log(`Applied and recorded migration: ${migrationName}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw new Error(`Failed applying migration "${migrationName}": ${err.message}`, { cause: err });
  }
}

async function main() {
  await client.connect();
  await ensureMigrationsTable();

  const dirs = listMigrationDirs();
  let appliedCount = 0;

  for (const migrationName of dirs) {
    if (await isApplied(migrationName)) {
      console.log(`Skipping already-applied migration: ${migrationName}`);
      continue;
    }
    await applyMigration(migrationName);
    appliedCount++;
  }

  await client.end();

  if (appliedCount === 0) {
    console.log("No pending migrations. Database is up to date.");
  } else {
    console.log(`Done. Applied ${appliedCount} migration(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
