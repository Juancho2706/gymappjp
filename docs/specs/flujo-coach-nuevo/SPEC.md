---
status: active
owner: product-engineering
last_verified: "2026-08-23"
canonical: false
---

# SPEC — Flujo del coach nuevo: del ad al primer alumno REAL adentro

**Estado: EN DISEÑO — propuesta para «go» del owner (2026-08-23).** Base: 6 informes de lectura del código +
datos de LIVE y PostHog (18-08 → 23-08), revisados por tres críticas adversariales (seguridad de
sesión/tiendas, producto/realismo del owner, implementabilidad contra el árbol). **No rediseña «Vive tu app»**:
[vive-tu-app-directo](../vive-tu-app-directo/SPEC.md) manda sobre el paso 2 de la guía y es dependencia dura de
dos waves. **No duplica** el embudo Free→Pro ([spec](../embudo-free-pro/SPEC.md), en producción) ni reabre
pricing v3 ([spec](../pricing-v3/SPEC.md)). Ejecuta —sin renombrar sus ids— W8.1.10, W8.4.3 y W8.5.2 de
[coach-onboarding-v2](../coach-onboarding-v2/TASKS.md).

## Origen

Desde el 18-08 corre una campaña de Meta hacia `eva-app.cl`. En 6 días entraron 29 coaches nuevos y **5 tienen
hoy un alumno real que efectivamente entró a la app**. El onboarding v2 (prod desde el 22-08) subió la marca
propia de 0 % a 44 % y la elección de especialidad a 7/9 — y no movió un solo alumno real. La definición de
fluidez del owner: *un coach que llega desde un ad **en el celular** debe poder registrarse, ver SU app con SU
marca e invitar a su primer alumno real en UNA sesión, sin correo bloqueante, sin QR, sin volver a loguearse,
sin callejones sin salida.* Hoy no se cumple para casi nadie, y ni siquiera se puede medir.

---

## 1. Problema, con números reales

### 1.1 El embudo (18-08 → 23-08 16:12 UTC)

| Paso | Valor | Fuente |
|---|---|---|
| Clic del ad → `$pageview` (`utm_source=meta`) | **307** | PostHog |
| …llegó a `/register` | **24** (7,8 %) | 301 personas se quedan en `/`; 1,08 páginas por sesión |
| …coach registrado | **12** (3,9 %) | PostHog |
| **Cohorte completa, sin cuentas de prueba** | **29 coaches** | `coaches` en LIVE |
| Confirmó el correo / inició sesión | 27 (93,1 %) | 2 murieron en `pending_email`, uno con dominio `gmail.` + `con` |
| Eligió persona (base 9 post-v2) · tocó su marca | 7/9 · color 4/9, logo 3/9 | antes: 0 % color, 5 % logo |
| Abrió «Vive tu app» · el demo llegó a iniciar sesión | 6/9 · **2/7** | el 67 % de las aperturas no llega a ver la app |
| **Invitó ≥1 alumno REAL** | **8** (7 sin la autoinvitación) = **27,6 %** | **el agujero grande: −65,5 pp vs. las altas que confirmaron (93,1 %)**; −72 pp vs. el total |
| **Ese alumno ENTRÓ (activado)** | **5** = 17,2 % | −10,4 pp vs. la fila anterior |
| Activado dentro de 72 h (base madura: 8) | 2 = **25 %** | — |
| Pasó a Pro | 0 | — |

**Cuatro advertencias.** (1) El titular «0/9 activados post-v2» **no es una medición**: el v2 salió el
22-08 12:57 y el corte es el 23-08 16:12, así que ningún coach de esa cohorte tenía 72 h cumplidas; lo medible
es que 0 de 9 invitaron a alguien **que no fuera él mismo** (el único que invitó, #28, se autoinvitó con un
segundo correo), y contra la base de 24,1 % eso tiene probabilidad ≈ 10 %: sospechoso, no probado.
(2) El 21-08 se ejecutó pricing v3 (Free 2 → 1) y el 22-08 el onboarding v2: **dos cambios en 24 h** sobre la
misma cohorte. (3) `coach_registered` subcontaba ~21 % antes del 22-08: **la fuente de verdad de altas es
`coaches`**, no PostHog. (4) Meta activa 16,7 % y el orgánico 17,6 %: el problema **no es la fuente del
tráfico**, es el producto post-alta.

### 1.2 Los cinco hechos que mandan sobre el diseño

**H1 — El coach que va a invitar lo hace en menos de 10 minutos, o nunca.** Mediana alta → primer alumno real
= **6 m 30 s**; de los 21 coaches sin alumno, **ninguno** invitó después. No hay cola de «mañana lo hago»:
cualquier arreglo que dependa de que el coach vuelva mueve hoy un segmento que vale cero, y cualquier paso que
lo expulse de la sesión es una pérdida definitiva. **Qué los frenó no se deduce de esta tabla**, y la
respuesta importa: no es lo mismo «no supe cómo» que «no tengo a quién meter». **Se investiga con datos** —la
consulta de W0.1 muestra dónde cae cada cohorte, y las session recordings ya consentidas
(`lib/posthog/consent.ts:57`) muestran qué pantalla los frenó— **o con una pregunta opcional dentro del
producto**. **Escribirles directo está descartado por el owner (23-08): contacto no solicitado es invasivo**,
y esta app no se vende así.

**H2 — El muro del correo no filtra: mata.** Mediana de confirmación = **27 s**: quien puede cruzarlo lo cruza
al instante, quien no puede se pierde entero. **19 de 25 registrados pasan por `/verify-email` y 15 de 25
vuelven por `/login`** en la misma sesión — los dos «sin» de la definición de fluidez, incumplidos. El muro
vive en `register.actions.ts:194,229` + `proxy.ts:480-482`, y **el alta desde la app RN es igual**
(`api/mobile/auth/register-coach-free/route.ts:120,145`). El único camino que nace `active` es Google
(`coach/onboarding/complete/_actions/complete.actions.ts:129`), y Google es justo el que Instagram bloquea en
su webview, donde aterriza el ad.

**H3 — El alumno no puede entrar con lo que el coach le manda.** El canal por defecto es WhatsApp
(`apps/web/src/app/coach/clients/_lib/add-student-invite.ts:22`) y el mensaje que el producto redacta dice
«Entras con tu correo acá: {link}» **sin la clave** (`packages/schemas/persona.ts:65,75,85,95,105`, formateador
en `:127-137`). Ese `{link}` es `/c/{código}/login`, que pide correo **y** contraseña. La clave temporal se
genera en el navegador del coach (`AddStudentStepper.tsx:281`) y se le muestra (`:434`), pero **solo viaja por
el correo de EVA**: WhatsApp → navegador → login → app de correo → vuelve. Dos saltos de app, y 3 de 8
alumnos invitados nunca entraron.

