# G11 — Infra transversal: datos + auth + offline + push + links

> Dominio: estrategia de capa de datos mobile, entitlements como package, auth (bearer/trailing-slash/Google/invite_code/push_tokens/.well-known), universal links iOS, deep links Android, offline queue, expo-updates/OTA, versionado/rollout, telemetria, rendimiento, i18n.
> Fecha: 2026-07-08. Solo lectura. Rutas absolutas verificadas en codigo.
> Insumos leidos: research 01/06/07/08 + verificacion directa de fuentes (ver §6).

---

## 0. Resumen ejecutivo (que esta bien, que falta)

Al contrario que las capas visuales, la **infra transversal de mobile esta razonablemente madura**: el cliente Supabase, el bridge HTTP con manejo central de 401, la cola offline con dedup idempotente, el registro de push token (con delivery server-side ya cableado en web), la biometria opt-in y el db-compat shim ya existen y estan bien construidos. El grueso del trabajo aqui NO es "reconstruir" sino **cerrar huecos puntuales de alto impacto** (algunos P0 de seguridad/lanzamiento) y **adoptar 3 packages `@eva/*`** para matar drift.

Huecos criticos confirmados:
- **Entitlements = gap TOTAL.** `grep MODULE_KEYS|enabled_modules` en `apps/mobile` = 0 resultados. Ningun gate de modulos de pago, ni mirror de kill-switch. Bloqueante para construir cardio/movement/bodycomp/exchanges sin abrir agujero de seguridad.
- **iOS universal links NO funcionan.** `app.json` no declara `associatedDomains` (confirmado ausente). El `apple-app-site-association` SI existe y esta bien formado, pero sin `associatedDomains` en el binario iOS los links https no abren la app.
- **Android App Links NO verifican.** `apps/web/public/.well-known/assetlinks.json` tiene `"PLACEHOLDER_SHA256_CERT_FINGERPRINT"` — `autoVerify:true` fallara en prod → los links `/c/`, `/invite/`, `/reset-password` no capturan a la app hasta poner el SHA256 real de la firma de EAS.
- **Sin telemetria de errores.** Existe `AppErrorBoundary` global pero NO hay Sentry (ni ningun crash/error reporter) cableado. Vuelo a ciegas en prod.
- **OTA configurado pero no invocado.** `expo-updates` esta en `app.json`/plugins con EAS Update URL + `runtimeVersion: appVersion`, pero no hay codigo que llame `Updates.checkForUpdateAsync`/`reloadAsync` en runtime; solo el fetch-on-launch por defecto (`fallbackToCacheTimeout:0` = no espera).

Excepciones intencionales confirmadas y respetadas: checkout/pagos/cambio-tarjeta = web-only; icono+splash = EVA-only; enterprise mobile = diferido. Ver §5.

---

## 1. Gaps funcionales (por sub-dominio)

### 1.1 Capa de datos — PostgREST directo vs `/api/mobile/*`

**Estado actual (verificado):**
- `apps/mobile/lib/supabase.ts` (1-16): un unico cliente `createClient(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY)` con `storage: AsyncStorage`, `autoRefreshToken`, `persistSession`, `detectSessionInUrl:false`. **Mobile habla PostgREST DIRECTO (anon key + JWT del usuario, RLS-scoped) para casi todo** (~28 tablas, conteo en research 06 §C).
- `apps/mobile/lib/api.ts` (26-65): `apiFetch<T>` es el bridge a `apps/web` para lo que necesita service-role, firma de URLs, o logica server-side. Solo 8 endpoints `/api/mobile/*` consumidos hoy (register-coach-free, checkin-photos, clients/pulse, clients CRUD, clients reset-password, dashboard, clients create, payments).

