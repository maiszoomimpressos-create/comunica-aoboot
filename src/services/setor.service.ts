import {
  listSetoresForConnection,
  findSetorForTenant,
  createSetorRecord,
  updateSetorRecord,
  deleteSetorRecord,
  countLiveRelaySessionsForSetor,
  type SetorAttendantInput,
} from "@/repositories/setor.repository";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/server/errors";

const PHONE_DIGITS_ONLY = /^\d{10,}$/;

export interface SetorFormInput {
  name: string;
  description: string | null;
  attendants: SetorAttendantInput[];
}

function validateSetorInput(input: SetorFormInput) {
  if (!input.name.trim()) throw new ValidationError("Informe o nome do setor.");
  if (input.attendants.length === 0) throw new ValidationError("Adicione ao menos um número de atendente.");
  const invalid = input.attendants.find((a) => !PHONE_DIGITS_ONLY.test(a.phone));
  if (invalid) {
    throw new ValidationError(
      `Número inválido: "${invalid.phone}". Use só dígitos, DDI + DDD + número (ex: 5511999999999).`
    );
  }
}

export function listSetores(connectionId: string) {
  return listSetoresForConnection(connectionId);
}

export async function createSetor(tenantId: string, connectionId: string, input: SetorFormInput) {
  validateSetorInput(input);
  return createSetorRecord(tenantId, connectionId, {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    attendants: input.attendants,
  });
}

export async function updateSetor(tenantId: string, setorId: string, input: SetorFormInput) {
  validateSetorInput(input);
  const existing = await findSetorForTenant(tenantId, setorId);
  if (!existing) throw new NotFoundError("Setor não encontrado.");
  return updateSetorRecord(setorId, {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    attendants: input.attendants,
  });
}

export async function setSetorActive(tenantId: string, setorId: string, active: boolean) {
  const existing = await findSetorForTenant(tenantId, setorId);
  if (!existing) throw new NotFoundError("Setor não encontrado.");
  return updateSetorRecord(setorId, { active });
}

/** Bloqueia a exclusão com uma mensagem amigável quando há atendimento em
 * andamento (RelaySession não-CLOSED referenciando o setor) — o
 * `onDelete: Restrict` no schema é a garantia de última linha, isto aqui é
 * só pra não vazar o erro bruto do Postgres pra UI. */
export async function deleteSetor(tenantId: string, setorId: string) {
  const existing = await findSetorForTenant(tenantId, setorId);
  if (!existing) throw new NotFoundError("Setor não encontrado.");
  const liveSessions = await countLiveRelaySessionsForSetor(setorId);
  if (liveSessions > 0) {
    throw new ConflictError("Não é possível excluir: há um atendimento em andamento neste setor.");
  }
  return deleteSetorRecord(setorId);
}
