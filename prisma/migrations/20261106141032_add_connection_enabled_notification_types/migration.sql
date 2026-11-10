-- Substitui, para os tipos de notificação, o gate amplo por serviceKey que
-- enabledServices fazia — ver sendPurchaseConfirmation em
-- whatsapp-connection.service.ts. Toda conexão existente recebe de volta
-- (explicitamente) todos os tipos que já estavam implicitamente liberados
-- pelo serviceKey correspondente, pra nenhuma integração em produção
-- (tipo7, entre outras) parar de funcionar neste deploy.
ALTER TABLE "channel_connection"
  ADD COLUMN "enabledNotificationTypes" TEXT[] NOT NULL DEFAULT ARRAY['compra_confirmada'];

UPDATE "channel_connection"
SET "enabledNotificationTypes" =
  (CASE WHEN 'purchase_confirmation' = ANY("enabledServices")
    THEN ARRAY['compra_confirmada','ingresso_emitido','estacionamento_emitido','estacionamento_liberado','lista_espera','agendamento_confirmado','notificacao','apk_disponivel','corrida_concluida']
    ELSE ARRAY[]::TEXT[]
  END)
  ||
  (CASE WHEN 'verification_code' = ANY("enabledServices")
    THEN ARRAY['codigo_verificacao']
    ELSE ARRAY[]::TEXT[]
  END);
