# AGENTS.md — EVA Fitness Platform (GymAppJP)

> **Última actualización:** 2026-04-24
> **Propósito:** Contexto canónico para agentes de IA trabajando en este codebase.

---

## 1. Identidad del Proyecto

**Nombre:** EVA Fitness Platform (repo: `gymappjp`)  
**Tipo:** SaaS white-label B2B2C para coaches de gimnasio / personal trainers  
**Propietario:** Juan Manuel Villegas  
**Repositorio:** `https://github.com/Juancho2706/gymappjp.git`  
**Completitud global:** ~97–98% (Fase 0 Pre-Revenue completada, rumbo a Fase 1 Revenue MVP)

**Propuesta de valor:** Cada coach tiene su propia app white-label (`/c/[coach_slug]`) para gestionar alumnos, programas de entrenamiento, nutrición y seguimiento de progreso. Los alumnos instalan la PWA con la marca de su coach.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión / Notas |
|------|-----------|-----------------|
| Framework | Next.js App Router + RSC + Server Actions | 16.1.6 |
| React | React + React Compiler | 19.2.3 |
| Estilos | Tailwind CSS v4 (PostCSS, sin `tailwind.config`) | `^4` |
| UI | shadcn/ui + @base-ui/react + Radix UI primitives | — |
| Estado | useState / useReducer / useTransition / Context | Sin Redux/Zustand |
| Animación | Framer Motion + tw-animate-css | — |
| Formularios | react-hook-form + Zod v4 | `^4.3.6` |
| Backend | Supabase (Auth, PostgreSQL, Storage, RLS) | — |
| Charts | Recharts + react-circular-progressbar + react-activity-calendar | — |
| DnD | @dnd-kit/core + @dnd-kit/sortable | — |
| Virtualización | @tanstack/react-virtual | — |
| i18n | Custom `LanguageContext` + JSON (`es.json` / `en.json`) | Parcial |
| PWA | Manual `public/sw.js` + manifests dinámicos por coach | No `next-pwa` |
| Testing | Vitest + @testing-library/react + Playwright | — |
| PDF | puppeteer (devDependencies — `PrintProgramDialog`) | — |
| Pagos | MercadoPago pre-approvals (suscripciones recurrentes) | Stripe preparado futuro |

---

## 3. Estructura de Carpetas

```
src/
├── app/                          # Next.js App Router (41+ rutas)
│   ├── (auth)/                   # Login, register, forgot/reset password (coach)
│   ├── auth/callback/            # Supabase OAuth callback
│   ├── api/                      # API routes (manifests, payments, recipes, ops)
│   ├── payments/                 # MercadoPago checkout, webhook, status
│   ├── coach/                    # Dashboard coach — PROTEGIDO por middleware
│   │   ├── dashboard/
│   │   ├── clients/
│   │   ├── builder/[clientId]/
│   │   ├── workout-programs/
│   │   ├── nutrition-plans/
│   │   ├── foods/
│   │   ├── exercises/
│   │   ├── settings/
│   │   └── subscription/
│   └── c/[coach_slug]/           # White-label del alumno — PROTEGIDO por middleware
│       ├── dashboard/
│       ├── workout/[planId]/
│       ├── nutrition/
│       ├── check-in/
│       ├── exercises/
│       └── onboarding/
├── components/
│   ├── coach/                    # Componentes compartidos del coach
│   ├── client/                   # Componentes compartidos del alumno
│   ├── landing/                  # Landing page EVA
│   ├── shared/                   # Cross-cutting (ThemeToggle, etc.)
│   └── ui/                       # shadcn/ui primitives
├── lib/                          # Utilidades, constantes, tipos
│   ├── database.types.ts         # Tipos generados de Supabase
│   ├── constants.ts              # Tiers, precios, colores del sistema
│   ├── brand-assets.ts           # Assets de marca EVA
│   ├── auth/platform-email.ts    # Validación email único plataforma
│   └── utils.ts                  # cn(), helpers
├── services/
│   ├── dashboard.service.ts
│   └── nutrition.service.ts
└── types/                        # Tipos TypeScript adicionales

supabase/
├── migrations/                   # Migraciones SQL activas
└── migrations_backup/            # Snapshots históricos

public/
├── sw.js                         # Service Worker PWA manual
└── LOGOS/                        # Logos de marca

tests/                            # Playwright E2E specs
scripts/                          # Scripts operativos Node (coach accounts, etc.)
```

