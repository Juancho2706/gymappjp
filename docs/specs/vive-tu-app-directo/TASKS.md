---
status: active
owner: product-engineering
last_verified: "2026-08-23"
canonical: false
---

# TASKS — «Vive tu app» directo

Contrato: [SPEC](SPEC.md) · Plan: [PLAN](PLAN.md). Estado: **W0 hecha (docs + revisión adversarial), W1–W5 sin
empezar.** Ningún commit de código todavía. Convención: `- [x]` hecho · `- [~]` parcial (con **Pendiente:**) ·
`- [ ]` pendiente. Cada tarea nombra el archivo y, cuando aplica, el test que la pinnea. **W1+W2 = un solo
deploy web; OTA de RN antes.**

## W0 — Documentación (jefe)

- [x] V0.1 `docs/specs/vive-tu-app-directo/{SPEC,PLAN,TASKS}.md`.
- [x] V0.2 Bloque «Cambio 23-08» en [coach-onboarding-v2/SPEC.md](../coach-onboarding-v2/SPEC.md) que **MANDA sobre §5 y
  la fila 2 de §6** + marca inline en §5.
- [x] V0.3 En [coach-onboarding-v2/TASKS.md](../coach-onboarding-v2/TASKS.md): W8.1.9 y W8.6.2 marcadas como absorbidas;
  W8.1.2 referenciada (esta spec resuelve «sin demo» para quien puede tener demo; `other` sigue en D10).
- [x] V0.4 Panel adversarial (seguridad, RN/tiendas, producto, implementabilidad) y docs corregidos con sus hallazgos.
- [ ] V0.5 `docs/status/CURRENT.md` sub-viñeta 0: la frase «"Vive tu app" por QR (web)» queda falsa al mergear —
  se edita en W5 junto con `last_verified`.

## Gates de entrada (antes de arrancar W1/W2)

- [ ] G1 **App Links Android**: en un device con la app instalada, `adb shell pm get-app-links cl.evaapp.eva`
  (estado de `www.eva-app.cl` / `eva-app.cl`) y confirmar que el SHA-256 de `public/.well-known/assetlinks.json`
  es la clave de firma de Play. Abrir `https://www.eva-app.cl/vive-tu-app?t=x&c=y` desde Chrome y ver si el 302 a
  `/c/y/login` rebota a la app. Resultado documentado en esta sección. Si rebota ⇒ V1.21 entra en W1.
- [ ] G2 **apex → www**: confirmar en Vercel/Cloudflare que `eva-app.cl` responde 308 a `www.eva-app.cl` y que el
  panel del coach vive en `www` (cookies host-only). `AUTH_COOKIE_DOMAIN` queda sin setear.

## W1 — Entrar con un toque + el paso cuenta cuando entró (Opus ×2: `web-core`, `rn-api`)

### Web

- [ ] V1.1 `ViveTuAppButton.tsx`: rama móvil. `openSheet()` pasa a `open()`: `const fresh = await generate()`;
  si `!isDesktop` → `window.location.assign(fresh.url)` y fin (sin `setOpen`, sin `onOpened`, sin `router.refresh`);
  si desktop → sheet como hoy. `openHere()` deja de llamar `generate()` por segunda vez: reusa `link.url` si
  existe y solo regenera si falta (un solo `vive_tu_app_opened` por gesto).
- [ ] V1.2 `ViveTuAppButton.tsx`: `autoOpen` + `!isDesktop` ⇒ **no** navega; renderiza el botón con el `label`
  y espera el gesto. Desktop + `autoOpen` sigue abriendo el sheet.
- [ ] V1.3 Copy desktop en `ViveTuAppButton.tsx:165-194`: detalle bajo el QR «Entras directo, sin contraseña,
  como {nombre}. Es la misma app que van a usar tus {alumnos}.» y aviso «Se abre en otra pestaña. Cuando
  termines, vuelves a tu panel con un toque.» Comentarios de cabecera de `ViveTuAppButton.tsx:16-19` y
  `vive-tu-app.actions.ts:16-19` actualizados.
- [ ] V1.4 `DemoStudentCard.tsx:147-149`: «Entra como {firstName}: es tu app, con tu marca.» + botón «Volver a
  sembrar» cuando no hay demo y la persona lo admite (reusa la acción de `Opciones › Mi panel`). (D8 = A)
