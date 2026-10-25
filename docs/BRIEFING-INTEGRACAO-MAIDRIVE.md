# Briefing pro lado MAI Drive — Integração com o atendente de IA do MAIS ZAP

> Leve este documento pro outro terminal/projeto (MAI Drive). Ele descreve
> exatamente o que o MAI Drive precisa expor pra API funcionar do lado do
> MAIS ZAP. O espelho deste doc do lado MAIS ZAP é
> `docs/INTEGRACAO-MAIDRIVE.md` — mantenha os dois em sincronia se algo
> mudar depois de combinado.

## O que é o MAIS ZAP e por que essa integração existe

MAIS ZAP é um canal de atendimento via WhatsApp com um atendente de IA.
Hoje ele já conversa com o cliente, identifica o que a pessoa quer
(chamar corrida, ser motorista, etc.) e escala pra um humano quando
precisa. O que falta: qualquer dado **operacional de verdade** (se uma
cidade é atendida, quanto custa uma corrida, se há motorista disponível
agora) não pode ser decidido ou inventado pelo MAIS ZAP — só o MAI Drive
tem esse dado real.

**Divisão de responsabilidade:**
- **MAIS ZAP**: comportamento da IA (prompt, reconhecimento de intenção,
  condução da conversa, captura dos dados que o cliente já informar).
- **MAI Drive**: dono dos dados (cidades/disponibilidade, cotação, status
  de corrida, cadastro de motorista/central). MAIS ZAP nunca duplica ou
  adivinha isso — sempre consulta via API.

## Contrato combinado até agora

- **Base**: `/api/whatsapp/v1`
- **Auth**: header `x-api-key` — **uma chave por central** (o MAIS ZAP já
  tem um painel Super Admin onde cada central/conexão recebe sua própria
  chave e URL base; o MAI Drive gera essa chave e entrega pra ser
  cadastrada lá).
- **Versionado** — mudanças incompatíveis sobem a versão (`/v2`, etc.), não
  quebram `v1` em produção.
- **Erros**: ainda não especificado um formato padrão — proposta: status
  HTTP padrão (400/401/404/500) + corpo `{ "error": "mensagem" }`. Ajustar
  se o MAI Drive já tiver uma convenção própria.

## Fase 1 — já especificada, é o que falta o MAI Drive implementar

### `GET /catalogo`

Lista as funções/serviços disponíveis — a IA do MAIS ZAP descobre
dinamicamente o que pode oferecer, em vez de ter isso fixo no código.
Isso é o que permite adicionar um novo serviço (ex: "agendar corrida") sem
precisar de deploy nenhum do lado MAIS ZAP.

Resposta esperada (formato provisório, só o lado MAIS ZAP ainda escreveu
isso — **validar com o MAI Drive antes de fechar**):

```json
{
  "functions": [
    {
      "name": "consultar_disponibilidade",
      "description": "Verifica se uma cidade é atendida e quantos motoristas estão online",
      "parameters": { "cidade": "string" },
      "method": "GET",
      "path": "/cidades/{cidade}/disponibilidade"
    }
  ]
}
```

**Pontos abertos pro MAI Drive confirmar:**
- O envelope é mesmo `{ "functions": [...] }`?
- `method`/`path` fazem sentido assim, ou o MAI Drive prefere outro jeito
  de dizer "como chamar essa função descoberta"?
- Esse catálogo muda com frequência? (define o TTL de cache do lado MAIS
  ZAP — hoje está em 10 min, um palpite conservador, não combinado)

### `GET /cidades/{cidade}/disponibilidade`

Retorna: centrais atuando naquela cidade, quantos motoristas estão
online, quais categorias de carro/moto estão disponíveis.

- **Uso real**: cliente pergunta "vocês atendem em Dois Vizinhos?" ou
  menciona a cidade ao pedir uma corrida — a IA consulta aqui antes de
  confirmar que vai seguir com o pedido.
