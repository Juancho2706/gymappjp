---
status: active
owner: product-engineering
last_verified: "2026-08-26"
canonical: false
---

# TASKS — «Vive tu app» directo

Contrato: [SPEC](SPEC.md) · Plan: [PLAN](PLAN.md). Estado: **W0–W4 EJECUTADAS el 2026-08-26** (commits
`2d19e237..e7ed1de9` en `rnmobiledenuevo`: `2d19e237` W4 · `c251a49c` W1 · `8d435570` W2 · `fd979428` W3 ·
`8dffbbff` telemetría · `e4187269` assetlinks · `e7ed1de9` cutover RN). **Fuera de la ola: V1.21**
(contingencia, espera el re-test de G1 post-deploy) y **V3.12** (opcional, declarada deuda). **W5 abierta**:
QA device del owner, `TEST_STATUS.md` y el insight de PostHog. Convención: `- [x]` hecho · `- [~]` parcial
(con **Pendiente:**) · `- [ ]` pendiente. Cada tarea nombra el archivo y, cuando aplica, el test que la
pinnea. **W1+W2 = un solo deploy web; OTA de RN antes.**

## W0 — Documentación (jefe)

- [x] V0.1 `docs/specs/vive-tu-app-directo/{SPEC,PLAN,TASKS}.md`.
- [x] V0.2 Bloque «Cambio 23-08» en [coach-onboarding-v2/SPEC.md](../coach-onboarding-v2/SPEC.md) que **MANDA sobre §5 y
  la fila 2 de §6** + marca inline en §5.
- [x] V0.3 En [coach-onboarding-v2/TASKS.md](../coach-onboarding-v2/TASKS.md): W8.1.9 y W8.6.2 marcadas como absorbidas;
  W8.1.2 referenciada (esta spec resuelve «sin demo» para quien puede tener demo; `other` sigue en D10).
- [x] V0.4 Panel adversarial (seguridad, RN/tiendas, producto, implementabilidad) y docs corregidos con sus hallazgos.
- [x] V0.5 `docs/status/CURRENT.md` sub-viñeta 0: la frase «"Vive tu app" por QR (web)» quedó falsa al mergear.
  Corregida el 26-08 en el cierre de la ola («el móvil navega directo; el paso se tilda al ENTRAR») junto con
  `last_verified`.

## Gates de entrada (antes de arrancar W1/W2)

- [~] G1 **App Links Android** — **corrido el 26-08: ROJO, causa raíz encontrada y arreglada, re-test
  pendiente.** `adb shell pm get-app-links cl.evaapp.eva` devolvió **estado 1024** (`verification failed`)
  para `www.eva-app.cl` y `eva-app.cl`. Causa raíz: `apps/web/public/.well-known/assetlinks.json` **no
  incluía el SHA-256 de la clave de Play App Signing** (solo la de la build local/upload), así que la app
  instalada desde la tienda jamás podía verificar el dominio. Fix `e4187269` (la firma real de Play entra al
  archivo; se publica con el deploy web de esta ola). **RE-TEST POST-DEPLOY EJECUTADO (26-08, device del
  owner): `pm verify-app-links --re-verify` ⇒ estado `verified` en AMBOS dominios** — los App Links de EVA
  verifican por primera vez. Test de rebote: `am start VIEW https://www.eva-app.cl/vive-tu-app?t=x&c=y`
  abre en el navegador, NO en la app, y no puede ser de otra forma: los intent filters de `app.json` solo
  reclaman `/c/*`, `/invite/*` y `/reset-password` — `/vive-tu-app` no está reclamado ⇒ **V1.21 es
  IMPOSIBLE de necesitar y queda cerrada como «no aplica»**. Nota de alcance: con `verified`, los tres
  paths SÍ reclamados tocados desde apps externas (WhatsApp/Gmail) ahora abren la app en devices donde
  «Abrir enlaces compatibles» esté activo (el default post-verificación); el device del owner lo tiene
  Disabled por selección de usuario de la era rota — re-habilitable en Ajustes de la app.
- [x] G2 **apex → www** — **VERDE, verificado el 26-08**: `eva-app.cl` responde **308** a `www.eva-app.cl`
  y el panel del coach vive en `www` (cookies host-only). `AUTH_COOKIE_DOMAIN` sigue sin setear. Sin esto el
  `getUser()` del paso 1 de V2.7 devolvería `null` y el modo `return` no dispararía nunca.

## W1 — Entrar con un toque + el paso cuenta cuando entró (Opus ×2: `web-core`, `rn-api`)

### Web

- [x] V1.1 `ViveTuAppButton.tsx`: rama móvil. `openSheet()` pasa a `open()`: `const fresh = await generate()`;
  si `!isDesktop` → `window.location.assign(fresh.url)` y fin (sin `setOpen`, sin `onOpened`, sin `router.refresh`);
  si desktop → sheet como hoy. `openHere()` deja de llamar `generate()` por segunda vez: reusa `link.url` si
  existe y solo regenera si falta (un solo `vive_tu_app_opened` por gesto).
- [x] V1.2 `ViveTuAppButton.tsx`: `autoOpen` + `!isDesktop` ⇒ **no** navega; renderiza el botón con el `label`
  y espera el gesto. Desktop + `autoOpen` sigue abriendo el sheet.
- [x] V1.3 Copy desktop en `ViveTuAppButton.tsx:165-194`: detalle bajo el QR «Entras directo, sin contraseña,
  como {nombre}. Es la misma app que van a usar tus {alumnos}.» y aviso «Se abre en otra pestaña. Cuando
  termines, vuelves a tu panel con un toque.» Comentarios de cabecera de `ViveTuAppButton.tsx:16-19` y
  `vive-tu-app.actions.ts:16-19` actualizados.
