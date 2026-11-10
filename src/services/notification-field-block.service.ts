import { ValidationError, NotFoundError } from "@/lib/server/errors";
import { slugify } from "@/lib/slug";
import { isValidNotificationTypeKey } from "@/config/whatsapp-notification-types";
import {
  listAllNotificationFieldBlocks,
  listActiveNotificationFieldBlocks,
  getNotificationFieldBlockByKey,
  createNotificationFieldBlock,
  updateNotificationFieldBlock,
} from "@/repositories/notification-field-block.repository";
import type { SegmentoNiche } from "@/generated/prisma/client";

export { listAllNotificationFieldBlocks, listActiveNotificationFieldBlocks };

function validateMessageLine(key: string, messageLine: string) {
  if (!messageLine.trim()) throw new ValidationError("Informe a linha de mensagem.");
  if (!messageLine.includes(`{{${key}}}`)) {
    throw new ValidationError(`A linha de mensagem precisa referenciar "{{${key}}}".`);
  }
}

export interface CreateNotificationFieldBlockInput {
  key: string;
  label: string;
  messageLine: string;
  description?: string;
  defaultRequired: boolean;
  niches: SegmentoNiche[];
}

/** Só o Super Admin cria pedaços — `key` é único na plataforma inteira
 * (igual ao catálogo fixo e ao FunctionTemplate), pra nunca colidir com um
 * placeholder que o tenant já espera noutro lugar. */
export async function createNotificationFieldBlockForPlatform(input: CreateNotificationFieldBlockInput) {
  const key = slugify(input.key);
  if (!key) throw new ValidationError("Informe uma chave técnica válida.");
  if (!input.label.trim()) throw new ValidationError("Informe um nome.");
  validateMessageLine(key, input.messageLine);

  if (isValidNotificationTypeKey(key)) {
    throw new ValidationError(`"${key}" já é um tipo do catálogo padrão — escolha outra chave.`);
  }
  const existing = await getNotificationFieldBlockByKey(key);
  if (existing) {
    throw new ValidationError(`Já existe um pedaço com a chave "${key}".`);
  }

  return createNotificationFieldBlock({
    key,
    label: input.label.trim(),
    messageLine: input.messageLine.trim(),
    description: input.description?.trim() || undefined,
    defaultRequired: input.defaultRequired,
    niches: input.niches,
  });
}

export interface UpdateNotificationFieldBlockInput {
  id: string;
  key: string;
  label: string;
  messageLine: string;
  description?: string;
  defaultRequired: boolean;
  niches: SegmentoNiche[];
  active: boolean;
  sortOrder: number;
}

/** `key` nunca muda depois de criado (funções já montadas referenciam esse
 * placeholder no texto delas) — só o conteúdo é editável aqui. */
export async function updateNotificationFieldBlockForPlatform(input: UpdateNotificationFieldBlockInput) {
  if (!input.label.trim()) throw new ValidationError("Informe um nome.");
  validateMessageLine(input.key, input.messageLine);

  const result = await updateNotificationFieldBlock(input.id, {
    label: input.label.trim(),
    messageLine: input.messageLine.trim(),
    description: input.description?.trim() || null,
    defaultRequired: input.defaultRequired,
    niches: input.niches,
    active: input.active,
    sortOrder: input.sortOrder,
  });
  if (!result) throw new NotFoundError("Pedaço não encontrado.");
  return result;
}
