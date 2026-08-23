---
status: active
owner: product-engineering
last_verified: "2026-08-23"
canonical: false
---

# PLAN — Flujo del coach nuevo

Contrato: [SPEC](SPEC.md). Tareas: [TASKS](TASKS.md). Dependencia dura:
[vive-tu-app-directo](../vive-tu-app-directo/PLAN.md). Tareas heredadas sin renombrar:
[coach-onboarding-v2](../coach-onboarding-v2/TASKS.md) W8.1.10, W8.4.3 y W8.5.2.

## Objetivo y cómo se mide

| Métrica | Hoy | Meta a 30 días |
|---|---|---|
| Coaches activados a 72 h (≥1 alumno real que **entró**) | 25 % (2/8 maduros), calculado a mano | **40 %**, calculado solo (cron semanal, W1.6) |
| Coaches que invitan ≥1 alumno real | 27,6 % | 50 % |
| Coaches cuyo alumno invitado llegó a entrar | 62,5 % (5 de 8) | 85 % |
| Altas que llegan a `active` | 93,1 % | ≥ 99 % |
| Saltos de app del alumno entre «tocó el link» y «entró» | 2 | 1 |

## Decisiones del owner (respondidas el 23-08; ya no son supuestos)

**D1 = A** (sesión inmediata + verificación blanda) — **arrastra W3.0 y W3.13**: sin la columna
`coaches.email_verified_at` la verificación blanda nace inerte, y sin la rotación de contraseña al enlazar
Google el `email_confirm: true` abre un pre-account takeover (G-AUTH, 23-08). Las dos viajan en el mismo tren
que W3.1 · **D2 = A** (clave en el WhatsApp solo con teléfono) · **D3 = C** (NO reordenar por ahora), con la
regla de disparo de [SPEC §8](SPEC.md) · **D4 = A** (marca prendida al nacer, con el camino de escritura
arreglado y backfill acotado) · **D5 = A** (el aha no cambia) · **D6 = A** (el escape se hace; queda AGREGA en
el carril 3) · **D7 = A pero DIFERIDA al martes 2026-08-25**, con recordatorio pedido por el owner ⇒ hasta
entonces **no hay rebuild** y **G-ASC se lee ese día**.

**Ninguna wave queda esperando al owner.** Lo único condicional es **W5**, y no por una decisión pendiente
sino por la regla de disparo de D3 (fuera del carril del día 1 y del total base).

**La ruta crítica de W2 sigue sin estar bajo control de este spec, pero ya no por una decisión.** W2 espera
el **merge** de VTA W3, y VTA W3 tenía cuatro decisiones pendientes que el owner **respondió el 23-08**:
**D1 = A · D3 = A · D4 = B · D8 = A**, anotadas en el [TASKS de VTA](../vive-tu-app-directo/TASKS.md). Plan B
sigue en pie por si conviene por calendario: **el mismo worker ejecuta VTA W3 y W2 en el mismo diff**.

## Arquitectura: qué cambia y dónde

