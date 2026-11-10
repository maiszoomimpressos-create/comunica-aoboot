import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Boot Whats — Plataforma de comunicação empresarial",
    template: "%s · Boot Whats",
  },
  description:
    "Plataforma SaaS modular de comunicação empresarial: multiempresa, papéis e permissões, planos e um marketplace de canais.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Aplica a classe `.dark` antes do primeiro paint, evitando o
            flash de tema errado — via InlineScript (ver
            components/inline-script.tsx) pro aviso "Encountered a script
            tag" não disparar: um <script> cru direto aqui (Server
            Component) fica preso pra sempre com o mesmo `type` na
            hidratação e dispara o aviso; o InlineScript precisa ser Client
            Component pra conseguir o truque do `type` diferente entre
            servidor e cliente. */}
        <InlineScript
          html={`(function(){try{var t=localStorage.getItem("theme")||"dark";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
