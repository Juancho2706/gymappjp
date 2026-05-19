# EVA v2 — Estado Actual de Ejecución

> Actualizar este archivo al terminar cada tarea o sesión.
> Plan completo: `docs/EXECUTION_PLAN.md`

---

## Reglas de trabajo (leer al inicio de CADA sesión)

- **Rama activa:** `v2/enterprise` — nunca trabajar en `master` para código v2
- **Supabase:** solo local (`http://127.0.0.1:54321`) para dev. `npx supabase start` si no está corriendo. Docker Desktop debe estar abierto primero
- **NO pushear a prod** (ni `git push` a master ni `npx supabase db push`) hasta terminar el plan completo
- **Migrations:** nuevas van en `supabase/migrations/` con timestamp ISO. Aplicar localmente con `npx supabase db reset`
- **Ritmo:** un ítem del plan a la vez. Marcar `[x]` aquí al terminar cada uno
- **Plan completo:** leer solo la sección necesaria de `docs/EXECUTION_PLAN.md` con offset/limit (3964 líneas, no leer entero)
- **Sin staging:** free tier de Supabase ocupado. Flujo: local → v2/enterprise branch → cuando plan completo → db push + deploy
- **Security migration ya aplicada:** `20260517120000_security_fixes.sql` — fixes de RLS y search_path pre-existentes. Pushear a prod junto con las migrations de v2
- **Tareas manuales:** `docs/MANUAL_TASKS.md` — todo lo que requiere acción tuya (dashboards, pagos, firmas). Sincronizado con este archivo.
- **MCP Supabase apunta a PROD** (`jikjeokundmaafuytdcx.supabase.co`) — NUNCA usarlo en dev. Solo Bash local.

### Modo de compilar Mobile: GitHub Actions FREE (NO EAS credits)
- **Workflow:** `.github/workflows/mobile-build.yml` — manual trigger desde Actions tab
- **Estrategia:** `eas build --local` en runners de GitHub. Android → `ubuntu-latest` (free Linux minutes), iOS → `macos-latest` (free macOS minutes, 10x billing rate pero **repo público = ilimitado**)
- **EAS credits gastados:** 0 (EAS solo se usa para auth + remote keystore Android, no para compilación)
- **Apple credentials:** vía secrets en GitHub (`IOS_DIST_CERT_BASE64`, password, provisioning profile base64) — escritos a `credentials.json` en runtime con Python heredoc
- **Workflow file debe existir en master** para mostrar "Run workflow" UI (limitación GitHub Actions) — ya copiado a master
- **EAS solo si gastamos todo:** si runners GitHub se acaban, fallback a EAS 15 builds/mes free tier
- **Workflow_dispatch ejecuta el archivo del branch seleccionado:** al lanzar build, elegir `v2/enterprise` para que use el código v2

---

## Fase Actual: FASE 6B Sem 1-2 — Auth + navegación por rol

**Rama git:** `v2/enterprise`
**Última actualización:** 2026-05-18 (sesión tarde: GitHub Actions local builds + Web APIs §2.8 + infra hardening — sin commit)

---

## Sesión 2026-05-18 (tarde) — Trabajo SIN COMMITEAR todavía

### Mobile build infra (GitHub Actions, sin gastar EAS credits)
- [x] Workflow `.github/workflows/mobile-build.yml` reescrito — `eas build --local` Android (ubuntu-latest) + iOS (macos-latest). Manual trigger (workflow_dispatch). Soporta apps `mobile` y `enterprise`, perfiles `staging`/`production`.
- [x] Workflow copiado a `master` (`workflow_dispatch` requiere file en default branch para mostrar UI button) — commit `e805cf9` en master
- [x] Secrets configurados en GitHub: `EXPO_TOKEN`, `IOS_DIST_CERT_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`
- [x] `apps/mobile/babel.config.js` — set EXPO_ROUTER_APP_ROOT en Babel worker process (fix monorepo Expo Router) — **insuficiente para EAS, ver siguiente fix**
- [x] `apps/mobile/index.js` — custom entry con `require.context('./app')` hardcoded, bypasea `_ctx.android.js` (env vars no resuelven en compile-time de Babel)
- [x] `apps/mobile/package.json` — `main: ./index.js` (era `expo-router/entry`)
- [x] `apps/mobile/assets/notification-icon.png` — placeholder (faltaba para `expo-notifications` prebuild)
- [x] `apps/mobile/eas.json` — `credentialsSource` per-platform (Android remote, iOS local) + `EXPO_ROUTER_APP_ROOT` en staging env
- [x] Workflow env: `GRADLE_OPTS` con 5g heap + 2g Metaspace (fix OutOfMemoryError en `:expo-updates:kspReleaseKotlin` en ubuntu-latest 7GB)
- [x] React deps dedupe via overrides en root `package.json` (fix expo-doctor duplicate react warning)
- [x] Apple Team ID `5GKWMMZ46Q` verificado y aplicado en `eas.json` + `apple-app-site-association`

