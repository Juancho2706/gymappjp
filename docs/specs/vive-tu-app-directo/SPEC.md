---
status: done
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# SPEC — «Vive tu app» directo: entrar con un toque, volver con un toque

> **CERRADA — 2026-08-26.** Implementada completa en la ola del 25→26-08 (commits `c251a49c`,
> `8d435570`, `fd979428`, `8dffbbff`, `e7ed1de9` + tandas de la sesión hermana; ver
> [TASKS](TASKS.md) con evidencia por tarea). OTAs (runtimes 1.1.2 y port 1.1.1) ANTES del deploy
> web, cutovers fijados a `2026-08-26T06:00:00Z`. **QA device del owner consumido el 26-08:
> matriz completa aprobada** (entrar/volver con un toque en desktop y celu, chip «Entró hace X»
> en web y RN, auto-alta bloqueada, `/admin/coaches` con activos=cupo). Observación cosmética
> derivada: el alumno demo de rehab mostraba ejercicios sin video — fix en curso fuera de esta
> spec (blueprint demo + resolver prefiere media). Deudas post-cierre anotadas en TASKS: V2.13
> (test manual GoTrue recovery-vs-vta) y V5.4 (insight PostHog).

**Enmienda a [coach-onboarding-v2 §5 y §6](../coach-onboarding-v2/SPEC.md); absorbió las tareas abiertas
W8.1.2 (parcial), W8.1.9 y W8.6.2 de [su TASKS](../coach-onboarding-v2/TASKS.md). Evidencia de base:
auditoría del caso Job Palacios (23-08, artifact «Vive tu app en móvil» `3b1616d9`) + 6 informes de
lectura del código. Revisada por panel adversarial (4 lentes) el 23-08.**

## Origen

El 23-08 a la 01:21 un coach llegó desde el ad de Meta (`cl_pros_leads_web_2608`, Instagram, Android/Chrome),
se registró, eligió persona **nutrición**, subió logo y **publicó un plan** para su alumno de ejemplo en
5 minutos. Después tocó «Vive tu app» y el flujo lo perdió: el sheet le pidió escanear un QR **con el
celular que ya tenía en la mano**, lo cerró a los 4 s, se agregó a sí mismo como alumno con un segundo
correo (gastó su único cupo Free), intentó entrar al login de alumno con su cuenta de coach siete veces,
pidió tres resets de contraseña, miró pricing y se fue a la 01:37. Nunca vio su app de alumno.

No es un caso aislado. De los 7 coaches reales con alumno de ejemplo sembrado desde el 20-08:

| Dato | Valor |
|---|---|
| Abrieron el sheet «Vive tu app» (se emitió magic link) | 6 / 7 |
| Entraron de verdad (`auth.users.last_sign_in_at` del demo) | **2** — ambos en < 6 s ⇒ desktop, «Abrir aquí» |
| Se quedaron en el QR | **4** (Viviana, Maxi, Juliette, Job) |
| Guía marca `vive_tu_app ✅` | **6 / 6** — el paso se tilda al **emitir el link**, no al entrar |

El funnel reporta 100 % de un paso que en realidad convierte 33 %. Nota del panel: parte de esos 4 pudo
haber rebotado a la app por App Links (ver Riesgos); el diagnóstico de producto no cambia, la comprobación
barata sí se exige antes de W1.

## Problema: siete callejones sin salida, verificados en el código

| # | Callejón | Dónde está hoy | Qué ve el coach |
|---|---|---|---|
| 1 | El sheet trata al móvil como caso secundario | `ViveTuAppButton.tsx:155-194`; `isDesktop` solo elige el lado del sheet | «Escanéalo con tu celular» · «Si lo abres aquí, tu panel te pedirá iniciar sesión de nuevo. Por eso el celular es mejor.» |
| 2 | El paso se tilda al pedir el link | `vive-tu-app.service.ts:104-109` escribe `vive_tu_app_opened` al generar; `resolveViveTuAppOpened` lo lee; `GuideScreen.tsx:244/296` además tilda en `onOpened` | ✅ sin haber entrado (4 de 6) |
| 3 | Un coach en el login de alumno es un extraño | `c/[coach_slug]/login/_actions/login.actions.ts:141-144` (`signOut` + mensaje); con el slug de OTRO coach cae antes en `:66-69` | «No tienes acceso a esta plataforma.» / «Coach no encontrado.» |
| 4 | Link vencido cae en el vacío | `/vive-tu-app/route.ts:30` manda `?error=vive_tu_app_expirado`; `login/page.tsx` no lee `searchParams` | Login pelado, sin explicación |
| 5 | Entrar al demo en web desloguea al coach y no hay vuelta | `verifyOtp` pisa `sb-*-auth-token` (un solo `createClient`, sin `cookieOptions`); documentado en `vive-tu-app.actions.ts:16-19` | Vuelve a su panel y está deslogueado |
| 6 | **Con la sesión del demo, «atrás» lleva al alta de coach** | `proxy.ts:472-477`: cualquier `/coach/*` sin fila `coaches` redirige a `/coach/onboarding/complete`, cuyo form inserta un `coaches` **sobre el usuario demo** | Un formulario de registro de coach en medio del flujo; hoy raro (desktop, pestaña nueva), con entrada directa en móvil «atrás» es el gesto #1 |
| 7 | Nada le dice que no necesita agregarse | `AddStudentStepper.tsx` no nombra al demo ni a «Vive tu app»; el 409 de su propio correo es opaco (`platform-email.ts:66-67`) y el gate de cupo corre **antes** (`clients.actions.ts:110-152`) | Gasta el cupo; después `cap-nudge` le escribe «Alcanzaste el límite de 1 alumno» |

