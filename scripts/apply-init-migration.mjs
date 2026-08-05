// One-off helper: applies prisma/migrations/*_init/migration.sql directly via
// node-postgres and records it in `_prisma_migrations`, because this machine
// can't run `prisma migrate dev/deploy` (its native schema-engine binary is
// blocked by a Windows Application Control Policy — see README). On any
// unrestricted machine, use the normal `npm run db:migrate:deploy` instead;
// this script exists purely so that history stays compatible with it.
import "dotenv/config";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = "20260805120000_init";
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  migrationDir,
  "migration.sql"
);
const sql = readFileSync(sqlPath, "utf8");
const checksum = createHash("sha256").update(sql).digest("hex");

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

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

  const already = await client.query(
    `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL`,
    [migrationDir]
  );
  if (already.rowCount > 0) {
    console.log(`Migration ${migrationDir} already applied. Nothing to do.`);
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, now(), 1)`,
      [crypto.randomUUID(), checksum, migrationDir]
    );
    await client.query("COMMIT");
    console.log(`Applied and recorded migration: ${migrationDir}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
