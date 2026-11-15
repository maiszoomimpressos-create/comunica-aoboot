import { after } from "next/server";
import {
  handleAdvertisementReceiptStatus,
  scheduleAdvertisementTask,
  type AdvertisementTrigger,
} from "@/services/advertisement-dispatch.service";

/**
 * Chamado no fim de sendPurchaseConfirmation depois de um envio com
 * sucesso: põe a publicidade na fila com after(), sem segurar a resposta
 * da API. Ela só sai depois que o recibo chegar (RECEIVED) + 30 s. Nunca lança.
 */
export function scheduleAdvertisementAfterNotification(trigger: AdvertisementTrigger): void {
  scheduleAdvertisementTask(trigger, (task) => after(task));
}

/**
 * Chamado pelo webhook da Z-API para cada evento: se é o RECEIVED de um
 * recibo com publicidade na fila, envia 30 s depois (em segundo plano).
 * Qualquer outro evento: não faz nada. Nunca lança.
 */
export function onWebhookForAdvertisements(connectionId: string, payload: unknown): void {
  try {
    handleAdvertisementReceiptStatus(connectionId, payload, (task) => after(task));
  } catch {
    // nunca atrapalha o webhook
  }
}