```text
apps/web/src
├── app/(auth)/register/_actions/register.actions.ts   ← W3: email_confirm true · status active · signInWithPassword ·
│                                                          SACAR el delete+deleteUser del camino free · welcome+drip acá ·
│                                                          use_brand_colors_coach true · utm_source/campaign
├── app/(auth)/register/page.tsx                       ← W3: ojo de ver la clave (:565) · guardia de dominio ·
│                                                          hidden inputs de utm · W3.6b degrada Google en webview de Meta.
│                                                          NO tocar :175,:177 ni :669-687 (escape del webview: ya escrito
│                                                          por el fix de Turnstile de esta sesión, sin commitear)
├── app/join/[invite_code]/_components/LeadRequestForm.tsx ← W3.6c: el último Turnstile implícito del árbol
│                                                          (:67 carga api.js, :165 monta .cf-turnstile sin callbacks)
│                                                          pasa a components/auth/TurnstileWidget.tsx
├── app/(auth)/register/actions.test.ts                ← W3: ACTUALIZAR (existe, 9 tests; :342 y :353 pinnean el muro)
├── lib/auth/send-coach-email-confirmation.ts          ← W3: el free pasa a `magiclink` (recordatorio no bloqueante)
├── lib/auth/activate-confirmed-coach.ts               ← W3: sigue sirviendo a los `pending_email` viejos (idempotencia intacta)
├── proxy.ts                                           ← W3: el encierro de :480-484 solo aplica a filas ya existentes;
│                                                          W3.9 setea la cookie de UTM (:122-132 = molde de Edge Config)
├── app/auth/confirm/route.ts                        ← W3.0: escribe coaches.email_verified_at tras el verifyOtp OK
│                                                          (`:43`), al lado de la activación de `:55`. NO va dentro de
│                                                          activate-confirmed-coach.ts: ese helper corta en `:90` con
│                                                          `not_pending`, y bajo D1 el coach free ya nace `active`
├── app/coach/onboarding/complete/_actions/complete.actions.ts ← W3.3: use_brand_colors_coach true (1 línea) ·
│                                                          W3.0: email_verified_at = now (Google verificó el correo).
│                                                          MISMO `insert` (`:121-129`) ⇒ mismo worker, W3.0 primero ·
│                                                          W3.13: rotar la clave si ya había identidad `email` sin
│                                                          verificar (usuario de Google en `:54`, service-role en `:87`).
│                                                          OJO: NO alcanza — con fila `coaches` ya creada esta acción
│                                                          NO corre (`lib/auth/activate-confirmed-coach.ts:16-18`) ⇒
│                                                          W3.13 suma un endpoint server-side en el camino post-Google
│                                                          (hoy es 100 % cliente: `lib/auth/post-google-auth.ts:1,29`,
│                                                          `auth/exchange/AuthExchangeClient.tsx:36`,
│                                                          `components/auth/GoogleSignInButton.tsx:103`)
├── app/api/mobile/auth/register-coach-free/route.ts   ← W3: espejo del alta sin muro + marca prendida
├── app/coach/dashboard/_components/BrandQuickCard.tsx ← W3: dejar de reescribir `false` al guardar desde la guía
├── lib/email/free-coach-onboarding.ts                 ← W3: bienvenida a /coach/guia (= W8.1.10)
├── lib/email/send-drip-sequence.ts                    ← W3.8: higiene — saltar al no verificado (email_verified_at)
│                                                          a las 24 h. OJO: la serie se AGENDA entera en el alta
│                                                          (`:76-86`, `scheduled_at` de Resend) ⇒ «saltar» = cancelar
│                                                          por el ledger, no filtrar al enviar
├── app/api/cron/north-star-weekly/route.ts            ← W1.6: NUEVO — corre la consulta de W0.1 y la manda al owner
├── app/coach/dashboard/_components/…                  ← W3.11: banner «Verifica tu correo» mientras
│                                                          coaches.email_verified_at IS NULL (D1 = A sin superficie hoy)
├── instrumentation-client.ts                          ← W3.12 (MEJORA, opcional): recarga única ante «Failed to find
│                                                          Server Action» — W3 ES un deploy sobre /register.
│                                                          ⚠ archivo del fix de Turnstile sin commitear
├── lib/auth/platform-email.ts                         ← W2: telemetría + salida real del correo ya tomado (:66-77)
├── lib/email/drip-templates.ts                        ← W2: el bloque de invitación apunta a /coach/clients?invite=1
├── lib/email/transactional-templates.ts               ← W2: acceso arriba, clave abajo, en el correo del alumno
├── lib/email/send-email.ts                            ← sin cambios (replyTo ya soportado, :27)
├── lib/site-url.ts                                    ← SIN CAMBIOS: G-ENV (23-08) confirmó host `www`; W2.7 no
│                                                          aplica y el callejón 15 queda cerrado (`:9-11`)
├── app/coach/dashboard/_components/invite/InviteStudentSheet.tsx ← W2: copy de tienda (:145)
├── app/c/[coach_slug]/login/_data/login.queries.ts    ← W2: +invite_code al select de :28 (G-GRANT VERDE: ya está
│                                                          en el column-grant de anon; no arrastra migración)
├── app/c/[coach_slug]/login/ClientLoginForm.tsx       ← W2: escape «pídele acceso» ⚠ ARCHIVO DE VTA W3
├── app/c/[coach_slug]/login/_actions/login.actions.ts ← W1: 1 línea que llama al servicio ⚠ ARCHIVO DE VTA W3
├── app/coach/clients/_lib/add-student-invite.ts       ← W2: correo+clave en el mensaje ⚠ ARCHIVO DE VTA W3
├── app/coach/clients/_components/AddStudentStepper.tsx ← W2: pasa correo y clave al builder ⚠ ARCHIVO DE VTA W3
├── app/coach/clients/_actions/clients.actions.ts      ← W2: replyTo del coach (:270) ⚠ ARCHIVO DE VTA W3
├── app/coach/clients/DirRowCard.tsx                   ← W0: chip honesto · W1: lee first_login_at
├── app/coach/clients/DirTableMobile.tsx               ← W0/W1: ídem
├── app/coach/dashboard/_components/DashboardShell.tsx ← W0: medidor «Tu plan gratis incluye 1 alumno» (:352)
├── app/api/mobile/auth/validate-student-workspace/route.ts ← W1: escritor del primer login (camino RN)
├── services/client/student-login-signal.service.ts    ← W1: NUEVO — recordStudentFirstLogin(admin, clientId)
├── lib/database.types.ts                              ← W1.1: REGENERAR tras aplicar la migración. El roster web lee
│                                                          `select('*')` tipado (`coach/clients/_data/clients.queries.ts:28`,
│                                                          `ClientWithProgram extends Tables<'clients'>`): sin esto
│                                                          `first_login_at` no existe para TS y `pnpm typecheck` cae
├── services/coach/persona.service.ts                  ← W0: espejo a PostHog en recordOnboardingEvent (= W8.5.2)
└── lib/posthog/registration-events.ts                 ← W0: molde del capture server-side (sin cambios de infra)

apps/mobile
├── app/(auth)/register.tsx                            ← W3.2b: tras registerCoachFree, signInWithPassword + replace a
│                                                          /coach/home cuando el server responde `status: 'active'` (:189)
├── app/(auth)/login.tsx                               ← W4: scope local en LOS DOS caminos de error, :220 y :230
├── app/(auth)/reset-password.tsx                      ← W4: canjear el token de la URL y RECIÉN AHÍ pintar el form
├── lib/client-invite-copy.ts                          ← W2: pasa correo y clave a la plantilla
├── components/coach/directory/guided-invite.ts        ← W2: ídem ⚠ ARCHIVO DE VTA W3
├── components/coach/directory/CreateClientModal.tsx   ← W2: ídem ⚠ ARCHIVO DE VTA W3
├── components/coach/directory/DirRowCard.tsx          ← W0/W1: chip honesto
├── components/coach/directory/directory-shared.ts     ← W0/W1: chip honesto (fuente compartida)
├── app/coach/(tabs)/clientes.tsx                      ← W0/W1: chip honesto
├── lib/clients-directory.ts                           ← W1.5: parsea firstLoginAt (ya trae forcePwChange, :221).
│                                                          W4.3 se BORRA: era la misma tarea sobre el mismo archivo
└── lib/client-cap.ts                                  ← W0: capMeterLabel con 0 alumnos (:65-68)

packages
├── schemas/persona.ts                                 ← W2: whatsappInvite gana {correo} y {clave} + variante sin teléfono
└── onboarding/index.ts                                ← W5: ONBOARDING_STEP_KEYS (:36-42) + las 5 ramas de ONBOARDING_STEPS

supabase/migrations
├── <ts>_clients_first_login_at.sql                    ← W1: ADD COLUMN first_login_at timestamptz, SIN grant a authenticated
├── <ts>_coaches_email_verified_at.sql                 ← W3.0: ADD COLUMN + backfill desde auth.users.email_confirmed_at,
│                                                          sin GRANT UPDATE(col) (coaches ya es default-deny por columna)
└── <ts>_coaches_signup_utm.sql                        ← W3.9: signup_utm_source / signup_utm_campaign, aditivas,
                                                          escritas SOLO por el servidor

vercel.json (RAÍZ del repo, no apps/web/)                 ← W1.6: registra el cron semanal. Hoy tiene 11 crons
                                                          (`:20-65`); hay rutas en app/api/cron/ que NO están acá
                                                          (weekly-report-email, weekly-snapshot…) y por eso no corren
```

