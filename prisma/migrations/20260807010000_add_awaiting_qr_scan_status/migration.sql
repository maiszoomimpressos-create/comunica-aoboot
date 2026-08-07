-- New ChannelConnectionStatus value: AWAITING_QR_SCAN -- credentials are
-- valid (Z-API instance reachable, Client-Token accepted) but the WhatsApp
-- session hasn't been paired to a phone yet via QR code. Distinct from
-- AUTH_ERROR (a real problem).
--
-- Hand-written and applied via scripts/apply-migrations.mjs instead of
-- `prisma migrate dev` (native schema-engine binary blocked on this
-- machine -- see README).

ALTER TYPE "ChannelConnectionStatus" ADD VALUE 'AWAITING_QR_SCAN';