- [ ] V1.5 `ViveTuAppButton.tsx:66-67`: `reason === 'sin_demo'` deja de ser un toast: el botón se renderiza
  deshabilitado con «Todavía no tienes tu {alumno} de ejemplo.» (o, para `other`, «Tu especialidad no tiene
  alumno de ejemplo todavía.»), según `demoClientId`/persona que ya expone `getCoachOnboardingEmptyContext`.
- [ ] V1.6 `GuideStepCard.tsx:128`: la fila de acciones se pinta también con `done` cuando `step.key ===
  'vive_tu_app'` (label «Verla otra vez»). `GuideScreen.test.tsx`: `it` «con el paso 2 hecho, Vive tu app sigue
  accesible».
- [ ] V1.7 `WeeklyPlanBuilder.tsx:1329-1334` y `PrimeraPautaPublicada.tsx:46-51`: copy de la banda/overlay
  deja de decir «Ábrela en tu celular…»; `autoOpen` conserva semántica desktop (V1.2 cubre móvil). La prop
  `onOpened` sigue existiendo (la usan `DemoStudentCard.tsx:134`, `WeeklyPlanBuilder.tsx:1329`,
  `PrimeraPautaPublicada.tsx:46`); solo deja de tildar.
- [ ] V1.8 `vive-tu-app.actions.ts:40` y `onboarding-guide.actions.ts:121`: `revalidatePath('/coach/guia')`.
- [ ] V1.9 Rate limit en `openViveTuAppAction`: `rateLimitViveTuApp(user.id)` en `lib/rate-limit.ts` (molde
  `rateLimitCoachOnboardingEvents:219`), p. ej. 10 por 10 min; `reason: 'error'` con `detail` amable.
- [ ] V1.10 `GuideScreen.tsx`: al volver a primer plano (`pageshow` con `persisted` o `visibilitychange` →
  `visible`) → `router.refresh()` (una vez por retorno, con guard). Es el equivalente web del `AppState` RN: sin
  esto, «atrás» devuelve la guía cacheada sin tilde. Test: dispara el evento y espera un `refresh`.
- [ ] V1.11 Migración `supabase/migrations/<ts>_onboarding_events_vive_tu_app_entered.sql`: `alter table …
  drop constraint if exists coach_onboarding_events_event_type_check; alter table … add constraint … check
  (event_type in (<12 actuales> + 'vive_tu_app_entered'))` — **patrón `20260822002122:113-132`** (no el guard
  por catálogo de `:28-42`, que es para constraints que no existen y daría un no-op silencioso). `COMMENT ON
  CONSTRAINT`. Cabecera con porqué y constancia «Validada con BEGIN … ROLLBACK contra LIVE el <fecha>».
- [ ] V1.12 **Aplicar V1.11 en LIVE antes del deploy** (`apply_migration`, renombrar el archivo a la versión real)
  + `get_advisors` + consulta post-deploy `select count(*) from coach_onboarding_events where event_type =
  'vive_tu_app_entered'` (> 0 tras el primer ingreso real). `recordOnboardingEvent` traga el error con
  `console.warn`: sin esta verificación el paso no se tildaría nunca y nadie lo vería.
- [ ] V1.13 `/vive-tu-app/route.ts`: select del cinturón `id, is_demo, coach_id, full_name`; tras el cinturón,
  `recordOnboardingEvent(admin, { coachId: client.coach_id, stepKey: 'vive_tu_app', eventType:
  'vive_tu_app_entered', metadata: { surface, device, mode, identifier_kind } })` (best-effort) +
  `capturePostHogServerEvent({ event: 'vive_tu_app_entered', distinctId: client.coach_id, properties: {...} })`.
  `device` sale de `user-agent` (móvil/desktop, mismo sniff que `auth/confirm/route.ts:18-27`); `mode` lo
  fija W2 (`remote` hasta entonces). Nada del token ni del correo del demo en metadata ni en logs.
- [ ] V1.14 `vive-tu-app.service.ts:104-109`: `vive_tu_app_opened` gana `device` en metadata (lo pasa el
  llamador: web por `user-agent`, RN = `mobile`). El evento **no se mueve**.
- [ ] V1.15 **`vive_tu_app_entered` NO entra** en `api/coach/onboarding-events/route.ts:27-40` ni en
  `api/mobile/coach/dashboard/route.ts:34-47`. Tests: `onboarding-events/route.test.ts` y
  `mobile/coach/dashboard/route.test.ts` ganan un `it` «`vive_tu_app_entered` desde cliente → 400» (la lista
  «acepta los 12…» no cambia).
