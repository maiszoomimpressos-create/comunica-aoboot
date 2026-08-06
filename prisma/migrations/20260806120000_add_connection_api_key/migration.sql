-- Per-connection API key for machine-to-machine calls (external systems
-- triggering a WhatsApp send, e.g. a purchase confirmation with a QR code).
-- Only the SHA-256 hash is stored -- the plaintext key is shown once, at
-- generation time, and never persisted (see lib/whatsapp/api-key.ts).
--
-- Hand-written and applied via scripts/apply-migrations.mjs instead of
-- `prisma migrate dev` (native schema-engine binary blocked on this
-- machine -- see README). Matches exactly what `prisma migrate dev` would
-- generate from prisma/schema.prisma.

ALTER TABLE "channel_connection" ADD COLUMN "apiKeyHash" TEXT;
ALTER TABLE "channel_connection" ADD COLUMN "apiKeyPrefix" TEXT;
ALTER TABLE "channel_connection" ADD COLUMN "apiKeyCreatedAt" TIMESTAMP(3);
ALTER TABLE "channel_connection" ADD COLUMN "apiKeyLastUsedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "channel_connection_apiKeyHash_key" ON "channel_connection"("apiKeyHash");