Más tres grietas menores que se arreglan de paso: `revalidatePath('/coach/dashboard')` apunta al dashboard y
la guía vive en `/coach/guia` (`vive-tu-app.actions.ts:40`, `onboarding-guide.actions.ts:121`); el botón
«Cerrar sesión» de `/c/<slug>/suspended` hace POST a `/auth/signout`, ruta que no existe; y los dos
`signOut()` de `login.actions.ts:67,142` son de alcance global (deslogean al alumno en todos sus
dispositivos por entrar al slug equivocado).

## Evidencia externa que guía el diseño

| Plataforma | Cómo lo resuelve | Lección |
|---|---|---|
| Trainerize | «Open» en el perfil del alumno muestra su dashboard en la app; demo «Timmy Explorer» solo web; agregarse a sí mismo **gasta cupo** y exige segundo correo | EVA ya está mejor (demo real, sin cupo). Falta el último metro. |
| TrueCoach | «Switch to Client» en el menú de perfil, un toque; permite el alumno-prueba con el **mismo correo** | Cambiar de rol es un toque, no una hoja con QR. |
| Everfit | «Invite Myself» → correo con magic link que abre la app del alumno ya logueada, con datos de muestra | El link llega por un canal que vive en el teléfono. |
| Thinkific / Teachable | «Preview as student» en otra pestaña; cerrar para volver | Volver es trivial porque no pisan la sesión. Nosotros sí ⇒ necesitamos «volver» explícito. |
| Patrón impersonar (GitLab, Adobe LM) | Banner persistente «Estás viendo como X» + «Stop impersonating» sin re-login | Estado visible + salida de un toque. |

Las cinco cosas que comparten: un toque en el dispositivo donde estás · el sistema sabe quién eres · probar
no cuesta cupo · estado visible + salida clara · el paso cuenta cuando pasó.

## Diseño

Mismo mecanismo de fondo (magic link de un solo uso del demo, sesión del demo en cookies, cinturón
`clients.is_demo` que solo escribe `service_role`). Cambian la superficie y cuatro contratos.

### 1. Entrar directo en móvil (web)

- `ViveTuAppButton`: si `!isDesktop` (`(min-width: 768px)` ya existe), un toque = `generate()` **una sola
  vez** + `window.location.assign(url)` en el mismo gesto. Sin sheet, sin QR, sin `window.open`.
- Desktop conserva el sheet con QR primero (ahí sí es correcto: el teléfono no tiene la sesión del panel).
  Cambian dos textos: el detalle bajo el QR («Entras directo, sin contraseña, como {nombre}») y el aviso de
  «Abrir en este navegador»: **«Se abre en otra pestaña. Cuando termines, vuelves a tu panel con un toque.»**
- `autoOpen` (cierres guiados del builder y de la primera pauta) **no navega solo en móvil**: muestra el
  CTA «Entrar como {nombre}» y espera el gesto (hay borrador local en el builder).
- Copy de `DemoStudentCard` neutro de dispositivo: «Entra como {nombre}: es tu app, con tu marca.»
- **Sin demo** (persona `other`, los 48 coaches con persona NULL, quien tocó «Borrar ejemplo»): el botón
  del paso 2 no es un toast. Si la persona admite demo → botón «Volver a sembrar» en la tarjeta (misma
  acción que `Opciones › Mi panel`); si no (`other`) → botón deshabilitado con explicación, paridad con RN
  (`guia.tsx:752-756`). Lo que pasa con `other` a largo plazo sigue siendo D10 de onboarding-v2.
- **Con el paso 2 tildado, el acceso no desaparece**: `GuideStepCard` pinta la acción de `vive_tu_app`
  también en estado `done` («Verla otra vez»); hoy `(href || children) && !done` la esconde.