- [ ] V1.16 `onboarding-v2.queries.ts:270-284` `resolveViveTuAppOpened`: `.or('and(event_type.eq.vive_tu_app_entered,created_at.gte.<epoch>),and(event_type.eq.vive_tu_app_opened,created_at.lt.<CUTOVER>,created_at.gte.<epoch>)')`
  (sin epoch, sin los `gte`). `export const VIVE_TU_APP_ENTERED_CUTOVER = '<ISO del deploy>'` junto al resolver.
  `onboarding-v2.queries.test.ts`: reescribir `fakeDb` (`:37-88`) para interpretar `or` (hoy decide «hay
  corte» con `filters.some(op === 'gt' || 'gte')` y un `.or()` pasaría por la razón equivocada); los 3 `it`
  de `:264-290` cambian de expectativa + 2 nuevos («evento viejo posterior al corte ya no tilda», «`entered`
  tilda»). `persona-switch.service.test.ts` y `mi-panel.actions.test.ts` se corren: no cambian (el archivado
  usa el mismo resolver).
- [ ] V1.17 `GuideScreen.tsx:244` y `:296`: `onOpened` deja de llamar `markStepCompleted('vive_tu_app')`
  (queda `() => undefined`). `GuideScreen.test.tsx`: `it` nuevo «abrir Vive tu app NO tilda el paso 2 por sí solo».
- [ ] V1.18 `dev-harness/guia/page.tsx`: variante `?paso2=pendiente` (`viveTuAppOpened: false`,
  `completed.vive_tu_app: false`) para que `scripts/guia-visual-check.mjs` vea el CTA nuevo; asserts de tap
  target ≥ 44 px y sin recorte a 390 px sobre esa variante.
- [ ] V1.19 Tests nuevos: `ViveTuAppButton.test.tsx` (redefinir `window.matchMedia` antes del render —
  `vitest.setup.ts:22-36` fuerza `false`; casos: móvil navega en el mismo gesto y no abre sheet; desktop abre
  sheet; `autoOpen` móvil no navega; un solo `generate()` por gesto; sin demo = deshabilitado con texto).
  `vive-tu-app/route.test.ts` migrado al mock por tabla con `throw new Error('Unexpected table')` (molde
  `onboarding-events/route.test.ts:38-57`) y `it` nuevo «token válido → escribe `vive_tu_app_entered` con el
  coach_id del demo y device».
- [ ] V1.20 Tests que cambian de expectativa en el mismo commit: `vive-tu-app.service.test.ts:66,140` (el evento
  `opened` se conserva; se suma `device` y el caso `src=rn&from=`), `vive-tu-app.actions.test.ts:92`
  (`revalidatePath('/coach/guia')`), `use-onboarding-guide.test.ts:76,88` (sin cambio de lógica; verificar que
  no duplican `step_completed`).
- [ ] V1.21 (contingencia, solo si G1 lo confirma) `/vive-tu-app` responde una página mínima 200 que setea
  cookies y hace `location.replace('/c/<id>/dashboard')` por JS, en vez de 302. Cambia el assert de `location`
  de `route.test.ts:56` y se agrega al árbol de archivos del PLAN.

### RN + API móvil

- [ ] V1.22 `services/onboarding/vive-tu-app.service.ts:95` + `api/mobile/coach/vive-tu-app/route.ts`: cuando
  `surface === 'rn'` la URL lleva `&src=rn&from=<guia|builder>` (el endpoint acepta `from` en el body; default
  `guia`). `isStoreSafeUrl` la acepta (la query no forma parte del path); caso positivo en
  `tests/mobile/store-compliance.test.ts:27`. `program-builder.tsx:1921-1937` pasa `from: 'builder'`.
- [ ] V1.23 `apps/mobile/lib/guia-reload.ts` (NUEVO, puro): `shouldReloadOnAppState(prev, next)` = `prev !==
  'active' && next === 'active'`. Test en `tests/mobile/guia-reload.test.ts` (import por ruta relativa, sin
  `doMock`).
- [ ] V1.24 `apps/mobile/app/coach/guia.tsx`: `AppState.addEventListener('change', …)` con el helper de V1.23 y
  un `inFlight` ref (evita doble `load()` cuando `useFocusEffect` también dispara por el deep link). `change`
  no dispara al montar (precedente `app/(auth)/verify-email.tsx:91-95`): sin ref de «primer montaje».
  `guia.tsx:321-323` conserva el `load()` inmediato. **Sin listener en `program-builder.tsx`** (no tiene
  `load()`; usa el snapshot de `useCoachOnboarding`): regresión menor declarada.
