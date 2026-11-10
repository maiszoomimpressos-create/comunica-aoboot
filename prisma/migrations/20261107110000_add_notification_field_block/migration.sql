-- Biblioteca de pedaços de campo prontos, curada pelo Super Admin — ver
-- NotificationFieldBlock em schema.prisma.
CREATE TABLE "notification_field_block" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "messageLine" TEXT NOT NULL,
    "description" TEXT,
    "defaultRequired" BOOLEAN NOT NULL DEFAULT true,
    "niches" "SegmentoNiche"[] NOT NULL DEFAULT ARRAY[]::"SegmentoNiche"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_field_block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_field_block_key_key" ON "notification_field_block"("key");
