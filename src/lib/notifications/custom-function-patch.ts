import type { CustomNotificationField, FieldValueType } from "@/repositories/custom-notification-type.repository";
import { RESERVED_TEMPLATE_KEYS } from "@/lib/notifications/custom-message";

export interface TemplateInsertAnchor {
  afterFieldKey?: string | null;
  afterLine?: string | null;
}

export interface CustomFunctionAddition {
  newFields: CustomNotificationField[];
  newLines: string[];
  insertAfterFieldKey?: string | null;
  insertAfterLine?: string | null;
}

export interface CustomFunctionFieldUpdate {
  key: string;
  label?: string;
  description?: string | null;
  required?: boolean;
  valueType?: FieldValueType;
}

export interface CustomFunctionLineReplacement {
  from: string;
  to: string;
}

export interface CustomFunctionLineInsertion extends TemplateInsertAnchor {
  lines: string[];
}

export interface CustomFunctionEditPatch {
  fieldUpdates?: CustomFunctionFieldUpdate[];
  newFields?: CustomNotificationField[];
  lineReplacements?: CustomFunctionLineReplacement[];
  lineInsertions?: CustomFunctionLineInsertion[];
  lineDeletions?: string[];
}

export interface FunctionContent {
  fields: CustomNotificationField[];
  messageTemplate: string;
}

export interface MergePreview {
  fields: CustomNotificationField[];
  messageTemplate: string;
  addedFields: CustomNotificationField[];
  addedLines: string[];
  insertAfterLabel: string;
  fieldUpdates: Array<{ key: string; before: CustomNotificationField; after: CustomNotificationField }>;
  lineReplacements: Array<{ from: string; to: string }>;
  deletedLines: string[];
}

export class FunctionPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FunctionPatchError";
  }
}

const VALUE_TYPES: FieldValueType[] = ["texto", "numero", "moeda", "data_hora"];

export function sanitizeFieldKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function cloneField(field: CustomNotificationField): CustomNotificationField {
  return {
    key: field.key,
    label: field.label,
    required: field.required,
    ...(field.description !== undefined ? { description: field.description } : {}),
    ...(field.valueType !== undefined ? { valueType: field.valueType } : {}),
  };
}

export function fieldSnapshot(field: CustomNotificationField): string {
  return JSON.stringify(cloneField(field));
}

function normalizeNewLines(lines: string[] | undefined): string[] {
  if (!lines?.length) return [];
  const trimmed = lines.map((l) => (typeof l === "string" ? l.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : ""));
  let start = 0;
  let end = trimmed.length;
  while (start < end && trimmed[start].trim() === "") start += 1;
  while (end > start && trimmed[end - 1].trim() === "") end -= 1;
  return trimmed.slice(start, end);
}

export function splitTemplateLines(template: string): string[] {
  return template.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function joinTemplateLines(lines: string[]): string {
  return lines.join("\n");
}

export function findInsertAfterIndex(lines: string[], anchor: TemplateInsertAnchor): { index: number; label: string } {
  if (anchor.afterFieldKey) {
    const token = `{{${anchor.afterFieldKey}}}`;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(token)) return { index: i, label: lines[i] };
    }
  }
  const afterLine = anchor.afterLine?.trim() ?? "";
  if (afterLine) {
    const exact = lines.findIndex((l) => l.trim() === afterLine);
    if (exact >= 0) return { index: exact, label: lines[exact] };
    const includes = lines.findIndex((l) => l.includes(afterLine));
    if (includes >= 0) return { index: includes, label: lines[includes] };
  }
  if (lines.length === 0) return { index: -1, label: "(início da mensagem)" };
  return { index: lines.length - 1, label: lines[lines.length - 1] || "(final da mensagem)" };
}

function insertLines(template: string, newLines: string[], anchor: TemplateInsertAnchor): {
  template: string;
  addedLines: string[];
  insertAfterLabel: string;
  insertedBlock: string;
} {
  const linesToAdd = normalizeNewLines(newLines);
  if (linesToAdd.length === 0) {
    return { template, addedLines: [], insertAfterLabel: "", insertedBlock: "" };
  }
  const lines = splitTemplateLines(template);
  const { index, label } = findInsertAfterIndex(lines, anchor);
  const at = index + 1;
  const next = [...lines.slice(0, at), ...linesToAdd, ...lines.slice(at)];
  return {
    template: joinTemplateLines(next),
    addedLines: linesToAdd,
    insertAfterLabel: label,
    insertedBlock: linesToAdd.join("\n"),
  };
}