- [ ] V1.25 `apps/mobile/lib/coach-dashboard.ts:410`: la unión de tipos **no** cambia (RN no emite `entered`).
  Anotarlo en el docblock.
- [ ] V1.26 Gate W1: `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm vitest run vive-tu-app apps/web/src/app/coach/guia
  apps/web/src/app/api/coach/onboarding-events apps/web/src/app/api/mobile/coach/dashboard tests/mobile` +
  `pnpm --filter @eva/mobile exec tsc --noEmit` + `node scripts/guia-visual-check.mjs` (variante V1.18) +
  V1.12 hecha. **No se despliega sin W2.** Las tareas V1.27–V1.29 (agregadas 26-08 por
  [flujo-coach-nuevo W0.7](../flujo-coach-nuevo/TASKS.md)) **entran a este mismo gate**.
- [ ] V1.27 (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); era su aporte 2)
  `app/vive-tu-app/route.ts:45`: el `signOut()` previo al `verifyOtp` pasa a `signOut({ scope: 'local' })` —
  hoy con alcance global mata la sesión del coach en TODOS sus dispositivos al abrir el demo. Test: el spy de
  `signOut` recibe `{ scope: 'local' }`.
- [ ] V1.28 (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); aporte 3) Mismo route, cinturón de
  `:38-42`: hoy valida `is_demo` **y nada más** — atar el parámetro `c=` al `coach_id` real del demo
  (`client.coach_id === c`, 400/redirect neutro si no coincide), para que un token de un demo ajeno no pueda
  decorarse con el `c=` de otro coach. Encaja con el select ampliado de V1.13 (`coach_id` ya viene). Test:
  «token válido con `c=` de otro coach → rechazado».
- [ ] V1.29 (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); aporte 4) Rate limit en
  `POST /api/mobile/coach/vive-tu-app` — hoy **0 apariciones de `rateLimit`** en sus 62 líneas. Molde
  `rateLimitViveTuApp` de V1.9 (mismo presupuesto por `user.id`); 429 con shape JSON del endpoint. Test del
  429.

## W2 — Volver con un toque (Opus ×2: `web-auth`, `rn`) — mismo deploy que W1

- [ ] V2.1 `proxy.ts`: early-return `NextResponse.next({ request })` para `/vive-tu-app` y `/volver-al-panel`
  **después** del bloque de rate limit (`:139-160`, que gana `POST /volver-al-panel` → `rateLimitAuth(ip)`, con
  429 → 303 `/login?error=vive_tu_app_volver` en vez de JSON) y **antes** del `createServerClient` (patrón
  `/api/payments/webhook`, `:115`). Test: ambas rutas no reciben `Set-Cookie` del proxy.
- [ ] V2.2 `proxy.ts:472-477`: antes del `!coach`, si la sesión tiene fila en `clients` (select `id, coach_id,
  is_demo` con el cliente del request) y pide `/coach/*` → 303 a `/c/<identificador público del coach>/dashboard`
  (nunca `/coach/onboarding/complete`). Test del proxy para la rama. Cinturón en
  `coach/onboarding/complete/_actions/complete.actions.ts`: si `clients` tiene fila para `user.id`, no crear coach.
- [ ] V2.3 `proxy.ts:1101-1104`: select `+ is_demo, full_name`; headers **siempre seteados** en la rama `/c`
  (vacíos si no aplica; `:1030` copia los headers del request): `x-client-is-demo` (`'1'`/`''`),
  `x-client-display-name` (`encodeBrandHeaderValue(full_name)`/`''`), `x-vta-mode` (desde la cookie
  `eva_vta_mode`: `rn` | `return` | `remote`; ausente ⇒ `remote`). No en `isLoginPage` ni prefetch. Limpiar la
  variable muerta `:1238`.
- [ ] V2.4 `app/c/[coach_slug]/_components/DemoViewerBanner.tsx` (NUEVO, server): lee los headers con
  `decodeBrandHeaderValue`; tres modos con precedencia `rn` > `return` > `remote`; tokens `surface-sunken` +
  `border-subtle` + `text-strong/muted` + `--cta-fill` (**sin `--info-700`**); `role="status"`; CTA ≥ 44 px.
  `return` = `<form method="post" action="/volver-al-panel">`; `rn` = Android (UA) `intent://coach/guia#Intent;scheme=eva;package=cl.evaapp.eva;S.browser_fallback_url=<login>;end`,
  iOS `eva://coach/guia`, y con `from=builder` (cookie `eva_vta_from`) solo el texto «Vuelve a la app con el
  botón atrás.»; `remote` = `DemoViewerExit.tsx` (`'use client'`) con `signOut` + `/c/<id>/login`; con
  `?volver=vencido`, detalle «Tu acceso de vuelta venció. Entra a tu panel por el login de coach.» + link `/login`.
  Test de render por modo con headers simulados (molde `lib/student-access.test.ts`), incluido nombre con tilde/emoji.
