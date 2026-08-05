# Boot Whats — Plataforma

Fundação de uma plataforma SaaS B2B modular de comunicação empresarial:
multiempresa, RBAC granular, planos/assinaturas, marketplace de módulos e
painel administrativo. Módulos de canal (WhatsApp, Telegram, Instagram,
E-mail, SMS, IA) são fases futuras — esta base não implementa nenhum deles,
só a estrutura pronta para recebê-los.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v3 (ver
nota abaixo sobre por que não v4) · shadcn/ui · Prisma 7 (driver adapter
`@prisma/adapter-pg`) · PostgreSQL (Supabase) · Better Auth (email/senha +
plugins `organization`/`admin`).

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
2. **Tailwind v4 não funciona nesta máquina, nativo nem WASM** — por isso o
   projeto usa **Tailwind v3** (`tailwind.config.ts` + `postcss.config.mjs`
   clássicos), que roda 100% em JavaScript, sem nenhum binário. O motor
   nativo (`@tailwindcss/oxide`) é bloqueado como os outros; o fallback WASM
   oficial (`@tailwindcss/oxide-wasm32-wasi`) carrega sem erro, mas seu
   `Scanner.scan()` retorna sempre 0 classes nesta máquina — confirmado
   isolando o pacote diretamente, não é um problema de configuração. Como
   não existe um motor 100% JS para o v4 (só nativo ou WASM), não há
   contorno: quem quiser v4 de verdade precisa rodar numa máquina sem essa
   política.
3. **Prisma `schema-engine`** (usado por `prisma db push`/`migrate`) também é
   nativo e bloqueado aqui — mesmo o Prisma 7 já sendo "rust-free" para
   consultas (usa `@prisma/adapter-pg`, sem binário nativo nenhum para isso).
   Migrations são aplicadas manualmente com `npm run db:migrate:apply`
   (`scripts/apply-migrations.mjs`: conecta via `pg` puro, aplica toda pasta
   em `prisma/migrations/*` ainda não registrada e grava em
   `_prisma_migrations`, na ordem dos nomes/timestamps), para que
   `prisma migrate deploy` funcione normalmente a partir de qualquer outra
   máquina/CI sem essa restrição. Toda migration nova criada aqui só precisa
   da pasta com o `migration.sql` — o script pega automaticamente; ou rode
   `prisma migrate dev` numa máquina sem essa política.
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
