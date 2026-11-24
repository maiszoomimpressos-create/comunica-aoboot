# Recibo de corrida — origem do pedido (`requestSource`)

**Para:** time do MAI Drive · **Desde:** 24/11/2026 · **Endpoint:** `POST /api/v1/whatsapp/purchase-confirmation`

## Por quê

Depois do recibo da corrida (`type` = `corrida_mai_drive` ou `corrida_concluida`), o
MAIS ZAP pode mandar ao passageiro uma divulgação do app: a imagem com o link da
Play Store (card "Divulgar o app depois da corrida") ou, se ela estiver desligada,
uma Publicidade ligada a essa função.

Quem **pediu a corrida pelo app do passageiro já tem o app**, então não deve receber
essa divulgação. Quem pediu pela **maçaneta**, pelo **motorista** ou pelo **WhatsApp**
deve receber.

O payload de hoje **não informa por onde a corrida foi pedida**. Os campos
`origem`/`destino` são **endereços** e não servem para isso. Por isso existe um
campo novo, opcional.

## O que o MAI Drive precisa mandar

Um campo a mais no corpo (de preferência):

```json
{
  "to": "5546999999999",
  "type": "corrida_mai_drive",
  "recipientName": "Maria",
  "requestSource": "macaneta",
  "details": { "distancia": "5,2 km", "valor_total": "R$ 18,00", "...": "..." }
}
```

…ou, se for mais fácil, dentro de `details`: `"canal_pedido": "macaneta"` (também
aceito `origem_pedido`). Se vierem os dois, vale o `requestSource` do corpo.

| Valor              | Quando usar                                   | Divulgação do app depois do recibo |
| ------------------ | --------------------------------------------- | ---------------------------------- |
| `app`              | pedida pelo **app do passageiro**             | **não envia**                      |
| `whatsapp`         | pedida pelo WhatsApp (bot do MAIS ZAP / central) | envia                           |
| `motorista`        | lançada pelo motorista                        | envia                              |
| `macaneta`         | corrida de rua (`rides.source = 'OFFLINE_MANUAL'`) | envia                         |
| (ausente ou vazio) | —                                             | envia (comportamento de antes)     |

A caixa, os acentos e os espaços não importam (`"Maçaneta"`, `"APP"` e
`"offline_manual"` são aceitos). Sinônimos aceitos: `aplicativo`/`app_passageiro` = `app`;
`rua`/`offline_manual` = `macaneta`; `driver`/`app_motorista` = `motorista`.
Qualquer outro texto é tratado como "não é app", e a divulgação é enviada.

> **Atenção ao mapear:** no MAI Drive, `rides.source` só distingue `APP` de
> `OFFLINE_MANUAL`. Uma corrida criada pelo WhatsApp (via API do MAIS ZAP) ou pela
> central pode ficar gravada como `APP` mesmo sem o passageiro ter usado o app.
> Mande `app` **só** quando o pedido saiu do app do passageiro. Na dúvida, não
> mande `app`.

## O que acontece do lado do MAIS ZAP

- O recibo em si sai sempre igual; o campo não muda o texto da mensagem.
- `requestSource = app`: não agenda a imagem da Play Store e não enfileira
  Publicidade para esse recibo. Fica registrado no log o evento
  `ride_promotions_skipped_app_request`.
- Qualquer outra origem, ou nenhuma: a imagem da Play Store tem prioridade (se o card
  estiver ligado). A Publicidade só entra quando a imagem não está ligada, e nunca saem as duas.
- As outras funções (não-recibo) não são afetadas.

Código: `src/lib/notifications/ride-request-source.ts`, aplicado em
`sendPurchaseConfirmation` (`src/services/whatsapp-connection.service.ts`).

## Envio em 2 mensagens (24/11/2026)

O follow-up pós-corrida (3–5 min depois do recibo) agora sai em duas partes:

1. **Imagem** (banner) com legenda curta de agradecimento — **sem link** (qualquer `{{link}}`/URL é removido da legenda).
2. **3–6 s depois**, o convite com o link da Play Store via Z-API `send-link` (título, descrição e miniatura configuráveis no card), pra o WhatsApp mostrar a prévia. O link fica sempre no fim do texto (exigência do `send-link`).

Se a imagem sair e o link falhar, a retentativa manda só o link (`imageSentAt` marcado). As regras continuam: não envia se `requestSource=app`, nunca junto com a Publicidade, cancela se atrasar mais de 1 h.

Observação Z-API: o link só fica clicável se o passageiro já tiver o número salvo ou já tiver conversado — no fluxo do recibo isso costuma valer, mas não é garantido.

## Recibo repetido e disparo sem cron (24/11/2026)

**Recibo em dobro.** O Mai Drive chama o `purchase-confirmation` 2x para a mesma corrida (4–11 s de diferença). Agora há uma trava (`notification_dedup`, chave única por conexão):
- chave explícita, se vier: header `Idempotency-Key`, campo `idempotencyKey` ou `details.id_corrida` (vale para qualquer tipo);
- sem chave explícita, só no recibo de corrida: hash de tipo + telefone + dados + nota.

Se a mesma chave chegar de novo em até 30 min, nada é reenviado: a resposta é 200 com `duplicate: true` e o `messageId` da 1ª mensagem. Se o envio falhar, a chave é liberada para a nova tentativa.

**Convite sem cron externo.** O próprio recibo, em `after()` (rota com `maxDuration` 300 s), espera o horário agendado (3 a 4,5 min) e processa a fila. A trava PENDING→PROCESSING impede envio duplicado. Como rede de segurança, cada webhook da Z-API (no máximo 1x a cada 30 s por instância) processa os convites vencidos. Convite com mais de 30 min de atraso é cancelado. O cron `/api/cron/*` continua funcionando, se um dia for configurado.
