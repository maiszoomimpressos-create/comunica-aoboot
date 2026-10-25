# Integração MAIS ZAP ↔ MAI Drive

Status: **combinado, em construção — nada disto está commitado, migrado em produção, ou deployado ainda.**

## Divisão de responsabilidade

- **MAIS ZAP** (aqui): comportamento da IA — prompts, roteiro, reconhecimento de intenção, quais serviços existem pro cliente pedir.
- **MAI Drive**: dono dos dados — cidades/disponibilidade, cotação, status de corrida, cadastro de motorista/central. MAIS ZAP nunca duplica ou "adivinha" esse dado — sempre consulta.

Isso é a mesma regra já registrada em memória do projeto ("MAIS ZAP é o canal, o app conectado é a fonte de verdade") — essa integração é a primeira aplicação concreta dela.

## Contrato da API (MAI Drive expõe, MAIS ZAP consome)

- Base: `/api/whatsapp/v1`
- Auth: header `x-api-key`, uma chave por central (por `ChannelConnection`)
- Versionada — mudanças incompatíveis sobem a versão, não quebram `v1` em produção

### Endpoints (fase 1)

| Método | Rota | Função |
|---|---|---|
| GET | `/catalogo` | Lista as funções disponíveis (nome, descrição, parâmetros) — a IA do MAIS ZAP descobre os serviços sozinha a partir daqui, em vez de tudo fixo no código |
| GET | `/cidades/{cidade}/disponibilidade` | Centrais atuando, motoristas online, categorias de carro disponíveis naquela cidade |
| POST | `/cotacao` | `{ origem, destino, categoria }` → `{ valor, distancia, tempo }` |

### Fase 2 (ainda não especificada em detalhe)

Pedir corrida, agendar, status, cancelar, "quero ser motorista", "quero abrir uma central" — mesma lógica de descoberta via `/catalogo`, parâmetros exatos a definir quando chegar a vez de cada um.

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
- [ ] `buildTools` dinâmico lendo `/catalogo` com cache + validação + fallback — cliente (`mai-drive-client.ts`) já existe, ainda não plugado em `bot-attendant.service.ts`
- [ ] Qualquer teste real depende do endpoint `/catalogo` existir de verdade do lado do MAI Drive — até lá, o cliente HTTP fica escrito mas não comprovadamente funcional contra um servidor real.
