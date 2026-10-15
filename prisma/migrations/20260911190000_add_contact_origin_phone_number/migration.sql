-- Carimba o número pareado no momento da sincronização em vez de ler ao
-- vivo de channel_connection.phoneNumber — uma mesma conexão pode ser usada
-- pra extrair agendas de números diferentes em momentos diferentes (trocar
-- o QR pareado), e sem esse carimbo a origem de contatos/listas já
-- sincronizados seria reescrita retroativamente a cada troca.
ALTER TABLE "contact" ADD COLUMN "originPhoneNumber" TEXT;
UPDATE "contact" c
  SET "originPhoneNumber" = cc."phoneNumber"
  FROM "channel_connection" cc
  WHERE cc.id = c."connectionId";
ALTER TABLE "contact" ALTER COLUMN "originPhoneNumber" SET NOT NULL;

ALTER TABLE "contact_list" ADD COLUMN "originPhoneNumber" TEXT;
UPDATE "contact_list" cl
  SET "originPhoneNumber" = cc."phoneNumber"
  FROM "channel_connection" cc
  WHERE cc.id = cl."connectionId" AND cl.type = 'EXTRACTED';
