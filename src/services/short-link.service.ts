import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  SHORT_LINK_DESCRIPTION_MAX_LENGTH,
  SHORT_LINK_SLUG_MAX_LENGTH,
  SHORT_LINK_TITLE_MAX_LENGTH,
  buildShortLinkUrl,
  generateShortLinkSlug,
  isValidShortLinkSlug,
  normalizeShortLinkSlug,
  normalizeShortLinkTarget,
} from "@/config/short-links";
import {
  createShortLink,
  deleteShortLink,
  getShortLinkBySlug,
  getShortLinkForTenant,
  listShortLinks,
  updateShortLink,
} from "@/repositories/short-link.repository";

export interface ShortLinkView {
  id: string;
  slug: string;
  shortUrl: string;
  targetUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  clicks: number;
  lastClickAt: string | null;
  createdAt: string;
}

export interface SaveShortLinkInput {
  id?: string;
  slug?: string | null;
  targetUrl: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function slugInUse(): ValidationError {
  return new ValidationError("Esse link curto já está em uso — escolha outro nome.");
}

export function validateSlugOrThrow(raw: string | null | undefined): string | null {
  const slug = normalizeShortLinkSlug(raw);
  if (!slug) return null;
  if (!isValidShortLinkSlug(slug)) {
    throw new ValidationError(
      `Link curto inválido: use só letras minúsculas, números e hífen (até ${SHORT_LINK_SLUG_MAX_LENGTH}).`
    );
  }
  return slug;
}

function cleanOptional(value: string | null | undefined, max: number, label: string): string | null {
  const v = value?.trim() || null;
  if (v && v.length > max) throw new ValidationError(`${label} pode ter no máximo ${max} caracteres.`);
  return v;
}

export function toShortLinkView(
  origin: string,
  link: {
    id: string;
    slug: string;
    targetUrl: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    clicks: number;
    lastClickAt: Date | null;
    createdAt: Date;
  }
): ShortLinkView {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: buildShortLinkUrl(origin, link.slug),
    targetUrl: link.targetUrl,
    title: link.title,
    description: link.description,
    imageUrl: link.imageUrl,
    clicks: link.clicks,
    lastClickAt: link.lastClickAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}

export async function listShortLinksForTenant(tenantId: string, origin: string): Promise<ShortLinkView[]> {
  const rows = await listShortLinks(tenantId);
  return rows.map((row) => toShortLinkView(origin, row));
}

/** Cria/edita um link curto da empresa. Slug opcional (gera um se vazio);
 * único no sistema todo. */
export async function saveShortLinkForTenant(
  tenantId: string,
  input: SaveShortLinkInput,
  extra: { connectionId?: string | null } = {}
) {
  const targetUrl = normalizeShortLinkTarget(input.targetUrl);
  if (!targetUrl) throw new ValidationError("Informe a URL de destino completa (começando com https://).");
  const title = cleanOptional(input.title, SHORT_LINK_TITLE_MAX_LENGTH, "O título");
  const description = cleanOptional(input.description, SHORT_LINK_DESCRIPTION_MAX_LENGTH, "A descrição");
  const imageUrl = input.imageUrl?.trim() ? normalizeShortLinkTarget(input.imageUrl) : null;
  if (input.imageUrl?.trim() && !imageUrl) throw new ValidationError("A imagem precisa ser uma URL https:// válida.");

  let slug = validateSlugOrThrow(input.slug);

  const current = input.id ? await getShortLinkForTenant(tenantId, input.id) : null;
  if (input.id && !current) throw new NotFoundError("Link curto não encontrado.");

  if (slug) {
    const owner = await getShortLinkBySlug(slug);
    if (owner && owner.id !== current?.id) throw slugInUse();
  } else if (current) {
    slug = current.slug;
  }

  const data = (s: string) => ({
    slug: s,
    targetUrl,
    title,
    description,
    imageUrl,
    ...(extra.connectionId !== undefined ? { connectionId: extra.connectionId } : {}),
  });

  try {
    if (current) return await updateShortLink(current.id, data(slug!));
    if (slug) return await createShortLink(tenantId, data(slug));
    for (let i = 0; i < 6; i++) {
      const candidate = generateShortLinkSlug(i < 3 ? 6 : 8);
      if (await getShortLinkBySlug(candidate)) continue;
      try {
        return await createShortLink(tenantId, data(candidate));
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new ValidationError("Não consegui gerar um link curto agora — tente de novo.");
  } catch (err) {
    if (isUniqueViolation(err)) throw slugInUse();
    throw err;
  }
}

/** Usado pelo convite pós-corrida: garante o slug apontando pro destino,
 * criando se não existir, atualizando se já for da empresa. */
export async function ensureShortLinkForTenant(
  tenantId: string,
  slug: string,
  data: Omit<SaveShortLinkInput, "id" | "slug">,
  connectionId: string | null
) {
  const existing = await getShortLinkBySlug(slug);
  if (existing && existing.tenantId !== tenantId) throw slugInUse();
  return saveShortLinkForTenant(tenantId, { ...data, id: existing?.id, slug }, { connectionId });
}

export async function deleteShortLinkForTenant(tenantId: string, id: string) {
  const deleted = await deleteShortLink(tenantId, id);
  if (!deleted) throw new NotFoundError("Link curto não encontrado.");
  return { id };
}
