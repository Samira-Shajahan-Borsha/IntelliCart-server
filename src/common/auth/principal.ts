import { AppError } from "../errors/app-error";

export type Role = "CUSTOMER" | "VENDOR" | "ADMIN";

/** Identity resolved by the backend from a verified access token and a live session row. */
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  role: Role;
}

/** Anything that may carry a resolved principal (RPC context, agent tool context, ...). */
export interface HasPrincipal {
  principal: AuthPrincipal | null;
}

export function requireAuth(ctx: HasPrincipal): AuthPrincipal {
  if (!ctx.principal)
    throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  return ctx.principal;
}

export function requireRole(
  ctx: HasPrincipal,
  ...roles: Role[]
): AuthPrincipal {
  const principal = requireAuth(ctx);
  if (!roles.includes(principal.role)) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission for this action.",
    );
  }
  return principal;
}
