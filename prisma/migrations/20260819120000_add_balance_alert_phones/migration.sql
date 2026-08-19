-- Números fixos (até 3) que recebem o alerta de saldo baixo disparado pelo
-- sistema externo do tenant via POST /api/v1/whatsapp/balance-alert.
ALTER TABLE "channel_connection" ADD COLUMN "balanceAlertPhones" TEXT[] NOT NULL DEFAULT '{}';
