import { isHttpUrl } from "./custom-link-buttons";
import type { LinkButtonAction } from "@/lib/whatsapp/types";

/**
 * Blocos da mensagem de uma função personalizada (Texto, Imagem, Botões),
 * guardados dentro do JSON `fields` já existente (`messageBlocks`) — sem
 * migration. Função sem `messageBlocks` continua no caminho antigo, sem
 * nenhuma mudança (texto + `linkButtons`).
 *
 * - Texto sem `text` = o texto principal da função (saudação + modelo).
 *   Texto com `text` = um texto extra, aceita {{campo}} e {{?campo}}.
 * - Imagem: `url` fixa (enviada do computador ou colada) ou `urlField`
 *   (link que o sistema de fora manda em cada envio). Se as duas vierem,
 *   o campo ganha quando vier preenchido.
 * - Botões: usa os `linkButtons` da função (mesmo formato de antes).
 *
 * Como o WhatsApp monta os balões (planMessageDeliveries):
 * - imagem + texto + botões chegam num balão só quando a imagem vem antes
 *   do texto; os botões ficam sempre no fim do balão;
 * - uma imagem depois de um texto abre outro balão (outra mensagem);
 * - legenda de imagem tem limite de 1024 caracteres — texto maior vai em
 *   mensagem separada.
 */

export type MessageBlockType = "texto" | "imagem" | "botoes";

export interface TextMessageBlock {
  id: string;
  type: "texto";
  /** Ausente = texto principal da função. */
  text?: string;
}

export interface ImageMessageBlock {
  id: string;
  type: "imagem";
  url?: string;
  urlField?: string;
}

export interface ButtonsMessageBlock {
  id: string;
  type: "botoes";
}

export type MessageBlock = TextMessageBlock | ImageMessageBlock | ButtonsMessageBlock;

export const MAX_MESSAGE_BLOCKS = 6;
export const MAX_IMAGE_BLOCKS = 3;
export const MAX_EXTRA_TEXT_LENGTH = 2000;
/** WhatsApp corta legendas de imagem acima disso. */
export const MAX_IMAGE_CAPTION_LENGTH = 1024;

export const MESSAGE_BLOCK_LABELS: Record<MessageBlockType, string> = {
  texto: "Texto",
  imagem: "Imagem",
  botoes: "Botões",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanId(value: unknown, index: number): string {
  return typeof value === "string" && /^[\w-]{1,40}$/.test(value) ? value : `b${index + 1}`;
}

/** Decodifica o que está gravado — nunca lança, descarta o que for inválido,
 * garante no máximo 1 texto principal e 1 bloco de botões. */
export function parseMessageBlocks(raw: unknown): MessageBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageBlock[] = [];
  const usedIds = new Set<string>();
  let hasMainText = false;
  let hasButtons = false;
  let images = 0;
  raw.forEach((item, index) => {
    if (!isRecord(item) || out.length >= MAX_MESSAGE_BLOCKS) return;
    let id = cleanId(item.id, index);
    while (usedIds.has(id)) id = `${id}x`;
    if (item.type === "texto") {
      if (typeof item.text === "string") {
        const text = item.text.replace(/\r\n?/g, "\n").slice(0, MAX_EXTRA_TEXT_LENGTH);
        if (!text.trim()) return;
        out.push({ id, type: "texto", text });
      } else {
        if (hasMainText) return;
        hasMainText = true;
        out.push({ id, type: "texto" });
      }
    } else if (item.type === "imagem") {
      if (images >= MAX_IMAGE_BLOCKS) return;
      const url = typeof item.url === "string" && isHttpUrl(item.url.trim()) ? item.url.trim() : "";
      const urlField = typeof item.urlField === "string" && /^\w+$/.test(item.urlField.trim()) ? item.urlField.trim() : "";
      if (!url && !urlField) return;
      images++;
      out.push({ id, type: "imagem", ...(url ? { url } : {}), ...(urlField ? { urlField } : {}) });
    } else if (item.type === "botoes") {
      if (hasButtons) return;
      hasButtons = true;
      out.push({ id, type: "botoes" });
    } else {
      return;
    }
    usedIds.add(id);
  });
  return out;
}