**Regla de decision (que va por cada via) — recomendacion:**
| Caso | Via | Por que |
|---|---|---|
| Lectura RLS-scoped del propio coach/alumno | PostgREST directo | RLS ya protege; el JWT lleva el scope |
| Mutacion user-scoped normal (log, check-in, toggle nutricion) | PostgREST directo | RLS + GRANTs de columna la cubren |
| Cualquier cosa que toque **service-role** (crear alumno, reset password, firmar URLs de bucket privado, registrar pago manual) | `/api/mobile/*` | RN NUNCA debe tener service-role (regla CLAUDE.md + handoff) |
| **Gate de DINERO / entitlements de modulos de pago** | `/api/mobile/*` con `assertModule` server-side | NO confiar en el cliente; ver 1.2 |
| Flags de operador (kill-switch, feature-prefs) | `/api/mobile/config` | Env server-only que RN no puede leer |

**Gotcha 42501 (GRANT column-level) — RIESGO VIVO para mobile:** CLAUDE.md documenta que `coaches`/`teams`/`clients` tienen REVOKE UPDATE a nivel tabla + `GRANT UPDATE(allowlist)`. **Toda columna nueva que el usuario deba editar user-scoped exige `GRANT UPDATE(col)` en la MISMA migracion, y PostgREST devuelve `42501` en runtime si falta — esto afecta directo a mobile** (habla PostgREST puro, sin capa Next que lo intercepte). El delta post-21-jun (research 01 §8) agrego columnas: sustitucion en `workout_logs` (`e4fd7c32`), `client_intake.sex` (`3a9b392a`), branding v2 (`ee6bf8b0`). Estas migraciones ya incluyen sus GRANTs, pero cualquier feature nueva del plan de paridad que escriba columnas nuevas desde mobile debe verificar el GRANT antes del build. Incidentes historicos: `project_whitelabel_v2_update_grant_outage` (42501 branding), `project_alumno_login_outage_anon_grant` (anon sin GRANT branding).

**db-compat shim** (`apps/mobile/lib/db-compat.ts`, verificado): `isMissingColumnError` (PGRST204/42703/PGRST200/"does not exist"/"schema cache"/"could not find") + `selectWithFallback(rich, minimal)` + `optionalCol`. Tolera prod standalone (sin `org_id`/`reviewed_at`) vs enterprise. **Sigue siendo necesario mientras el APK en manos de usuarios pueda pegar a una DB con schema mas viejo que el que el codigo espera** (drift APK↔prod). El plan debe mantener este patron para columnas nuevas riesgosas (envolver en `selectWithFallback` / `optionalCol`).

**Endpoints `/api/mobile/*` que EXISTEN en web pero mobile NO consume** (gap de paridad funcional, research 06 §C): `bodycomp/[id]|bia|isak`, `cardio/profile`, `movement/*` (assessment/draft/finalize/item), `nutrition/exchanges/*` (meal-variant/set-mode/targets/variants), `config`, `coach/slug`, `coach/support`, `team/add-coach`. Son las features de modulos de pago + config que estan sin cablear.

### 1.2 Entitlements / modulos de pago — GAP TOTAL (P0 arquitectonico)

- **0 referencias** a `MODULE_KEYS`/`enabled_modules` en `apps/mobile` (research 07 §C.4, confirmado). Mobile no lee `coaches.enabled_modules`/`teams.enabled_modules`, no aplica kill-switch de operador, no gatea ninguna superficie de pago.
- Web: `apps/web/src/services/entitlements.service.ts` (no puro — habla Supabase). Lo **puro y extraible** es `MODULE_KEYS`/`ModuleKey`/`EnabledModules`/`isModuleKilledByOperator`/`applyOperatorKillSwitch`. `@eva/feature-prefs` YA declara un `ModuleKey` espejo (verificado por test cruzado) y `@eva/module-catalog` YA tiene copy/precio/surfaces por modulo — **ambos pensados para RN pero sin consumir en mobile**.
- **Endpoint de kill-switch para mobile YA existe:** `apps/web/src/app/api/mobile/config/route.ts` (verificado): GET con Bearer devuelve `{ disabledModules, featurePrefsEnabled }` (kill-switch de `EVA_DISABLED_MODULES` + flag Edge Config `FEATURE_PREFS_ENABLED`, fail-OPEN). Mobile no lo consume aun.
- **Gate de dinero server-side YA existe:** commit `ce8456e6` agrego endpoints `assertModule` para escrituras de modulos pagos. La infra server esta; falta el cliente RN.

