/**
 * Aplica no BANCO DE PRODUÇÃO a mudança da função `corrida_mai_drive`
 * (título das tarifas, linha do app e 2 botões de link). Ver
 * corrida-mai-drive-botoes.config.ts.
 *
 *   Prévia (não grava nada):  node --env-file=.env scripts/run-ts.mjs scripts/apply-corrida-mai-drive-botoes.ts
 *   Aplicar (com backup):     node --env-file=.env scripts/run-ts.mjs scripts/apply-corrida-mai-drive-botoes.ts --apply
 *   Desfazer:                 node --env-file=.env scripts/run-ts.mjs scripts/apply-corrida-mai-drive-botoes.ts --rollback backups/<arquivo>.json
 *
 * Só rodar --apply DEPOIS do deploy do código que entende `{{?chave}}` e
 * `linkButtons` — com o código antigo, o marcador apareceria no texto.
 * Nunca imprime a DATABASE_URL.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  CONNECTION_ID,
  FUNCTION_KEY,
  LINK_BUTTONS,
  transformTemplate,
} from "./corrida-mai-drive-botoes.config";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rollbackIdx = args.indexOf("--rollback");
const rollbackFile = rollbackIdx >= 0 ? args[rollbackIdx + 1] : null;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ausente (rode com node --env-file=.env ...).");
  process.exit(1);
}

type Row = { id: string; key: string; messageTemplate: string; fields: unknown; updatedAt: string };

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (rollbackFile) {
    const backup = JSON.parse(fs.readFileSync(path.resolve(rollbackFile), "utf8")) as { row: Row };
    const res = await client.query(
      `UPDATE "custom_notification_type" SET "messageTemplate" = $1, "fields" = $2::jsonb, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $3 AND "connectionId" = $4 AND "key" = $5 AND "deletedAt" IS NULL`,
      [backup.row.messageTemplate, JSON.stringify(backup.row.fields), backup.row.id, CONNECTION_ID, FUNCTION_KEY]
    );
    console.log(res.rowCount === 1 ? "Restaurado a partir do backup." : `Nada restaurado (linhas: ${res.rowCount}).`);
    process.exit(res.rowCount === 1 ? 0 : 1);
  }

  const { rows } = await client.query<Row>(
    `SELECT "id", "key", "messageTemplate", "fields", "updatedAt"::text AS "updatedAt" FROM "custom_notification_type"
     WHERE "connectionId" = $1 AND "key" = $2 AND "deletedAt" IS NULL`,
    [CONNECTION_ID, FUNCTION_KEY]
  );
  if (rows.length !== 1) throw new Error(`Esperava 1 registro, achei ${rows.length}.`);
  const row = rows[0];

  const nextTemplate = transformTemplate(row.messageTemplate);
  if (nextTemplate === null) {
    throw new Error("A linha '🔗 Entenda nossas tarifas: {{link_tarifas}}' não está no texto (já aplicado ou texto mudou). Nada feito.");
  }
  const raw = row.fields;
  const nextFields = Array.isArray(raw)
    ? { fields: raw, linkButtons: LINK_BUTTONS }
    : { ...(raw as Record<string, unknown>), linkButtons: LINK_BUTTONS };

  console.log("===== TEXTO NOVO =====");
  console.log(nextTemplate);
  console.log("===== linkButtons =====");
  console.log(JSON.stringify(LINK_BUTTONS, null, 2));

  if (!apply) {
    console.log("\nPrévia apenas. Para gravar, rode de novo com --apply.");
    process.exit(0);
  }

  const dir = path.resolve("backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `corrida_mai_drive-botoes-link-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), row }, null, 2), "utf8");
  console.log(`Backup: ${file}`);

  // Só grava se ninguém mexeu no registro desde a leitura acima.
  const res = await client.query(
    `UPDATE "custom_notification_type" SET "messageTemplate" = $1, "fields" = $2::jsonb, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $3 AND "updatedAt"::text = $4 AND "deletedAt" IS NULL`,
    [nextTemplate, JSON.stringify(nextFields), row.id, row.updatedAt]
  );
  if (res.rowCount !== 1) throw new Error("O registro mudou durante a aplicação. Nada gravado; rode de novo.");
  console.log("Aplicado.");
} finally {
  await client.end();
}
