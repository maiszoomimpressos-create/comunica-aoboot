/**
 * Testes do merge/validação de acréscimo e edição por trecho.
 * Rode com: node scripts/run-ts.mjs scripts/check-custom-function-patch.ts
 */
import {
  applyEditPatch,
  fieldSnapshot,
  FunctionPatchError,
  mergeAddition,
  type FunctionContent,
} from "@/lib/notifications/custom-function-patch";
import {
  encodeStoredCustomFields,
  parseStoredCustomFields,
  type CustomNotificationField,
} from "@/repositories/custom-notification-type.repository";

const current: FunctionContent = {
  fields: [
    { key: "valor_total", label: "Valor total", required: true, valueType: "moeda" },
    { key: "forma_pagamento", label: "Pagamento", required: true, valueType: "texto" },
    { key: "origem", label: "Origem", required: true, valueType: "texto" },
  ],
  messageTemplate: [
    "Sua corrida foi concluída.",
    "",
    "💰 *Valor total:* {{valor_total}}",
    "💳 *Pagamento:* {{forma_pagamento}}",
    "📍 *Origem:* {{origem}}",
    "",
    "Obrigado por viajar com a {{nome_empresa}}.",
  ].join("\n"),
};

let failed = 0;

function assert(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function existingUnchanged(before: FunctionContent, afterFields: CustomNotificationField[]) {
  const afterByKey = new Map(afterFields.map((f) => [f.key, f]));
  return before.fields.every((f) => afterByKey.has(f.key) && fieldSnapshot(f) === fieldSnapshot(afterByKey.get(f.key)!));
}

{
  const preview = mergeAddition(current, {
    newFields: [
      { key: "saldo_restante", label: "Saldo restante", required: false, valueType: "moeda" },
    ],
    newLines: ["💼 *Saldo restante:* {{saldo_restante}}"],
    insertAfterFieldKey: "forma_pagamento",
  });
  assert("add inserts the new line after Pagamento", preview.addedLines.length === 1 && preview.messageTemplate.includes("💳 *Pagamento:* {{forma_pagamento}}\n💼 *Saldo restante:* {{saldo_restante}}\n📍 *Origem:* {{origem}}"));
  assert("add preserves existing fields byte-for-byte", existingUnchanged(current, preview.fields));
  assert("add keeps existing field order around the new one", preview.fields.map((f) => f.key).join(",") === "valor_total,forma_pagamento,saldo_restante,origem");
  const without = preview.messageTemplate.replace("\n💼 *Saldo restante:* {{saldo_restante}}", "");
  assert("add can be peeled back to the original template", without === current.messageTemplate);
}

{
  let threw = false;
  try {
    mergeAddition(current, {
      newFields: [{ key: "forma_pagamento", label: "Forma", required: false, valueType: "texto" }],
      newLines: ["x"],
      insertAfterFieldKey: "origem",
    });
  } catch (error) {
    threw = error instanceof FunctionPatchError;
  }
  assert("add rejects a field that already exists", threw);
}

{
  const preview = applyEditPatch(current, {
    fieldUpdates: [{ key: "forma_pagamento", label: "Forma de pagamento" }],
    lineReplacements: [
      { from: "💳 *Pagamento:* {{forma_pagamento}}", to: "💳 *Forma de pagamento:* {{forma_pagamento}}" },
    ],
  });
  assert("edit updates only the requested field label", preview.fields.find((f) => f.key === "forma_pagamento")?.label === "Forma de pagamento");
  assert("edit leaves other fields identical", existingUnchanged(
    { ...current, fields: current.fields.filter((f) => f.key !== "forma_pagamento") },
    preview.fields.filter((f) => f.key !== "forma_pagamento")
  ));
  assert("edit changes only the indicated line", preview.messageTemplate.includes("💳 *Forma de pagamento:* {{forma_pagamento}}") && preview.messageTemplate.includes("💰 *Valor total:* {{valor_total}}") && preview.messageTemplate.includes("📍 *Origem:* {{origem}}"));
  assert("edit does not rewrite the rest of the template", preview.lineReplacements.length === 1);
}

{
  let threw = false;
  try {
    applyEditPatch(current, {
      lineReplacements: [
        { from: "💳 *Pagamento:* {{forma_pagamento}}", to: "💳 *Pagamento:* {{forma_pagamento}}" },
      ],
      // sneak rewrite of an untouched line by also replacing a different from that doesn't match? 
      // Instead simulate a patch that would fail validation if someone passed a fully rewritten template — applyEdit only applies listed ops.
    });
  } catch (error) {
    threw = error instanceof FunctionPatchError;
  }
  assert("edit with no real change is rejected", threw);
}

{
  let threw = false;
  try {
    applyEditPatch(current, {
      lineReplacements: [{ from: "linha que não existe", to: "x" }],
    });
  } catch (error) {
    threw = error instanceof FunctionPatchError;
  }
  assert("edit rejects a replacement that does not match any line", threw);
}

{
  const encodedLegacy = encodeStoredCustomFields(current.fields);
  const parsedLegacy = parseStoredCustomFields(encodedLegacy);
  assert("legacy array encode stays an array (no history key)", Array.isArray(encodedLegacy) && parsedLegacy.history.length === 0 && parsedLegacy.aiDescription === null);

  const encodedWithAi = encodeStoredCustomFields(current.fields, "crie a confirmação da corrida");
  const parsedAi = parseStoredCustomFields(encodedWithAi);
  assert("aiDescription-only encode has no history key", !Array.isArray(encodedWithAi) && parsedAi.aiDescription === "crie a confirmação da corrida" && parsedAi.history.length === 0 && !("history" in (encodedWithAi as object)));

  const encodedWithHistory = encodeStoredCustomFields(current.fields, "crie a confirmação da corrida", [
    { type: "adicionar", prompt: "incluir saldo restante", createdAt: "2026-11-11T16:00:00.000Z" },
  ]);
  const parsedHist = parseStoredCustomFields(encodedWithHistory);
  assert("history round-trips in the existing fields JSON", parsedHist.history.length === 1 && parsedHist.history[0].prompt === "incluir saldo restante" && parsedHist.aiDescription === "crie a confirmação da corrida");
}

if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam.`);
  process.exit(1);
}
console.log("\ntodos os testes de patch/histórico passaram.");