- [x] V1.4 `DemoStudentCard.tsx:147-149`: «Entra como {firstName}: es tu app, con tu marca.» + botón «Volver a
  sembrar» cuando no hay demo y la persona lo admite (reusa la acción de `Opciones › Mi panel`). (D8 = A)
  **Desvío:** «Volver a sembrar» **no** vive en `DemoStudentCard` (esa tarjeta solo se monta cuando SÍ hay
  demo) sino en el estado «sin demo» del propio `ViveTuAppButton`, que es donde mira el coach sin ejemplo.
  Reusa `reseedDemoStudentAction`. Persona `null` (los coaches sin especialidad) queda deshabilitada con el
  texto genérico: la acción exige persona y un botón que siempre falla sería peor que el toast.
- [x] V1.5 `ViveTuAppButton.tsx:66-67`: `reason === 'sin_demo'` deja de ser un toast: el botón se renderiza
  deshabilitado con «Todavía no tienes tu {alumno} de ejemplo.» (o, para `other`, «Tu especialidad no tiene
  alumno de ejemplo todavía.»), según `demoClientId`/persona que ya expone `getCoachOnboardingEmptyContext`.
- [x] V1.6 `GuideStepCard.tsx:128`: la fila de acciones se pinta también con `done` cuando `step.key ===
  'vive_tu_app'` (label «Verla otra vez»). `GuideScreen.test.tsx`: `it` «con el paso 2 hecho, Vive tu app sigue
  accesible».
- [x] V1.7 `WeeklyPlanBuilder.tsx:1329-1334` y `PrimeraPautaPublicada.tsx:46-51`: copy de la banda/overlay
  deja de decir «Ábrela en tu celular…»; `autoOpen` conserva semántica desktop (V1.2 cubre móvil). La prop
  `onOpened` sigue existiendo (la usan `DemoStudentCard.tsx:134`, `WeeklyPlanBuilder.tsx:1329`,
  `PrimeraPautaPublicada.tsx:46`); solo deja de tildar.
- [x] V1.8 `vive-tu-app.actions.ts:40` y `onboarding-guide.actions.ts:121`: `revalidatePath('/coach/guia')`.
- [x] V1.9 Rate limit en `openViveTuAppAction`: `rateLimitViveTuApp(user.id)` en `lib/rate-limit.ts` (molde
  `rateLimitCoachOnboardingEvents:219`), p. ej. 10 por 10 min; `reason: 'error'` con `detail` amable.
- [x] V1.10 `GuideScreen.tsx`: al volver a primer plano (`pageshow` con `persisted` o `visibilitychange` →
  `visible`) → `router.refresh()` (una vez por retorno, con guard). Es el equivalente web del `AppState` RN: sin
  esto, «atrás» devuelve la guía cacheada sin tilde. Test: dispara el evento y espera un `refresh`.
- [x] V1.11 Migración `supabase/migrations/<ts>_onboarding_events_vive_tu_app_entered.sql`: `alter table …
  drop constraint if exists coach_onboarding_events_event_type_check; alter table … add constraint … check
  (event_type in (<12 actuales> + 'vive_tu_app_entered'))` — **patrón `20260822002122:113-132`** (no el guard
  por catálogo de `:28-42`, que es para constraints que no existen y daría un no-op silencioso). `COMMENT ON
  CONSTRAINT`. Cabecera con porqué y constancia «Validada con BEGIN … ROLLBACK contra LIVE el <fecha>».
  **Hecha:** el archivo nació como placeholder `99999999999999_…` y quedó con la versión real en V1.12.
- [x] V1.12 **APLICADA EN LIVE por el jefe el 26-08**: migración `20260826044211_onboarding_events_vive_tu_app_entered.sql`
  (`apply_migration`, archivo renombrado a esa versión) + `get_advisors` sin hallazgos nuevos. La consulta
  `select count(*) … where event_type = 'vive_tu_app_entered' > 0` se corre **tras el primer ingreso real
  post-deploy** (queda como verificación de W5, no bloquea). Original de la tarea:
  **Aplicar V1.11 en LIVE antes del deploy** (`apply_migration`, renombrar el archivo a la versión real)
  + `get_advisors` + consulta post-deploy `select count(*) from coach_onboarding_events where event_type =
  'vive_tu_app_entered'` (> 0 tras el primer ingreso real). `recordOnboardingEvent` traga el error con
  `console.warn`: sin esta verificación el paso no se tildaría nunca y nadie lo vería.
- [x] V1.13 `/vive-tu-app/route.ts`: select del cinturón `id, is_demo, coach_id, full_name`; tras el cinturón,
  `recordOnboardingEvent(admin, { coachId: client.coach_id, stepKey: 'vive_tu_app', eventType:
  'vive_tu_app_entered', metadata: { surface, device, mode, identifier_kind } })` (best-effort) +
  `capturePostHogServerEvent({ event: 'vive_tu_app_entered', distinctId: client.coach_id, properties: {...} })`.
  `device` sale de `user-agent` (móvil/desktop, mismo sniff que `auth/confirm/route.ts:18-27`); `mode` lo
  fija W2 (`remote` hasta entonces). Nada del token ni del correo del demo en metadata ni en logs.
  **Desvío deliberado (worker `web-core`):** el `capturePostHogServerEvent` explícito **no** se agregó —
  desde W8.5.2 `recordOnboardingEvent` ya espeja a PostHog (`persona.service.ts`, `POSTHOG_MIRROR_SKIP` no
  incluye este evento), así que capturarlo dos veces habría duplicado cada ingreso y roto justo la métrica
  `entered/opened` por `device`. El porqué queda comentado en el route. W2 (V2.7) le puso `mode` real y
  `surface: 'rn'` cuando la URL trae `src=rn`.
- [x] V1.14 `vive-tu-app.service.ts:104-109`: `vive_tu_app_opened` gana `device` en metadata (lo pasa el
  llamador: web por `user-agent`, RN = `mobile`). El evento **no se mueve**.