function sanitizeNewField(raw: CustomNotificationField, existingKeys: Set<string>): CustomNotificationField {
  const key = sanitizeFieldKey(raw.key ?? "");
  if (!key) throw new FunctionPatchError("A IA sugeriu um campo sem identificador válido.");
  if (RESERVED_TEMPLATE_KEYS.has(key)) {
    throw new FunctionPatchError(`O identificador "${key}" é reservado e não pode ser usado como campo.`);
  }
  if (existingKeys.has(key)) {
    throw new FunctionPatchError(`O campo "${key}" já existe nesta função. A IA não pode reescrevê-lo; peça só o acréscimo.`);
  }
  const label = (raw.label ?? "").trim();
  if (!label) throw new FunctionPatchError(`Informe um rótulo para o campo "${key}".`);
  const valueType = raw.valueType && VALUE_TYPES.includes(raw.valueType) ? raw.valueType : "texto";
  const description = typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : undefined;
  return {
    key,
    label,
    required: raw.required === true,
    ...(description ? { description } : {}),
    valueType,
  };
}

function insertFields(
  fields: CustomNotificationField[],
  newFields: CustomNotificationField[],
  afterKey?: string | null
): CustomNotificationField[] {
  if (newFields.length === 0) return fields.map(cloneField);
  const idx = afterKey ? fields.findIndex((f) => f.key === afterKey) : -1;
  const at = idx >= 0 ? idx + 1 : fields.length;
  return [...fields.slice(0, at).map(cloneField), ...newFields, ...fields.slice(at).map(cloneField)];
}

function existingFieldsUnchanged(before: CustomNotificationField[], after: CustomNotificationField[]): void {
  const afterByKey = new Map(after.map((f) => [f.key, f]));
  let lastIndex = -1;
  for (const field of before) {
    const next = afterByKey.get(field.key);
    if (!next) {
      throw new FunctionPatchError(`O campo existente "${field.key}" desapareceu. Nada do que já existe pode ser apagado neste acréscimo.`);
    }
    if (fieldSnapshot(field) !== fieldSnapshot(next)) {
      throw new FunctionPatchError(`O campo existente "${field.key}" foi alterado. A IA só pode acrescentar campos novos.`);
    }
    const index = after.findIndex((f) => f.key === field.key);
    if (index <= lastIndex) {
      throw new FunctionPatchError("A ordem dos campos já existentes foi alterada. Ela precisa ser preservada.");
    }
    lastIndex = index;
  }
}

function templateWithoutInsertedBlock(original: string, merged: string, insertedBlock: string): void {
  if (!insertedBlock) {
    if (merged !== original) {
      throw new FunctionPatchError("O texto já existente da mensagem foi alterado. O acréscimo foi recusado.");
    }
    return;
  }
  const lines = splitTemplateLines(merged);
  const block = splitTemplateLines(insertedBlock);
  const start = findSubsequence(lines, block);
  if (start < 0) {
    throw new FunctionPatchError("Não foi possível localizar o trecho acrescentado no texto da mensagem.");
  }
  const without = [...lines.slice(0, start), ...lines.slice(start + block.length)];
  if (joinTemplateLines(without) !== original) {
    throw new FunctionPatchError(
      "O texto já existente da mensagem não foi preservado byte a byte. O acréscimo foi recusado."
    );
  }
}

function findSubsequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return 0;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

export function mergeAddition(current: FunctionContent, addition: CustomFunctionAddition): MergePreview {
  const existingKeys = new Set(current.fields.map((f) => f.key));
  const addedFields = (addition.newFields ?? []).map((f) => sanitizeNewField(f, existingKeys));
  for (const field of addedFields) existingKeys.add(field.key);

  const inserted = insertLines(current.messageTemplate, addition.newLines ?? [], {
    afterFieldKey: addition.insertAfterFieldKey,
    afterLine: addition.insertAfterLine,
  });

  const fields = insertFields(current.fields, addedFields, addition.insertAfterFieldKey);
  existingFieldsUnchanged(current.fields, fields);
  templateWithoutInsertedBlock(current.messageTemplate, inserted.template, inserted.insertedBlock);

  if (addedFields.length === 0 && inserted.addedLines.length === 0) {
    throw new FunctionPatchError("A IA não devolveu nenhum campo ou linha para acrescentar.");
  }

  return {
    fields,
    messageTemplate: inserted.template,
    addedFields,
    addedLines: inserted.addedLines,
    insertAfterLabel: inserted.insertAfterLabel,
    fieldUpdates: [],
    lineReplacements: [],
    deletedLines: [],
  };
}