### Infra hardening (sin commit)
- [x] `apps/web/src/app/api/health/route.ts` — health check endpoint para UptimeRobot (DB ping a `coaches`, devuelve `status/db/latencyMs/timestamp`, 200 OK ó 503)
- [x] `.github/dependabot.yml` — npm weekly (root, apps/mobile, apps/enterprise) + github-actions weekly. Target branch `v2/enterprise`. Grouped updates (types, eslint, next, supabase, testing). Ignores react/expo/react-native (manual).
- [x] `.github/workflows/ci.yml` — agregado step `npm audit --audit-level=high --omit=dev` con `continue-on-error: true` (warning, no bloquea)
- [x] `apps/enterprise/assets/` — placeholders copiados de mobile (icon, adaptive-icon, splash-icon, favicon, notification-icon) — destrabea futuro EAS build de enterprise

### Web APIs §2.8 — utility libs (sin commit, sin wirear UI todavía)
- [x] **§2.8.5 Badge API** → `apps/web/src/lib/badge-api.ts` — `setBadge`, `clearBadge`, `isBadgeSupported`. Silent fail si no soportado.
- [x] **§2.8.4 Speech synthesis** → `apps/web/src/lib/speech-synthesis.ts` — `speak`, toggle persistido en localStorage (`eva.speech.enabled`), `es-CL` voice preferida, cancel previo antes de hablar
- [x] **§2.8.2 Web Share + PR Card** → `apps/web/src/lib/web-share.ts` + `apps/web/src/lib/pr-card-canvas.ts` — Canvas 1080x1080 con título/stat/coach name, exporta `Blob` o `File`, integra con `navigator.share({files})` via `canShareFiles` check
- [x] **§2.8.1 Media Session** → `apps/web/src/lib/media-session.ts` — `setMediaMetadata`, `setMediaPlaybackState`, `setMediaHandlers` (play/pause/next/prev/stop/seek), `clearMediaSession`
- [x] **§2.8.3 Fullscreen + Orientation** → `apps/web/src/lib/fullscreen.ts` — `enter/exitFullscreen` + `lockOrientation` con fallbacks webkit (Safari iOS)

### PENDIENTE (Web APIs §2.8)
Wirear libs a componentes. Sin esto, las libs están listas pero no se usan:
- [ ] Badge API → hookear a count de push notifications no leídas (¿en `coach/layout.tsx`? necesita endpoint de unread count)
- [ ] Speech synthesis → toggle en `/c/[coach_slug]/workout/[planId]` settings + call en transición de ejercicio (WorkoutExecutionClient)
- [ ] Web Share → botón en pantalla de workout completado (después de log final) + en PR achievement modal
- [ ] Media Session → wirear en WorkoutExecutionClient para meta de ejercicio actual + handlers play/pause sincronizados con RestTimer
- [ ] Fullscreen + Orientation → toggle en WorkoutExecutionClient + auto-enter al iniciar workout (opcional)

### Bloqueo conocido (PRE-EXISTENTE, no de esta sesión)
- `npm run typecheck` falla en `src/lib/push.ts` por tabla `push_tokens` no en `database.types.ts` regenerado (Sem 1-2 mobile creó la tabla, types no fueron regenerados). Fix: `npx supabase gen types typescript --local > apps/web/src/lib/database.types.ts` después de `npx supabase db reset`. Mis 7 archivos nuevos compilan limpio.