- Rate limit en `openViveTuAppAction` (hoy no hay): en móvil «atrás + volver a tocar» multiplica magic links.
- **Volver con «atrás» en el mismo navegador** (web): la guía se refresca sola al volver a primer plano
  (`pageshow` / `visibilitychange` → `router.refresh()`), para que el tilde real aparezca sin recargar a mano.

### 2. El paso cuenta cuando el coach entró (web + RN)

- `GET /vive-tu-app` escribe, tras `verifyOtp` OK y cinturón `is_demo`, un evento **nuevo**
  `vive_tu_app_entered` en `coach_onboarding_events` con `coach_id = clients.coach_id` (el select del
  cinturón pasa a `id, is_demo, coach_id, full_name`) y `metadata: { surface: 'web'|'rn', device:
  'mobile'|'desktop', mode: 'return'|'rn'|'remote', identifier_kind }`. Nunca el token ni el correo del demo.
- `vive_tu_app_opened` **no se renombra ni se mueve** (65 usuarios en runtime ya lo emitieron con el
  significado viejo). Pasa a significar «pidió el link» y gana `device` en su metadata.
- **`vive_tu_app_entered` lo escribe solo el servidor.** No entra en el `z.enum` de
  `api/coach/onboarding-events` ni en `MOBILE_EVENT_TYPES` del endpoint móvil: si un cliente lo postea, 400.
  Abrirlo permitiría auto-tildarse el paso por bearer, y el endpoint móvil no deduplica.
- `resolveViveTuAppOpened` (señal viva del paso 2): existe `vive_tu_app_entered` con `created_at >=
  persona_set_at`, **o** existe `vive_tu_app_opened` con `created_at < VIVE_TU_APP_ENTERED_CUTOVER`
  (constante ISO = timestamp del deploy web que empieza a escribir `entered`) y `>= persona_set_at`.
  Grandfather: los 6 coaches con tilde viejo no lo pierden. La memoria por persona
  (`onboarding_guide.progress[persona].vive_tu_app`) sigue mandando cuando está en `true`. PostgREST lo
  expresa con `.or(...)`, no con `.in()`; el `fakeDb` de los tests se reescribe para entenderlo.
- Web: `GuideScreen.tsx:244/296` **deja de** llamar `markStepCompleted('vive_tu_app')` en `onOpened`. El
  tilde llega por la señal del servidor al volver a `/coach/guia`. No se escribe `onboarding_guide` desde el
  servidor (ya hay 4 escritores read-modify-write sin lock, W8.1.11).
- RN: `guia.tsx:321-323` recarga **antes** de que el navegador verifique ⇒ listener `AppState`
  (`background → active`, con guard `inFlight`; lógica pura `shouldReloadOnAppState(prev, next)` en `lib/`
  con test en `tests/mobile/`) que hace `load()` al volver del navegador, **solo en `guia.tsx`**. El builder
  no tiene `load()` (usa un snapshot publicado por otra pantalla): queda como hoy, sin feedback inmediato —
  regresión menor declarada.
- **La falla del CHECK es silenciosa** (`recordOnboardingEvent` traga el error con `console.warn`): la
  migración se aplica en LIVE **antes** del deploy y se verifica con una consulta post-deploy
  (`select count(*) … where event_type = 'vive_tu_app_entered'` > 0 tras el primer ingreso real).
- **Secuencia de rollout**: OTA de RN (explainer v2 + `AppState`) **antes** del deploy web que fija el
  corte. Con el bundle viejo, el `opened` posterior al corte no tilda y no hay listener: RN quedaría peor
  que hoy durante el rollout si se invierte el orden.

### 3. Volver a mi panel (web) / Volver a la app (RN)

Banner en el árbol del alumno **solo cuando la sesión es el demo**:

> **Estás viendo tu app como {Nombre}.** Así se ve tu app para tus {alumnos}. · **[Volver a mi panel]**

- **Datos a costo cero**: el proxy ya lee `clients` en cada request no-prefetch de `/c/*`
  (`proxy.ts:1101-1104`); se suman `is_demo, full_name` al select y tres headers, **seteados siempre** (vacíos
  cuando no aplica; `proxy.ts:1030` copia los headers del request y un header condicional es spoofable):
  `x-client-is-demo`, `x-client-display-name` (pasa por `encodeBrandHeaderValue` al escribir y por
  `decodeBrandHeaderValue` al leer, o «María Pérez» sale como `Mar%C3%ADa%20P%C3%A9rez`) y `x-vta-mode`.
  El layout `/c/[coach_slug]/layout.tsx` monta el banner entre `<AppSeal />` (`:422`) y `{children}`
  (`:450`). `DemoViewerBanner` es server component con un hijo `'use client'` solo para el modo `remote`.
  Oculto en el ejecutor de rutina (`has-[.is-workout-page]`) y en `/login` (el proxy no lee `clients` ahí).
