import type { User } from "@prisma/client";

/** Safe UserDTO projection (PRD 10.1). Hashes, token data and internal timestamps are excluded. */
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: User["role"];
  status: User["status"];
  emailVerified: boolean;
  avatarUrl?: string;
  createdAt: string;
}

export const toUserDTO = (user: User): UserDTO => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone ?? undefined,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerifiedAt !== null,
  avatarUrl: user.avatarUrl ?? undefined,
  createdAt: user.createdAt.toISOString(),
});