- [x] V1.15 **`vive_tu_app_entered` NO entra** en `api/coach/onboarding-events/route.ts:27-40` ni en
  `api/mobile/coach/dashboard/route.ts:34-47`. Tests: `onboarding-events/route.test.ts` y
  `mobile/coach/dashboard/route.test.ts` ganan un `it` «`vive_tu_app_entered` desde cliente → 400» (la lista
  «acepta los 12…» no cambia). **Verificado: los dos endpoints ya rechazaban el evento antes de la ola**
  (no está en el `z.enum` web ni en `MOBILE_EVENT_TYPES`), así que V1.15 no pedía código, solo los dos tests:
  el web lo escribió `web-core` y el móvil el worker `telemetry` (commit `8dffbbff`), con assert de
  `code: 'INVALID_EVENT'` y de que no hubo insert.
- [x] V1.16 `onboarding-v2.queries.ts:270-284` `resolveViveTuAppOpened`: `.or('and(event_type.eq.vive_tu_app_entered,created_at.gte.<epoch>),and(event_type.eq.vive_tu_app_opened,created_at.lt.<CUTOVER>,created_at.gte.<epoch>)')`
  (sin epoch, sin los `gte`). `export const VIVE_TU_APP_ENTERED_CUTOVER = '<ISO del deploy>'` junto al resolver.
  `onboarding-v2.queries.test.ts`: reescribir `fakeDb` (`:37-88`) para interpretar `or` (hoy decide «hay
  corte» con `filters.some(op === 'gt' || 'gte')` y un `.or()` pasaría por la razón equivocada); los 3 `it`
  de `:264-290` cambian de expectativa + 2 nuevos («evento viejo posterior al corte ya no tilda», «`entered`
  tilda»). `persona-switch.service.test.ts` y `mi-panel.actions.test.ts` se corren: no cambian (el archivado
  usa el mismo resolver). **`VIVE_TU_APP_ENTERED_CUTOVER` nació como placeholder `2099-01-01` (el resolver se
  comportaba como hoy y nadie perdía un tilde) y el jefe lo fijó al corte del deploy: `2026-08-26T06:00:00.000Z`**
  (`onboarding-v2.queries.ts:275`). El `fakeDb` del test se reescribió con un mini-parser de `.or(...)`;
  quedaron 5 `it` nuevos.
- [x] V1.17 `GuideScreen.tsx:244` y `:296`: `onOpened` deja de llamar `markStepCompleted('vive_tu_app')`
  (queda `() => undefined`). `GuideScreen.test.tsx`: `it` nuevo «abrir Vive tu app NO tilda el paso 2 por sí solo».
- [x] V1.18 `dev-harness/guia/page.tsx`: variante `?paso2=pendiente` (`viveTuAppOpened: false`,
  `completed.vive_tu_app: false`) para que `scripts/guia-visual-check.mjs` vea el CTA nuevo; asserts de tap
  target ≥ 44 px y sin recorte a 390 px sobre esa variante.
- [x] V1.19 Tests nuevos: `ViveTuAppButton.test.tsx` (redefinir `window.matchMedia` antes del render —
  `vitest.setup.ts:22-36` fuerza `false`; casos: móvil navega en el mismo gesto y no abre sheet; desktop abre
  sheet; `autoOpen` móvil no navega; un solo `generate()` por gesto; sin demo = deshabilitado con texto).
  `vive-tu-app/route.test.ts` migrado al mock por tabla con `throw new Error('Unexpected table')` (molde
  `onboarding-events/route.test.ts:38-57`) y `it` nuevo «token válido → escribe `vive_tu_app_entered` con el
  coach_id del demo y device».
- [x] V1.20 Tests que cambian de expectativa en el mismo commit: `vive-tu-app.service.test.ts:66,140` (el evento
  `opened` se conserva; se suma `device` y el caso `src=rn&from=`), `vive-tu-app.actions.test.ts:92`
  (`revalidatePath('/coach/guia')`), `use-onboarding-guide.test.ts:76,88` (sin cambio de lógica; verificar que
  no duplican `step_completed`). **`vive-tu-app.service.test.ts` lo actualizó el worker `rn-api`** (es el test
  que pinnea su propio cambio de V1.14/V1.22); `use-onboarding-guide.test.ts` se corrió sin cambios y
  verificado que no duplica `step_completed`.
- [x] V1.21 **NO APLICA — cerrada por el re-test de G1 (26-08)**: `/vive-tu-app` no está en los intent
  filters de `app.json`, así que el rebote que esta contingencia cubría es imposible; el dominio quedó
  `verified` y aun así el VIEW intent abre en el navegador. (contingencia, solo si G1 lo confirmaba) `/vive-tu-app` responde una página mínima 200 que setea
  cookies y hace `location.replace('/c/<id>/dashboard')` por JS, en vez de 302. Cambia el assert de `location`
  de `route.test.ts:56` y se agrega al árbol de archivos del PLAN. **NO ejecutada: espera el re-test de G1
  post-deploy** (assetlinks corregido en `e4187269`). Con el estado 1024 vigente el 302 no rebota a la app,
  así que la ola desplegó sin ella; si el re-test muestra rebote, entra como hotfix propio.

### RN + API móvil

- [x] V1.22 `services/onboarding/vive-tu-app.service.ts:95` + `api/mobile/coach/vive-tu-app/route.ts`: cuando
  `surface === 'rn'` la URL lleva `&src=rn&from=<guia|builder>` (el endpoint acepta `from` en el body; default
  `guia`). `isStoreSafeUrl` la acepta (la query no forma parte del path); caso positivo en
  `tests/mobile/store-compliance.test.ts:27`. `program-builder.tsx:1921-1937` pasa `from: 'builder'`.
- [x] V1.23 `apps/mobile/lib/guia-reload.ts` (NUEVO, puro): `shouldReloadOnAppState(prev, next)` = `prev !==
  'active' && next === 'active'`. Test en `tests/mobile/guia-reload.test.ts` (import por ruta relativa, sin
  `doMock`).
- [x] V1.24 `apps/mobile/app/coach/guia.tsx`: `AppState.addEventListener('change', …)` con el helper de V1.23 y
  un `inFlight` ref (evita doble `load()` cuando `useFocusEffect` también dispara por el deep link). `change`
  no dispara al montar (precedente `app/(auth)/verify-email.tsx:91-95`): sin ref de «primer montaje».
  `guia.tsx:321-323` conserva el `load()` inmediato. **Sin listener en `program-builder.tsx`** (no tiene
  `load()`; usa el snapshot de `useCoachOnboarding`): regresión menor declarada.