- **Tres modos**, con precedencia **`rn` > `return` > `remote`**, expuestos como `x-vta-mode`:

  | Modo | Cuándo | Botón | Qué hace |
  |---|---|---|---|
  | `rn` | La URL trae `src=rn` (la emite `/api/mobile/coach/vive-tu-app`) | «Volver a la app» | Android: `intent://coach/guia#Intent;scheme=eva;package=cl.evaapp.eva;S.browser_fallback_url=…;end` (un `<a href="eva://">` pelado da `ERR_UNKNOWN_URL_SCHEME`); iOS: `eva://coach/guia` con gesto. `+native-intent.ts` gana la rama `coach/guia`. Si `from=builder`, **sin** deep link (resetearía el stack con borrador en pantalla): solo «Vuelve a la app con el botón atrás». |
  | `return` | Entró desde el **mismo navegador** donde había sesión de coach dueña del demo (móvil directo, desktop «abrir aquí») | «Volver a mi panel» | `POST /volver-al-panel` → sesión del coach → `/coach/guia?desde=vive-tu-app` |
  | `remote` | Ninguna de las anteriores (QR desde otro dispositivo, cookie vencida, `generateLink` falló) | «Salir de la vista de ejemplo» | `signOut` local + `/c/<id>/login`; detalle: «Tu panel sigue abierto donde lo dejaste.» |

- **Orden exacto de `GET /vive-tu-app`** (único contrato; el demo no se conoce hasta verificar y la sesión
  del coach desaparece al verificar): (1) `supabase.auth.getUser()` y guardar `coachUser` si existe, todavía
  con las cookies del coach; (2) `verifyOtp` del demo; (3) cinturón `is_demo` leyendo `coach_id`; (4) si
  `coachUser?.id === client.coach_id` → `admin.auth.admin.generateLink({ type:'magiclink', email:
  coachUser.email })` **best-effort** (`try/catch`; si GoTrue falla, modo `remote`, nunca se rompe el
  redirect); (5) cookies sobre el `NextResponse.redirect`: `eva_vta_return` = `{ t: hashed_token, c:
  coach_id }` (httpOnly, Secure en prod, SameSite=Lax, **path `/volver-al-panel`**, `maxAge` 3600 =
  `otp_expiry`) y `eva_vta_mode` (httpOnly, path `/`, **mismo `maxAge` 3600**; ausencia ⇒ `remote`);
  (6) evento `entered` + PostHog; (7) redirect a `/c/<id>/dashboard`. Errores de verificación →
  `/c/<id>/login?error=vive_tu_app_expirado`.
- **`POST /volver-al-panel`** (solo POST; `GET` → 405): lee `eva_vta_return`. Ramas, en orden:
  (a) si hay sesión y `user.id === cookie.c` (el coach ya volvió por otra vía, dos pestañas) → 303 a
  `/coach/guia` **sin consumir** el token, cookies borradas; (b) si hay sesión y no es un `clients.is_demo`
  con `coach_id === cookie.c` (alumno real en el mismo navegador) → 303 al login de alumno sin consumir,
  cookies borradas; (c) si no hay sesión (el coach tocó «Cerrar sesión» del nav) **o** es el demo del coach →
  `verifyOtp({ token_hash: cookie.t, type:'magiclink' })` **primero** (escribe la sesión del coach sobre la
  del demo) → 303 a `/coach/guia?desde=vive-tu-app`; si el token venció o ya se usó → **no** se toca la
  sesión del demo: 303 a `/c/<id>/dashboard?volver=vencido` y el banner pasa a modo `remote` con el detalle
  «Tu acceso de vuelta venció. Entra a tu panel por el login de coach.» + link a `/login`. En **todas** las
  ramas se borran las dos cookies **repitiendo su `path`** (un `set(name, '', { maxAge: 0 })` sin path borra
  otra cookie). Rate limit `rateLimitAuth` en el proxy; un 429 responde 303 a `/login?error=vive_tu_app_volver`,
  no JSON (viene de un `<form>`).
- **El proxy no toca estas dos rutas**: early-return `NextResponse.next({ request })` para `/vive-tu-app` y
  `/volver-al-panel` después del bloque de rate limit y **antes** de crear el `createServerClient` (patrón
  `/api/payments/webhook`, `proxy.ts:115`). Sin eso, el `setAll` del proxy reconstruye la respuesta con la
  sesión **refrescada del demo** y Next la mergea con la del coach que escribe el handler — mismo nombre de
  cookie, gana la última. Ese bug ya existe hoy en `/vive-tu-app` de forma intermitente.
