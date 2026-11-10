"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  /** Preferência bruta escolhida (pode ser "system") — é o que o toggle
   * compara pra destacar o botão ativo. */
  theme: Theme;
  /** "light" ou "dark" já resolvido (traduz "system" pra o que o SO prefere
   * nesse momento) — é o que efetivamente vira a classe `.dark` no
   * `<html>`. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export const THEME_STORAGE_KEY = "theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

/** Aplica a classe `.dark` no `<html>` (ver `darkMode: ["class"]` em
 * tailwind.config.ts) e desliga transições CSS por um instante, pra trocar
 * de tema sem a cor "deslizar" de um valor pro outro — mesmo truque que o
 * next-themes fazia (`disableTransitionOnChange`). */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);

  root.classList.toggle("dark", resolve(theme) === "dark");

  // Força o navegador a aplicar o `transition:none` antes de remover o
  // style, senão a transição real dispara durante a troca de classe.
  void window.getComputedStyle(style).opacity;
  document.head.removeChild(style);
}

/**
 * Substitui o `next-themes` (removido — a versão mais nova do Next.js avisa
 * sempre que um `<script>` é renderizado de dentro de um Client Component
 * sem o truque `type="text/plain"`, e o next-themes ainda não foi
 * atualizado pra isso; nem a própria v1.0.0-beta). Reimplementa só o que o
 * projeto usa: tema class-based (dark-mode-first), persistido em
 * localStorage, sincronizado entre abas e com a preferência do sistema. O
 * script que evita o "flash" de tema errado no primeiro paint vive direto
 * no `<head>` de `app/layout.tsx` (Server Component) — não aqui — seguindo
 * exatamente o guia `preventing-flash-before-hydration.md` deste Next.js.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? "dark";
  });

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage indisponível (modo privado, política do navegador) —
      // o tema ainda funciona pra essa sessão, só não persiste.
    }
  }, []);

  // Reaplica a classe sempre que `theme` muda, e também uma vez no mount —
  // necessário porque, em dev, o Strict Mode remonta e limpa atributos do
  // <html> que não vieram do JSX (inclusive o que o script inline aplicou),
  // ver "Re-applying attributes in development" no guia do Next.
  React.useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sincroniza entre abas (igual next-themes) e reage à mudança de
  // preferência do SO enquanto o tema escolhido for "system".
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === THEME_STORAGE_KEY && e.newValue) setThemeState(e.newValue as Theme);
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange() {
      setThemeState((current) => {
        if (current === "system") applyTheme("system");
        return current;
      });
    }
    window.addEventListener("storage", onStorage);
    media.addEventListener("change", onSystemChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: resolve(theme), setTheme }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa ser usado dentro de <ThemeProvider>.");
  return ctx;
}
