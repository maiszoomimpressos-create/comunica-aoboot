import type { CustomGreetingStyle, CustomGreetingNameSource } from "@/generated/prisma/client";
import { ValidationError, NotFoundError } from "@/lib/server/errors";
import { slugify } from "@/lib/slug";
import { isValidNotificationTypeKey } from "@/config/whatsapp-notification-types";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { updateEnabledNotificationTypes } from "@/repositories/channel-connection.repository";
import {
  createCustomNotificationType,
  updateCustomNotificationType,
  softDeleteCustomNotificationType,
  isCustomNotificationTypeKeyTaken,
  type CustomNotificationField,
} from "@/repositories/custom-notification-type.repository";
import { generateCustomNotificationTypeDraft } from "./notification-type-generator.service";
import { RESERVED_TEMPLATE_KEYS } from "@/lib/notifications/custom-message";

export { renderCustomMessageTemplate } from "@/lib/notifications/custom-message";

export interface GenerateDraftResult {
  suggestedKey: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
}

/** Gera o rascunho (campos + texto, via IA) a partir da descrição livre do
 * tenant, e já sugere um `key` único pra essa conexão a partir do título —
 * tudo revisável/editável antes de salvar (ver createCustomNotificationTypeForConnection). */
export async function generateCustomNotificationTypeDraftForConnection(
  tenantId: string,
  connectionId: string,
  title: string,
  description: string
): Promise<GenerateDraftResult> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!title.trim()) throw new ValidationError("Informe um título.");
  if (!description.trim()) throw new ValidationError("Descreva o que a mensagem deve mandar.");

  const [draft, suggestedKey] = await Promise.all([
    generateCustomNotificationTypeDraft(description.trim()),
    uniqueKeyFor(connectionId, title),
  ]);

  return {
    suggestedKey,
    fields: draft.fields,
    messageTemplate: draft.messageTemplate,
    greetingStyle: draft.greetingStyle,
    greetingNameSource: draft.greetingNameSource,
  };
}

/** Mesma sugestão de `key` usada pelo rascunho de IA, exposta separada pro
 * fluxo "montar com peças prontas" (ver create-custom-notification-type-form.tsx)
 * — não precisa gerar nada por IA, só o identificador técnico único. */
export async function suggestCustomNotificationTypeKeyForConnection(
  tenantId: string,
  connectionId: string,
  title: string
): Promise<string> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!title.trim()) throw new ValidationError("Informe um título.");
  return uniqueKeyFor(connectionId, title);
}

async function uniqueKeyFor(connectionId: string, title: string): Promise<string> {
  const base = slugify(title) || "funcao_personalizada";
  let candidate = base;
  let suffix = 2;
  while (isValidNotificationTypeKey(candidate) || (await isCustomNotificationTypeKeyTaken(connectionId, candidate))) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function validateFieldsAndTemplate(input: { fields: CustomNotificationField[]; messageTemplate: string }) {
  if (input.fields.length === 0) throw new ValidationError("Adicione ao menos um campo.");
  if (!input.messageTemplate.trim()) throw new ValidationError("Informe o texto da mensagem.");

  const declaredKeys = new Set(input.fields.map((f) => f.key));
  const usedKeys = [...input.messageTemplate.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const undeclared = usedKeys.find((k) => !declaredKeys.has(k) && !RESERVED_TEMPLATE_KEYS.has(k));
  if (undeclared) {
    throw new ValidationError(`O texto usa "{{${undeclared}}}", mas esse campo não foi declarado.`);
  }
}

export interface CreateCustomNotificationTypeInput {
  connectionId: string;
  key: string;
  label: string;
  description: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
  requiresQr: boolean;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  /** Original text typed in "Descrever com IA". Stored in the fields JSON. */
  aiDescription?: string | null;
}

/** Salva a função personalizada depois do tenant revisar/editar o rascunho
 * gerado pela IA — valida que o `key` é único (catálogo fixo + outras
 * funções dessa conexão) e que o texto só referencia campos declarados,
 * pra nunca salvar um template que quebraria na hora de enviar (ver
 * sendPurchaseConfirmation em whatsapp-connection.service.ts). */
export async function createCustomNotificationTypeForConnection(
  tenantId: string,
  input: CreateCustomNotificationTypeInput
) {
  const connection = await getConnectionSummary(tenantId, input.connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const key = slugify(input.key);
  if (!key) throw new ValidationError("Informe um identificador técnico válido.");
  if (!input.label.trim()) throw new ValidationError("Informe um título.");
  validateFieldsAndTemplate(input);

  if (isValidNotificationTypeKey(key)) {
    throw new ValidationError(`"${key}" já é um tipo do catálogo padrão — escolha outro identificador.`);
  }
  if (await isCustomNotificationTypeKeyTaken(input.connectionId, key)) {
    throw new ValidationError(`Já existe uma função personalizada com o identificador "${key}" nesta conexão.`);
  }

  return createCustomNotificationType(input.connectionId, {
    key,
    label: input.label.trim(),
    description: input.description.trim(),
    fields: input.fields,
    messageTemplate: input.messageTemplate,
    requiresQr: input.requiresQr,
    greetingStyle: input.greetingStyle,
    greetingNameSource: input.greetingNameSource,
    aiDescription: input.aiDescription,
  });
}

export interface UpdateCustomNotificationTypeInput {
  connectionId: string;
  key: string;
  label: string;
  description: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
  requiresQr: boolean;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  aiDescription?: string | null;
}

/** `key` é imutável depois de criado — só o conteúdo (label, descrição,
 * campos, template, QR) pode ser corrigido aqui. Mesma validação de
 * placeholder de createCustomNotificationTypeForConnection, pros mesmos
 * motivos. */
export async function updateCustomNotificationTypeForConnection(
  tenantId: string,
  input: UpdateCustomNotificationTypeInput
) {
  const connection = await getConnectionSummary(tenantId, input.connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!input.label.trim()) throw new ValidationError("Informe um título.");
  validateFieldsAndTemplate(input);

  const result = await updateCustomNotificationType(input.connectionId, input.key, {
    label: input.label.trim(),
    description: input.description.trim(),
    fields: input.fields,
    messageTemplate: input.messageTemplate,
    requiresQr: input.requiresQr,
    greetingStyle: input.greetingStyle,
    greetingNameSource: input.greetingNameSource,
    aiDescription: input.aiDescription,
  });
  if (result.count === 0) throw new NotFoundError("Função personalizada não encontrada.");
  return result;
}

/** Soft-delete: the row stays in the database forever (deletedAt). Also
 * removes the key from the connection's enabled types so it cannot stay
 * marked as dispatchable after it disappears from the list. */
export async function softDeleteCustomNotificationTypeForConnection(
  tenantId: string,
  connectionId: string,
  key: string
) {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  let result: { count: number };
  try {
    result = await softDeleteCustomNotificationType(connectionId, key);
  } catch {
    throw new ValidationError(
      "A exclusão ainda não pode ser gravada no banco — falta aplicar a migration deletedAt (com backup). O registro não foi removido."
    );
  }
  if (result.count === 0) throw new NotFoundError("Função personalizada não encontrada.");

  if (connection.enabledNotificationTypes.includes(key)) {
    await updateEnabledNotificationTypes(
      tenantId,
      connectionId,
      connection.enabledNotificationTypes.filter((item) => item !== key)
    );
  }
  return { ok: true as const };
}

