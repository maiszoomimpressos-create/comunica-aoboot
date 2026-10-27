import { prisma } from "@/lib/db/prisma";

/** Tenant-facing — lista completa (ativos e inativos) pra tela de gestão em
 * .../modulos/whatsapp/setores/[connectionId], com o pool de atendentes de
 * cada um. */
export function listSetoresForConnection(connectionId: string) {
  return prisma.setor.findMany({
    where: { connectionId },
    orderBy: { sortOrder: "asc" },
    include: { attendants: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Usado por bot-attendant.service.ts pra montar o enum dinâmico de
 * "escalarParaHumano" e o bloco do prompt — só setores ativos com pelo menos
 * um atendente ativo no pool, pra IA nunca poder escolher um setor "vazio"
 * (ver buildTools/buildSystemPrompt). */
export function listActiveSetoresWithAttendants(connectionId: string) {
  return prisma.setor.findMany({
    where: { connectionId, active: true, attendants: { some: { active: true } } },
    orderBy: { sortOrder: "asc" },
    include: { attendants: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
}

export function findSetorForTenant(tenantId: string, setorId: string) {
  return prisma.setor.findFirst({
    where: { id: setorId, tenantId },
    include: { attendants: true },
  });
}

export interface SetorAttendantInput {
  phone: string;
  label?: string | null;
}

/** Cria o setor e seu pool inicial numa única transação. */
export function createSetorRecord(
  tenantId: string,
  connectionId: string,
  data: { name: string; description: string | null; attendants: SetorAttendantInput[] }
) {
  return prisma.setor.create({
    data: {
      tenantId,
      connectionId,
      name: data.name,
      description: data.description,
      attendants: {
        create: data.attendants.map((a, i) => ({ phone: a.phone, label: a.label ?? null, sortOrder: i })),
      },
    },
    include: { attendants: true },
  });
}

/** Substitui a lista de atendentes inteira (delete-all-then-recreate dentro
 * da transação) — mais simples que diff pra uma coleção pequena e rara de
 * editar, mesmo idioma de outras listas tenant-editáveis neste código. A
 * checagem de posse (`tenantId`) é feita pelo chamador via
 * findSetorForTenant antes de chegar aqui. */
export function updateSetorRecord(
  setorId: string,
  data: { name?: string; description?: string | null; active?: boolean; attendants?: SetorAttendantInput[] }
) {
  return prisma.$transaction(async (tx) => {
    if (data.attendants) {
      await tx.setorAttendant.deleteMany({ where: { setorId } });
    }
    return tx.setor.update({
      where: { id: setorId },
      data: {
        name: data.name,
        description: data.description,
        active: data.active,
        ...(data.attendants
          ? {
              attendants: {
                create: data.attendants.map((a, i) => ({ phone: a.phone, label: a.label ?? null, sortOrder: i })),
              },
            }
          : {}),
      },
      include: { attendants: true },
    });
  });
}

export function deleteSetorRecord(setorId: string) {
  return prisma.setor.delete({ where: { id: setorId } });
}

/** Usado por setor.service.ts pra bloquear exclusão com atendimento em
 * andamento, com uma mensagem amigável antes do `onDelete: Restrict` bruto
 * do Prisma (ver RelaySession.setorId no schema). */
export function countLiveRelaySessionsForSetor(setorId: string) {
  return prisma.relaySession.count({ where: { setorId, status: { not: "CLOSED" } } });
}