function applyFieldUpdates(
  fields: CustomNotificationField[],
  updates: CustomFunctionFieldUpdate[] | undefined
): { fields: CustomNotificationField[]; fieldUpdates: MergePreview["fieldUpdates"] } {
  if (!updates?.length) return { fields: fields.map(cloneField), fieldUpdates: [] };

  const byKey = new Map(updates.map((u) => [u.key, u]));
  const fieldUpdates: MergePreview["fieldUpdates"] = [];
  const next = fields.map((field) => {
    const patch = byKey.get(field.key);
    if (!patch) return cloneField(field);
    const after = cloneField(field);
    if (typeof patch.label === "string" && patch.label.trim()) after.label = patch.label.trim();
    if (patch.description !== undefined) {
      const text = typeof patch.description === "string" ? patch.description.trim() : "";
      if (text) after.description = text;
      else delete after.description;
    }
    if (typeof patch.required === "boolean") after.required = patch.required;
    if (patch.valueType && VALUE_TYPES.includes(patch.valueType)) after.valueType = patch.valueType;
    if (fieldSnapshot(field) !== fieldSnapshot(after)) {
      fieldUpdates.push({ key: field.key, before: cloneField(field), after });
    }
    return after;
  });

  for (const patch of updates) {
    if (!fields.some((f) => f.key === patch.key)) {
      throw new FunctionPatchError(`A IA tentou alterar o campo "${patch.key}", que não existe nesta função.`);
    }
  }

  return { fields: next, fieldUpdates };
}

function applyLineReplacements(
  lines: string[],
  replacements: CustomFunctionLineReplacement[] | undefined
): { lines: string[]; applied: CustomFunctionLineReplacement[] } {
  if (!replacements?.length) return { lines, applied: [] };
  const next = [...lines];
  const applied: CustomFunctionLineReplacement[] = [];
  for (const replacement of replacements) {
    const from = replacement.from ?? "";
    const to = replacement.to ?? "";
    if (!from || from === to) continue;
    const matches = next
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line === from || line.trim() === from.trim());
    if (matches.length === 0) {
      throw new FunctionPatchError(`Não encontrei a linha a alterar: "${from.trim()}".`);
    }
    if (matches.length > 1) {
      throw new FunctionPatchError(`A linha a alterar aparece mais de uma vez. Seja mais específico: "${from.trim()}".`);
    }
    next[matches[0].index] = to;
    applied.push({ from: matches[0].line, to });
  }
  return { lines: next, applied };
}

function applyLineDeletions(lines: string[], deletions: string[] | undefined): { lines: string[]; deleted: string[] } {
  if (!deletions?.length) return { lines, deleted: [] };
  const next = [...lines];
  const deleted: string[] = [];
  for (const raw of deletions) {
    const target = raw?.trim();
    if (!target) continue;
    const matches = next
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line === raw || line.trim() === target);
    if (matches.length === 0) {
      throw new FunctionPatchError(`Não encontrei a linha a remover: "${target}".`);
    }
    if (matches.length > 1) {
      throw new FunctionPatchError(`A linha a remover aparece mais de uma vez: "${target}".`);
    }
    deleted.push(matches[0].line);
    next.splice(matches[0].index, 1);
  }
  return { lines: next, deleted };
}

export function applyEditPatch(current: FunctionContent, patch: CustomFunctionEditPatch): MergePreview {
  const updated = applyFieldUpdates(current.fields, patch.fieldUpdates);
  const existingKeys = new Set(updated.fields.map((f) => f.key));
  const addedFields = (patch.newFields ?? []).map((f) => sanitizeNewField(f, existingKeys));
  for (const field of addedFields) existingKeys.add(field.key);

  let insertAfterKey = patch.lineInsertions?.find((i) => i.afterFieldKey)?.afterFieldKey ?? null;
  if (!insertAfterKey && addedFields.length > 0) {
    insertAfterKey = current.fields.at(-1)?.key ?? null;
  }
  const fields = insertFields(updated.fields, addedFields, insertAfterKey);
  const touchedKeys = new Set((patch.fieldUpdates ?? []).map((u) => u.key));
  assertUntouchedFieldsPreserved(current.fields, fields, touchedKeys, addedFields.map((f) => f.key));

  let lines = splitTemplateLines(current.messageTemplate);
  const replaced = applyLineReplacements(lines, patch.lineReplacements);
  lines = replaced.lines;
  const removed = applyLineDeletions(lines, patch.lineDeletions);
  lines = removed.lines;

  const addedLines: string[] = [];
  let insertAfterLabel = "";
  for (const insertion of patch.lineInsertions ?? []) {
    const block = normalizeNewLines(insertion.lines);
    if (block.length === 0) continue;
    const { index, label } = findInsertAfterIndex(lines, insertion);
    lines = [...lines.slice(0, index + 1), ...block, ...lines.slice(index + 1)];
    addedLines.push(...block);
    if (!insertAfterLabel) insertAfterLabel = label;
  }

  const messageTemplate = joinTemplateLines(lines);
  assertUnchangedTemplatePreserved(current.messageTemplate, messageTemplate, {
    replaced: replaced.applied,
    deleted: removed.deleted,
    addedLines,
  });

  if (
    addedFields.length === 0 &&
    updated.fieldUpdates.length === 0 &&
    replaced.applied.length === 0 &&
    removed.deleted.length === 0 &&
    addedLines.length === 0
  ) {
    throw new FunctionPatchError("A IA não devolveu nenhuma alteração para aplicar.");
  }

  return {
    fields,
    messageTemplate,
    addedFields,
    addedLines,
    insertAfterLabel,
    fieldUpdates: updated.fieldUpdates,
    lineReplacements: replaced.applied,
    deletedLines: removed.deleted,
  };
}

