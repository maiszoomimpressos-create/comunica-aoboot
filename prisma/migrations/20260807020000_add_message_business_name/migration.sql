-- Nome exibido nas mensagens automáticas do WhatsApp (ex.: confirmação de
-- compra), editável em "Minha Empresa". Opcional: cai no `name` quando null.
ALTER TABLE "organization" ADD COLUMN "messageBusinessName" TEXT;
