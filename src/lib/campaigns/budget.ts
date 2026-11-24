/** Tempo de trabalho de uma execução do dispatcher (o resto do
 * maxDuration = 60 s da rota fica de folga pro último envio terminar).
 * Configurável por env pra caber no plano da Vercel:
 * CAMPAIGN_TICK_BUDGET_MS (padrão 45 s, de 10 s a 250 s). Também usado na
 * criação da campanha pra garantir que a sequência de mensagens de um
 * contato caiba numa execução. */
export function getTickBudgetMs(): number {
  const raw = Number(process.env.CAMPAIGN_TICK_BUDGET_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 45_000;
  return Math.min(250_000, Math.max(10_000, raw));
}
