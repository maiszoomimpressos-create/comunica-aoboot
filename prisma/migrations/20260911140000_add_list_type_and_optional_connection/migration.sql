-- Listas Extraídas (uma por número, connectionId fixo) vs Listas Montadas
-- (agregam contatos de qualquer número do tenant, connectionId sempre null).

-- CreateEnum
CREATE TYPE "ContactListType" AS ENUM ('EXTRACTED', 'ASSEMBLED');

-- AlterTable: nova coluna "type" (toda lista existente até aqui nasceu
-- vinculada a um número, então o default EXTRACTED já é o valor correto
-- para os dados atuais) + connectionId deixa de ser obrigatório.
ALTER TABLE "contact_list" ADD COLUMN "type" "ContactListType" NOT NULL DEFAULT 'EXTRACTED';
ALTER TABLE "contact_list" ALTER COLUMN "connectionId" DROP NOT NULL;
