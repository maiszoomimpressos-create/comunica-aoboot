import { after } from "next/server";
import { scheduleAdvertisementTask, type AdvertisementTrigger } from "@/services/advertisement-dispatch.service";

/**
 * Chamado no fim de sendPurchaseConfirmation depois de um envio com
 * sucesso: roda o disparo da publicidade com after() (mesmo mecanismo do
 * webhook do atendente), sem segurar a resposta da API. Nunca lança.
 */
export function scheduleAdvertisementAfterNotification(trigger: AdvertisementTrigger): void {
  scheduleAdvertisementTask(trigger, (task) => after(task));
}