- [x] V1.25 `apps/mobile/lib/coach-dashboard.ts:410`: la unión de tipos **no** cambia (RN no emite `entered`).
  Anotarlo en el docblock.
- [~] V1.26 Gate W1: `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm vitest run vive-tu-app apps/web/src/app/coach/guia
  apps/web/src/app/api/coach/onboarding-events apps/web/src/app/api/mobile/coach/dashboard tests/mobile` +
  `pnpm --filter @eva/mobile exec tsc --noEmit` + `node scripts/guia-visual-check.mjs` (variante V1.18) +
  V1.12 hecha. **No se despliega sin W2.** Las tareas V1.27–V1.29 (agregadas 26-08 por
  [flujo-coach-nuevo W0.7](../flujo-coach-nuevo/TASKS.md)) **entran a este mismo gate**.
  **Resultado real 26-08:** vitest focalizado **VERDE** (16 archivos / 182 tests web-core; 109 archivos /
  1.532 tests en el scope RN+servicios), `tsc` mobile **VERDE**, `pnpm typecheck` **VERDE**, V1.12 hecha.
  **Pendiente:** `node scripts/guia-visual-check.mjs` sale **ROJO por causa ajena y preexistente** — 30 de
  165 aserciones, **todas** de la píldora (`GuidePill` se auto-minimiza a los `TEASER_MS = 3200 ms` desde
  `7e1490a2`, posterior a la escritura del gate en `9fd11ccd`); la variante V1.18 (`?paso2=pendiente`,
  390 px × light/dark) es **8/8 verde**. El arreglo natural es que el gate re-expanda la píldora antes de
  medirla — deuda propia, fuera de esta ola.
- [x] V1.27 (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); era su aporte 2)
  `app/vive-tu-app/route.ts:45`: el `signOut()` previo al `verifyOtp` pasa a `signOut({ scope: 'local' })` —
  hoy con alcance global mata la sesión del coach en TODOS sus dispositivos al abrir el demo. Test: el spy de
  `signOut` recibe `{ scope: 'local' }`.
- [x] V1.28 (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); aporte 3) Mismo route, cinturón de
  `:38-42`: hoy valida `is_demo` **y nada más** — atar el parámetro `c=` al `coach_id` real del demo
  (`client.coach_id === c`, 400/redirect neutro si no coincide), para que un token de un demo ajeno no pueda
  decorarse con el `c=` de otro coach. Encaja con el select ampliado de V1.13 (`coach_id` ya viene). Test:
  «token válido con `c=` de otro coach → rechazado».
- [x] V1.29 (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); aporte 4) Rate limit en
  `POST /api/mobile/coach/vive-tu-app` — hoy **0 apariciones de `rateLimit`** en sus 62 líneas. Molde
  `rateLimitViveTuApp` de V1.9 (mismo presupuesto por `user.id`); 429 con shape JSON del endpoint. Test del
  429.

## W2 — Volver con un toque (Opus ×2: `web-auth`, `rn`) — mismo deploy que W1

- [x] V2.1 `proxy.ts`: early-return `NextResponse.next({ request })` para `/vive-tu-app` y `/volver-al-panel`
  **después** del bloque de rate limit (`:139-160`, que gana `POST /volver-al-panel` → `rateLimitAuth(ip)`, con
  429 → 303 `/login?error=vive_tu_app_volver` en vez de JSON) y **antes** del `createServerClient` (patrón
  `/api/payments/webhook`, `:115`). Test: ambas rutas no reciben `Set-Cookie` del proxy.
- [x] V2.2 `proxy.ts:472-477`: antes del `!coach`, si la sesión tiene fila en `clients` (select `id, coach_id,
  is_demo` con el cliente del request) y pide `/coach/*` → 303 a `/c/<identificador público del coach>/dashboard`
  (nunca `/coach/onboarding/complete`). Test del proxy para la rama. Cinturón en
  `coach/onboarding/complete/_actions/complete.actions.ts`: si `clients` tiene fila para `user.id`, no crear coach.
- [x] V2.3 `proxy.ts:1101-1104`: select `+ is_demo, full_name`; headers **siempre seteados** en la rama `/c`
  (vacíos si no aplica; `:1030` copia los headers del request): `x-client-is-demo` (`'1'`/`''`),
  `x-client-display-name` (`encodeBrandHeaderValue(full_name)`/`''`), `x-vta-mode` (desde la cookie
  `eva_vta_mode`: `rn` | `return` | `remote`; ausente ⇒ `remote`). No en `isLoginPage` ni prefetch. Limpiar la
  variable muerta `:1238`.
- [x] V2.4 `app/c/[coach_slug]/_components/DemoViewerBanner.tsx` (NUEVO, server): lee los headers con
  `decodeBrandHeaderValue`; tres modos con precedencia `rn` > `return` > `remote`; tokens `surface-sunken` +
  `border-subtle` + `text-strong/muted` + `--cta-fill` (**sin `--info-700`**); `role="status"`; CTA ≥ 44 px.
  `return` = `<form method="post" action="/volver-al-panel">`; `rn` = Android (UA) `intent://coach/guia#Intent;scheme=eva;package=cl.evaapp.eva;S.browser_fallback_url=<login>;end`,
  iOS `eva://coach/guia`, y con `from=builder` (cookie `eva_vta_from`) solo el texto «Vuelve a la app con el
  botón atrás.»; `remote` = `DemoViewerExit.tsx` (`'use client'`) con `signOut` + `/c/<id>/login`; con
  `?volver=vencido`, detalle «Tu acceso de vuelta venció. Entra a tu panel por el login de coach.» + link `/login`.
  Test de render por modo con headers simulados (molde `lib/student-access.test.ts`), incluido nombre con tilde/emoji.