**No se toca** (lista de protección): `apps/mobile/app.json` (AASA, `intentFilters`, `scheme`, runtime — sería
binario) · `apps/mobile/app/+native-intent.ts` (es de VTA W2) · `apps/web/src/app/vive-tu-app/route.ts` y
`apps/web/src/app/api/mobile/coach/vive-tu-app/route.ts` (son de VTA W1/W2; lo que este plan tiene para ellos va
como **aporte**, §Aportes) · `supabase/migrations/00000000000001_baseline.sql` y cualquier migración aplicada ·
`packages/onboarding/persona-progress.ts` · `packages/schemas/client.ts` · el `z.enum` de
`api/coach/onboarding-events/route.ts` y `MOBILE_EVENT_TYPES` · **el fix de Turnstile del 23-08, sin
commitear, escrito por ESTA sesión** (verificado con `git status`: 4 archivos ` M` + 1 `??`):
`apps/web/src/app/(auth)/register/page.tsx:175,177` (estados `isMetaWebView` / `browserEscapeHref`), el efecto
que los llena y **`:669-687`** (el render del escape «Abrir en el navegador» + la línea de iPhone),
`apps/web/src/components/auth/CaptchaSlot.tsx`, `apps/web/src/components/auth/TurnstileWidget.tsx`
(**archivo nuevo, sin trackear**; W3.6c lo **reutiliza tal cual**, no lo modifica),
`apps/web/instrumentation-client.ts` y `apps/web/public/sw.js`. **No es de otra sesión y no hay con quién
coordinar: se commitea antes de que W3 arranque**, y esa es toda la dependencia · `AUTH_COOKIE_DOMAIN` (sigue sin
setear) · el predicado de cupo en las **8** superficies que ya excluyen `is_demo` · `lib/supabase/server.ts` ·
`get_admin_coaches_paginated` (VTA W4) · toda superficie de pago en iOS.

