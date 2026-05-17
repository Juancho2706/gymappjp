# EVA v2 — Estado Actual de Ejecución

> Actualizar este archivo al terminar cada tarea o sesión.
> Plan completo: `v2newEVA/EXECUTION_PLAN.md`

---

## Reglas de trabajo (leer al inicio de CADA sesión)

- **Rama activa:** `v2/enterprise` — nunca trabajar en `master` para código v2
- **Supabase:** solo local (`http://127.0.0.1:54321`) para dev. `npx supabase start` si no está corriendo. Docker Desktop debe estar abierto primero
- **NO pushear a prod** (ni `git push` a master ni `npx supabase db push`) hasta terminar el plan completo
- **Migrations:** nuevas van en `supabase/migrations/` con timestamp ISO. Aplicar localmente con `npx supabase db reset`
- **Ritmo:** un ítem del plan a la vez. Marcar `[x]` aquí al terminar cada uno
- **Plan completo:** leer solo la sección necesaria de `v2newEVA/EXECUTION_PLAN.md` con offset/limit (3964 líneas, no leer entero)
- **Sin staging:** free tier de Supabase ocupado. Flujo: local → v2/enterprise branch → cuando plan completo → db push + deploy
- **Security migration ya aplicada:** `20260517120000_security_fixes.sql` — fixes de RLS y search_path pre-existentes. Pushear a prod junto con las migrations de v2
- **Tareas manuales:** `MANUAL_TASKS.md` — todo lo que requiere acción tuya (dashboards, pagos, firmas). Sincronizado con este archivo.
- **MCP Supabase apunta a PROD** (`jikjeokundmaafuytdcx.supabase.co`) — NUNCA usarlo en dev. Solo Bash local.

---

## Fase Actual: FASE 6A — Monorepo (mover web a apps/web/)

**Rama git:** `v2/enterprise`
**Última actualización:** 2026-05-17 (Fase 4 QA completa incluyendo bug crítico de RLS)

---

## Fase Inmediata — Acciones no-técnicas (paralelas al desarrollo)

- [ ] Landing enterprise section live en producción (`LandingEnterpriseSection` mergeado a master) — **bloqueado: no mergear hasta terminar plan completo**
- [x] DPA Vercel firmado (vercel.com/legal) — ✅ Hecho por KimiCode
- [x] DPA Supabase firmado (Dashboard → Settings → Legal) — ✅ Hecho por KimiCode
- [ ] Bundle IDs registrados en App Store Connect (`cl.evaapp.eva` y `cl.evaapp.eva-enterprise`) — ver MT-12
- [ ] Google Play Developer account creada ($25 USD) — ver MT-13, en espera de dinero
- [ ] One-pager PDF creado (Google Slides) — ✅ Hecho por KimiCode
- [x] Calendly link configurado (`https://calendly.com/contacto-eva-app/eva-enterprise`) — en `LandingEnterpriseSection`
- [x] Cuenta UptimeRobot creada + monitores configurados ✅
- [x] Decisión IAP documentada ✓ (Web-Only Billing — en EXECUTION_PLAN.md)

---

## FASE 0 — Git + Supabase local + Monorepo base ✅ COMPLETA

### 0.1 — Git branch
- [x] Crear rama `v2/enterprise` y hacer push

### 0.2 — Supabase local
- [x] `npx supabase start` — corriendo en http://127.0.0.1:54321
- [x] Studio: http://127.0.0.1:54323 | Mailpit: http://127.0.0.1:54324
- [x] `.env.development.local` creado con keys locales
- [x] Migrations reorganizadas: `00000000000000_extensions.sql` + `00000000000001_baseline.sql`
- [ ] Verificar Studio abre correctamente en browser — manual

### 0.3 — Staging Supabase
- [x] ~~SKIP~~ — free tier ocupado (2/2 proyectos). Flujo: local → prod directo al final.