- [x] V2.5 `layout.tsx`: monta `<DemoViewerBanner>` entre `<AppSeal />` (`:422`) y `{children}` (`:450`) cuando
  `x-client-is-demo === '1'`; oculto con `has-[.is-workout-page]:hidden`. Pasa `demoMode` a `ClientNav`.
  **Desvío:** el ocultamiento en el ejecutor se implementó como **regla CSS** en `globals.css`
  (`main:has(.is-workout-page) [data-demo-banner] { display:none }`, precedente del propio repo con
  `main:has(.login-brand) [data-eva-seal]`), no como utilidad Tailwind sobre el banner: `:has()` mira
  DESCENDIENTES y el ejecutor es **hermano** del banner dentro de `<main>` ⇒ la utilidad habría sido un no-op
  y el banner se vería dentro del ejecutor. Montado bajo `<Suspense fallback={null}>`.
- [x] V2.6 `components/client/ClientNav.tsx:172-176` (y `perfil/_components/ProfileClient.tsx:227-232`): en sesión
  demo el botón «Cerrar sesión» se reetiqueta «Volver a mi panel» (modo `return`, mismo POST) o «Salir de la
  vista de ejemplo» (otros modos). Así el gesto obvio no quema el camino de vuelta.
- [x] V2.7 `/vive-tu-app/route.ts` (segunda pasada, orden único de SPEC §3): (1) `getUser()` → `coachUser`;
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
- [x] V2.8 `app/volver-al-panel/route.ts` (NUEVO): `POST` solo (`GET` → 405). Lee `eva_vta_return`. Ramas en
  orden: (a) `getUser().id === cookie.c` → 303 `/coach/guia` sin consumir; (b) sesión presente y no es
  `clients.is_demo` con `coach_id === cookie.c` → 303 login de alumno sin consumir; (c) sin sesión o demo del
  coach → `verifyOtp({ token_hash: cookie.t, type:'magiclink' })` **primero**; OK → 303
  `/coach/guia?desde=vive-tu-app` + `capturePostHogServerEvent('vive_tu_app_returned', { mode:'return' })`;
  vencido/usado → 303 `/c/<id>/dashboard?volver=vencido` (la sesión demo no se toca). En **todas** las ramas
  `set(name, '', { maxAge: 0, path: <el mismo path> })` para las tres cookies. Test de cada rama + «la cookie
  borrada lleva `path: '/volver-al-panel'`» + «un `GET` no consume nada».
- [x] V2.9 `(auth)/login`: renderiza `?error=vive_tu_app_volver` («Tu sesión de ejemplo terminó. Entra de nuevo a
  tu panel.»). Único consumidor de ese código.
- [x] V2.10 `c/[coach_slug]/suspended/page.tsx:87,143`: el form a `/auth/signout` se reemplaza por el `signOut`
  client-side de `ClientNav`.
- [x] V2.11 `apps/mobile/app/+native-intent.ts`: rama `segments[0] === 'coach' && segments[1] === 'guia'` →
  `'/coach/guia'` (allowlist explícita; el resto sigue devolviendo el path crudo). `tests/mobile/native-intent.test.ts`:
  caso nuevo; el de «rutas ajenas» se mantiene con otra ruta.
- [x] V2.12 `apps/mobile/lib/vive-tu-app.ts:118-129`: explainer v2 («…cuando termines, toca «Volver a la app» o
  usa el botón atrás.»); `VIVE_TU_APP_EXPLAINED_PREFIX` → `eva.vive-tu-app.explained.v2:`. **Va en el mismo OTA
  que V2.4/V2.11** (en W1 el botón aún no existe). `tests/mobile/vive-tu-app-explainer.test.ts:70-110`
  actualizado (literales + clave versionada).
- [~] V2.13 Gate W2: vitest `vive-tu-app volver-al-panel apps/web/src/app/c apps/web/src/proxy tests/mobile/native-intent
  tests/mobile/vive-tu-app-explainer tests/mobile/store-compliance` + `tsc` mobile + `pnpm typecheck` + G2 hecha.
  Documentar en la SPEC que `generateLink` comparte slot con recovery (ya está) y verificar contra GoTrue con
  un test manual: reset pedido durante el demo ⇒ `/volver-al-panel` cae en la rama «vencido».
  **Resultado real 26-08:** vitest **VERDE** (136 archivos / 1.636 tests en el scope web-auth;
  `/vive-tu-app` 15/15, `/volver-al-panel` 10/10, proxy 8/8 —antes no existía **ningún** test del proxy—,
  banner 10/10, `ClientNav` 4/4, endpoint móvil 3/3; RN 3 archivos / 36 tests), `tsc` mobile **VERDE**,
  `pnpm typecheck` **VERDE**, `check:tokens` **VERDE**, **G2 VERDE**. **Pendiente:** el **test manual contra
  GoTrue** (pedir un reset de contraseña durante el demo y confirmar que `/volver-al-panel` cae en la rama
  «vencido») — se cobra en el QA device de W5.

## W3 — El login reconoce al coach + el alta avisa (Opus ×2: `web-login`, `alta-web-rn`)

- [x] V3.1 `login.actions.ts`: tras `getUser()` (`:45-48`), `coaches.select('id').eq('id', user.id).maybeSingle()`;
  si hay fila → `signOut({ scope:'local' })` y `return { kind:'coach_account', error: <copy>, action:{ href:'/login',
  label:'Ir al login de coach' } }` (D4 = B). Los `signOut()` de `:67` y `:142` pasan a `{ scope:'local' }`.
  Comentario obsoleto `:50-51` corregido. `:160-162` usa `getClientBasePath`.
