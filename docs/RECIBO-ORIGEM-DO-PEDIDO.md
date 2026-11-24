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
