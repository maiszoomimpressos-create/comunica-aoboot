/**
 * Mudança pedida pelo Neomar (15/11/2026) na função `corrida_mai_drive`
 * (conexão Confirmação de Compra): título em negrito acima do link de
 * tarifas, linha do app e dois botões de link. Usado pelo script de
 * aplicação (apply-corrida-mai-drive-botoes.ts) e pelo teste
 * (check-link-buttons.ts) — os dois leem daqui pra não divergirem.
 */
import type { CustomLinkButton } from "../src/lib/notifications/custom-link-buttons";

export const CONNECTION_ID = "cmsi3moty0001n4ujpeaa115e";
export const FUNCTION_KEY = "corrida_mai_drive";
export const APP_DOWNLOAD_URL = "https://maidrive.com.br/baixar/passageiro";

/** Linha atual (última do template) que é substituída. */
export const OLD_LINK_LINE = "🔗 Entenda nossas tarifas: {{link_tarifas}}";

/** `{{?link_tarifas}}` esconde o título quando o painel não manda o link. */
export const NEW_LINK_BLOCK = [
  "📊 *Entenda nossas tarifas e aprenda a economizar*{{?link_tarifas}}",
  "{{link_tarifas}}",
  "",
  `📲 *Baixe nosso app:* ${APP_DOWNLOAD_URL}`,
].join("\n");

/** Ordem: 1) tarifas (URL que vem do painel), 2) app (fixa). */
export const LINK_BUTTONS: CustomLinkButton[] = [
  { label: "Entenda nossas tarifas", urlField: "link_tarifas" },
  { label: "Baixe nosso app", url: APP_DOWNLOAD_URL },
];

/** Template como estava no banco em 15/11/2026 00:10 (lido, não alterado). */
export const CURRENT_TEMPLATE_SNAPSHOT = [
  "Sua corrida com a *{{nome_empresa}}* foi concluída! Obrigado por viajar com a gente. 🚗",
  "",
  "🕒 *Horário:*",
  "🕒 *Início:* {{inicio}}",
  "🏁 *Fim:* {{fim}}",
  "📍 *Distância:* {{distancia}}",
  "⏱️ *Duração:* {{duracao}}",
  "🟢 *Origem:* {{origem}}",
  "🔴 *Destino:* {{destino}}",
  "💲 *Tarifa:* {{tarifa}}",
  "⏸️ *Tempo parado:* {{hora_parada}}",
  "👤 *Motorista:* {{motorista}}",
  "",
  "🧾 *Valor da corrida:* {{valor_corrida}}",
  "➕ *Taxa de pagamento:* {{taxa_pagamento}}",
  "💰 *Valor total: {{valor_total}}*",
  "💳 *Pagamento:* {{forma_pagamento}}",
  "💵 *Pago com saldo:* {{pago_com_saldo}}",
  "💼 *Saldo restante:* {{saldo_restante}}",
  "",
  OLD_LINK_LINE,
].join("\n");

/** Troca só a linha do link; devolve null se ela não estiver lá exatamente uma vez. */
export function transformTemplate(template: string): string | null {
  const normalized = template.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const hits = lines.filter((line) => line.trim() === OLD_LINK_LINE).length;
  if (hits !== 1) return null;
  return lines.map((line) => (line.trim() === OLD_LINK_LINE ? NEW_LINK_BLOCK : line)).join("\n");
}