**Modelo de gating a replicar (research 07 §C.4, nota de seguridad):** el gate real (`hasModule`/`assertModule`) NO debe vivir solo en la UI mobile — si mobile construye pantallas de cardio/etc. sin el gate server-side en cada mutacion, un coach/alumno sin el modulo activo puede invocar la funcionalidad via PostgREST directo. El **enforcement de dinero DEBE pasar por `/api/mobile/*` (`assertModule`) o por RLS/RPC server-side**; la UI mobile solo espeja visibilidad. Fetch de `enabled_modules` desde `coaches`/`teams` se reimplementa en mobile via PostgREST directo (patron `lib/*.queries.ts`), no via package.

### 1.3 Auth

**Bearer / bridge (verificado):**
- `apiFetch` (`lib/api.ts` 38-53): adjunta `Authorization: Bearer <access_token>` solo si `authenticated:true`; en 401 refresca sesion 1x y reintenta; si sigue 401 → `signOut()` (evita sesion zombi). Solido.
- Server: `apps/web/src/lib/mobile-auth.ts` (verificado): `verifyMobileBearer` = verificacion local con JWKS (jose, sin red) para el camino rapido; token expirado → 401 local; cualquier otra cosa (iss/aud drift, JWKS caido, kid/alg) degrada a `admin.auth.getUser` (autoritativo). **SOLO para GET read-only; las mutaciones de cuenta deben usar `getUser` directo** (jose no ve revocacion). AUDIENCE `authenticated`.
- **Trailing-slash gotcha (verificado, ya blindado):** `mobile-auth.ts` `supabaseUrl()` (24-28) hace `.replace(/\/+$/, '')` para que un `/` final en `NEXT_PUBLIC_SUPABASE_URL` no genere issuer `${url}//auth/v1` != iss real → falso claim-mismatch. Memoria `project_mobile_auth_401_incident` marca "follow-up trailing slash env" — el codigo ya lo maneja del lado issuer, pero **el follow-up pendiente es en `EXPO_PUBLIC_API_URL`** (mobile): `getApiBaseUrl()` (`lib/api.ts` 22-24) tambien hace `.replace(/\/$/, '')`, o sea el path se concatena limpio; verificar que el env de prod no tenga doble-slash. Riesgo bajo hoy.

