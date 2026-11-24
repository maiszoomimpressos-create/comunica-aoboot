-- Contatos: de onde veio o nome (ver src/lib/whatsapp/contact-name.ts).
-- "agenda" | "perfil" | "whatsapp" (Z-API sem distinguir) | "csv" | "manual".
-- Nome de CSV/manual nunca é sobrescrito pela sincronização da Z-API.
ALTER TABLE "contact" ADD COLUMN "nameSource" TEXT;

-- Contatos que já têm nome: deduz a origem pelo `source` do contato.
-- (Antes desta coluna o sync podia ter trocado o nome de um contato de
-- CSV pelo da Z-API — não há como saber; fica como o source indica.)
UPDATE "contact"
  SET "nameSource" = CASE "source"
    WHEN 'import' THEN 'csv'
    WHEN 'manual' THEN 'manual'
    ELSE 'whatsapp'
  END
  WHERE "name" IS NOT NULL AND btrim("name") <> '';
