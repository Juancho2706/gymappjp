# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Canonical architecture doc: `AGENTS.md`. Extended docs (Spanish): `nuevabibliadelaapp/`.

---

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run typecheck    # tsc --noEmit (run before committing)
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright E2E (headless)
```

**Single test file:**
```bash
npx vitest run src/path/to/file.test.ts
```

**Supabase migrations:**
```bash
npx supabase migration new <name>   # Creates supabase/migrations/<timestamp>_<name>.sql
npx supabase db push                # Apply to remote
```

After schema changes: regenerate `src/lib/database.types.ts`.

---

## Architecture

**B2B2C white-label SaaS.** Coaches manage clients; each coach gets a branded PWA.

Two protected zones:
- `/coach/*` — coach dashboard (analytics, builder, nutrition, settings, subscription)
- `/c/[coach_slug]/*` — client white-label app (workout execution, nutrition log, check-in)

### Module pattern (mandatory)

```
module/
├── page.tsx              # RSC — fetches data, renders
├── loading.tsx           # Streaming skeleton
├── _data/
│   └── module.queries.ts # React.cache queries
├── _actions/
│   └── module.actions.ts # Server actions + Zod validation
└── _components/          # 'use client' components
```

Data flow: RSC fetches via `React.cache` → props to client components → server actions → `revalidatePath()`.

### State

- Local: `useState` / `useReducer`
- Pending: `useTransition`
- Forms: `useActionState`
- Optimistic: `useOptimistic` (workout logs, nutrition meals)
- Global: React Context only (`WorkoutTimerProvider`, `LanguageContext`)
- **No Redux, Zustand, SWR, React Query.**

### Key libraries / decisions

| Area | Choice | Why |
|------|--------|-----|
| DB/Auth | Supabase (PostgreSQL + RLS + Storage) | All-in-one |
| Styling | Tailwind CSS v4 — `@theme` in CSS, no `tailwind.config` | — |
| UI | shadcn/ui + @base-ui/react + Radix primitives | — |
| Forms | react-hook-form + Zod v4 | — |
| DnD | @dnd-kit | Touch-safe, maintained |
| Payments | MercadoPago pre-approvals | Only CLP recurring gateway |
| PWA | Manual `public/sw.js` | Dynamic per-coach manifests |

---

## Code Rules

### Mobile viewport
- **Never** `h-screen` / `min-h-screen` / `100vh` outside `md:` breakpoint
- Use `h-dvh` / `min-h-dvh` / `100dvh`
- Fixed elements at edges: `pl-safe pr-safe pt-safe pb-safe` (utilities in `globals.css`)
- Horizontal scroll: `overflow-x: clip` on `html`, never `overflow-x: hidden`

### Queries
- `SELECT` specific columns — never `SELECT *` on catalog tables
- `React.cache` for deduplication (not `unstable_cache` — incompatible with Supabase SSR)
- `Promise.all()` for parallel queries

### Validation
- Zod v4 on **both** client (react-hook-form) and server (server actions)

### Images
- `<Image>` from Next.js everywhere — zero raw `<img>` tags

### Base UI Select quirk
- `SelectPrimitive.Value` renders raw `value`, not label — pass explicit children with label map

### Colors
- `SYSTEM_PRIMARY_COLOR = '#007AFF'` — coach without branding
- `BRAND_PRIMARY_COLOR = '#10B981'` — EVA brand / landing
- Always add dark mode variants to new components

---

## Database

26 tables, 22 RPC functions. Key tables: `coaches`, `clients`, `workout_programs`, `workout_plans`, `workout_plan_blocks`, `workout_logs`, `nutrition_plans`, `nutrition_meals`, `nutrition_meal_logs`, `foods`, `check_ins`.

Migrations: `supabase/migrations/` with ISO timestamp prefix.  
RLS enabled on 24 tables — coach-scoped and client-scoped policies.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client/middleware anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin ops |
| `MERCADOPAGO_ACCESS_TOKEN` | MP server token |
| `MERCADOPAGO_WEBHOOK_TOKEN` | MP webhook HMAC protection |
| `UPSTASH_REDIS_REST_URL` / `_REST_TOKEN` | Rate limiting (prod) |
