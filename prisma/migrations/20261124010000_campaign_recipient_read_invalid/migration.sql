-- Campanhas: novos status de destinatário.
-- READ = confirmado como lido pelo MessageStatusCallback da Z-API.
-- INVALID_NUMBER = phone-exists disse que o número não tem WhatsApp.
-- Migration separada de propósito: um valor novo de enum não pode ser
-- usado na mesma transação em que foi criado (o script de aplicação roda
-- cada migration numa transação própria), e nada aqui usa os valores.

ALTER TYPE "CampaignRecipientStatus" ADD VALUE IF NOT EXISTS 'READ' AFTER 'DELIVERED';
ALTER TYPE "CampaignRecipientStatus" ADD VALUE IF NOT EXISTS 'INVALID_NUMBER' AFTER 'FAILED';