## Contrato de archivos contra `vive-tu-app-directo`

Nueve archivos aparecen en los dos planes. Regla única: **el archivo es de VTA; este plan espera o aporta.**

| Archivo | VTA | Este plan | Regla |
|---|---|---|---|
| `c/[coach_slug]/login/_actions/login.actions.ts` | W3 (rama `coach_account`, D4=B) | W1 (1 línea: llamar al servicio de primer login) | **La línea la agrega el worker de VTA W3** en su diff, o W1 espera al merge |
| `c/[coach_slug]/login/ClientLoginForm.tsx` | W3 (mapa de errores) | W2 (escape «pídele acceso») | W2 espera al merge de VTA W3 |
| `c/[coach_slug]/login/page.tsx` | W3 (`searchParams.error`) | — | No se toca acá |
| `coach/clients/_lib/add-student-invite.ts` | W3 (`isCoachOwnEmail`, `selfInviteNote`) | W2 (correo+clave en el mensaje) | W2 espera al merge de VTA W3 |
| `coach/clients/_components/AddStudentStepper.tsx` | W3 (`coachEmail`, nota de auto-alta) | W2 | ídem |
| `coach/clients/_actions/clients.actions.ts` | W3 (`own_email`) | W2 (`replyTo`) | ídem — líneas distintas, pero mismo archivo |
| `apps/mobile/components/coach/directory/CreateClientModal.tsx` | W3 (V3.10) | W2 | ídem |
| `apps/mobile/components/coach/directory/guided-invite.ts` | W3 (`selfInviteNote`) | W2 | ídem |
| `app/vive-tu-app/route.ts` · `api/mobile/coach/vive-tu-app/route.ts` | W1/W2 | — | **Aporte**, nunca tarea propia |

**Aportes a VTA** (tres líneas que este plan detectó y que su spec no cubre; van en el brief de VTA, no acá):
`signOut({ scope: 'local' })` en `app/vive-tu-app/route.ts:45` · atar `c=` al `coach_id` del demo en ese mismo
route (`:38-42` valida `is_demo` y nada más) · rate limit en `POST /api/mobile/coach/vive-tu-app` (0 apariciones
de `rateLimit` en sus 62 líneas; el rate limit de VTA V1.x vive en la acción **web**).

**Cero colisión** con VTA: todo W0, todo W3, todo W4, todo W5 y la migración de W1. Esas waves arrancan el día 1.

## Contratos que fijan las waves

- **`recordStudentFirstLogin(admin, clientId)`** (`services/client/student-login-signal.service.ts`, NUEVO):
  `UPDATE clients SET first_login_at = now() WHERE id = $1 AND first_login_at IS NULL`, con `service_role`,
  devuelve `boolean` (si escribió, es el PRIMER login) y **nunca lanza**. Cuando devuelve `true` emite
  `student_first_login` a PostHog con `distinctId = coach_id` y `properties: { seconds_since_created,
  self_invited }`. Dos call sites y ninguno más: el login de marca (web) y
  `validate-student-workspace/route.ts` cuando `result.ok` (RN). Los dos callers **esperan** el `UPDATE` (una
  sentencia por PK, `service_role`, nunca lanza); el capture de PostHog sale por `after()` de `next/server`
  para no sumarle hasta 1,5 s al login del alumno. **Prohibida la promesa flotante**: los dos call sites
  devuelven una respuesta (`login.actions.ts:164`, `validate-student-workspace/route.ts:46-51`) y Vercel
  congela la invocación ahí — es lo que perdió 2 de 5 bienvenidas el 19-08
  (`lib/email/free-coach-onboarding.ts:24-28`).
- **`clients.first_login_at timestamptz NULL`**: migración **aditiva**, sin default, **sin** `GRANT
  UPDATE(first_login_at) TO authenticated`. `clients` tiene tres políticas de auto-UPDATE del alumno
  (`baseline.sql:2493`, `:2856`, `:2893`): con grant, la North Star sería escribible desde el navegador. **Lo
  que la protege es el grant, no el baseline** — el baseline trae `GRANT ALL ON TABLE clients TO authenticated`
  (`:3599`); la protección real es `supabase/migrations/20260612140001_clients_scoping_grants.sql:36-37`
  (`REVOKE UPDATE … FROM authenticated, anon` + allowlist de 17 columnas: **default-deny por columna**),
  aplicada en LIVE. La regla de la casa («toda columna user-editable nueva lleva su column-level grant») aplica
  a columnas user-editables; ésta no debe serlo, y eso se escribe en el `COMMENT ON COLUMN`.