**Google OAuth coach — GAP (P1 funcional):** web ahora usa Google Identity Services + `signInWithIdToken` (PRs #108/#109). `apps/mobile/app/(auth)/login.tsx` NO tiene boton de Google (research 06 confirma). **Replicar con SDK NATIVO** (`@react-native-google-signin/google-signin` o `expo-auth-session`) + `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })` — NO copiar el flujo web (iframe GIS no aplica en RN). Requiere client IDs de iOS/Android en Google Cloud + config plugin. Nota: login Google del ALUMNO esta DIFERIDO por CEO (`project_alumno_google_login_deferred`); esto es solo coach.

**invite_code P0 (verificado, resuelto):** `apps/mobile/lib/branding.ts` resuelve branding por `invite_code` (regex `^[A-Z2-9]{5}$`) o slug, cachea en AsyncStorage (`eva_coach_branding`); `+native-intent.ts` mapea `/c/<x>` e `/invite/<code>`. **invite_code es el identificador primario del alumno** — consistente con memoria/CLAUDE.md. Sin gap funcional aqui; puede haber gap visual en la pantalla `codigo.tsx` (fuera de mi dominio).

**Gates de acceso (verificado):** `app/_layout.tsx` (114-128) redirige a `/` si no hay sesion en zonas protegidas (coach + alumno salvo `codigo`); `alumno/(tabs)/_layout.tsx` gatea `blocked`→suspended y `forcePasswordChange`→change-password. `change-password.tsx` fuerza cambio. Correcto.

### 1.4 Push (P0 — mayormente resuelto)

- **Registro (verificado):** `lib/push.ts` `syncPushToken` pide permisos, obtiene Expo push token (projectId de `expoConfig.extra.eas`), upsert en `push_tokens` (`onConflict: user_id,device_id`), device_id ESTABLE (`eva_device_id`, `Crypto.randomUUID`). `revokePushToken` borra la fila de este device en logout. `setupAndroidChannel` ('default', importance MAX). Disparado 1x por sesion en `_layout.tsx` (131-136).
- **Delivery (verificado, cableado en WEB):** `apps/web/src/lib/push.ts` `sendPushToClient` (44-51) hace `Promise.all` sobre `push_subscriptions` (web-push VAPID) **Y** `push_tokens` (Expo), y `sendExpoTokens` (24-42) hace POST a `https://exp.host/--/api/v2/push/send`. **O sea el backend ya entrega push a los devices RN** via la tabla `push_tokens`. White-label: usa logo/brandName del coach.
- **Tap handler (verificado):** `_layout.tsx` (91-94) `data.screen` → `router.push`.
- **Gaps menores:** (a) el badge numerico (Badging API en web, `0cf292da`) NO tiene equivalente nativo cableado — usar `Notifications.setBadgeCountAsync` (research 01 §1.6). (b) `setupAndroidChannel` `lightColor: '#007AFF'` es el color viejo del sistema, no un token EVA DS (cosmetico). (c) push local / recordatorios sin backend = backlog nativo post-paridad (`mobile-native-advantages`).

### 1.5 Universal links iOS / deep links Android / .well-known (P0)

- **iOS `associatedDomains` AUSENTE (verificado en `app.json`):** no hay bloque `ios.associatedDomains`. **Los universal links https NO abren la app en iOS** aunque el AASA se sirva. Gap P0 para paridad iOS.
- **`apple-app-site-association` (verificado):** existe en `apps/web/public/.well-known/`, bien formado: `appID: 5GKWMMZ46Q.cl.evaapp.eva` paths `/c/*`,`/invite/*`,`/reset-password`; + entry `-enterprise` para `/org/*`; `webcredentials` para autofill de password. Listo del lado servidor; falta el `associatedDomains` en el binario.
- **Android intentFilters (verificado en `app.json`):** presentes con `autoVerify:true` para `https://eva-app.cl` pathPrefix `/c/`, `/invite/` y path `/reset-password`. Correcto.
- **`assetlinks.json` (verificado) — ROTO:** `sha256_cert_fingerprints: ["PLACEHOLDER_SHA256_CERT_FINGERPRINT"]`. **App Links NO verificaran** hasta poner el SHA256 real de la firma de release de EAS. Sin esto, `autoVerify` falla silenciosamente y los links no capturan a la app en Android prod. P0.
- **Deep link routing (verificado):** `+native-intent.ts` (nativo) resuelve `/c/<slug>` e `/invite/<code>` → branding cache → `/(auth)/login?role=alumno` (no hay ruta espejo `/c/[slug]` en la app, por diseno). `_layout.tsx` `processDeepLink` (73-85) parsea hash `access_token`/`refresh_token`/`type=recovery` → `setSession` → `/(auth)/reset-password`. Cubre cold-start (`getInitialURL`) y running (`addEventListener`). Solido.

### 1.6 Offline queue (bien construido; falta generalizacion)

- **Dos colas (verificado, `lib/offline-cache.ts` + `lib/nutrition-offline-cache.ts`):** cola de logs de entreno (`enqueueLog`/`flushLogQueue`, dedup select-then-update/insert por client+block+set dentro del dia Santiago, per-item resiliente, preserva `logged_at`, borra duplicados) y cola de nutricion (`enqueueNutritionToggle`/`flushNutritionQueue`, dedup por mealId+date). Cache de plan por `eva_plan_<id>`. Flush disparado al volver de background (`alumno/(tabs)/_layout.tsx`). `lib/use-online.ts` + `@react-native-community/netinfo`.
- **Gaps:** (a) idempotencia por **select-then-update, no por `client_log_id`** — la foundation doc (`mobile-shared-foundation`, research 08 §6) recomienda idempotencia por id de log generado en cliente. La implementacion actual funciona pero es mas fragil (una carrera entre dos flushes podria duplicar antes de que el select vea la fila). (b) **cola generalizada ausente:** solo hay 2 colas ad-hoc; check-in (fotos, peso), sustitucion de ejercicio, y cualquier mutacion futura NO tienen cola offline. Web agrego optimistic+reconcile robusto (`session-logs.optimistic.ts`/`.reconcile.ts`, research 01 §2.1) que mobile no tiene. Un `enqueue`/`flush` generico parametrizado por tabla + resolver de conflicto seria el patron a extraer.

### 1.7 expo-updates / OTA / versionado / rollout

- **Config (verificado):** `app.json` `updates.url` (EAS Update `a5f4f7c0-...`), `fallbackToCacheTimeout:0`, `runtimeVersion.policy: appVersion`, plugin `expo-updates`. `eas.json` (research 06 §F): channels `staging`/`production`, `appVersionSource: remote`, `autoIncrement` en production.
- **Gap:** NO hay codigo runtime que consulte OTA (`Updates.checkForUpdateAsync`/`fetchUpdateAsync`/`reloadAsync`) — grep de `expo-updates|Updates.|reloadAsync` solo pega en `package.json`/`app.json`. Con `fallbackToCacheTimeout:0` la app arranca inmediato con el bundle cacheado y baja el update en background para el proximo lanzamiento; **no hay UX de "actualizacion disponible, reinicia"** ni check en foreground. Aceptable para MVP, pero para rollout controlado conviene un hook de update explicito (P3).
- **runtimeVersion `appVersion`:** implica que un cambio nativo (nueva lib nativa, SDK bump) rompe compat OTA → hay que subir `version` y hacer build nuevo. El plan de paridad va a agregar libs nativas (Google Sign-In, posiblemente view-shot, notifee) → cada una fuerza build EAS nuevo, no OTA. Anotar en el plan.

### 1.8 Telemetria de errores (P1 lanzamiento)

- **Solo `AppErrorBoundary`** global (`components/AppErrorBoundary.tsx`, exportado como `ErrorBoundary` de expo-router en `_layout.tsx` 61). El grep de "sentry" solo pega ahi (probablemente un comentario/placeholder, no una integracion real). **No hay Sentry/Bugsnag/crashlytics cableado.** `coach-mobile-readiness-review` (research 08 §4) lo marca como P0 de lanzamiento. Fuera del alcance estricto de "paridad 1:1" pero critico antes de escalar usuarios. Recomendado: `@sentry/react-native` con el mismo DSN/proyecto que web si aplica.

### 1.9 Rendimiento (listas grandes, charts)

- **FlashList disponible** (`@shopify/flash-list` 2.3) pero las pantallas gigantes sin migrar (`clientes.tsx` 1224 L, `builder.tsx` 1279, `program-builder.tsx` 1234) usan patrones legacy — verificar que usen FlashList y no `.map()` sobre arrays grandes. Charts: `victory-native` 41 + `@shopify/react-native-skia` 2.2 (`coach/charts/AreaTrend`, `BarComposed` usan Skia). Adecuado; el riesgo es re-render de charts pesados en dashboards. No es gap de infra per se, pero el re-skin debe no regresionar rendimiento de listas.

### 1.10 i18n (baja prioridad)

- **Web:** `apps/web/src/lib/i18n/LanguageContext.tsx` (verificado) — dict `en`/`es`, español-first (`'es'` default, no deriva de `navigator.language`), persist en `localStorage 'omni-lang'`. Usado sobre todo por el modulo **nutrition-exchanges** (gated) y landing. Tests de paridad/orphans.
- **Mobile:** NO tiene i18n (los hits de grep fueron `locale`/`date` no relacionados). **Baja prioridad:** la app es español-first (regla de trabajo `feedback_spanish_no_accents`), y el unico consumidor real de i18n (exchanges) es un modulo de pago que mobile aun no tiene. Si el plan cablea exchanges en mobile, ahi si necesitara portar el dict `es` de exchanges. No replicar el selector en/es ahora.

---

## 2. Gaps visuales (acotados a mi dominio)

Mi dominio es infra, casi sin superficie visual propia. Los pocos tocables:
- **Splash `EvaSplash`** — EVA-only por decision (no white-label), se mantiene; solo re-skin al DS si diverge del splash web. (Visual, S, delegable a dominio visual.)
- **`BiometricLock`, `OfflineBanner`, `SyncStatusPill`, `AppErrorBoundary` (pantalla de error), `EvaLoaderScreen`** — estados transversales que deben adoptar tokens EVA DS (patron A). Hoy mezclan patron A/B. (Visual, cae en la ola de re-skin de componentes core.)
- **`setupAndroidChannel` lightColor `#007AFF`** — token viejo, cambiar a acento EVA DS (cosmetico, XS).

Todo lo demas de mi dominio es no-visual.

---

## 3. Costuras (packages/ vs API) — cita research 07

1. **Adoptar `@eva/feature-prefs` + `@eva/module-catalog` en mobile** (research 07 §A.3/A.4, §C.4). Ambos son puros, ya existen, pensados para RN, y son la raiz del gap de entitlements. `feature-prefs` da `ModuleKey`/`PRESETS`/resolver `visible = ENTITLED AND ENABLED`; `module-catalog` da label/pitch/precio/surfaces. **Prerequisito de infra:** el `tsconfig.json` de mobile solo declara paths para 3 packages (`schemas`, `brand-kit`, `tiers`); hay que agregar paths para estos + `nutrition-engine` + `calc`, y verificar resolucion en Metro (research 06 §D). `package.json` de mobile no lista `@eva/*` como deps (se resuelven via tsconfig paths + monorepo).
2. **Fetch de `enabled_modules` = PostgREST directo en mobile**, NO package (research 07 §C.4). El dato es RLS-scoped; el package solo aporta las constantes/tipos.
3. **`/api/mobile/config` para flags de operador** (verificado): kill-switch + feature-prefs son env server-only → mobile DEBE consumirlos por API, no puede leerlos. Cablear este endpoint es la costura correcta (no duplicar logica de kill-switch en cliente).
4. **Gate de dinero via `/api/mobile/*` `assertModule`** (research 01 §6, commit `ce8456e6`): la costura de seguridad correcta es API server-side, no logica cliente.
5. **`@eva/brand-kit` como motor white-label unico** (research 08 decision #7): ya adoptado en mobile (`lib/theme.ts`, `motion.ts`, `coach-brand.ts`, `IconButton`). Mantener; cualquier ramp DS extiende este motor.
6. **Idempotencia offline como package puro (candidato nuevo):** la logica de dedup/reconcile (`session-logs.reconcile.ts` de web, research 01 §2.1) es pura y testeable → candidata a `packages/` compartida en vez de reimplementar en `offline-cache.ts` mobile. Requiere que el arquitecto defina un tipo de log neutro.

---

## 4. Tareas propuestas (ordenadas, atomicas)

### Ola A — Cimientos de infra (habilitan todo lo demas; pre-visual o en paralelo)

- **A1 [SEAM] Adoptar packages `@eva/*` faltantes en mobile.** Agregar tsconfig paths + verificar Metro para `@eva/feature-prefs`, `@eva/module-catalog`, `@eva/nutrition-engine`, `@eva/calc`. Reemplazar duplicados (`lib/macro-calculator.ts`, `lib/nutrition-utils.ts` → re-export del engine). **S.** Dep de: casi todo lo funcional posterior.
- **A2 [FUNCIONAL] Fix `assetlinks.json` SHA256 real (Android App Links).** Poner el fingerprint de la firma de release EAS en `apps/web/public/.well-known/assetlinks.json`. **S.** Sin deps. (Excepcion "solo apps/web" del handoff aplica.) P0.
- **A3 [FUNCIONAL] `associatedDomains` iOS.** Agregar `ios.associatedDomains: ["applinks:eva-app.cl","webcredentials:eva-app.cl"]` en `app.json` + build nuevo. **S.** Sin deps. P0.
- **A4 [FUNCIONAL] Cliente de entitlements mobile.** Consumir `/api/mobile/config` (kill-switch + feature-prefs) + leer `coaches/teams.enabled_modules` por PostgREST + resolver `visible` con `@eva/feature-prefs`. Exponer un hook `useEntitlements()`. **M.** Dep: A1. Bloquea 1.2 y todas las pantallas de modulos.
- **A5 [FUNCIONAL] Telemetria de errores (Sentry RN).** Cablear `@sentry/react-native`, envolver `AppErrorBoundary`, source maps en EAS. **M.** Sin deps duras. P1 lanzamiento.

### Ola B — Auth y push (paridad funcional)

- **B1 [FUNCIONAL] Google Sign-In coach nativo.** `@react-native-google-signin` (o expo-auth-session) + `signInWithIdToken`; client IDs iOS/Android; boton en `login.tsx`/`register.tsx`. **M.** Dep: build EAS nuevo (lib nativa). P1.
- **B2 [FUNCIONAL] Badge numerico nativo.** `Notifications.setBadgeCountAsync` con comidas/entrenos pendientes (espejo de Badging API web). **S.** Sin deps. P2.
- **B3 [VISUAL] Token de color del canal Android + estados transversales.** `lightColor` EVA DS; re-skin de `OfflineBanner`/`SyncStatusPill`/`BiometricLock`/error screen a patron A. **S.** Cae en ola visual de componentes core.

### Ola C — Offline y datos robustos

- **C1 [SEAM] Cola offline generalizada + idempotencia por `client_log_id`.** Refactor de `offline-cache.ts` a un enqueue/flush generico parametrizado; portar reconcile puro desde `@eva/` (extraer de web `session-logs.reconcile.ts`). **L.** Dep: coordinar con dominio de ejecucion de rutina (usa las mismas colas). Alto valor de correctness.
- **C2 [FUNCIONAL] Verificar/agregar GRANTs de columna para features nuevas.** Auditar cada columna que el plan escriba desde mobile contra `information_schema.column_privileges` (suite `tests/separation/module-grants.sql`). **S por feature.** Dep: cada feature funcional que mute columnas nuevas.
- **C3 [FUNCIONAL] Cablear endpoints mobile sin usar** (cardio/movement/bodycomp/exchanges/team) segun prioridad del plan funcional. **XL** (es varias features). Dep: A4 (entitlements) — bloqueante de seguridad.

### Ola D — Rollout / OTA (posterior)

- **D1 [FUNCIONAL] Hook de OTA en foreground.** `Updates.checkForUpdateAsync` + prompt "actualiza". **S.** P3.
- **D2 [FUNCIONAL] i18n exchanges (solo si se cablea exchanges).** Portar dict `es` de exchanges. **S.** Dep: C3-exchanges. Baja prioridad.

**Reparto ola re-skin visual vs ola funcional:** de mi dominio, solo B3 y el splash entran en la ola visual. A2/A3 (links) y A4/A5 (entitlements/telemetria) son infra habilitante que conviene hacer ANTES o en paralelo al re-skin (no dependen de UI). B1/B2/C1/C2/C3/D* son ola funcional posterior.

---

## 5. Excepciones intencionales (confirmadas, NO tocar)

- **Checkout/pagos/cambio-tarjeta = web-only** (money-safety + IAP). `subscription.tsx` es solo-lectura; pagos manuales de coach via `/api/mobile/coach/payments`. Confirmado en 3 docs (research 08 decision #1). La rama actual `feat/pagos-flow-mercadopago` (Flow+MP) es toda web — no portar.
- **Icono app + splash = EVA-only** (un binario, no per-coach). `app.json` icon/splash EVA. Confirmado.
- **Enterprise mobile = diferido/No-Go.** El `AuthProvider` debe disenarse para no requerir reescritura despues, pero no construir enterprise ahora. `apps/enterprise` es app separada que no comparte `@eva/*` (research 07 §E).
- **Login Google ALUMNO = diferido por CEO** (`project_alumno_google_login_deferred`). B1 es solo coach.

---

## 6. Riesgos (tecnicos y de drift)

- **[P0 links] `assetlinks.json` placeholder + iOS sin associatedDomains** → los universal/app links NO funcionan en prod hoy. Si se lanza sin arreglar, todo el flujo `/c/`/`/invite/` cae al navegador en vez de la app. (A2/A3)
- **[P0 seguridad] Entitlements sin gate** → construir cualquier pantalla de modulo de pago sin `assertModule` server-side abre agujero: un usuario sin el modulo activo lo invoca por PostgREST directo. (A4 antes de C3)
- **[Alto, drift] 42501 en runtime** → columnas nuevas escritas desde mobile sin `GRANT UPDATE(col)` en la migracion rompen solo en prod (PostgREST no lo detecta en build/typecheck). Patron historico repetido (2 incidentes). (C2)
- **[Alto, drift] APK viejo ↔ prod nueva** → `runtimeVersion: appVersion` + un APK en manos de usuarios con schema esperado mas viejo. `db-compat` mitiga columnas faltantes pero NO cambios de forma mas profundos. Cada lib nativa nueva del plan fuerza build EAS (no OTA) → fragmentacion de versiones en campo.
- **[Medio, correctness] Idempotencia offline por select-then-update** (no `client_log_id`) → carrera entre flushes concurrentes podria duplicar logs. Web ya migro a optimistic+reconcile; mobile quedo atras. (C1)
- **[Medio, drift silencioso] Ports manuales sin package** → `macro-calculator.ts` (drift numerico CONFIRMADO vs `@eva/nutrition-engine`, research 07 §C.1) y `profile-analytics.ts` (port manual, research 07 §C.3): cualquier fix de formula en web no llega a mobile. (A1)
- **[Medio] Sin telemetria** → prod a ciegas; crashes/errores de red invisibles hasta que un usuario reporta. (A5)
- **[Bajo] Trailing-slash en `EXPO_PUBLIC_API_URL`** → ya mitigado en codigo (issuer y base URL), pero el follow-up de env de la memoria sigue abierto; verificar el valor real en EAS prod.
- **[Bajo] OTA no invocado en foreground** → updates llegan al siguiente lanzamiento, no en caliente; aceptable MVP.

---

## 7. Metodologia / limitaciones

- Verificado directo (Read): `app/_layout.tsx`, `app/+native-intent.ts`, `app.json`, `lib/api.ts`, `lib/supabase.ts`, `lib/push.ts`, `lib/db-compat.ts`, `lib/offline-cache.ts`; web `lib/mobile-auth.ts`, `lib/push.ts`, `api/mobile/config/route.ts`, `.well-known/assetlinks.json`, `.well-known/apple-app-site-association`, `lib/i18n/LanguageContext.tsx`.
- Grep: MODULE_KEYS/enabled_modules (mobile=0), sentry (mobile=1 archivo), expo-updates runtime (0 usos de codigo), i18n (mobile=0 real), push_tokens/expo (web delivery confirmado).
- NO ejecute typecheck/tests/build (solo lectura, regla de la tarea).
- NO lei `eas.json` directo (me apoye en research 06 §F, que lo cita textual).
- El estado de Sentry ("1 archivo") no se abrio: puede ser comentario/placeholder — verificar antes de asumir integracion real (concluido: NO hay integracion, solo el ErrorBoundary casero).