**H4 — La North Star no es precisa hoy, pero sí aproximable sin migrar.** `clients` no tiene columna de login
(`apps/web/src/lib/database.types.ts:728`+). Pero `force_password_change` se apaga en el primer ingreso
completado (`c/[coach_slug]/login/_actions/login.actions.ts:204`, tras el redirect obligado de `:160-161`) y
**ya se pinta** en el roster de web y RN como «Pend. sync». **La medición arranca mañana sin una sola
migración**; la columna nueva sigue siendo la respuesta correcta porque da el **primer** login, que
`auth.users.last_sign_in_at` no da.

**H5 — El producto se contradice en cinco superficies.** Drip D+1: «Tu alumno se registra solo» con
`/join/{código}` (`drip-templates.ts:77,95`), que desde el 21-08 es **solicitud**
([coach-leads](../coach-leads/SPEC.md)) · hoja de invitar: «Tu alumno baja EVA»
(`InviteStudentSheet.tsx:145`) con Play **no pública** (`lib/app-links.ts:15`) · correo del alumno: «responde
este correo» (`transactional-templates.ts:61`) sin `reply_to` del coach, aunque el helper lo soporta
(`send-email.ts:27` vs. el call site `clients.actions.ts:270`) · alta guiada RN: «Cuando {nombre} entre por
primera vez, lo ves en tu panel» (`guided-invite.ts:145`) sin superficie que lo muestre · login de marca: sin
escape para un desconocido (`ClientLoginForm.tsx`, cero menciones de `join`).

### 1.3 Lo que NO es el problema

Persona y marca funcionan. El alta del alumno funciona: nace `email_confirm: true` (`clients.actions.ts:170`),
con `force_password_change: true` (`:188`), y el correo se **espera** (`:270`). El cupo excluye al demo en las
**8** superficies que ve el coach (R3 §5); el bug del demo está acotado al panel admin y delegado a
[VTA W4](../vive-tu-app-directo/TASKS.md). El fire-and-forget de bienvenida+drip está cerrado. El 308 apex→www
existe (`vercel.json:12-19`) con un detalle que importa: el `source` es `"/:path((?!\\.well-known/).*)"`, o sea
**`.well-known/` no redirige** y el apex lo sirve directo.

---

## 2. Definición de fluidez y North Star

### 2.1 La métrica

> **North Star — Activación a 72 h:** % de coaches nuevos (excluidos managed `org_id`/`team_id` y las cuentas
> de prueba **de la lista, nunca por dominio** — `@evatest.cl` lo comparten los alumnos demo) que dentro de las
> 72 h de `coaches.created_at` tienen al menos un alumno **REAL** que **entró al menos una vez**.
>
> «Alumno real» = el predicado canónico del cupo (`is_demo = false AND is_archived = false AND org_id IS NULL
> AND team_id IS NULL`, `clients.actions.ts:121` y las otras **7** superficies), **más** la exclusión del coach
> que se autoinvita, comparando los dos correos **normalizados** con `normalizePlatformEmail`
> (`apps/web/src/lib/auth/platform-email.ts`, la función que ya usan las dos altas): comparar en crudo deja
> pasar `coach+alumno@gmail.com` y los puntos de Gmail.

Esa exclusión no es cosmética: el coach **ve** la clave temporal de su alumno (se genera en su navegador,
`AddStudentStepper.tsx:281`, y el servidor la usa tal cual, `clients.actions.ts:169`), así que puede entrar
«como su alumno» para probar — el caso #28 de la cohorte es exactamente eso. Métrica-guarda obligatoria:
**% de primeros logins ocurridos a menos de 120 s de crear el alumno**, que es la firma del auto-test.

### 2.2 Valores y objetivo

| Métrica | Hoy | Objetivo a 30 días (23-09) |
|---|---|---|
| **North Star: activados a 72 h** | **25 %** (2/8 maduros) · 17,2 % en la ventana, calculado a mano | **40 %**, calculado solo |
| Coaches que invitan ≥1 alumno real | 27,6 % | 50 % |
| Coaches cuyo alumno invitado llegó a entrar | 62,5 % (5 de 8) | 85 % |
| Altas que llegan a `active` | 93,1 % | ≥ 99 % |
| Mediana alta → primer alumno | 6 m 30 s | ≤ 6 min (no empeorar) |
| Toques del alumno: link → dentro | 12-18, **2 saltos de app** | **7-9, 1 salto** |

«Calculado solo» es una promesa con tarea: **W1.6** agenda la consulta de W0.1 como cron semanal y le manda la
fila al owner. Sin esa tarea, «solo» significaba «el jefe se acuerda el martes».

**Guardarraíles: si alguno cae, el cambio se revierte, no se discute.** Marca propia ≥ 40 % color y ≥ 30 %
logo · persona ≥ 75 % · cero altas por encima del tope de 3 free/IP/7 d · cero CTA de pago en iOS · altas
`active` sin `coaches.email_verified_at` a 7 días ≤ 15 % (**no** `auth.users.email_confirmed_at`: bajo D1 = A
esa columna nace seteada para todos — regla 11 de §5).

**Ningún guardarraíl se lee con menos de 20 coaches en la ventana** (o 2 semanas acumuladas, lo que llegue
primero); por debajo del mínimo la fila dice **«sin lectura»** y no dispara nada. La cohorte de hoy son **9**
coaches y «marca ≥ 40 % color» está en 44 % (4/9): con ese n, un coach de diferencia mueve el indicador 11 pp y
el guardarraíl revertiría por ruido, que es exactamente lo que §2.3 prohíbe hacer con la North Star. W0.1 lo
implementa: columna `n` en cada fila y **NULL** —no cero, no un porcentaje— cuando `n` no llega al mínimo.

Un guardarraíl sin instrumento ni palanca es una frase. Por eso **los cinco son columnas de la misma consulta
semanal** (W0.1) y **D1 sale detrás de una bandera de Edge Config** — el molde ya corre en `proxy.ts:122-132`
(`free_tier_kill_switch`) — para revertir en un minuto y sin deploy. Ese kill-switch **no** alcanza como
palanca: solo corta `/register` hacia adelante, no revierte cuentas creadas.

### 2.3 Regla de lectura (tan importante como la métrica)

Con ~35 altas por semana (29 coaches en 5,7 días; ~15 desde el ad), **un salto de 25 % a 35 % sigue sin ser
significativo a dos semanas** en la North Star, que se mide sobre coaches con 72 h cumplidas. La decisión a 2
semanas se toma sobre las métricas intermedias (invitan, alumnos que entran, altas que llegan a `active`), que
tienen bases mayores; la North Star se juzga a **30 días acumulados**. Todo insight sobre
`coach_onboarding_events` lleva `created_at >= 2026-08-22` (8.124 filas históricas lo contaminan). Y la
decisión se toma con **la consulta SQL de W0.1**, no con el embudo de PostHog: esos eventos entran por un
endpoint llamable desde el cliente (`api/coach/onboarding-events`), así que sirven para explorar, no para
decidir.

---

