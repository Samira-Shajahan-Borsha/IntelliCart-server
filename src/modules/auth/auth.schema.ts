import { z } from "zod";

/** Emails are normalized before uniqueness checks (PRD 7.1 "unique normalized email"). */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must be at most 254 characters.")
  .pipe(z.email("Email must be a valid email address."));

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Za-z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one digit.");

/** Opaque single-use tokens are base64url strings issued by the backend. */
const opaqueToken = z
  .string()
  .trim()
  .min(20, "Token is invalid.")
  .max(256, "Token is invalid.")
  .regex(/^[A-Za-z0-9_-]+$/, "Token is invalid.");

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name must be at most 100 characters."),
  email,
  password,
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9]{7,15}$/,
      "Phone must be 7-15 digits with an optional leading +.",
    )
    .optional(),
});

/** Login only bounds sizes; password rules are not re-applied so legacy passwords still work. */
export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Password is required.")
    .max(128, "Password must be at most 128 characters."),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  resetToken: opaqueToken,
  newPassword: password,
});

export const verifyEmailSchema = z.object({ token: opaqueToken });

export const resendVerificationSchema = z.object({ email: email.optional() });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