---

## 4. Patrones Arquitectónicos (OBLIGATORIOS)

### 4.1 Patrón de módulo
```
module/
├── page.tsx              # RSC — fetch data + render
├── loading.tsx           # Streaming skeleton
├── actions.ts            # Server actions simples
├── _data/                # React.cache queries
│   └── module.queries.ts
├── _actions/             # Server actions complejas
│   └── module.actions.ts
└── _components/          # Client components por dominio
    ├── domain1/
    └── domain2/
```

### 4.2 Comunicación Server → Client → Server
```
Server Component (fetch via Supabase)
    └── props ──→ Client Component
                        └── call ──→ Server Action
                                        └── Supabase mutation + revalidatePath()
```

### 4.3 Estado del cliente
- `useState` / `useReducer` → estado local UI
- `useTransition` → pending states
- `useActionState` → formularios con server actions
- `useOptimistic` → optimistic updates (nutrición, workout logs)
- React Context → `WorkoutTimerProvider`, `LanguageContext`
- **NO usar Redux, Zustand, SWR, ni React Query**

### 4.4 Validación
- Cliente: `react-hook-form` + Zod schemas
- Servidor: re-validación **obligatoria** en server actions + Zod v4

---

## 5. Decisiones Técnicas Clave (NO CAMBIAR)

| Decisión | Motivo |
|----------|--------|
| RSC + Server Actions | Reduce JS del cliente, fetch en servidor |
| React 19 + React Compiler | Memoización automática, optimistic UI nativo |
| `React.cache` (no SWR/RQ) | Deduplicación por request en RSC, sin cliente state |
| Supabase (no custom auth) | Auth + DB + Storage + RLS en uno |
| Tailwind CSS v4 | Sin `tailwind.config`, `@theme` en CSS |
| shadcn/ui + Radix | Accesibilidad primitiva, sin lock-in |
| @dnd-kit (no react-beautiful-dnd) | Mantenido, accesible, soporte touch |
| PWA manual (no next-pwa) | Control total, manifests dinámicos por coach |
| MercadoPago pre-approvals | Único gateway con suscripciones + Redcompra en Chile |
| `useOptimistic` (no SWR/RQ) | React 19 nativo, sin dependencias extra |
| Sin Redux/Zustand | Context + useState suficiente |
| `dvh` en vez de `vh` | Adapta altura al viewport real en móvil |
| `overflow-x: clip` en `html` | Evita scroll horizontal sin romper sticky |

---

## 6. Reglas de Código Absolutas

### 6.1 Viewport móvil (Sesión 7)
- **NUNCA** usar `h-screen` / `min-h-screen` / `100vh` fuera de breakpoint `md:`
- Usar `h-dvh` / `min-h-dvh` / `100dvh`
- Safari < 15.4: declarar `100vh` primero, luego `100dvh` lo sobreescribe

### 6.2 Safe areas iOS/Android
- Cualquier elemento `fixed` que llegue al borde: `pl-safe pr-safe`
- Utilities disponibles en `globals.css`: `.pt-safe`, `.pb-safe`, `.px-safe`, `.py-safe`, `.h-dvh-safe`, `.min-h-dvh-safe`, `.scroll-y-safe`

### 6.3 Colores
- `SYSTEM_PRIMARY_COLOR = '#007AFF'` — azul EVA (coach sin branding)
- `BRAND_PRIMARY_COLOR = '#10B981'` — verde EVA (marca propia landing)
- Verificar variantes **dark mode** en componentes nuevos

### 6.4 Base UI Select
- `SelectPrimitive.Value` muestra el `value` crudo, NO el label
- Workaround: pasar children explícitos con mapa de labels (`DURATION_LABELS`)

### 6.5 Imágenes
- Usar `<Image>` de Next.js en todos lados. **Cero `<img>` sin optimizar.**

### 6.6 Base de datos
- `SELECT` específico (nunca `SELECT *`) en queries de catálogos
- Usar `React.cache` (no `unstable_cache`) — incompatible con Supabase SSR en prod
- `Promise.all()` para queries paralelas

---

## 7. Flujos End-to-End Principales