- [ ] V2.5 `layout.tsx`: monta `<DemoViewerBanner>` entre `<AppSeal />` (`:422`) y `{children}` (`:450`) cuando
  `x-client-is-demo === '1'`; oculto con `has-[.is-workout-page]:hidden`. Pasa `demoMode` a `ClientNav`.
- [ ] V2.6 `components/client/ClientNav.tsx:172-176` (y `perfil/_components/ProfileClient.tsx:227-232`): en sesión
  demo el botón «Cerrar sesión» se reetiqueta «Volver a mi panel» (modo `return`, mismo POST) o «Salir de la
  vista de ejemplo» (otros modos). Así el gesto obvio no quema el camino de vuelta.
- [ ] V2.7 `/vive-tu-app/route.ts` (segunda pasada, orden único de SPEC §3): (1) `getUser()` → `coachUser`;
  (2) `verifyOtp`; (3) cinturón con `coach_id`; (4) si `coachUser?.id === client.coach_id` →
  `admin.auth.admin.generateLink({ type:'magiclink', email: coachUser.email })` dentro de `try/catch`
  (falla ⇒ modo `remote`, nunca rompe el redirect); (5) sobre el `NextResponse.redirect`:
  `eva_vta_return = JSON.stringify({ t: hashed_token, c: client.coach_id })` (`httpOnly, secure: prod,
  sameSite:'lax', path:'/volver-al-panel', maxAge: 3600`) y `eva_vta_mode` (`httpOnly, path:'/', maxAge: 3600`)
  con precedencia `src=rn` ⇒ `rn` > `return` > `remote`; `eva_vta_from` si viene `from`; (6) `mode` real en
  el evento de V1.13. Test: «con sesión de coach dueño setea la cookie (httpOnly, path `/volver-al-panel`,
  maxAge 3600)», «con sesión de OTRO coach no la setea», «`src=rn` gana aunque haya sesión», «sin sesión ⇒
  `remote`», «`generateLink` falla ⇒ `remote` y redirect igual», «el token del coach no aparece en logs ni
  en props» (`expect(JSON.stringify(spy.mock.calls)).not.toContain(hash)`).
- [ ] V2.8 `app/volver-al-panel/route.ts` (NUEVO): `POST` solo (`GET` → 405). Lee `eva_vta_return`. Ramas en
  orden: (a) `getUser().id === cookie.c` → 303 `/coach/guia` sin consumir; (b) sesión presente y no es
  `clients.is_demo` con `coach_id === cookie.c` → 303 login de alumno sin consumir; (c) sin sesión o demo del
  coach → `verifyOtp({ token_hash: cookie.t, type:'magiclink' })` **primero**; OK → 303
  `/coach/guia?desde=vive-tu-app` + `capturePostHogServerEvent('vive_tu_app_returned', { mode:'return' })`;
  vencido/usado → 303 `/c/<id>/dashboard?volver=vencido` (la sesión demo no se toca). En **todas** las ramas
  `set(name, '', { maxAge: 0, path: <el mismo path> })` para las tres cookies. Test de cada rama + «la cookie
  borrada lleva `path: '/volver-al-panel'`» + «un `GET` no consume nada».
- [ ] V2.9 `(auth)/login`: renderiza `?error=vive_tu_app_volver` («Tu sesión de ejemplo terminó. Entra de nuevo a
  tu panel.»). Único consumidor de ese código.
- [ ] V2.10 `c/[coach_slug]/suspended/page.tsx:87,143`: el form a `/auth/signout` se reemplaza por el `signOut`
  client-side de `ClientNav`.
- [ ] V2.11 `apps/mobile/app/+native-intent.ts`: rama `segments[0] === 'coach' && segments[1] === 'guia'` →
  `'/coach/guia'` (allowlist explícita; el resto sigue devolviendo el path crudo). `tests/mobile/native-intent.test.ts`:
  caso nuevo; el de «rutas ajenas» se mantiene con otra ruta.
