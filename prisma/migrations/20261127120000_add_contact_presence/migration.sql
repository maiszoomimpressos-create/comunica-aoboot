-- Rastreamento de presença por contato (webhook passivo Z-API). Aditivo.
-- AlterTable
ALTER TABLE "channel_connection" ADD COLUMN "presenceTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "contact_presence" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "contact_presence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_presence_connectionId_phone_key" ON "contact_presence"("connectionId", "phone");

-- AddForeignKey
ALTER TABLE "contact_presence" ADD CONSTRAINT "contact_presence_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
