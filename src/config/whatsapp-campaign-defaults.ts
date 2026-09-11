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

  /** Limite diário de envios por conexão. `null` = sem limite — não
   * existe um número "seguro" universal válido para qualquer conta ou
   * provedor, então não assumimos um teto por padrão; é opt-in. */
  dailyLimit: null as number | null,

  /** Falhas consecutivas que disparam a pausa automática de proteção da
   * fila (ver "pausa automática" no plano do módulo) — categoria
   * diferente de "limite seguro de envio": é um circuito de proteção
   * contra problema operacional (token inválido, instância caiu, etc.),
   * não uma tentativa de ficar dentro de algum limite da plataforma. */
  maxConsecutiveErrors: 5,
} as const;

/** Palavras-chave de opt-out — comparação exata (case-insensitive, com
 * trim), nunca interpretação aproximada/fuzzy. Uma mensagem que não bate
 * exatamente com nenhuma dessas não é tratada como opt-out — fica de fora
 * de qualquer ação automática, para revisão manual (ver seção "opt-out"
 * do plano do módulo). */
export const OPT_OUT_KEYWORDS = ["SAIR", "PARAR", "CANCELAR", "NÃO QUERO", "NAO QUERO", "REMOVER"] as const;
