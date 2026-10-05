# Drive Storage

Drive Storage is a web app built with Next.js App Router, Prisma, and PostgreSQL. It provides file and folder management, private S3-compatible uploads, sharing, search, version history, trash, a browser-encrypted Vault, and optional Stripe subscriptions.

**Live app:** [drive-cloude-storage.vercel.app](https://drive-cloude-storage.vercel.app)

## Features

- Email/password authentication with optional Google and GitHub sign-in
- Per-user files and folders, storage quotas, starring, trash, and search
- Direct-to-storage uploads using presigned S3-compatible requests and multipart transfers
- Public share links with expiry, bcrypt password protection, and enforced download limits
- Folder sharing with viewer/editor roles, public share links, comments, and version history
- Browser-side encrypted Vault
- Optional Stripe billing for the 100 GB Pro plan
- Upstash-backed distributed rate limiting when configured

## Stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS
- NextAuth.js with Prisma Adapter
- PostgreSQL and Prisma
- AWS S3-compatible object storage (configured here for providers such as Supabase Storage)
- Upstash Redis REST for rate limiting; standard Redis protocol for BullMQ queues
- Stripe subscriptions

## Requirements

- Node.js 20.9 or newer and npm
- PostgreSQL database
- Private S3-compatible bucket and credentials
- Optional: Upstash Redis, OAuth provider credentials, Stripe account

## Local Development

1. Install dependencies and create a local environment file. In PowerShell:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

2. Configure `.env` with a development database, S3 credentials, and authentication secrets. Required for the core app:

   - `DATABASE_URL`
   - `NEXTAUTH_URL` (use `http://localhost:3000` locally)
   - `NEXTAUTH_SECRET` (generate a unique secret, for example `openssl rand -base64 32`)
   - `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET_NAME`
   - `S3_ENDPOINT` when using a non-AWS S3-compatible provider
   - `SITE_URL` (use `http://localhost:3000` locally)

   Set `TWO_FACTOR_ENCRYPTION_KEY` (a 32-byte Base64 key) to enable authenticator-based two-factor sign-in. `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` enable Upstash distributed rate limiting. If neither Upstash nor the legacy `REDIS_URL` rate-limit backend is configured, checks are skipped with a server warning. If a configured backend is unavailable, protected requests fail with a service error.

   `REDIS_URL` is separate: it is used by BullMQ with a standard Redis connection, not the Upstash REST endpoint. Configure it when deploying queue processing. OAuth and Stripe variables are optional unless you enable those features. Never use production credentials for local development.

3. Point `DATABASE_URL` at a disposable local/development database, then create the schema and start Next.js:

   ```powershell
   npx prisma db push
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). The `dev` script generates the Prisma Client before starting the server.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Prisma |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Authentication callback URL and signing secret |
| `TWO_FACTOR_ENCRYPTION_KEY` | Encrypts stored two-factor secrets |
| `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` | Private object storage configuration |
| `S3_ENDPOINT` | S3-compatible provider endpoint; omit for AWS S3 defaults |
| `SITE_URL` | Canonical public origin used by metadata, sitemap, and robots.txt |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional distributed API rate limiting |
| `REDIS_URL` | Standard Redis connection for BullMQ queue operations |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google sign-in |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Optional GitHub sign-in |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_100GB`, `STRIPE_WEBHOOK_SECRET` | Optional Stripe billing |

Use `.env.example` as the variable-name reference. `.env` is ignored by Git; do not commit it or expose secret variables through `NEXT_PUBLIC_` names.

## Database Changes

The repository currently has no committed Prisma migration history. `prisma db push` above is for a disposable local database only; it is not a production deployment workflow.

For a new project, create the initial migration against an empty development database:

```powershell
npx prisma migrate dev --name init
```

Commit the generated `prisma/migrations` directory. Apply reviewed migrations to production with `npx prisma migrate deploy` from deployment tooling, using a production database URL kept in the deployment environment. Back up existing production data before schema changes. Never run `prisma migrate reset` or `prisma db push --force-reset` against production.

The migrations `20261005102000_add_share_link_controls` and `20261005104500_ensure_share_link_advanced_columns` add any missing advanced share-control columns to an existing `ShareLink` table. Apply them to the deployed database with `npx prisma migrate deploy` to enable expiry, password protection, and download limits. Their `ADD COLUMN IF NOT EXISTS` statements allow deployment when columns were already added manually. Until then, the app supports basic public links and preserves any existing password field it can read; it will not silently drop newly requested advanced protections.

## Uploads and Redis

File contents are sent from the browser directly to private S3-compatible storage; Next.js routes handle authorization, metadata, and short-lived presigned URLs rather than proxying file bytes. Larger files use multipart upload routes. Upload completion checks ownership/access and storage quota. Users can select or drop folders to upload their files with nested directory structure preserved. Uploads are queued with at most three files active at once and retry transient network failures twice.

Distributed rate limiting is optional when Redis credentials are absent. BullMQ uses `REDIS_URL` and requires a standard Redis-compatible service; the Upstash REST URL/token cannot be substituted for that connection. Queue enqueue errors are logged without undoing a completed upload. See [ARCHITECTURE.md](ARCHITECTURE.md) for trust boundaries and deployment considerations.

## Stripe Webhooks

For local testing, install Stripe CLI and forward events to the app:

```powershell
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Set the CLI-provided signing secret as `STRIPE_WEBHOOK_SECRET`. Configure the deployed Stripe endpoint to send `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Use Stripe test-mode keys and a test Price locally.

## Vercel Deployment

1. Configure the Production environment with production-only `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY`, S3 values, and `SITE_URL`.
2. Set `SITE_URL` to the canonical HTTPS origin, for example `https://drive-cloude-storage.vercel.app`. Set `NEXTAUTH_URL` to the app's deployed origin.
3. Add Upstash REST credentials if distributed rate limiting is desired. Add `REDIS_URL` only when deploying BullMQ producers/workers.
4. Configure OAuth and Stripe variables only for the providers/features enabled in production. Register the deployed Stripe webhook URL and use live Stripe credentials only after checking the Price and webhook configuration.
5. Apply database migrations with `prisma migrate deploy` before routing traffic. Use separate Preview and Production databases and environment variables.
6. Deploy and verify sign-in, upload/download, storage permissions, OAuth callbacks, billing webhooks, and `https://<your-domain>/robots.txt` plus `/sitemap.xml`.

## Commands

```powershell
npm run dev          # Development server (generates Prisma Client)
npm run build        # Production build
npm start            # Serve a completed production build
npx prisma generate  # Generate Prisma Client
npx prisma studio    # Inspect a configured development database
```