- **`coaches.email_verified_at timestamptz NULL`** (W3.0): la prueba de que el correo existe, separada de
  `auth.users.email_confirmed_at`, que bajo D1 = A nace seteada para **todas** las altas free porque
  `auth.admin.createUser({ email_confirm: true })` la escribe en la creación. Migración **aditiva**, con
  backfill `email_verified_at = auth.users.email_confirmed_at` en la **misma** migración —las filas de hoy sí
  verificaron por link— y eso es ejecutable: hay precedente de migraciones que leen `auth.users`
  (`supabase/migrations/20260614130000_exclude_test_coaches_from_mrr.sql:78`, `LEFT JOIN auth.users u ON
  u.id = c.id`). **Sin `GRANT UPDATE(email_verified_at)`**: `coaches` es default-deny por columna desde
  `supabase/migrations/20260612140000_modules_compra_only_grants.sql:24-44` (`REVOKE INSERT, UPDATE, DELETE …
  FROM authenticated, anon` + allowlist de 18 columnas), y la regla de la casa —«toda columna user-editable
  nueva lleva su column-level grant»— aplica a columnas **user-editables**: ésta no lo es, y eso va en el
  `COMMENT ON COLUMN`. Que el default-deny está **vivo en LIVE** lo prueba el outage de white-label v2:
  7 columnas nuevas sin grant hicieron fallar el UPDATE con 42501 hasta el hotfix
  `20260621220000_grant_update_whitelabel_v2_brand_cols.sql`. La leen W3.8 (drip), W3.11 (banner) y el
  guardarraíl de [SPEC §2.2](SPEC.md) vía W0.1.
- **`formatWhatsappInvite(persona, vars)`** (`packages/schemas/persona.ts:127-137`) gana `correo?: string` y
  `clave?: string`. Con los dos presentes usa `whatsappInvite`; con alguno ausente usa
  `whatsappInviteSinClave`. **La decisión de cuál usar es del call site**, según haya teléfono o no — el
  paquete no conoce el canal.
- **Chip de estado del alumno**: una función pura por plataforma (`statusMeta` web, `directory-shared.ts` RN)
  que recibe `{ isArchived, isActive, firstLoginAt, forcePasswordChange }` y devuelve `{ key, label }`.
  Mientras `first_login_at` sea `null`, el fallback es `forcePasswordChange` — pero **el fallback dice
  «Todavía no cambió su clave», nunca «Todavía no entró»**: ese flag se apaga en `changePasswordAction`
  (`c/[coach_slug]/login/_actions/login.actions.ts:203-205`), o sea cuando el alumno **completa** el cambio de
  clave, no cuando entra. El copy «entró» solo llega con W1.
- **`ONBOARDING_STEP_KEYS`** (contrato **congelado**, solo aplica si la regla de disparo de D3 se cumple):
  pasaría a `['profile_branding', 'vive_tu_app', 'first_client', 'first_artifact', 'aha']`, con las cinco
  ramas de `ONBOARDING_STEPS` reordenadas igual. **`PERSONA_SCOPED_STEP_KEYS` no cambia** (archiva por clave,
  no por índice). Con D3 = C **hoy no se toca nada de esto**.

## OTA vs binario

| Cambio | Vía | Por qué |
|---|---|---|
| `signOut({scope:'local'})`, guard de `/reset-password`, chip del roster RN, medidor de cupo | **OTA** | JS puro |
| Copy de la invitación (`packages/schemas/persona.ts`) y orden de la guía (`packages/onboarding/index.ts`) | **OTA** | Viajan en el bundle. **Split declarado**: 1.1.0 no recibe OTA (regla del piso) y 1.1.1 no tiene `@eva/onboarding` |
| Marca prendida y primer login desde RN | **deploy web** | Viven en `apps/web/src/app/api/mobile/**` y en la DB; RN los consume sin OTA |
| **Alta de coach sin muro desde RN** | **deploy web + OTA (W3.2b)** | El servidor no decide la navegación post-alta: `apps/mobile/app/(auth)/register.tsx:189` hace `router.replace('/(auth)/verify-email?…')` sin mirar el estado. Cambiar el server **no** saca esa pantalla de ningún binario ⇒ hace falta la gemela RN por OTA. **1.1.0 se queda con la pantalla** (regla del piso) |
| Recuperar `EXPO_PUBLIC_POSTHOG_KEY` | **BINARIO** | Env de build. **Fuera de alcance de estas waves**: D7 = A pero **diferida al 25-08** (recordatorio del owner) |
| Reclamar/des-reclamar rutas en `app.json` | **BINARIO** | Prohibido en este plan |