- [x] V3.2 `ClientLoginState` gana `kind?` y `action?`; `ClientLoginForm.tsx:136-140` pinta `action` como
  `next/link`. Mapa de mensajes por `error` query en el form: `vive_tu_app_expirado` → «Tu link para entrar como
  {nombre} venció o ya se usó. Vuelve a tu panel y toca Vive tu app de nuevo.» + «Ir a mi panel» (`/coach/guia`).
  `login/page.tsx` lee `searchParams.error` y lo pasa a las **dos** instancias del form (`:169-187`).
  **Desvío de copy (aceptado por el jefe):** el mensaje va **sin el nombre del demo** — «Tu link para entrar
  a tu app de ejemplo venció o ya se usó. Vuelve a tu panel y toca Vive tu app de nuevo.» Cuando `verifyOtp`
  falla, `/vive-tu-app` nunca leyó la fila del demo, así que no hay `full_name` que pasar, y resolverlo en
  una page anónima pediría `service_role` para un dato decorativo. Los mapas viven centralizados en
  `lib/auth/student-login-messages.ts` (compartido `/c` y `/t`); un `?error=` desconocido no pinta nada.
- [x] V3.3 Espejo en `t/[team_slug]/login/{page.tsx,TeamLoginForm.tsx,_actions/login.actions.ts:90-92}` (la
  page tampoco lee `searchParams`).
- [x] V3.4 `(auth)/forgot-password/page.tsx`: con `coach_slug`/`team_slug`, línea estática «¿Eres coach? Tu
  panel entra por el login de coach.» → `/login`. Sin sondeo de correos.
- [x] V3.5 `capturePostHogServerEvent({ event:'student_login_coach_account', distinctId: coach.id,
  properties:{ surface:'web', own_slug: boolean } })` en la rama nueva.
- [x] V3.6 Test NUEVO `c/[coach_slug]/login/_actions/login.actions.test.ts` (molde `(auth)/login/actions.test.ts`):
  alumno OK → redirect; credenciales malas → «Email o contraseña incorrectos.»; **coach en su propio slug →
  `kind:'coach_account'` + `signOut` local**; **coach en slug ajeno → mismo resultado** (hoy «Coach no
  encontrado»); usuario sin fila en ningún lado → «No tienes acceso…» + `signOut` local.
- [x] V3.7 `add-student-invite.ts`: `InviteDraft.coachEmail?: string | null`; `isCoachOwnEmail(value, coachEmail)`
  (trim + lower; `normalizePlatformEmail` solo para el aviso); `isReadyToInvite` devuelve `false` si es propio;
  `inviteBlockReason(draft)` → `'missing' | 'own_email'`; `selfInviteNote(noun, { showsCupo })` («¿Quieres probar
  la app tú? No hace falta agregarte: usa Vive tu app desde tu panel.» + «No gasta cupo.» solo si `showsCupo`).
  `add-student-invite.test.ts:51-70` + 3 `it` nuevos (entraron 4). **Desvío de copy menor, abierto al owner:**
  la nota dice «…No hace falta agregarte **como {alumno/paciente/atleta}**: usa Vive tu app desde tu panel.»
  — el `noun` de la firma se usa de verdad (regla 8 de la SPEC, vocabulario por persona) en vez de quedar
  como parámetro muerto. El remate «No gasta cupo.» va literal. Volver a la literal exacta del TASKS es un
  cambio de una línea. **Dos comparaciones, no una**: `isCoachOwnEmail` (trim+lower) **bloquea**;
  `isCoachOwnInbox` (`normalizePlatformEmail`) **solo avisa**, porque el servidor sí crea `coach+x@gmail.com`
  y apagar el CTA prometería un rechazo que no existe.
- [x] V3.8 `clients/page.tsx:60-71`: `supabase.auth.getUser()` al `Promise.all` → `addStudentFlow.coachEmail`
  (+ `showsCupo` = Free standalone con demo). `add-student-flow-context.ts:15-25` y `AddStudentFlowProvider.tsx:69-77`
  propagan (opcionales). `AddStudentStepper.tsx`: nota V3.7 bajo el input de correo (`:584`) **solo si
  `firstContent.demoName`**; «Ese es tu correo de coach. Para probar la app usa Vive tu app.» cuando coincide +
  CTA deshabilitado con razón propia (`:757-759` ramificado). `apps/web/src/app/coach/clients/CreateClientModal.tsx`
  (montado sin config, `AddStudentFlowProvider.tsx:80`) toma `coachEmail` de `useAddStudentFlow()`.
  `AddStudentStepper.test.tsx`: `renderStepper` con `coachEmail` + `it` «con el correo del coach avisa y no
  habilita el CTA» + `ph.capture('add_student_self_blocked')`.
- [x] V3.9 Servidor: `clients.actions.ts:156-165` y `api/mobile/coach/clients/route.ts:239-264`: antes de
  `assertPlatformEmailAvailable`, si `sanitizePlatformEmail(email) === sanitizePlatformEmail(user.email)` →
  `{ error:<copy>, code:'own_email' }` / 409 `OWN_EMAIL`. El 409 genérico **no cambia**
  (`platform-email.test.ts` sigue verde). `clients/actions.test.ts`: `it` nuevo; el orden de mocks de
  «creates client when under limit» se preserva (comparación local, sin llamadas extra). **Consecuencia
  declarada** del punto exacto donde va el chequeo (después del gate de cupo, como pide el TASKS): un coach
  con el **cupo ya lleno** que se agrega a sí mismo sigue viendo el muro de cupo, no el aviso. Para el caso
  canónico (Job Palacios: Free, 0 alumnos reales) el aviso sí gana. Copy del servidor único para web y móvil
  en `lib/auth/platform-email.ts` (`OWN_EMAIL_CLIENT_CREATE_ES`).
- [x] V3.10 RN: `guided-invite.ts` `selfInviteNote(noun, { showsCupo })` (independiente de `guidedCapNote`);
  `CreateClientModal.tsx:744-765` muestra la nota bajo «Email del alumno» solo con demo, compara con el `user`
  de la sesión cargada (no `getUser()` de red) y bloquea con mensaje propio; 409 `OWN_EMAIL` → `fieldErrors.email`
  (inline, no el banner global de `:428-430`); `captureAppEvent('add_student_self_blocked', { persona,
  surface:'rn_guided_invite' })`. Copy sin «plan»/«eva-app.cl»/precios. `tests/mobile/guided-invite.test.ts`:
  describe nuevo «nota de auto-alta»; los 5 `it` de `guidedCapNote` no cambian.