- **«Atrás» con sesión demo** (callejón 6): rama nueva en el proxy, antes del `!coach` de `:472-477`: si la
  sesión es un `clients` (con o sin `is_demo`) y pide `/coach/*`, redirigir a `/c/<id>/dashboard`, nunca a
  `/coach/onboarding/complete`. Cinturón adicional en `complete.actions.ts`: rechazar si el usuario tiene
  fila en `clients`.
- **«Cerrar sesión» del nav del alumno en sesión demo** se reetiqueta a «Volver a mi panel» (mismo POST) en
  modo `return`, y a «Salir de la vista de ejemplo» en los otros dos; con `x-client-is-demo` el layout ya
  lo sabe y `ClientNav` recibe la prop. Así el gesto obvio no quema el camino de vuelta.
- **Cookies host-only, sin dominio**: `AUTH_COOKIE_DOMAIN` queda sin setear (decisión previa de white-label
  v2; prohibido «arreglar» con dominio). Gate de entrada de W2: confirmar en Vercel/Cloudflare que
  `eva-app.cl → www.eva-app.cl` es 308 y que el panel vive en `www` (`studentAppOrigin()` fuerza `www`; si el
  panel del coach quedara en el apex, `getUser()` del paso 1 daría `null` y el modo `return` no
  dispararía nunca, con todos los tests en verde).
- Seguridad, explícita: el `hashed_token` del coach en cookie **es una credencial completa** durante ≤ 1 h.
  Por eso: httpOnly + Secure + SameSite=Lax + path restringido + un solo uso + borrado en toda rama +
  nunca en logs ni en props de PostHog (test gemelo de «ni el mensaje ni el log exponen el token»).
  `generateLink` comparte el slot de recovery de GoTrue **en ambas direcciones**: un reset que el coach pida
  desde otro dispositivo mientras está dentro mata el token de retorno, y dos toques de «Vive tu app»
  invalidan el retorno de la primera pestaña. El fallback de la rama (c) es el camino esperado, no la excepción.
- Por qué esta mecánica y no otra (ver «Decisiones»): reutiliza exactamente el camino que `/vive-tu-app` ya
  usa y prueba; no agrega un segundo namespace de cookies (`cookieOptions.name` existe en `@supabase/ssr`
  0.9 pero obliga a bifurcar ~40 archivos de `app/c/**`, el proxy y el cliente browser).
- `/c/<slug>/suspended`: el form «Cerrar sesión» deja de apuntar a `/auth/signout` (no existe) y usa el
  mismo `signOut` client-side que `ClientNav`.

### 4. El login de alumno reconoce al coach

- En `clientLoginAction`, justo después de `getUser()`: `coaches.select('id').eq('id', user.id).maybeSingle()`
  (pasa por `coaches_select_own`, sin service_role — patrón de `(auth)/login/_actions/login.actions.ts:73-77`).
  Si es coach: `signOut({ scope: 'local' })` y devuelve `{ kind: 'coach_account', action: { href: '/login',
  label: 'Ir al login de coach' } }`. **No** se conserva la sesión (decisión D4 = B): el login de alumno no
  tiene fail-counter, turnstile ni `jitter()` (los cuatro viven en el login de coach), y dejarle abrir una
  sesión de coach lo convertiría en un segundo login de coach sin defensas.
- `ClientLoginForm` pinta el mensaje con link (`ClientLoginState` gana `kind` y `action`):

  > Esta es tu cuenta de coach, no una cuenta de {alumno}. Para ver tu app como la ven tus {alumnos},
  > entra a tu panel y toca **Vive tu app**. → **Ir al login de coach**

- Los otros dos `signOut()` del archivo pasan a `{ scope: 'local' }`.
- Espejo en `/t/[team_slug]/login` (`TeamLoginState` tiene el mismo hueco; su `page.tsx` tampoco lee
  `searchParams`).
- `login/page.tsx` lee `searchParams.error` y lo pasa al form (las dos instancias, móvil y desktop):
  `vive_tu_app_expirado` → «Tu link para entrar como {nombre} venció o ya se usó. Vuelve a tu panel y toca
  Vive tu app de nuevo.» + «Ir a mi panel». El error `vive_tu_app_volver` se renderiza solo en el login de
  coach (`/login`), que es el único que lo recibe.
- `/forgot-password` con `coach_slug`: una línea estática, sin oráculo de correos: «¿Eres coach? Tu panel
  entra por el login de coach.» → `/login`.
