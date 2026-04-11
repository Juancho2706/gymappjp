# GymAppJP (OmniCoach OS)

GymAppJP (also known as OmniCoach OS) is an advanced web application designed to empower gym coaches, personal trainers, and fitness professionals. It provides a comprehensive suite of tools to manage clients, build customized workout and nutrition plans, track progress, and operate under a professional white-label experience.

## 🚀 Features

- **Workout Builder:** Create professional routines using a catalog of 230+ exercises, each with animated GIFs and instructions.
- **Nutrition Plans:** Assign personalized meal plans to each client. Clients can log their daily food intake.
- **Check-ins & Progress Tracking:** Clients can upload progress photos and log their weight/measurements.
- **White-Label App:** A branded PWA experience that clients can install on their smartphones.
- **Coach Dashboard:** Manage all active clients, track their engagement, and handle subscriptions in one place.
- **Multilingual Support:** English and Spanish interfaces.
- **Dark & Light Themes:** First-class support for system preferences and manual theme toggling.

## 🛠️ Tech Stack

- **Framework:** Next.js 15+ (App Router, React Server Components)
- **Styling:** Tailwind CSS + Shadcn UI + Framer Motion
- **Database & Auth:** Supabase (PostgreSQL, Auth, Storage)
- **PWA Support:** next-pwa

## 🏃‍♂️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm, yarn, pnpm, or bun
- A Supabase project

### 1. Clone & Install
```bash
git clone https://github.com/Juancho2706/gymappjp.git
cd gymappjp
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and replace placeholder values.

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key for client and middleware sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side admin operations only |
| `NEXT_PUBLIC_SITE_URL` | No (recommended) | Canonical base URL for metadata and links |
| `VERCEL_URL` | No | Auto-set in Vercel deployments |
| `EDAMAM_APP_ID` | Optional | Recipe search integration |
| `EDAMAM_APP_KEY` | Optional | Recipe search integration |
| `PAYMENT_PROVIDER` | Recommended | `mercadopago` (default) or `stripe` |
| `MERCADOPAGO_ACCESS_TOKEN` | Yes (if MercadoPago) | Server token for payment API and webhooks |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | Optional | MercadoPago client-side public key |
| `MERCADOPAGO_TEST_PAYER_EMAIL` | Sandbox only | Required in tests (`@testuser.com`) when using TEST access token |
| `MERCADOPAGO_WEBHOOK_TOKEN` | Recommended | Shared token validated by `/api/payments/webhook` to reject forged calls |
| `STRIPE_SECRET_KEY` | Future | Stripe server key (provider prepared for future) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Future | Stripe client public key |
| `STRIPE_WEBHOOK_SECRET` | Future | Stripe webhook signature secret |
| `PLAYWRIGHT_BASE_URL` | Optional | Playwright base URL override |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Recommended in production | Rate limiting for auth and payment POSTs (middleware); if unset, limits are disabled |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | Optional | YouTube id or URL for the embedded demo on the landing page |
| `E2E_*` | Optional (CI) | See **GitHub Actions** below for Playwright QA-014/015 |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional (Sprint 5) | Provider + sender identity for RET-002 email drip |
| `DRIP_CRON_TOKEN` | Optional (Sprint 5) | Protects `POST /api/internal/email-drip/run` |
| `BETA_MONITOR_TOKEN` | Optional (Sprint 5) | Protects `GET /api/ops/beta-health` |

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

### GitHub Actions (CI)

Workflow: `.github/workflows/ci.yml`.

- **Quality job:** `npm run lint`, `npm run typecheck`, `npx vitest run` (unit tests under `src/**/*.test.*` and `tests/**/*.test.*`; Playwright specs under `tests/*.spec.ts` are excluded from Vitest).
- **E2E job:** Playwright headless with `npm run dev` (see `playwright.config.ts`). Configure repository **Secrets** for a real Supabase project at minimum:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and `SUPABASE_SERVICE_ROLE_KEY` if the app reads it at startup).
  - Optional for **QA-014 / QA-015:** `E2E_COACH_SLUG`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD`, `E2E_WORKOUT_PLAN_ID` (alumno con programa activo y plan de entreno válido; sin ellos esas pruebas se omiten pero el resto de E2E sigue ejecutándose).

### Sprint 5 beta operations

- **Email drip runner (RET-002):** `POST /api/internal/email-drip/run` (token required).
  - scheduler workflow: `.github/workflows/email-drip.yml`
  - required secrets: `BETA_APP_URL`, `DRIP_CRON_TOKEN`
- **Beta health monitor:** `GET /api/ops/beta-health` with `Authorization: Bearer $BETA_MONITOR_TOKEN`.
- Operational docs:
  - `docs/BIZ-004-MP-PROD-RUNBOOK.md`
  - `docs/BIZ-004-MP-PROD-CHECKLIST.md`
  - `docs/RET-002-EMAIL-DRIP-OPS.md`
  - `docs/SPRINT5-MONITORING-SUPPORT.md`

### Vercel preview deployments (OPS-004)

Con el repositorio conectado a Vercel, cada pull request recibe una **Preview URL** en el comentario/check de despliegue. Usa ese enlace para validar cambios antes de fusionar; las variables sensibles se configuran en el proyecto Vercel (Environment Variables → Preview).

### Supabase migration workflow
This repository keeps migration SQL under `supabase/migrations`.

1. Authenticate with Supabase CLI:
```bash
npx supabase login
```
2. Link the local repo to the right remote project:
```bash
npx supabase link --project-ref <project-ref>
```
3. Pull the current remote migration history:
```bash
npx supabase db pull
```
4. Create and edit new migration files:
```bash
npx supabase migration new <name_in_snake_case>
```
5. Apply local migrations to the linked project:
```bash
npx supabase db push
```

Security hardening:
- Keep `Enable email signups` disabled in Supabase Auth if registration is managed by server-side admin flows only.
- RLS audit and matrix: `docs/SEC-001-RLS-AUDIT.md`, `docs/QA-RLS-MATRIX.md`. Integration tests: set `SUPABASE_RLS_INTEGRATION=1` and variables listed in `.env.example`.
- Never commit real secret values. Use `.env.example` for placeholders.
- To disable public signup via Management API, set `SUPABASE_ACCESS_TOKEN` and run:
```bash
npm run supabase:disable-signup
```
- Payments architecture is provider-agnostic. Configure `PAYMENT_PROVIDER=mercadopago` for Sprint 2.

## 📚 Learn More

- Learn about the [Next.js App Router](https://nextjs.org/docs/app).
- Explore the [Supabase Documentation](https://supabase.com/docs).
- Learn about [Shadcn UI](https://ui.shadcn.com/).

## 📝 License

This project is licensed under the MIT License.
