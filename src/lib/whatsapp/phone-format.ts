/** Restaura o 9º dígito que falta em números de celular BR entregues pelo
 * Z-API — confirmado em produção (conversa escalada em 27/10/2026): o
 * `fromPhone` de um contato chegou como `554688212387` (12 dígitos, sem o
 * 9) em vez de `5546988212387` (13 dígitos, formato celular válido). Isso é
 * uma peculiaridade conhecida da API do WhatsApp com números antigos/sem o
 * nono dígito ainda propagado nos registros, não um erro nosso de digitação.
 *
 * A MAI Drive valida formato de celular e rejeita o que não bate — e como o
 * `telefone` mandado pra ela é sempre o `fromPhone` do servidor (nunca o
 * que a IA ou o cliente digitam, por contrato de segurança), um número
 * salvo sem o 9 trava toda e qualquer corrida desse contato silenciosamente
 * até alguém notar.
 *
 * Só altera números BR (`55` + DDD de 2 dígitos) com exatamente 12 dígitos
 * (DDI+DDD+8, sem o 9) — DDD fixo de 2 dígitos descarta ambiguidade com
 * outros países. Qualquer outro formato (já com 9, outro DDI, tamanho
 * inesperado) passa direto, sem tentar "corrigir" algo que não reconhece. */
export function normalizeBrazilianMobile(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const isUnninthedBrMobile = digits.length === 12 && digits.startsWith("55");
  if (!isUnninthedBrMobile) return digits;
  return `${digits.slice(0, 4)}9${digits.slice(4)}`;
}
