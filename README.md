# EVA Fitness Platform

**B2B2C white-label SaaS for fitness coaches and personal trainers.**

Each coach gets a branded PWA — their own logo, colors, and domain — that their clients install as a native-like app. Built with Next.js 15, Supabase, and Tailwind CSS v4.

---

## Features

- **Workout Builder** — Drag-and-drop program builder with 230+ exercises (animated GIFs, instructions, A/B variants).
- **Workout Execution** — Client-facing timer, set logging (weight/reps/RIR), PR detection, streaks, and confetti.
- **Nutrition Plans** — Assign meal plans per client. Clients log daily intake with macro tracking and 30-day adherence.
- **Check-ins & Progress** — Photo uploads (front/lateral), weight log, and progress charts.
- **Client Directory** — Attention score dashboard, full client profiles (6 tabs: overview, analytics, nutrition, progress, plan, billing).
- **White-Label** — Coach uploads logo, sets primary color, customizes loader and QR install screen.
- **Subscriptions** — 4 tiers (Starter / Pro / Elite / Scale) via MercadoPago recurring payments in CLP.
- **Admin Panel** — Platform CEO dashboard: MRR/ARR/churn, coach management, audit log.
- **Multilingual** — Spanish and English interfaces.
- **Dark / Light theme** — System preference + manual toggle.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Styling | Tailwind CSS v4 · shadcn/ui · Radix primitives |
| Database & Auth | Supabase (PostgreSQL + RLS + Storage) |
| Forms | react-hook-form + Zod v4 |
| Drag & Drop | @dnd-kit |
| Payments | MercadoPago pre-approvals (CLP) |
| PWA | Manual `public/sw.js` + dynamic manifests per coach |
| Rate limiting | Upstash Redis (middleware) |
| CI | GitHub Actions (lint + typecheck + Vitest + Playwright) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project

### Install

```bash
git clone https://github.com/Juancho2706/gymappjp.git
cd gymappjp
npm install
```

### Environment Variables

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client / middleware anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side admin operations |
| `MERCADOPAGO_ACCESS_TOKEN` | Yes | MercadoPago server token |
| `MERCADOPAGO_WEBHOOK_TOKEN` | Prod | Webhook HMAC protection |
| `UPSTASH_REDIS_REST_URL` / `_REST_TOKEN` | Prod | Rate limiting |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical URL for metadata |

See `.env.example` for the full list.

### Run

```bash
npm run dev      # http://localhost:3000
npm run build    # Production build
npm run typecheck
npm run lint
npm run test     # Vitest unit tests
npm run test:e2e # Playwright E2E
```

### Database Migrations

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration new <name>
npx supabase db push
```

Migration files live in `supabase/migrations/`.

---

## Architecture

Two protected zones:

- `/coach/*` — Coach dashboard (client management, workout builder, nutrition, branding, subscription).
- `/c/[coach_slug]/*` — Client white-label app (workout execution, nutrition log, check-ins).

Data flow: RSC fetches via `React.cache` → props to client components → server actions → `revalidatePath()`.

No Redux, Zustand, SWR, or React Query. State is local (`useState`), pending (`useTransition`), or optimistic (`useOptimistic`).

---

## CI / CD

`.github/workflows/ci.yml` runs on every push:
1. `npm run lint` + `npm run typecheck` + `npx vitest run`
2. Playwright E2E (headless, requires Supabase secrets in repository Secrets)

Deployments via Vercel — each PR gets a Preview URL automatically.

---

## License

MIT
