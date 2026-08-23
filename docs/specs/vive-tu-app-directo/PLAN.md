---
status: active
owner: product-engineering
last_verified: "2026-08-23"
canonical: false
---

# PLAN — «Vive tu app» directo

Contrato: [SPEC](SPEC.md). Tareas: [TASKS](TASKS.md). Enmienda a
[coach-onboarding-v2](../coach-onboarding-v2/SPEC.md). Revisado por panel adversarial el 23-08: este plan
ya incorpora sus hallazgos (orden de `/vive-tu-app`, early-return del proxy, D4 = B, `entered` solo
servidor, W1+W2 un solo deploy, OTA antes del deploy).

## Objetivo y cómo se mide

| Métrica | Hoy | Meta |
|---|---|---|
| Coaches que entran a su app de alumno tras pedir el link (web, `device = mobile`) | 33 % | ≥ 80 % |
| Coaches que vuelven a su panel sin reloguear (`vive_tu_app_returned`, `mode = return`) | 0 % | ≥ 70 % |
| Coaches que chocan contra el login de alumno con su cuenta de coach | 1 de 7 | 0 |
| Falsos ✅ del paso 2 en la guía | 4 de 6 | 0 |

## Decisiones asumidas (defaults si el owner no dice lo contrario)

D1 = A (magic link del coach en cookie httpOnly) · D3 = A (`active` = cupo) · D4 = **B** (`signOut` local +
«Ir al login de coach») · D8 = A («Volver a sembrar» / deshabilitado con explicación). Defaults declarados:
desktop conserva el sheet · correo propio = aviso + CTA deshabilitado · `vive_tu_app_entered` solo servidor ·
`autoOpen` en móvil muestra el CTA.

## Arquitectura: qué cambia y dónde