### Coach crea y asigna programa
1. `/coach/builder/[clientId]`
2. Arrastra ejercicios → `usePlanBuilder`
3. Configura bloques en `BlockEditSheet`
4. "Guardar" → `saveWorkoutProgramAction()` → UPSERT programs → plans → blocks
5. `AssignToClientsDialog` → `assignProgramToClientsAction()`

### Cliente ejecuta entrenamiento
1. Dashboard → `WorkoutHeroCard` → `/c/[slug]/workout/[planId]`
2. Server: plan + historial + `exerciseMaxes` + variante A/B
3. `LogSetForm` → `logSetAction()` → UPSERT `workout_logs` → `revalidatePath`
4. Al completar → `WorkoutSummaryOverlay` (PRs, volumen, confetti)

### Flujo de suscripción coach
1. Register → `/coach/subscription/processing`
2. Polling detecta preapproval autorizado
3. Webhook MP → verifica HMAC → actualiza `coaches` row
4. Acceso desbloqueado → `/coach/dashboard`
5. Si cancela → grace period hasta `current_period_end`
6. Si reactiva → nuevo preapproval con `start_date = now + 60s`

---

## 8. Seguridad (Implementada)

- Webhook MercadoPago: token + HMAC SHA256 timing-safe ✅
- Rate limiting: 40 req/min auth, 15 req/min payments, 30 req/min recipes ✅
- Upload logos: validación MIME + max 2MB ✅
- Zod validation en todas las server actions ✅
- RLS en 24 tablas ✅
- Email único plataforma: RPC `check_platform_email_availability` ✅
- Email drip: `Authorization: Bearer` exclusivo ✅
- Secrets: **ningún hardcoded en código** ✅

---

## 9. Testing

- **Unit:** Vitest + Testing Library (`src/**/*.test.*`, `tests/**/*.test.*` excluyendo `*.spec.ts`)
- **E2E:** Playwright (`tests/*.spec.ts`)
- Scripts: `npm run test` (Vitest), `npm run test:e2e` (Playwright)
- CI: `.github/workflows/ci.yml` — lint + typecheck + vitest + Playwright headless

---

## 10. MCPs Configurados

| MCP | Tipo | Estado | Uso |
|-----|------|--------|-----|
| **Supabase** | HTTP | ✅ Activo | Consultar/modificar DB, RLS, migraciones |
| **Playwright** | stdio (`@playwright/mcp`) | ✅ Activo | Automatización de navegador, screenshots, testing visual |
| **GitHub** | stdio (`@modelcontextprotocol/server-github`) | ✅ Activo | Issues, PRs, commits, repo management |

**Configuración:** Archivos `~/.kimi/mcp.json` (Kimi CLI) y `.mcp.json` (Cursor/proyecto).

> Para activar GitHub MCP: reemplazar `YOUR_GITHUB_TOKEN_HERE` en ambos archivos por tu Personal Access Token.

---

## 11. Variables de Entorno Clave

| Variable | Propósito |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key cliente/middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones admin server-side |
| `MERCADOPAGO_ACCESS_TOKEN` | Token servidor MP |
| `MERCADOPAGO_WEBHOOK_TOKEN` | Protección webhook MP |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Rate limiting (prod) |
| `PLAYWRIGHT_BASE_URL` | Override URL base E2E |

---

## 12. Contacto y Operaciones

- **Email plataforma:** `contacto@eva-app.cl`
- **SLA Fase 1:** primera respuesta < 24h; P0 pagos < 4h
- **Clasificación:** P0 pago/acceso | P1 bug bloquea entreno | P2 UX | P3 idea

---

## 13. Notas para Agentes de IA

1. **Siempre verifica `AGENTS.md` antes de hacer cambios arquitectónicos.**
2. **Mantén consistencia con los patrones establecidos** (`_data/_actions/_components`).
3. **No introduzcas nuevas dependencias de estado** (Redux, Zustand, SWR, React Query).
4. **Respeta las reglas de móvil:** `dvh`, safe areas, `overflow-x: clip`.
5. **Valida en server y cliente** con Zod v4.
6. **Usa `revalidatePath()` después de mutations** en server actions.
7. **Si modificas tablas/RLS/políticas:** actualiza `database.types.ts` y documenta en `nuevabibliadelaapp/`.
8. **Si creas migraciones SQL:** guárdalas en `supabase/migrations/` con timestamp ISO.
9. **Este archivo (`AGENTS.md`) debe actualizarse** cuando cambien decisiones técnicas, stack, o arquitectura.