**Orden de rollout de toda wave con RN: OTA primero, deploy web después** (regla heredada de
[VTA](../vive-tu-app-directo/PLAN.md)), y solo a los runtimes 1.1.1 y 1.1.2, con `eas update` por plataforma
separada.

## Instrumentación

| Evento / dato | Dónde nace | Para qué |
|---|---|---|
| `student_first_login` (server, `distinctId = coach_id`) | `student-login-signal.service.ts` | Numerador de la North Star |
| Espejo de `recordOnboardingEvent` a PostHog + `$set { persona }` | `services/coach/persona.service.ts` | Embudo unificado ad → alta → persona → invitación → activación. Hoy PostHog solo conoce `persona_selected` (= W8.5.2) |
| `coaches.signup_utm_source` / `signup_utm_campaign` | alta web + alta RN, **leídos en el servidor** (cookie de primera parte seteada en el `proxy`, o `Referer`) | Hoy la atribución es cruce manual por timestamp; 24 de 25 personas tienen `$initial_utm_source = none` porque la identidad anónima se recrea por sesión. **No por hidden inputs**: sobre esa columna se decide presupuesto de campaña y un input oculto lo escribe cualquiera |
| Consulta SQL de cohorte semanal | `docs/specs/flujo-coach-nuevo/TASKS.md` (W0.1) | La lee el owner; la purga de cuentas de prueba va **por lista de correos**, nunca por dominio |
| **Envío automático de esa fila** (cron lunes 09:00 CL) | `app/api/cron/north-star-weekly/route.ts` + `vercel.json` (W1.6) | «Calculado solo» de [SPEC §2.2](SPEC.md) deja de depender de que alguien se acuerde. Auth y forma: el molde de los 11 crons vivos (`CRON_SECRET` + `Authorization: Bearer`, fail-closed sin secret) y `sendTransactionalEmail` (`lib/email/send-email.ts:14`) |
| `coaches.email_verified_at` (server, `service_role`) | `/auth/confirm` + alta Google (W3.0) | Única señal legible de «el correo existe» bajo D1 = A; alimenta W3.8, W3.11 y el guardarraíl |
| Métrica-guarda «primer login a <120 s del alta del alumno» **+ mismo teléfono que el coach** | misma consulta | Detecta al coach que entra como su propio alumno |
| Los **cinco guardarraíles** de [SPEC §2.2](SPEC.md) | misma consulta, una fila por semana | «Se revierte, no se discute» necesita instrumento; la palanca es la bandera de Edge Config de D1 |
| `add_student_email_taken` con `reason` (server) | `coach/clients/_actions/clients.actions.ts` | Dimensiona el callejón 16 (alumno que ya tiene cuenta) antes de decidir el copy |

Lo que **no** se instrumenta acá: la app nativa sigue ciega (3 dispositivos en 6 días) hasta que haya binario;
`invite_link_copied` e `invite_whatsapp_opened` siguen sin emisor a la tabla (es W8.5.3 de onboarding-v2).

## Waves

Orquestación según la regla del repo: el jefe planifica, escribe el brief por worker, delega y **juzga el diff
contra el brief**; lo deficiente vuelve al MISMO worker. Workers = Opus salvo donde se indique Sonnet.

