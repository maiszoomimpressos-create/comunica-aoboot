-- CreateTable
CREATE TABLE "form_submission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,

    CONSTRAINT "form_submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_submission_connectionId_flowId_idx" ON "form_submission"("connectionId", "flowId");

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "channel_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
