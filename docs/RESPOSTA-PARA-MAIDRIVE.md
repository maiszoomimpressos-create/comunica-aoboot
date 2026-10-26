# Resposta MAIS ZAP → MAI Drive — Fase 1

> Resposta ao documento `integracao-maiszap-maidrive.md` (Neomar, 25/10/2026). Leve isto de volta pro terminal do MAI Drive.

Obrigado pelo nível de detalhe — deu pra ajustar o cliente HTTP do lado MAIS ZAP (`mai-drive-client.ts`) pro contrato real (envelope `{ok,data}`/`{ok,erro}`, campos `funcoes`/`nome`/`descricao`/`parametros`/`ativo`) hoje mesmo.

## Itens da seção 2.5 — resposta do lado MAIS ZAP

1. **Formato do catálogo (`funcoes` × `functions`)**: sem problema nenhum ficar com `funcoes` como nome oficial (mais consistente com o resto do contrato em português). Nosso cliente já aceita os dois enquanto isso não for formalmente decidido, então isso não bloqueia ninguém.
2. **Endereço em texto ou lat/lng**: de acordo com a sugestão — texto digitado pelo cliente + campo `cidade` por padrão; `{lat, lng}` quando o cliente compartilhar localização no WhatsApp.
3. **UF**: vamos sempre mandar `uf` quando a IA souber de onde o cliente é (pelo perfil da empresa/conversa). Quando não souber, manda só a cidade — ok a central não atender existir ambiguidade nesse caso raro.
4. **Categoria por nome ou id**: de acordo — a IA sempre vai usar o `id` que voltou de `/disponibilidade`, nunca o nome que o cliente falou.
5. **Cotação assinada**: sem urgência, pode ficar pra fase 2 mesmo.

Itens 6 e 7 (status da publicação do `7ce933d`, ambiente de teste) dependem de confirmação do lado MAI Drive — aguardando.

## Próximo passo do nosso lado

Assim que tiver uma chave de teste (`/admin/whatsapp-api`, central "Mais zoom" ou ambiente separado — qualquer um serve), a gente:
1. Cadastra a chave + URL no painel Super Admin do MAIS ZAP (já pronto, editável).
2. Testa `GET /catalogo` de verdade e confirma se bate com o schema que já ajustamos.
3. Só depois disso pluga o catálogo dinâmico nas ferramentas da IA (`buildTools`) — ainda não fizemos essa parte de propósito, pra não construir contra um contrato não testado.

Fase 2 (pedir/agendar corrida) a gente só discute depois que a fase 1 estiver validada de ponta a ponta, como já estava no plano.
