# Integração MAIS ZAP ↔ MAI Drive

Status: **combinado, em construção — nada disto está commitado, migrado em produção, ou deployado ainda.**

## Divisão de responsabilidade

- **MAIS ZAP** (aqui): comportamento da IA — prompts, roteiro, reconhecimento de intenção, quais serviços existem pro cliente pedir.
- **MAI Drive**: dono dos dados — cidades/disponibilidade, cotação, status de corrida, cadastro de motorista/central. MAIS ZAP nunca duplica ou "adivinha" esse dado — sempre consulta.

Isso é a mesma regra já registrada em memória do projeto ("MAIS ZAP é o canal, o app conectado é a fonte de verdade") — essa integração é a primeira aplicação concreta dela.

## Contrato da API (MAI Drive expõe, MAIS ZAP consome)

**Confirmado contra código real do lado MAI Drive em 25/10/2026** (ver
`docs/BRIEFING-INTEGRACAO-MAIDRIVE.md` pro histórico e os pontos ainda
`[a confirmar]`):

- Base: `https://maidrive.com.br/api/whatsapp/v1`
- Auth: header `x-api-key`, uma chave por central (por `ChannelConnection`), formato `mdz_...`. A chave só é mostrada uma vez na hora de gerar (`/admin/whatsapp-api` do lado MAI Drive) — nunca enviar por chat/e-mail/documento.
- **Envelope de toda resposta**: sucesso `{ "ok": true, "data": ... }`, erro `{ "ok": false, "erro": { "codigo", "mensagem" } }` — `mai-drive-client.ts` já valida isso.
- Versionada — mudanças incompatíveis sobem a versão, não quebram `v1` em produção

### Endpoints (fase 1)

| Método | Rota | Função |
|---|---|---|
| GET | `/catalogo` | Lista as funções disponíveis (`data.funcoes[]` ou `data.functions[]` — MAI Drive ainda não fechou qual fica oficial, nosso cliente aceita os dois). Cada função tem `nome`, `descricao`, `method`, `path`, `parametros` (JSON Schema), `versao`, `ativo`. Só `ativo: true` é usável agora. |
| GET | `/cidades/{cidade}/disponibilidade?uf=` | `atendida`, `centrais[]`, `motoristasOnline`, `motoristasLivres`, `categorias[]` (com `id`/`nome`). Sempre HTTP 200, mesmo quando não atendida. |
| POST | `/cotacao` | `{ origem, destino, categoria, cidade }` → `{ valor, moeda, distanciaKm, tempoMin, adicional, origem, destino, estimativa: true }`. `origem`/`destino` aceitam texto, `{lat,lng}` ou `"lat,lng"`. Valor é só estimativa — "cotação assinada" (valor não pode mudar) é fase 2. |

Códigos de erro confirmados: `401 NAO_AUTENTICADO/CHAVE_INVALIDA`, `403 NAO_DISPONIVEL`, `400 PARAMETRO_INVALIDO`, `404 NAO_ENCONTRADO/SEM_TARIFA`, `422 ENDERECO_NAO_ENCONTRADO`, `502 ROTA_INDISPONIVEL`, `501 NAO_DISPONIVEL` (função `ativo:false`), `405 METODO_NAO_PERMITIDO`, `429 LIMITE_EXCEDIDO` (com `Retry-After`) `[a confirmar se publicado]`, `500 ERRO_INTERNO`.

### Fase 2 (proposta do MAI Drive, ainda não fechada)

`pedir_corrida` (`POST /corridas`), `agendar_corrida` (`POST /corridas/agendar`), `status_corrida` (`GET /corridas/{id}?telefone=`, já existe), `cancelar_corrida` (`POST /corridas/{id}/cancelar`, já existe), `quero_ser_motorista` (`POST /cadastro/motorista`, já existe, grava em `whatsapp_leads`), `quero_abrir_central` (`POST /cadastro/central`, já existe, grava em `whatsapp_leads`). As duas de corrida (pedir/agendar) ainda estão `ativo: false` (501) — faltam rota, RPC de despacho e cadastro do passageiro pelo telefone do lado MAI Drive. Ver tabela completa em `docs/BRIEFING-INTEGRACAO-MAIDRIVE.md`.

## Guardrails do lado MAIS ZAP (decisão técnica, não especificada pelo contrato original)

- **Chave armazenada criptografada** — mesmo padrão já usado pro token da Z-API (`src/lib/crypto/secret-box.ts`), nunca em texto puro, nunca logada.
- **`/catalogo` cacheado**, não buscado a cada mensagem — latência e custo, e também reduz a superfície de "o que mudou entre uma mensagem e outra" sem a gente saber.
- **Resposta do `/catalogo` validada** antes de virar definição de ferramenta de IA de verdade (schema do nome/descrição/parâmetros) — uma integração que controla dinamicamente quais "ferramentas" a IA pode chamar é, por natureza, uma superfície sensível; mesmo sendo um sistema nosso (MAI Drive), não assumimos o formato de resposta como confiável sem checar.
- **Fallback gracioso** se a chamada ao MAI Drive falhar ou `/catalogo` não responder — a IA não trava nem inventa um serviço que não conseguiu confirmar; escala pra humano ou avisa que não conseguiu consultar agora.

## Regra operacional (explícita, de Neomar)

**Tudo local até liberação explícita.** Nenhum commit, push, deploy, ou migração aplicada no banco de produção relacionados a essa integração acontece sem o Neomar dar OK — isso vale mesmo quando o código/schema já estiver pronto localmente.

## Status de implementação

- [x] Schema local (`BusinessIntegration`) — `prisma/schema.prisma`
- [x] Migration gerada, **não aplicada** (continua só local até o Neomar liberar)
- [x] Repositório (CRUD local) — `business-integration.repository.ts`, inclui listagem pro painel e upsert com chave de API opcional (editar sem precisar reenviar a chave atual)
- [x] UI editável no painel (Super Admin) pra configurar provider/base URL/chave por central — `/admin/whatsapp`, `BusinessIntegrationsManager`
- [x] Cliente HTTP (`mai-drive-client.ts`) ajustado pro contrato real confirmado em 25/10 — envelope `{ok,data}`/`{ok,erro}`, campos `funcoes`/`nome`/`descricao`/`parametros`/`ativo`, filtra só funções `ativo: true`, loga `erro.codigo` quando a API responde `ok: false`.
- [ ] `buildTools` dinâmico lendo `/catalogo` e virando ferramentas de IA de verdade — ainda não plugado em `bot-attendant.service.ts` (próximo passo depois que houver uma chave de teste real pra validar contra)
- [ ] Teste real — depende de uma chave de teste gerada pelo Neomar em `/admin/whatsapp-api` e confirmação dos pontos `[a confirmar]` da seção 2.5 do briefing (formato do catálogo, endereço texto×lat/lng, uf, categoria por id).
