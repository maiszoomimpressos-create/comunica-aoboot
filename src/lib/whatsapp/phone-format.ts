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

/** Normaliza e valida um número de WhatsApp brasileiro informado pelo usuário
 * (aceita máscara, espaços, `+55`, DDD+número). Devolve dígitos no formato
 * que o provedor espera (`5511999999999`) e o E.164 com `+` para exibir. */
export function parseBrazilianWhatsappNumber(
  raw: string
): { ok: true; digits: string; e164: string; display: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Informe o número de destino." };
  }

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return { ok: false, error: "Informe um número brasileiro válido, com DDD. Ex: (11) 99999-9999." };
  }
  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  digits = normalizeBrazilianMobile(digits);

  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) {
    return { ok: false, error: "Informe um número brasileiro válido, com DDD. Ex: (11) 99999-9999." };
  }

  const ddd = Number(digits.slice(2, 4));
  if (ddd < 11 || ddd > 99) {
    return { ok: false, error: "DDD inválido. Informe DDI + DDD + número. Ex: (11) 99999-9999." };
  }

  return { ok: true, digits, e164: `+${digits}`, display: formatE164BrDisplay(digits) };
}

/** Formata dígitos `55…` para um E.164 legível, ex. `+55 11 99999-9999`. */
export function formatE164BrDisplay(digits: string): string {
  if (digits.startsWith("55") && digits.length === 13) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return digits.startsWith("55") ? `+${digits}` : digits;
}