/** Problemas que impedem salvar (mensagens para o usuário comum). */
export function validateMessageBlocks(blocks: MessageBlock[], buttonCount: number): string[] {
  const errors: string[] = [];
  if (blocks.length === 0) errors.push("Adicione pelo menos um bloco.");
  if (blocks.length > MAX_MESSAGE_BLOCKS) errors.push(`Use no máximo ${MAX_MESSAGE_BLOCKS} blocos.`);
  if (!blocks.some((b) => b.type === "texto" && b.text === undefined)) {
    errors.push("O bloco \"Texto da função\" precisa continuar na mensagem.");
  }
  if (blocks.filter((b) => b.type === "imagem").length > MAX_IMAGE_BLOCKS) {
    errors.push(`Use no máximo ${MAX_IMAGE_BLOCKS} imagens.`);
  }
  if (blocks.some((b) => b.type === "botoes") && buttonCount === 0) {
    errors.push("O bloco Botões está sem nenhum botão. Adicione um botão ou remova o bloco.");
  }
  for (const block of blocks) {
    if (block.type === "imagem" && !block.url && !block.urlField) {
      errors.push("Tem uma imagem sem arquivo nem link.");
    }
  }
  return errors;
}

/** Blocos equivalentes a uma função antiga (sem `messageBlocks`). */
export function legacyEquivalentBlocks(hasLinkButtons: boolean): MessageBlock[] {
  return [
    { id: "texto", type: "texto" },
    ...(hasLinkButtons ? [{ id: "botoes", type: "botoes" } as const] : []),
  ];
}

/** Já com valores resolvidos para este envio. */
export type ResolvedMessageBlock =
  | { id: string; type: "texto"; text: string }
  | { id: string; type: "imagem"; image: string }
  | { id: string; type: "botoes"; buttons: LinkButtonAction[] };

export type MessageDeliveryKind = "text" | "image" | "buttons";

/** Uma mensagem (um balão) que vai sair. */
export interface MessageDelivery {
  kind: MessageDeliveryKind;
  text?: string;
  image?: string;
  buttons?: LinkButtonAction[];
  /** Ids dos blocos que caíram neste balão (prévia/diagnóstico). */
  blockIds: string[];
}

export interface MessageDeliveryPlan {
  deliveries: MessageDelivery[];
  warnings: string[];
}

interface Balloon {
  image?: string;
  texts: string[];
  buttons?: LinkButtonAction[];
  blockIds: string[];
}

function emptyBalloon(): Balloon {
  return { texts: [], blockIds: [] };
}

function balloonText(b: Balloon): string {
  return b.texts.join("\n\n").trim();
}

/**
 * Agrupa os blocos já resolvidos em balões, na ordem do usuário. Pura e
 * determinística — usada no envio de verdade e na prévia da tela.
 */