### 0.4 — Env vars nuevas (agregar a Vercel Production + Preview)
- [x] `ENTERPRISE_DOMAIN` = `enterprise.eva-app.cl` — ✅ configurado en Vercel
- [x] `ADMIN_EMAILS` = `jvillegas.dev@gmail.com` — ✅ configurado en Vercel
- [x] `CRON_SECRET` — ✅ configurado en Vercel

---

## FASE 1 — Backend Enterprise ✅ COMPLETA (con gaps menores pendientes)

### 1.1-1.4 — Migrations + Gaps de código
- [x] 17 migrations enterprise aplicadas localmente (organizations, members, invites, assignments, audit_logs, org_invoices, payment_exceptions, purge_audit, clients_org_id, coaches_invite_code, workout_programs_org_id, indexes, RLS, auth hook, constraints, trgm_indexes)
- [x] **+ migration 20260517150000_fix_rls_recursion.sql** — fix bug crítico: `org_members_see_peers` tenía recursión infinita → función SECURITY DEFINER `is_active_org_member()`
- [x] Gap 1: middleware.ts — invite_code support (bifurcación por formato)
- [x] Gap 3: coach-subscription-gate.ts — `org_managed` early return
- [x] Gap 6: `c/[coach_slug]/login/actions.ts` — invite_code + fallback org client via `organization_members` ✅
- [x] Gap 7: manifest/[coach_slug]/route.ts — invite_code support
- [x] database.types.ts regenerado — typecheck pasa limpio
- [x] 1.5 — Rate limits (`rateLimitInviteAccept`, `rateLimitOrgCreation`) en `src/lib/rate-limit.ts`
- [x] 1.5b — MFA banner no-bloqueante para org_owner
- [x] 1.5c — Idempotency check en webhook MercadoPago
- [x] 1.6 — Server Actions: `org.actions.ts`, `clients.actions.ts`
- [x] 1.7.1 — Offline workout queue (`src/lib/workout-offline-queue.ts` + `OfflineWorkoutQueueSync`)
- [x] 1.7.2 — Push notifications (`src/lib/push.ts` + `web-push`)
- [x] Storage bucket `org-assets` creado — ✅ confirmado por usuario (MT-2 hecho)

### Columnas faltantes en DB
- [x] `subscription_events.org_id` — migration `20260517140001`
- [x] `organizations.client_limit`, `last_health_score`, `last_health_score_at` — migration aplicada
- [x] `org_invoices.expected_amount_clp` — migration aplicada

### Gaps PENDIENTES del plan (no críticos para Fase 6, documentados)
- [ ] Cron `purge-data` incompleto: actual es purga directa 30 días; plan pide 2-step (export JSON → email owner → 7 días → hard delete)
- [ ] Crons 3/4/5 del plan NO implementados: payment-reminder, audit-checksum, mp-reconcile
- [ ] `accept_org_invite` no cancela MP pre-approval del coach (plan §4.7)
- [ ] CSV import (`import_clients_to_org`) no verifica `client_limit` (plan §riesgos)
- [ ] Sentry web (`@sentry/nextjs`) NO instalado — `SENTRY_DSN` pendiente
- [ ] `/api/health` endpoint NO existe — UptimeRobot lo monitorea pero el endpoint no está creado
- [ ] Dependabot `.github/dependabot.yml` — NO creado (plan §0.6 lo pide, no bloquea nada)
- [ ] `npm audit` en CI — NO configurado en `.github/workflows/ci.yml`
- [ ] `packages/` monorepo base (`@eva/types`, `@eva/schemas`) — NO creado; diferido a Fase 6A junto con `apps/web/`

---

## FASE 2 — Frontend Enterprise ✅ COMPLETA (con gaps Web APIs pendientes)