- [ ] V2.12 `apps/mobile/lib/vive-tu-app.ts:118-129`: explainer v2 («…cuando termines, toca «Volver a la app» o
  usa el botón atrás.»); `VIVE_TU_APP_EXPLAINED_PREFIX` → `eva.vive-tu-app.explained.v2:`. **Va en el mismo OTA
  que V2.4/V2.11** (en W1 el botón aún no existe). `tests/mobile/vive-tu-app-explainer.test.ts:70-110`
  actualizado (literales + clave versionada).
- [ ] V2.13 Gate W2: vitest `vive-tu-app volver-al-panel apps/web/src/app/c apps/web/src/proxy tests/mobile/native-intent
  tests/mobile/vive-tu-app-explainer tests/mobile/store-compliance` + `tsc` mobile + `pnpm typecheck` + G2 hecha.
  Documentar en la SPEC que `generateLink` comparte slot con recovery (ya está) y verificar contra GoTrue con
  un test manual: reset pedido durante el demo ⇒ `/volver-al-panel` cae en la rama «vencido».

## W3 — El login reconoce al coach + el alta avisa (Opus ×2: `web-login`, `alta-web-rn`)

- [ ] V3.1 `login.actions.ts`: tras `getUser()` (`:45-48`), `coaches.select('id').eq('id', user.id).maybeSingle()`;
  si hay fila → `signOut({ scope:'local' })` y `return { kind:'coach_account', error: <copy>, action:{ href:'/login',
  label:'Ir al login de coach' } }` (D4 = B). Los `signOut()` de `:67` y `:142` pasan a `{ scope:'local' }`.
  Comentario obsoleto `:50-51` corregido. `:160-162` usa `getClientBasePath`.
- [ ] V3.2 `ClientLoginState` gana `kind?` y `action?`; `ClientLoginForm.tsx:136-140` pinta `action` como
  `next/link`. Mapa de mensajes por `error` query en el form: `vive_tu_app_expirado` → «Tu link para entrar como
  {nombre} venció o ya se usó. Vuelve a tu panel y toca Vive tu app de nuevo.» + «Ir a mi panel» (`/coach/guia`).
  `login/page.tsx` lee `searchParams.error` y lo pasa a las **dos** instancias del form (`:169-187`).
- [ ] V3.3 Espejo en `t/[team_slug]/login/{page.tsx,TeamLoginForm.tsx,_actions/login.actions.ts:90-92}` (la
  page tampoco lee `searchParams`).
- [ ] V3.4 `(auth)/forgot-password/page.tsx`: con `coach_slug`/`team_slug`, línea estática «¿Eres coach? Tu
  panel entra por el login de coach.» → `/login`. Sin sondeo de correos.
- [ ] V3.5 `capturePostHogServerEvent({ event:'student_login_coach_account', distinctId: coach.id,
  properties:{ surface:'web', own_slug: boolean } })` en la rama nueva.
- [ ] V3.6 Test NUEVO `c/[coach_slug]/login/_actions/login.actions.test.ts` (molde `(auth)/login/actions.test.ts`):
  alumno OK → redirect; credenciales malas → «Email o contraseña incorrectos.»; **coach en su propio slug →
  `kind:'coach_account'` + `signOut` local**; **coach en slug ajeno → mismo resultado** (hoy «Coach no
  encontrado»); usuario sin fila en ningún lado → «No tienes acceso…» + `signOut` local.
- [ ] V3.7 `add-student-invite.ts`: `InviteDraft.coachEmail?: string | null`; `isCoachOwnEmail(value, coachEmail)`
  (trim + lower; `normalizePlatformEmail` solo para el aviso); `isReadyToInvite` devuelve `false` si es propio;
  `inviteBlockReason(draft)` → `'missing' | 'own_email'`; `selfInviteNote(noun, { showsCupo })` («¿Quieres probar
  la app tú? No hace falta agregarte: usa Vive tu app desde tu panel.» + «No gasta cupo.» solo si `showsCupo`).
  `add-student-invite.test.ts:51-70` + 3 `it` nuevos.
- [ ] V3.8 `clients/page.tsx:60-71`: `supabase.auth.getUser()` al `Promise.all` → `addStudentFlow.coachEmail`
  (+ `showsCupo` = Free standalone con demo). `add-student-flow-context.ts:15-25` y `AddStudentFlowProvider.tsx:69-77`
  propagan (opcionales). `AddStudentStepper.tsx`: nota V3.7 bajo el input de correo (`:584`) **solo si
  `firstContent.demoName`**; «Ese es tu correo de coach. Para probar la app usa Vive tu app.» cuando coincide +
  CTA deshabilitado con razón propia (`:757-759` ramificado). `apps/web/src/app/coach/clients/CreateClientModal.tsx`
  (montado sin config, `AddStudentFlowProvider.tsx:80`) toma `coachEmail` de `useAddStudentFlow()`.
  `AddStudentStepper.test.tsx`: `renderStepper` con `coachEmail` + `it` «con el correo del coach avisa y no
  habilita el CTA» + `ph.capture('add_student_self_blocked')`.