- Evento PostHog server `student_login_coach_account` (`distinctId` = id del coach, sin correo).
- **Alcance v1 = web.** En la app, el coach que escanea su propio código cae en
  `validate-student-workspace/route.ts:61` con el mismo mensaje mudo: espejo declarado como deuda (403
  `COACH_ACCOUNT` + CTA), opcional en W3.

### 5. El alta de alumno avisa

- Web, paso 1 «Datos mínimos», **cuando hay alumno de ejemplo** (`demoClientId != null`):

  > ¿Quieres probar la app tú? No hace falta agregarte: usa **Vive tu app** desde tu panel.

  y, solo en Free standalone con demo, el remate «No gasta cupo.» (fuera de Free sobra; para coaches
  administrados el endpoint del link responde 403 y la frase mentiría).
- Si el correo tipeado es el del coach (comparación local `trim().toLowerCase()`; la variante
  `normalizePlatformEmail` solo para avisar), mensaje inline y CTA deshabilitado con razón propia (hoy
  `isReadyToInvite` gobierna también el texto «Falta el nombre, el correo o la confirmación de edad»: se
  ramifica). El correo del coach llega por `supabase.auth.getUser()` en `clients/page.tsx` (la tabla
  `coaches` no tiene email) → `AddStudentFlowConfig.coachEmail` → `AddStudentStepper`; el modal de la 2ª alta
  (`apps/web/src/app/coach/clients/CreateClientModal.tsx`, montado sin config) lo toma del contexto
  `useAddStudentFlow`.
- Servidor (web action y `api/mobile/coach/clients`): cuando `sanitizePlatformEmail(email) ===
  sanitizePlatformEmail(user.email)` se devuelve `code: 'own_email'` con copy específico; el 409 genérico se
  mantiene para cualquier otro correo (anti-enumeración, `platform-email.ts:61-65`). En RN el 409
  `OWN_EMAIL` se mapea a `fieldErrors.email` (inline), no al banner global.
- RN: `CreateClientModal` recibe la misma nota (helper nuevo en `guided-invite.ts`, independiente de
  `guidedCapNote`, que solo existe en Free + demo) y compara con el `user` de la sesión ya cargada (no un
  `getUser()` de red). Copy sin «plan», sin «eva-app.cl» (guards `store-copy` / `no-prices`), sujeto por
  persona (`personaNoun`).
- Evento cliente `add_student_self_blocked { persona, surface }` en web y RN.
- Lo que **no** se puede detectar: el coach que se agrega con un gmail personal distinto. Solo lo cubre la
  nota preventiva del paso 1.

### 6. Panel admin sin alumno de ejemplo (absorbe W8.1.9)

- Migración aditiva `CREATE OR REPLACE FUNCTION public.get_admin_coaches_paginated(...)` con **firma
  idéntica byte a byte** (`RETURNS TABLE` no se puede cambiar con REPLACE; `DROP` re-abriría el `GRANT` a
  `anon` que revocó `20260608120150`), conservando `LANGUAGE sql STABLE SECURITY DEFINER SET search_path
  TO 'public','auth'`. El filtro va en el **`ON` del `LEFT JOIN clients`** (`AND cl.is_demo IS NOT TRUE`),
  no en el `WHERE` (mataría a los coaches sin alumnos), más `FILTER` explícitos como cinturón. Limpia
  `client_count`, `active_client_count`, `utilization_pct` y `last_activity_at` de golpe.
- `coach-detail.queries.ts:142-147`: `.eq('is_demo', false)` en los dos conteos.
  `admin/(panel)/sistema/_data/sistema.queries.ts:91` (KPI «Alumnos» de Sistema) cuenta `clients` sin
  `is_demo` ni `is_archived`: entra en la misma tanda.
- `active_client_count` pasa a significar lo mismo que el cupo del coach: `is_archived = false AND
  is_demo IS NOT TRUE` (hoy usa `is_active`, que archivar no toca; el «activos» del admin incluía
  archivados). Cambio de semántica visible: se declara (decisión D3).
- `CoachCommandPanel.tsx:740` (blast radius del borrado) dice «alumnos reales» y aclara que el alumno de
  ejemplo también se borra.
- Fuera de alcance declarado: `/admin/clients` sigue listando demos (se etiquetan, no se ocultan) y
  `getAllClients`.

## Reglas de producto

1. **Un toque para entrar, un toque para volver.** En móvil nunca un QR para el mismo dispositivo.
2. **El paso 2 se tilda cuando el coach entró**, nunca cuando pidió el link ni cuando abrió una hoja. Y solo
   lo escribe el servidor.
3. **En web, nadie que tenga cuenta es un extraño**: un coach en el login de alumno recibe una explicación
   y una salida, no un error. (RN: deuda declarada.)
