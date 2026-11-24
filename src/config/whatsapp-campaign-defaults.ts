/**
 * Configuração central do módulo de Campanhas (disparo em massa) — nenhum
 * desses valores deve ser hardcoded em outro lugar do código (worker,
 * services, UI). Estes são só os defaults usados uma única vez, para
 * pré-preencher `ConnectionCampaignSettings` na primeira vez que uma
 * conexão ativa o produto "campanhas" — dali em diante o tenant edita
 * livremente pela tela de configuração da conexão (ver
 * connection-campaign-settings.repository.ts).
 *
 * Enquadramento importante: essas faixas min/max existem para controlar
 * carga, filas e ritmo operacional de envio — não para simular
 * comportamento humano nem para burlar limites/detecção de bloqueio da
 * plataforma provedora. Quem decide os números finais é sempre o tenant.
 */
export const CAMPAIGN_DEFAULTS = {
  /** Janela diária em que o worker processa a fila — fora dela, nenhuma
   * mensagem nova sai; o que ficou pendente retoma no próximo período
   * permitido (nada é descartado). Formato "HH:mm". */
  sendWindowStart: "07:30",
  sendWindowEnd: "19:30",
  /** Extremo permitido de configuração para o encerramento da janela —
   * validado na UI/service, não é o default em si. */
  sendWindowEndMax: "20:00",

  /** Quantas mensagens compõem um lote antes da pausa entre lotes. */
  batchSize: 5,

  /** Intervalo (segundos) entre cada mensagem dentro do mesmo lote —
   * escolhido aleatoriamente nessa faixa a cada envio, nunca um valor
   * fixo repetido. */
  minMessageIntervalSeconds: 12,
  maxMessageIntervalSeconds: 18,

  /** Pausa (segundos) entre o fim de um lote e o início do próximo. */
  minBatchPauseSeconds: 15,
  maxBatchPauseSeconds: 20,

  /** Limite diário de envios por conexão. `null` = sem limite. Não existe
   * número "seguro" universal, mas mandar sem teto nenhum é o jeito mais
   * rápido de perder um número — novas conexões nascem com 200/dia e o
   * tenant ajusta (ou limpa) no painel. */
  dailyLimit: 200 as number | null,

  /** Aquecimento de número novo ligado por padrão (ver warmupDailyCap em
   * lib/campaigns/pacing.ts). */
  warmupEnabled: true,

  /** Checa phone-exists antes de cada envio. */
  verifyNumbersBeforeSend: true,

  /** Rodapé de descadastro em toda mensagem de campanha. */
  optOutFooterEnabled: true,

  /** Tentativas totais por destinatário — só erros temporários (rede,
   * timeout, HTTP 429/5xx) são retentados. */
  maxAttempts: 3,

  /** Falhas consecutivas que disparam a pausa automática de proteção da
   * fila (ver "pausa automática" no plano do módulo) — categoria
   * diferente de "limite seguro de envio": é um circuito de proteção
   * contra problema operacional (token inválido, instância caiu, etc.),
   * não uma tentativa de ficar dentro de algum limite da plataforma. */
  maxConsecutiveErrors: 5,
} as const;

/** Palavras-chave de opt-out — comparação exata (sem diferenciar
 * maiúsculas/acentos, ignorando pontuação e espaços nas pontas), nunca
 * interpretação aproximada/fuzzy. Uma mensagem que não bate exatamente com
 * nenhuma dessas não é tratada como opt-out.
 *
 * "CANCELAR" ficou DE FORA de propósito: o mesmo número atende passageiros
 * do MAI Drive, e "cancelar" é a palavra natural pra cancelar uma corrida —
 * tratá-la como descadastro engoliria esse pedido antes do bot/fluxo. Além
 * disso, o opt-out automático só vale pra quem recebeu campanha desta
 * conexão recentemente (ver OPT_OUT_CAMPAIGN_LOOKBACK_DAYS). */
export const OPT_OUT_KEYWORDS = [
  "SAIR",
  "PARAR",
  "NAO QUERO",
  "REMOVER",
  "DESCADASTRAR",
  "DESCADASTRE",
  "STOP",
] as const;

/** Só trata "SAIR"/... como opt-out se este telefone recebeu mensagem de
 * campanha desta conexão nos últimos N dias — fora disso a mensagem segue
 * normal pro atendimento (relay/fluxo/IA). */
export const OPT_OUT_CAMPAIGN_LOOKBACK_DAYS = 30;

/** Rodapé padrão (quando optOutFooterText está vazio). */
export const DEFAULT_OPT_OUT_FOOTER = "Para não receber mais mensagens, responda SAIR.";

/** Resposta automática pra quem pediu descadastro. */
export const OPT_OUT_CONFIRMATION_MESSAGE =
  "Pronto! Você não vai mais receber nossas mensagens promocionais. Se mudar de ideia, é só falar com a gente por aqui.";