## 3. Recorrido objetivo, pantalla por pantalla

Coach chileno, Android, webview de Instagram, tier free, sin la app instalada.

| # | Paso | Superficie | Hoy | Obj. | Qué cambia |
|---|---|---|---|---|---|
| 1 | Ad → `/register?tier=free` | landing | 1 + banner | igual | El destino del ad **no** es alcance de este spec (§7) |
| 2 | Paso 1 «Tu cuenta» | `(auth)/register/page.tsx` | 4 campos | 4 campos | Ojo de ver la clave (`:565` es `type="password"` pelado; `:567` ya trae `autoComplete="new-password"`) + guardia de dominio mal tipeado. La detección del webview de Meta ya está escrita (estados `:175-177`, efecto `:186-204`, render `:669-687`) pero **solo ofrece el escape cuando el captcha ya falló**: `GoogleSignInButton` (`:766`) se pinta sin condición ⇒ este spec suma **W3.6b**, que degrada el botón de Google dentro del webview de Meta y ofrece «Abrir en el navegador» **antes** de que el coach lo toque. Sin eso, H2 queda sin cerrar |
| 3 | Pasos 2 y 3 del wizard | wizard | 4 | 4 | Sin cambio |
| 4 | **Entra directo** → gate de persona | `register.actions.ts` → `proxy.ts:599-643` | **~6 toques + salto a la casilla** | **0** | Desaparecen `/verify-email`, el salto al correo, el retorno en otro navegador y el re-login: hoy tocan al 76 % y matan al 7 % |
| 5 | «¿A qué te dedicas?» | `/coach/onboarding/persona` | 3 | 3 | Sin cambio: funciona |
| 6 | Guía, paso 1: preset de marca | `/coach/guia` + `BrandQuickCard` | 2 | 2 | Al guardar, `use_brand_colors_coach` queda en `true` ⇒ su panel y su splash RN muestran su marca |
| 7 | Guía, paso 2: «vive tu app» | web/RN | 1 + 1-3 «atrás» | 1 + 1 | **Lo entrega [VTA W1+W2](../vive-tu-app-directo/TASKS.md)**; acá solo se depende |
| 8 | Guía: **«Invita a tu primer alumno»** | `/coach/clients?invite=1` | paso **4**, tras el artefacto | **igual por ahora** | **D3 = C:** no se reordena todavía. La caída de la cohorte está en el paso 2, no en el 3 (§1.1), y el paso 2 lo arregla VTA W1+W2. Se reevalúa con la regla de disparo de D3 |
| 9 | Alta guiada | `AddStudentStepper` | 3 + tipeo | igual | Sin cambio funcional |
| 10 | «Abrir WhatsApp» → contacto → enviar | `wa.me` | 3 | 3 | **El mensaje lleva usuario y clave**, y solo con teléfono (§5 regla 4) |
| 11 | **El alumno entra** | `/c/{código}/login` | 12-18 · **2 saltos** | **7-9 · 1 salto** | Pega la clave del mismo chat: desaparece el viaje a la casilla |
| 12 | El coach lo ve | roster | chip «Pend. sync» | **«Entró hace 3 min»** | Hoy el único indicador es jerga y el alta guiada RN promete una pantalla que no existe |

**Total coach: ~24-26 toques con un salto fuera del navegador → ~16-18 toques, cero saltos, 3-5 min.**

**Qué muere del camino feliz:** `/verify-email`, `/login` como retorno, el viaje del alumno a su casilla, el
chip «Pend. sync», la promesa huérfana del alta guiada RN y los tres copys que hoy mienten.

**Prioridad del owner (23-08): todo lo de esta tabla es ARREGLA — lo que hoy expulsa, confunde o miente —
salvo el paso 8**, que es AGREGA y quedó pospuesto con D3 = C. Ningún paso de este recorrido pide una
capacidad nueva: los doce arreglan un flujo que ya existe. Las tareas del [TASKS](TASKS.md) llevan esa
etiqueta (ARREGLA / MIDE / AGREGA) y el orden de ejecución sale de ella: **ARREGLA 42,5 h · MIDE 17 h ·
AGREGA 3 h** (+4 h condicionales de W5).

---

## 4. Callejones verificados (todo abierto en el árbol hoy)

| # | Callejón | Archivo:línea | Sev. | Dueño |
|---|---|---|---|---|
| 1 | El alta free no firma sesión y encierra al coach hasta que abra el correo | `register.actions.ts:194,229` · `proxy.ts:480-482` | alta | este spec |
| 2 | **Hoy:** si el correo de confirmación falla, `register.actions.ts:274-276` borra `coaches` y el `auth.user`. **Bajo D1 = A:** con `email_confirm: true`, `generateLink({type:'signup'})` falla **siempre** (GoTrue rechaza `invite` y `signup` para un usuario existente, `lib/auth/send-coach-email-confirmation.ts:34-38`) ⇒ sin sacar ese bloque, W3.1 borraría **todas** las altas free | `register.actions.ts:274-276` | alta | este spec |
| 3 | El alta desde la app RN tiene el mismo muro | `api/mobile/auth/register-coach-free/route.ts:120,145` | alta | este spec |
| 4 | El mensaje de WhatsApp no lleva la clave | `packages/schemas/persona.ts:65,75,85,95,105,127-137` | alta | este spec |
| 5 | `wa.me/?text=` sin teléfono abre el **selector de contactos**: una credencial ahí es una fuga a un toque | `add-student-invite.ts:105` | alta | este spec |
| 6 | El drip D+1 promete que `/join` da de alta solo; es solicitud desde el 21-08 | `lib/email/drip-templates.ts:77,95` | alta | este spec |
| 7 | No existe señal de «el alumno entró» | `database.types.ts:728`+ | alta | este spec |
| 8 | La marca nace apagada y RN **borra** la caché de marca con ese valor ⇒ splash EVA para siempre | `supabase/migrations/00000000000001_baseline.sql:907` · `apps/mobile/lib/branding.ts:257-261` | media | este spec |
| 9 | Guardar la marca **desde la guía** vuelve a escribir `false` | `BrandQuickCard.tsx:148` + `coach/settings/_actions/settings.actions.ts:47` | media | este spec — sin esto, el 8 solo sirve a quien nazca mañana |
| 10 | `signOut()` global cuando el coach se equivoca de login: le revoca la sesión en **todos** sus dispositivos | `apps/mobile/app/(auth)/login.tsx:230` | media | este spec |
| 11 | `/reset-password` reclamada por App Links (`app.json:105,150`) contra una pantalla sin guard de sesión | `apps/mobile/app/(auth)/reset-password.tsx:34-48` | media | este spec |
| 12 | El login de marca no tiene escape para un desconocido, y la consulta pública **no** trae `invite_code` | `c/[coach_slug]/login/ClientLoginForm.tsx` · `_data/login.queries.ts:19` | media | este spec (tras G-GRANT) |
| 13 | «Tu alumno baja EVA» con Play no pública | `InviteStudentSheet.tsx:145` vs `lib/app-links.ts:15` | media | este spec |
| 14 | El correo del alumno dice «responde este correo» y la respuesta va a EVA | `transactional-templates.ts:61` · `clients.actions.ts:270` · `send-email.ts:27` | baja | este spec |
| 15 | ~~`publicAppUrl()` no normaliza apex→www~~ — **verificado 23-08 (G-ENV): no ocurre en producción.** `NEXT_PUBLIC_SITE_URL` es `https://www.eva-app.cl` y `NEXT_PUBLIC_APP_URL` tiene host `www` (lo documenta `lib/site-url.ts:9-11`: el defecto real del 22-08 era la **barra final**, que `:13-17` ya recorta). Normalizar apex→www como hace `studentAppOrigin()` (`invite-code.ts:90`) queda como higiene **opcional (AGREGA)** | `lib/site-url.ts:13-17` | — | **cerrado** |
| 16 | El alumno real que **ya tiene cuenta** (de otro coach, ex-alumno, o se registró como coach desde el mismo ad) muere en «Escríbenos a soporte y lo resolvemos contigo», sin salida y **sin telemetría** de la razón (`taken_coach` / `taken_client` / `taken_orphan` / `taken_auth`) | `lib/auth/platform-email.ts:66-67,69-77` | alta | este spec — cae en el minuto de oro del §3, paso 9 |