- [x] `src/app/org/[slug]/layout.tsx` — OrgAdminLayout con sidebar + membership guard
- [x] `src/app/org/[slug]/page.tsx` — Dashboard (stats, seat usage, recent coaches, upsell banners)
- [x] `src/app/org/[slug]/coaches/page.tsx` — Gestión de coaches + InviteCoachForm + RemoveCoachButton
- [x] `src/app/org/[slug]/clients/page.tsx` — Pool de clientes + AddClientForm + AssignClientSelect
- [x] `src/app/org/[slug]/settings/page.tsx` — Branding + billing info + logo upload
- [x] `uploadOrgLogoAction` con MIME check + magic number validation (12 bytes)
- [x] Gap 2: middleware.ts — org client verification (fallback por org_id)
- [x] Gap 4: `src/lib/coach-context.ts` — extrae org claims del JWT (`getCoachOrgContext`)
- [x] Gap 5: `coach/clients/actions.ts` — createClient pasa `org_id` + crea assignments + age_confirmed_at ✅
- [x] `AppDownloadBanner` (P0) — muestra en client layout para PWA no instalada (`src/components/AppDownloadBanner.tsx`)
- [x] database.types.ts regenerado — incluye todos los nuevos tipos enterprise
- [x] error.tsx + not-found.tsx en todas las sub-rutas de `/org/[slug]/`
- [x] Onboarding wizard 5 pasos (`/org/[slug]/onboarding/`) con recovery por `onboarding_step`
- [x] Admin panel `/admin/orgs/` — tabla con stats de todas las orgs + link a org
- [x] Admin sidebar actualizado con entrada "Organizaciones"

### Web APIs §2.8 — PENDIENTES (no bloquean Fase 6, son P1/P2)
- [ ] **2.8.1** Media Session API — ejercicio en pantalla de bloqueo (`RestTimer.tsx` + `WorkoutExecutionClient.tsx`)
- [ ] **2.8.2** Web Share + PR Card (Canvas) — compartir workout completado o PR al menú nativo iOS/Android
- [ ] **2.8.3** Fullscreen + Orientation lock — modo workout pantalla completa
- [ ] **2.8.4** Speech synthesis toggle — anunciar nombre del ejercicio por voz (persistido)
- [ ] **2.8.5** Badge API — badge de notificaciones no leídas en PWA, limpiar al abrir dashboard

---

## FASE 3 — Legal, Billing, Sales ✅ PARCIAL

- [x] `CookieConsent` component (Ley 21.719) — en root layout
- [x] ARCO contact (`privacidad@eva-app.cl`) en footer
- [x] `AppDownloadBanner` — detecta OS + `EVANative` UA
- [x] `age_confirmed_at` checkbox + Zod en todos los flujos de creación de clientes
- [x] `LandingEnterpriseSection` creada — id=enterprise, pricing amber, Calendly CTA
- [x] Nav "Para Gyms" añadido — desktop + mobile sheet
- [x] `page.tsx` SEO: title/description/keywords con mención gyms
- [x] `LandingPricingPreview` + `LandingFinalCTA` actualizados
- [x] `vercel.json` — CSP + security headers
- [x] Cron `org-health-alert` — suspende trials expirados + alerta 7 días antes ✅ (health score PARCIAL — fórmula completa pendiente)
- [x] Cron `purge-data` — PARCIAL (ver gaps Fase 1)
- [x] Contratos enterprise template (`docs/legal/enterprise-contract-template.md`)
- [x] ToS + Privacy Policy (`docs/legal/tos.md` + `docs/legal/privacy-policy.md`) — redactados
- [x] `src/lib/constants.ts` — `SubscriptionStatus` type exportado con `'org_managed'`
- [x] `src/middleware.ts` — rewrite para subdominio `enterprise.eva-app.cl` → `/org/*`
- [ ] `LandingEnterpriseSection` mergeado a master — **bloqueado hasta plan completo**
- [ ] `.well-known/apple-app-site-association` — NO creado aún (Fase 6B.0)
- [ ] `.well-known/assetlinks.json` — NO creado aún (Fase 6B.0)
- [ ] Resend API key + email templates para invites/dunning/health alerts — NO configurado

---

## FASE 4 — QA y Seguridad ✅ COMPLETA

