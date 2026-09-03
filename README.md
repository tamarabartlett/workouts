# Workouts

Personal workout log. The Angular app talks to serverless API routes that store data in **MongoDB Atlas**. Production runs on **Vercel**.

Login is a single username and password that you set yourself. Workouts persist in MongoDB, not in the browser (except a one-time migration from older localStorage data).

---

## Prerequisites

- **Node.js** 20.19+ or 22.12+ (and npm)
- A **[MongoDB Atlas](https://www.mongodb.com/atlas)** cluster and connection string
- **[Vercel CLI](https://vercel.com/docs/cli)** for the local API (`npm i -g vercel`, or use `npx vercel`)

---

## One-time setup

Do this once on a new machine (or after cloning).

### 1. Install dependencies

```bash
npm install
```

### 2. Create a MongoDB Atlas database

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Under **Database Access**, create a database user with a password.
3. Under **Network Access**, allow your current IP (for local use). For Vercel, also allow `0.0.0.0/0` or [Vercel’s IP ranges](https://vercel.com/docs/security/deployment-protection#ip-blocking).
4. On the cluster, click **Connect → Drivers** and copy the connection string. It looks like:

   `mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/workouts?retryWrites=true&w=majority`

   Replace `USER` and `PASSWORD`. A database name in the path (`workouts` above) is recommended.

### 3. Create `.env.local`

```bash
cp .env.example .env.local
```

Fill in every required value:

| Variable | How to set it |
|----------|----------------|
| `ALLOWED_USERNAME` | The login name you want (plain text). |
| `ALLOWED_PASSWORD_HASH` | Bcrypt hash of your password (see below). **Do not put the raw password here.** |
| `SESSION_SECRET` | Long random string, 32+ characters. |
| `MONGODB_URI` | Atlas connection string from step 2. |

Generate the password hash:

```bash
npm run hash-password -- "your-password"
```

Paste the printed hash into `ALLOWED_PASSWORD_HASH`.

Generate a session secret:

```bash
openssl rand -base64 32
```

Paste that into `SESSION_SECRET`.

Optional: `CORS_ORIGIN` defaults to `http://localhost:4200` for local API calls. You only need to set it if the Angular app is on a different origin.

`.env.local` is gitignored. Never commit it.

`npm start` / `npm run build` / `npm install` automatically generate `src/auth-secrets.generated.ts` from these values. You do not run that script yourself.

### 4. Log in to Vercel (needed for the local API)

`npm run dev:api` runs `vercel dev`. On a new machine:

```bash
npx vercel login
```

The first `npm run dev:api` may ask you to link this folder to a Vercel project. That is expected; you can create a new project or skip linking and still run locally if `.env.local` is set.

---

## Run locally

You need **two terminals**. The Angular app (port 4200) proxies `/api` to the API (port 3000).

**Terminal 1 — API**

```bash
npm run dev:api
```

Wait until Vercel reports it is listening on port 3000.

**Terminal 2 — Angular**

```bash
npm start
```

Open **http://localhost:4200** and sign in with the username and password you chose (the password is the one you hashed, not the hash itself).

If login fails or workouts do not load, check that both processes are running and that `.env.local` has all four required variables.

---

## Deploy to Vercel

The repo is already set up: `vercel.json` builds the Angular app and serves `/api` as serverless functions.

### Option A — Dashboard (connect the GitHub repo)

1. Import the repo at [vercel.com/new](https://vercel.com/new). Framework / build settings can stay on the defaults from `vercel.json` (`npm run build`, output `dist/workouts/browser`).
2. Add the **same four environment variables** as `.env.local`:
   - `ALLOWED_USERNAME`
   - `ALLOWED_PASSWORD_HASH`
   - `SESSION_SECRET`
   - `MONGODB_URI`

   Apply them to **Production** (and **Preview** if you want preview deploys to work).
3. Deploy. After it finishes, open the Vercel URL and log in.

### Option B — CLI

```bash
npx vercel login
npx vercel link          # once, if this folder is not linked yet
```

Add env vars in the Vercel dashboard (Project → Settings → Environment Variables), or with the CLI:

```bash
npx vercel env add ALLOWED_USERNAME
npx vercel env add ALLOWED_PASSWORD_HASH
npx vercel env add SESSION_SECRET
npx vercel env add MONGODB_URI
```

Then:

```bash
npm run deploy
```

That runs `vercel --prod`.

### After deploy

- In Atlas, production traffic will fail if the cluster only allows your home IP. Allow `0.0.0.0/0` or Vercel’s IPs.
- Changing env vars on Vercel requires a **redeploy** before they take effect.
- Use a different `SESSION_SECRET` in production than you use locally if you want sessions isolated.

---

## Import and export

**Export** downloads the current history as `workoutHistory.json`.

**Import** merges a `workoutHistory.json` file into saved workouts. If an imported workout shares a **calendar date** with an existing one but differs in exercises, sets, or notes, a dialog shows both versions. You choose **Keep current** or **Use import** per date.

`workoutHistory.example.json` is a sample of the file shape.

---

## Legacy localStorage

Older versions stored workouts in the browser. If MongoDB is empty and the browser still has that data, it is uploaded once on first load and then removed from `localStorage`.