**Cuatro callejones más son reales y NO son de este spec** (se referencian, no se duplican): el paso 2 de la
guía se tilda al **emitir** el link y no al entrar (`services/onboarding/vive-tu-app.service.ts`, VTA W1) · el
panel admin cuenta demos y archivados (VTA W4) · el endpoint móvil de eventos devuelve 500 ante el duplicado
esperado (`api/mobile/coach/dashboard/route.ts:261-270`) · y ese mismo endpoint spreadea claves arbitrarias
sobre el jsonb (`:275-295`) — los dos son W8.2.5 de
[onboarding-v2](../coach-onboarding-v2/TASKS.md). Y **dos son aportes de este spec a
[VTA](../vive-tu-app-directo/TASKS.md)**, porque tocan archivos suyos: `POST /api/mobile/coach/vive-tu-app` no
tiene rate limit (0 apariciones de `rateLimit` en sus 62 líneas) y `app/vive-tu-app/route.ts:44-45` hace
`signOut()` **global** en el camino malo sin atar `c=` al dueño del demo. **Esos aportes y el call site del
primer login se anotan en el TASKS de VTA durante W0, no al cierre**: si la anotación llega después de que VTA
corra, se pierden y este spec entrega menos de lo que promete.

---

## 5. Reglas de producto (invariantes)

1. **La North Star se forja solo en el servidor.** La columna nueva de login del alumno **no lleva
   column-grant a `authenticated`**: `clients` tiene tres políticas de auto-UPDATE del propio alumno
   (`baseline.sql:2493`, `:2856`, `:2893`), así que un grant la haría escribible desde el navegador con la anon
   key. **La premisa la sostiene el grant, no el baseline**: el baseline trae `GRANT ALL ON TABLE clients TO
   authenticated` (`:3599`), y quien verifique solo ahí concluirá lo contrario y podría «arreglar» el grant. Lo
   que salva a la columna es `supabase/migrations/20260612140001_clients_scoping_grants.sql:36-37` (`REVOKE
   UPDATE … FROM authenticated, anon` + allowlist de 17 columnas: **default-deny por columna**), aplicada en
   LIVE. Escribe `service_role` y punto.
2. **Es columna de PRIMER login, no de último.** Se llama `first_login_at` y se escribe una sola vez
   (`WHERE first_login_at IS NULL`). Una columna de «último login» **no puede** responder «activado dentro de
   72 h»: W8.4.3 de onboarding-v2 la nombra `last_login_at` y este spec la corrige.
3. **La escritura del primer login es best-effort pero SE ESPERA.** El `UPDATE` corre con `service_role`,
   nunca lanza y es una sola sentencia por PK: se hace `await` antes de devolver la respuesta. **Prohibida la
   promesa flotante**: los dos call sites *devuelven* (`c/[coach_slug]/login/_actions/login.actions.ts:164`
   retorna `{success, redirectUrl}`; `api/mobile/auth/validate-student-workspace/route.ts:46-51` retorna JSON)
   y Vercel congela la invocación ahí — es la trampa exacta que perdió 2 de 5 bienvenidas el 19-08
   (`lib/email/free-coach-onboarding.ts:24-28`). Lo único que no se espera en línea es el capture de PostHog
   (`capturePostHogServerEvent` corta a 1,5 s, `lib/posthog/registration-events.ts:38-41`): va por `after()` de
   `next/server`, que mantiene viva la invocación sin sumarle latencia al login. Nunca puede devolver error al
   alumno.
4. **Una credencial nunca viaja a un destinatario sin nombre.** El mensaje con la clave se arma **solo** con
   teléfono (`wa.me/<digits>`). Sin teléfono, `wa.me/?text=` abre el selector de contactos y un toque
   equivocado entrega acceso a datos de salud de un tercero (Ley 21.719): ahí el mensaje va **sin credencial**.
5. **La clave temporal sigue siendo temporal**: `force_password_change` se fuerza server-side en los dos
   runtimes y nada de este spec lo toca.
6. **Ninguna superficie promete lo que el producto no hace.** Si el copy dice «se registra solo», el link debe
   dar de alta; si dice «baja EVA», la ficha debe ser pública; si dice «lo ves en tu panel», la superficie debe
   existir.
7. **iOS: cero CTA de pago** de cualquier tipo, ni un botón que dispare un correo. Android: una línea sin link,
   split por `Platform.OS`.
8. **El demo nunca cuenta** como alumno real: ni en la North Star, ni en el cupo, ni en el chip «entró».
9. **Cambios en `packages/*` viajan en el bundle RN.** Con la regla del piso (1.1.0 no recibe OTA), tocar
   `packages/schemas/persona.ts` o el orden de `packages/onboarding/index.ts` produce un **split declarado por
   runtime**: web y 1.1.2 con la versión nueva; **1.1.0** con la vieja para siempre (regla del piso) y, para
   `packages/onboarding`, **también 1.1.1**, cuyo worktree no tiene `@eva/onboarding`.
10. **La credencial no queda en el DOM.** La pantalla del alta guiada se **graba** cuando el coach aceptó
   cookies (`lib/posthog/provider.tsx:36`, `lib/posthog/consent.ts:57`), y el default de PostHog enmascara
   *inputs*, no texto del DOM ni `href`s ni `$current_url`. La URL de `wa.me` con la clave se arma **en el
   handler del click**, nunca como `href` renderizado, y el bloque de credenciales lleva `ph-no-capture`.