function assertUntouchedFieldsPreserved(
  before: CustomNotificationField[],
  after: CustomNotificationField[],
  touchedKeys: Set<string>,
  addedKeys: string[]
) {
  const added = new Set(addedKeys);
  const afterUntouched = after.filter((f) => !touchedKeys.has(f.key) && !added.has(f.key));
  const beforeUntouched = before.filter((f) => !touchedKeys.has(f.key));
  if (afterUntouched.length !== beforeUntouched.length) {
    throw new FunctionPatchError("A lista de campos já existentes foi alterada além do que foi pedido.");
  }
  for (let i = 0; i < beforeUntouched.length; i += 1) {
    if (fieldSnapshot(beforeUntouched[i]) !== fieldSnapshot(afterUntouched[i])) {
      throw new FunctionPatchError(
        `O campo existente "${beforeUntouched[i].key}" foi alterado sem ter sido pedido.`
      );
    }
  }
}

function assertUnchangedTemplatePreserved(
  original: string,
  next: string,
  changes: { replaced: CustomFunctionLineReplacement[]; deleted: string[]; addedLines: string[] }
) {
  let reverted = splitTemplateLines(next);
  // Remove added blocks (each added line once, from the end, exact match).
  for (const line of [...changes.addedLines].reverse()) {
    const idx = lastIndexOf(reverted, line);
    if (idx < 0) {
      throw new FunctionPatchError("Não foi possível localizar uma linha acrescentada para validar o texto.");
    }
    reverted.splice(idx, 1);
  }
  // Reinsert deletions in their original relative order: after revert of add/replace, compare remaining to original minus deleted/replaced-from.
  const remainingDeleted = [...changes.deleted];
  const expected = splitTemplateLines(original).filter((line) => {
    const delIdx = remainingDeleted.findIndex((d) => d === line);
    if (delIdx >= 0) {
      remainingDeleted.splice(delIdx, 1);
      return false;
    }
    return true;
  });

  // Revert replacements on the remaining lines.
  const remainingReplacements = [...changes.replaced];
  reverted = reverted.map((line) => {
    const idx = remainingReplacements.findIndex((r) => r.to === line);
    if (idx < 0) return line;
    const from = remainingReplacements[idx].from;
    remainingReplacements.splice(idx, 1);
    return from;
  });

  if (joinTemplateLines(reverted) !== joinTemplateLines(expected) || remainingReplacements.length > 0) {
    throw new FunctionPatchError(
      "Linhas que não foram pedidas para alteração não foram preservadas byte a byte. A edição foi recusada."
    );
  }
}

function lastIndexOf(lines: string[], value: string): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i] === value) return i;
  }
  return -1;
}

export function isAdditionEmpty(addition: CustomFunctionAddition): boolean {
  return (addition.newFields?.length ?? 0) === 0 && normalizeNewLines(addition.newLines).length === 0;
}

export function isEditPatchEmpty(patch: CustomFunctionEditPatch): boolean {
  return (
    (patch.fieldUpdates?.length ?? 0) === 0 &&
    (patch.newFields?.length ?? 0) === 0 &&
    (patch.lineReplacements?.length ?? 0) === 0 &&
    (patch.lineInsertions?.length ?? 0) === 0 &&
    (patch.lineDeletions?.length ?? 0) === 0
  );
}
