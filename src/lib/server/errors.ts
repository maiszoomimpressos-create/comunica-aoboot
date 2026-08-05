export class AppError extends Error {
  code = "INTERNAL_ERROR";
  status = 500;
}

export class UnauthorizedError extends AppError {
  code = "UNAUTHORIZED";
  status = 401;
  constructor(message = "Autenticação necessária.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  code = "FORBIDDEN";
  status = 403;
  constructor(message = "Você não tem permissão para fazer isso.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  code = "NOT_FOUND";
  status = 404;
  constructor(message = "Não encontrado.") {
    super(message);
  }
}

export class ValidationError extends AppError {
  code = "VALIDATION_ERROR";
  status = 422;
  details?: unknown;
  constructor(message = "Dados inválidos.", details?: unknown) {
    super(message);
    this.details = details;
  }
}

export class ConflictError extends AppError {
  code = "CONFLICT";
  status = 409;
  constructor(message = "Conflito com o estado atual.") {
    super(message);
  }
}

export function toErrorPayload(err: unknown): { code: string; message: string; details?: unknown } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, details: (err as ValidationError).details };
  }
  // Better Auth throws its own APIError (from the `better-call` router) for
  // things like "invalid credentials" or "user already exists" — surface
  // its message instead of a generic one, without importing better-auth
  // here (duck-typed: { status, body: { message, code } }).
  if (isLikeAuthApiError(err)) {
    return {
      code: err.body?.code ?? "AUTH_ERROR",
      message: err.body?.message ?? err.message ?? "Falha de autenticação.",
    };
  }
  console.error(err);
  return { code: "INTERNAL_ERROR", message: "Algo deu errado. Tente novamente." };
}

function isLikeAuthApiError(
  err: unknown
): err is Error & { status: unknown; body?: { message?: string; code?: string } } {
  return (
    err instanceof Error &&
    "status" in err &&
    (err as { name?: string }).name === "APIError"
  );
}