4. **Probar no gasta cupo.** El alumno de ejemplo es el camino; el alta avisa antes de que el coach se
   agregue.
5. **El token del coach nunca sale del servidor más que en una cookie httpOnly de un solo uso.** Nunca en
   logs, nunca en analítica, nunca en la URL.
6. **Con la sesión del demo, el árbol del coach no existe**: `/coach/*` devuelve al coach a su app de
   alumno con el banner, jamás a un formulario de alta.
7. **Cero venta dentro del flujo**: el banner y los avisos no nombran plan, precio ni tier (regla de
   tiendas, `apps/mobile/AGENTS.md`; el banner es web, pero la app manda al coach exactamente ahí).
8. **Vocabulario por persona** (`personaNoun`): nada de «alumno» hardcodeado en copy nuevo.

## Experiencia por superficie

| Pieza | Web móvil | Web desktop | RN (coach) |
|---|---|---|---|
| Entrar | Un toque, misma pestaña | Sheet: QR primero, «Abrir en este navegador» (otra pestaña) sin miedo | Explainer v2 + navegador del sistema (igual que hoy) |
| Estado | Banner «Estás viendo tu app como…» | Banner | Banner (en el navegador) |
| Volver | «Volver a mi panel» → sesión coach restaurada → `/coach/guia` | ídem, o «Salir de la vista de ejemplo» si vino por QR | «Volver a la app» (`intent://` / `eva://`) → `/coach/guia`; desde el builder, botón atrás |
| «Atrás» del navegador | La guía se refresca sola (`pageshow`); `/coach/*` con sesión demo vuelve a `/c/…` con banner | ídem | La guía recarga por `AppState` |
| Tilde del paso 2 | Al volver a `/coach/guia` | ídem | Al volver a la app (listener) |
| Volver a entrar | «Verla otra vez» sigue en la guía y en la tarjeta del demo | ídem | ídem |
| Link vencido | Login de alumno con explicación + «Ir a mi panel» | ídem | ídem (en el navegador) |
| Sin demo | «Volver a sembrar» o botón deshabilitado con explicación | ídem | ya así |

## Fuera de alcance v1 (deuda declarada)

- Cookie propia para la sesión demo (`cookieOptions.name`): la opción arquitectónicamente limpia; exige
  un segundo factory de cliente y bifurcar proxy + `app/c/**` + logout del browser. Evolución si el «volver»
  por magic link muestra fricción (token de 1 h, un solo uso, slot compartido con recovery).
- Entrar como el demo **dentro** de la app RN: un solo binario y una sola sesión Supabase;
  `signOutAndCleanup` revoca push y borra caché. No.
- WebView in-app (`expo-web-browser`): dependencia nativa ⇒ binario nuevo. No.
- Espejo RN del «login de alumno reconoce al coach» (`validate-student-workspace`): opcional en W3.
- `cap-nudge` que detecte «tu único alumno eres tú»: no hay señal fiable; se mitiga con §5.
- `check_platform_email_availability` ignora `+alias`/puntos de Gmail (crea un alumno real con
  `coach+x@gmail.com`): se anota, no se arregla acá.
- Feedback inmediato del tilde en la banda del builder RN (no tiene `load()`): regresión menor declarada.
- W8.4.3 `clients.last_login_at`: no hace falta para esta spec.

## Decisiones que necesita el owner

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Mecánica de «Volver a mi panel» | **A** magic link del coach en cookie httpOnly de un solo uso (reusa `/vive-tu-app`) · B stash de access+refresh del coach (la rotación de refresh lo revoca; chunks de 4 KB) · C cookie propia para la sesión demo (limpia, ~40 archivos + proxy + browser) | **A** ahora; C como evolución declarada |
| D3 | `active_client_count` del admin | **A** = cupo del coach (`is_archived = false`, sin demo) · B = `is_active` como hoy, solo sin demo | **A**: «activos» deja de incluir archivados y cuadra con lo que ve el coach; cambia números que el owner ya vio — se documenta el antes/después |
| D4 | Coach en el login de alumno | A mantiene la sesión y ofrece «Ir a mi panel» · **B** `signOut` local + mensaje + «Ir al login de coach» | **B** (cambio tras la revisión de seguridad): A convertía `/c/<slug>/login` en un login de coach sin fail-counter, turnstile ni jitter |
| D8 | Qué ve el coach **sin** alumno de ejemplo al tocar «Ver mi app» | **A** «Volver a sembrar» cuando la persona admite demo + botón deshabilitado con explicación para `other` · B dejar el toast de hoy | **A**; el futuro de `other` sigue siendo D10 de onboarding-v2 |

