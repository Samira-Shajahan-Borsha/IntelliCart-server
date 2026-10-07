# ShopWise AI Backend

Backend-only ShopWise AI implementation using NestJS, WebRPC/RIDL, Prisma, PostgreSQL, and pgvector.

## Architecture

Normal application calls follow this dependency direction:

```text
WebRPC client
  -> generated WebRPC dispatcher
  -> Nest RPC adapter and domain handler
  -> application service
  -> feature repository
  -> Prisma
  -> PostgreSQL
```

Generated code lives in `src/generated/webrpc` and is regenerated from `rpc/shopwise.ridl`; it is never edited by hand. RPC handlers own transport validation, trusted request context, envelope mapping, and safe error mapping. Domain services own business rules. Only repositories inject Prisma.

The folder conventions are adapted from the inspected `profileai_backend` reference: feature-first modules, colocated schemas/services/tests, split Prisma schemas, and small shared infrastructure areas. NestJS and WebRPC-specific boundaries take precedence where the reference Express structure is not directly compatible.

## Planned backend modules

- Authentication and sessions
- Users, preferences, addresses, activity, and devices
- Catalog, categories, brands, products, vendors, listings, and inventory
- Wishlist and cart
- Orders, payments, and shipments
- Reviews and grounded review summaries
- Search, embeddings, image retrieval, and recommendations
- Conversations, Shopping Agent, and Business Agent
- Notifications
- Vendor portal
- Administration
- Analytics and forecasting
- AI/ML operations and background jobs

Folders are created only when a vertical slice has working code.

## Implemented slice

Authentication and session entry covers PRD API-001 through API-008:

- customer registration with normalized unique email and Argon2id hashing
- login with account-enumeration resistance
- short-lived access tokens backed by live revocable sessions
- single-use rotating refresh tokens stored only as hashes
- HttpOnly refresh cookies and double-submit CSRF protection
- logout/session revocation
- non-enumerating password reset request
- atomic password reset plus revocation of all account sessions
- atomic email verification and verification resend policy
- per-method authentication rate limits
- safe structured logging and PRD-compatible errors

See `docs/api/authentication.md` for the REST-to-RPC contract map.

## Local setup

1. Copy `.env.example` to `.env` and replace the development-only secrets.
2. Start PostgreSQL with `npm run db:up`.
3. Apply migrations with `npm run prisma:deploy`.
4. Generate the Prisma client and WebRPC bindings with `npm run prisma:generate` and `npm run rpc:generate`.
5. Start the service with `npm run start:dev`.

## Quality commands

```text
npm run format:check
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:e2e
npm run build
```
