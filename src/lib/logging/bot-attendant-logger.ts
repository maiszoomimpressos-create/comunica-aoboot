import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Pipeline do atendente de IA roda inteiro dentro de `after()` (ver
// recordWebhookEvent em whatsapp-connection.service.ts) — qualquer erro ali
// só existia como console.error, que desaparece assim que o terminal
// rola ou o processo reinicia. Isso é exatamente o que fazia uma falha (ex:
// a chamada ao modelo estourando por rate limit/credencial) virar "mensagem
// chegou mas a IA não respondeu" sem nenhum rastro pra investigar depois.
// Cada linha é um JSON — dá pra grepar por connectionId/step/level direto
// no arquivo.
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "bot-attendant.log");

let dirReady: Promise<void> | null = null;
function ensureLogDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(LOG_DIR, { recursive: true })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return dirReady;
}

export type BotLogLevel = "info" | "warn" | "error";

/** `error` serializado — nunca passa um Error cru pro JSON.stringify (vira
 * `{}`), sempre inclui message/stack quando disponível. */
export function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

/** Nunca lança — uma falha ao logar não pode derrubar o pipeline que ela
 * está tentando tornar depurável. Escreve em `logs/bot-attendant.log`
 * (best-effort: em produção serverless com filesystem read-only isso
 * silenciosamente não grava, mas o console.* abaixo ainda aparece nos logs
 * de runtime da Vercel) e sempre espelha no console. */
export async function logBotEvent(
  level: BotLogLevel,
  step: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const line = JSON.stringify({ time: new Date().toISOString(), level, step, ...data });

  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`[bot-attendant] ${line}`);

  try {
    await ensureLogDir();
    await appendFile(LOG_FILE, line + "\n", "utf8");
  } catch {
    // Best-effort — ex: filesystem read-only em produção.
  }
}