- Formato de resposta: a definir pelo MAI Drive. Sugestão mínima:

```json
{
  "atendida": true,
  "motoristasOnline": 4,
  "categorias": ["moto", "carro"]
}
```

### `POST /cotacao`

```json
// request
{ "origem": "Rua X, 580, Dois Vizinhos", "destino": "Rua Y, 179, Dois Vizinhos", "categoria": "moto" }

// response
{ "valor": 12.5, "distancia": 3.2, "tempo": 8 }
```

- **Uso real**: cliente pergunta "quanto custa uma corrida daqui pra lá?"
  antes mesmo de confirmar o pedido.
- Dúvida aberta: `origem`/`destino` vão como endereço em texto livre, ou o
  MAI Drive prefere lat/lng? O MAIS ZAP já valida endereço via Google Maps
  Geocoding antes de confirmar com o cliente, então pode mandar os dois
  (texto formatado + lat/lng) se for útil.

## Fase 2 — ainda não especificada, proposta inicial pra revisar junto

Esses fluxos já existem na condução da conversa do lado MAIS ZAP (a IA já
sabe identificar a intenção), mas não têm endpoint ainda. Descoberta via
`/catalogo` também, mesma lógica da fase 1. Isto é um ponto de partida pra
discussão, não um contrato fechado:

| Intenção do cliente | Dados que a IA já captura na conversa | Endpoint sugerido |
|---|---|---|
| Pedir corrida agora | origem, destino, categoria, cidade | `POST /corridas` |
| Agendar corrida pra depois | + dia/horário desejado | `POST /corridas` (com `agendadoPara`) ou `POST /corridas/agendamento` |
| Status de uma corrida já pedida | identificador da corrida/telefone do cliente | `GET /corridas/{id}` ou `GET /corridas?telefone=` |
| Cancelar corrida | identificador da corrida | `POST /corridas/{id}/cancelar` |
| Quero ser motorista | nome, cidade, se já tem veículo próprio | `POST /candidaturas/motorista` |
| Quero abrir uma central própria | nome, cidade | `POST /candidaturas/central` |

**Importante**: hoje a IA do MAIS ZAP só resolve **corrida** sozinha — os
outros itens da tabela são só coletados minimamente e escalados pra um
humano, não têm fluxo automático ainda. Então do lado MAI Drive, os
endpoints de `corridas` (pedir/agendar/status/cancelar) são os que
desbloqueiam mais automação primeiro; os de candidatura podem vir depois.

## O que o MAIS ZAP já tem pronto do seu lado

Pra dar visibilidade de que o trabalho já está avançando em paralelo:

- Schema (`BusinessIntegration`: baseUrl, chave criptografada, cache do
  catálogo) — criado, migration gerada mas **não aplicada em produção**
  (aguardando o Neomar liberar).
- Painel Super Admin editável: cadastrar/editar provider, URL base e
  chave de API por central, sem precisar recriar nada quando o contrato
  mudar.
- Cliente HTTP que busca/valida/cacheia `/catalogo` — escrito, mas **não
  testado contra um servidor real** ainda, porque o endpoint não existe
  do lado MAI Drive.
- Ainda falta (lado MAIS ZAP, depois que `/catalogo` existir de verdade):
  plugar esse catálogo dinâmico nas ferramentas que a IA pode chamar
  durante a conversa.

## Pra fechar e destravar o teste real

1. MAI Drive confirma/ajusta o formato do `/catalogo` e dos dois
   endpoints da fase 1 (disponibilidade, cotação).
2. MAI Drive sobe pelo menos uma versão de teste desses 3 endpoints (pode
   ser com dados mockados) + gera uma chave de API de teste.
3. MAIS ZAP cadastra essa chave + URL no painel Super Admin (já pronto) e
   testa a chamada real.
4. Combinam juntos a fase 2 (tabela acima) com base no que a fase 1
   validar.
