-- Pós-corrida em DUAS mensagens: 1) imagem com legenda (sem link);
-- 2) 3-6 s depois, texto com o link da Play Store e prévia (Z-API send-link).
-- Tudo aditivo e nulo: sem valor, o código usa os textos padrão.

-- AlterTable
ALTER TABLE "app_promo_settings" ADD COLUMN "linkMessage" TEXT;
ALTER TABLE "app_promo_settings" ADD COLUMN "linkTitle" TEXT;
ALTER TABLE "app_promo_settings" ADD COLUMN "linkDescription" TEXT;
ALTER TABLE "app_promo_settings" ADD COLUMN "linkImageUrl" TEXT;

-- AlterTable
ALTER TABLE "ride_receipt_follow_up" ADD COLUMN "imageSentAt" TIMESTAMP(3);
ALTER TABLE "ride_receipt_follow_up" ADD COLUMN "imageMessageId" TEXT;
ALTER TABLE "ride_receipt_follow_up" ADD COLUMN "linkMessageId" TEXT;
