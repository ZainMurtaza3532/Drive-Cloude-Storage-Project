# Drivea

Drivea is a cloud file-storage application built with Next.js App Router, Prisma, and PostgreSQL. It supports account authentication, file and folder management, direct S3-compatible uploads, sharing, file version history, search, trash, and a browser-encrypted Vault. Stripe subscriptions provide the 100 GB Pro storage plan.

<<<<<<< HEAD
Live site: [https://drive-cloude-storage.vercel.app](https://drive-cloude-storage-project.vercel.app)
=======
>>>>>>> 8602bb0c060baed9dd2c208713f119592fa4fd9b

## Requirements

- Node.js compatible with the installed Next.js version
- npm
- PostgreSQL
- An S3-compatible storage bucket and credentials
- Stripe account and a recurring Price for the 100 GB plan

## Local Setup

1. Install dependencies and create a local environment file:

   ```bash
   npm install
   cp .env.example .env
   ```

2. Set the required values in `.env`. At minimum, configure:

   - `DATABASE_URL` for PostgreSQL
   - `NEXTAUTH_URL` and a unique `NEXTAUTH_SECRET`
   - `TWO_FACTOR_ENCRYPTION_KEY` as a 32-byte Base64 key
   - `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET_NAME`
   - `S3_ENDPOINT` when using a non-AWS S3-compatible provider

   Google and GitHub OAuth credentials are only needed to enable those sign-in providers. Stripe variables are required for billing: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_100GB`, and `STRIPE_WEBHOOK_SECRET`. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is available for client-side Stripe integrations.

3. Create or update the database schema, then start the development server:

   ```bash
   npx prisma db push
   npm run dev
   ```

   The app runs at [http://localhost:3000](http://localhost:3000). The `dev` script generates the Prisma client before starting Next.js.

## Stripe Webhooks

For local subscription testing, run the app and forward Stripe events to the webhook route:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the signing secret printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET`. Configure the Stripe endpoint to send `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` events. Active and trialing subscriptions receive the 100 GB storage limit; canceled or otherwise inactive subscriptions return to the free limit.

## Vercel Deployment

Set `NEXTAUTH_URL` in the Vercel project's **Production** environment to `https://drive-cloude-storage.vercel.app`, then redeploy. Keep `NEXTAUTH_URL` set to `http://localhost:3000` in the local `.env` file. Configure the production database, S3, authentication, encryption, Stripe, and Redis environment variables in Vercel as well; do not commit `.env` or secret values.

## Uploads and Storage

File contents upload directly from the browser to private S3-compatible storage using presigned requests. Small uploads use a single PUT; large uploads use resumable multipart transfers. The app enforces storage quota using the user's database values when preparing and completing uploads. Free accounts receive 5 GiB, and Pro accounts receive 100 GiB.

Production deployments should configure Redis for distributed rate limiting and upload-processing queues. See [ARCHITECTURE.md](ARCHITECTURE.md) for the request flow, deployment boundaries, and operational recommendations.

## Commands

```bash
npm run dev      # Start the development server
npm run build    # Build the production application
npm start        # Serve the production build
npx prisma generate
npx prisma db push
```

Keep `.env` and all secret keys out of source control. Use test-mode Stripe keys and a test Price for local billing development.