11. **La verificación del correo tiene columna propia: `coaches.email_verified_at`.** `auth.admin.createUser({
   email_confirm: true })` escribe `auth.users.email_confirmed_at = now()` **en la creación**, así que bajo
   D1 = A **todas** las altas free nacerían «verificadas» y la verificación blanda quedaría inerte el día uno:
   el drip nunca saltaría a nadie (W3.8), el banner nunca se pintaría (W3.11) y el guardarraíl de §2.2 daría
   0 % para siempre. Por eso la prueba real de la casilla **no** se lee de GoTrue: la escribe `service_role` en
   `coaches.email_verified_at` (W3.0), **sin column-grant a `authenticated`/`anon`** — `coaches` es
   default-deny por columna desde
   `supabase/migrations/20260612140000_modules_compra_only_grants.sql:24` (`REVOKE INSERT, UPDATE, DELETE …
   FROM authenticated, anon`) + la allowlist de `:25-44`, y una columna que no entra en esa lista solo la
   escribe el servidor. Tres escritores y ninguno más: `/auth/confirm` cuando el OTP se verifica bien
   (`apps/web/src/app/auth/confirm/route.ts:43`, junto a la activación de `:55`), el alta por Google
   (`coach/onboarding/complete/_actions/complete.actions.ts:129`, donde el correo lo verificó Google) y el
   backfill de la migración. **El alta paga queda NULL**: nace `email_confirm: true` porque el pago prueba
   identidad, no la casilla.
