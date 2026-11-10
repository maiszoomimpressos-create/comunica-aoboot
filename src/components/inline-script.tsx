"use client";

/**
 * Script inline que precisa rodar de fato no HTML inicial (ex: aplicar
 * `.dark` antes do primeiro paint, ver app/layout.tsx) sem disparar o aviso
 * "Encountered a script tag" do React. Só funciona por ser Client Component:
 * no servidor, `typeof window` é "undefined" e o `type` sai
 * "text/javascript" no HTML — o navegador executa normalmente, antes de
 * qualquer JS de React carregar. Na hidratação, essa mesma função roda de
 * novo no navegador (`window` já existe) e produz "text/plain" — como
 * "text/plain" não é um tipo de script executável, a checagem do React
 * (`isScriptDataBlock`, em react-dom-client.development.js) não acusa o
 * aviso. `suppressHydrationWarning` absorve o descompasso entre os dois
 * valores de `type`. Ver preventing-flash-before-hydration.md
 * ("Extracting a reusable component") nos docs deste Next.js.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
