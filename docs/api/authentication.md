# Authentication and Session RPC Contracts

The primary API is WebRPC under `/rpc/AuthService`. The original PRD REST contracts remain the traceability and behavior baseline.

| PRD contract | WebRPC method | Access | Result |
| --- | --- | --- | --- |
| API-001 `POST /auth/register` | `AuthService.Register` | Public | Creates a CUSTOMER account and session |
| API-002 `POST /auth/login` | `AuthService.Login` | Public | Authenticates and creates a device session |
| API-003 `POST /auth/refresh` | `AuthService.Refresh` | Refresh cookie plus CSRF | Rotates the refresh credential |
| API-004 `POST /auth/logout` | `AuthService.Logout` | Authenticated session | Revokes the current session |
| API-005 `POST /auth/forgot-password` | `AuthService.ForgotPassword` | Public | Sends a non-enumerating reset response |
| API-006 `POST /auth/reset-password` | `AuthService.ResetPassword` | Public plus reset token | Atomically resets password and revokes sessions |
| API-007 `POST /auth/verify-email` | `AuthService.VerifyEmail` | Public plus verification token | Atomically verifies email |
| API-008 `POST /auth/resend-verification` | `AuthService.ResendVerification` | Authenticated user or public email policy | Replaces and sends a verification token |

## Session security

The response body contains a short-lived access token and CSRF token. The refresh credential is set only as an HttpOnly cookie scoped to `/rpc/AuthService`. Refresh and cookie-authenticated logout require the CSRF header to match the readable CSRF cookie. Refresh credentials are random high-entropy values; only SHA-256 hashes are persisted. Every authenticated call resolves the access token and rechecks the live session and current account role/status.

## Error behavior

Expected failures use generated WebRPC errors with stable PRD names and HTTP meanings, including `VALIDATION_ERROR` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `CONFLICT` (409), and `RATE_LIMITED` (429). Unexpected infrastructure errors are logged with a request ID and returned as a generic `INTERNAL_ERROR` without database details or stack traces.