export function planMessageDeliveries(blocks: ResolvedMessageBlock[]): MessageDeliveryPlan {
  const warnings: string[] = [];
  const balloons: Balloon[] = [];
  let current = emptyBalloon();
  let pendingButtons: { buttons: LinkButtonAction[]; blockId: string } | null = null;

  const flush = () => {
    if (current.image || current.texts.length > 0) balloons.push(current);
    current = emptyBalloon();
  };

  for (const block of blocks) {
    if (block.type === "imagem") {
      if (!block.image) continue;
      // Imagem só abre o balão: se já tem algo nele, a imagem vai em outro.
      if (current.image || current.texts.length > 0 || current.buttons) flush();
      current.image = block.image;
      current.blockIds.push(block.id);
    } else if (block.type === "texto") {
      const text = block.text.trim();
      if (!text) continue;
      // Depois dos botões o balão está fechado (botão fica sempre no fim).
      if (current.buttons) flush();
      current.texts.push(text);
      current.blockIds.push(block.id);
      if (pendingButtons) {
        current.buttons = pendingButtons.buttons;
        current.blockIds.push(pendingButtons.blockId);
        pendingButtons = null;
      }
    } else if (block.type === "botoes") {
      if (block.buttons.length === 0) continue;
      if (current.texts.length > 0 && !current.buttons) {
        current.buttons = block.buttons;
        current.blockIds.push(block.id);
      } else {
        // Botão precisa de texto: espera o próximo texto.
        pendingButtons = { buttons: block.buttons, blockId: block.id };
      }
    }
  }
  flush();

  if (pendingButtons) {
    const target = [...balloons].reverse().find((b) => b.texts.length > 0 && !b.buttons);
    if (target) {
      target.buttons = pendingButtons.buttons;
      target.blockIds.push(pendingButtons.blockId);
      warnings.push("Os botões aparecem sempre no fim do balão com texto.");
    } else {
      warnings.push("Os botões precisam de um texto no mesmo balão e não serão enviados.");
    }
  }

  const deliveries: MessageDelivery[] = [];
  for (const b of balloons) {
    const text = balloonText(b);
    if (b.image && text.length > MAX_IMAGE_CAPTION_LENGTH) {
      // Legenda longa demais: imagem sozinha e texto (com botões) depois.
      deliveries.push({ kind: "image", image: b.image, blockIds: b.blockIds.slice(0, 1) });
      deliveries.push(
        b.buttons
          ? { kind: "buttons", text, buttons: b.buttons, blockIds: b.blockIds.slice(1) }
          : { kind: "text", text, blockIds: b.blockIds.slice(1) }
      );
      warnings.push(
        `O texto passou de ${MAX_IMAGE_CAPTION_LENGTH} caracteres, limite da legenda de imagem no WhatsApp; a imagem vai separada.`
      );
      continue;
    }
    if (b.buttons && text) {
      deliveries.push({ kind: "buttons", text, buttons: b.buttons, ...(b.image ? { image: b.image } : {}), blockIds: b.blockIds });
    } else if (b.image) {
      deliveries.push({ kind: "image", image: b.image, ...(text ? { text } : {}), blockIds: b.blockIds });
    } else if (text) {
      deliveries.push({ kind: "text", text, blockIds: b.blockIds });
    }
  }

  if (deliveries.length > 1) {
    warnings.unshift(`Vai chegar em ${deliveries.length} mensagens seguidas.`);
  }
  return { deliveries, warnings };
}

/** Corpo JSON que vai para a Z-API em cada mensagem (sem token: o token da
 * instância fica na URL, nunca no corpo). Usado pelos testes e diagnóstico. */
export function buildZApiRequest(to: string, delivery: MessageDelivery): { endpoint: string; body: Record<string, unknown> } {
  if (delivery.kind === "buttons") {
    return {
      endpoint: "send-button-actions",
      body: {
        phone: to,
        message: delivery.text ?? "",
        ...(delivery.image ? { image: delivery.image } : {}),
        buttonActions: (delivery.buttons ?? []).map((b) => ({ id: b.id, type: "URL", url: b.url, label: b.label })),
      },
    };
  }
  if (delivery.kind === "image") {
    return {
      endpoint: "send-image",
      body: { phone: to, image: delivery.image ?? "", ...(delivery.text ? { caption: delivery.text } : {}) },
    };
  }
  return { endpoint: "send-text", body: { phone: to, message: delivery.text ?? "" } };
}

export function newMessageBlockId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Resolve os blocos para um envio (ou para a prévia, com dados de exemplo).
 * `mainText` = saudação + modelo já renderizados (mesmo texto de antes). */
export function resolveMessageBlocks(input: {
  blocks: MessageBlock[];
  mainText: string;
  renderExtraText: (template: string) => string;
  readField: (key: string) => string;
  buttons: LinkButtonAction[];
}): ResolvedMessageBlock[] {
  const out: ResolvedMessageBlock[] = [];
  for (const block of input.blocks) {
    if (block.type === "texto") {
      const text = block.text === undefined ? input.mainText : input.renderExtraText(block.text);
      out.push({ id: block.id, type: "texto", text });
    } else if (block.type === "imagem") {
      const fromField = block.urlField ? input.readField(block.urlField).trim() : "";
      const image = fromField && isHttpUrl(fromField) ? fromField : block.url ?? "";
      if (image && isHttpUrl(image)) out.push({ id: block.id, type: "imagem", image });
    } else {
      out.push({ id: block.id, type: "botoes", buttons: input.buttons });
    }
  }
  return out;
}