```text
apps/web/src
├── app/vive-tu-app/route.ts                    ← W1: evento `entered` (+device/mode) · W2: cookie de retorno + modo
├── app/volver-al-panel/route.ts                ← W2: NUEVO, solo POST
├── proxy.ts                                    ← W2: early-return /vive-tu-app y /volver-al-panel · rama «sesión clients pide /coach/*» · select +is_demo,full_name · headers x-client-is-demo / x-client-display-name / x-vta-mode (siempre seteados) · rate limit del POST nuevo
├── app/c/[coach_slug]/layout.tsx               ← W2: monta <DemoViewerBanner/> · pasa isDemo/mode a ClientNav
├── app/c/[coach_slug]/_components/DemoViewerBanner.tsx   ← W2: NUEVO (server) + DemoViewerExit.tsx ('use client', modo remote)
├── components/client/ClientNav.tsx             ← W2: «Cerrar sesión» reetiquetado en sesión demo
├── app/c/[coach_slug]/suspended/page.tsx       ← W2: form a /auth/signout → signOut client-side
├── app/coach/onboarding/complete/_actions/complete.actions.ts ← W2: cinturón «si es clients, no crear coach»
├── app/c/[coach_slug]/login/page.tsx           ← W3: lee searchParams.error (las dos instancias)
├── app/c/[coach_slug]/login/ClientLoginForm.tsx        ← W3: kind/action + mapa de mensajes de error
├── app/c/[coach_slug]/login/_actions/login.actions.ts  ← W3: rama coach_account (signOut local) · scope local en los otros signOut · getClientBasePath
├── app/t/[team_slug]/login/**                  ← W3: espejo (page + form + action)
├── app/(auth)/login/**                         ← W2: renderiza ?error=vive_tu_app_volver
├── app/(auth)/forgot-password/page.tsx         ← W3: línea «¿Eres coach?» cuando hay coach_slug
├── app/coach/dashboard/_components/ViveTuAppButton.tsx ← W1: rama móvil directa, autoOpen sin navegar, copy desktop, estado sin demo
├── app/coach/dashboard/_components/DemoStudentCard.tsx ← W1: copy neutro + «Volver a sembrar»
├── app/coach/dashboard/_actions/vive-tu-app.actions.ts ← W1: rate limit · revalidatePath('/coach/guia')
├── app/coach/dashboard/_actions/onboarding-guide.actions.ts ← W1: revalidatePath('/coach/guia')
├── app/coach/guia/_components/GuideScreen.tsx  ← W1: quita markStepCompleted en onOpened · pageshow/visibilitychange → router.refresh()
├── app/coach/guia/_components/GuideStepCard.tsx ← W1: acción de vive_tu_app visible también en done («Verla otra vez»)
├── app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx  ← W1: copy de la banda (autoOpen semántica móvil la resuelve el botón)
├── app/coach/nutrition-v2/[clientId]/editor/PrimeraPautaPublicada.tsx ← W1: ídem
├── app/dev-harness/guia/page.tsx               ← W1: variante ?paso2=pendiente para el gate visual
├── services/onboarding/onboarding-v2.queries.ts ← W1: resolveViveTuAppOpened con .or(entered ≥ epoch | opened < cutover) + constante
├── services/onboarding/vive-tu-app.service.ts  ← W1: `device` en metadata de opened · `&src=rn&from=` cuando surface='rn' (sin mover el evento)
├── app/api/mobile/coach/vive-tu-app/route.ts   ← W1: acepta `from` (guia|builder) y lo propaga
├── app/api/mobile/coach/clients/route.ts       ← W3: 409 OWN_EMAIL
├── app/coach/clients/page.tsx                  ← W3: getUser().email → config.coachEmail
├── app/coach/clients/_components/{add-student-flow-context,AddStudentFlowProvider,AddStudentStepper}.tsx ← W3
├── app/coach/clients/CreateClientModal.tsx     ← W3: coachEmail desde useAddStudentFlow
├── app/coach/clients/_lib/add-student-invite.ts ← W3: isCoachOwnEmail + InviteDraft.coachEmail + selfInviteNote + inviteBlockReason
├── app/coach/clients/_actions/clients.actions.ts ← W3: code 'own_email'
├── app/admin/(panel)/coaches/[id]/_data/coach-detail.queries.ts ← W4
├── app/admin/(panel)/sistema/_data/sistema.queries.ts ← W4: KPI «Alumnos» sin demo ni archivados
├── app/admin/(panel)/coaches/_components/CoachCommandPanel.tsx ← W4: copy blast radius
├── lib/rate-limit.ts                           ← W1: rateLimitViveTuApp
└── lib/posthog (sin cambios de infra)          ← eventos server: entered / returned / student_login_coach_account

apps/mobile
├── lib/vive-tu-app.ts                          ← W2: explainer v2 (copy + prefijo `v2`) — va en el MISMO OTA que el banner
├── lib/guia-reload.ts                          ← W1: NUEVO, shouldReloadOnAppState(prev, next) puro + test en tests/mobile
├── app/coach/guia.tsx                          ← W1: AppState listener (background→active, inFlight) → load()
├── app/coach/program-builder.tsx               ← W1: pasa from='builder' al pedir el link (sin listener: no hay load())
├── app/+native-intent.ts                       ← W2: rama `coach/guia` → '/coach/guia'
├── components/coach/directory/CreateClientModal.tsx ← W3: nota + comparación con el user de sesión + OWN_EMAIL inline
└── components/coach/directory/guided-invite.ts ← W3: selfInviteNote(noun, { showsCupo })

supabase/migrations
├── <ts>_onboarding_events_vive_tu_app_entered.sql   ← W1: drop + add del CHECK con 13 valores (patrón 20260822002122:113-132)
└── <ts>_admin_coaches_excluye_demo.sql               ← W4: CREATE OR REPLACE get_admin_coaches_paginated

packages/onboarding/index.ts                    ← sin cambios (el paso 2 sigue sin href)
```

**No se toca** (lista de protección): `lib/supabase/server.ts` (el único `createClient` sigue sin
`cookieOptions`; `AUTH_COOKIE_DOMAIN` sigue sin setear), `packages/schemas/client.ts`, `packages/onboarding/index.ts`,
`apps/mobile/app.json` (cero cambios nativos ⇒ todo viaja por OTA), `supabase/migrations/00000000000001_baseline.sql`,
`database.types.ts` (la firma de la RPC no cambia; no correr el regen completo «de paso»), el `z.enum` de
`api/coach/onboarding-events/route.ts` y `MOBILE_EVENT_TYPES` (`vive_tu_app_entered` **no** entra ahí),
`apps/mobile/lib/coach-dashboard.ts:410`, cualquier predicado de cupo de los 6 sitios que ya excluyen `is_demo`.

## Waves

Orquestación según la regla del repo: el modelo jefe planifica, escribe el brief por worker, delega y
juzga; los workers son **Opus**. Cada wave termina con pasada de juicio (diff contra el brief) y devuelve lo
deficiente al mismo worker. **W1 + W2 son un solo deploy web** (W1 sola es regresión: sin `volver` ni refresco,
el coach en móvil vuelve con «atrás» a una guía cacheada sin tilde). **La OTA de RN sale antes del deploy web.**

