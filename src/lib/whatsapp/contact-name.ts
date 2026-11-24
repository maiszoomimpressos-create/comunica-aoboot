/**
 * De onde vem o nome de um contato e qual nome usar — puro (sem I/O),
 * compartilhado entre o provider da Z-API, a sincronização, o webhook e o
 * dispatcher de campanhas. Testado em tests/campaigns/contact-name.test.ts.
 *
 * Origens (Contact.nameSource):
 * - "agenda": nome salvo na agenda do WhatsApp do número conectado
 *   (campos `name`/`short` da Z-API) — o mais confiável;
 * - "perfil": nome que a própria pessoa colocou no WhatsApp dela
 *   (`vname`/`notify`) — pode ser apelido;
 * - "whatsapp": veio da Z-API sem dar pra saber qual dos dois (ex.
 *   `chatName` do webhook, que é a agenda quando existe e o perfil senão,
 *   ou contatos antigos sincronizados antes desta coluna existir);
 * - "csv": coluna de nome de um CSV importado;
 * - "manual": digitado no painel;
 * - "google": nome da empresa no Google (contato captado pela Places API).
 *
 * Regras: nome vindo de CSV ou digitado à mão NUNCA é sobrescrito; CSV
 * só preenche contato sem nome; o cadastro manual sempre vale (é quem
 * opera corrigindo); entre nomes da Z-API, agenda > whatsapp > perfil (um nome de
 * perfil não troca um de agenda).
 */

export type ContactNameSource = "agenda" | "perfil" | "whatsapp" | "csv" | "manual" | "google";

export const CONTACT_NAME_SOURCE_LABEL: Record<ContactNameSource, string> = {
  agenda: "agenda do WhatsApp",
  perfil: "perfil do WhatsApp",
  whatsapp: "WhatsApp",
  csv: "CSV importado",
  manual: "cadastro manual",
  google: "Google (nome da empresa)",
};

const RANK: Record<ContactNameSource, number> = {
  perfil: 1,
  whatsapp: 2,
  agenda: 3,
  csv: 10,
  manual: 10,
  // Nome da empresa no Google: é o que identifica o destinatário frio
  // ("Olá, Hotel Central"); a agenda/perfil do WhatsApp de um número
  // comercial costuma ser o nome de um atendente ou vazio. Não é trocado
  // pela Z-API; cadastro manual ainda vale por cima.
  google: 10,
};

export function isContactNameSource(value: unknown): value is ContactNameSource {
  return typeof value === "string" && value in RANK;
}

/** A Z-API devolve o telefone formatado ("+55 46 8821-2387") quando não há
 * nome — nome de verdade sempre tem alguma letra. */
export function isRealName(value: string): boolean {
  return !/^[+\d][\d\s\-()]*$/.test(value);
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  // Espaços invisíveis/duplicados que vêm de nomes de perfil.
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function firstReal(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value && isRealName(value)) return value.slice(0, 200);
  }
  return null;
}

export interface PickedContactName {
  name: string;
  source: ContactNameSource;
}

/** Nome de uma linha de /contacts, /contacts/{phone}, /chats ou
 * participante de grupo da Z-API: agenda (`name`, `short`) primeiro,
 * depois perfil (`vname`, `notify`). */
export function pickZapiContactName(row: Record<string, unknown>): PickedContactName | null {
  const agenda = firstReal(row.name, row.short);
  if (agenda) return { name: agenda, source: "agenda" };
  const perfil = firstReal(row.vname, row.notify);
  if (perfil) return { name: perfil, source: "perfil" };
  return null;
}

/** Nome de um ReceivedCallback (mensagem recebida): `chatName` é o nome
 * do chat no aparelho conectado (agenda quando salvo, senão o perfil).
 * `senderName` NÃO é usado — em produção ele veio com o nome da própria
 * conta conectada (ver maybeHandleInboundBotMessage). */
export function pickWebhookContactName(payload: Record<string, unknown>): PickedContactName | null {
  const name = firstReal(payload.chatName);
  return name ? { name, source: "whatsapp" } : null;
}

/** Decide se um nome novo deve substituir o atual. */
export function shouldReplaceContactName(
  current: { name: string | null; nameSource: string | null },
  incoming: PickedContactName
): boolean {
  const currentName = clean(current.name);
  if (!currentName) return true;
  if (currentName === incoming.name) return false;
  // Contato antigo sem origem registrada: trata como "whatsapp".
  const currentSource: ContactNameSource = isContactNameSource(current.nameSource) ? current.nameSource : "whatsapp";
  // Cadastro manual é intenção explícita de quem opera: sempre vale.
  if (incoming.source === "manual") return true;
  // Nome de CSV ou digitado à mão nunca é trocado pela Z-API nem por CSV.
  if (currentSource === "csv" || currentSource === "manual" || currentSource === "google") return false;
  // CSV só preenche quem está sem nome (o nome atual já foi tratado acima).
  if (incoming.source === "csv") return false;
  return RANK[incoming.source] >= RANK[currentSource];
}