---

---

## Fase Inmediata — Acciones no-técnicas (paralelas al desarrollo)

- [ ] Landing enterprise section live en producción (`LandingEnterpriseSection` mergeado a master) — **bloqueado: no mergear hasta terminar plan completo**
- [x] DPA Vercel firmado (vercel.com/legal) — ✅ Hecho por KimiCode
- [x] DPA Supabase firmado (Dashboard → Settings → Legal) — ✅ Hecho por KimiCode
- [ ] Bundle IDs registrados en App Store Connect (`cl.evaapp.eva` y `cl.evaapp.eva-enterprise`) — ver MT-12
- [ ] Google Play Developer account creada ($25 USD) — ver MT-13, en espera de dinero
- [x] One-pager PDF creado (Google Slides) — ✅ Hecho por KimiCode
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
- [x] Registro free coach con confirmación de email — `pending_email` permitido en DB, `/auth/confirm` activa a `active`

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
- [x] `packages/` monorepo base (`@eva/types`, `@eva/schemas`) — creado en Fase 6A

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
- [ ] Playbook D-7 a D+30 ejecutado (ver `docs/EXECUTION_PLAN.md` §5)
- [ ] Health score D14 calculado (MT-24)
- [ ] Google Sheets pipeline (MT-9) ✅ Hecho
- [ ] Demo org "EVA Demo Gym" creada en staging para ventas

---

## FASE 6 — Monorepo + React Native ← EN CURSO

> **Condición original del plan:** ambos clientes enterprise estables 2+ semanas.
> **Decisión 2026-05-17:** Skip condición de entrada — proceder ahora para tener apps listas para vender.

### 6A — Mover web a apps/web/ (1 semana)
- [x] `mkdir apps/web` + mover src/ public/ next.config.ts tsconfig.json
- [ ] Actualizar Vercel root directory → apps/web (manual MT-26, cuando corresponda deploy)
- [x] Actualizar tsconfig paths relativos
- [x] Verificar `npm run typecheck && npm run build`
- [x] Deprecar `/api/manifest/[coach_slug]/route.ts` (documentado; endpoint se conserva por compatibilidad web)
- [ ] Feature branch → PR → CI verde → merge

**Estado 6A:** código completado localmente y commiteado (`d73e47a chore: move web app into workspace`). No push. No prod.