- [ ] V3.9 Servidor: `clients.actions.ts:156-165` y `api/mobile/coach/clients/route.ts:239-264`: antes de
  `assertPlatformEmailAvailable`, si `sanitizePlatformEmail(email) === sanitizePlatformEmail(user.email)` →
  `{ error:<copy>, code:'own_email' }` / 409 `OWN_EMAIL`. El 409 genérico **no cambia**
  (`platform-email.test.ts` sigue verde). `clients/actions.test.ts`: `it` nuevo; el orden de mocks de
  «creates client when under limit» se preserva (comparación local, sin llamadas extra).
- [ ] V3.10 RN: `guided-invite.ts` `selfInviteNote(noun, { showsCupo })` (independiente de `guidedCapNote`);
  `CreateClientModal.tsx:744-765` muestra la nota bajo «Email del alumno» solo con demo, compara con el `user`
  de la sesión cargada (no `getUser()` de red) y bloquea con mensaje propio; 409 `OWN_EMAIL` → `fieldErrors.email`
  (inline, no el banner global de `:428-430`); `captureAppEvent('add_student_self_blocked', { persona,
  surface:'rn_guided_invite' })`. Copy sin «plan»/«eva-app.cl»/precios. `tests/mobile/guided-invite.test.ts`:
  describe nuevo «nota de auto-alta»; los 5 `it` de `guidedCapNote` no cambian.
- [ ] V3.11 Gate W3: vitest `apps/web/src/app/c apps/web/src/app/t apps/web/src/app/coach/clients
  apps/web/src/lib/auth/platform-email tests/mobile/guided-invite tests/mobile/store-copy tests/mobile-no-prices`
  + `tsc` mobile + `pnpm typecheck`.
- [ ] V3.12 (opcional, deuda declarada) Espejo RN: `validate-student-workspace/route.ts:61` responde 403
  `COACH_ACCOUNT` cuando el bearer es un coach, y `app/alumno/codigo` muestra el mismo mensaje con CTA a la
  pantalla de coach.
- [x] V3.13 — **Hecha 26-08 por la hermana (FCN W1.4), post-merge de VTA W3, con GO del jefe: un solo
  escritor, regla cumplida.** (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); su aporte 1 = **call site de FCN
  W1.4**) Dentro del diff de V3.1, en `c/[coach_slug]/login/_actions/login.actions.ts`, tras resolver el
  `client` y antes de devolver el `redirectUrl` (`:160-164`): **una línea** que llama **esperada** (`await`,
  nunca promesa flotante) a `recordStudentFirstLogin(admin, client.id)` — el servicio lo crea
  [FCN W1.2](../flujo-coach-nuevo/TASKS.md) (`student-login-signal.service.ts`, nunca lanza). **Regla de no
  colisión (FCN W1.4):** la línea la agrega **el worker de VTA W3 dentro de su diff** si FCN W1.2 ya está
  mergeada; si no, V3.13 queda pendiente y FCN W1.4 la agrega tras el merge de VTA W3 — **nunca los dos**.
  Gate: el test de V3.6 suma el assert «login de alumno llama `recordStudentFirstLogin` una vez».

## W4 — Panel admin sin alumno de ejemplo (Opus ×1: `db-admin`) — absorbe W8.1.9

- [ ] V4.1 Snapshot LIVE: `pg_get_functiondef('public.get_admin_coaches_paginated'::regproc)`, `pg_proc.proacl`;
  SQL de reversa (el cuerpo vigente) guardado en el reporte de la tarea.
