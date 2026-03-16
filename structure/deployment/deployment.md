# Deployment

## Overview

StudyFlow is deployed as a static SPA on **Vercel**, with source code on **GitHub** and the database on **Supabase**.

| Service | Role | Plan |
|---------|------|------|
| GitHub | Source code repository | Free |
| Vercel | Hosting, CDN, automatic deploys | Free (Hobby) |
| Supabase | PostgreSQL database, auth, realtime | Free |

## GitHub Repository

- **Repo:** `github.com/Ibrahem-al/not_quizlet_2`
- **Branch:** `master`
- Pushes to `master` trigger automatic Vercel deployments
- `.env` and `.env.local` are gitignored — credentials never enter the repo
- `.env.example` is committed as a template for other developers

## Vercel

### Connection
Vercel is connected to the GitHub repo. Every push to `master` triggers a build and deploy automatically.

### Build Settings
| Setting | Value |
|---------|-------|
| Framework Preset | Vite |
| Build Command | `npm run build` (runs `vite build`) |
| Output Directory | `dist` |
| Install Command | `npm install` |

### SPA Routing

**File:** `vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/((?!assets|favicon|manifest|sw|workbox|registerSW).*)",
      "destination": "/index.html"
    }
  ]
}
```

All routes (e.g., `/sets/abc-123`, `/shared/token-uuid`) are rewritten to `index.html` so React Router handles them client-side. Static assets are excluded from the rewrite.

### Environment Variables

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Required | Where to find it |
|----------|----------|------------------|
| `VITE_SUPABASE_URL` | Yes (for cloud features) | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes (for cloud features) | Supabase Dashboard → Settings → API → `anon` `public` key |

These are baked into the JS bundle at build time via Vite's `import.meta.env`. After adding or changing them, you must redeploy.

The app also checks `window.__VITE_SUPABASE_URL__` and `window.__VITE_SUPABASE_ANON_KEY__` at runtime as a fallback, allowing injection via a `<script>` tag if needed.

**Without these variables**, the app still works fully offline — all cloud/auth/sharing features are simply hidden or disabled.

### Commands to set env vars via CLI
```bash
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_ANON_KEY
npx vercel --prod   # redeploy with new vars
```

## Supabase Database

### Project Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor**
3. Paste and run the migration file: `supabase/migrations/001_initial_schema.sql`
4. Copy the **Project URL** and **anon key** from Settings → API

### What the Migration Creates

**9 tables:**

| Table | Purpose |
|-------|---------|
| `study_sets` | Flashcard sets with embedded cards as JSONB |
| `folders` | Folder hierarchy for organizing sets |
| `folder_items` | Maps sets to folders |
| `password_history` | Last 5 password hashes per user |
| `failed_login_attempts` | Rate limiting (5 attempts / 30 min) |
| `password_reset_requests` | Rate limiting (5 resets / hour) |
| `live_game_sessions` | Multiplayer game lobbies |
| `live_game_participants` | Players in live games |
| `live_game_answers` | Answers submitted during live games |

**Row Level Security (RLS):**
- Every table has RLS enabled
- `study_sets`: owner has full CRUD; anyone can SELECT sets that have a `share_token` (for share links)
- `folders` / `folder_items`: owner-only access
- `live_game_*`: open read/insert for guest players (no auth required to join a game)
- `password_history`: owner can only read their own records

**10 RPC functions** for security operations (lockout checks, password reuse, cleanup, game codes, shared set fetching).

**Indexes** are kept minimal to stay within the free tier — only on the columns used in WHERE clauses (`user_id`, `share_token`, `folder_id`, `game_code`).

### Schema Design Decisions
- **Cards stored as JSONB inside `study_sets`** — denormalized to avoid extra tables/joins. A set with 100 cards is one row, not 101. This minimizes row counts on the free tier.
- **`share_token` is a nullable UUID** — when set, anyone with the token can view the set. Tokens are unguessable (128-bit random). Setting it to NULL revokes access instantly.
- **Timestamps are BIGINT milliseconds** — matches JavaScript's `Date.now()` format directly, avoiding timezone conversion issues.

### Free Tier Limits to Be Aware Of
| Resource | Free Tier Limit |
|----------|----------------|
| Database size | 500 MB |
| API requests | 500K / month |
| Realtime connections | 200 concurrent |
| Auth users | 50K MAU |
| Storage | 1 GB |

The app is designed to work within these limits:
- Cards are embedded in sets (fewer rows)
- Sync is debounced (fewer writes)
- Public set listings use lightweight queries (card count, not full cards)

## Environment Files

| File | Purpose | In git? |
|------|---------|---------|
| `.env.example` | Template with variable names, no secrets | Yes |
| `.env.local` | Local development credentials | No (`*.local` in gitignore) |
| `.env` | Alternative local credentials | No (in gitignore) |
| Vercel env vars | Production credentials | N/A (in Vercel dashboard) |

## Build Scripts

```json
{
  "dev": "vite",
  "build": "vite build",
  "typecheck": "tsc -b",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

- `npm run build` — production build (used by Vercel). Runs Vite only, no TypeScript check (for CI speed/reliability).
- `npm run typecheck` — standalone TypeScript check. Run locally before pushing.
- `npm run dev` — local dev server at `http://localhost:5173`

## PWA Configuration

**File:** `vite.config.ts`

```typescript
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg'],
  manifest: {
    name: 'StudyFlow',
    short_name: 'StudyFlow',
    description: 'Offline-first flashcard and study application',
    theme_color: '#6366f1',
    background_color: '#ffffff',
    display: 'standalone',
    icons: [
      { src: '/favicon.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/favicon.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
  },
})
```

- **Service Worker**: Auto-generated, auto-updates on new deployments
- **Offline Support**: All assets cached; IndexedDB provides data persistence
- **Installable**: Meets PWA criteria — can be added to home screen on mobile
- **Display Mode**: `standalone` (no browser chrome)

## Deployment Workflow

```
Developer pushes to master
         ↓
GitHub receives push
         ↓
Vercel detects change (webhook)
         ↓
Vercel runs: npm install → npm run build
         ↓
Vite bundles app → dist/ folder
         ↓
vite-plugin-pwa generates service worker
         ↓
Vercel deploys dist/ to CDN edge nodes
         ↓
Live at your-project.vercel.app
```

## Browser Support

- Target: ES2022-compatible browsers
- Chrome 94+, Firefox 93+, Safari 15+, Edge 94+
- IndexedDB required for data storage
- Service Worker required for PWA/offline functionality
