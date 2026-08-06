-- ChannelConnection.apiUrl/apiTokenCipher become optional: a connection can
-- now exist in PENDING status as just a tenant's request (product +
-- phoneNumber), with no Z-API credentials yet -- those are filled in later
-- by a platform admin (see /admin/whatsapp), not the tenant.
--
-- Hand-written and applied via scripts/apply-migrations.mjs instead of
-- `prisma migrate dev` (native schema-engine binary blocked on this
-- machine -- see README).

ALTER TABLE "channel_connection" ALTER COLUMN "apiUrl" DROP NOT NULL;
ALTER TABLE "channel_connection" ALTER COLUMN "apiTokenCipher" DROP NOT NULL;
