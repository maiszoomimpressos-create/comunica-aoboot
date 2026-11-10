-- Soft-delete de funções personalizadas: o registro permanece no banco
-- para sempre (ver CustomNotificationType.deletedAt).
-- NOT APPLIED: do not run this without a backup and explicit approval.
ALTER TABLE "custom_notification_type" ADD COLUMN "deletedAt" TIMESTAMP(3);
