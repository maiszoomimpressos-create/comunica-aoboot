import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/ai/resolve-model";
import { slugify } from "@/lib/slug";
import { ValidationError, NotFoundError } from "@/lib/server/errors";
import { isValidNotificationTypeKey } from "@/config/whatsapp-notification-types";
import { generateCustomNotificationTypeDraft } from "./notification-type-generator.service";
import {
  createFunctionTemplate,
  updateFunctionTemplate,
  getFunctionTemplateByKey,
  listFunctionTemplateSummaries,
  listAllFunctionTemplates,
  listActiveFunctionTemplates,
  type FunctionTemplateFieldInput,
} from "@/repositories/function-template.repository";
import type { SegmentoNiche, CustomGreetingStyle, CustomGreetingNameSource } from "@/generated/prisma/client";

export { listAllFunctionTemplates, listActiveFunctionTemplates };

export interface GenerateFunctionTemplateDraftResult {
  suggestedKey: string;
  fields: FunctionTemplateFieldInput[];
  messageTemplate: string;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
}

/** Mesmo gerador usado pelo tenant em "função personalizada"
 * (notification-type-generator.service.ts), só que o `key` sugerido é
 * único na plataforma inteira (catálogo fixo + FunctionTemplate), não só
 * por conexão. */
export async function generateFunctionTemplateDraftForPlatform(
  title: string,
  description: string
): Promise<GenerateFunctionTemplateDraftResult> {
  if (!title.trim()) throw new ValidationError("Informe um título.");
  if (!description.trim()) throw new ValidationError("Descreva o que a mensagem deve mandar.");

  const [draft, suggestedKey] = await Promise.all([
    generateCustomNotificationTypeDraft(description.trim()),
    uniquePlatformKeyFor(title),
  ]);

  return {
    suggestedKey,
    fields: draft.fields,
    messageTemplate: draft.messageTemplate,
    greetingStyle: draft.greetingStyle,
    greetingNameSource: draft.greetingNameSource,
  };
}

async function uniquePlatformKeyFor(title: string): Promise<string> {
  const base = slugify(title) || "funcao_global";
  let candidate = base;
  let suffix = 2;
  while (isValidNotificationTypeKey(candidate) || (await getFunctionTemplateByKey(candidate))) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function validateTemplateBody(input: {
  label: string;
  fields: FunctionTemplateFieldInput[];
  messageTemplate: string;
}) {
  if (!input.label.trim()) throw new ValidationError("Informe um nome.");
  if (input.fields.length === 0) throw new ValidationError("Adicione ao menos um campo.");
  if (!input.messageTemplate.trim()) throw new ValidationError("Informe o texto da mensagem.");

  const declaredKeys = new Set(input.fields.map((f) => f.key));
  const usedKeys = [...input.messageTemplate.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const undeclared = usedKeys.find((k) => !declaredKeys.has(k) && k !== "nome_empresa");
  if (undeclared) {
    throw new ValidationError(`O texto usa "{{${undeclared}}}", mas esse campo não foi declarado.`);
  }
}

export interface CreateFunctionTemplateInput {
  key: string;
  label: string;
  description: string;
  fields: FunctionTemplateFieldInput[];
  messageTemplate: string;
  requiresQr: boolean;
  niches: SegmentoNiche[];
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
}

export async function createFunctionTemplateForPlatform(input: CreateFunctionTemplateInput) {
  validateTemplateBody(input);
  const key = slugify(input.key);
  if (!key) throw new ValidationError("Informe um identificador técnico válido.");

  if (isValidNotificationTypeKey(key)) {
    throw new ValidationError(`"${key}" já é um tipo do catálogo padrão — escolha outro identificador.`);
  }
  const existing = await getFunctionTemplateByKey(key);
  if (existing) {
    throw new ValidationError(`Já existe uma função global com o identificador "${key}".`);
  }

  return createFunctionTemplate({
    key,
    label: input.label.trim(),
    description: input.description.trim(),
    fields: input.fields,
    messageTemplate: input.messageTemplate,
    requiresQr: input.requiresQr,
    niches: input.niches,
    greetingStyle: input.greetingStyle,
    greetingNameSource: input.greetingNameSource,
  });
}

export interface UpdateFunctionTemplateInput {
  id: string;
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
}

export async function updateFunctionTemplateForPlatform(input: UpdateFunctionTemplateInput) {
  validateTemplateBody(input);
  const { id, ...data } = input;
  const result = await updateFunctionTemplate(id, data);
  if (!result) throw new NotFoundError("Função não encontrada.");
  return result;
}

const similaritySchema = z.object({
  duplicates: z.array(
    z.object({
      key: z.string().describe("O key exato de uma das funções já existentes listadas acima."),
      reason: z
        .string()
        .describe("Por que ela já cobre o mesmo caso de uso — uma frase curta, em português."),
    })
  ),
});

export interface SimilarFunctionTemplate {
  key: string;
  label: string;
  reason: string;
}

/** Regra de "não deixar criar duplicada sem avisar": antes de salvar uma
 * função nova, compara contra o catálogo inteiro via IA (mais confiável que
 * comparar string — "Corrida concluída" e "Viagem finalizada" são a mesma
 * coisa com nomes diferentes) e devolve o que parece se sobrepor. Não
 * bloqueia a criação — só avisa, quem decide é o admin (ver
 * check-similar-function-templates.ts). Custo irrisório: mesma chamada
 * Haiku de generateCustomNotificationTypeDraft, só texto curto. */
export async function findSimilarFunctionTemplates(
  label: string,
  description: string
): Promise<SimilarFunctionTemplate[]> {
  if (!label.trim() && !description.trim()) return [];
  const existing = await listFunctionTemplateSummaries();
  if (existing.length === 0) return [];

  const { object } = await generateObject({
    model: resolveModel("anthropic/claude-haiku-5.5"),
    schema: similaritySchema,
    prompt: `Catálogo de funções de notificação já existentes:
${existing.map((e) => `- key="${e.key}": "${e.label}" — ${e.description}`).join("\n")}

Nova função proposta: "${label}" — ${description}

Alguma função existente já cobre essencialmente o mesmo caso de uso, mesmo com nome ou redação
diferente (ex: "Corrida concluída" e "Viagem finalizada" são a mesma coisa)? Liste só as que
realmente se sobrepõem — não as que só são parecidas de leve ou do mesmo tema geral.`,
  });

  const byKey = new Map(existing.map((e) => [e.key, e]));
  return object.duplicates
    .map((d) => {
      const match = byKey.get(d.key);
      return match ? { key: d.key, label: match.label, reason: d.reason } : null;
    })
    .filter((x): x is SimilarFunctionTemplate => x !== null);
}
