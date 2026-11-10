import {
  buildCustomMessagePreview,
  buildExampleApiPayload,
  buildSampleDetails,
  inferValueType,
  insertAtCursor,
  moveItem,
  renderCustomMessageTemplate,
  SAMPLE_BUSINESS_NAME,
} from "../src/lib/notifications/custom-message";

const fields = [
  { key: "valor", label: "Valor", required: true, valueType: "moeda" as const },
  { key: "origem", label: "Origem", required: true, valueType: "texto" as const },
  { key: "destino", label: "Destino", required: false, valueType: "texto" as const },
];

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(inferValueType("valor_total", "Valor") === "moeda", "infer moeda");
assert(inferValueType("horario", "Horario") === "data_hora", "infer data_hora");

const details = buildSampleDetails(fields);
assert(details.valor === "R$ 42,90", "sample currency");
assert(details.origem === "Centro", "sample origem");
assert(details.destino === "Aeroporto", "sample destino");

const template = "Obrigado por escolher a {{nome_empresa}}.\nValor: {{valor}}\nDe {{origem}} para {{destino}}.";
const full = renderCustomMessageTemplate(template, fields, details, SAMPLE_BUSINESS_NAME);
assert(full.includes("Loja Exemplo"), "business name reserved placeholder");
assert(full.includes("R$ 42,90"), "rendered currency");
assert(full.includes("Aeroporto"), "optional present");

const withoutOptional = renderCustomMessageTemplate(template, fields, { ...details, destino: "" }, SAMPLE_BUSINESS_NAME);
assert(!withoutOptional.includes("para"), "optional line dropped");
assert(withoutOptional.includes("R$ 42,90"), "required line kept");

const preview = buildCustomMessagePreview({
  messageTemplate: template,
  fields,
  details,
  businessName: SAMPLE_BUSINESS_NAME,
  greetingStyle: "FIXO",
  greetingNameSource: "CADASTRO",
  whatsappName: "Ana",
  recipientName: "Maria Silva",
});
assert(preview.startsWith("Ola, *Maria Silva*!") || preview.startsWith("Olá, *Maria Silva*!"), "greeting uses cadastro name: " + preview.split("\n")[0]);
assert(preview.includes("Loja Exemplo"), "preview body");

const payload = buildExampleApiPayload({ typeKey: "corrida_concluida_teste", fields, requiresQr: false, details });
assert(payload.type === "corrida_concluida_teste", "payload type");
assert(payload.recipientName, "payload recipient");
assert((payload.details as { valor: string }).valor === "R$ 42,90", "payload details");
assert(!("qrData" in payload), "no qr when not required");

const withQr = buildExampleApiPayload({ typeKey: "ingresso", fields, requiresQr: true });
assert("qrData" in withQr, "qr present when required");

const inserted = insertAtCursor("Ola {{nome}}", 4, 4, " ");
assert(inserted.text === "Ola  {{nome}}" && inserted.cursor === 5, "insert at cursor");

const moved = moveItem(["a", "b", "c"], 2, -1);
assert(moved.join(",") === "a,c,b", "reorder");

console.log("check-custom-message: ok");