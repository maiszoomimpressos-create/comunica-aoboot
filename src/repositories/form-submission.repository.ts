import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function createFormSubmission(data: {
  connectionId: string;
  flowId: string;
  nodeId: string;
  title: string;
  contactPhone: string;
  answers: Record<string, unknown>;
  pdfUrl?: string | null;
}) {
  return prisma.formSubmission.create({
    data: {
      connectionId: data.connectionId,
      flowId: data.flowId,
      nodeId: data.nodeId,
      title: data.title,
      contactPhone: data.contactPhone,
      answers: data.answers as Prisma.InputJsonValue,
      pdfUrl: data.pdfUrl ?? null,
    },
  });
}

export function listFormSubmissionsForFlow(flowId: string) {
  return prisma.formSubmission.findMany({ where: { flowId }, orderBy: { createdAt: "desc" } });
}
