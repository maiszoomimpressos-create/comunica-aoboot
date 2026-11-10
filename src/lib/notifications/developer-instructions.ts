import {
  apiExampleValueForField,
  fieldFormatHint,
  fieldLooksLikeLink,
  FIELD_VALUE_TYPE_LABELS,
  inferValueType,
  normalizeValueType,
  SAMPLE_RECIPIENT_NAME,
  type CustomNotificationField,
} from "@/lib/notifications/custom-message";

export { fieldFormatHint } from "@/lib/notifications/custom-message";

export const PURCHASE_CONFIRMATION_PATH = "/api/v1/whatsapp/purchase-confirmation";
export const API_KEY_PLACEHOLDER = "<chave da conexão>";

/** Base pública da API: `NEXT_PUBLIC_APP_URL`, com fallback para a origem atual no navegador. */
export function getPublicAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function purchaseConfirmationEndpoint(baseUrl?: string): string {
  const base = (baseUrl ?? getPublicAppBaseUrl()).replace(/\/+$/, "");
  return `${base}${PURCHASE_CONFIRMATION_PATH}`;
}

export function isFieldRequired(field: CustomNotificationField): boolean {
  return field.required !== false;
}

export function resolveFieldType(field: CustomNotificationField): string {
  if (fieldLooksLikeLink(field)) return "link (URL)";
  const type = field.valueType ? normalizeValueType(field.valueType) : inferValueType(field.key, field.label);
  return FIELD_VALUE_TYPE_LABELS[type] ?? type;
}

export function buildApiExampleDetails(fields: CustomNotificationField[]): Record<string, string> {
  const details: Record<string, string> = {};
  for (const field of fields) {
    if (!field.key.trim()) continue;
    details[field.key] = apiExampleValueForField(field);
  }
  return details;
}

export function buildDeveloperExamplePayload(input: {
  typeKey: string;
  fields: CustomNotificationField[];
  requiresQr: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    to: "5511999999999",
    type: input.typeKey.trim() || "identificador_da_funcao",
    recipientName: SAMPLE_RECIPIENT_NAME,
    details: buildApiExampleDetails(input.fields),
  };
  if (input.requiresQr) {
    payload.qrData = "<codigo que vira QR>";
  }
  return payload;
}

export function buildDeveloperCurlExample(endpoint: string, payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return [
    `curl -X POST "${endpoint}" \\`,
    `  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${json}'`,
  ].join("\n");
}

export function buildDeveloperInstructionsMarkdown(input: {
  typeKey: string;
  typeLabel?: string;
  fields: CustomNotificationField[];
  requiresQr: boolean;
  baseUrl?: string;
}): string {
  const typeKey = input.typeKey.trim() || "identificador_da_funcao";
  const title = input.typeLabel?.trim() ? `${input.typeLabel} (\`${typeKey}\`)` : `\`${typeKey}\``;
  const endpoint = purchaseConfirmationEndpoint(input.baseUrl);
  const payload = buildDeveloperExamplePayload({
    typeKey,
    fields: input.fields,
    requiresQr: input.requiresQr,
  });
  const payloadJson = JSON.stringify(payload, null, 2);
  const curl = buildDeveloperCurlExample(endpoint, payload);
  const fieldRows = input.fields
    .filter((field) => field.key.trim())
    .map((field) => {
      const required = isFieldRequired(field) ? "obrigatório" : "opcional";
      return `- \`${field.key}\` — ${field.label || field.key} · tipo: ${resolveFieldType(field)} · ${required}. ${fieldFormatHint(field)}`;
    })
    .join("\n");

  const qrLine = input.requiresQr
    ? `\nEsta função exige \`qrData\` (texto que vira o QR code na mensagem). Sem esse campo a API responde 422.\n`
    : "";

  return `# Instruções para o desenvolvedor — ${title}

Como o sistema de fora chama esta função no WhatsApp. A mensagem é montada no MAIS ZAP a partir do modelo salvo; o sistema cliente só envia os dados.

## Endpoint

\`POST ${endpoint}\`

## Autenticação

Header:

\`Authorization: Bearer ${API_KEY_PLACEHOLDER}\`

A chave é gerada no card da conexão, na seção **Chave de API**. O texto puro aparece **somente uma vez**, no momento de criar a chave — guarde em um lugar seguro. Se perder, gere outra (a anterior deixa de valer). Esta página nunca exibe a chave real.

## Corpo da requisição

- \`to\` (obrigatório): número de destino só com dígitos, DDI + DDD + número. Ex.: \`5511999999999\`.
- \`type\` (obrigatório para esta função): o identificador técnico \`${typeKey}\`. Use exatamente este valor.
- \`recipientName\` (obrigatório): nome de quem vai receber, enviado pelo sistema cliente (ex.: nome do passageiro). A saudação no WhatsApp usa o primeiro nome, com esta ordem: nome enviado aqui (ou um campo como \`nome_passageiro\`), depois o perfil do WhatsApp, se disponível.
- \`details\`: objeto com os campos desta função.
${input.requiresQr ? "- `qrData` (obrigatório nesta função): conteúdo que será transformado em QR code.\n" : ""}${qrLine}
### Campos em \`details\`

${fieldRows || "- (nenhum campo configurado ainda)"}

O link (quando houver um campo com “link” no identificador ou no rótulo) é devolvido pelo sistema de fora — não é buscado pelo MAIS ZAP. Basta enviar a URL completa nesse campo.

## Exemplo de payload

\`\`\`json
${payloadJson}
\`\`\`

## Exemplo curl

\`\`\`bash
${curl}
\`\`\`

## Respostas da API

Todas no formato \`{ "success": true, "data": ... }\` ou \`{ "success": false, "error": { "code", "message", "details?" } }\`.

- **200** — enviado. \`data\` segue o resultado do provedor, em geral \`{ "ok": true, "message": "..." }\`.
- **401 \`UNAUTHORIZED\`** — chave ausente (\`Authorization: Bearer ...\`) ou inválida (“Chave de API inválida.”).
- **403 \`FORBIDDEN\`** — esta função não está habilitada nesta conexão.
- **409 \`CONFLICT\`** — conexão desconectada (“Esta conexão não está ativa no momento.”) ou ainda não configurada.
- **422 \`VALIDATION_ERROR\`** — corpo inválido (Zod), tipo desconhecido, campos obrigatórios faltando em \`details\`, \`qrData\` ausente quando exigido, ou número em formato inválido. Não há resposta 400 neste endpoint; validação retorna 422.
- **500 \`INTERNAL_ERROR\`** — erro inesperado no servidor.

Nada neste documento contém a chave real da conexão.
`;
}