| Wave | Qué entrega | Workers | Gate de salida | Est. | Depende de |
|---|---|---|---|---|---|
| **G — Gates** | **G-ENV, G-AUTH, G-GRANT y G-DEC resueltos (23-08)**; quedan **G-APPLINKS**, **G-BASE** y **G-ASC (se lee el 25-08, con D7)** | jefe + owner | los 6 con respuesta escrita | 0,3 d | — |
| **W0 — Medir sin migrar** | Línea base congelada (con `n` por fila y «sin lectura» bajo el mínimo) · chip honesto web+RN (fallback `force_password_change`) · espejo a PostHog · medidor de cupo con 0 alumnos · **las 3 preguntas a los 21 coaches (W0.8, owner)** | 2 (web+medición, rn) + owner | consulta de cohorte devuelve los 5 activados que el informe contó a mano · `tsc` mobile · vitest focalizado · las respuestas de W0.8 anotadas | 0,8 d | G-BASE |
| **W1 — La señal real** | `clients.first_login_at` (sin grant) · servicio + los 2 escritores · `student_first_login` · el chip pasa a leer la columna · **el cron semanal que manda la fila al owner (W1.6)** | 1 (db+web) | migración validada con `BEGIN … ROLLBACK`, aplicada, `get_advisors` limpio · un login real de alumno en preview escribe la columna **una sola vez** · un correo real del cron desde preview | 1,0 d | W0 · el call site web espera VTA W3 |
| **W2 — Que el alumno entre** | Clave en el WhatsApp (con teléfono, **fuera del DOM**) · drip que no miente · `replyTo` + correo reordenado · copy de tienda · escape del login de marca (si D6=A) · salida real del alumno que ya tiene cuenta · reenvío de acceso con el mismo mensaje. **W2.7 fuera: G-ENV la cerró** | 2 (web-invite, rn-invite) | tests de copy actualizados (`add-student-invite`, `tests/mobile/client-invite-copy`, `tests/mobile/guided-invite`, `drip-templates`) · **OTA de RN antes del deploy web** | 1,0 d | **VTA W3 mergeada** · D2 · D6 |
| **W3 — Que el coach entre sin correo** | **`coaches.email_verified_at` + sus escritores (W3.0, va PRIMERO)** · alta free con sesión (web + API móvil + **gemela RN por OTA**) · marca prendida (3 altas + `BrandQuickCard` + backfill) · bienvenida a `/coach/guia` · higiene del drip · UTM server-side · Google degradado en el webview de Meta · Turnstile único en `/join` · banner de correo sin verificar · **rotación de contraseña al enlazar Google (W3.13)** | 2 (web-alta, marca+correos) | `actions.test.ts` **actualizado** · alta free real en preview entra al panel sin correo · **una alta free deja `email_verified_at` NULL y confirmar el correo la llena** · **repro del takeover: contraseña vieja invalidada al entrar por Google** · el proxy sigue sirviendo a los `pending_email` viejos | 1,5 d | **D1 · D4** (G-ENV y G-AUTH ya resueltos; lo que G-AUTH destapó es **W3.13**, dentro de la wave) |
| **W4 — RN que no rompe** | `scope:'local'` en **los dos** caminos de error (`login.tsx:220` y `:230`) · `/reset-password` que **canjea el token** y recién ahí pinta | 1 (rn) | repro: login de alumno con credenciales de coach **no** mata su sesión de coach en la web · `expo export --platform android` | 0,4 d | — |
| **W5 — La guía apunta a invitar** ⚠ **CONDICIONAL** | Reorden de `ONBOARDING_STEP_KEYS` + las 5 ramas | 1 (packages+guía) | `node scripts/guia-visual-check.mjs` · tests de `@eva/onboarding` · `tsc` mobile | +0,4 d **fuera del total base** | **La regla de disparo de D3** (VTA W1+W2 con 2 semanas en prod + los umbrales de W0.1) · W0 |
| **W6 — QA device + cierre** | Matriz de QA del owner, `CURRENT.md`, `MOBILE_PARITY.md`, `TEST_STATUS.md`, corrida de la consulta | jefe + owner | matriz completa con evidencia · suite completa UNA vez pre-push | 0,5 d | todo |

**Paralelismo real:** W0 ∥ W3 ∥ **W4.1/W4.2** desde el día 1 (archivos disjuntos, verificado contra el árbol
de VTA). W1 arranca con W0 mergeada. W2 es la única que espera a otra spec. **W5 salió del día 1**: con
D3 = C no se ejecuta hasta que la regla de disparo se cumpla.

**Orden interno de W3: W3.0 va primero, dentro de la cadena de `web-alta`.** La columna tiene que existir
antes de que W3.8 y W3.11 la lean, y —más importante— antes de que W3.1 despliegue el `email_confirm: true`
que deja ciega a `auth.users.email_confirmed_at`. Además **comparte el `insert` de `complete.actions.ts` con
W3.3** (`:121-129`), que ya está en esa cadena. Queda: **W3.0 → W3.1 → W3.3 → W3.2 → W3.9**, y W3.8/W3.11
(del otro worker) esperan el merge de W3.0.

**Conflictos internos de W3: cuatro archivos, no uno.** `register.actions.ts` lo tocan W3.1, W3.3 y W3.9 ·
`api/mobile/auth/register-coach-free/route.ts` lo tocan W3.2, W3.3 y W3.9 · `register/page.tsx` lo tocan W3.6,
W3.6b y W3.9 · **`complete.actions.ts` lo tocan W3.0 y W3.3** (mismo `insert`, `:121-129`). Regla:
**W3.0 → W3.1 → W3.3 → W3.2 → W3.9 van al MISMO worker (`web-alta`), en ese orden**; el segundo worker
(`marca-correos`) se queda con W3.4, W3.5, W3.7, W3.8, W3.11 y W3.12, que no tocan ninguno de los cuatro
archivos —aunque W3.8 y W3.11 **leen** la columna de W3.0 y esperan su merge—. **W3.6, W3.6b y W3.6c arrancan
cuando W3.9 haya mergeado** (W3.6 y W3.6b comparten `register/page.tsx`; W3.6c toca `/join`) y **después
del commit del fix de Turnstile de esta sesión** — que es un commit, no una coordinación con nadie.

