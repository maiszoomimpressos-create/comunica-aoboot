export interface WhatsappProduct {
  key: string;
  name: string;
  description: string;
  available: boolean;
}

/**
 * Catálogo dos "produtos" (casos de uso) do módulo WhatsApp — a tela em
 * `/modulos/whatsapp/conectar` mostra essa lista antes do usuário entrar no
 * assistente de conexão propriamente dito. Só "Confirmação de Compra" tem
 * fluxo real construído hoje; os demais são placeholders "Em breve", no
 * mesmo padrão já usado pra provedores/módulos. Cada produto disponível
 * precisa de uma rota própria em `conectar/<key>` que hospeda o assistente
 * (ver `conectar/confirmacao-compra/page.tsx`).
 */
export const WHATSAPP_PRODUCTS: WhatsappProduct[] = [
  {
    key: "confirmacao-compra",
    name: "Confirmação de Compra",
    description:
      "Envie automaticamente uma mensagem de confirmação com QR code assim que uma venda for concluída.",
    available: true,
  },
  {
    key: "atendimento",
    name: "Atendimento",
    description: "Centralize o atendimento ao cliente pelo WhatsApp em um só lugar.",
    available: false,
  },
  {
    key: "notificacoes",
    name: "Notificações",
    description: "Avisos automáticos de status, lembretes e alertas pros seus clientes.",
    available: false,
  },
  {
    key: "campanhas",
    name: "Campanhas",
    description: "Envios em massa segmentados pra sua base de clientes.",
    available: false,
  },
];
