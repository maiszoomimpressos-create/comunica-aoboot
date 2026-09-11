import { NOTIFICATION_TYPES } from "@/config/whatsapp-notification-types";

/**
 * Shared "how to integrate" reference for the purchase-confirmation
 * endpoint — same content shown in two places: WhatsappWelcome (before the
 * tenant even connects, so they know what they're signing up for) and
 * ApiKeySection (after connecting, next to the real key). Single source of
 * truth so the two never drift apart.
 *
 * Deliberately generic in tone: despite the endpoint's name, it is not
 * limited to "purchase" — `type` picks which action is being confirmed
 * (ticket, parking, appointment, waitlist, ...), see
 * whatsapp-notification-types.ts. Any external site or system can call it
 * for any of the catalog's types, or extend the catalog for a new one.
 *
 * `apiKeyPlaceholder` lets ApiKeySection substitute a real hint text
 * ("sua chave") while the pre-connection copy stays generic.
 */
export function WhatsappApiDocs() {
  return (
    <div className="space-y-3 text-xs">
      <p className="text-sm text-foreground">
        Essa API serve pra uma coisa só:{" "}
        <span className="font-medium">confirmar, por WhatsApp, que uma ação aconteceu</span> no
        seu sistema. Não importa se é um site de vendas, um sistema de ingressos, um app de
        estacionamento ou de agendamento — qualquer sistema seu pode chamar o mesmo endpoint,
        mudando só o <code className="text-foreground">type</code> pra dizer qual ação está
        confirmando. A gente escreve a mensagem certa e envia pelo WhatsApp da sua empresa.
      </p>

      <p className="rounded-md border border-primary/20 bg-primary/5 p-2 text-foreground">
        Não achou seu caso na lista? Use{" "}
        <code className="text-foreground">type: &quot;notificacao&quot;</code> — serve pra
        qualquer confirmação (saldo debitado, cadastro concluído, movimentação registrada, etc.):
        você manda a frase pronta em{" "}
        <code className="text-foreground">details.evento</code> e a gente só empacota com a
        saudação e o nome do seu negócio. Não precisa esperar a gente criar um tipo novo pro seu
        nicho.
      </p>

      <div className="space-y-2 rounded-lg border border-border bg-muted p-3">
        <p className="font-medium text-foreground">
          POST https://SEU-DOMINIO/api/v1/whatsapp/purchase-confirmation
        </p>
        <p className="text-muted-foreground">
          Header: <code className="text-foreground">Authorization: Bearer &lt;sua chave de API&gt;</code>
        </p>
        <pre className="overflow-x-auto rounded-md bg-background p-2 text-foreground">
{`{
  "to": "5511999999999",
  "type": "ingresso_emitido",
  "recipientName": "Maria Oliveira",
  "details": {
    "nome_evento": "Festival de Verão",
    "ingresso": "Pista",
    "data": "2026-12-15T22:00:00.000Z",
    "local": "Arena Central",
    "cidade": "São Paulo",
    "estado": "SP"
  },
  "qrData": "texto ou código que vira QR code",
  "note": "Apresente esse ingresso na portaria do evento"
}`}
        </pre>

        <dl className="space-y-1.5 text-muted-foreground">
          <div>
            <code className="text-foreground">to</code> — obrigatório. Só números: código do país +
            DDD + número (ex: 55 11 999999999 → 5511999999999).
          </div>
          <div>
            <code className="text-foreground">type</code> — opcional (padrão{" "}
            <code className="text-foreground">compra_confirmada</code>). Diz qual ação está sendo
            confirmada; define o texto da mensagem e se <code className="text-foreground">qrData</code>{" "}
            é obrigatório. Veja a lista completa abaixo.
          </div>
          <div>
            <code className="text-foreground">recipientName</code> — obrigatório. O nome cadastrado
            no seu sistema pra essa pessoa (não precisa bater com o nome do perfil de WhatsApp
            dela).
          </div>
          <div>
            <code className="text-foreground">details</code> — objeto livre (chave/valor, tudo
            string), só obrigatório pra alguns tipos — veja &ldquo;details obrigatório&rdquo; na
            lista abaixo.
          </div>
          <div>
            <code className="text-foreground">qrData</code> — obrigatório só pros tipos marcados
            &ldquo;exige qrData&rdquo;. Se enviado, a gente gera um QR code e manda como imagem; sem
            ele, a mensagem vai como texto simples.
          </div>
          <div>
            <code className="text-foreground">note</code> — opcional, até 500 caracteres. Uma linha
            de texto livre sua, adicionada no final da mensagem pronta — complementa, nunca
            substitui o texto que a gente monta.
          </div>
        </dl>

        <p className="pt-1 font-medium text-foreground">Tipos de ação disponíveis (`type`)</p>
        <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
          {NOTIFICATION_TYPES.map((t) => (
            <li key={t.key}>
              <code className="text-foreground">{t.key}</code> — {t.label}
              {t.requiresQr && " (exige qrData)"}
              {t.requiredDetailKeys.length > 0 &&
                ` (details obrigatório: ${t.requiredDetailKeys.join(", ")})`}
            </li>
          ))}
        </ul>

        <p className="pt-1 text-muted-foreground">
          Resposta: JSON <code className="text-foreground">{`{ "success": true, "data": {...} }`}</code>{" "}
          em caso de sucesso, ou{" "}
          <code className="text-foreground">{`{ "success": false, "error": {...} }`}</code> com o
          motivo em caso de erro (chave inválida, número mal formatado, campo obrigatório
          faltando, etc.).
        </p>
      </div>
    </div>
  );
}