### 4.1 — Seeds enterprise
- [x] `supabase/seed.sql` — Org A (4 coaches, 5 clientes), Org B (4 coaches, 5 clientes), standalone (3 clientes), coach_both en ambas orgs, invites (pending/expired/used)
- [x] `auth.users` con todos los campos requeridos por GoTrue (raw_app_meta_data, email_change, tokens)
- [x] `auth.identities` generadas desde los usuarios del seed (requerido para signInWithPassword)

### 4.2 — Invite flow tests
- [x] `tests/enterprise/invite-flow.spec.ts` — invite pending/expired/used, Inbucket, rate limit

### 4.3 — RLS isolation tests
- [x] `tests/enterprise/rls-isolation.spec.ts` — **13/13 pasando** ✅
  - Fix crítico: recursión infinita en `org_members_see_peers` → migration `20260517150000_fix_rls_recursion.sql`
  - Tests hardcodean URL local (`http://127.0.0.1:54321`) — siempre corren contra local
  - Ejecutar: `npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1`

### 4.4 — Regression tests existentes
- [ ] `npx playwright test tests/coach/` — **manual (requiere dev server)**

### 4.5 — Enterprise journey E2E
- [x] `tests/enterprise/journey-e2e.spec.ts` — dashboard, coaches, settings, seat upsell, client pool

### 4.6 — Performance benchmark
- [ ] EXPLAIN ANALYZE en `/coach/clients` — **manual (requiere Supabase Studio)**

### 4.7 — Security checklist
- [x] Logo upload: MIME check + magic number validation (server-side)
- [x] `org_id` siempre de `auth.uid()` en todas las actions
- [x] Rate limits `rateLimitInviteAccept` + `rateLimitOrgCreation`
- [x] CSP headers en `vercel.json`
- [x] MP webhook HMAC
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en Vercel Production — **verificar manual (MT-22)**
- [ ] Invite tokens `gen_random_bytes(32)` hex — actualmente usa UUID en RPC (revisar)
- [ ] `org_audit_logs` sin policies UPDATE/DELETE — **verificar manual en Studio (MT-21)**

---

## FASE 5 — Onboarding Clientes Enterprise ✅ CÓDIGO COMPLETO

### Código completado
- [x] Upsell banner "Límite de coaches alcanzado" en `/org/[slug]` dashboard
- [x] Upsell banner "Adopción baja" (score < 60)
- [x] `last_health_score` en `OrgWithMembership` type + query
- [x] Logo upload en org settings (`org-assets` bucket)

### Pendientes operacionales (requieren acción tuya)
- [ ] Primer cliente enterprise firmado y en producción
- [ ] Playbook D-7 a D+30 ejecutado (ver `v2newEVA/EXECUTION_PLAN.md` §5)
- [ ] Health score D14 calculado (MT-24)
- [ ] Google Sheets pipeline (MT-9) ✅ Hecho
- [ ] Demo org "EVA Demo Gym" creada en staging para ventas

---

## FASE 6 — Monorepo + React Native ← SIGUIENTE

> **Condición original del plan:** ambos clientes enterprise estables 2+ semanas.
> **Decisión 2026-05-17:** Skip condición de entrada — proceder ahora para tener apps listas para vender.

### 6A — Mover web a apps/web/ (1 semana)
- [ ] `mkdir apps/web` + mover src/ public/ next.config.ts tsconfig.json
- [ ] Actualizar Vercel root directory → apps/web
- [ ] Actualizar tsconfig paths relativos
- [ ] Verificar `npm run typecheck && npm run build`
- [ ] Deprecar `/api/manifest/[coach_slug]/route.ts` (PWA por-coach → app aggregator)
- [ ] Feature branch → PR → CI verde → merge

