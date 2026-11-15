/**
 * Prévia + testes dos botões de link (sem enviar nada, sem banco).
 * Rode com: node scripts/run-ts.mjs scripts/check-link-buttons.ts
 */
import { buildCustomMessagePreview, renderCustomMessageTemplate, templateReferencedKeys } from "../src/lib/notifications/custom-message";
import { parseCustomLinkButtons, resolveLinkButtons } from "../src/lib/notifications/custom-link-buttons";
import { ZApiProvider, buildLinkButtonsBody } from "../src/lib/whatsapp/providers/z-api.provider";
import { sendTextWithLinkButtons } from "../src/lib/whatsapp/send-with-link-buttons";
import { encodeStoredCustomFields, parseStoredCustomFields } from "../src/repositories/custom-notification-type.repository";
import type { CustomNotificationField } from "../src/lib/notifications/custom-message";
import {
  APP_DOWNLOAD_URL,
  CURRENT_TEMPLATE_SNAPSHOT,
  LINK_BUTTONS,
  transformTemplate,
} from "./corrida-mai-drive-botoes.config";

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FALHOU: ${msg}`);
  }
}

const opt = (key: string, label: string, valueType: CustomNotificationField["valueType"]): CustomNotificationField => ({
  key, label, required: false, valueType,
});
const fields: CustomNotificationField[] = [
  opt("horario", "Horário", "data_hora"),
  opt("inicio", "Início", "data_hora"),
  opt("fim", "Fim", "data_hora"),
  { key: "distancia", label: "Distância percorrida", required: true, valueType: "numero" },
  opt("duracao", "Duração", "texto"),
  opt("origem", "Origem", "texto"),
  opt("destino", "Destino", "texto"),
  opt("tarifa", "Tarifa aplicada", "texto"),
  opt("hora_parada", "Tempo parado", "texto"),
  opt("motorista", "Motorista", "texto"),
  opt("valor_corrida", "Valor da corrida", "moeda"),
  opt("taxa_pagamento", "Taxa da forma de pagamento", "moeda"),
  { key: "valor_total", label: "Valor total", required: true, valueType: "moeda" },
  opt("forma_pagamento", "Forma de pagamento", "texto"),
  opt("pago_com_saldo", "Pago com saldo", "moeda"),
  opt("saldo_restante", "Saldo restante", "moeda"),
  opt("link_tarifas", "Link das tarifas", "texto"),
];

// Dados fictícios.
const details: Record<string, string> = {
  inicio: "15/11/2026 08:12",
  fim: "15/11/2026 08:31",
  distancia: "6,4 km",
  duracao: "19 min",
  origem: "Rua das Flores, 120 - Centro",
  destino: "Rodoviária",
  tarifa: "Bandeira 1",
  hora_parada: "3 min",
  motorista: "João Exemplo",
  valor_corrida: "R$ 18,40",
  taxa_pagamento: "R$ 0,60",
  valor_total: "R$ 19,00",
  forma_pagamento: "Pix",
  link_tarifas: "https://maidrive.com.br/tarifas/abc123",
};

const newTemplate = transformTemplate(CURRENT_TEMPLATE_SNAPSHOT);
check(newTemplate !== null, "transformTemplate acha a linha do link");
const template = newTemplate ?? "";
check(templateReferencedKeys(template).includes("link_tarifas"), "marcador conta como campo usado");
check(transformTemplate(template) === null, "não aplica duas vezes");

const message = buildCustomMessagePreview({
  messageTemplate: template,
  fields,
  details,
  businessName: "MAI Drive",
  greetingStyle: "HORARIO",
  greetingNameSource: "CADASTRO",
  whatsappName: null,
  recipientName: "Maria Passageira",
});
const buttons = resolveLinkButtons(parseCustomLinkButtons(LINK_BUTTONS), details);

console.log("===== MENSAGEM FINAL (com link de tarifas) =====");
console.log(message);
console.log("\n===== JSON send-button-actions (sem token; vai pra POST <URL da instância>/send-button-actions) =====");
console.log(JSON.stringify(buildLinkButtonsBody("5546999990000", message, buttons), null, 2));

check(message.includes("📊 *Entenda nossas tarifas e aprenda a economizar*\nhttps://maidrive.com.br/tarifas/abc123"), "título logo acima do link");
check(!message.includes("{{"), "nenhum placeholder sobrando");
check(message.includes(`📲 *Baixe nosso app:* ${APP_DOWNLOAD_URL}`), "linha do app no texto");
check(message.includes("💰 *Valor total: R$ 19,00*") && message.includes("🧾 *Valor da corrida:* R$ 18,40"), "valores intactos");
check(buttons.length === 2 && buttons[0].label === "Entenda nossas tarifas" && buttons[0].url === details.link_tarifas, "botão 1 tarifas");
check(buttons[1]?.label === "Baixe nosso app" && buttons[1]?.url === APP_DOWNLOAD_URL && buttons[1]?.id === "2", "botão 2 app");

// Sem link de tarifas: título some, só botão do app.
const noLink = { ...details, link_tarifas: "não informado" };
const bodyNoLink = renderCustomMessageTemplate(template, fields, noLink, "MAI Drive");
const buttonsNoLink = resolveLinkButtons(LINK_BUTTONS, noLink);
console.log("\n===== SEM link de tarifas (só o corpo) =====");
console.log(bodyNoLink);
console.log(JSON.stringify(buttonsNoLink));
check(!bodyNoLink.includes("Entenda nossas tarifas"), "sem link: título some");
check(bodyNoLink.endsWith(`📲 *Baixe nosso app:* ${APP_DOWNLOAD_URL}`), "sem link: app continua");
check(!/\n\n\n/.test(bodyNoLink), "sem link: sem linhas em branco duplas");
check(buttonsNoLink.length === 1 && buttonsNoLink[0].id === "1" && buttonsNoLink[0].url === APP_DOWNLOAD_URL, "sem link: só botão do app");
check(resolveLinkButtons(LINK_BUTTONS, { link_tarifas: "javascript:alert(1)" }).length === 1, "URL inválida ignorada");
check(parseCustomLinkButtons([{ label: "x" }, { label: "y", url: "ftp://a" }, "lixo"]).length === 0, "parse descarta inválidos");

// Persistência no JSON `fields` sem migration.
const stored = encodeStoredCustomFields(fields, null, [{ type: "editar", prompt: "p", createdAt: "2026-11-15T02:51:30.918Z" }], LINK_BUTTONS);
const parsed = parseStoredCustomFields(stored);
check(parsed.linkButtons.length === 2 && parsed.history.length === 1 && parsed.fields.length === fields.length, "encode/parse preserva botões e histórico");
check(parseStoredCustomFields(fields).linkButtons.length === 0, "legado sem botões");

// Envio com fetch falso (nada sai da máquina).
type Call = { url: string; body: Record<string, unknown> };
async function simulate(mode: "ok" | "http400" | "timeout" | "network") {
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    if (url.endsWith("/send-button-actions")) {
      if (mode === "timeout") {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      if (mode === "network") throw new TypeError("fetch failed");
      if (mode === "http400") return new Response(JSON.stringify({ error: "buttons not allowed" }), { status: 400 });
    }
    return new Response(JSON.stringify({ zaapId: "z", messageId: "m", id: "m" }), { status: 200 });
  }) as typeof fetch;
  try {
    const config = { apiUrl: "https://api.z-api.io/instances/INSTANCIA/token/TOKEN", apiToken: "", phoneNumber: "" };
    const result = await sendTextWithLinkButtons(new ZApiProvider(), config, "5546999990000", message, buttons);
    return { result, calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const ok = await simulate("ok");
check(ok.result.ok && ok.result.via === "buttons" && ok.calls.length === 1, "200: só send-button-actions");
check(ok.calls[0].url.endsWith("/send-button-actions") && JSON.stringify(ok.calls[0].body) === JSON.stringify(buildLinkButtonsBody("5546999990000", message, buttons)), "200: body igual ao da prévia");
const refused = await simulate("http400");
check(refused.result.ok && refused.result.via === "text_fallback" && refused.calls.length === 2, "400: cai pra send-text");
check(refused.calls[1].url.endsWith("/send-text") && refused.calls[1].body.message === message, "400: send-text com a mesma mensagem");
const timeout = await simulate("timeout");
check(!timeout.result.ok && timeout.calls.length === 1, "timeout: não reenvia (evita duplicar)");
const network = await simulate("network");
check(!network.result.ok && network.calls.length === 1, "conexão caída: não reenvia (evita duplicar)");

console.log(`\n${failures === 0 ? "OK" : `${failures} falha(s)`}: check-link-buttons`);
if (failures > 0) process.exit(1);
