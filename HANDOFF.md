# EVA — Handoff para continuar en otro AI

> Pegar este archivo + `CLAUDE.md` al inicio de cualquier nueva sesión.
> Para tarea específica: agregar también la sección relevante de `v2newEVA/EXECUTION_PLAN.md`.

---

## Qué es EVA

SaaS B2B2C white-label. Coaches gestionan clientes (alumnos). Cada coach tiene una app web branded. Fase actual: agregar capa **Enterprise** para gyms/academias con múltiples coaches bajo una misma organización.

Stack: Next.js 16.2.6 (App Router) · React 19.2.3 · Supabase (PostgreSQL + RLS + Auth) · Tailwind CSS v4 · shadcn/ui · MercadoPago · Vercel.
Repo: `d:\Proyectos\Antigravity\gymappjp` · Branch activa: `v2/enterprise`

Fuente de verdad para versiones: `package.json`.

---

## Reglas de trabajo — LEER ANTES DE TOCAR CÓDIGO

```
1. Rama activa: v2/enterprise — NUNCA trabajar en master
2. Supabase: SOLO local (http://127.0.0.1:54321). npx supabase start + Docker Desktop.
3. NO pushear a prod: ni git push a master ni npx supabase db push hasta plan completo
4. Migrations nuevas: supabase/migrations/<timestamp>_<nombre>.sql → aplicar con npx supabase db reset
5. MCP Supabase (si disponible) apunta a PROD — NUNCA usarlo para dev ni ejecutar SQL
6. Un ítem del plan a la vez. Marcar [x] en CURRENT_PHASE.md al terminar
7. Plan completo: v2newEVA/EXECUTION_PLAN.md (3964 líneas) — leer por secciones con offset/limit
```

---

## Estado actual — 2026-05-17

### Fases completadas
| Fase | Estado | Notas |
|------|--------|-------|
| 0 — Git + Supabase local | ✅ | `packages/` monorepo base diferido a Fase 6A |
| 1 — Backend Enterprise | ✅ | 17 migrations + fix RLS recursion (`20260517150000`) |
| 2 — Frontend Enterprise | ✅ core | Web APIs §2.8.1-2.8.5 NO implementadas (P1/P2) |
| 3 — Legal/Billing/Sales | ✅ parcial | Crons 3/4/5 NO implementados. Resend templates NO configurado |
| 4 — QA y Seguridad | ✅ | RLS 13/13 tests pasando. Regression: pendiente manual |
| 5 — Onboarding Enterprise | ✅ código | Sin cliente real todavía |

### Bug crítico resuelto (impactaría producción)
Migration `supabase/migrations/20260517150000_fix_rls_recursion.sql` — `org_members_see_peers` tenía recursión infinita en PostgreSQL. Fix: función SECURITY DEFINER `is_active_org_member()`.

### Registro free coach v2
Migration `supabase/migrations/20260517160000_allow_pending_email_subscription_status.sql` permite `pending_email` en `coaches_subscription_status_check`. Flujo: registro free crea Auth user con `email_confirm: false` + coach `pending_email`; `/auth/confirm` verifica link Supabase y actualiza a `active`.

### Gaps documentados (no bloquean Fase 6)
- Crons 3/4/5: `payment-reminder`, `audit-checksum`, `mp-reconcile` — no implementados
- Cron `purge-data`: parcial (purga directa, necesita 2-step con email previo)
- Sentry web (`@sentry/nextjs`) — no instalado
- `/api/health` endpoint — no existe
- Dependabot `.github/dependabot.yml` — no existe
- Web APIs workout: Media Session, Web Share, Fullscreen, Speech, Badge — no implementados

---

## Fase actual — FASE 6A: Mover web a apps/web/

### Objetivo
Reestructurar a monorepo npm workspaces. Sin cambio funcional. Todo debe seguir andando igual.

### Pasos exactos (del EXECUTION_PLAN.md §6A)

```bash
# 1. Crear estructura monorepo en package.json raíz:
# workspaces: ["packages/*", "apps/*"]

# 2. Crear directorios:
mkdir -p apps/web packages/types packages/schemas

# 3. Mover archivos web:
# src/ → apps/web/src/
# public/ → apps/web/public/
# next.config.ts → apps/web/next.config.ts
# tsconfig.json → apps/web/tsconfig.json (ajustar paths relativos)

# 4. En Vercel: Settings → General → Root Directory → apps/web

# 5. Crear packages/types/index.ts → re-export de database.types.ts
# Crear packages/schemas/index.ts → re-export de Zod schemas enterprise

# 6. Verificar: npm run typecheck && npm run build
```

