import { prisma } from "@/lib/db/prisma";
import type { Prisma, SegmentoNiche, CustomGreetingStyle, CustomGreetingNameSource } from "@/generated/prisma/client";

export interface FunctionTemplateFieldInput {
  key: string;
  label: string;
  description?: string;
  /** `false` = campo opcional — ver mesmo campo em CustomNotificationField
   * (custom-notification-type.repository.ts). */
  required?: boolean;
}

/** Super Admin-facing — todo o catálogo, incluindo inativos, pra edição em
 * /admin/whatsapp. */
export function listAllFunctionTemplates() {
  return prisma.functionTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/** Tenant-facing — só os ativos, pro picker de cards ao montar Funções.
 * `niches` vazio no template significa "genérico", sempre incluído. */
export function listActiveFunctionTemplates() {
  return prisma.functionTemplate.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Resumo mínimo (sem o template da mensagem) usado na checagem de
 * duplicidade — ver findSimilarFunctionTemplates em function-template.service.ts. */
export function listFunctionTemplateSummaries() {
  return prisma.functionTemplate.findMany({
    select: { key: true, label: true, description: true },
    orderBy: { createdAt: "asc" },
  });
}

export function getFunctionTemplateByKey(key: string) {
  return prisma.functionTemplate.findUnique({ where: { key } });
}

export function createFunctionTemplate(data: {
  key: string;
  label: string;
  description: string;
  fields: FunctionTemplateFieldInput[];
  messageTemplate: string;
  requiresQr: boolean;
  niches: SegmentoNiche[];
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
}) {
  return prisma.functionTemplate.create({
    data: { ...data, fields: data.fields as unknown as Prisma.InputJsonValue },
  });
}

export function updateFunctionTemplate(
  id: string,
  data: Partial<{
    label: string;
    description: string;
    fields: FunctionTemplateFieldInput[];
    messageTemplate: string;
    requiresQr: boolean;
    niches: SegmentoNiche[];
    active: boolean;
    sortOrder: number;
    greetingStyle: CustomGreetingStyle;
    greetingNameSource: CustomGreetingNameSource;
  }>
) {
  const { fields, ...rest } = data;
  return prisma.functionTemplate.update({
    where: { id },
    data: {
      ...rest,
      ...(fields ? { fields: fields as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}