Defaults declarados (no son decisiones: la propia spec los argumenta): D2 desktop conserva el sheet ·
D5 correo propio = aviso + CTA deshabilitado · D6 evento nuevo `vive_tu_app_entered` (solo servidor) ·
D7 `autoOpen` en móvil muestra el CTA y espera el gesto.

## Métricas de éxito (PostHog + `coach_onboarding_events`)

Todas medibles con lo instrumentado: `opened` y `entered` llevan `device`, `entered` y `returned` llevan `mode`.

| Métrica | Hoy | Meta 30 días |
|---|---|---|
| `vive_tu_app_entered` / `vive_tu_app_opened` con `device = mobile` (coaches reales, web) | 33 % (2/6, sin desglose por device hoy) | ≥ 80 % |
| `vive_tu_app_returned` / `vive_tu_app_entered` con `mode = return` | — | ≥ 70 % |
| `student_login_coach_account` por coach nuevo | ~1 cada 7 (Job) | → 0 sostenido |
| `add_student_self_blocked` | — | existe y se ve |
| Coaches Free cuyo único alumno tiene su mismo nombre (proxy de auto-alta) | 1 / 8 altas del ad | 0 |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **Android App Links `autoVerify` con `pathPrefix /c/`** (`app.json:67-96`, `:113-142`) pueden rebotar el 302 `/vive-tu-app → /c/<id>/dashboard` a la app (`+native-intent.ts` lo manda a `/alumno/codigo`). Afecta a web móvil con la app instalada **y** al flujo RN. Puede estar pasando **hoy** | Comprobación barata **antes de W1**: `adb shell pm get-app-links cl.evaapp.eva` (y que el SHA-256 de `assetlinks.json` sea la clave de firma de Play). QA en device Android real con la app instalada. Contingencia: `/vive-tu-app` responde una página mínima 200 que setea cookies y navega por JS (`location.replace`), que Chrome no intercepta sin gesto; cambia el assert de `location` del test del route. Solo si el QA lo confirma. |
| Token del coach en cookie = credencial ≤ 1 h | httpOnly + Secure + Lax + path `/volver-al-panel` + un solo uso + borrado en toda rama repitiendo el path + test «no aparece en logs ni props» |
| Proxy y route handler compitiendo por `Set-Cookie` | Early-return del proxy en `/vive-tu-app` y `/volver-al-panel` (§3) + test del orden de `Set-Cookie` |
| «Atrás» con sesión demo ⇒ alta de coach sobre el usuario demo | Rama del proxy (§3) + cinturón en `complete.actions.ts` + caso en la matriz de QA |
| `event_type` nuevo y CHECK: la falla es silenciosa, no un 500 | Migración aplicada en LIVE **antes** del deploy + consulta de verificación post-deploy |
| Los 6 coaches con tilde viejo se destildan | Resolver con grandfather por fecha de corte (`.or(...)`) |
| RN peor que hoy durante el rollout | OTA (explainer v2 + `AppState`) **antes** del deploy web; corte = timestamp del deploy |
| Modo `return` nunca dispara por apex/www | Gate de entrada de W2: 308 apex→www confirmado; `AUTH_COOKIE_DOMAIN` sigue sin setear |
| `onboarding_guide` con un quinto escritor | No se escribe desde el servidor; el tilde viaja por señal + hook del cliente |
| Copy nuevo en RN rompe guards de tiendas | Sin «plan», sin «eva-app.cl», sin precios; tests `store-copy`/`no-prices` en el gate de la wave |
| `matchMedia` forzado a `false` en vitest | Los tests de `ViveTuAppButton` redefinen `window.matchMedia` antes del render |
| Árbol compartido con otra sesión | Lista de archivos por wave acordada antes; commits por ruta; nunca `pull --rebase --autostash` con workers activos |

## Referencias

- [coach-onboarding-v2/SPEC.md](../coach-onboarding-v2/SPEC.md) §5, §6, §9, §10 — esta spec **manda sobre §5 y sobre la fila 2 de §6**.
- [coach-onboarding-v2/TASKS.md](../coach-onboarding-v2/TASKS.md) — W8.1.2 (parcial), W8.1.9, W8.2.8, W8.6.2 absorbidas.
- [embudo-free-pro/SPEC.md](../embudo-free-pro/SPEC.md) — decisiones cerradas de tiendas (cero venta en app).
- `apps/mobile/AGENTS.md` — regla de tiendas, cambios nativos vs OTA.
- Benchmark: Trainerize (Viewing a client's account on the mobile app; Can trainers train themselves as clients; Timmy Explorer), TrueCoach (TrueCoach from the client view), Everfit (Demo client experience guideline), Thinkific (Previewing your course as a student), GitLab (admin impersonation), Adobe Learning Manager (impersonation of learner).