### 6B.0 — Pre-flight Mobile (antes de escribir cualquier feature)
- [ ] `npm install -g eas-cli` + `eas login`
- [ ] `apps/mobile/` creado con `npx create-expo-app`
- [ ] `eas.json` con perfiles development/staging/production
- [ ] `expo-updates` configurado (OTA hotfixes)
- [ ] `@sentry/react-native` instalado (MT-15)
- [ ] `app.json` completo (bundleId `cl.evaapp.eva`, targetSdkVersion 35, permisos)
- [ ] `PrivacyInfo.xcprivacy` en repo
- [ ] ThemeContext (`apps/mobile/lib/theme.ts`) definido
- [ ] Push token sync handler (`apps/mobile/lib/push.ts`)
- [ ] `.well-known/apple-app-site-association` live en eva-app.cl
- [ ] `.well-known/assetlinks.json` live en eva-app.cl
- [ ] GitHub Actions para EAS Build (`.github/workflows/mobile-build.yml`)
- [ ] Maestro instalado + primer test en simulador
- [ ] Age rating 13+ declarado en App Store Connect

**Prerequisitos MT antes de 6B.0:**
- [ ] MT-11: Guimel agrega Apple ID como App Manager (Team ID para eas.json)
- [ ] MT-12: Bundle ID `cl.evaapp.eva` registrado en App Store Connect
- [ ] MT-13: Google Play account ($25 USD)
- [ ] MT-14: Cuenta Expo EAS creada
- [ ] MT-15: Sentry proyecto `eva-rn` creado (DSN)

### 6B — EVA App React Native (12 semanas)
**Roadmap por semanas:**
- Sem 1-2: Auth + selector rol (SOY COACH / SOY ALUMNO) + ThemeContext + branding por invite_code
- Sem 3-4: Módulo alumno completo (workout, nutrición, check-in, offline cache)
- Sem 5: Push notifications (expo-notifications) + EAS dev build en dispositivo físico
- Sem 6-7: Módulo coach (lista clientes, builder simplificado, ver check-ins)
- Sem 8: Coach enterprise (ocultar billing/branding si org_managed) + deep linking
- Sem 9: In-app messaging coach ↔ alumno (tabla `messages` + Supabase Realtime)
- Sem 10: HealthKit/Health Connect + pedómetro + background timer (v1.1)
- Sem 11: NFC check-in + video form review setup (v1.1)
- Sem 12: Leaderboards básicos + streaks (v1.1 engagement)
- Sem 13: Auditoría Guimel + App Privacy Labels + screenshots + polish final

**DB migrations necesarias antes de Sem 1:**
- [ ] `push_tokens` table
- [ ] `attendance_logs` table
- [ ] `form_reviews` table (v1.1, puede esperar)

**Antes de App Store submission:**
- [ ] App Privacy Labels (fitness, nutrition, health, user content, messages)
- [ ] Data Safety Form Google Play
- [ ] Screenshots iPhone 16 Pro Max: coach mode (3+) y alumno mode (3+)
- [ ] App Review Notes con credenciales demo por rol
- [ ] `EVANative` en userAgent

### 6C — EVA Enterprise App React Native (8 semanas, paralelo a 6B sem 5-12)
- Bundle ID: `cl.evaapp.eva-enterprise`
- Dashboard org, gestión coaches, pool alumnos, reportes, branding, billing

---

## Notas / Decisiones tomadas

- Flujo: `CURRENT_PHASE.md` como tracker liviano, `EXECUTION_PLAN.md` como referencia completa
- No staging (free tier ocupado) — local → prod directo al final
- **Bug crítico resuelto 2026-05-17:** `org_members_see_peers` tenía recursión infinita en PostgreSQL RLS. Migration `20260517150000_fix_rls_recursion.sql` resuelve con función SECURITY DEFINER `is_active_org_member()`. Este bug hubiera afectado producción.
- **MCP Supabase apunta a PROD** — nunca ejecutar SQLs de desarrollo via MCP. Solo Bash local.
- **Mobile env vars:** .ipa/.apk conecta directamente a Supabase (no pasa por Vercel). Vars van en `apps/mobile/.env` con prefijo `EXPO_PUBLIC_*` y se hornean en el build via EAS.
- **"Clean Architecture / Design System / SDD"** no está como fase en EXECUTION_PLAN.md. El plan ya usa Feature First (module pattern) como arquitectura. No se agrega.