**Validación 6A:**
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npx vitest run "apps/web/src/app/(auth)/register/actions.test.ts"`
- [x] `npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1`

### 6B.0 — Pre-flight Mobile ✅ COMPLETA (2026-05-18)
- [x] `npm install -g eas-cli` + `eas login` (jvillegas.dev@gmail.com → cuenta Juandeveva)
- [x] `apps/mobile/` scaffold Expo SDK 54 + Expo Router v6
- [x] `eas.json` con perfiles development/staging/production
- [x] `expo-updates` configurado (OTA, runtimeVersion: appVersion)
- [x] `app.json` completo (bundleId `cl.evaapp.eva`, targetSdkVersion 35, permisos, EAS Project ID: `a5f4f7c0-861c-48b1-9ed6-fc46e7843844`)
- [x] `PrivacyInfo.xcprivacy` en repo
- [x] ThemeContext + `lib/theme.ts` + `lib/push.ts`
- [x] `.well-known/apple-app-site-association` en repo (PLACEHOLDER_APPLE_TEAM_ID pendiente)
- [x] `.well-known/assetlinks.json` en repo (PLACEHOLDER_SHA256 pendiente — requiere primer build Android)
- [x] GitHub Actions EAS Build (`.github/workflows/mobile-build.yml`)
- [x] `.maestro/alumno-login.yaml` creado (stub)
- [x] Sentry — **descartado** (trial 2 semanas, sin presupuesto para plan paid)

**Prerequisitos MT pendientes (no bloquean desarrollo, sí bloquean build/submission):**
- [x] MT-11: Apple Team ID `5GKWMMZ46Q` (Guimel) → eas.json + AASA actualizados ✅
- [ ] MT-12: Bundle ID `cl.evaapp.eva` registrado en App Store Connect
- [ ] MT-13: Google Play account ($25 USD) — **solo para submission, NO para APK de prueba**
- [x] MT-14: Cuenta Expo EAS creada ✅ (EAS Project ID: a5f4f7c0)
- [ ] MT-15: Sentry — descartado

### 6B Sem 1-2 ← COMPLETO
- [x] Supabase client mobile (`apps/mobile/lib/supabase.ts`) — detectSessionInUrl: false
- [x] Branding por invite_code (`apps/mobile/lib/branding.ts`) — AsyncStorage persistence
- [x] ThemeContext (`apps/mobile/context/ThemeContext.tsx`) — light/dark + coach primary color
- [x] Auth guard en root layout — redirect a / si pierde sesión
- [x] `(auth)/login.tsx` — login compartido coach y alumno con role param
- [x] `(auth)/forgot-password.tsx`
- [x] `alumno/codigo.tsx` — ingreso invite_code 5 chars + carga branding
- [x] Coach tabs (5): clientes, builder, nutricion, check-ins, perfil (stubs)
- [x] Alumno tabs (4): workout, nutricion, check-in, perfil (stubs, logout en perfil)
- [x] Migration `push_tokens` (20260518000000) — aplicada localmente
- [ ] Aplicar migration localmente con `npx supabase db reset` — ✅ YA hecho (2026-05-18)

**Pendiente Sem 1-2:**
- [ ] `apps/mobile/.env` apuntando a Supabase local (crear en cada máquina, no se commitea)
- [ ] Probar flujo completo en Expo Go / simulador

**Sem 3-4 — COMPLETO (commit 5a3ea80, 2026-05-18):**
- [x] `alumno/(tabs)/workout.tsx` — planes del programa activo por day_of_week, hoy destacado, sync button offline logs
- [x] `alumno/workout/[planId].tsx` — BlockCard por ejercicio, log sets, rest timer, fallback offline
- [x] `alumno/(tabs)/nutricion.tsx` — plan activo + macros, comidas del día filtradas por day_of_week (DB 1=Lun…7=Dom), toggle completado via daily_nutrition_logs + nutrition_meal_logs
- [x] `alumno/(tabs)/check-in.tsx` — image picker, upload a bucket `checkins`, peso/energía/notas
- [x] `lib/client.ts` — getClientProfile (clients.id = auth.uid())
- [x] `lib/offline-cache.ts` — cachePlan, getCachedPlan, enqueueLog, flushLogQueue, getPendingLogCount

**Estrategia de testing mobile (decisiones 2026-05-18):**
- **Supabase remoto desde celular fuera de red:** ngrok (`ngrok http 54321`) → URL temporal → cambiar `EXPO_PUBLIC_SUPABASE_URL` en `.env` — ver MT-27
- **Android test build (sin Google Play):** EAS build → APK → instalar directo en celular Juan — ver MT-28. Google Play ($25) solo necesario para submisión pública.
- **iOS test en celular de amigo:** Registrar UDID dispositivo → EAS build ad-hoc → link de descarga — ver MT-29. TestFlight disponible cuando app tenga listing en App Store Connect.

### 6B — EVA App React Native (12 semanas)
**Roadmap por semanas:**
- Sem 1-2: Auth + selector rol (SOY COACH / SOY ALUMNO) + ThemeContext + branding por invite_code
- **[COMPLETO]** Sem 3-4: Módulo alumno completo (workout, nutrición, check-in, offline cache)
- **[COMPLETO]** Sem 5: Push notifications (expo-notifications) — commit 740a8f8 (2026-05-18)
  - configurePushHandler + Android channel en _layout.tsx
  - syncPushToken on session login, tap handler → router.push
  - web/lib/push.ts extendido: VAPID (PWA) + Expo push API (mobile) en paralelo
  - app.json: expo-image-picker plugin + iOS photos permission
- **[COMPLETO]** Sem 6-7: Módulo coach — commit c34c21a (2026-05-18)
  - clientes.tsx: lista con búsqueda, badge activo/inactivo, tap → detalle
  - check-ins.tsx: check-ins recientes de todos los clientes, barra energía (rojo/amber/verde)
  - builder.tsx: chip picker de clientes + vista planes (read-only; edición en web)
  - coach/cliente/[clientId].tsx: detalle cliente — info, último check-in, programa activo
  - lib/coach.ts: getCoachProfile
- **[COMPLETO]** Sem 8: Coach enterprise + deep linking — commit f6fb827 (2026-05-18)
  - lib/org.ts: getCoachOrgContext() — org_id/org_role desde JWT, fetch org name
  - coach/perfil.tsx: muestra sección org (si org_managed) u oculta billing (standalone)
  - (auth)/reset-password.tsx: pantalla cambio password post deep link
  - _layout.tsx: Linking listener — parsea hash #access_token → setSession → tipo recovery → /reset-password
- **[POSTERGADO → v1.1]** Sem 9: In-app messaging — coaches ya usan WhatsApp; feature compleja (historial paginado, unread badges, Realtime reconnect). Schema `messages` ya documentado en EXECUTION_PLAN.md §6B.
- **[v1.1]** Sem 10: HealthKit/Health Connect + pedómetro + background timer
- **[v1.1]** Sem 11: NFC check-in + video form review setup
- **[v1.1]** Sem 12: Leaderboards básicos + streaks de workout
- **[PRÓXIMO]** Sem 13: Auditoría Guimel + App Privacy Labels + screenshots + polish final

**DB migrations necesarias antes de Sem 1:**
- [x] `push_tokens` table ✅ (20260518000000, aplicada local)
- [ ] `attendance_logs` table (Sem 5+, NFC)
- [ ] `form_reviews` table (v1.1, puede esperar)

**Stubs restantes (todos completados 2026-05-18, commit 853fa90):**
- [x] `coach/(tabs)/nutricion.tsx` — chip picker clientes + lista planes con macros (activo badge, meal count)
- [x] `alumno/(tabs)/perfil.tsx` — nombre, email, coach branding, peso objetivo, miembro desde, logout

**Antes de App Store submission (Sem 13):**
- [ ] App Privacy Labels (fitness, nutrition, health, user content)
- [ ] Data Safety Form Google Play
- [ ] Screenshots iPhone 16 Pro Max: coach mode (3+) y alumno mode (3+)
- [ ] App Review Notes con credenciales demo por rol
- [ ] Verificar `EVANative` en userAgent (expo-constants)

### 6C — EVA Enterprise App React Native (8 semanas, paralelo a 6B sem 5-12)
- Bundle ID: `cl.evaapp.eva-enterprise`
- Dashboard org, gestión coaches, pool alumnos, reportes, branding, billing

---

## Notas / Decisiones tomadas

- Flujo: `CURRENT_PHASE.md` como tracker liviano, `EXECUTION_PLAN.md` como referencia completa
- No staging (free tier ocupado) — local → prod directo al final
- **Bug crítico resuelto 2026-05-17:** `org_members_see_peers` tenía recursión infinita en PostgreSQL RLS. Migration `20260517150000_fix_rls_recursion.sql` resuelve con función SECURITY DEFINER `is_active_org_member()`. Este bug hubiera afectado producción.
- **Registro free coach v2:** Supabase Auth confirma email con link; DB usa `subscription_status='pending_email'` hasta `/auth/confirm`, luego `active`. Migration `20260517160000_allow_pending_email_subscription_status.sql`.
- **MCP Supabase apunta a PROD** — nunca ejecutar SQLs de desarrollo via MCP. Solo Bash local.
- **Mobile env vars:** .ipa/.apk conecta directamente a Supabase (no pasa por Vercel). Vars van en `apps/mobile/.env` con prefijo `EXPO_PUBLIC_*` y se hornean en el build via EAS.
- **"Clean Architecture / Design System / SDD"** no está como fase en EXECUTION_PLAN.md. El plan ya usa Feature First (module pattern) como arquitectura. No se agrega.
