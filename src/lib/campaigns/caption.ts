/**
 * Legenda de mídia (imagem/vídeo/documento) — puro, testado em
 * tests/campaigns/caption.test.ts.
 *
 * O WhatsApp corta/recusa legendas longas de mídia (a API oficial limita a
 * 1024 caracteres; pela Z-API/WhatsApp Web o limite exato não é
 * documentado). Pra nunca perder texto: a legenda leva até
 * MEDIA_CAPTION_MAX caracteres, cortando num fim de parágrafo/frase/palavra,
 * e o resto vai como mensagem de texto logo depois da mídia.
 */
export const MEDIA_CAPTION_MAX = 1024;

export interface CaptionSplit {
  caption: string;
  /** Texto que não coube na legenda (vazio = coube tudo). */
  rest: string;
}

export function splitCaption(text: string, max: number = MEDIA_CAPTION_MAX): CaptionSplit {
  const full = text.trim();
  if (full.length <= max) return { caption: full, rest: "" };

  const window = full.slice(0, max);
  const minCut = Math.floor(max * 0.5); // não deixa uma legenda minúscula
  const candidates = [
    window.lastIndexOf("\n\n"),
    window.lastIndexOf("\n"),
    Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? ")) + 1,
    window.lastIndexOf(" "),
  ];
  let cut = candidates.find((index) => index >= minCut) ?? -1;
  if (cut <= 0) cut = max;
  return { caption: full.slice(0, cut).trim(), rest: full.slice(cut).trim() };
}
