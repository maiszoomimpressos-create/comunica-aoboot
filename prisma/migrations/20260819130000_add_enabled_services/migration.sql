-- Quais serviços a chave de API de cada conexão pode chamar (ver
-- src/config/whatsapp-services.ts). Toda linha (nova ou já existente)
-- nasce com "purchase_confirmation" habilitado, pra não quebrar a
-- integração de ingresso já em produção — "balance_alert" fica opt-in.
ALTER TABLE "channel_connection"
  ADD COLUMN "enabledServices" TEXT[] NOT NULL DEFAULT '{purchase_confirmation}';