**Deprecar:** `/api/manifest/[coach_slug]/route.ts` — razón: con app RN aggregator (una app EVA en stores), los manifests por coach pierden sentido. Service Worker `public/sw.js` queda.

**Condición de done:**
- `npm run typecheck` pasa con `@eva/types` y `@eva/schemas`
- `npm run build` completa sin errores
- Vercel despliega desde `apps/web/`
- Feature branch → PR → CI verde → merge

---

## Decisiones clave (no reabrir)

| Decisión | Valor |
|----------|-------|
| Apple IAP | Web-only billing. App RN nunca vende ni muestra CTA de compra |
| Android billing | Sin Google Play Billing. App solo consume |
| Staging | SKIP (free tier ocupado). Flujo: local → prod directo al final |
| Stack RN | Expo SDK 53 + Expo Router v4 + NativeWind v4 |
| Monorepo tooling | npm workspaces (NO Turborepo) |
| Auth | Supabase Auth en web + ambas apps RN |
| Pagos enterprise | Manual: link MP o transferencia. Sin IAP. |
| Env mobile | `EXPO_PUBLIC_*` en `apps/mobile/.env`, baked en EAS build. NO pasan por Vercel. |

---

## Archivos clave

| Archivo | Qué contiene |
|---------|-------------|
| `CLAUDE.md` | Arquitectura, commands, code rules, module pattern |
| `CURRENT_PHASE.md` | Estado completo de todas las fases + reglas de trabajo |
| `MANUAL_TASKS.md` | Tareas manuales (dashboards, pagos, env vars) |
| `v2newEVA/EXECUTION_PLAN.md` | Plan completo 3964 líneas. Usar offset/limit para leer |
| `supabase/seed.sql` | Seed enterprise con auth.users + auth.identities (requeridos por GoTrue) |
| `supabase/migrations/` | 17 migrations enterprise + fix RLS recursion |
| `tests/enterprise/rls-isolation.spec.ts` | 13 tests RLS, hardcodean URL local 127.0.0.1:54321 |

---

## Gotchas técnicos aprendidos

### GoTrue (Supabase Auth) — auth.users manual
Si insertas users manualmente en `auth.users` (para seeds), necesitas:
1. Campos `''` (empty string, NO NULL): `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change_token_current`, `email_change`, `raw_app_meta_data`
2. Una fila en `auth.identities` por usuario (GoTrue la requiere para `signInWithPassword`)
3. `auth.identities.email` es columna GENERATED — NO incluir en INSERT

### RLS tests — Windows + Playwright
- `realtime: { params: { eventsPerSecond: 0 } }` en `createClient()` — evita crash `UV_HANDLE_CLOSING` en Windows
- Tests hardcodean `http://127.0.0.1:54321` porque `.env.local` apunta a PROD

### RLS recursión infinita
`org_members_see_peers` policy que consulta `organization_members` DESDE una policy ON `organization_members` → stack overflow en PostgreSQL. Fix: función `SECURITY DEFINER` que bypasea RLS para la verificación de membresía.

### Tailwind CSS v4
Sin `tailwind.config`. Los temas van en `globals.css` con `@theme`. No hay `tailwind.config.ts`.

### MercadoPago sandbox (local dev)
Email del payer en sandbox debe ser exactamente el configurado en MP test credentials. Ver `MERCADOPAGO_TEST_PAYER_EMAIL`.

---

## Próximas fases después de 6A

```
6B.0 → Pre-flight Mobile (EAS, app.json, PrivacyInfo.xcprivacy, Sentry RN, .well-known files)
6B   → EVA App React Native (12 semanas)
6C   → EVA Enterprise App React Native (8 semanas, paralelo a 6B sem 5-12)
```

Prerequisitos MT para 6B.0:
- MT-11: Guimel agrega Apple ID como App Manager (Team ID para eas.json)
- MT-12: Bundle ID `cl.evaapp.eva` en App Store Connect
- MT-13: Google Play account ($25 USD)
- MT-14: Expo EAS account + EXPO_TOKEN
- MT-15: Sentry proyecto `eva-rn` (DSN)

---

## Para empezar en otro AI

Pegar en orden:
1. Este archivo (`HANDOFF.md`)
2. `CLAUDE.md`
3. Si vas a trabajar en Fase 6A: pegar también `v2newEVA/EXECUTION_PLAN.md` líneas 2945-3020

Decirle: _"Eres Claude Code trabajando en el proyecto EVA. Lee los docs adjuntos y continúa con Fase 6A."_
