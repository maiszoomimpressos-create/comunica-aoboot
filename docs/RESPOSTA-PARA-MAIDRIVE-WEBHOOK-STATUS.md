# Resposta MAIS ZAP → MAI Drive — fechar o webhook de status (fase 2)

> Leve isto de volta pro terminal do MAI Drive. Espelha
> `docs/INTEGRACAO-MAIDRIVE.md` e `docs/RESPOSTA-PARA-MAIDRIVE.md` (primeira
> rodada). Testado de ponta a ponta em 26/10/2026 contra a API real.

## O que já confirmamos funcionando (teste real, 26/10/2026)

- `cotar_corrida` com `tipo` (`"corrida"`/`"entrega"`) devolve `cotacaoId`
  (válido 10 min, uso único) + valor/distância/tempo.
- `pedir_corrida` com esse `cotacaoId` + `telefone` + `nome` criou uma
  corrida real (`201`, status `procurando_motorista`).
- Um motorista real (Dois Vizinhos) aceitou a corrida de teste. Conferimos
  via `status_corrida` que o `motorista` já vem completo: `nome`,
  `veiculo`, `placa`, e o `status`/`statusTexto` avança
  (`procurando_motorista` → `motorista_a_caminho`).
- `pedir_entrega` (ainda não testado com pedido real, só o schema) segue o
  mesmo padrão, com `objeto`/`destinatarioNome`/`destinatarioTelefone` e
  devolve o código de 4 dígitos.
- Confirmado um guardrail: `pedir_corrida` rejeita `telefone` em formato
  inválido (`400 PARAMETRO_INVALIDO`) — nenhuma corrida fantasma foi
  criada no teste em que usamos um número de teste malformado.

## Respostas recebidas do Neomar (26/10/2026) — resolvido

1. **URL do webhook**: fica guardada do lado MAI Drive, presa à chave de
   API de cada central (não entra no `/catalogo`). O MAIS ZAP manda a URL
   https, eles cadastram.
2. **Autenticação**: header `X-MaiDrive-Signature: t=<unix>,v1=<hex>` —
   HMAC-SHA256 com segredo próprio da chave, sobre `"<t>." + corpo cru`.
   Rejeitar se `t` tiver mais de 5 min de diferença. Segredo entregue uma
   única vez, na hora do cadastro da URL.
3. **Formato do payload**: envelope único pra todo evento — `evento`,
   `corrida` (`id`, `entrega`, `status`, `origem`, `destino`, `valor`),
   `telefone`, `entrega` (`codigo`, `objeto`, `destinatario`,
   `codigoConfirmado` — `null` numa corrida comum), `dados`. Eventos:
   `ride.accepted` (motorista: nome/carro/placa/tempo até chegar),
   `ride.arrived`, `ride.started`, `ride.finished` (valor final),
   `ride.cancelled` (quem cancelou), `delivery.code_confirmed`,
   `delivery.object_refused` (motivo + taxa). Exemplo completo em
   `INTEGRACAO-MAIS-ZAP-PEDIDOS.md` do lado deles — **ainda precisamos
   do conteúdo desse guia pra fechar a implementação do receptor**.
4. **Central**: a chave de API já identifica a central; cada aviso traz o
   `id` da corrida criada com aquela chave.
5. **Retry/dedupe**: 8 tentativas (15s a 32min) se não responder `2xx` em
   10s. Headers `X-MaiDrive-Delivery` (id único do envio, pra dedupe) e
   `X-MaiDrive-Attempt` (número da tentativa). **Ressalva do próprio
   Neomar**: essa regra (10s/8 tentativas) e o uso do
   `X-MaiDrive-Delivery` vieram do que "mai drive 03" descreveu pra ele —
   ainda não testados com um aviso de verdade.

## Ainda falta fechar

1. **Pegar o guia `INTEGRACAO-MAIS-ZAP-PEDIDOS.md`** — precisamos do
   exemplo completo de cada evento pra implementar certo, em especial o
   conteúdo exato de `dados` em cada caso.
2. ~~Geolocalização do motorista~~ — resolvido do nosso lado: não
   precisamos da posição ao vivo do motorista. O ponto era mandar
   coordenadas (lat/lng) em vez de só texto pro `cotar_corrida`, pra o
   motorista se localizar com precisão — e `origem`/`destino` já aceitam
   `{lat, lng}` no schema, só precisávamos usar o que `buscarEndereco` já
   devolve (ajustado no prompt agora).
3. **Confirmar a URL https real do MAIS ZAP** pra mandar pro cadastro —
   aguardando confirmação interna de qual é o domínio de produção (o
   projeto Vercel é `comunica-aoboot`, falta confirmar se tem domínio
   próprio por cima).

## Próximo passo do nosso lado

Assim que tivermos o guia completo e a resposta sobre geolocalização,
implementamos o endpoint receptor (ex: `/api/webhooks/mai-drive`) e a
lógica que liga o `id` da corrida/entrega à conversa de WhatsApp certa,
pra mandar a mensagem (e o mapa, se der) certa pro cliente a cada evento —
sem precisar que ele pergunte. Nada disso está implementado ainda; local
até liberação explícita (mesma regra já registrada em
`docs/INTEGRACAO-MAIDRIVE.md`).
