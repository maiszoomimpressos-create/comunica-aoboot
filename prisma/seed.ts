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
