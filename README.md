# Workouts

Angular workout log with workouts stored in **MongoDB Atlas** and serverless API routes on **Vercel**.

## Prerequisites

- Node.js 20.19+ (or 22.12+)
- [MongoDB Atlas](https://www.mongodb.com/atlas) cluster and connection string
- [Vercel CLI](https://vercel.com/docs/cli) for local API development (`npm i -g vercel` or use `npx vercel`)

## Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Description |
|----------|-------------|
| `ALLOWED_USERNAME` | Login username |
| `ALLOWED_PASSWORD_HASH` | Bcrypt hash (`npm run hash-password -- "your-password"`) |
| `SESSION_SECRET` | Random secret for session cookies (`openssl rand -base64 32`) |
| `MONGODB_URI` | Atlas connection string |

On Vercel, add the same variables under **Project → Settings → Environment Variables** for Production (and Preview if needed).

The `generate-auth-secrets.mjs` script still writes `src/auth-secrets.generated.ts` for builds that expect it; login is validated on the server via `/api/auth/login`.

## Local development

Run **two** processes:

1. **API** (port 3000):

   ```bash
   npm run dev:api
   ```

2. **Angular** (port 4200, proxies `/api` to the API):

   ```bash
   npm start
   ```

Open `http://localhost:4200`.

## Deploy to Vercel

1. Connect the repo to Vercel.
2. Set environment variables (`ALLOWED_USERNAME`, `ALLOWED_PASSWORD_HASH`, `SESSION_SECRET`, `MONGODB_URI`).
3. Deploy. `vercel.json` builds the Angular app and deploys `/api` serverless functions.

In Atlas, allow network access from anywhere (`0.0.0.0/0`) or use [Vercel's IP ranges](https://vercel.com/docs/security/deployment-protection#ip-blocking) if you restrict by IP.

## Import

Importing `workoutHistory.json` merges with saved workouts. If an imported workout shares a **calendar date** with an existing one but differs in exercises, sets, or notes, a dialog shows both versions and lets you choose **Keep current** or **Use import** per date.

## Export

**Export** downloads the current in-app history as `workoutHistory.json` (same schema as before).

## Legacy localStorage

If the database is empty but the browser still has data from an older version, that data is uploaded once on first load and removed from `localStorage`.