- [~] V3.11 Gate W3: vitest `apps/web/src/app/c apps/web/src/app/t apps/web/src/app/coach/clients
  apps/web/src/lib/auth/platform-email tests/mobile/guided-invite tests/mobile/store-copy tests/mobile-no-prices`
  + `tsc` mobile + `pnpm typecheck`. **Resultado real 26-08:** las dos mitades verdes por separado —
  `web-login` 5 archivos / 54 tests (V3.6: 7/7) y `alta-web-rn` 17 archivos / 173 tests; `tsc` mobile
  **VERDE**; `eslint` de los archivos tocados **VERDE**; `check:tokens` **VERDE**. `pnpm typecheck` estuvo
  **rojo por archivos ajenos** durante la wave (drift de `database.types.ts` en nutrición/org, más estados
  intermedios de otros workers) y salió **VERDE** en las corridas posteriores del mismo día, con el árbol
  quieto. **Pendiente:** la corrida consolidada de la suite completa post-merge, que registra el jefe en
  [TEST_STATUS](../../testing/TEST_STATUS.md).
- [ ] V3.12 (opcional, deuda declarada) Espejo RN: `validate-student-workspace/route.ts:61` responde 403
  `COACH_ACCOUNT` cuando el bearer es un coach, y `app/alumno/codigo` muestra el mismo mensaje con CTA a la
  pantalla de coach. **NO hecha en esta ola** (era opcional desde el día 1): el coach que entra con su cuenta
  al código de alumno en RN sigue viendo el mensaje genérico. Deuda viva.
- [x] V3.13 — **Hecha 26-08 por la hermana (FCN W1.4) en el commit `12619143`, post-merge de VTA W3, con GO
  del jefe: un solo escritor, regla cumplida.** El worker de VTA W3 (`web-login`) **no** agregó el call site
  por orden explícita y dejó marcado en el `it` del camino feliz de V3.6 dónde iba el assert; la línea y su
  test los puso FCN W1.4. (agregada 26-08 por [FCN W0.7](../flujo-coach-nuevo/TASKS.md); su aporte 1 = **call site de FCN
  W1.4**) Dentro del diff de V3.1, en `c/[coach_slug]/login/_actions/login.actions.ts`, tras resolver el
  `client` y antes de devolver el `redirectUrl` (`:160-164`): **una línea** que llama **esperada** (`await`,
  nunca promesa flotante) a `recordStudentFirstLogin(admin, client.id)` — el servicio lo crea
  [FCN W1.2](../flujo-coach-nuevo/TASKS.md) (`student-login-signal.service.ts`, nunca lanza). **Regla de no
  colisión (FCN W1.4):** la línea la agrega **el worker de VTA W3 dentro de su diff** si FCN W1.2 ya está
  mergeada; si no, V3.13 queda pendiente y FCN W1.4 la agrega tras el merge de VTA W3 — **nunca los dos**.
  Gate: el test de V3.6 suma el assert «login de alumno llama `recordStudentFirstLogin` una vez».

## W4 — Panel admin sin alumno de ejemplo (Opus ×1: `db-admin`) — absorbe W8.1.9

- [x] V4.1 Snapshot LIVE: `pg_get_functiondef('public.get_admin_coaches_paginated'::regproc)`, `pg_proc.proacl`;
  SQL de reversa (el cuerpo vigente) guardado en el reporte de la tarea.
