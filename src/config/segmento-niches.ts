import type { SegmentoNiche } from "@/generated/prisma/client";

/** Lista fixa de nichos de negócio pra Segmento — mesmos grupos que já
 * existiam implicitamente no catálogo de whatsapp-notification-types.ts
 * (ingresso/estacionamento/corrida/2FA), agora nomeados explicitamente.
 * Mantida curta e code-owned de propósito (ver filosofia em
 * whatsapp-notification-types.ts) em vez de texto livre por tenant. */
export const SEGMENTO_NICHES: { key: SegmentoNiche; label: string }[] = [
  { key: "EVENTOS_INGRESSOS", label: "Eventos / Ingressos" },
  { key: "ESTACIONAMENTO", label: "Estacionamento" },
  { key: "MOBILIDADE_CORRIDAS", label: "Mobilidade / Corridas" },
  { key: "GENERICO_2FA", label: "Genérico / 2FA" },
];

export function getSegmentoNicheLabel(niche: SegmentoNiche): string {
  return SEGMENTO_NICHES.find((n) => n.key === niche)?.label ?? niche;
}
