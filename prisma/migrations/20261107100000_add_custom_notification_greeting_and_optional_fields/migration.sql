-- Estilo e fonte de nome pra saudação das funções personalizadas
-- (CustomNotificationType / FunctionTemplate) — ver buildGreeting em
-- whatsapp-notification-types.ts. `fields` (JSONB, sem alteração de
-- schema) passa a aceitar `required: boolean` por item, interpretado só
-- em código (ver CustomNotificationField em
-- custom-notification-type.repository.ts).
CREATE TYPE "CustomGreetingStyle" AS ENUM ('FIXO', 'HORARIO');
CREATE TYPE "CustomGreetingNameSource" AS ENUM ('PERFIL_WHATSAPP', 'CADASTRO');

ALTER TABLE "custom_notification_type" ADD COLUMN "greetingStyle" "CustomGreetingStyle" NOT NULL DEFAULT 'FIXO';
ALTER TABLE "custom_notification_type" ADD COLUMN "greetingNameSource" "CustomGreetingNameSource" NOT NULL DEFAULT 'PERFIL_WHATSAPP';

ALTER TABLE "function_template" ADD COLUMN "greetingStyle" "CustomGreetingStyle" NOT NULL DEFAULT 'FIXO';
ALTER TABLE "function_template" ADD COLUMN "greetingNameSource" "CustomGreetingNameSource" NOT NULL DEFAULT 'PERFIL_WHATSAPP';