12. **Confirmar el correo por decreto no puede regalar la cuenta de nadie.** El enlace automático de
   identidades por correo **no es configurable** en Supabase y su única salvaguarda es que borra las
   identidades **sin confirmar** al enlazar una nueva
   ([doc oficial](https://supabase.com/docs/guides/auth/auth-identity-linking), G-AUTH 23-08). Hoy eso nos
   protege: el alta free nace `email_confirm: false`, así que la identidad de un intruso se borra sola cuando
   la víctima entra por Google. **W3.1 anula esa protección**, y por eso D1 = A **solo se despliega junto con
   W3.13**: cuando alguien entra con Google sobre un usuario que ya tenía identidad `email` y
   `coaches.email_verified_at IS NULL`, el servidor **rota la contraseña**, marca el correo como verificado
   (Google lo probó) y deja rastro (`google_link_rotated_password`). Confirmar un correo que nadie probó es
   una conveniencia de producto; **jamás** puede convertirse en una credencial válida para un tercero.

---

## 6. Copy literal (los strings SON el cambio)

Ningún worker improvisa texto. Español latam, tuteo, sin emojis, sin nombres de producto ajenos a la marca del
coach.

**Invitación por WhatsApp, CON teléfono** (`packages/schemas/persona.ts`, una por persona; se muestra
`strength` — las otras cuatro conservan su primera frase actual y suman el mismo bloque):

```text
Hola {nombre}, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances.
Entra acá: {link}
Tu usuario: {correo}
Tu clave temporal: {clave} — la cambias apenas entres.
```

**Invitación por WhatsApp, SIN teléfono** (selector de contactos, regla 4):

```text
Hola {nombre}, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances.
Entra acá: {link} — te mandé tu clave al correo.
```

**Chip del roster** (web y RN), reemplaza «Pend. sync»:

```text
con first_login_at (W1 en adelante)
  Todavía no entró             (first_login_at IS NULL)
  Entró hace 3 min             (< 1 h)
  Entró hoy                    (mismo día)
  Entró hace 2 d               (resto)

fallback sin la columna (W0, y filas viejas)
  Todavía no cambió su clave   (force_password_change = true)
  Activo                       (resto)
```

**El fallback no dice «entró», y no puede decirlo:** `force_password_change` se apaga en `changePasswordAction`
(`c/[coach_slug]/login/_actions/login.actions.ts:203-205`), o sea cuando el alumno **completa** el cambio de
clave, no cuando entra. El que entra y abandona esa pantalla —el caso más probable con una clave temporal
llegada por WhatsApp— quedaría «Todavía no entró» para siempre mientras la consulta de W0.1 lo cuenta como
activado: dos verdades opuestas en la misma sesión. Por eso el fallback dice lo que el dato dice, y por eso
**W1 deja de ser cortable si se quiere el copy «entró»**.

**Bloque de invitación del drip D+1** (`lib/email/drip-templates.ts`), destino `/coach/clients?invite=1`:

```text
Título:  Da de alta a tu primer {alumno}
Cuerpo:  Le creas la cuenta desde tu panel y le llega el mensaje con su acceso listo.
         Toma menos de un minuto.
CTA:     Dar de alta a mi primer {alumno} →
```

**Escape del login de marca** (`ClientLoginForm.tsx`, junto a «¿Olvidaste tu contraseña?», solo standalone):

```text
¿No tienes cuenta? Pídele acceso a {marca}
```

**Hoja «Invitar alumno»** (`InviteStudentSheet.tsx:145`), reemplaza «Tu alumno baja EVA, escribe este código y
entra directo a tu app.»:

```text
Tu alumno entra desde el navegador con este link. No necesita instalar nada.
```

**Medidor de cupo antes del primer alumno** (`apps/mobile/lib/client-cap.ts:65-68`,
`DashboardShell.tsx:352`), para que el éxito no arranque en «0 de 1»:

```text
RN  (apps/mobile/lib/client-cap.ts:65-68, capMeterLabel)
  con 0 alumnos:  Tu plan gratis incluye 1 alumno
  con 1 o más:    1 de 1 alumno activo          (sin cambio)

Web (DashboardShell.tsx:350-352, FreeTierBanner)
  con 0 alumnos:  Tu plan gratis incluye 1 alumno
  con 1 o más:    1 de 1 alumno · Plan gratuito
                  (SÍ cambia: hoy interpola el conteo a mano y dice «1/1 alumnos», con el
                   plural mal cuando Free = 1. Pasa a studentCountLabel, packages/tiers/index.ts:140)
```

---

## 7. Fuera de alcance v1 (deuda declarada)

- **El destino del ad.** 301 sesiones pagadas caen en `/` y 24 llegan a `/register`: la palanca más grande y
  cero código. Pero la campaña está congelada hasta el 25-08 y un conjunto nuevo reinicia el aprendizaje de
  Meta ⇒ **recomendación al owner**, no tarea.
- **Link mágico que entra al alumno sin clave.** Es la dirección correcta y lo único que llega a 2-3 toques,
  pero hoy no es implementable: `/c/*` está reclamada con `autoVerify` y la rama `/c/` de
  `apps/mobile/app/+native-intent.ts:13-17` reescribe la ruta a `/alumno/codigo?identifier=…&auto=1`, o sea
  **descarta el query string**, y el token se pierde en Android con la app instalada. (Precisión: el camino por
  defecto, `:29`, devuelve `path` con la query **intacta**; la pérdida es de esa rama, no de todo deep link.)
  El
  molde existente (`app/vive-tu-app/route.ts:34`) canjea el OTP en un **GET** y la vista previa de WhatsApp lo
  quema; y la vigencia del OTP es configuración **global** de GoTrue (**no verificado**: vive en el
  dashboard de Supabase Auth, no en el repo; §11). Evolución declarada **detrás** de la
  clave en el mensaje, con ruta **no reclamada**, canje por **POST** y vigencia real leída de la configuración.
- **Rebuild del binario RN por `EXPO_PUBLIC_POSTHOG_KEY`** (D7): cambia App Privacy y el privacy manifest,
  desde una cuenta Apple individual de un tercero. **El owner dijo A —sí al rebuild— pero DIFERIDO al martes
  2026-08-25**, y pidió que se le recuerde ese día: sigue fuera del alcance de estas waves, con fecha.
  **G-ASC se lee el 25-08.**
- **`/join` en la hoja de invitar.** `/join` es solicitud: agregarlo compite con el alta directa, que es la que
  produce alumnos en la primera sesión. Solo entra el **escape del login de marca**, que con G-GRANT verde y **D6 = A (owner, 23-08)** se ejecuta como AGREGA en el carril 3.
- **Correos por comportamiento (W6 de onboarding-v2).** H1 dice que el segmento «volvió al día siguiente» vale
  cero hoy, y no existe reloj: los 11 crons de `vercel.json` son diarios o semanales.
- **Panel admin sin demos** y **tilde real del paso 2** (VTA) · **`AUTH_COOKIE_DOMAIN`** ·
  **`apps/mobile/app.json`** (ninguna ruta nueva reclamada ni des-reclamada: sería binario) · **pricing y
  cupos** · **nutrición V2** · **`apps/enterprise`**.
- **Reordenar la guía para que «invitar» venga antes del artefacto.** Es D3, y la recomendación pasó a **C**:
  no se toca hasta que la regla de disparo de §8 se cumpla. El análisis sigue vivo ahí; lo que sale del
  alcance del día 1 es la ejecución (W5, condicional).

- **Escribirle a los 21 coaches que no invitaron.** Fue tarea (W0.8) durante unas horas y **el owner la
  descartó el 23-08: contacto no solicitado es invasivo.** Queda fuera de alcance **y fuera de cualquier
  canal directo**. Lo que buscaba se busca con datos —W0.1 y session recordings consentidas— o con una
  pregunta **opcional dentro del producto**, que es la única forma en que este producto pregunta algo.

---

## 8. Decisiones que necesita el owner

**Las siete quedaron respondidas por el owner el 23-08 (tarde).** La columna «Decisión» es lo que dijo; la
recomendación se conserva entera para que se vea dónde coincidió y dónde no.

| # | Decisión | Opciones | Recomendación y por qué | **Decisión del owner (23-08)** |
|---|---|---|---|---|
| **D1** | ¿Se mata el muro del correo en el alta free? | **A** sesión inmediata + verificación **blanda** (el correo sigue saliendo, no bloquea; el drip se salta al no verificado a las 24 h) **con `coaches.email_verified_at`**, porque `email_confirm: true` sella `auth.users.email_confirmed_at` **en la creación** y sin columna propia la verificación blanda nace muerta (regla 11 de §5, tarea W3.0) **y con W3.13**, que cierra el pre-account takeover que ese mismo flag abre (regla 12) · **B** con bloqueo diferido al 3.er día · **C** dejar como está | **A, y solo con W3.13** (G-AUTH ya salió: el linking no se configura, se corrige por código). 19/25 pasan por `/verify-email`, 15/25 vuelven por `/login`, 2 de 12 altas murieron ahí. Google ya nace `active` sin abuso observado ⇒ A extiende el modelo que corre. **A sin W3.0 ni W3.13 no es A**: es «matar el muro» a secas, sin la señal que lo hace medible ni el cierre del pre-account takeover que el propio flag abre (R2, regla 12 de §5) | **A** — se mata el muro. Arrastra **W3.0** (señal) y **W3.13** (takeover), que no son opcionales |
| **D2** | ¿La clave temporal viaja en el WhatsApp? | **A** sí, solo con teléfono · **B** sí, siempre · **C** no | **A.** Es el 100 % de la fricción del alumno y son 5 h (W2.1 1,5 + W2.2 1,5 + W2.3 0,5 + W2.4 1,5). La clave ya viaja en claro por correo y `force_password_change` la rota; A no agrega exposición, **B sí**: sin teléfono el `wa.me` abre el selector de contactos | **A** — la clave viaja solo con teléfono |
| **D3** | ¿«Invitar» va antes del artefacto en la guía? | **A** reordenar `ONBOARDING_STEP_KEYS` · **B** segundo CTA en la banda · **C** no reordenar por ahora | **C, con regla de disparo escrita.** El «0/9 invitan» **no** prueba que el artefacto tape la puerta: la cohorte muere en el paso **2** (7/7 tocan la marca → 6/9 abren «Vive tu app» → **2/7** llegan al demo → 2/9 hacen el artefacto —los mismos dos— → 0/9 invitan, §1.1). Quien muere en el paso 2 **nunca ve** el paso 3, así que intercambiar 3↔4 le sirve a 2 personas de 9; y el paso 2 lo arregla [VTA W1+W2](../vive-tu-app-directo/TASKS.md), que **todavía no está en prod**. Sumado a n = 9 con < 28 h y a que la advertencia (1) de §1.1 llama a ese dato «sospechoso, no probado», reordenar ahora es gastar un cambio irreversible-por-OTA (regla 9) sobre una cohorte que no lo mide. **Regla de disparo:** se reevalúa cuando VTA W1+W2 lleven **2 semanas en prod** y W0.1 muestre, **entre los coaches que ENTRARON al demo**, «hizo artefacto» < 30 % **o** «invitó» < 25 %. Si dispara, se ejecuta **A con la plantilla de un toque obligatoria** (W8.2.7 de onboarding-v2) para cerrar R10 en el mismo diff. B sigue descartada: agrega un segundo botón primario compitiendo con el existente (`GuideScreen.tsx:131-150`). Nota técnica que se conserva para cuando dispare: reordenar **no** rompe la memoria por especialidad (se archiva por clave, no por índice: `packages/onboarding/persona-progress.ts:38`) | **C** — no se reordena por ahora; W5 queda condicional a la regla de disparo |
| **D4** | ¿La marca nace prendida en el panel del coach? | **A** sí: `true` en las 3 altas **+ arreglar el camino de escritura** de `BrandQuickCard` **+ backfill** a coaches con 0 alumnos reales · **B** opt-in | **A.** Nace `false` (`baseline.sql:907`) y RN **borra** la caché con ese valor (`branding.ts:257-261`): el coach ve EVA en su propio splash. Sin las tres partes es cosmético — hoy guardar desde la guía reescribe `false` | **A** — marca prendida al nacer, con el camino de escritura arreglado y backfill |
| **D5** | ¿Qué tilda el paso 5 (el aha)? | **A** que el alumno **entrenó** (hoy, `onboarding-v2.queries.ts:409-424`) · **B** que **entró** | **A: no cambiarlo.** La North Star mide «entró» del lado del owner y el chip se lo muestra al coach; cambiarlo reabre la semántica del paso 5 y «confeti único». Desalineamiento declarado **a propósito** | **A** — el aha no cambia |
| **D6** | ¿Escape «pídele acceso» en el login de marca? | **A** sí · **B** no hasta que `/join` tenga anti-abuso verificado | **A.** **G-GRANT ya está verde:** `invite_code` **sí** está en el column-grant de `anon` (`supabase/migrations/20260617033845_coaches_restrict_anon_select_to_branding.sql:19-25`, confirmado en `information_schema.column_privileges` de LIVE el 23-08), así que sumarlo al `select` de `login.queries.ts:28` **no** arrastra migración de grants y D6 vuelve a ser decisión de **producto** (compite con el alta directa), no de seguridad. El único resto era anti-abuso —`/join` no verifica Turnstile sin secret (`join-request.actions.ts:56-63`)— y **G-ENV salió verde el 23-08**: `TURNSTILE_SECRET_KEY` existe en Production, así que el captcha de `/join` corre. **D6 queda como decisión de producto pura**, sin gate detrás | **A** — el escape se hace. Sigue etiquetado **AGREGA** y vive en el carril 3: se ejecuta, pero es lo primero que se corta si falta tiempo |
| **D7** | ¿Rebuild del binario RN por la telemetría? | **A** ahora, desde Android · **B** esperar al próximo binario | **B.** No son 2 h de env: son App Privacy + privacy manifest + Notes for Review desde una cuenta Apple individual de un tercero, con 5.1.1(ix) vivo | **A pero DIFERIDA al martes 2026-08-25** — el owner quiere el rebuild y pidió **que se le recuerde ese día**. Hasta entonces la ceguera de la telemetría RN se declara y **G-ASC se lee el 25-08**, no antes |

**Única divergencia con la recomendación: D7.** El spec recomendaba **B** (esperar al próximo binario) y el
owner eligió **A**, pero **diferida al 25-08**: en la práctica es B hasta el martes y A desde el martes, con
recordatorio explícito. Las otras seis coinciden con la recomendación.

### Defaults declarados (no son decisión)

La North Star excluye al coach que se autoinvita y se acompaña de la métrica-guarda «primer login a <120 s» ·
el bloque de invitación del drip apunta a `/coach/clients?invite=1`, no a `/join` · el `signOut` que se vuelve
local es **solo** el del camino de error de RN (`apps/mobile/app/(auth)/login.tsx:230`); el logout deliberado
(`apps/mobile/lib/auth-actions.ts:69`) sigue **global**, que es la política segura para un teléfono perdido ·
la telemetría RN no se recupera acá y se declara la ceguera.

---

## 9. Riesgos y mitigación

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Matar el muro borra todas las altas free**: `register.actions.ts:274-276` borra `coaches` y el `auth.user` si el correo de confirmación falla, y con `email_confirm: true` el `generateLink({type:'signup'})` que lo emite **siempre** falla. **Segunda consecuencia del mismo hecho:** `email_confirm: true` sella `auth.users.email_confirmed_at` en la creación ⇒ la verificación blanda de D1 nace inerte si se lee de GoTrue | Sacar el `delete` + `deleteUser` del camino free y pasar el correo a recordatorio no bloqueante (`type:'magiclink'`, patrón vivo en `send-coach-email-confirmation.ts:47-51`). Para la segunda consecuencia: `coaches.email_verified_at` (W3.0, regla 11 de §5) — es lo que hace legibles a W3.8, W3.11 y el guardarraíl. Gate: `actions.test.ts` **actualizado** — existe, 9 tests, y pinnea lo que cambia (`:342` espera `/verify-email`, `:353` espera `pending_email`) |
| R2 | **Pre-account takeover**: con `email_confirm: true`, quien registre primero el correo de la víctima **conserva su contraseña** cuando ella entra por Google. **Resuelto G-AUTH (23-08):** el enlace automático por correo **no es configurable** en Supabase, y su regla —se borran las identidades **sin confirmar** al enlazar— es justo lo que hoy nos protege y lo que W3.1 anula | **Ya no es un gate: es código.** **W3.13** rota la contraseña con `service_role` cuando el usuario ya tenía identidad `email` y `coaches.email_verified_at IS NULL`, marca el correo como verificado (Google lo probó) y emite `google_link_rotated_password`. El intruso pierde el acceso; el coach legítimo entra por Google y puede resetear su clave. **W3.13 viaja en el mismo tren que W3.1**: sin ella, D1 = A **no** se despliega |
| R3 | **Matar el muro puede traer altas basura.** (La premisa vieja —«el anti-abuso puede estar apagado por env»— **quedó refutada el 23-08 por G-ENV**: `TURNSTILE_SECRET_KEY` existe en Production y `UPSTASH_REDIS_REST_URL/TOKEN` en Production y Preview, así que ni `register.actions.ts:89` ni `lib/rate-limit.ts:6-11` degradan) | **Los tres frenos están confirmados vivos**: honeypot (`:83-85`), Turnstile y el tope de 3 free/IP/7 d (`:160`), más los rate limits de Upstash; se suma la guardia de dominio mal tipeado. Control: `register_failed` por código y % de altas `active` sin **`coaches.email_verified_at`** a 7 días (nunca `auth.users.email_confirmed_at`, que bajo D1 = A nace seteado para todos), **como columnas de W0.1** y solo con `n ≥ 20`. Salida rápida: la bandera de Edge Config de §2.2; `free_tier_kill_switch` (`proxy.ts:122-132`) solo corta `/register` hacia adelante |
| R4 | **Reputación de Resend** con el drip yendo a correos no probados | El **drip** (no la bienvenida, transaccional) se salta al coach sin **`coaches.email_verified_at`** pasadas 24 h. Leerlo de `auth.users.email_confirmed_at` no saltaría a nadie: bajo D1 = A esa columna nace seteada (regla 11 de §5) |
| R5 | **Colisión con [vive-tu-app-directo](../vive-tu-app-directo/PLAN.md)**: sus W3 y W1 tocan 8 archivos de este plan | Contrato de archivos en el [PLAN](PLAN.md). La wave del alumno **no arranca** hasta que VTA W3 esté mergeada, o la ejecuta el mismo worker en el mismo diff. **Ya no hay riesgo de decisión, solo de calendario:** las cuatro decisiones de VTA (**D1 = A · D3 = A · D4 = B · D8 = A**) las respondió el owner el 23-08 y están anotadas en su TASKS, así que VTA W3 puede arrancar cuando se la programe |
| R6 | **Árbol sucio con trabajo propio sin commitear** (verificado con `git status` el 23-08): `(auth)/register/page.tsx` (estados `:175`, `:177`, el efecto que los llena y **el render del escape `:669-687`**), `components/auth/CaptchaSlot.tsx`, `components/auth/TurnstileWidget.tsx` (**archivo nuevo, sin trackear**), `instrumentation-client.ts` y `public/sw.js`. **Corrección del 23-08: NO son de otra sesión** — son el **fix de Turnstile de esta misma sesión** (render explícito con callbacks contra Sentry EVA-NEXTJS-1H/1J, documentado en `TurnstileWidget.tsx:9`) | **Se commitean antes de que W3 arranque** (commits por ruta explícita, push directo, **nunca** `pull --rebase --autostash` con workers activos). Lo ya escrito **no se replanifica**. La coordinación que queda es de **orden, no de negociación**: **W3.6, W3.6b, W3.6c y W3.9 arrancan después de ese commit**. El árbol sí es compartido con la sesión de VTA, y eso lo cubre R5 |
| R7 | **Split por runtime**: el copy de la invitación y el orden de la guía viajan en `packages/*` | Declarado (regla 9). OTA de RN **antes** del deploy web, solo a 1.1.1/1.1.2 |
| R8 | **La escritura del primer login toca el camino de login del alumno** | `service_role`, `UPDATE` único por PK **esperado** (nunca lanza, nunca devuelve error), PostHog por `after()`, sin grant a `authenticated`; cero queries nuevas en el proxy |
| R10 | **D3 = A deja al alumno entrando a una app vacía**: `first_client` pasaría **antes** de `first_artifact`, así que el alumno invitado a los 6 min abre una app sin nada asignado, y la North Star lo cuenta como activado igual | **Mitigado por ahora vía D3 = C:** no se reordena, así que el riesgo no se corre. Si la regla de disparo de D3 se cumple, A entra **con** la plantilla de un toque obligatoria en el mismo diff (el catálogo por persona ya existe, W8.2.7 de onboarding-v2) **o** con el estado vacío del alumno declarado y «volvió a los 7 días» sumado a W0.1. Sin una de las dos, W5 compra activación y vende retención |
| R11 | **La «verificación blanda» de D1 no tiene superficie ni señal**: con `email_confirm: true` y un dominio mal tipeado la cuenta queda viva e **irrecuperable** (no hay reset sin correo), y la cohorte ya tiene un caso (`gmail.` + `con`). Peor: la señal obvia —`auth.users.email_confirmed_at`— nace seteada por el propio `email_confirm: true`, así que banner, drip y guardarraíl no distinguirían a nadie | Primero la **señal**: `coaches.email_verified_at` escrita solo por `service_role` (W3.0, regla 11 de §5). Después la **superficie**: banner persistente mientras `email_verified_at IS NULL` («Verifica tu correo para poder recuperar tu clave» + reenviar, W3.11) y el guardarraíl «`active` sin `email_verified_at` a 7 días ≤ 15 %» medido de verdad (W0.1, con `n ≥ 20`). La guardia de W3.6 es no bloqueante y solo cubre typos conocidos |
| R9 | **Con Free = 1, activar y chocar el muro de cupo son el mismo evento** | Se declara como confusor y se corrige solo el copy del medidor antes del primer alumno (§6). **No se reabre pricing v3.** Anotado: `cap-nudge` (09:00 CL) manda el correo de venta la mañana siguiente al único momento de éxito del coach |

---

## 10. Críticas descartadas

Las tres críticas adversariales aportaron 12 BLOQUEA. Se resolvieron todos salvo estos:

1. **«El paso 5 tilda con "entró", no con "entrenó"».** → D5, recomendación **no cambiarlo**: reabre la
   semántica del paso 5 y «confeti único», cerradas el 22-08. El chip «Entró hace X» da la misma información.
2. **«Mover el destino del ad con split 50/50».** La campaña está congelada hasta el 25-08 y un conjunto nuevo
   reinicia el aprendizaje; con ~56 sesiones pagadas al día, 7 días de split no distinguen nada. Queda en §7.
3. **«Barrido a 7 días de cuentas sin verificar».** Es un cron que **borra `auth.users` en LIVE** por un campo
   que este mismo cambio deja de exigir, y rompe al coach con correo mal tipeado que ya creó alumnos. Si
   alguna vez se hace: soft-disable por `subscription_status`, dry-run y ledger.
4. **«Columna `coaches.brand_touched_at`».** `hasCustomBrand` (`onboarding-v2.queries.ts:64-69`) ya devuelve
   `true` con `theme_preset_key` y la guía **siempre** lo escribe al guardar.
5. **«Los dos `signOut` de RN a `scope:'local'`»**: solo los de los caminos de error (`login.tsx:220` y
   `:230`); el logout deliberado (`auth-actions.ts:69`) debe seguir revocando el refresh token. **«Registro de
   una sola pantalla / sacar `brand_name`»**: el `slug` sale de ahí (`register.actions.ts:165-172`).

---

## 11. Lo que este SPEC NO verificó

El **valor** de `NEXT_PUBLIC_APP_URL` (está marcada *Sensitive* y el CLI devuelve solo el nombre; su **host**
sí se sabe: `www`, por `lib/site-url.ts:9-11`) · el estado real de los App
Links en un device con la app de **Play** instalada y si la SHA-256 de
`apps/web/public/.well-known/assetlinks.json` es la clave de App Signing (G-APPLINKS, compartido con VTA) · el
estado de App Privacy en App Store Connect (G-ASC, decide D7) · el comportamiento real del webview de
Instagram con el escape ya escrito por el fix de Turnstile de esta sesión · si el magic link de `/vive-tu-app` sobrevive la vista
previa de WhatsApp (se comprueba gratis y condiciona la
evolución passwordless de §7) · la **vigencia del OTP** de GoTrue, que es configuración del dashboard de
Supabase Auth y no del repo · si `auth.audit_log_entries` retiene lo suficiente para reconstruir el primer
login histórico (decidiría si la línea base se puede recalcular con la definición correcta, §2.1).

**Resueltos el 23-08, fuera de esta lista:** **G-ENV** — `TURNSTILE_SECRET_KEY` en Production y
`UPSTASH_REDIS_REST_URL/TOKEN` en Production y Preview (`vercel env ls`: nombres y antigüedad, nunca
valores): Turnstile y los rate limits **están activos**, R3 pierde su premisa y el callejón 15 se cierra ·
**G-AUTH** — el enlace automático de identidades **no es configurable** y borra las identidades sin confirmar
([doc oficial](https://supabase.com/docs/guides/auth/auth-identity-linking)), así que R2 deja de ser una
pregunta al dashboard y pasa a ser **código (W3.13)**.

**Resuelto en la revisión final (23-08): G-GRANT sale verde.** `coaches.invite_code` **sí** está en el
column-grant de `anon` — migración `20260617033845_coaches_restrict_anon_select_to_branding.sql:19-25` y
`SELECT` sobre `information_schema.column_privileges` en LIVE. D6 deja de estar bloqueada por seguridad.