- [ ] V4.2 Migración `supabase/migrations/<ts>_admin_coaches_excluye_demo.sql` con el cuerpo del informe
  `alta-cupo-admin` §9.3: firma idéntica, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO
  'public','auth'`, `LEFT JOIN public.clients cl ON cl.coach_id = c.id AND cl.is_demo IS NOT TRUE`, `FILTER`
  explícitos, `active_client_count` = `cl.is_archived = false AND cl.is_demo IS NOT TRUE` (D3 = A),
  `utilization_pct` sobre el conteo limpio, `COMMENT ON FUNCTION`. **Prohibido `DROP FUNCTION`** y **prohibido
  tocar `RETURNS TABLE`.**
- [ ] V4.3 Validación sin persistir: `BEGIN; <CREATE OR REPLACE>; EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM
  get_admin_coaches_paginated(NULL,NULL,'free',NULL,'created_at','desc',50,0); SELECT … WHERE id =
  'e83314d8-…'; ROLLBACK;` + comparación de plan con la vigente. Aplicar con `apply_migration` (versión real ⇒
  renombrar el archivo) → `get_advisors` security + performance.
- [ ] V4.4 `coach-detail.queries.ts:142-147`: `.eq('is_demo', false)` en ambos; `activeClientCountRes` pasa a
  `.eq('is_archived', false)` (D3). `admin/(panel)/sistema/_data/sistema.queries.ts:91`: KPI «Alumnos» con
  `is_demo = false` e `is_archived = false`. `coaches/[id]/page.tsx:153-155` sin cambio.
- [ ] V4.5 `CoachCommandPanel.tsx:740`: «…incluidos {client_count} alumnos reales y su alumno de ejemplo.
  Irreversible.»
- [ ] V4.6 Test NUEVO `admin/(panel)/dashboard/_data/admin.queries.test.ts`: `getAllCoachesPaginated` con `rpc`
  mockeado (contrato de columnas) — el `as any` de `:205` deja el typecheck sin red.
- [ ] V4.7 `database.types.ts`: **sin cambios** (firma intacta). Anotarlo en el commit.
- [ ] V4.8 Gate W4: vitest `apps/web/src/app/admin apps/web/src/app/api/cron/cap-nudge` + QA visual
  `/admin/coaches` con `jpl` (Free + demo + 1 real) ⇒ `1/1`; un Free solo con demo ⇒ `0/1`; Sistema sin demos.

## W5 — QA device + cierre (jefe + owner)

- [ ] V5.1 Matriz de QA del PLAN con evidencia (capturas/video), en especial **Android con la app instalada**
  (web móvil y RN), «atrás» con sesión demo, «Cerrar sesión» del nav y `/volver-al-panel` vencido.
- [ ] V5.2 **OTA primero** (`mobile-ota.yml`, rama con master mergeado; explainer v2 + `AppState` + native-intent),
  **deploy web después**; `VIVE_TU_APP_ENTERED_CUTOVER` = timestamp del deploy. Sin cambios nativos ⇒ no hay binario.
- [ ] V5.3 `docs/status/CURRENT.md` (sub-viñeta 0 + `last_verified`), `docs/status/MOBILE_PARITY.md` (blockquote
  fechado «explainer v2, `AppState`, `eva://coach/guia`; **Requiere OTA + QA device**» + `last_verified "fecha @ sha"`),
  `docs/testing/TEST_STATUS.md` (fila consolidada de la corrida completa).
- [ ] V5.4 Insight PostHog «Paso 2: pidió → entró → volvió» por `device` y `mode` + `student_login_coach_account`
  + `add_student_self_blocked`. Deuda que se cobra de paso si hay margen: W8.5.2 (espejo a PostHog desde
  `recordOnboardingEvent`).

## Decisiones del owner

**Las cuatro quedaron decididas por el owner el 23-08 (tarde).** Ninguna wave de esta spec sigue esperando
una respuesta; lo que queda son los gates técnicos.

| # | Decisión | Opciones | Decisión |
|---|---|---|---|
| D1 | Mecánica de «Volver a mi panel» | A magic link en cookie · B stash de sesión · C cookie propia del demo | **A** (owner, 23-08) — coincide con la recomendación |
| D3 | `active_client_count` admin | A = cupo (`is_archived=false`, sin demo) · B `is_active` sin demo | **A** (owner, 23-08) — coincide con la recomendación |
| D4 | Coach en login de alumno | A conserva sesión + «Ir a mi panel» · B `signOut` local + «Ir al login de coach» | **B** (owner, 23-08) — la recomendación tras la revisión de seguridad |
| D8 | Sin alumno de ejemplo | A «Volver a sembrar» / deshabilitado con explicación · B toast como hoy | **A** (owner, 23-08) — coincide con la recomendación |

Defaults declarados (no requieren decisión): desktop conserva el sheet · correo propio = aviso + CTA
deshabilitado · `vive_tu_app_entered` solo servidor · `autoOpen` en móvil muestra el CTA.
