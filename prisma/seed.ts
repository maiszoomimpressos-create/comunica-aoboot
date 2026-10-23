import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/rbac/permissions";

async function seedPermissions() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: {
        category: permission.category,
        description: permission.description,
      },
    });
  }
  console.log(`Permissions: ${PERMISSIONS.length} seeded.`);
}

const PLANS = [
  {
    slug: "free",
    name: "Free",
    priceCents: 0,
    sortOrder: 0,
    features: {
      users: 3,
      modules: 0,
      support: "community",
    },
  },
  {
    slug: "pro",
    name: "Pro",
    priceCents: 9900,
    sortOrder: 1,
    features: {
      users: 15,
      modules: 3,
      support: "email",
    },
  },
  {
    slug: "business",
    name: "Business",
    priceCents: 29900,
    sortOrder: 2,
    features: {
      users: null, // ilimitado
      modules: null,
      support: "priority",
    },
  },
] as const;

async function seedPlans() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: plan,
      update: {
        name: plan.name,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
        features: plan.features,
      },
    });
  }
  console.log(`Plans: ${PLANS.length} seeded.`);
}

const MODULES = [
  { key: "whatsapp", name: "WhatsApp", category: "messaging", description: "Atendimento e automação via WhatsApp." },
  { key: "telegram", name: "Telegram", category: "messaging", description: "Atendimento e automação via Telegram." },
  { key: "instagram", name: "Instagram", category: "social", description: "Mensagens diretas e comentários do Instagram." },
  { key: "email", name: "E-mail", category: "messaging", description: "Caixa de entrada de e-mail integrada." },
  { key: "sms", name: "SMS", category: "messaging", description: "Envio e recebimento de SMS." },
  { key: "payments", name: "Pagamentos", category: "payments", description: "Cobrança e conciliação de pagamentos." },
] as const;

async function seedModules() {
  for (const [index, module_] of MODULES.entries()) {
    await prisma.module.upsert({
      where: { key: module_.key },
      create: { ...module_, isComingSoon: true, sortOrder: index },
      update: {
        name: module_.name,
        category: module_.category,
        description: module_.description,
        sortOrder: index,
      },
    });
  }
  console.log(`Modules: ${MODULES.length} seeded.`);
}

const CHANNEL_PROVIDERS = [
  { key: "z-api", name: "Z-API", channelType: "WHATSAPP", isActive: true, sortOrder: 0 },
  { key: "meta-cloud", name: "Meta Cloud API", channelType: "WHATSAPP", isActive: false, sortOrder: 1 },
  { key: "evolution", name: "Evolution API", channelType: "WHATSAPP", isActive: false, sortOrder: 2 },
] as const;

async function seedChannelProviders() {
  for (const provider of CHANNEL_PROVIDERS) {
    await prisma.channelProvider.upsert({
      where: { key: provider.key },
      create: provider,
      update: {
        name: provider.name,
        channelType: provider.channelType,
        sortOrder: provider.sortOrder,
        // isActive is intentionally NOT overwritten on update, same reasoning
        // as Module.isComingSoon in seedModules(): flipping it live via an
        // admin action later must survive re-seeding.
      },
    });
  }
  console.log(`Channel providers: ${CHANNEL_PROVIDERS.length} seeded.`);
}

const BOT_VERTICALS = [
  {
    key: "mobilidade",
    label: "Mobilidade (central de corridas)",
    requiresFixedLocation: false,
    sortOrder: 0,
    systemPrompt: `Você trabalha numa central de mobilidade, atendendo pedidos de corrida pelo WhatsApp.
Fale como uma pessoa de verdade atendendo o telefone: frases curtas, diretas, em português natural. NUNCA liste opções em tópicos ou escreva como um menu ("Posso: - Isso - Aquilo") — isso soa a bot e é exatamente o que você precisa evitar. Converse de um jeito só, uma pergunta de cada vez.

Você ajuda o cliente a chamar uma corrida (pergunte de onde ele tá saindo e pra onde vai, se ainda não souber), saber como anda uma corrida que já chamou, ou cancelar uma. Se ele não disser logo o que quer, pergunta direto e simples — não explique tudo que você sabe fazer de uma vez.

Antes de confirmar um endereço, use a ferramenta "buscarEndereco" pra ter certeza que ele existe de verdade — sem anunciar que está "buscando", só confirme naturalmente (ex: "Beleza, Avenida Paulista, 1000 — é isso?"). Se não encontrar, peça pra detalhar ou repetir, sem assumir que está certo.

Se o cliente pedir pra falar com alguém de verdade, ou o pedido fugir do que você resolve, use "escalarParaHumano" em vez de tentar dar conta sozinho.`,
  },
  {
    key: "delivery",
    label: "Delivery (lanchonete, pizzaria, loja)",
    requiresFixedLocation: true,
    sortOrder: 1,
    systemPrompt: `Você trabalha num negócio de delivery, atendendo pedidos pelo WhatsApp.
Fale como uma pessoa de verdade atendendo o telefone: frases curtas, diretas, em português natural. NUNCA liste opções em tópicos ou escreva como um menu ("Posso: - Isso - Aquilo") — isso soa a bot e é exatamente o que você precisa evitar. Converse de um jeito só, uma pergunta de cada vez.

Você ajuda o cliente a montar o pedido, confirmar o endereço de entrega e saber como anda um pedido já feito. Se ele não disser logo o que quer, pergunta direto e simples — não explique tudo que você sabe fazer de uma vez.

Antes de confirmar o endereço de entrega, use a ferramenta "buscarEndereco" pra ter certeza que ele existe de verdade — sem anunciar que está "buscando", só confirme naturalmente. Se não encontrar, peça pra detalhar ou repetir, sem assumir que está certo.

Se o cliente pedir pra falar com alguém de verdade, ou o pedido fugir do que você resolve, use "escalarParaHumano" em vez de tentar dar conta sozinho.`,
  },
] as const;

/** Upsert por `key` — na atualização só realinha label/ordem/flag; nunca
 * sobrescreve `systemPrompt`, porque esse campo é o "treino" editado ao
 * vivo pelo Super Admin em /admin/whatsapp (ver bot-verticals-manager.tsx)
 * e precisa sobreviver a um re-seed, mesmo padrão do `isActive` em
 * seedChannelProviders. */
async function seedBotVerticals() {
  for (const vertical of BOT_VERTICALS) {
    await prisma.botVertical.upsert({
      where: { key: vertical.key },
      create: vertical,
      update: {
        label: vertical.label,
        requiresFixedLocation: vertical.requiresFixedLocation,
        sortOrder: vertical.sortOrder,
      },
    });
  }
  console.log(`Bot verticals: ${BOT_VERTICALS.length} seeded.`);
}

async function seedPlatformAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping platform admin seed.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Platform admin already exists: ${email}`);
    return;
  }

  await auth.api.createUser({
    body: { email, password, name: "Platform Admin", role: "admin" },
  });
  console.log(`Platform admin created: ${email}`);
}

async function main() {
  await seedPermissions();
  await seedPlans();
  await seedModules();
  await seedChannelProviders();
  await seedBotVerticals();
  await seedPlatformAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