**Si hay que entregar en ~65 % del tiempo (3,5 de 5,4 días base):** G + W0 + W2 + W3. Se corta W1 —con el
costo declarado: **sin la columna, el chip dice «Todavía no cambió su clave», no «entró»**, y la North Star se
sigue calculando a mano, porque el cron de W1.6 vive en esa wave— y W4 (real pero de bajísimo volumen). W5 ya
está fuera del base (D3 = C). Lo único que **no** se puede cortar es W0: sin línea base congelada, nada de lo
demás se puede juzgar. **W3.0 tampoco es cortable dentro de W3**: sin ella, W3.8, W3.11 y el guardarraíl de
correo sin verificar quedan escritos pero inertes.

## Gates obligatorios pre-push

```bash
pnpm docs:check
pnpm lint
pnpm typecheck
pnpm check:tokens
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false npx vitest run     # desde la RAÍZ, nunca con --filter
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm --filter @eva/mobile exec expo export --platform android   # solo si la wave toca RN
node scripts/guia-visual-check.mjs   # solo W5. NO lo corre un worker: requiere `next dev`, que bajo shell
                                     # de agente muere (0xc0000142). Lo corre el jefe/owner en terminal real,
                                     # como gate del cierre (W6).
```

El árbol está **compartido y sucio**: los gates se corren en worktree limpio, los commits van **por ruta
explícita** y **nunca** se usa `pull --rebase --autostash` con workers ajenos activos.

## Matriz de QA en device (W6, owner)

Android con la app de **Play** instalada + un iPhone. Contra prod, Playwright con **un solo navegador a la
vez**.

1. Alta free desde el webview de Instagram, tocando el ad real: ¿entra al panel sin abrir el correo? ¿aparece
   el escape «abrir en el navegador» **antes** de tocar Google (W3.6b) y también cuando el captcha falla?
   ¿llega el `CompleteRegistration` a Meta? Repetir el alta **desde el binario RN**: ¿no aparece
   `/verify-email`? (1.1.0 sí la sigue viendo: es el split declarado.)
2. Alta free con un correo mal tipeado: ¿avisa antes de enviar?
3. Guía → preset de marca → cerrar y reabrir la app: ¿el splash cruza a su marca?
4. Invitar a un alumno real **con teléfono** desde web y desde RN: ¿el mensaje trae usuario y clave? Pegarlo
   en otro teléfono y entrar **sin abrir el correo**.
4b. El mismo link, en un Android **con la app de Play instalada**: `app.json` reclama `pathPrefix: "/c/"` con
   `autoVerify` y `+native-intent.ts:13-17` reescribe `/c/{slug}/login` → `/alumno/codigo?identifier=…&auto=1`.
   Es otro flujo y otro conteo de toques: el objetivo «7-9 toques, 1 salto» hay que medirlo **ahí también**.
4c. Dar de alta a un alumno con un correo **que ya tiene cuenta en EVA**: ¿hay salida real o muere en
   «escríbenos a soporte»? ¿quedó el evento con la razón?
5. Invitar **sin teléfono**: ¿el mensaje va sin credencial y menciona el correo?
6. Roster web y RN: ¿dice «Entró hace X»? ¿Y «Todavía no entró» antes?
7. Login de marca con un correo desconocido: ¿aparece «Pídele acceso»? (solo si D6 = A)
8. En la app, «Soy alumno» → código propio → login con credenciales de **coach**: ¿sobrevive su sesión de
   coach en la web?
9. Abrir un link de `/reset-password` desde el correo en un Android con la app instalada: ¿la pantalla
   explica y ofrece salida?
10. Dark mode y safe areas en las 5 pantallas tocadas.
11. Revisar **una grabación real** de PostHog del alta guiada: la clave temporal **no** puede aparecer en el
    DOM, ni en un `href`, ni en `$current_url` (regla 10 de [SPEC §5](SPEC.md)).
12. Alta free sin confirmar el correo: ¿se ve el banner «Verifica tu correo…» en el panel? Confirmar desde la
    casilla y volver: ¿desaparece? Y en la fila del coach, ¿quedó `coaches.email_verified_at` (no solo
    `auth.users.email_confirmed_at`, que nace seteado)? (W3.0 + W3.11)
13. **Solicitud desde `/join/{código}` en el webview de Instagram** (W3.6c): con el widget migrado, ¿el
    challenge resuelve, o falla **con** aviso y botón de reintentar en vez de dejar el formulario muerto?