- [x] V4.2 Migración `supabase/migrations/<ts>_admin_coaches_excluye_demo.sql` con el cuerpo del informe
  `alta-cupo-admin` §9.3: firma idéntica, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO
  'public','auth'`, `LEFT JOIN public.clients cl ON cl.coach_id = c.id AND cl.is_demo IS NOT TRUE`, `FILTER`
  explícitos, `active_client_count` = `cl.is_archived = false AND cl.is_demo IS NOT TRUE` (D3 = A),
  `utilization_pct` sobre el conteo limpio, `COMMENT ON FUNCTION`. **Prohibido `DROP FUNCTION`** y **prohibido
  tocar `RETURNS TABLE`.** **Aterrizó en cuatro migraciones, no una** (todas en LIVE):
  `20260826010542_admin_coaches_paginated_excludes_demo_archived.sql` (el `LEFT JOIN` limpio),
  `20260826011239_admin_coaches_paginated_demo_client_count.sql` (columna `demo_client_count` — este sí exigió
  `DROP FUNCTION` + `CREATE`, porque cambia el `RETURNS TABLE`, con re-hardening de ACL a `service_role`),
  `20260826022428_admin_coaches_paginated_sort_by_activity.sql` (sort por actividad) y
  `20260826042748_admin_coaches_paginated_active_means_cupo.sql` (`active_client_count` deja de filtrar
  `is_active` ⇒ el listado habla de cupo; opción **A** del hallazgo H3 del worker).
- [x] V4.3 Validación sin persistir: `BEGIN; <CREATE OR REPLACE>; EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM
  get_admin_coaches_paginated(NULL,NULL,'free',NULL,'created_at','desc',50,0); SELECT … WHERE id =
  'e83314d8-…'; ROLLBACK;` + comparación de plan con la vigente. Aplicar con `apply_migration` (versión real ⇒
  renombrar el archivo) → `get_advisors` security + performance.
- [x] V4.4 `coach-detail.queries.ts:142-147`: `.eq('is_demo', false)` en ambos; `activeClientCountRes` pasa a
  `.eq('is_archived', false)` (D3). `admin/(panel)/sistema/_data/sistema.queries.ts:91`: KPI «Alumnos» con
  `is_demo = false` e `is_archived = false`. `coaches/[id]/page.tsx:153-155` sin cambio.
- [x] V4.5 `CoachCommandPanel.tsx:740`: «…incluidos {client_count} alumnos reales y su alumno de ejemplo.
  Irreversible.» **Se conservó la pluralización que ya tenía el código** («1 alumno real» / «3 alumnos
  reales»): el caso canónico de esta spec es justamente `client_count = 1` y «1 alumnos reales» quedaba mal.
  **Extendida al confirm gemelo** `coaches/[id]/_components/CoachDetailActions.tsx` (hallazgo H2 del worker,
  ejecutado en su segunda pasada): ese `clientCount` ahora excluye el demo, así que sin el cambio el confirm
  de la ficha sub-declaraba el alcance del borrado. Los `blastRadius` de suspender/expirar no se tocaron
  (ahí el conteo sin demo es el correcto).
- [x] V4.6 Test NUEVO `admin/(panel)/dashboard/_data/admin.queries.test.ts`: `getAllCoachesPaginated` con `rpc`
  mockeado (contrato de columnas) — el `as any` de `:205` deja el typecheck sin red.
- [x] V4.7 `database.types.ts`: **sin cambios** (firma intacta). Anotarlo en el commit. **Matiz reportado
  (H1):** el archivo ya venía desfasado de la noche del 25-08 — la migración `…011239` sumó
  `demo_client_count` al `RETURNS TABLE` y los tipos nunca se regeneraron; el typecheck no lo nota porque el
  llamador usa `(admin.rpc as any)`. Justo el agujero que V4.6 vino a tapar. **Regenerar `database.types.ts`
  sigue siendo deuda abierta** (prioridad 5 de [CURRENT](../../status/CURRENT.md)), no de esta ola.
- [~] V4.8 Gate W4: vitest `apps/web/src/app/admin apps/web/src/app/api/cron/cap-nudge` + QA visual
  `/admin/coaches` con `jpl` (Free + demo + 1 real) ⇒ `1/1`; un Free solo con demo ⇒ `0/1`; Sistema sin demos.
  **Resultado real 26-08:** vitest **VERDE** — 9 archivos / **67 tests**, con `admin.queries.test.ts` (nuevo,
  10 asserts) confirmado corriendo; `pnpm typecheck` **VERDE**. **Pendiente: la QA visual del owner**
  (necesita sesión de admin en PROD). Números de referencia ya medidos en LIVE para esa QA: **84** alumnos
  reales no archivados en toda la plataforma, **14** demos, **13** archivados — y Sistema, que antes mostraba
  **111**, ahora debe mostrar 84 (V4.4b cerró un drift de 27 alumnos entre el dashboard y Sistema).

## W5 — QA device + cierre (jefe + owner)

- [ ] V5.1 Matriz de QA del PLAN con evidencia (capturas/video), en especial **Android con la app instalada**
  (web móvil y RN), «atrás» con sesión demo, «Cerrar sesión» del nav y `/volver-al-panel` vencido.
- [~] V5.2 **OTA primero** (`mobile-ota.yml`, rama con master mergeado; explainer v2 + `AppState` + native-intent),
  **deploy web después**; `VIVE_TU_APP_ENTERED_CUTOVER` = timestamp del deploy. Sin cambios nativos ⇒ no hay binario.
  **CUTOVERs fijados el 26-08 (los tres al MISMO instante, `2026-08-26T06:00:00Z`):**
  · `VIVE_TU_APP_ENTERED_CUTOVER` = `'2026-08-26T06:00:00.000Z'` en
  `apps/web/src/services/onboarding/onboarding-v2.queries.ts:275` — antes del corte sigue tildando el
  `vive_tu_app_opened` histórico; desde el corte solo tilda `vive_tu_app_entered`.
  · `FIRST_LOGIN_SIGNAL_CUTOVER` **web** = `'2026-08-26T06:00:00Z'` en
  `apps/web/src/app/coach/clients/_lib/client-status.ts:28`.
  · `FIRST_LOGIN_SIGNAL_CUTOVER` **RN** = `'2026-08-26T06:00:00Z'` en
  `apps/mobile/components/coach/directory/directory-shared.ts:47` (commit `e7ed1de9`) — la constante está
  duplicada a propósito (RN no importa de `apps/web`) y **las dos tienen que moverse juntas**.
  **Pendiente:** la evidencia del OTA (grupos de `mobile-ota.yml` a los runtimes 1.1.1 y 1.1.2) y del deploy
  web, con el orden respetado. Ojo con la tensión declarada por el worker `rn`: el explainer v2 promete el
  botón «Volver a la app» que solo existe con V2.4 desplegada, así que la OTA no puede ir **muy** antes.
- [~] V5.3 `docs/status/CURRENT.md` (sub-viñeta 0 + `last_verified`), `docs/status/MOBILE_PARITY.md` (blockquote
  fechado «explainer v2, `AppState`, `eva://coach/guia`; **Requiere OTA + QA device**» + `last_verified "fecha @ sha"`),
  `docs/testing/TEST_STATUS.md` (fila consolidada de la corrida completa). **Hechos el 26-08: `CURRENT.md`
  (sub-viñeta 0 corregida + `last_verified`) y `MOBILE_PARITY.md` (blockquote de la ola + `last_verified
  "2026-08-26 @ e7ed1de9"`).** **Pendiente:** `docs/testing/TEST_STATUS.md`, que escribe el jefe con el
  resultado real de la suite completa post-merge.
- [ ] V5.4 Insight PostHog «Paso 2: pidió → entró → volvió» por `device` y `mode` + `student_login_coach_account`
  + `add_student_self_blocked`. Deuda que se cobra de paso si hay margen: W8.5.2 (espejo a PostHog desde
  `recordOnboardingEvent`). **La deuda W8.5.2 ya estaba cerrada** (el espejo vive en `recordOnboardingEvent`)
  y el 26-08 se completó: los dos **insert directos** que quedaban fuera del espejo
  (`api/coach/onboarding-events` y `api/mobile/coach/dashboard`) ahora capturan a PostHog por
  `lib/posthog/onboarding-event-mirror.ts`, awaiteado, solo tras insert OK y no-duplicado (`8dffbbff`).
  **Queda el insight en sí**, que se arma en PostHog, no en el repo.

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