| Wave | Qué entrega | Workers (Opus) | Gate de salida | Est. (días-agente) | Depende de |
|---|---|---|---|---|---|
| **W0 Docs** | Esta spec + bloque «MANDA sobre §5/§6» en onboarding-v2 + W8.1.9/W8.6.2 absorbidas + revisión adversarial | jefe | `pnpm docs:check` | 0,4 | — |
| **W1 Entrar + señal real** | `ViveTuAppButton` móvil directo, `autoOpen` sin navegar, sin demo (D8), «Verla otra vez»; copy desktop/`DemoStudentCard`; rate limit; `revalidatePath` a `/coach/guia`; `pageshow` → `router.refresh()`; migración CHECK (drop+add, 13 valores) aplicada en LIVE; `/vive-tu-app` escribe `entered` (+device/mode) + PostHog server; resolver `.or()` con corte + `fakeDb` reescrito; `GuideScreen` sin tilde en `onOpened`; harness `?paso2=pendiente`; RN: `from=`, `AppState` en `guia.tsx` con helper puro + test | 2 (web-core, rn+api) | vitest focalizado (`vive-tu-app`, guía, `onboarding-events` **400 para `entered`**, `mobile/dashboard` **400**, `tests/mobile`) + `tsc` mobile + `guia-visual-check` con la variante nueva + migración aplicada y verificada | 3,0 | W0 + **gate de entrada**: `adb shell pm get-app-links cl.evaapp.eva` y SHA-256 de `assetlinks.json` vs clave de Play |
| **W2 Volver** | Proxy (early-return de las dos rutas, rama «clients pide /coach/*», select + 3 headers siempre seteados, rate limit POST); `DemoViewerBanner` 3 modos (`rn` > `return` > `remote`, `intent://` en Android, `from=builder` sin deep link); cookie de retorno en `/vive-tu-app` (best-effort, path restringido, `maxAge` alineado); `POST /volver-al-panel` (ramas a/b/c, verify primero, borrado por path); `ClientNav` reetiquetado; cinturón en `complete.actions.ts`; `+native-intent` `coach/guia`; explainer RN v2; `suspended` sin `/auth/signout`; `/login` renderiza `vive_tu_app_volver` | 2 (web-auth, rn) | tests nuevos del route (token no en logs, orden/paths de `Set-Cookie`, ramas a/b/c, `GET` 405, 429 → 303), test del proxy para la rama nueva, `tests/mobile/native-intent`, `vive-tu-app-explainer`, `store-compliance` (+ `?src=rn&from=`), `tsc` mobile | 3,0 | W1 + **gate de entrada**: 308 apex→www confirmado en Vercel/Cloudflare |
| **W3 Reconocer al coach + alta que avisa** | `clientLoginAction` rama `coach_account` (D4 = B) + scope local + `getClientBasePath` + espejo `/t`; `login/page.tsx` y `ClientLoginForm` con `searchParams.error` y mapa de mensajes; `forgot-password` línea; stepper/modal web con `coachEmail` y nota condicionada al demo; `own_email` en web y API móvil; RN `CreateClientModal` + `selfInviteNote` + `OWN_EMAIL` inline; eventos | 2 (web-login, alta web+rn) | test NUEVO `login.actions.test.ts` (molde `(auth)/login/actions.test.ts`), `AddStudentStepper`/`add-student-invite`/`AddStudentFlowProvider`, `platform-email`, `tests/mobile/guided-invite` + guards `store-copy`/`no-prices` | 1,5 | W0 (independiente de W1/W2; no comparte archivos con W1) |
| **W4 Admin sin demo** | Migración `CREATE OR REPLACE` (JOIN `ON` + FILTER), `coach-detail.queries`, `sistema.queries`, copy blast radius, test de `getAllCoachesPaginated` con RPC mockeada | 1 (db+admin) | **protocolo aditivo-en-LIVE**: snapshot `pg_get_functiondef` + grants → `BEGIN … EXPLAIN (ANALYZE, BUFFERS) … ROLLBACK` → `apply_migration` → `get_advisors` → `/admin/coaches` con un Free con demo dice `0/1` | 0,7 | W0 (independiente) |
| **W5 QA device + cierre** | Android real con app instalada (web y RN), iOS Safari, desktop; `CURRENT.md`, `MOBILE_PARITY.md` («Requiere OTA + QA device»), `TEST_STATUS.md`; **OTA primero**, deploy web después (fija `VIVE_TU_APP_ENTERED_CUTOVER`) | jefe + owner | matriz de QA completa con evidencia; suite completa UNA vez pre-push | 0,8 | W1–W4 |

Paralelismo real: W1 ∥ W3 ∥ W4 (archivos disjuntos: W1 no toca `login/page.tsx` ni `ClientLoginForm`;
el `?error=vive_tu_app_expirado` que emite el route ya existe y lo renderiza W3). W2 espera a W1 porque
reescribe `/vive-tu-app/route.ts` y su test. Deploy: W1+W2 juntos, tras la OTA.

## Contratos que fijan las waves (para que los workers no se crucen)

- **`ClientLoginState`** gana `kind?: 'coach_account'` y `action?: { href: string; label: string }`. Nada más.
- **`GET /vive-tu-app?t&c[&src=rn][&from=guia|builder]`** tras W1+W2 (orden único, SPEC §3): (1) `getUser()`
  → `coachUser`; (2) `verifyOtp` demo; (3) cinturón `is_demo` (select `id, is_demo, coach_id, full_name`);
  (4) si `coachUser?.id === client.coach_id` → `generateLink` del coach best-effort; (5) cookies en el
  redirect: `eva_vta_return` (httpOnly, path `/volver-al-panel`, 3600) y `eva_vta_mode` (httpOnly, path `/`,
  3600; `rn` > `return` > `remote`); (6) `recordOnboardingEvent(admin, { coachId: client.coach_id,
  stepKey:'vive_tu_app', eventType:'vive_tu_app_entered', metadata:{ surface, device, mode, identifier_kind } })`
  + `capturePostHogServerEvent`; (7) redirect `/c/<id>/dashboard`. Errores → `/c/<id>/login?error=vive_tu_app_expirado`.
- **`POST /volver-al-panel`**: cuerpo vacío; solo cookies. Ramas (a) sesión = `cookie.c` → 303 `/coach/guia`
  sin consumir; (b) sesión ≠ demo del coach → 303 login de alumno sin consumir; (c) sin sesión o demo del
  coach → `verifyOtp` primero → 303 `/coach/guia?desde=vive-tu-app` | vencido → 303 `/c/<id>/dashboard?volver=vencido`.
  Borra ambas cookies en toda rama **con su `path`**. `GET` → 405. 429 → 303 `/login?error=vive_tu_app_volver`.
- **Proxy**: early-return para `/vive-tu-app` y `/volver-al-panel` tras el rate limit y antes del
  `createServerClient`; rama «sesión con fila `clients` pide `/coach/*`» → 303 `/c/<id>/dashboard`; headers
  `x-client-is-demo`, `x-client-display-name` (encoded), `x-vta-mode` **siempre** seteados en la rama `/c`
  (vacíos cuando no aplica; no en login ni prefetch).
- **Evento** `vive_tu_app_entered`: solo CHECK + servidor. Los dos endpoints de cliente lo rechazan con 400 (test).
- **`resolveViveTuAppOpened(db, coachId, personaEpoch)`**: `.or('and(event_type.eq.vive_tu_app_entered,created_at.gte.<epoch>),and(event_type.eq.vive_tu_app_opened,created_at.lt.<CUTOVER>,created_at.gte.<epoch>)')`;
  sin `personaEpoch`, las mismas dos ramas sin el `gte`. `VIVE_TU_APP_ENTERED_CUTOVER` exportada junto al resolver.
- **Copy canónico** (latam neutro, `personaNoun`):
  - Banner: «Estás viendo tu app como {Nombre}.» + «Así se ve tu app para tus {alumnos}.» + botón por modo
    («Volver a mi panel» · «Volver a la app» · «Salir de la vista de ejemplo»); `from=builder`: «Vuelve a la
    app con el botón atrás.»; `?volver=vencido`: «Tu acceso de vuelta venció. Entra a tu panel por el login de coach.»
  - Login coach: «Esta es tu cuenta de coach, no una cuenta de {alumno}. Para ver tu app como la ven tus
    {alumnos}, entra a tu panel y toca Vive tu app.» + «Ir al login de coach».
  - Link vencido: «Tu link para entrar como {Nombre} venció o ya se usó. Vuelve a tu panel y toca Vive tu
    app de nuevo.» + «Ir a mi panel».
  - Stepper (con demo): «¿Quieres probar la app tú? No hace falta agregarte: usa Vive tu app desde tu panel.»
    (+ «No gasta cupo.» solo Free standalone).
  - Correo propio: «Ese es tu correo de coach. Para probar la app usa Vive tu app.»
  - Desktop sheet: «Se abre en otra pestaña. Cuando termines, vuelves a tu panel con un toque.»
  - RN explainer v2: «Se abre en el navegador de tu teléfono con tu logo y tu color, tal como la vería tu
    {alumno}. Tu sesión de coach sigue acá en la app: cuando termines, toca «Volver a la app» o usa el botón atrás.»
  - Sin demo (web): «Todavía no tienes tu {alumno} de ejemplo.» + «Volver a sembrar» / (other) «Tu especialidad
    no tiene alumno de ejemplo todavía.»

## QA y salida

| Caso | Dispositivo | Esperado |
|---|---|---|
| Guía paso 2 → «Ver mi app» | Android Chrome (sin app) | Misma pestaña, app del alumno con marca, banner `return`, «Volver a mi panel» → `/coach/guia` con paso 2 ✅ |
| Ídem | Android Chrome **con la app instalada** | Igual; si el 302 rebota a la app ⇒ contingencia (página intermedia) |
| Ídem | iOS Safari | Igual |
| Ídem | Desktop | Sheet; QR desde el teléfono ⇒ banner `remote`; «Abrir en este navegador» ⇒ nueva pestaña con `return`; la pestaña vieja, al navegar, vuelve a `/c/…` con banner |
| «Atrás» del navegador desde el demo | móvil web | `/coach/guia` refrescada (paso 2 ✅) si la sesión ya volvió; con sesión demo, cualquier `/coach/*` → `/c/…/dashboard` con banner, **nunca** `/coach/onboarding/complete` |
| «Cerrar sesión» del nav estando en el demo | móvil web | Botón dice «Volver a mi panel» y funciona igual |
| RN «Ver mi app» desde la guía | Android + iOS | Navegador del sistema, banner `rn`, «Volver a la app» abre `/coach/guia` en la app y el paso 2 aparece ✅ sin reabrir |
| RN «Ver como {demo}» desde la banda del builder | Android + iOS | Banner `rn` sin deep link («botón atrás»); al volver, el borrador sigue |
| Link vencido / reutilizado | cualquiera | Login de alumno con mensaje + «Ir a mi panel» |
| `/volver-al-panel` con token vencido | móvil web | Sigue en el demo, banner `remote` con «Entra a tu panel por el login de coach»; cookies borradas |
| `/volver-al-panel` con el coach ya logueado (dos pestañas) | desktop | 303 a `/coach/guia`, token intacto hasta vencer, cookies borradas |
| `/volver-al-panel` con sesión de alumno real | cualquiera | 303 al login de alumno, sin consumir token |
| Coach con su cuenta en `/c/<su-slug>/login` y en `/c/<otro>/login` | cualquiera | Mensaje + «Ir al login de coach»; sesión cerrada (local) |
| Coach sin demo (persona `other` / borrado) toca «Ver mi app» | cualquiera | «Volver a sembrar» o botón deshabilitado con explicación; nunca un toast |
| Stepper con el correo del coach | web + RN | Aviso + CTA deshabilitado (web) / nota + `OWN_EMAIL` inline (RN) |
| Admin `/admin/coaches` con Free + demo | desktop | `0/1`, utilización 0, sin actividad del demo; Sistema «Alumnos» sin demos |

Gates obligatorios antes del push (proporcionales, una sola corrida completa): `pnpm docs:check`,
`pnpm lint`, `pnpm typecheck`, `pnpm check:tokens`, `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false npx vitest run`,
`pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm --filter @eva/mobile exec expo export --platform android`,
`node scripts/guia-visual-check.mjs`.

## Riesgos y cómo se cubren

Ver tabla de la SPEC. Los que deciden el orden: (1) App Links Android ⇒ comprobación con `adb` **antes** de
W1 y QA device antes de cerrarla; (2) cookie del coach ⇒ tests de seguridad en W2 antes de cualquier deploy;
(3) `event_type` nuevo ⇒ migración aplicada **antes** del deploy y verificada después (la falla es silenciosa);
(4) rollout ⇒ OTA de RN antes del deploy web; W1+W2 juntos.
