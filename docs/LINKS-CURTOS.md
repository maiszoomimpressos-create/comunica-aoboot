# Links curtos (encurtador do Mais Zap)

Ferramenta do painel (menu **Links curtos**, `/app/<empresa>/links`), multi-empresa:
cada empresa só vê/edita/exclui os seus links (`short_link.tenantId`). O slug é único
no sistema todo, porque a URL pública não leva a empresa.

- **Público:** `https://<domínio>/l/<slug>`
  - humano → `302` pro destino (+1 clique, `lastClickAt`);
  - crawler de prévia (WhatsApp, facebookexternalhit, Telegram, Slack…) → `200` com
    HTML Open Graph (título, descrição, imagem) + meta refresh.
  - slug inexistente → 404.
- **Criar/editar:** URL de destino (só http/https), slug opcional (vazio = gerado,
  6 caracteres), título/descrição/imagem da prévia opcionais.
- **Convite pós-corrida:** o card "Imagem pós-corrida" tem o campo *Link curto*. Ao salvar, o
  slug passa a apontar para o link da Play Store, com o título, a descrição e a miniatura
  do convite. A 2ª mensagem usa a URL curta no texto e no `linkUrl` do send-link. Se o
  link curto for excluído, o convite volta para o link longo.
- Permissões: ver = `whatsapp.view`; criar/editar/excluir = `whatsapp.manage`.
