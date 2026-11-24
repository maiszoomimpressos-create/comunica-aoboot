/**
 * Regras puras de ritmo/proteção do disparo em massa (sem Prisma, sem
 * I/O) — o dispatcher (services/campaign-dispatcher.service.ts) só junta
 * isso com o banco e a Z-API. Testadas em tests/campaigns/pacing.test.ts.
 */

export interface GapSettings {
  batchSize: number;
  minMessageIntervalSeconds: number;
  maxMessageIntervalSeconds: number;
  minBatchPauseSeconds: number;
  maxBatchPauseSeconds: number;
}

function randomBetween(min: number, max: number, rng: () => number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Espera (segundos) antes da próxima mensagem, dado quantas a campanha já
 * tentou: pausa entre lotes a cada `batchSize`, intervalo normal no resto. */
export function pickGapSeconds(attemptedSoFar: number, settings: GapSettings, rng: () => number = Math.random): number {
  const batchSize = Math.max(1, settings.batchSize);
  const isBatchBoundary = attemptedSoFar > 0 && attemptedSoFar % batchSize === 0;
  return isBatchBoundary
    ? randomBetween(settings.minBatchPauseSeconds, settings.maxBatchPauseSeconds, rng)
    : randomBetween(settings.minMessageIntervalSeconds, settings.maxMessageIntervalSeconds, rng);
}

/** Instante mais cedo em que a próxima mensagem pode sair: o horário
 * agendado do destinatário, mas nunca antes de `lastSentAt + gap` — é isso
 * que impede a rajada quando vários destinatários já estão vencidos (cron
 * atrasado, campanha retomada, backlog depois de queda). */
export function earliestSendTime(scheduledAt: Date, lastSentAt: Date | null, gapSeconds: number): Date {
  const notBefore = lastSentAt ? lastSentAt.getTime() + gapSeconds * 1000 : 0;
  return new Date(Math.max(scheduledAt.getTime(), notBefore));
}

/** Rampa de aquecimento (envios/dia) por dia desde o primeiro envio de
 * campanha do número — depois do último degrau, sem teto de aquecimento
 * (vale só o dailyLimit). Conservadora de propósito. */
export const WARMUP_SCHEDULE = [30, 50, 80, 120, 170, 230, 300, 400, 500, 650] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function warmupDailyCap(warmupStartedAt: Date | null, now: Date): number {
  if (!warmupStartedAt) return WARMUP_SCHEDULE[0];
  const day = Math.floor((now.getTime() - warmupStartedAt.getTime()) / DAY_MS);
  if (day < 0) return WARMUP_SCHEDULE[0];
  if (day >= WARMUP_SCHEDULE.length) return Number.POSITIVE_INFINITY;
  return WARMUP_SCHEDULE[day];
}

export interface DailyLimitInput {
  dailyLimit: number | null;
  dailySentCount: number;
  warmupEnabled: boolean;
  warmupStartedAt: Date | null;
}

/** Quantas mensagens ainda podem sair hoje (Infinity = sem teto). */
export function remainingToday(input: DailyLimitInput, now: Date): number {
  const limit = input.dailyLimit ?? Number.POSITIVE_INFINITY;
  const warmup = input.warmupEnabled ? warmupDailyCap(input.warmupStartedAt, now) : Number.POSITIVE_INFINITY;
  const cap = Math.min(limit, warmup);
  if (!Number.isFinite(cap)) return Number.POSITIVE_INFINITY;
  return Math.max(0, cap - input.dailySentCount);
}

export interface SendFailureInfo {
  httpStatus?: number;
  networkError?: boolean;
}

/** Erro temporário = vale tentar de novo mais tarde (rede, timeout, rate
 * limit, instabilidade da Z-API). 4xx "de verdade" (número inválido,
 * payload recusado, token errado) não melhora com retentativa. */
export function isTemporaryFailure(info: SendFailureInfo): boolean {
  if (info.networkError) return true;
  const status = info.httpStatus;
  if (status === undefined) return false;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Backoff da retentativa: 2 min, 4 min, 8 min... (teto 30 min). */
export function retryDelayMs(attempts: number): number {
  const base = 2 * 60 * 1000;
  return Math.min(30 * 60 * 1000, base * 2 ** Math.max(0, attempts - 1));
}

export type RecipientOutcome =
  | { kind: "sent" }
  | { kind: "retry"; at: Date }
  | { kind: "failed" };

/** O que fazer com o destinatário depois de uma tentativa de envio.
 * `attempts` já inclui a tentativa atual (é incrementado no claim). */
export function decideAfterSend(
  ok: boolean,
  failure: SendFailureInfo,
  attempts: number,
  maxAttempts: number,
  now: Date
): RecipientOutcome {
  if (ok) return { kind: "sent" };
  if (isTemporaryFailure(failure) && attempts < Math.max(1, maxAttempts)) {
    return { kind: "retry", at: new Date(now.getTime() + retryDelayMs(attempts)) };
  }
  return { kind: "failed" };
}

/** Disjuntor: as últimas `threshold` tentativas (mais recente primeiro,
 * por horário REAL de envio/falha) falharam todas. */
export function shouldAutoPauseForFailures(recentStatuses: string[], threshold: number): boolean {
  if (threshold < 1 || recentStatuses.length < threshold) return false;
  return recentStatuses.slice(0, threshold).every((s) => s === "FAILED");
}

/** Muitos números sem WhatsApp = lista de má qualidade (comprada/antiga),
 * que é exatamente o padrão que leva a denúncia/banimento. Só avalia
 * depois de uma amostra mínima. */
export function shouldAutoPauseForInvalidRate(
  invalidCount: number,
  attemptedCount: number,
  minSample = 20,
  maxRate = 0.3
): boolean {
  if (attemptedCount < minSample) return false;
  return invalidCount / attemptedCount > maxRate;
}
