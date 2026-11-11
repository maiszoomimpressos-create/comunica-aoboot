import { ValidationError, NotFoundError } from "@/lib/server/errors";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import {
  getCustomNotificationTypeByKey,
  updateCustomNotificationType,
  type CustomNotificationField,
} from "@/repositories/custom-notification-type.repository";
import { RESERVED_TEMPLATE_KEYS } from "@/lib/notifications/custom-message";
import {
  appendCustomFunctionAiHistory,
  type CustomFunctionAiHistoryType,
} from "@/lib/notifications/custom-function-history";
import {
  applyEditPatch,
  FunctionPatchError,
  mergeAddition,
  type CustomFunctionAddition,
  type CustomFunctionEditPatch,
  type MergePreview,
} from "@/lib/notifications/custom-function-patch";
import {
  generateCustomNotificationAddition,
  generateCustomNotificationEditPatch,
} from "./notification-type-patch-generator.service";

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

function wrapPatchError(error: unknown): never {
  if (error instanceof FunctionPatchError) throw new ValidationError(error.message);
  throw error;
}

async function loadCurrent(tenantId: string, connectionId: string, key: string) {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  const current = await getCustomNotificationTypeByKey(connectionId, key);
  if (!current) throw new NotFoundError("Função personalizada não encontrada.");
  return current;
}

export interface AiPatchPreviewResult {
  mode: CustomFunctionAiHistoryType;
  prompt: string;
  positionNote: string;
  addition?: CustomFunctionAddition;
  editPatch?: CustomFunctionEditPatch;
  preview: MergePreview;
}

export async function previewCustomNotificationAdditionForConnection(
  tenantId: string,
  connectionId: string,
  key: string,
  prompt: string
): Promise<AiPatchPreviewResult> {
  const text = prompt.trim();
  if (!text) throw new ValidationError("Descreva o que quer acrescentar.");
  const current = await loadCurrent(tenantId, connectionId, key);
  const generated = await generateCustomNotificationAddition({
    prompt: text,
    fields: current.fields,
    messageTemplate: current.messageTemplate,
  });
  let preview: MergePreview;
  try {
    preview = mergeAddition(current, {
      newFields: generated.newFields,
      newLines: generated.newLines,
      insertAfterFieldKey: generated.insertAfterFieldKey,
      insertAfterLine: generated.insertAfterLine,
    });
  } catch (error) {
    wrapPatchError(error);
  }
  validateFieldsAndTemplate(preview);
  return {
    mode: "adicionar",
    prompt: text,
    positionNote: generated.positionNote,
    addition: {
      newFields: preview.addedFields,
      newLines: preview.addedLines,
      insertAfterFieldKey: generated.insertAfterFieldKey,
      insertAfterLine: generated.insertAfterLine,
    },
    preview,
  };
}

export async function previewCustomNotificationEditForConnection(
  tenantId: string,
  connectionId: string,
  key: string,
  prompt: string
): Promise<AiPatchPreviewResult> {
  const text = prompt.trim();
  if (!text) throw new ValidationError("Descreva a alteração que quer fazer.");
  const current = await loadCurrent(tenantId, connectionId, key);
  const generated = await generateCustomNotificationEditPatch({
    prompt: text,
    fields: current.fields,
    messageTemplate: current.messageTemplate,
  });
  const editPatch: CustomFunctionEditPatch = {
    fieldUpdates: generated.fieldUpdates,
    newFields: generated.newFields,
    lineReplacements: generated.lineReplacements,
    lineInsertions: generated.lineInsertions,
    lineDeletions: generated.lineDeletions,
  };
  let preview: MergePreview;
  try {
    preview = applyEditPatch(current, editPatch);
  } catch (error) {
    wrapPatchError(error);
  }
  validateFieldsAndTemplate(preview);
  return {
    mode: "editar",
    prompt: text,
    positionNote: generated.positionNote,
    editPatch,
    preview,
  };
}

export async function applyCustomNotificationAiPatchForConnection(
  tenantId: string,
  input: {
    connectionId: string;
    key: string;
    prompt: string;
    mode: CustomFunctionAiHistoryType;
    addition?: CustomFunctionAddition;
    editPatch?: CustomFunctionEditPatch;
  }
) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new ValidationError("O pedido original é obrigatório para guardar no histórico.");
  const current = await loadCurrent(tenantId, input.connectionId, input.key);

  let preview: MergePreview;
  try {
    if (input.mode === "adicionar") {
      if (!input.addition) throw new ValidationError("Falta o acréscimo para aplicar.");
      preview = mergeAddition(current, input.addition);
    } else {
      if (!input.editPatch) throw new ValidationError("Falta o patch de edição para aplicar.");
      preview = applyEditPatch(current, input.editPatch);
    }
  } catch (error) {
    wrapPatchError(error);
  }
  validateFieldsAndTemplate(preview);

  const history = appendCustomFunctionAiHistory(current.history, {
    type: input.mode,
    prompt,
    createdAt: new Date().toISOString(),
  });

  const result = await updateCustomNotificationType(input.connectionId, input.key, {
    label: current.label,
    description: current.description,
    fields: preview.fields,
    messageTemplate: preview.messageTemplate,
    requiresQr: current.requiresQr,
    greetingStyle: current.greetingStyle,
    greetingNameSource: current.greetingNameSource,
    history,
  });
  if (result.count === 0) throw new NotFoundError("Função personalizada não encontrada.");
  return { preview, history };
}
