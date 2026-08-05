# Boot Whats — Plataforma

Fundação de uma plataforma SaaS B2B modular de comunicação empresarial:
multiempresa, RBAC granular, planos/assinaturas, marketplace de módulos e
painel administrativo. Módulos de canal (WhatsApp, Telegram, Instagram,
E-mail, SMS, IA) são fases futuras — esta base não implementa nenhum deles,
só a estrutura pronta para recebê-los.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Prisma 7 (driver adapter `@prisma/adapter-pg`) · PostgreSQL
(Supabase) · Better Auth (email/senha + plugins `organization`/`admin`).

## Getting started

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, BETTER_AUTH_SECRET, etc.
npm run db:push        # ou npm run db:migrate — cria/atualiza as tabelas
npm run db:seed        # catálogo de permissões, planos, módulos, admin da plataforma
npm run dev
```

Abra http://localhost:3000.

## Particularidades deste ambiente de desenvolvimento (Windows)

Esta máquina roda uma **política de Controle de Aplicativo** (WDAC/Smart App
Control) que bloqueia a execução de binários nativos (`.node`/`.exe`)
baixados via npm — mesmo os de pacotes legítimos e amplamente usados. Isso
afeta três pontos da stack, todos com uma solução permanente e documentada
(nada de "gambiarra silenciosa"):

1. **Turbopack** (bundler padrão do Next.js 16) não roda — ele não tem
   fallback em WASM. Use os scripts `dev:webpack`/`build:webpack` nesta
   máquina; `dev`/`build` (Turbopack) continuam sendo os scripts corretos
   para qualquer outra máquina/CI sem essa restrição.
2. **Motor nativo do Tailwind v4** (`@tailwindcss/oxide`) também é bloqueado,
   mas tem um fallback oficial em WASM (`@tailwindcss/oxide-wasm32-wasi`).
   `scripts/ensure-tailwind-wasm-fallback.mjs` roda automaticamente no
   `postinstall` e o instala à força (`npm` recusa instalá-lo sozinho por
   achar a plataforma incompatível) só quando o nativo falha — não tem custo
   em máquinas sem essa restrição.
3. **Prisma `schema-engine`** (usado por `prisma db push`/`migrate`) também é
   nativo e bloqueado aqui — mesmo o Prisma 7 já sendo "rust-free" para
   consultas (usa `@prisma/adapter-pg`, sem binário nativo nenhum para isso).
   A primeira migration (`prisma/migrations/20260805120000_init`) foi
   aplicada manualmente com `scripts/apply-init-migration.mjs` (conecta via
   `pg` puro e registra a migration em `_prisma_migrations`), para que
   `prisma migrate deploy` funcione normalmente a partir de qualquer outra
   máquina/CI sem essa restrição. Novas migrations criadas aqui vão precisar
   do mesmo processo manual — ou rode `prisma migrate dev` numa máquina sem
   essa política.
4. **`tsx`/`ts-node`** também não instalam (dependem do binário nativo do
   `esbuild`). Scripts standalone em TypeScript (seed, etc.) rodam com
   `node scripts/run-ts.mjs <arquivo>.ts` — usa o suporte nativo do Node 22+
   para TypeScript, mais um pequeno loader
   (`scripts/bundler-resolve-loader.mjs`) que resolve imports sem extensão do
   jeito que um bundler resolveria (necessário porque o gerador `prisma-client`
   do Prisma 7 assume que quem consome o client é um bundler).

## Estrutura

Ver o restante do código-fonte — organizado por domínio em `src/`
(`app/`, `components/`, `lib/`, `actions/`, `repositories/`, `services/`).
