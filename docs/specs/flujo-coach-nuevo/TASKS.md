---
status: active
owner: product-engineering
last_verified: "2026-08-23"
canonical: false
---

# TASKS — Flujo del coach nuevo

Contrato: [SPEC](SPEC.md) · Plan: [PLAN](PLAN.md). Estado: **nada empezado; cero código.**

## Resumen para el owner

**Prioridad del 23-08: que lo que ya tenemos funcione fluido y cómodo va primero. Agregar cosas es extra.**

**Qué arregla (43 h, 34 tareas — el 66 % del plan)**

- El coach ya no tiene que abrir el correo para entrar: se registra y queda adentro, en el celular, sin volver a loguearse.
- El coach ve SU marca en su panel y en el splash de la app, en vez del logo de EVA.
- El alumno recibe su usuario y su clave en el MISMO WhatsApp: deja de tener que ir a buscarla al correo.
- Sin teléfono, ese mensaje va sin clave: una credencial nunca se manda al selector de contactos.
- El coach ve «Entró hace 3 min» en vez de «Pend. sync», que no significa nada para nadie.
- El correo del día 1 deja de prometer que el alumno «se registra solo» y lleva al alta que sí funciona.
- Se cae el «Tu alumno baja EVA»: la app todavía no está pública en Play y el alumno entra por el navegador.
- El alumno que ya tiene cuenta deja de morir en «escríbenos a soporte».
- El coach que se equivoca de login en la app deja de perder la sesión en TODOS sus dispositivos.
- Quien abre «olvidé mi contraseña» en Android con la app instalada puede cambiarla de verdad.
- El botón de Google dentro de Instagram deja de ser un callejón: ofrece «Abrir en el navegador» antes.
- Nadie puede quedarse con la cuenta de otro registrando su correo antes que él: al entrar el dueño por
  Google, la contraseña del que se adelantó deja de servir.

**Qué mide (16 h, 13 tareas).** La línea base congelada y la consulta semanal que dice si esto sirvió, con
«sin lectura» cuando hay pocos coaches, y la señal real de «el alumno entró». El «por qué no invitaron» sale
de esos datos, no de escribirle a nadie: el contacto directo quedó descartado.

**Qué agrega — extra a estudiar, no bloquea nada (3 h en 2 tareas + 4 h condicionales en 2 más).** El «pídele
acceso» en el login de marca, la recarga automática si sale un deploy mientras alguien se registra, y
reordenar la guía (pospuesto: la caída está en el paso 2, que arregla otra spec).

**Qué necesita el owner.** **Ya nada para arrancar:** las once decisiones están respondidas (23-08) y los
gates de env y de auth, resueltos. Quedan dos cosas suyas: **QA en device al final de cada wave** (su Android
con la app de Play y un iPhone) y **volver a D7 el martes 25-08** — dijo que sí al rebuild del binario RN,
pero diferido a ese día, y pidió que se le recuerde.

**Horas:** ARREGLA 43 · MIDE 16 · AGREGA 3 · gates y decisiones 2 = **64 base** (+4 condicionales).

---

Convención: `- [x]` hecho · `- [~]` parcial (con **Pendiente:**) · `- [ ]` pendiente. Cada tarea nombra el
archivo de entrada, el criterio de aceptación, el gate ejecutable y el modelo del worker.

**Etiqueta por tarea (prioridad del owner, 23-08).** Cada tarea lleva **ARREGLA**, **MIDE** o **AGREGA** justo
después del id. **ARREGLA** = hoy se rompe, confunde, expulsa de la sesión o le miente al coach o al alumno.
**MIDE** = instrumentación; el cliente no lo ve. **AGREGA** = capacidad nueva; el flujo hoy funciona sin eso.
Tres aclaraciones para que nadie las discuta después: **W3.0 y W1.1 son MIDE** (son señales, no superficies)
pero **corren en el carril 1**, porque sin ellas W3.8, W3.11 y el chip «entró» quedan inertes · **W2.12** es
ARREGLA con un primer paso MIDE (`(a)`, medir antes de escribir el copy) · en **W6** la etiqueta dice **qué
verifica** cada punto, no qué cambia.

**Reglas de ejecución que valen para TODAS las tareas.** Árbol compartido y sucio: commits **por ruta
explícita**, push directo, **nunca** `pull --rebase --autostash` con workers ajenos activos; gates en worktree
limpio. Nada de `db push` ciego ni DDL destructiva; ninguna migración aplicada se edita. Toda wave con RN
publica **OTA antes** del deploy web, solo a los runtimes 1.1.1 y 1.1.2, con `eas update` por plataforma
separada. `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false npx vitest run` se corre **desde la raíz**, nunca con
`--filter`.

---

## Gates de entrada (jefe + owner, sin código)

Ninguna wave marcada abajo arranca sin su gate. Las respuestas se escriben **en esta sección**.

- [x] **G-ENV** — **Resultado (23-08, jefe): VERDE.** Leído con `vercel env ls production` (nombres, nunca
  valores). `TURNSTILE_SECRET_KEY` **existe** en Production (102 d) ⇒ **Turnstile está ACTIVO** en el server
  (`register.actions.ts:89` no cae al no-op) · `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` **existen**
  en Production **y** Preview (135 d) ⇒ **los rate limits están ACTIVOS** (`lib/rate-limit.ts:6-11` no degrada)
  · `NEXT_PUBLIC_SITE_URL` = `https://www.eva-app.cl` · `NEXT_PUBLIC_APP_URL` está marcada **Sensitive** y el
  CLI no devuelve su valor, pero el host se sabe igual: `apps/web/src/lib/site-url.ts:9-11` documenta el 22-08
  que esa variable producía `https://www.eva-app.cl//c/<code>/login` — o sea **host `www`, con barra final**,
  que es justo lo que `publicAppUrl()` (`:13-17`) recorta.
  **Consecuencias, todas escritas donde corresponde:** (1) **W2.7 no aplica** — `publicAppUrl()` **no** sale
  por el apex; queda marcada `- [x] no aplica` y sus 1 h salen del cálculo. (2) El **callejón 15** de
  [SPEC §4](SPEC.md) pasa a **«verificado: no ocurre en producción»**; normalizar apex→www en `publicAppUrl()`
  queda como higiene **opcional (AGREGA)**, no como callejón. (3) **R3 pierde la premisa** «el anti-abuso
  puede estar apagado por env»: los tres frenos —honeypot, Turnstile y tope de 3 free/IP/7 d— están
  **confirmados vivos**, más Upstash. (4) **W2.8 y D6 dejan de depender de G-ENV**: con G-GRANT verde y
  Turnstile activo en `/join` (`join-request.actions.ts:61`), D6 es decisión de **producto** y nada más.
  **Queda un dato para W1.6:** no existe env de «correo del owner» (en `apps/web/src` solo `EMAIL_FROM` y
  `RESEND_API_KEY`), así que W1.6 declara `NORTH_STAR_REPORT_TO` y sin ella no envía nada.
- [x] **G-AUTH** — **Resultado (23-08, jefe): RESUELTO, y no por configuración: por código.** La
  [doc de identity linking de Supabase](https://supabase.com/docs/guides/auth/auth-identity-linking) dice dos
  cosas que cierran la pregunta: el **enlace automático por correo NO es configurable** en el dashboard (el
  toggle existe solo para el *manual* linking), y «when a new identity can be linked to an existing user,
  Supabase Auth will remove any other **unconfirmed** identities linked to an existing user».
  **Lectura, que es exactamente el riesgo R2:** **hoy** el alta free nace con `email_confirm: false`, así que
  la identidad `email` del intruso está **sin confirmar** y **se borra sola** cuando la víctima entra por
  Google — el ataque no funciona. **Bajo D1 = A** (`email_confirm: true`) esa identidad nace **confirmada**:
  Google se enlaza al mismo usuario y el intruso **conserva su contraseña**. Es un
  **pre-account takeover**, y **ningún gate del owner lo resuelve**: hay que escribirlo.
  ⇒ **W3.13** (abajo, carril 1, misma cadena que W3.1). **D1 deja de estar bloqueada por un gate** y pasa a
  ser decisión pura del owner: A **solo con W3.13**.
- [x] **G-GRANT** — ¿está `coaches.invite_code` en el column-grant de `anon`? **Resultado (23-08): SÍ, VERDE.**
  Evidencia: `supabase/migrations/20260617033845_coaches_restrict_anon_select_to_branding.sql:19-25` (`REVOKE
  SELECT … FROM anon` + `GRANT SELECT (… loader_icon_mode, invite_code) … TO anon`) y un `SELECT` sobre
  `information_schema.column_privileges` contra LIVE que hoy devuelve `invite_code` para `anon`.
  **Consecuencia:** W2.8 **no** arrastra migración de grants (vale 2,5 h) y **D6 deja de ser decisión de
  seguridad**: es de producto. El riesgo que queda —`/join` sin Turnstile si falta el secret,
  `join-request.actions.ts:56-63`— lo cubre G-ENV. Ojo: `getClientLoginCoach` se declara en
  `login.queries.ts:19`, pero **el `select` de 18 columnas está en `:28`**; ahí va `invite_code`.
- [ ] **G-APPLINKS** — En un device con la app de **Play** instalada: `adb shell pm get-app-links
  cl.evaapp.eva`, y confirmar que la SHA-256 de `apps/web/public/.well-known/assetlinks.json:8` es la clave de
  **App Signing** de Play. Comprobarlo desde **los dos hosts**: `vercel.json:14` excluye `.well-known/` del 308
  apex→www. Extenderlo a `/reset-password` y `/coach/subscription`, que la app también reclama
  (`apps/mobile/app.json:105,150` y `:164-165,179-180`). **Es el mismo G1 de
  [vive-tu-app-directo](../vive-tu-app-directo/TASKS.md): correrlo UNA vez.** **Decide** W4.2 y la matriz de
  QA. **Resultado:** _pendiente_.
- [ ] **G-ASC** — Estado de App Privacy / privacy manifest en App Store Connect. **Se lee el martes
  **2026-08-25**, no antes: el owner decidió D7 = A (sí al rebuild) pero **diferido a ese día**, así que leer
  hoy el estado de App Privacy no cambia nada y se releería igual. **Resultado:** _pendiente hasta el 25-08_.
- [x] **G-BASE** — **Resultado (26-08): CORRIDO contra LIVE (solo SELECT, Supabase MCP) y CONGELADO.**
  Ventana de la baseline = la del [SPEC §1.1](SPEC.md): coaches creados **2026-08-18 00:00 UTC →
  2026-08-23 16:12 UTC**, con el corte de datos en el mismo instante (así se reproduce la foto del 23-08,
  no la de hoy). **n = 29 · invitaron 7 (NS) / 8 (cruda) · activados 5 · maduros a 72 h 8 · activados
  dentro de 72 h 2 ⇒ North Star 25,0 %** — coincide 1:1 con la aceptación de W0.1. Fila completa y
  consulta pegadas en W0.1.
  La advertencia de la cota (`last_sign_in_at` = último login) queda vigente; `auth.audit_log_entries`
  no hizo falta: con corte histórico la cota reprodujo la baseline sin ambigüedad en esta ventana.
  **Dos descubrimientos que la consulta deja escritos:** (1) la exclusión del autoinvitado por
  `normalizePlatformEmail` captura **cero** casos de esta cohorte: #28 (`palaciosjob98` → alumno
  `jobpal46`, creado 5 min tras el alta, sin teléfono, nunca entró) usó un **segundo correo sin parentesco
  textual** ⇒ la consulta lleva una lista manual `self_invites_manual` sembrada con ese par, y el «7» sale
  de normalización **más** lista, nunca de la normalización sola. (2) `coaches.primary_color` tiene
  DEFAULT (todas las filas lo traen): «color propio» = distinto de `#1462DC` (default actual) **y**
  `#10B981` (default pre-cambio); con esa definición el post-v2 da 4/9 = 44 %, el número exacto del SPEC.
- [x] **G-DEC** — **Resultado (23-08, tarde): las ONCE decisiones respondidas.**
  **De este spec:** **D1 = A** (se mata el muro del correo; arrastra W3.0 y W3.13, que no son opcionales) ·
  **D2 = A** (la clave viaja en el WhatsApp **solo con teléfono**) · **D3 = C** (no reordenar la guía por
  ahora; cerrada por el jefe con la regla de disparo, W5 queda condicional) · **D4 = A** (marca prendida al
  nacer, con el camino de escritura arreglado y backfill acotado) · **D5 = A** (el aha no cambia; cerrada por
  el jefe) · **D6 = A** (el escape «pídele acceso» **se hace**; sigue etiquetado AGREGA y vive en el carril 3,
  o sea se ejecuta pero es lo primero que se corta si falta tiempo) · **D7 = A pero DIFERIDA al martes
  **2026-08-25**: el owner quiere el rebuild del binario RN, y pidió **que se le recuerde ese día**.
  Hasta entonces la telemetría RN sigue ciega y se declara; **G-ASC se lee el 25-08**, no antes.
  **De [vive-tu-app-directo](../vive-tu-app-directo/TASKS.md), registradas en su propio TASKS:** **D1 = A** ·
  **D3 = A** · **D4 = B** · **D8 = A**.
  **Consecuencia para este plan:** **W2 ya no espera ninguna decisión** — solo el **merge de VTA W3**, que
  ahora sí puede arrancar porque su D4 = B está resuelta. Ninguna wave de acá queda bloqueada por el owner.
  **RECORDATORIO VIVO: el martes 25-08 hay que volver a D7** (rebuild + App Privacy + privacy manifest +
  Notes for Review, desde la cuenta Apple individual de un tercero, con 5.1.1(ix) vivo).

---

## W0 — Medir sin migrar (2 workers: `web-medicion` Opus, `rn-chip` Sonnet)

Objetivo: que la North Star se pueda leer y que el coach vea la verdad, **sin una sola migración**.

- [x] **W0.1** · **MIDE** (medición · Opus, 1,5 h) Consulta de cohorte semanal, guardada **en esta sección** (no en
  `scripts/`: no es código de producto). Esqueleto obligatorio: `coaches` ⋈ `auth.users` por `id` para traer el
  correo (**`coaches` NO tiene columna `email`** — verificado en el `Row` de
  `apps/web/src/lib/database.types.ts`; lo único parecido es `trial_used_email`), purga de cuentas de prueba
  **por lista de correos, nunca por dominio** (`@evatest.cl` lo comparten los alumnos demo),
  `active_org_id IS NULL`, y por coach: `min(clients.created_at)` con `is_demo IS NOT TRUE AND
  is_archived = false AND org_id IS NULL AND team_id IS NULL` (el predicado canónico **completo** de
  [SPEC §2.1](SPEC.md); el esqueleto viejo omitía las dos últimas) como «invitó»,
  `min(auth.users.last_sign_in_at)` del alumno como «entró» —**cota, no la métrica: ver G-BASE**—, exclusión
  del auto-invitado **normalizando los dos correos con `normalizePlatformEmail`**
  (`apps/web/src/lib/auth/platform-email.ts`; en crudo, `coach+alumno@gmail.com` y los puntos de Gmail pasan
  limpio), y la métrica-guarda «primer login a menos de 120 s del alta del alumno» **más «mismo teléfono que
  el coach»**.
  **Columnas obligatorias de los cinco guardarraíles de [SPEC §2.2](SPEC.md)**, una fila por semana: % marca
  propia (color y logo), % persona, altas por encima del tope de 3 free/IP/7 d, y **% de altas `active` sin
  `coaches.email_verified_at` a 7 días**. Sin esto, «si alguno cae se revierte» no tiene instrumento.
  **La señal de correo verificado es `coaches.email_verified_at`, NO `auth.users.email_confirmed_at`**: con
  D1 = A el alta free nace con `email_confirm: true` y GoTrue sella `email_confirmed_at` en la creación, así
  que esa columna daría 0 % para siempre (regla 11 de [SPEC §5](SPEC.md)). **Antes del deploy de W3 la columna
  todavía no existe**: hasta entonces la señal equivalente **sí** es `auth.users.email_confirmed_at` —hoy
  ningún alta free nace confirmada— y el backfill de **W3.0** copia esa columna a `email_verified_at`, con lo
  que las dos lecturas quedan unificadas y la línea base de G-BASE sigue siendo comparable.
  **`n` MÍNIMO POR FILA (regla dura):** cada guardarraíl se lee **solo con `n ≥ 20` coaches en la ventana** (o
  2 semanas acumuladas, lo que llegue primero). La consulta devuelve una columna `n` por guardarraíl y **NULL
  —no 0, no un porcentaje—** cuando no llega al mínimo; el reporte imprime **«sin lectura»**. Con la cohorte
  de hoy (n = 9, marca-color en 44 %) un coach de diferencia mueve el indicador 11 pp: sin este piso, el
  guardarraíl dispararía reverts por ruido, que es lo contrario de [SPEC §2.3](SPEC.md).
  **Aceptación:** con el predicado de la North Star —es decir **con** la exclusión de la autoinvitación—
  devuelve **7 coaches que invitaron** y **5 activados** en la ventana 18-08 → 23-08, y **2 de 8** dentro de
  72 h. Reporta además la columna cruda **sin** la exclusión (**8**) para poder conciliar con R5 §3.3. Si no
  coincide, la consulta está mal, no el informe.
  **Gate:** ejecución real contra LIVE (SELECT), resultado pegado acá. ✅ **CORRIDO 26-08.**

  **Resultado (26-08, baseline congelada — ventana SPEC §1.1: coaches 18-08 00:00 UTC → 23-08 16:12 UTC,
  corte de datos = 23-08 16:12 UTC):**

  | semana | n | invitaron NS | cruda | activados | maduros 72 h | act. 72 h | North Star | color propio | logo | persona | sobre tope IP | active sin verif. 7 d | logins <120 s | mismo fono |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | 2026-08-17 | 29 | **7** | **8** | **5** | 8 | **2** | **25,0 %** | 17,2 % (5/29; post-v2 4/9 = 44 %) | 13,8 % (4/29; post-v2 3/9) | 27,6 % (8/29; post-v2 7/9) | 0 | **sin lectura** (n active a 7 d = 0) | 1 | 0 |

  **Aceptación coincidente 1:1** (7 / 8 / 5 / 2-de-8 = 25 %). Notas de lectura: (a) los % de marca/persona
  tienen lectura porque n = 29 ≥ 20, pero mezclan 20 altas pre-v2 (el 44 % del SPEC es post-v2 puro; las
  corridas semanales futuras ya serán 100 % post-v2); (b) el único login < 120 s es el alumno
  `rgonzalez@contaex.cl` de `gabriel.imendezgomez` (entró 13 s después del alta): firma de auto-test del
  coach probando la cuenta, con correo y teléfono ajenos ⇒ **no** se excluye, queda como señal; (c) «active
  sin verificar a 7 d» usa hoy `auth.users.email_confirmed_at` (la columna `coaches.email_verified_at` no
  existe hasta W3.0, como esta misma tarea documenta) con la forma NULL-safe
  `email_confirmed_at IS NULL OR email_confirmed_at > created_at + 7 days`; (d) purga de cuentas de prueba
  de **coach** con el espejo exacto de `isTestCoachEmail` / migración `20260614130000` (`NOT ILIKE
  '%@evatest.cl'` + `juanmvr2706@gmail.com`) — los **alumnos** jamás se purgan por dominio (`is_demo` ya
  excluye los demo, que comparten `@evatest.cl`); en esta ventana la purga remueve 0 coaches.

  **La consulta canónica** (semanal: cambiar `desde`/`corte` en `params`; para la corrida semanal `corte`
  = `now()` y `desde` = inicio de historia que se quiera acumular):

  ```sql
  with params as (
    select timestamptz '2026-08-18 00:00:00+00' as desde,
           timestamptz '2026-08-23 16:12:00+00' as corte
  ),
  test_coach_emails(email) as (values ('juanmvr2706@gmail.com')),
  -- Autoinvitados confirmados a mano que la normalizacion NO captura (segundo correo).
  -- #28 de la cohorte 18→23-08: palaciosjob98 creo a jobpal46 5 min despues de su alta (SPEC §1.1).
  self_invites_manual(coach_email, client_email) as (
    values ('palaciosjob98@gmail.com', 'jobpal46@gmail.com')
  ),
  -- Defaults historicos de primary_color: la columna SIEMPRE viene seteada; «propio» = distinto de estos.
  default_colors(color) as (values ('#1462DC'), ('#10B981')),
  cohorte as (
    select c.id, c.created_at, lower(u.email) as email, c.persona, c.primary_color, c.logo_url,
           c.subscription_status, c.registration_ip, u.phone as coach_phone, u.email_confirmed_at
    from public.coaches c
    join auth.users u on u.id = c.id            -- coaches NO tiene columna email
    cross join params p
    where c.created_at >= p.desde and c.created_at <= p.corte
      and c.active_org_id is null
      and u.email not ilike '%@evatest.cl'
      and lower(u.email) not in (select email from test_coach_emails)
  ),
  alumnos as (
    select cl.coach_id, cl.id, lower(cl.email) as email, cl.created_at, cl.phone, u2.last_sign_in_at
    from public.clients cl
    cross join params p
    join cohorte co on co.id = cl.coach_id
    left join auth.users u2 on u2.id = cl.id    -- clients.id = auth uid del alumno (verificado en LIVE)
    where cl.is_demo is not true and cl.is_archived = false
      and cl.org_id is null and cl.team_id is null
      and cl.created_at <= p.corte
  ),
  -- normalizePlatformEmail (apps/web/src/lib/auth/platform-email.ts) en SQL
  norm as (
    select x.raw,
      case
        when x.dom in ('gmail.com','googlemail.com')
          then replace(split_part(x.loc,'+',1),'.','') || '@gmail.com'
        when x.dom in ('outlook.com','hotmail.com','live.com')
          then split_part(x.loc,'+',1) || '@' || x.dom
        else x.loc || '@' || x.dom
      end as norm
    from (
      select distinct e as raw, split_part(e,'@',1) as loc, split_part(e,'@',2) as dom
      from (select email as e from cohorte union select email from alumnos) s
    ) x
  ),
  alumnos_f as (
    select a.*, co.created_at as coach_created, co.coach_phone,
      (na.norm = nc.norm
       or (co.email, a.email) in (select coach_email, client_email from self_invites_manual)) as self_inv
    from alumnos a
    join cohorte co on co.id = a.coach_id
    join norm na on na.raw = a.email
    join norm nc on nc.raw = co.email
  ),
  por_coach as (
    select co.id, co.created_at, co.persona, co.primary_color, co.logo_url,
           co.subscription_status, co.registration_ip, co.email_confirmed_at,
      count(a.id) filter (where not a.self_inv) > 0 as invito_ns,
      count(a.id) > 0 as invito_crudo,
      bool_or(a.last_sign_in_at <= p.corte) filter (where not a.self_inv) as activado,
      bool_or(a.last_sign_in_at <= co.created_at + interval '72 hours') filter (where not a.self_inv) as activado_72h,
      co.created_at + interval '72 hours' <= p.corte as madura_72h,
      co.created_at + interval '7 days' <= p.corte as madura_7d,
      count(a.id) filter (where a.last_sign_in_at is not null
        and a.last_sign_in_at - a.created_at < interval '120 seconds') as guarda_login_120s,
      count(a.id) filter (where a.phone is not null and co.coach_phone is not null
        and right(regexp_replace(a.phone, '\D', '', 'g'), 8)
          = right(regexp_replace(co.coach_phone, '\D', '', 'g'), 8)) as guarda_mismo_fono
    from cohorte co
    cross join params p
    left join alumnos_f a on a.coach_id = co.id
    group by co.id, co.created_at, co.persona, co.primary_color, co.logo_url,
             co.subscription_status, co.registration_ip, co.email_confirmed_at, p.corte
  ),
  sobre_tope_ip as (
    select date_trunc('week', semana.wk) as semana, sum(exceso) as altas_sobre_tope
    from (
      select date_trunc('week', created_at) as wk, registration_ip, greatest(count(*) - 3, 0) as exceso
      from por_coach
      where registration_ip is not null
      group by 1, 2
    ) semana
    group by 1
  )
  select
    to_char(date_trunc('week', pc.created_at), 'YYYY-MM-DD') as semana,
    count(*) as n,
    count(*) filter (where invito_ns) as invitaron_ns,
    count(*) filter (where invito_crudo) as invitaron_crudo,
    count(*) filter (where activado) as activados,
    count(*) filter (where madura_72h) as maduras_72h,
    count(*) filter (where madura_72h and activado_72h) as activados_72h,
    case when count(*) filter (where madura_72h) > 0
      then round(100.0 * count(*) filter (where madura_72h and activado_72h)
        / count(*) filter (where madura_72h), 1)
    end as north_star_pct,
    -- guardarrailes: NULL literal («sin lectura») bajo n >= 20
    case when count(*) >= 20 then round(100.0 * count(*) filter (where primary_color is not null
      and primary_color not in (select color from default_colors)) / count(*), 1) end as pct_marca_color,
    case when count(*) >= 20 then round(100.0 * count(*) filter (where logo_url is not null)
      / count(*), 1) end as pct_marca_logo,
    case when count(*) >= 20 then round(100.0 * count(*) filter (where persona is not null)
      / count(*), 1) end as pct_persona,
    coalesce(st.altas_sobre_tope, 0) as altas_sobre_tope_ip,
    case when count(*) filter (where madura_7d and subscription_status = 'active') >= 20
      then round(100.0 * count(*) filter (where madura_7d and subscription_status = 'active'
        and (email_confirmed_at is null or email_confirmed_at > pc.created_at + interval '7 days'))
        / count(*) filter (where madura_7d and subscription_status = 'active'), 1)
    end as pct_active_sin_verificar_7d,
    count(*) filter (where madura_7d and subscription_status = 'active') as n_active_7d,
    sum(guarda_login_120s) as guarda_logins_bajo_120s,
    sum(guarda_mismo_fono) as guarda_mismo_fono
  from por_coach pc
  left join sobre_tope_ip st on st.semana = date_trunc('week', pc.created_at)
  group by date_trunc('week', pc.created_at), st.altas_sobre_tope
  order by 1
  ```

  **Cuando W3.0 despliegue `coaches.email_verified_at`:** la expresión de «sin verificar a 7 d» cambia a
  esa columna (misma forma NULL-safe); hasta el backfill de W3.0 las dos lecturas son equivalentes, como
  ya documenta esta tarea.

- [x] **W0.2** · **ARREGLA** (web · Opus, 1,5 h) Chip honesto en el roster web. Entrada:
  `apps/web/src/app/coach/clients/DirRowCard.tsx:53-61` (`statusMeta`) y
  `apps/web/src/app/coach/clients/DirTableMobile.tsx:45-53` (`statusMeta` abre en `:45`; el label vive en
  `:51`). Reemplazar `Pend. sync` por los estados de [SPEC §6](SPEC.md).
  **REGLA DURA: mientras no exista la columna, el label NO puede decir «entró».** `force_password_change` se
  apaga en `changePasswordAction` (`c/[coach_slug]/login/_actions/login.actions.ts:203-205`), o sea cuando el
  alumno **completa** el cambio de clave, no cuando entra: el que entra y abandona esa pantalla —el caso más
  probable con una clave llegada por WhatsApp— quedaría «Todavía no entró» para siempre mientras la consulta
  de W0.1 lo cuenta como activado. En W0 el fallback dice **«Todavía no cambió su clave»**; el copy «entró»
  entra con W1.
  **La función pasa a ser pura y compartida** para que W1 solo cambie su entrada: firma
  `{ isArchived, isActive, firstLoginAt, forcePasswordChange }`.
  **La semántica vive en más lugares que el chip:** `ClientsDirectoryClient.tsx:68,85,88` (filtros) y
  `CoachWarRoom.tsx:220` (cuenta «activos» como `!force_password_change && is_active !== false`). **Default:
  los conteos se quedan con `force_password_change` hasta W1.5**; solo el chip cambia de significado.
  **Aceptación:** cero apariciones de «Pend. sync» en `apps/web/src`; el filtro `pending_sync` de
  `ClientsDirectoryClient.tsx` conserva su `key` (no se renombra el valor, solo el label).
  **Gate:** `npx vitest run apps/web/src/app/coach/clients` + `pnpm typecheck`.
  **Hecho 26-08.** Función pura en `_lib/client-status.ts` (`getClientStatusMeta` + adaptador
  `clientStatusInputFromRow`, test propio 8/8); gates verdes (vitest 100/100 del dir, typecheck).
  Además, por juicio del jefe: los labels de FILTRO «Pendiente sync» (`DirectoryActionBar.tsx:160,166,295`)
  pasaron al mismo copy canónico —la variante larga tenía el mismo mal que el chip—, keys intactas.
  Dos consecuencias visuales declaradas para el QA device del owner: la columna Estado de la tabla
  densa móvil pasó de 84 a 188 px (el copy largo se montaba sobre Score; alternativa era recortarlo)
  y el tono del chip pendiente se unificó en `info-700` (DirTableMobile usaba `info-600`).
- [x] **W0.3** · **ARREGLA** (RN · Sonnet, 1,5 h) Espejo del chip en RN. Entrada:
  `apps/mobile/components/coach/directory/directory-shared.ts:38`,
  `apps/mobile/components/coach/directory/DirRowCard.tsx:22`,
  `apps/mobile/app/coach/(tabs)/clientes.tsx:108`. Misma función pura, mismos cuatro labels.
  Mismo fallback honesto que W0.2 («Todavía no cambió su clave», nunca «entró», hasta W1).
  **Aceptación:** cero apariciones de «Pend. sync» en `apps/mobile`; `pendingSyncCount` y los filtros de
  `apps/mobile/lib/clients-directory.ts:239,243,265,268,275` conservan sus claves, y la bandera de atención
  `PENDIENTE_SYNC` de `:12,207` sigue significando «no cambió su clave» (no se renombra ni se recalcula acá).
  **Gate:** `pnpm --filter @eva/mobile exec tsc --noEmit` + `npx vitest run tests/mobile`.
  **Hecho 26-08.** `statusMeta` puro en `directory-shared.ts` (misma firma y labels que web); los dos
  llamadores conservan sus mapas de estilo 1:1 (cero cambio de color); `pendingSyncCount`, filtros y
  `PENDIENTE_SYNC` intactos. Labels de filtro «Pendiente sync» (`STATUS_OPTIONS`, `RISK_LABELS`,
  `DirectoryFilterSheet`) al copy canónico (mismo juicio que W0.2). Gates: tsc verde, tests/mobile
  1384/1384 verdes (la corrida del worker tuvo 7 timeouts por contención del árbol compartido; la
  corrida limpia del jefe salió 97/97 archivos).
- [x] **W0.4** · **ARREGLA** (RN · Sonnet, 0,5 h) El medidor de cupo deja de arrancar en «0 de 1». Entrada:
  `apps/mobile/lib/client-cap.ts:65-68` (`capMeterLabel`) y
  `apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx:352` (`FreeTierBanner`). Con `active === 0`
  el texto pasa a «Tu plan gratis incluye 1 alumno» (interpolado con `studentCountLabel`, nunca a mano).
  **No se toca ningún predicado de cupo ni el catálogo.** Copy literal (los **dos**, RN y web) en
  [SPEC §6](SPEC.md).
  **Aceptación:** en **RN**, con 1 o más alumnos el texto es idéntico al de hoy (`capMeterLabel` ya usa
  `studentCountLabel`, `packages/tiers/index.ts:140`). En **web sí cambia**: `DashboardShell.tsx:350-352` hoy
  interpola a mano `${activeClients}/${max} alumnos` y con Free = 1 dice «1/1 alumnos», con el plural mal ⇒
  pasa a `studentCountLabel` y queda «1 de 1 alumno · Plan gratuito». El predicado de cupo no se toca en
  ninguna de las dos.
  **Gate:** `npx vitest run tests/mobile` (el archivo que pinnea `capMeterLabel`) + `tsc` mobile.
  **Hecho 26-08, con un acote del jefe que la tarea no preveía:** la rama nueva de `capMeterLabel`
  quedó condicionada a `max === 1` (Free). Sin el acote, `subscription.tsx` —que pinta el anillo de
  CUALQUIER tier con la misma función— le decía «Tu plan gratis incluye 25 alumnos» a un Pro con 0
  alumnos. Pro/Elite con 0 siguen leyendo «0 de N alumnos activos»; test que lo pinnea. Web
  (`FreeTierBanner`) ya venía protegida por el guard `subscriptionTier === 'free'` y pasó a
  `studentCountLabel` (muere el «1/1 alumnos» con el plural mal). Gates verdes (client-cap tests,
  tsc, typecheck).
- [~] **W0.5** · **MIDE** (web · Opus, 2,5 h) **= W8.5.2 de [coach-onboarding-v2](../coach-onboarding-v2/TASKS.md)**:
  espejo de `recordOnboardingEvent` a PostHog + `$set { persona }` en el identify. Entrada:
  `apps/web/src/services/coach/persona.service.ts:375-389` (hoy solo inserta en la tabla; el `console.warn`
  del error se conserva). Vehículo: el patrón de `apps/web/src/lib/posthog/registration-events.ts`
  (`capturePostHogServerEvent`, con `distinctId = coachId`).
  **Aceptación:** todo evento de la tabla aparece en PostHog con `distinct_id = coach_id`; la captura es
  best-effort y **nunca** rompe la acción que la dispara; la tarea queda marcada `- [x]` en el TASKS de
  onboarding-v2 con referencia cruzada (**el id W8.5.2 no se renombra**).
  **Gate:** `npx vitest run apps/web/src/services/coach` + un evento real visible en PostHog desde preview.
  **Hecho 26-08 (parcial).** `recordOnboardingEvent` espeja a PostHog (`mirrorOnboardingEventToPostHog`:
  import dinámico de `server-capture` —proxy.ts importa este módulo—, `await` deliberado, espejo SOLO si
  el insert quedó, `$set { persona }` desde el metadata del evento); `server-capture.ts` ganó el campo
  opcional `set` (aditivo). `persona_selected` queda FUERA del espejo (`POSTHOG_MIRROR_SKIP`): sus 3
  call sites ya capturan explícito y espejarlo duplicaría el único evento en uso; en cambio esos
  captures ganaron `$set { persona }` (los 2 que no lo tenían). `demo_deleted` del dashboard web
  ruteado por el helper. Tests 24/24 + vecinos 151/152 (1 timeout ajeno).
  **Los DOS insert directos restantes: HECHOS 26-08** (worker `telemetry` de VTA). Ninguno de los dos
  endpoints cambió de forma: conservan su insert —su contrato HTTP depende de LEER el `error` (23503 ⇒
  404, 23505 ⇒ `deduped`, resto ⇒ 500) y `recordOnboardingEvent` se lo traga— y llaman al espejo
  APARTE, awaiteado, solo con la fila ya escrita. El espejo vive en
  `apps/web/src/lib/posthog/onboarding-event-mirror.ts` (nuevo, `server-only` + import estático de
  `server-capture`, patrón `registration-events.ts`): mismo contrato que la copia inline de
  `persona.service` —que NO puede importarlo porque a ese módulo lo carga `proxy.ts`— con el mismo
  `POSTHOG_MIRROR_SKIP` de `persona_selected`. Auditado que ningún evento queda espejado dos veces:
  los emisores reales son 4 tipos por la web y 4 por la app, y ninguno tiene captura client-side
  homónima (`invite_whatsapp_opened` sí la tiene, pero nunca llega a la tabla).
  **Pendiente (por eso sigue `[~]`):** el evento real visible en PostHog desde preview (no hubo deploy
  en esta tanda).
- [x] **W0.6** · **MIDE** (jefe, 0,5 h) Anotar en el TASKS de onboarding-v2 que W8.4.3 **cambia de nombre**: la señal es
  `first_login_at` (primer login), no `last_login_at`. Una columna de último login **no puede** responder
  «activado dentro de 72 h». **Aceptación:** la nota vive en ese archivo, no acá. **Gate:** `pnpm docs:check`.
  **Hecho 26-08** (nota en W8.4.3 de ese TASKS; docs:check verde).
- [x] **W0.7** · **ARREGLA** (jefe, 0,5 h) **Anotar en el TASKS de [vive-tu-app-directo](../vive-tu-app-directo/TASKS.md) —
  ahora, no al cierre.** Era W6.5 y llegaba tarde: VTA ya habría corrido. Se numeran **dentro de VTA** (V3.13,
  V1.27, V2.14 o los ids que correspondan) cuatro cosas: (1) el call site de W1.4 —una línea que llama a
  `recordStudentFirstLogin` en `c/[coach_slug]/login/_actions/login.actions.ts`, dentro del diff de V3.1, que
  hoy solo hace `signOut local` + `kind:'coach_account'` (`vive-tu-app-directo/TASKS.md:199-202`)— y los tres
  aportes: (2) `signOut({ scope: 'local' })` en `app/vive-tu-app/route.ts:45`, (3) atar `c=` al `coach_id` del
  demo en ese mismo route (`:38-42` valida `is_demo` y nada más), (4) rate limit en
  `POST /api/mobile/coach/vive-tu-app` (0 apariciones de `rateLimit` en sus 62 líneas).
  **Aceptación:** las cuatro existen como tareas numeradas en el TASKS de VTA **antes** de que arranque VTA
  W3. **Gate:** `pnpm docs:check`.
  **Hecho 26-08** — numeradas en el TASKS de VTA como **V3.13** (call site de W1.4, con la regla de no
  colisión), **V1.27** (`signOut` local), **V1.28** (atar `c=` al `coach_id`) y **V1.29** (rate limit del
  endpoint móvil); VTA W3 aún no arrancaba. docs:check verde.

- [x] **W0.8** · **DESCARTADA** (owner 23-08: contacto no solicitado = invasivo) Era «hablar por WhatsApp con
  los 21 coaches que no invitaron», con tres preguntas. **El owner la baja: escribirle a alguien que no lo
  pidió es invasivo, y esta app se vende sin hacer eso.** No se reemplaza por otro canal directo. Lo que
  quería saber —«no supe cómo» vs. «no tengo a quién meter»— se busca **con datos**: la consulta de W0.1
  (dónde se cae cada cohorte) y las **session recordings ya consentidas** (`lib/posthog/consent.ts:57`); si
  hiciera falta preguntar, se pregunta **dentro del producto y de forma opcional**, nunca por mensaje
  directo. Sus **1 h salen de MIDE y del total**, y sale del carril 2.

**Gate de salida de W0:** W0.1 corrida con resultado coincidente · gates base · `expo export --platform
android` (W0.3/W0.4 tocan RN) · **OTA antes del deploy web**.
**Estado 26-08:** W0.1 coincidente ✅ · typecheck web ✅ · tsc mobile ✅ · vitest dirigido (coach/clients
100/100, services/coach 24/24, tests/mobile 1384/1384) ✅ · docs:check ✅ · `expo export --platform
android` ✅ · **OTA y deploy web NO disparados**: los ejecuta el jefe de VTA al cierre de la ola conjunta
(acordado 26-08); hasta la OTA, web y RN muestran el label nuevo solo tras sus respectivos releases.

---

## W1 — La señal real (1 worker: `db-web` Opus)

Objetivo: que «el alumno entró» sea un dato del servidor y no una inferencia.

**Pre-vuelo 26-08 (verificación en seco contra el árbol, post-W0): las 16 citas de W1.1–W1.6 están
VIGENTES; cero drift material.** Matices para quien ejecute (no invalidan ninguna referencia):
(1) el `.select(...)` de `clients.queries.ts` está en `:29` (`:28` es el `.from`) y **no es un `'*'`
puro**: ya trae `workout_programs(...)` embebido; `ClientWithProgram` extiende `Tables<'clients'>` vía el
alias `Client` de `:6` — tras regenerar tipos (W1.1), `first_login_at` entra solo. (2) En
`login.actions.ts` la **resolución** del `client` vive en ~`:89-138` (guard `:141`); `:160-164` solo arma
el `redirectUrl` y el `return` — la línea de W1.4/V3.13 va entre esas dos cosas, como ya dice la tarea.
(3) `vercel.json` raíz declara hoy **12** crons (no 11): `checkout-abandoned` se sumó el 26-08; las 4
rutas sin declarar siguen siendo las mismas (`weekly-report-email`, `weekly-snapshot`,
`org-health-alert`, `payment-reminder`). (4) Entradas de W1.5 ya con nombre tras W0: web
`getClientStatusMeta` en `apps/web/src/app/coach/clients/_lib/client-status.ts`, RN `statusMeta` en
`apps/mobile/components/coach/directory/directory-shared.ts` — ambas ya reciben `firstLoginAt` en la
firma, así que W1.5 es cambiar la ENTRADA y el label, no los llamadores. (5) El baseline trae **tres**
policies UPDATE self redundantes sobre `clients` (`:2493`, `:2856`, `:2893`) — dato, por si W1.1 mira RLS.

- [x] **W1.1** · **MIDE** (DB · Opus, 1,5 h) — **Hecha 26-08.** Migración `20260826044738_clients_first_login_at.sql`
  escrita por la hermana y **aplicada en LIVE por el jefe de VTA** (protocolo BEGIN/ROLLBACK → apply →
  advisors; verificó en la misma transacción: 111 filas, 0 grants UPDATE para authenticated/anon sobre la
  columna). **Índice: NO se creó**, con evidencia en el header (111 filas; `idx_clients_coach_id` +
  `idx_clients_coach_id_created_at` + `idx_clients_coach_archived` ya cubren todo acceso; se revisa si la
  tabla crece 2 órdenes). `database.types.ts` regenerado (incluye `demo_client_count` del RPC admin, deuda
  declarada de VTA W4). Texto original de la tarea ↓ como referencia. Migración **aditiva** `<ts>_clients_first_login_at.sql`:
  `ALTER TABLE public.clients ADD COLUMN first_login_at timestamptz`. **Sin default. Sin
  `GRANT UPDATE(first_login_at) TO authenticated`** — `clients` tiene tres políticas de auto-UPDATE del propio
  alumno (`supabase/migrations/00000000000001_baseline.sql:2493`, `:2856`, `:2893`), así que un grant haría la
  North Star escribible desde el navegador con la anon key. `COMMENT ON COLUMN` que lo diga con esas palabras.
  Índice parcial por `coach_id` **solo si** el `EXPLAIN` de la consulta de W0.1 lo justifica.
  **La premisa del «sin grant» NO se verifica contra el baseline**: el baseline trae `GRANT ALL ON TABLE
  public.clients TO authenticated` (`:3599`), y quien mire solo ahí concluirá lo contrario y podría «arreglar»
  el grant. Lo que hace segura a la columna es
  `supabase/migrations/20260612140001_clients_scoping_grants.sql:36-37` (`REVOKE UPDATE ON public.clients FROM
  authenticated, anon` + allowlist de 17 columnas: **default-deny por columna**), **aplicada en LIVE** —
  citarla en el `COMMENT ON COLUMN`.
  **REGENERAR `apps/web/src/lib/database.types.ts`** tras aplicar: el roster web lee `select('*')` tipado
  (`apps/web/src/app/coach/clients/_data/clients.queries.ts:28`, `ClientWithProgram extends Tables<'clients'>`)
  y sin eso `client.first_login_at` no existe para TypeScript y `pnpm typecheck` cae.
  **Protocolo obligatorio:** `BEGIN … EXPLAIN (ANALYZE, BUFFERS) … ROLLBACK` contra LIVE → `apply_migration`
  → `get_advisors`. **Aceptación:** advisors limpio; `select ... from clients` con la anon key **no** permite
  actualizar la columna; `pnpm typecheck` verde con los tipos regenerados.
  **Gate:** evidencia de las tres corridas pegada en esta tarea.
- [x] **W1.2** · **MIDE** (web · Opus, 2 h) — **Hecha 26-08** (test 8 casos verdes; returning con
  `.is('first_login_at', null)` + `.select(...)` en un solo round-trip; todo lo de red —`getUserById` para
  `self_invited` y el capture— dentro del `after()`, así la respuesta solo paga el UPDATE por PK;
  `self_invited: null` cuando el correo del coach no se pudo resolver, nunca `false` falso. **Riesgo
  declarado:** `after()` tiene un antecedente en contra en el repo (`lib/meta/capi.ts:233-239`, camino con
  `redirect()`); estos call sites DEVUELVEN (caso soportado) y la cura está en el docblock — verificar
  `student_first_login` en PostHog al primer deploy.) `apps/web/src/services/client/student-login-signal.service.ts` (NUEVO):
  `recordStudentFirstLogin(admin, clientId): Promise<boolean>` con `UPDATE clients SET first_login_at = now()
  WHERE id = $1 AND first_login_at IS NULL`, `service_role`, **nunca lanza**. Si escribió, emite
  `student_first_login` a PostHog con `distinctId = coach_id` y `properties: { seconds_since_created,
  self_invited }` (`self_invited` = el correo del alumno coincide con el del coach).
  **Clean Architecture:** el servicio no importa nada de `app/`.
  **Aceptación:** dos llamadas seguidas escriben **una sola vez** y emiten **un solo** evento.
  **Gate:** test nuevo `student-login-signal.service.test.ts` con el `admin` mockeado.
- [x] **W1.3** · **MIDE** (RN/API · Opus, 0,5 h) — **Hecha 26-08** (route tests 64/64 verdes; el `clientId`
  sale de `validateMobileStudentWorkspace`, cuya variante `{ ok: true }` ganó `clientId: client.id` — la
  fuente correcta con identidades divididas, donde `clients.id !== auth.uid()`; la respuesta HTTP no cambia
  de forma y el id nunca sale al cliente). Call site del camino RN:
  `apps/web/src/app/api/mobile/auth/validate-student-workspace/route.ts`, en la rama `result.ok` (hoy
  devuelve `{ ok: true, forcePasswordChange }`, `:46-51`). Llamada **esperada** — el servicio nunca lanza y es
  un `UPDATE` por PK — y el capture de PostHog por `after()` de `next/server`.
  **PROHIBIDO el `void` / la promesa flotante:** la respuesta se devuelve inmediatamente después y Vercel
  congela la invocación ahí; es la trampa exacta que perdió 2 de 5 bienvenidas el 19-08, documentada en
  `apps/web/src/lib/email/free-coach-onboarding.ts:24-28`.
  **Aceptación:** la respuesta del endpoint no cambia de forma ni de latencia perceptible.
  **Gate:** `npx vitest run apps/web/src/app/api/mobile/auth` + `pnpm typecheck`.
- [x] **W1.4** · **MIDE** (web · Opus, 0,5 h) — **Hecha 26-08, post-merge de VTA W3 y con GO explícito del
  jefe de VTA (regla V3.13 cumplida: un solo escritor).** La llamada va tras el guard `if (!client)` y
  ANTES de la rama suspended — el alumno pausado que logra loguearse también ENTRÓ; usa la PK de
  `clients` (no el uid de auth) y el admin de service_role (la columna es default-deny: el action
  user-scoped no podría escribirla). Assert en `login.actions.test.ts` (7/7 verdes) + typecheck verde.
  **⚠ ARCHIVO DE VTA W3.** Call site del camino web:
  `apps/web/src/app/c/[coach_slug]/login/_actions/login.actions.ts`, tras resolver el `client` y antes de
  devolver el `redirectUrl` (`:160-164`). **Una línea.** Regla: la agrega **el worker de VTA W3 dentro de su
  diff** (queda escrito en el brief de esa wave), o W1.4 espera al merge de VTA W3. **Nunca** los dos a la vez.
  **Aceptación:** un login real de alumno en preview escribe la columna; el segundo login no la toca.
  **Gate:** `npx vitest run apps/web/src/app/c` (el test `login.actions.test.ts` que crea VTA V3.6).
- [~] **W1.5** · **ARREGLA** (web + RN · Opus, 2 h) — **Hecha 26-08 en código, con UN pendiente del cierre:**
  labels «Entró hace N min / Entró hoy / Entró hace N d» (key nueva `entered`, atraviesa los gates de chip
  existentes sin tocarlos) y regla de filas viejas: `first_login_at` NULL **jamás** dice «Todavía no entró»
  salvo que la fila haya nacido después de `FIRST_LOGIN_SIGNAL_CUTOVER` — constante duplicada web/RN a
  propósito (split por runtime), que nace en `'2100-01-01T00:00:00Z'`. **Pendiente del jefe de la ola: fijar
  ambas al ISO del deploy web** (mismo patrón que `VIVE_TU_APP_ENTERED_CUTOVER`); hasta entonces la rama
  «Todavía no entró» está dormida (degradación honesta). RN: `first_login_at` viaja en el select rico de
  `selectWithFallback` (server viejo no rompe). Tests: 19 web + 17 RN nuevos; corrida limpia 111 archivos /
  1531 verdes. QA device pendiente (regla de la wave). El chip pasa a leer `first_login_at`, y **recién acá** el copy dice
  «entró»; `force_password_change` queda como fallback para las filas viejas, con su propio label («Todavía no
  cambió su clave»). Entrada: la función pura de W0.2/W0.3 y los selects que alimentan el roster
  (`apps/mobile/lib/clients-directory.ts:215-228` ya parsea `forcePwChange`; sumar `firstLoginAt`).
  **Absorbe la vieja W4.3** (era la misma tarea, sobre el mismo archivo, en otra wave y con otro worker) ⇒
  cierra también la promesa de `apps/mobile/components/coach/directory/guided-invite.ts:145` («Cuando {nombre}
  entre por primera vez, lo ves en tu panel»), que hoy no tiene superficie.
  **Seguro contra un server viejo:** `apps/mobile/lib/clients-directory.ts:150-165` usa `selectWithFallback`.
  **Aceptación:** un alumno creado antes de la migración sigue mostrando el estado correcto; el chip RN
  muestra «Entró hace X» tras un login real.
  **Gate:** gates base + `tsc` mobile + `npx vitest run tests/mobile`.

- [~] **W1.6** · **MIDE** (web · Opus, 2 h) **«Calculado solo» deja de ser una promesa.** [SPEC §2.2](SPEC.md) fija la
  North Star «calculada sola» a 30 días, pero W0.1 es una consulta que alguien corre a mano y ninguna tarea la
  automatizaba: sin esto, «solo» significa «el jefe se acuerda el martes».
  Endpoint nuevo `apps/web/src/app/api/cron/north-star-weekly/route.ts`: corre la consulta de W0.1 con
  `service_role` (`createServiceRoleClient`) y manda **la fila de la semana** al owner por Resend, con las
  columnas de los cinco guardarraíles y **su `n`** (o «sin lectura» bajo el mínimo). **Sin UI nueva** y sin
  tocar ninguna pantalla.
  **Molde a reusar, verificado:** los 11 crons vivos se declaran en **`vercel.json` de la RAÍZ del repo**
  (`:20-65`), **no** en `apps/web/vercel.json`, que no existe — y hay rutas en `app/api/cron/` que **no** están
  declaradas ahí (`weekly-report-email`, `weekly-snapshot`, `org-health-alert`, `payment-reminder`) y por eso
  no corren: **la tarea no está hecha hasta que el cron esté en `vercel.json`**. Schedule: `0 13 * * 1`
  (lunes; `cap-nudge` usa `0 13 * * *` para su 09:00 CL, `vercel.json:61-64`). Auth: `CRON_SECRET` +
  `Authorization: Bearer`, **fail-closed sin el secret** — el molde simple está en
  `apps/web/src/app/api/cron/weekly-report-email/route.ts:13-17` y el endurecido, con `timingSafeEqual`, en
  `apps/web/src/app/api/cron/cap-nudge/route.ts:1,67-74`; se usa el endurecido. Envío:
  `sendTransactionalEmail` (`apps/web/src/lib/email/send-email.ts:14`), el mismo helper de todo el repo.
  **Destinatario:** no existe hoy ninguna env de «correo del owner» (verificado: solo `EMAIL_FROM` y
  `RESEND_API_KEY`) ⇒ se declara una nueva (`NORTH_STAR_REPORT_TO`) y el endpoint **no envía nada** si falta,
  igual que con `CRON_SECRET`. Se anota en el TASKS junto al resultado de G-ENV.
  **Aceptación:** un correo **real** recibido desde preview con la fila de la semana y el `n` de cada
  guardarraíl; con `n` bajo el mínimo la celda dice «sin lectura».
  **Gate:** ejecución manual del endpoint en preview (`curl` con el `Authorization: Bearer`) + `pnpm
  typecheck`; el correo recibido pegado como evidencia acá.
  **Hecho 26-08 (parcial — por eso `[~]`).** `services/metrics/north-star-weekly.service.ts` +
  `api/cron/north-star-weekly/route.ts` + tests (20/20 verdes) + **cron declarado en el `vercel.json` de
  la raíz** (13º, `0 13 * * 1`). Réplica TS de la consulta de W0.1 (PostgREST no corre SQL crudo ni ve
  `auth` ⇒ `auth.admin.getUserById` por id; cohorte chica). Purga con `isTestCoachEmail` canónico;
  autoinvitado = normalización + `SELF_INVITES_MANUAL` (caso #28, con test de que la normalización sola
  no lo captura). Ventana = semana ISO UTC anterior completa, corte de datos = now. Route: molde
  endurecido de `checkout-abandoned` (timingSafeEqual fail-closed, `?dry=1`, maxDuration 60); sin
  `NORTH_STAR_REPORT_TO` ⇒ 200 `{skipped}` + warn (env que falta ≠ envío roto, que sí devuelve 500).
  **Pendiente:** `curl` en preview + correo real como evidencia (requiere deploy, cierre de ola) ·
  **`NORTH_STAR_REPORT_TO` no existe en ningún entorno: la setea el owner en Vercel** · cuando W1.5
  aterrice, `loadClients` puede leer `first_login_at` en vez de pegarle a GoTrue por alumno (deuda
  anotada en el docblock del servicio) · con W3.0, la señal de verificación cambia de columna (comentario
  en el punto exacto).

**Gate de salida de W1:** migración aplicada y verificada · un login de alumno en preview escribe la columna
una sola vez · `student_first_login` visible en PostHog con `coach_id` · **el cron semanal declarado en
`vercel.json` y con un correo real recibido** · gates base.
**Estado 26-08:** migración aplicada+verificada ✅ · cron declarado ✅ · typecheck web ✅ · tsc mobile ✅ ·
vitest (señal 64/64 · cron 20/20 · roster 111 arch/1531 · services/client 51/51) ✅ · expo export android ✅.
**Quedan del cierre de ola (deploy/preview):** login real en preview escribe una vez · `student_first_login`
visible en PostHog · correo real del cron · fijar los DOS `FIRST_LOGIN_SIGNAL_CUTOVER` (web y RN) al ISO del
deploy · `NORTH_STAR_REPORT_TO` en Vercel (owner) · W1.4 bloqueada por regla V3.13.
**Nota colateral de la regen de tipos (26-08):** el `database.types.ts` regenerado destapó drift real de
LIVE — columnas hoy nullable (`nutrition_meal_logs.meal_id`, `workout_set_logs.block_id`,
`daily_nutrition_logs.plan_id/client_id`) que los tipos viejos declaraban NOT NULL. 12 errores de typecheck
en 8 archivos de nutrición/workout/org corregidos con null-guards en el borde (filtrar filas sin match
posible; cero cambio de comportamiento runtime); 19 tablas nuevas tipadas (familia `nutrition_*_v2`,
`coach_email_ledger`, etc.) sin tabla removida.

---

## W2 — Que el alumno entre (2 workers: `web-invite` Opus, `rn-invite` Opus)

**No arranca hasta que [VTA W3](../vive-tu-app-directo/TASKS.md) esté mergeada** — comparte 6 archivos con
ella. Alternativa aprobada: el mismo worker ejecuta VTA W3 y esta wave en el mismo diff.
**Ya no espera ninguna decisión** (23-08): las cuatro de VTA están respondidas (**D1 = A · D3 = A · D4 = B ·
D8 = A**, anotadas en su propio TASKS) y **D2 = A** acá, así que VTA W3 puede arrancar y esta wave solo
espera su **merge**.

- [x] **W2.1** · **ARREGLA** (packages · Opus, 1,5 h) `packages/schemas/persona.ts`: `PERSONA_COPY[persona]` gana
  `whatsappInviteSinClave` y la plantilla `whatsappInvite` de las **cinco** personas suma el bloque de acceso
  (`:65,75,85,95,105`). `formatWhatsappInvite` (`:127-137`, última línea del archivo) acepta `correo?` y `clave?`; con alguno ausente
  usa la variante sin credencial. Copy literal en [SPEC §6](SPEC.md) — **no se improvisa texto**.
  **La decisión de qué variante usar es del call site**, no del paquete.
  **Aceptación:** test que pinnea que las 5 plantillas con clave contienen `{link}`, `{correo}` y `{clave}`,
  y que las 5 sin clave contienen `{link}` y **no** `{clave}`.
  **Gate:** `npx vitest run packages/schemas` + `pnpm typecheck`.
- [x] **W2.2** · **ARREGLA** (web · Opus, 1,5 h) **⚠ ARCHIVO DE VTA W3.**
  `apps/web/src/app/coach/clients/_lib/add-student-invite.ts`: `buildInviteMessage` y `buildWhatsappUrl`
  (`:97-105`) reciben `email` y `tempPassword`. **Regla dura ([SPEC §5.4](SPEC.md)):** la variante con
  credencial se arma **solo** cuando hay teléfono; sin teléfono `wa.me/?text=` abre el selector de contactos y
  un toque equivocado entrega acceso a datos de salud de un tercero.
  **Regla dura 2 ([SPEC §5, regla 10](SPEC.md)): la URL de `wa.me` con la clave se arma en el HANDLER DEL CLICK**,
  nunca como `href` renderizado — esa pantalla se graba (ver W2.10).
  **Aceptación:** `add-student-invite.test.ts` con dos `it` nuevos («con teléfono lleva usuario y clave»,
  «sin teléfono no lleva credencial y menciona el correo»).
  **Gate:** `npx vitest run apps/web/src/app/coach/clients`.
- [x] **W2.3** · **ARREGLA** (web · Opus, 0,5 h) **⚠ ARCHIVO DE VTA W3.**
  `apps/web/src/app/coach/clients/_components/AddStudentStepper.tsx`: pasa `email` y `tempPassword`
  (`:281`, ya en memoria) al builder del mensaje. La vista de éxito del canal `email` (`:434`) **no cambia**.
  **Aceptación:** el enlace de WhatsApp del canal por defecto contiene la clave solo si hay teléfono.
  **Gate:** `npx vitest run apps/web/src/app/coach/clients` + `pnpm typecheck`.
- [x] **W2.4** · **ARREGLA** (RN · Opus, 1,5 h) **⚠ ARCHIVOS DE VTA W3.** Espejo RN:
  `apps/mobile/lib/client-invite-copy.ts` (`clientInviteMessage` recibe `email` y `tempPassword`),
  `apps/mobile/components/coach/directory/guided-invite.ts` y
  `apps/mobile/components/coach/directory/CreateClientModal.tsx` (la clave ya se genera ahí).
  **Declarar en el PR:** por la regla del piso, un coach en 1.1.0 seguirá mandando el mensaje **sin** clave
  mientras la web manda con clave. Es un split conocido, no un bug.
  **Aceptación:** `tests/mobile/client-invite-copy.test.ts` y `tests/mobile/guided-invite.test.ts`
  actualizados; los `it` de `guidedCapNote` no cambian; guards `store-copy` / `no-prices` verdes.
  **Gate:** `npx vitest run tests/mobile` + `tsc` mobile + `expo export --platform android`.
- [x] **W2.5** · **ARREGLA** (correos · Opus, 1,5 h) El drip D+1 deja de mentir **y cambia de destino**. Entrada:
  `apps/web/src/lib/email/drip-templates.ts:77` (`inviteUrl = ${ctx.baseUrl}/join/${inviteCode}`), `:95` («Tu
  alumno se registra solo…») y la variante sin código (`:106-107`). El bloque pasa a apuntar a
  `/coach/clients?invite=1` — el alta directa, que es la que produce alumnos — con el copy literal de
  [SPEC §6](SPEC.md). **Corregir solo el texto empeoraría la activación**: mandaría al coach a la puerta de
  solicitudes.
  **Aceptación:** `drip-templates.test.ts` actualizado; cero apariciones de «se registra solo» en
  `apps/web/src/lib/email`. **Gate:** `npx vitest run apps/web/src/lib/email`.
  **Pendiente declarado (26-08, ejecutada en `fa49d2b7`):** `{alumno}` salió como «alumno» literal —
  la persona del coach no llega a la cadena del drip (`buildDripTemplates` ← `send-drip-sequence` ←
  `free-coach-onboarding` ← `complete.actions.ts`, y ese último archivo es de W3.0/W3.3). Threadear
  la persona y pasar el bloque a `personaNoun` entra con W3, no antes.
- [x] **W2.6** · **ARREGLA** (correos · Opus, 1,5 h) Correo de bienvenida del alumno: **acceso arriba, clave abajo** y
  `replyTo` del coach. Entrada: `apps/web/src/lib/email/transactional-templates.ts:20-67` (el CTA vive en
  `:57` y la línea «responde este correo» en `:61`) y el call site
  `apps/web/src/app/coach/clients/_actions/clients.actions.ts:270` (**⚠ archivo de VTA W3**), que hoy no pasa
  `replyTo` aunque `apps/web/src/lib/email/send-email.ts:27` lo soporta.
  **Aceptación:** el correo sale con `reply_to` = correo del coach; test que lo pinnea.
  **Gate:** `npx vitest run apps/web/src/lib/email apps/web/src/app/coach/clients`.
- [x] **W2.7** · **NO APLICA** (web · Opus, 1 h — **se descuentan del plan**) `publicAppUrl()` normalizando
  apex→www. **Cerrada por G-ENV (23-08):** `NEXT_PUBLIC_SITE_URL` es `https://www.eva-app.cl` y
  `NEXT_PUBLIC_APP_URL` —Sensitive, valor no legible por CLI— tiene host **`www`** según lo que documenta
  `apps/web/src/lib/site-url.ts:9-11` del 22-08 (`https://www.eva-app.cl//c/<code>/login`: el defecto era la
  barra final, **no** el host, y `publicAppUrl()` ya la recorta en `:13-17`). **En producción el correo del
  alumno, el QR y la pastilla salen del mismo host**, que era todo lo que esta tarea protegía.
  **Si alguna vez cambia la env**, la normalización sigue siendo higiene razonable —`studentAppOrigin()` ya la
  hace, `apps/web/src/lib/coach/invite-code.ts:90`— pero entra como **AGREGA**, nunca como callejón.
- [x] **W2.8** · **AGREGA** (web · Opus, 2,5 h, **condición CUMPLIDA: D6 = A (owner 23-08), G-GRANT y G-ENV verdes** ⇒ se hace; sigue en el carril 3, o sea es lo primero que se corta si falta tiempo) Escape en el login de
  marca. Entrada: `apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts:19` (sumar `invite_code` al
  select) y `apps/web/src/app/c/[coach_slug]/login/ClientLoginForm.tsx` (**⚠ archivo de VTA W3**), junto a
  «¿Olvidaste tu contraseña?». Copy literal en [SPEC §6](SPEC.md). **Solo coaches standalone.**
  **G-GRANT salió VERDE** (23-08): `invite_code` ya está en el column-grant de `anon`
  (`20260617033845_coaches_restrict_anon_select_to_branding.sql:19-25` + LIVE) ⇒ **no** arrastra migración de
  grants; el `select` a editar es el de `:28` (18 columnas de marca), no la declaración de `:19`. **G-ENV
  también salió verde** (Turnstile activo en `/join`) y **el owner respondió D6 = A el 23-08**: no queda
  ninguna condición pendiente.
  **Aceptación:** un desconocido en `/c/{slug}/login` tiene un camino a `/join/{código}`; el login del
  alumno sigue funcionando con la anon key (repro del incidente de GRANT).
  **Gate:** `npx vitest run apps/web/src/app/c` + un `SELECT` anónimo de verificación.
- [x] **W2.9** · **ARREGLA** (web · Sonnet, 0,5 h) La hoja de invitar deja de prometer una tienda que no existe. Entrada:
  `apps/web/src/app/coach/dashboard/_components/invite/InviteStudentSheet.tsx:145` vs
  `apps/web/src/lib/app-links.ts:15` (`ANDROID_STORE_IS_PUBLIC = false`). Copy literal en
  [SPEC §6](SPEC.md). **El QR de `:224` es de invitación, no de pago: no cae en 3.1.1 y no se toca.**
  **Aceptación:** cero apariciones de «baja EVA» en superficies del coach.
  **Gate:** `pnpm typecheck` + `pnpm lint`.

- [x] **W2.10** · **ARREGLA** (web · Opus, 0,5 h) **La credencial no queda en el DOM ni en la grabación.** La pantalla del
  alta guiada **se graba** cuando el coach aceptó cookies: `apps/web/src/lib/posthog/provider.tsx:36`
  (`disable_session_recording: storedConsent !== 'accepted'`) y `apps/web/src/lib/posthog/consent.ts:57`
  (`disable_session_recording: false` al aceptar). El default de PostHog enmascara **inputs**, no texto del
  DOM ni `href`s ni `$current_url` — y hoy la clave ya se pinta (`AddStudentStepper.tsx:434`), mientras W2.2 la
  sumaría al `href` de WhatsApp. Es una cuenta con datos de salud de un tercero (Ley 21.719).
  Entrada: `AddStudentStepper.tsx:434` y `add-student-invite.ts:97-105` (`buildWhatsappUrl`). `ph-no-capture`
  sobre el bloque y el enlace; la URL se arma en el handler del click; si algo queda en el DOM, un botón sin
  la clave.
  **Aceptación:** una grabación real revisada en PostHog no muestra la clave, ni en pantalla ni en el `href`
  ni en la URL. **Gate:** la grabación, no un test unitario.
- [x] **W2.11** · **ARREGLA** (web · Opus, 0,5 h) El **reenvío** del acceso usa el mismo mensaje. Entrada:
  `resetClientPasswordAction` (`apps/web/src/app/coach/clients/_actions/clients.actions.ts:432-471`), que
  genera una clave temporal nueva y se la devuelve al coach sin builder de mensaje. Reusar el de W2.2, con la
  misma regla de teléfono y la misma regla de W2.10. Si el WhatsApp se pierde o el alumno lo borra, hoy el
  coach vuelve a los dos saltos que este spec dice matar.
  **Aceptación:** el reenvío ofrece el mismo mensaje con credencial (solo con teléfono).
  **Gate:** `npx vitest run apps/web/src/app/coach/clients`.
- [x] **W2.12** · **ARREGLA** (web · Opus, 1 h) **El alumno que ya tiene cuenta deja de morir en «escríbenos a soporte»**
  (callejón 16). Hoy el alta responde `EMAIL_TAKEN_CLIENT_CREATE_ES`
  (`apps/web/src/lib/auth/platform-email.ts:66-67`) para las cuatro razones de `:69-77` (`taken_coach`,
  `taken_client`, `taken_orphan`, `taken_auth`), en el minuto 6 de una sesión de celular.
  (a) **Primero medir:** emitir desde el servidor `add_student_email_taken` con `reason` — hoy no se sabe si
  pasa una vez por semana o en un tercio de las altas. (b) Copy con salida real: pedir otro correo con ejemplo
  explícito y, para `taken_coach`, mandar al camino de solicitud o al WhatsApp del owner. (c) **Nunca revelar
  cuál de las cuatro razones es**: el copy actual las colapsa a propósito (un coach autenticado podría sondear
  correos ajenos) y eso se mantiene.
  **Aceptación:** el evento aparece con `reason` en PostHog y el coach tiene un siguiente paso que no es un
  correo a soporte. **Gate:** `npx vitest run apps/web/src/app/coach/clients apps/web/src/lib/auth`.

**Gate de salida de W2:** los 5 tests de copy actualizados y verdes (`add-student-invite`,
`tests/mobile/client-invite-copy`, `tests/mobile/guided-invite`, `drip-templates`,
`tests/coach-invite-code-url`) · **OTA de RN antes del deploy web** · gates base + `expo export`.

### Cierre de W2 — 2026-08-26 (jefe + 4 workers Opus + sesión hermana)

**EJECUTADA COMPLETA.** Commits en `rnmobiledenuevo`: `fa49d2b7` (W2.5) · `88d110d5` (W2.8) ·
`f69c3b5b` (W2.9) · `1b77d6d4` (W2.4) · `d3392035` (**W2.4b**, no estaba en el plan: el alta corta
del home RN era una QUINTA copia del mensaje y su fallback de `Share` podía filtrar la clave a un
chat cualquiera — muerto) · `701ab3c6` (W2.1) · `bd911f79` (W2.2+W2.3+W2.10) · `44b9581d`
(W2.6+W2.11+W2.12) · `adb62f6c` (nota `{alumno}`). Decisiones del jefe sobre lo no especificado:
umbral de teléfono UNIFICADO web↔RN en 10 dígitos (menos = selector sin credencial); copy de
email-taken propuesto por el worker ACEPTADO (un string para las 4 razones, salida por alias
`+eva` verificada contra `check_platform_email_availability`, `/join` descartado porque el lead
choca el mismo muro); threading de `coachEmail` por import/ruta móvil ACEPTADO (sin él el correo
del import quedaba inconsistente).

**Pendientes que deja la wave (declarados, no olvidados):**
- Verificación de W2.10 por grabación real en PostHog (requiere sesión con cookies aceptadas) — W6.
- `add_student_email_taken` visto en PostHog real — primer deploy (mismo pendiente que W0.5).
- El alta corta RN no emite `invite_sent` (paridad de métrica por canal) — hallazgo de la hermana.
- `{alumno}` literal en el drip hasta que W3 threadee la persona (`adb62f6c`).
- La rama `23505` móvil conserva `code`/copy viejos (contrato con binario 1.1.0); solo se midió.
- Split por runtime declarado: 1.1.0 (piso sin OTA) manda la plantilla sin clave; el alumno igual
  recibe la clave por el correo de bienvenida.
- Demo endurance sin multimedia: cargar video a «Trote / carrera al aire libre», «Carrera / trote
  en cinta de correr» y «Caminata» (3 filas del catálogo del sistema) — dueño del contenido decide.

---

## W3 — Que el coach entre sin correo (2 workers: `web-alta` Opus, `marca-correos` Opus)

**D1 = A: respondida por el owner el 23-08** ⇒ esta wave tiene luz verde. G-ENV y G-AUTH quedaron **resueltos el 23-08** (arriba): Turnstile, Upstash y el
tope por IP están vivos, y el linking de identidades no se configura — se cubre con **W3.13**, que viaja en
el mismo tren que W3.1 y **no es opcional**.

**Conflictos internos: CUATRO archivos, no uno** (verificado contra el árbol).
`register.actions.ts` lo tocan **W3.1** (`:194`, `:229`, `:273-277`, `:290`), **W3.3** (`:219-243`) y **W3.9**
(UTM) · `api/mobile/auth/register-coach-free/route.ts` lo tocan **W3.2** (`:120`, `:145`), **W3.3** (`:144`) y
**W3.9** · `register/page.tsx` lo tocan **W3.6**, **W3.6b** y **W3.9** · **`complete.actions.ts` lo tocan
W3.0 y W3.3, en el MISMO `insert` (`:121-129`)**.
**Regla: W3.0 → W3.1 → W3.13 → W3.3 → W3.2 → W3.9 van al MISMO worker (`web-alta`), en ese orden.** W3.0 entra a esa
cadena —y no al otro worker— por las dos razones juntas: comparte el `insert` de `complete.actions.ts` con
W3.3, y **tiene que estar mergeada antes de que W3.1 despliegue el `email_confirm: true`** que deja ciega a
`auth.users.email_confirmed_at`. El segundo worker (`marca-correos`) toma W3.4, W3.5, W3.7, W3.8, W3.11 y
W3.12, que no tocan ninguno de los cuatro archivos — **pero W3.8 y W3.11 leen la columna de W3.0**, así que
esperan su merge. **W3.6, W3.6b y W3.6c arrancan cuando W3.9 haya mergeado.**

**Sobre el archivo sin commitear (corrección del 23-08).** `register/page.tsx`, `CaptchaSlot.tsx`,
`TurnstileWidget.tsx` (nuevo), `instrumentation-client.ts` y `public/sw.js` **no son de otra sesión**: son el
**fix de Turnstile del 23-08 de esta misma sesión** (el propio `TurnstileWidget.tsx:9-14` lo documenta contra
Sentry EVA-NEXTJS-1H/1J). Se **commitean antes de que W3 arranque**, y la única coordinación que queda es de
orden: **W3.6 / W3.6b / W3.6c / W3.9 arrancan después de ese commit.** No hay nadie con quien acordar nada.

- [ ] **W3.0** · **MIDE** (DB · Opus, 1 h) **La señal de correo verificado, sin la cual D1 = A nace muerta.**
  `auth.admin.createUser({ email_confirm: true })` escribe `auth.users.email_confirmed_at = now()` **en la
  creación**: con W3.1 aplicada, **todas** las altas free nacen «confirmadas» y quedan inertes la higiene del
  drip (W3.8), el banner (W3.11) y el guardarraíl «altas `active` sin correo verificado a 7 días ≤ 15 %»
  ([SPEC §2.2](SPEC.md), columna de W0.1). El propio [SPEC §9 R1](SPEC.md) ya decía que con `email_confirm:
  true` «el usuario ya existe confirmado»; esto es la consecuencia.
  **(a) Migración aditiva** `<ts>_coaches_email_verified_at.sql`:
  `ALTER TABLE public.coaches ADD COLUMN email_verified_at timestamptz` — sin default, **sin
  `GRANT UPDATE(email_verified_at) TO authenticated`** y sin nada para `anon`. No hace falta un `REVOKE`:
  `coaches` ya es **default-deny por columna** desde
  `supabase/migrations/20260612140000_modules_compra_only_grants.sql:24` (`REVOKE INSERT, UPDATE, DELETE ON
  public.coaches FROM authenticated, anon`) + la allowlist de 18 columnas de `:25-44`, así que una columna que
  no entre en esa lista solo la escribe `service_role`. Ese default-deny está **vivo en LIVE**: el outage de
  white-label v2 (7 columnas nuevas sin grant ⇒ 42501 en el save de marca, hotfix
  `20260621220000_grant_update_whitelabel_v2_brand_cols.sql`) es su prueba. `COMMENT ON COLUMN` que diga las
  dos cosas: que es prueba de la casilla —no de identidad— y que **no** lleva grant a propósito.
  **(b) Backfill en la MISMA migración:** `email_verified_at = auth.users.email_confirmed_at` para las filas
  existentes; ésas sí verificaron por link. Es ejecutable desde una migración: hay precedente de migraciones
  que leen `auth.users` (`supabase/migrations/20260614130000_exclude_test_coaches_from_mrr.sql:78`,
  `LEFT JOIN auth.users u ON u.id = c.id`). Si en la corrida real el rol de la migración no pudiera leer
  `auth.users`, el backfill sale como SQL separado con el mismo protocolo aditivo-en-LIVE y **queda anotado
  acá**, nunca omitido: sin él, todo el histórico aparecería como «sin verificar» y el guardarraíl arrancaría
  roto.
  **(c) Escritores (3 líneas, ninguna nueva superficie):**
  · `apps/web/src/app/auth/confirm/route.ts` — **junto a la activación de `:55`**, después del `verifyOtp` OK
  de `:43`, con `service_role`. **PROHIBIDO meterlo dentro de `activate-confirmed-coach.ts`**: ese helper corta
  en `:90` con `not_pending` si el coach no está en `pending_email`, y bajo D1 = A el coach free ya nace
  `active` ⇒ nunca escribiría. La rama `magiclink` existe (comentario `:33-36`; el `otpType` lo elige
  `lib/auth/send-coach-email-confirmation.ts:66`). **Decisión declarada:** el `UPDATE` va tras el `verifyOtp`
  exitoso, así que cubre `email`, `magiclink` **y `recovery`** — el mismo archivo documenta en `:49-54` que
  GoTrue marca `email_confirmed_at` en cualquier `verifyOtp` exitoso, y abrir un link de recuperación también
  prueba la casilla. Que ningún worker lo «arregle» a solo dos tipos.
  · `apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts:129` (alta por Google): el correo
  lo verificó Google ⇒ `email_verified_at: now`. **Mismo `insert` que W3.3** (`:121-129`): un solo worker.
  · **El alta paga NO se toca**: nace `email_confirm: true` porque el pago prueba identidad, **no** la casilla
  ⇒ queda **NULL** y su banner aparece hasta que confirme. Es deliberado y se declara acá para que nadie lo
  «complete» después.
  **Protocolo obligatorio:** `BEGIN … ROLLBACK` contra LIVE → `apply_migration` → `get_advisors`.
  **Aceptación:** advisors limpio; con la anon key **no** se puede escribir la columna; el backfill deja
  `email_verified_at` no nulo exactamente en las filas con `auth.users.email_confirmed_at` no nulo (conteo
  antes/después pegado acá); `apps/web/src/lib/database.types.ts` **regenerado**.
  **Gate:** evidencia de las tres corridas + `pnpm typecheck`.
- [ ] **W3.1** · **ARREGLA** (web · Opus, 5 h) **Matar el muro del correo en el alta free.** Entrada:
  `apps/web/src/app/(auth)/register/_actions/register.actions.ts`.
  (a) `:194` → `email_confirm: true` para free (hoy es `email_confirm: !isFreeTier`; el camino de pago **ya**
  lo hace). **Consecuencia que W3.0 cubre y esta tarea NO puede ignorar:** ese flag sella
  `auth.users.email_confirmed_at` en la creación, así que a partir de este deploy esa columna deja de
  distinguir a nadie y la señal pasa a ser `coaches.email_verified_at` (**W3.0 mergeada antes que esto**);
  (b) `:229` →
  `subscription_status: 'active'` (el `insert` de `coaches` abre en `:218` y va de `:219` a `:243`);
  (c) **sacar del camino free el bloque `:273-277`** (`:268-272` son los argumentos de
  `sendCoachSignupConfirmationEmail`; el borrado es el `if (!emailSent.ok)` de `:273` con el `delete` en
  `:274` y el `deleteUser` en `:275`): hoy, si el correo de confirmación falla, se **borra `coaches` y el
  `auth.user`**, y con `email_confirm: true` el `generateLink({type:'signup'})` **siempre** falla — GoTrue
  rechaza `invite` **y** `signup` para un usuario que **ya existe**
  (`lib/auth/send-coach-email-confirmation.ts:34-38`), y con `email_confirm: true` el usuario ya existe
  confirmado — **sin este renglón la tarea borra todas las altas free**; (d) el correo pasa a **recordatorio
  no bloqueante** con `linkType: 'magiclink'` (la rama ya viva está en
  `lib/auth/send-coach-email-confirmation.ts:47-51`, **no** en `register.actions.ts`, cuya `:46-51` es la
  función `reject`) y su fallo **no** revierte nada; (e) `signInWithPassword` inmediato (molde
  `:290`) y `redirect('/coach/dashboard?welcome=free&eid=…')` para que el gate de persona lo tome
  (`proxy.ts:599-643` arrastra `welcome`, `eid` y `ph`: **la atribución de Meta no se toca**); (f) bienvenida +
  drip se disparan acá, con `await`, reusando la idempotencia de `lib/auth/activate-confirmed-coach.ts`.
  **`proxy.ts:480-482` NO se borra**: sigue sirviendo a las filas `pending_email` que ya existen en LIVE.
  **Aceptación:** un alta free en preview entra al panel sin abrir el correo, recibe **una sola** bienvenida
  aunque pase por dos caminos, y `register_failed` sigue dejando código estable.
  **Gate:** `apps/web/src/app/(auth)/register/actions.test.ts` **ACTUALIZADO** — el archivo **existe** (9
  tests) y pinnea lo que cambia (`:342` espera `REDIRECT:/verify-email`, `:353` espera `pending_email`).
  **Prohibido crear un `register.actions.test.ts` al lado**: partiría la cobertura del alta en dos archivos.
- [ ] **W3.2** · **ARREGLA** (web · Opus, 2 h) Espejo del alta sin muro en el camino RN, **lado servidor**. Entrada:
  `apps/web/src/app/api/mobile/auth/register-coach-free/route.ts:120` (`email_confirm: false`), el `.insert()`
  de `:137-152` y `:144-145` (`pending_email`). **La respuesta gana un campo explícito
  `status: 'active' | 'pending_email'`**, para que un binario viejo contra un server nuevo no tenga que
  adivinar.
  **Sola NO saca la pantalla de verificación de ningún binario:** la navegación post-alta la decide el cliente
  (`apps/mobile/app/(auth)/register.tsx:189` hace `router.replace('/(auth)/verify-email?…')` sin mirar el
  estado). De ahí W3.2b, y de ahí que W3.2 **no** vaya en el carril «solo deploy web» del PLAN.
  **Aceptación:** la respuesta trae `status: 'active'` para un alta free nueva; el reenvío por `uid` sigue
  funcionando para las filas viejas.
  **Gate:** `npx vitest run apps/web/src/app/api/mobile/auth` + `pnpm typecheck`.
- [ ] **W3.2b** · **ARREGLA** (RN · Opus, 1,5 h, **OTA a 1.1.1/1.1.2**) La gemela RN de W3.2. Entrada:
  `apps/mobile/app/(auth)/register.tsx:189`. Si la respuesta de `registerCoachFree` trae `status: 'active'`:
  `signInWithPassword` con las credenciales del alta (ya en memoria, `rememberPendingSignup`) y
  `router.replace` al panel, sin pasar por `/(auth)/verify-email`. **El escape ya existe y nadie lo nombraba:**
  `verify-email.tsx:56-70` («ya confirmé») hace exactamente ese `signInWithPassword` y con el alta confirmada
  ahora **sí** entraría.
  **Split declarado:** **1.1.0 se queda con la pantalla** (regla del piso), y ahí «reenviar correo» queda como
  **no-op silencioso** — `apps/mobile/lib/api.ts:186-193` dice que `resendCoachConfirmation` responde
  **siempre** `{ ok: true }` «aunque el server decida no reenviar (uid desconocido, **cuenta ya
  confirmada**…)». En la versión con OTA, el copy pasa a «Ya puedes entrar».
  **Aceptación:** un alta free desde el binario 1.1.2 aterriza en el panel sin ver `/verify-email`.
  **Gate:** `tsc` mobile + `expo export --platform android` + matriz de QA punto 1.
- [ ] **W3.3** · **ARREGLA** (web · Opus, 1 h) **Marca prendida al nacer**: `use_brand_colors_coach: true` en el payload de
  las **tres** altas — `register.actions.ts:219-243`,
  `apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts:129` y
  `apps/web/src/app/api/mobile/auth/register-coach-free/route.ts:144`. **Se escribe el valor en el alta en vez
  de tocar el `DEFAULT false`** no porque una migración nueva sea ilegal (un `SET DEFAULT` en una migración
  **nueva** no edita ninguna aplicada), sino porque así es testeable y no depende del default.
  **Aceptación:** un coach nuevo ve su marca en su panel y su splash RN cruza a su marca en el segundo
  arranque (hoy `apps/mobile/lib/branding.ts:257-261` **borra** la caché cuando el valor es `false`).
  **Gate:** `actions.test.ts` + `complete.actions.test.ts` actualizados.
- [ ] **W3.4** · **ARREGLA** (web · Opus, 1 h) **El camino de escritura deja de apagar la marca.** Entrada:
  `apps/web/src/app/coach/dashboard/_components/BrandQuickCard.tsx:148`
  (`if (brand.useBrandColorsCoach) fd.set('use_brand_colors_coach', 'on')`) y
  `apps/web/src/app/coach/settings/_actions/settings.actions.ts:47` (`=== 'on'`, o sea ausencia ⇒ `false`).
  Hoy el coach que está en `false` y guarda su preset **desde la guía** reescribe `false`: sin esta tarea,
  W3.3 solo sirve a quien nazca mañana. **Aceptación:** guardar la marca desde la guía **nunca** apaga el
  toggle; el checkbox explícito de `BrandSettingsForm.tsx:752` sigue mandando.
  **Gate:** `npx vitest run apps/web/src/app/coach/settings apps/web/src/app/coach/dashboard`.
- [ ] **W3.5** · **ARREGLA** (DB · Opus, 0,5 h) Backfill acotado: `use_brand_colors_coach = true` **solo** para coaches con
  `use_brand_colors_coach IS DISTINCT FROM true` **y cero alumnos reales** (`is_demo = false`,
  `is_archived = false`). Protocolo aditivo-en-LIVE. **No tocar a coaches con alumnos activos**: les cambiaría
  el panel de golpe. **Aceptación:** el conteo de filas afectadas se documenta acá antes y después.
  **Gate:** `BEGIN … ROLLBACK` → `apply_migration` → `get_advisors`.
- [ ] **W3.6** · **ARREGLA** (web · Opus, 1,5 h) Microfricciones del formulario. Entrada:
  `apps/web/src/app/(auth)/register/page.tsx:565` (`type="password"` sin ojo de ver; `:567` **ya** tiene
  `autoComplete="new-password"`) y `apps/web/src/lib/auth/platform-email.ts`. Reusar
  `apps/web/src/components/auth/PasswordInput.tsx`. Guardia de dominio mal tipeado (`gmail.` + `con`,
  `hotmial.com`, …) con sugerencia inline **no bloqueante**.
  **PROHIBIDO tocar `:436`**: ese `autoComplete="off"` pertenece al **honeypot** `website` (`tabIndex={-1}`,
  fuera de pantalla) que `register.actions.ts:83-85` usa contra bots. **PROHIBIDO tocar `:175`, `:177` y
  `:669-687`**: son los estados (`isMetaWebView`, `browserEscapeHref`), el efecto que los llena y **el render**
  del escape del webview de Meta — parte del **fix de Turnstile del 23-08 de esta sesión**, todavía sin
  commitear (`git status`: ` M register/page.tsx`). Se commitea antes de W3; esta tarea arranca después de ese
  commit.
  **Aceptación:** `platform-email.test.ts` extendido con los dominios mal tipeados; el honeypot sigue intacto.
  **Gate:** `npx vitest run apps/web/src/lib/auth` + `pnpm lint`.
- [ ] **W3.6b** · **ARREGLA** (web · Opus, 1 h) **Dentro del webview de Meta, el botón de Google deja de ser un callejón.**
  [SPEC §1.2 H2](SPEC.md): el único camino que nace `active` es Google, y Instagram lo bloquea justo donde
  aterriza el ad. El fix de Turnstile de esta sesión **no toca ese botón**: `GoogleSignInButton` se renderiza sin
  condición en `apps/web/src/app/(auth)/register/page.tsx:766`, mientras `isMetaWebView` solo aparece en
  `:669` y `:683`, **dentro de `captchaNotice.kind === 'error'`** — el escape existe únicamente cuando el
  captcha ya falló. Hoy el coach que toca «Registrarse con Google» choca con `disallowed_useragent` sin salida.
  Con `isMetaWebView`, el botón se reemplaza por el escape «Abrir en el navegador» (mismo `href` de `:671`)
  **antes** de que lo toque. Reusar los estados que ya existen (`:175`, `:177`).
  **Orden, no coordinación:** el archivo tiene los cambios sin commitear del fix de Turnstile **de esta
  sesión** ⇒ se ejecuta **después de ese commit** y **después de W3.9**.
  **Aceptación:** con UA `Instagram` / `FBAN` / `FBAV` no se pinta un botón de Google que no puede funcionar.
  **Gate:** `pnpm lint` + `pnpm typecheck` + punto 1 de la matriz de QA.
- [ ] **W3.6c** · **ARREGLA** (web · Sonnet, 0,5 h) **El último Turnstile implícito del árbol.** Entrada:
  `apps/web/src/app/join/[invite_code]/_components/LeadRequestForm.tsx`, que hoy carga la API con render
  **implícito** y sin un solo callback: `:67` (`<Script src="…/turnstile/v0/api.js">`) y `:165`
  (`<div className="cf-turnstile" data-sitekey={siteKey} …>`). Es el mismo patrón que el fix de hoy sacó de
  `/register` y `CaptchaSlot` — cuando el challenge falla (600010, típico en la WebView de Instagram por donde
  entra el tráfico del ad) el error queda sin manejar, el input `cf-turnstile-response` se queda vacío y el
  submit muere en el servidor con el formulario perdido.
  Migrar a `apps/web/src/components/auth/TurnstileWidget.tsx` (render explícito, callbacks, `reset()`).
  **Ese archivo es NUEVO y sin commitear** (`git status`: `?? TurnstileWidget.tsx`), escrito por **esta**
  sesión el 23-08 junto con `CaptchaSlot.tsx`, `register/page.tsx`, `instrumentation-client.ts` y `public/sw.js`
  ⇒ **W3.6c arranca después de ese commit** y **reutiliza el componente tal cual**, sin modificarlo.
  **Por qué acá y no en el fix:** `/join` es la puerta que el drip D+1 dejará de recomendar (W2.5) pero que el
  escape del login de marca (W2.8) sí usa; dejarla con el patrón viejo sería mantener vivo justo el modo de
  falla que este spec dice cerrar.
  **Aceptación:** cero apariciones de la clase `"cf-turnstile"` y de `turnstile/v0/api.js` **sin
  `?render=explicit`** fuera de `TurnstileWidget.tsx` en `apps/web/src` (hoy quedan exactamente dos, las de
  `:67` y `:165`). **El nombre del input NO cambia:** `join-request.actions.ts:61` lee
  `cf-turnstile-response`, que es justo el default de `TurnstileWidget.tsx:76`.
  **Gate:** `pnpm lint` + `pnpm typecheck` + `npx vitest run apps/web/src/app/join` (la suite existe:
  `join-request.actions.test.ts`, que setea y borra `cf-turnstile-response` en `:79` y `:259`) + punto 13 de
  la matriz de QA.
- [ ] **W3.7** · **ARREGLA** (correos · Opus, 1,5 h) **= W8.1.10 de [coach-onboarding-v2](../coach-onboarding-v2/TASKS.md)**:
  la bienvenida Free apunta a `/coach/guia`, no al dashboard. Entrada:
  `apps/web/src/lib/email/free-coach-onboarding.ts:47` (`dashboardUrl: ${params.appUrl}/coach/dashboard`).
  Se ejecuta acá porque W3.1 cambia **quién** dispara la bienvenida. **El id no se renombra**; se marca
  `- [x]` en ese TASKS con referencia cruzada.
  **Aceptación:** el CTA del correo aterriza en la guía. **Gate:** `npx vitest run apps/web/src/lib/email`.
- [ ] **W3.8** · **ARREGLA** (correos · Opus, 1,5 h, **después de W3.0**) Higiene que introduce W3.1: el **drip** (no la
  bienvenida, que es transaccional) se salta al coach con **`coaches.email_verified_at IS NULL`** pasadas
  24 h, para no quemar la reputación de Resend con rebotes. Entrada:
  `apps/web/src/lib/email/send-drip-sequence.ts`.
  **NO se lee `auth.users.email_confirmed_at`:** con W3.1 aplicada nace seteada para todos y este salto no
  saltaría a nadie — la tarea quedaría escrita y muerta (regla 11 de [SPEC §5](SPEC.md)).
  **Cómo se salta, verificado:** `scheduleFreeCoachDripSequence` agenda los **cuatro** correos de una vez en
  el alta, con el `scheduled_at` de Resend (`:76-86`), así que «saltar a las 24 h» **no** es un filtro en el
  momento del envío: es **cancelar** lo agendado por su `provider_message_id` del ledger, con
  `cancelCoachEmails` (`apps/web/src/services/email/coach-email-ledger.service.ts:300`, ya usado por el
  webhook de pagos). La alternativa —no agendar el D+2 en adelante hasta que haya verificación— también sirve,
  pero se elige y se declara una, no se deja al criterio del worker.
  **No se toca la cadencia** (D11 = Sí ya decidió que el drip por calendario muere con W6 de onboarding-v2).
  **Aceptación:** test que pinnea el salto contra `email_verified_at`, no contra GoTrue.
  **Gate:** `npx vitest run apps/web/src/lib/email apps/web/src/services/email`.
- [ ] **W3.9** · **MIDE** (web · Opus, 2 h) Capturar `utm_source` y `utm_campaign` en el alta (columnas nuevas aditivas
  en `coaches`, escritas por el servidor) y mandarlos en el `coach_registered` de servidor. Entrada:
  `apps/web/src/app/(auth)/register/page.tsx` (hidden inputs) + `register.actions.ts` + el alta RN.
  Hoy la atribución solo se puede hacer cruzando timestamps a mano: 24 de 25 personas tienen
  `$initial_utm_source = none` porque la identidad anónima se recrea por sesión.
  **Declarar retención**: es dato personal (Ley 21.719).
  **Aceptación:** un alta desde el ad deja el `utm_source` en la fila. **Gate:** protocolo aditivo-en-LIVE +
  `actions.test.ts`.
- [ ] **W3.10** · **ARREGLA** (jefe, 0,5 h) Decidir con el owner qué se hace con las **2 filas `pending_email` que ya
  existen** en LIVE, una con un dominio imposible: contactar, borrar o dejar. Un minuto de decisión, no una
  tarea de código. **Aceptación:** la decisión escrita acá.
- [ ] **W3.11** · **ARREGLA** (web · Opus, 1,5 h, **después de W3.0**) **La «verificación blanda» de D1 gana una
  superficie.** D1 = A promete «el correo sigue saliendo, no bloquea», pero hoy lo único que existe es el
  correo (W3.1 d) y la higiene del drip (W3.8): nada en el panel le dice al coach que su correo no está
  verificado ni qué pierde. Con `email_confirm: true` y un dominio mal tipeado la cuenta queda **viva e
  irrecuperable** — no hay reset sin correo —, y la cohorte ya tiene un caso (`gmail.` + `con`). La guardia de
  W3.6 es no bloqueante y solo cubre typos conocidos.
  Banner persistente mientras **`coaches.email_verified_at IS NULL`**: «Verifica tu correo para poder
  recuperar tu clave», con botón de reenviar (reusa `sendCoachSignupConfirmationEmail` con
  `linkType: 'magiclink'`). **NO se lee `auth.users.email_confirmed_at`**: con W3.1 aplicada nace seteada para
  todos y el banner no se pintaría nunca. **No bloquea nada** y **no lleva ningún CTA de pago en iOS**.
  **Declarado:** el coach de pago también verá el banner hasta que confirme (nace `email_confirm: true` sin
  prueba de la casilla, W3.0 c) — es correcto: tampoco puede recuperar su clave.
  **Aceptación:** el banner se ve, y desaparece al volver del link de confirmación (o sea cuando W3.0 llena la
  columna); el guardarraíl «`active` sin `email_verified_at` a 7 días ≤ 15 %» se puede leer en la consulta de
  W0.1.
  **Gate:** `npx vitest run apps/web/src/app/coach/dashboard` + `pnpm typecheck`.
- [ ] **W3.12** · **AGREGA** (web · Sonnet, 0,5 h) **MEJORA (opcional).** Sentry **EVA-NEXTJS-19 «Failed to find Server
  Action»** — 15 eventos desde el 07-08, según el juicio del jefe del 23-08 — le pega a quien tiene una
  pestaña abierta servida por un deploy viejo y manda el formulario contra el nuevo. **W3 ES un deploy sobre
  `/register`**, la pantalla con más tráfico pagado del producto: el coach que llegó del ad y está tipeando
  cuando sale el deploy pierde el alta entera.
  El repo ya reconoce el modo de falla en otro lado —`apps/web/src/app/coach/nutrition-v2/_components/
  PlanTemplatesLibrary.tsx:190-194` lo envuelve en `try/catch/finally` para que no quede el spinner pegado—
  pero ahí alcanza con no romper la UI; en `/register` lo único útil es **recuperar el formulario**.
  Capturar el error en cliente y **recargar UNA sola vez**, con guard en `sessionStorage` (nunca un bucle de
  recarga). Sitio: `apps/web/instrumentation-client.ts` (donde ya vive el `Sentry.init` con su `ignoreErrors`,
  `:3-24`) o un componente cliente del árbol de `(auth)` — **`(auth)/layout.tsx` no sirve tal cual**: es
  Server Component, sin `'use client'`.
  ⚠ `instrumentation-client.ts` es uno de los archivos del fix de Turnstile sin commitear ⇒ va **después** de
  ese commit.
  **Aceptación:** con el error simulado, la página recarga una vez y **no** vuelve a recargar.
  **Gate:** `pnpm lint` + `pnpm typecheck`. Es MEJORA: si la wave va apretada, se corta sin tocar nada más.

- [ ] **W3.13** · **ARREGLA** (web · Opus, 1,5 h, **seguridad; misma cadena que W3.1**)
  **El pre-account takeover que abre D1 = A.** Resuelto G-AUTH: el enlace automático por correo **no es
  configurable** y Supabase borra las identidades **sin confirmar** al enlazar una nueva. Hoy eso nos salva
  (el alta free nace `email_confirm: false` ⇒ la identidad del intruso se borra sola). **Con W3.1 aplicada
  deja de salvarnos**: la identidad `email` nace confirmada, Google se enlaza al MISMO usuario y quien
  registró primero el correo de la víctima **conserva su contraseña** sobre la cuenta de ella.
  **Regla:** cuando alguien entra con Google y su usuario **ya tenía identidad `email`** Y
  **`coaches.email_verified_at IS NULL`** (o sea: nadie probó nunca esa casilla), se **rota la contraseña**
  con `adminDb.auth.admin.updateUserById(id, { password: <aleatoria de 32+ bytes> })`, se setea
  `email_verified_at = now()` (Google **sí** probó la casilla) y se registra `google_link_rotated_password`
  en `coach_onboarding_events` + PostHog server (`capturePostHogServerEvent`, `distinctId = coach_id`).
  **Efecto:** el intruso pierde el acceso por contraseña; el coach legítimo que se registró con clave y
  después entra con Google **sigue entrando** (por Google) y ahora **sí** puede resetear su clave, porque su
  correo quedó verificado.
  **DOS call sites, no uno — verificado abriendo los archivos, y es una corrección al brief:**
  · `apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts` — el usuario de Google se
  resuelve en **`:54`** (`supabase.auth.getUser()`), el `service_role` se crea en **`:87`** y el `insert` de
  `coaches` va en **`:121-129`**. Cubre el caso «auth user ya existía, fila `coaches` **no**».
  · **Y hace falta un segundo call site**, porque en el escenario del ataque la fila `coaches` **sí** existe
  (el intruso pasó por `/register`, que inserta `coaches` en `register.actions.ts:219-243`) y entonces
  **`completeOAuthOnboarding` NO corre** — lo documenta el propio repo en
  `apps/web/src/lib/auth/activate-confirmed-coach.ts:16-18`. El camino post-Google real es **de cliente**
  (`auth/exchange/AuthExchangeClient.tsx:36` y `components/auth/GoogleSignInButton.tsx:103`, los dos vía
  `lib/auth/post-google-auth.ts:29`, que es `'use client'` en su `:1`) y **no puede** rotar nada. ⇒ la
  rotación vive en un **endpoint/server action nuevo con `service_role`**, llamado una vez desde ese punto
  del flujo (el mismo lugar donde hoy se llama a `resolvePostGoogleAuthUrl`), idempotente y sin devolver
  detalle al cliente. Poner la lógica **solo** en `complete.actions.ts` dejaría el agujero abierto justo en
  el caso que lo motiva.
  **Aceptación:** test en `complete.actions.test.ts` que pinnea la rotación cuando `email_verified_at IS
  NULL` y la **NO** rotación cuando ya está seteada; test del segundo call site con el mismo par de casos; y
  un repro manual: cuenta creada con contraseña → entra con Google → la contraseña vieja **ya no sirve** y
  el acceso por Google **sí**.
  **Depende de W3.0** (lee y escribe `email_verified_at`) y **acompaña a W3.1**: no se despliega el
  `email_confirm: true` sin esto en el mismo tren.
  **Gate:** `npx vitest run apps/web/src/app/coach/onboarding` + `pnpm typecheck`.

**Gate de salida de W3:** `actions.test.ts` actualizado y verde · **repro del takeover: cuenta creada con
contraseña → login con Google ⇒ la contraseña vieja deja de servir** (W3.13) · alta free real en preview que entra al panel
sin correo · **esa misma alta deja `coaches.email_verified_at` en NULL y confirmar el correo la llena** (si
nace llena, W3.0 está leyendo GoTrue y la wave entera está rota) · el proxy sigue mandando a `/verify-email` a
un `pending_email` viejo · advisors limpio tras W3.0, W3.5 y W3.9 · gates base.

---

## W4 — RN que no rompe al coach (1 worker: `rn` Opus)

**W4.1 y W4.2 arrancan el día 1** (no dependen de nada). **W4.3 se BORRA:** era la misma tarea que W1.5, sobre
el mismo archivo (`apps/mobile/lib/clients-directory.ts`), en otra wave y con otro worker — y además dependía
de W1.1, lo que contradecía la fila «Depende de: —» del PLAN. Vive dentro de W1.5.

- [ ] **W4.1** · **ARREGLA** (RN · Opus, 1 h) `apps/mobile/app/(auth)/login.tsx`, **los dos caminos de error** (`:220` y `:230`). En `:230`:
  `await supabase.auth.signOut({ scope: 'local' })`. Hoy, cuando el coach se equivoca de login (403 /
  `INVALID_TOKEN` desde `validate-student-workspace`), la app le **revoca el refresh token en todos sus
  dispositivos**. **Y el gemelo está al lado:** `:220`, en el **mismo camino de error** (rama
  `ACCOUNT_PAUSED`), llama `signOutAndCleanup({ preserveStudentAccountStatus: true })`, que es el `signOut`
  **global** de `apps/mobile/lib/auth-actions.ts:69` — un alumno suspendido tampoco es un logout deliberado.
  Los **dos** pasan a scope local. **NO se toca `auth-actions.ts:69` en sí**: ese helper sigue sirviendo al
  logout **deliberado**, donde el scope global es la política segura para un teléfono perdido; lo que cambia
  es el scope con el que lo llama el camino de error.
  **Coordinación:** el gemelo web es VTA W3 (D4 = B) — mismo concepto, archivos distintos; se avisa en el PR
  para que los dos copys queden alineados.
  **Aceptación:** repro manual: login de alumno con credenciales de coach → su sesión de coach en la web
  **sobrevive**. **Gate:** `tsc` mobile + `expo export --platform android`.
- [ ] **W4.2** · **ARREGLA** (RN · Opus, 3 h) `apps/mobile/app/(auth)/reset-password.tsx:34-48`. La ruta está reclamada con
  `autoVerify` en las cuatro variantes de host (`apps/mobile/app.json:105,150`) y hoy la pantalla pinta el
  formulario sin comprobar nada, y muere en un `Alert` sin salida.
  **La tarea es CANJEAR el token, no solo guardar.** El token **sí llega a la app**: `+native-intent.ts`
  reescribe la ruta (y pierde la query) solo en las ramas `/c/` e `/invite/` (`:13-17`) y `auth/confirmed`
  (`:21-26`); `/reset-password` cae en el camino por defecto, que termina en `return path` (`:29`) **con la
  query intacta**. Un guard que solo pinte «si hay sesión de recovery» dejaría al coach en Android con la app
  instalada **sin poder resetear su clave desde el teléfono**, que es peor que hoy.
  Orden correcto: leer el código/token de la URL → `verifyOtp` / `exchangeCodeForSession` → recién ahí pintar
  el formulario. La explicación + «Volver al login» es el **fallback** cuando no hay token válido.
  **El guard NO puede ser «hay sesión»**: con una sesión de **coach** viva, `updateUser({ password })` le
  cambiaría su propia contraseña sin pedir la anterior.
  **Aceptación:** un link real de `/reset-password` abierto en Android con la app instalada **permite cambiar
  la clave**; sin token válido no se pinta el formulario, se explica y hay salida.
  **Gate:** `tsc` mobile + `expo export --platform android` + repro en device (matriz de QA, punto 9).

**Gate de salida de W4:** repro de W4.1 en dos superficies · `expo export` verde · **OTA antes del deploy
web**, solo 1.1.1 y 1.1.2.

---

## W5 — La guía apunta a invitar (1 worker: `packages-guia` Opus) — **CONDICIONAL, no del día 1**

**D3 pasó a C: esta wave NO se ejecuta todavía.** El dato que la justificaba —«0/9 invitan»— no prueba que el
artefacto tape la puerta: la cohorte post-v2 muere en el **paso 2** (7/7 tocan la marca → 6/9 abren «Vive tu
app» → **2/7** llegan al demo → 2/9 hacen el artefacto, **los mismos dos** → 0/9 invitan,
[SPEC §1.1](SPEC.md)). Quien muere en el paso 2 nunca ve el paso 3, así que intercambiar 3↔4 alcanza a 2
personas de 9; y el paso 2 lo arregla [VTA W1+W2](../vive-tu-app-directo/TASKS.md), **que todavía no está en
prod**. Con n = 9 y menos de 28 h de ventana, y con la advertencia (1) de §1.1 llamando a ese dato
«sospechoso, no probado», reordenar ahora gasta un cambio que **no se puede desandar por OTA en 1.1.0**
(regla 9 de [SPEC §5](SPEC.md)) sobre una cohorte que no lo mide.

**Regla de disparo (la única condición para que esta wave arranque):** VTA W1+W2 llevan **2 semanas en prod**
**y** la consulta de W0.1 muestra, **entre los coaches que ENTRARON al demo** (no sobre el total), «hizo
artefacto» **< 30 %** o «invitó» **< 25 %**. Si dispara, se ejecuta **A junto con la plantilla de un toque
(W8.2.7 de onboarding-v2) en el mismo diff**, que es lo que cierra R10; si no, no se toca el orden.
**El análisis no se borra: se posterga.** Las dos tareas de abajo quedan escritas y listas para el día que la
regla se cumpla, y **fuera del total base de la estimación** (+4 h condicionales).

- [ ] **W5.1** · **AGREGA** (packages · Opus, 2 h) Reordenar `ONBOARDING_STEP_KEYS`
  (`packages/onboarding/index.ts:36-42`) a
  `['profile_branding', 'vive_tu_app', 'first_client', 'first_artifact', 'aha']` **y las cinco ramas de
  `ONBOARDING_STEPS`** (el `first_artifact` está escrito inline en cada rama: son 6 ediciones, no una).
  **`PERSONA_SCOPED_STEP_KEYS` NO cambia** (`packages/onboarding/persona-progress.ts:38`): la memoria por
  especialidad se archiva **por clave, no por índice**, así que reordenar no mueve un solo dato.
  **Declarar en el PR:** `@eva/onboarding` viaja en el bundle RN ⇒ 1.1.0 queda con el orden viejo para
  siempre (regla del piso) y 1.1.1 no tiene el paquete.
  **Condición de arranque (D3 = C hoy):** esta tarea **no se ejecuta** hasta que se cumpla la regla de
  disparo del encabezado de W5. Si dispara, **arrastra la plantilla de un toque en el mismo diff**, no como
  opción: es lo que cierra R10 (`first_client` antes de `first_artifact` deja al alumno invitado a los 6 min
  entrando a una app **sin nada asignado**, y la North Star lo cuenta como activado igual). La alternativa
  aceptada es declarar el estado vacío del alumno y sumar «volvió a los 7 días» a la consulta de W0.1. Sin una
  de las dos, W5 compra activación y vende retención.
  **Aceptación:** el CTA «Empezar: {paso}» de `apps/web/src/app/coach/guia/_components/GuideScreen.tsx:131-150`
  apunta a «Invita a tu primer alumno» apenas la marca esté hecha; el anillo sigue diciendo n/5.
  **Gate:** `npx vitest run packages/onboarding apps/web/src/app/coach/guia` + `tsc` mobile.
- [ ] **W5.2** · **AGREGA** (**jefe u owner en terminal real**, 1,5 h) Gate visual de la guía:
  `node scripts/guia-visual-check.mjs`. Es la pantalla que ve el **100 %** de los coaches nuevos.
  **NO lo puede correr un worker:** el script requiere `next dev`, y el gotcha vivo del repo es que `next dev`
  bajo shell de agente muere (0xc0000142). Se corre como **gate del cierre (W6)**, no dentro de la wave.
  **Aceptación:** sin regresiones visuales en desktop, PWA 390 y dark.
  **Gate:** el propio script, con evidencia.
- [ ] **W5.3** · **MIDE** (jefe, 0,5 h) Anotar el corte del deploy: toda lectura comparativa de
  `coach_onboarding_events` lleva `created_at >= 2026-08-22` **y** se reporta antes/después del deploy de W5,
  para no mezclar cohortes en plena campaña. **Con D3 = C hay un corte más que anotar y que llega antes: el
  deploy de VTA W1+W2**, que es el que mueve el paso 2 y el que arranca las 2 semanas de la regla de disparo.
  **Gate:** `pnpm docs:check`.

---

## W6 — QA en device + cierre (jefe + owner)

- [ ] **W6.1** · **ARREGLA** Matriz de QA de [PLAN §Matriz](PLAN.md), **15 puntos** (1-13 más 4b y 4c), con evidencia
  (capturas o video). Los dos nuevos son el banner + `email_verified_at` (12) y el Turnstile de `/join` en el
  webview de Instagram (13).
  Playwright contra prod: **un solo navegador a la vez, tandas en serie**.
- [ ] **W6.2** · **MIDE** Correr de nuevo la consulta de W0.1 sobre la cohorte nueva y compararla con la línea base de
  G-BASE. **Regla de lectura ([SPEC §2.3](SPEC.md)):** con ~35 altas por semana (~15 desde el ad) la North
  Star **no** es significativa a 2 semanas; se decide sobre las métricas intermedias y la North Star se juzga
  a 30 días acumulados, y siempre con la **consulta SQL**, no con el embudo de PostHog.
  **Comparar solo lo comparable:** la baseline mide «entró» con `last_sign_in_at` y la cohorte nueva con
  `first_login_at` (G-BASE). Los escalones «invitó», «entró alguna vez» y «altas que llegan a `active`» se
  comparan directo; **el «dentro de 72 h» solo se compara entre cohortes ya medidas con `first_login_at`**.
  **Ningún guardarraíl se lee con `n < 20`** ([SPEC §2.2](SPEC.md)): las filas que no llegan dicen «sin
  lectura» y **no** disparan revert. Igual para el correo verificado: antes del deploy de W3 la señal es
  `auth.users.email_confirmed_at` y después `coaches.email_verified_at`, unificadas por el backfill de W3.0.
  **Se evalúa además la regla de disparo de D3** (¿VTA W1+W2 con 2 semanas en prod? ¿«hizo artefacto» < 30 %
  o «invitó» < 25 % entre los que ENTRARON al demo?) y se escribe acá si W5 se activa o no.
  **Sin lectura cualitativa: W0.8 quedó descartada** (contacto directo = invasivo). El «por qué» se busca en
  los datos que ya existen —dónde cae cada cohorte en W0.1, session recordings consentidas— o con una
  pregunta opcional **dentro** del producto, nunca escribiéndole a nadie.
- [ ] **W6.3** · **MIDE** Actualizar [CURRENT.md](../../status/CURRENT.md) (frente Web/PWA y frente Mobile),
  `docs/status/MOBILE_PARITY.md` (las pantallas que quedan «Requiere OTA + QA device») y
  `docs/testing/TEST_STATUS.md` en el **mismo** cambio. `docs/README.md` **no** indexa specs: el puntero al
  trabajo vivo es `CURRENT.md`. **Gate:** `pnpm docs:check`.
- [ ] **W6.4** · **MIDE** Marcar en [coach-onboarding-v2/TASKS.md](../coach-onboarding-v2/TASKS.md) las tareas
  ejecutadas acá **sin renombrar sus ids**: W8.5.2 (= W0.5) `- [x]` y W8.4.3 (= W1.1) `- [x]`, con la nota de
  que la columna es `first_login_at`, no `last_login_at`.
  **W8.1.10 se marca `- [~]`, no `- [x]`:** W3.7 solo cambia una URL en `free-coach-onboarding.ts:47`, y
  W8.1.10 pide bastante más. **Pendiente:** copy por persona (`PERSONA_COPY`), no mostrar pitch de nutrición a
  quien la apagó, y cancelar `day2_pro` / `day14_last_call` al primer alumno real. Además **el D+1 apunta a
  `/coach/clients?invite=1`, no a `/coach/guia`**, por decisión de W2.5 de este spec — o sea lo contrario de
  lo que pide W8.1.10: eso se anota como divergencia deliberada, no como pendiente.
- [ ] **W6.5** · **ARREGLA** **Verificar** que lo anotado en W0.7 dentro de
  [vive-tu-app-directo](../vive-tu-app-directo/TASKS.md) efectivamente se ejecutó: los tres aportes (`signOut`
  local en `app/vive-tu-app/route.ts:45`, atar `c=` al `coach_id` del demo, rate limit del endpoint móvil) y
  el call site de W1.4 dentro de su W3. **La anotación es W0.7 y va al principio**; acá solo se comprueba —
  al cierre ya es tarde para anotar nada.
- [ ] **W6.6** · **ARREGLA** Suite completa **una** vez pre-push, en worktree limpio.

---

## Orden de ejecución y paralelismo

**Los tres carriles salen de la etiqueta, no de la wave.** El orden lo manda la prioridad del owner del
23-08: primero que funcione lo que ya existe, después saber si funcionó, y recién después agregar.

```text
commit del fix de Turnstile (esta sesión, sin commitear hoy)
 │
G (gates + decisiones del owner)
 │
 ├─► CARRIL 1 — ARREGLA  (lo que hoy expulsa, confunde o miente)
 │     W3.0→W3.1→W3.13→W3.3→W3.2→W3.9*  (W3.13 = seguridad, viaja SÍ o SÍ con W3.1)
 │     W3.2b · W3.4 · W3.5 · W3.6 · W3.6b · W3.6c · W3.7 · W3.8 · W3.10 · W3.11
 │     W0.2 · W0.3 · W0.4 · W0.7          (chip honesto, medidor de cupo, aportes a VTA)
 │     W4.1 · W4.2                       (sin dependencias: arrancan el día 1)
 │     W2.1–6 · W2.9–12                    ← ESPERAN a VTA W3 mergeada (W2.7 cerrada por G-ENV)
 │     W1.5                              ← necesita la columna de W1.1
 │     (* W3.9 es MIDE y del carril 3: viaja en esta cadena por conflicto de archivo, no por prioridad)
 │        │
 ├─► CARRIL 2 — MIDE  (lo mínimo para saber si el carril 1 sirvió)
 │     G-BASE + W0.1  · W0.5 · W0.6      (W0.8 DESCARTADA por el owner: era contacto directo)
 │     W1.1→W1.2→W1.3/W1.4 · W1.6         (la señal real + el cron semanal)
 │     W3.0 corre en el CARRIL 1 aunque su etiqueta sea MIDE: es prerrequisito de W3.8 y W3.11
 │        │
 └─► CARRIL 3 — AGREGA  (extra a estudiar; NO bloquea nada y se puede no hacer)
       W2.8 (escape «pídele acceso»; D6 = A ⇒ se hace)  ·  W3.12 (recarga tras deploy, MEJORA)
       W3.9 — etiqueta MIDE, pero **no** es el mínimo para juzgar el carril 1: es atribución de
              presupuesto de campaña. Corre con `web-alta` por conflicto de archivo, no por prioridad.
       W5 (reordenar la guía) — CONDICIONAL: hasta que la regla de disparo de D3 se cumpla
              (VTA W1+W2 con 2 semanas en prod + los umbrales de W0.1). No es del día 1.
                    │
                    └─► W6  QA device + cierre  (verifica los tres carriles)
```

**Si el owner corta, corta por carril, no por wave:** el 3 entero se puede no hacer y el plan sigue entregando
lo que promete; el 2 es lo mínimo para no volar a ciegas; el 1 es el encargo.

**Dependencias técnicas que NO cambian con los carriles** (mandan sobre la prioridad): W2 espera a VTA W3
mergeada · W3 no arranca sin **D1 = A** (G-ENV y G-AUTH ya están resueltos) · W1.5 necesita W1.1 · W3.8,
W3.11 y W3.13 necesitan W3.0 · **W3.13 se despliega en el mismo tren que W3.1** · W2.8 depende de D6 · todo
lo de RN sale por OTA antes del deploy web.

- **Cuatro workers en paralelo el día 1** (W0 ×2, W3 ×2; W4.1/W4.2 son workers cortos que se encadenan
  detrás). **W4.3 ya no existe** (absorbida por W1.5), **W5 salió del día 1** (D3 = C)
  y **W5.2 no lo corre un worker** (necesita `next dev`): iría al cierre, con el jefe u owner en terminal
  real, el día que W5 se dispare.
- **Conflictos internos de W3: CUATRO archivos.** `register.actions.ts` ← W3.1, W3.3, W3.9 ·
  `api/mobile/auth/register-coach-free/route.ts` ← W3.2, W3.3, W3.9 · `register/page.tsx` ← W3.6, W3.6b,
  W3.9 · **`complete.actions.ts` ← W3.0 y W3.3 (mismo `insert`, `:121-129`)**.
  Regla: **W3.0 → W3.1 → W3.13 → W3.3 → W3.2 → W3.9 al MISMO worker (`web-alta`), en ese orden**; `marca-correos` toma
  W3.4, W3.5, W3.7, W3.8, W3.11 y W3.12, con **W3.8 y W3.11 esperando el merge de W3.0** (leen su columna).
  **W3.6, W3.6b y W3.6c esperan el merge de W3.9** y el commit del fix de Turnstile.
- **Colisión externa:** los 6 archivos marcados **⚠ ARCHIVO DE VTA W3** en W1.4, W2.2, W2.3, W2.4, W2.6 y
  W2.8. Regla única: el archivo es de VTA; este plan espera el merge, o el mismo worker ejecuta las dos waves
  en el mismo diff. **VTA W3 ya no espera nada del owner: su D4 = B quedó decidida el 23-08** (G-DEC), así
  que lo único entre W2 y su arranque es que ese merge ocurra.
- **Tras cada wave: pasada de juicio del jefe** (diff contra el brief); lo deficiente vuelve al **mismo**
  worker con feedback concreto. Los reintentos de jobs fallidos son un **workflow nuevo** solo con los
  fallidos, nunca un resume con edits en medio del array.

## Estimación

| Wave | Horas-agente | Etiqueta (h) | Modelo |
|---|---|---|---|
| G — gates y decisiones | 2 (owner mayormente) | — (habilita las tres) | jefe |
| W0 — medir sin migrar | 8,5 (−W0.8, descartada por el owner) | ARREGLA 4 · MIDE 4,5 | Opus ×1 + Sonnet ×1 |
| W1 — la señal real | 8,5 (W1.5 absorbe la vieja W4.3; +W1.6 cron) | ARREGLA 2 · MIDE 6,5 | Opus ×1 |
| W2 — que el alumno entre | 13 (−W2.7, cerrada por G-ENV) | ARREGLA 10,5 · AGREGA 2,5 | Opus ×2 |
| W3 — coach sin correo | 24 (+W3.0, W3.2b, W3.6b, W3.6c, W3.11, W3.12, **W3.13**) | ARREGLA 20,5 · MIDE 3 · AGREGA 0,5 | Opus ×2 + Sonnet |
| W4 — RN que no rompe | 4 (W4.2 sube a 3 h; W4.3 se fue a W1.5) | ARREGLA 4 | Opus ×1 |
| W6 — QA + cierre | 4 + sesión de device del owner | ARREGLA 2 · MIDE 2 (verifica) | jefe |
| **Total base** | **≈ 64 h-agente** | **ARREGLA 43 · MIDE 16 · AGREGA 3 · gates 2** | |
| W5 — la guía apunta a invitar | **+4 CONDICIONAL** (fuera del base: D3 = C) | AGREGA 3,5 · MIDE 0,5 | Opus ×1 |
| **Total si D3 dispara** | **≈ 68 h-agente** | **ARREGLA 43 · MIDE 16,5 · AGREGA 6,5 · gates 2** | |

**Por etiqueta, que es como lo lee el owner:** **ARREGLA 43 h en 34 tareas (67 % del base)** · **MIDE 16 h en
13 tareas (25 %)** · **AGREGA 3 h en 2 tareas (5 %)** · gates y decisiones 2 h. Con W5 condicional, AGREGA
sube a 6,5 h en 4 tareas y sigue siendo lo primero que se corta. **Dos tercios de este plan no agregan nada:
arreglan lo que ya existe**, que es exactamente la prioridad del 23-08.

El neto del 23-08 es **−0,5 h**: entran **1,5 h de W3.13** (el takeover que abre D1 = A) y salen **1 h de
W2.7** (cerrada por G-ENV) más **1 h de W0.8** (descartada por el owner). De las horas nuevas anteriores, **1 h es W3.0** (la columna sin la cual D1 = A nace muerta), **2 h el cron de W1.6**
(«calculado solo» deja de ser una promesa), **1 h W0.8** (owner, sin código) y **1 h las dos deudas de
Turnstile/Server Action de W3** (W3.6c + W3.12, las dos Sonnet). W3.12 está marcada **MEJORA**: se corta sola
sin arrastrar nada.

**Recorte al 74 % (47,5 de 64 h): G + W0 + W2 + W3.** Se corta W1 **con el costo escrito**: sin la columna, el
chip dice «Todavía no cambió su clave», **no «entró»** (el fallback mide otra cosa: W0.2), y la North Star se
sigue leyendo a mano —el cron de W1.6 vive en esa wave—. También se corta W4 (real pero de bajísimo volumen).
W5 ya está fuera del base. **W0 no se corta bajo ninguna versión** (sin línea base congelada nada se puede
juzgar) y **W3.0 no se corta dentro de W3** (sin ella, W3.8, W3.11 y el guardarraíl del correo quedan escritos
e inertes).

---

## Verificación descartada

Correcciones de las dos pasadas de revisión que **no** se aplicaron literalmente, y por qué. Todo lo demás de
esos dos informes está aplicado.

1. **V1 B6 — «agregar W4.3 a la fila W4 del PLAN y declarar que depende de W1.1».** No se aplicó **tal cual**
   porque V2 M1 demostró algo más fuerte sobre el mismo hecho: W4.3 y W1.5 eran **la misma tarea**, sobre el
   mismo archivo (`apps/mobile/lib/clients-directory.ts`), en dos waves y con dos workers distintos. Aplicar
   B6 habría documentado prolijamente una duplicación en vez de borrarla. **Se aplicó la sustancia**: W4.3
   está eliminada, su trabajo vive en W1.5, y la fila W4 del PLAN más el §Paralelismo dicen que W4.1 y W4.2
   arrancan el día 1 sin dependencias — que era la contradicción que B6 señalaba.
2. **V1 C12 — «mover el delta a una columna propia» en la tabla de §1.1 del SPEC.** Se aplicó **la corrección
   numérica** («−65,5 pp vs. las altas que confirmaron (93,1 %); −72 pp vs. el total», y −10,4 pp en el
   escalón siguiente) dentro de la celda que ya existía, sin agregar una cuarta columna a las diez filas: la
   columna nueva quedaría vacía en 8 de 10 filas y engorda una tabla que ya es ancha. El defecto real —el
   delta medido contra el denominador equivocado— está corregido.
3. **V1 A1, matiz sobre PostHog.** Se aplicó la corrección central (el `UPDATE` del primer login **se
   espera**; prohibida la promesa flotante). Pero la frase «lo que no se espera es el capture de PostHog» se
   escribió como **«va por `after()` de `next/server`»**, no como una promesa suelta: el repo documenta en
   `lib/posthog/registration-events.ts:38-41` que ahí el `await` es obligatorio «igual que con los correos»,
   así que soltar la promesa reintroduciría el mismo bug que A1 denuncia. `after()` mantiene viva la
   invocación y a la vez no le suma hasta 1,5 s al login del alumno.
4. **Tamaño de los tres documentos.** El encargo pedía SPEC ≤ ~28 KB, PLAN ≤ ~18 KB y TASKS ≤ ~30 KB. Los
   documentos **ya llegaban por encima** de esos topes antes de esa revisión (31,4 / 19,4 / 34,3 KB), y tanto
   esas correcciones como las del **juicio del jefe** (sección siguiente) los subieron más. Se hicieron dos
   pasadas de compresión sobre prosa redundante (§7 y §10 del SPEC, celdas de §8 y §9), pero **no se recortó
   ninguna corrección verificada para llegar al número**: el tope es una preferencia de formato y las
   correcciones son hechos del árbol.

---

## Juicio del jefe (23-08)

Pasada de juicio del jefe sobre el paquete ya revisado. Cada línea es una corrección **aplicada** en este
mismo cambio, con dónde quedó. No son críticas descartadas: son defectos del paquete.

1. **B1 — La «verificación blanda» de D1 estaba muerta al nacer.** W3.1(a) pone `email_confirm: true` en el
   alta free, y `auth.admin.createUser({ email_confirm: true })` escribe `auth.users.email_confirmed_at` **en
   la creación**: bajo D1 = A, W3.8 (drip que se salta al no verificado), W3.11 (banner) y el guardarraíl
   «altas `active` sin correo verificado a 7 días ≤ 15 %» quedaban **inertes el día uno**. El SPEC lo decía en
   R1 y no sacaba la consecuencia. **Aplicado:** nueva **W3.0** (migración aditiva `coaches.email_verified_at`
   + backfill desde `auth.users.email_confirmed_at` + los tres escritores), regla **11** de [SPEC §5](SPEC.md),
   D1 columna A, R1/R3/R4/R11, guardarraíl de §2.2, W0.1, W3.8, W3.11, contrato de datos y carril DB del
   [PLAN](PLAN.md), y +1 h en W3.
2. **B2 — D3 estaba fundada en un dato confundido.** «0/9 invitan» no prueba que el artefacto tape la puerta:
   la cohorte muere en el **paso 2** (2/7 llegan al demo) y los 2 que hacen el artefacto son los 2 que lo
   cruzaron; el paso 2 lo arregla VTA W1+W2, que no está en prod, y n = 9 con < 28 h. **Aplicado:** D3 pasa a
   **C** con **regla de disparo** escrita, W5 queda **condicional** y fuera del carril del día 1 y del total
   base (+4 h aparte), §3 paso 8 y R10 reescritos, diagrama de paralelismo corregido. El análisis **no** se
   borró.
3. **M3 — Guardarraíles sin `n` mínimo.** «Marca ≥ 40 % color» sobre n = 9 (hoy 44 %) flapea con un coach de
   diferencia y dispararía reverts por ruido. **Aplicado:** regla de `n ≥ 20` (o 2 semanas acumuladas) en
   [SPEC §2.2](SPEC.md), con «sin lectura» bajo el mínimo, implementada en W0.1 (columna `n` + NULL) y leída
   en W6.2.
4. **M4 — «Calculado solo» sin tarea.** El objetivo a 30 días prometía la North Star automática y W0.1 era una
   consulta a mano. **Aplicado:** **W1.6** (cron lunes 09:00 CL, `service_role`, Resend al owner), con el
   molde real corregido: los crons viven en **`vercel.json` de la raíz**, no en `apps/web/vercel.json`, que no
   existe. Sumada a la estimación (+2 h) y al gate de salida de W1.
5. **M5 — Hablar con los 21 coaches era un deseo, no una tarea.** **Aplicado:** **W0.8** (owner, 0 código,
   1 h) con las tres preguntas, la lista desde W0.1, correos que **no** se pegan en el documento y resultados
   como tabla anónima. Sale de [SPEC §7](SPEC.md), entra al carril del día 1 y se lee en W6.2.
6. **M6 — Deudas chicas del flujo.** (a) **W3.6c**: `LeadRequestForm.tsx:67,165` es el último Turnstile
   implícito del árbol y migra a `TurnstileWidget.tsx`. (b) **R6 corregida**: los 5 archivos sin commitear
   **no son «de otra sesión»** — son el fix de Turnstile del 23-08 de **esta** sesión (lo documenta el propio
   `TurnstileWidget.tsx:9`); se commitean antes de W3 y lo único que queda es el **orden**
   (W3.6/W3.6b/W3.6c/W3.9 después de ese commit). Corregido en [SPEC §9 R6](SPEC.md), en la lista de
   protección del [PLAN](PLAN.md) y en las notas de W3.6/W3.6b. (c) **W3.12** (MEJORA): recarga única ante
   «Failed to find Server Action», porque W3 **es** un deploy sobre `/register`.
7. **M7 — Redacción del callejón 2 (§4).** Mezclaba el presente con el escenario D1. **Aplicado:** reescrito
   en dos frases, «Hoy:» / «Bajo D1 = A:».
8. **M8 — Frontmatter.** `draft` **no** está definido ni en `docs/README.md` ni en `scripts/check-docs.mjs`
   (el script solo exige que el campo exista, y solo en los canónicos); lo único definido es
   `status: active` (`docs/README.md:79`), que es lo que usa la spec hermana. **Aplicado:** los tres
   documentos pasan a `status: active`; el cuerpo ya declara «EN DISEÑO» y eso no cambia.
9. **Prioridad del owner (23-08): «que lo que ya tenemos funcione fluido y cómodo para coach y alumno va
   primero; agregar cosas es extra a estudiar».** **Aplicado:** las **53** tareas llevan etiqueta
   **ARREGLA / MIDE / AGREGA** justo después del id (34 / 14+1 / 2+2), el «Orden de ejecución» pasó de
   carriles por wave a **tres carriles por etiqueta** —con el 3 declarado «no bloquea nada y se puede no
   hacer»—, la estimación gana columna **Etiqueta (h)** con total por etiqueta (**ARREGLA 42,5 · MIDE 17 ·
   AGREGA 3** + gates 2; +4 condicionales de W5), y arriba del todo hay un **resumen para el owner** de una
   pantalla, en lenguaje humano y sin `archivo:línea`. En [SPEC §3](SPEC.md) quedó la línea que dice que
   **todo el recorrido objetivo es ARREGLA salvo el paso 8** (AGREGA, pospuesto por D3 = C). Dos tercios del
   plan no agregan nada: arreglan lo que ya existe.
10. **G-ENV y G-AUTH resueltos por el jefe (23-08), y uno de los dos destapó código.** **G-ENV: VERDE** —
   Turnstile y los rate limits de Upstash **están activos** en Production (`vercel env ls`: nombres, nunca
   valores) y `NEXT_PUBLIC_APP_URL` sale por **`www`** (host documentado en `lib/site-url.ts:9-11`) ⇒ **W2.7
   pasa a `- [x] no aplica`** y su hora sale del plan, el **callejón 15** del SPEC se cierra como
   «verificado: no ocurre en producción», **R3 pierde** la premisa «puede estar apagado por env» y **D6/W2.8
   dejan de depender de un gate**. **G-AUTH: RESUELTO, pero no por configuración** — el enlace automático de
   identidades **no es configurable** y solo borra las identidades **sin confirmar**, que es justo lo que hoy
   nos protege y lo que `email_confirm: true` anula: bajo D1 = A, quien registre primero el correo de la
   víctima **conserva su contraseña** (pre-account takeover). **Aplicado:** nueva **W3.13** (ARREGLA,
   seguridad, 1,5 h, mismo tren que W3.1), **regla 12** de [SPEC §5](SPEC.md), **R2** con mitigación concreta
   en vez de «leer la política», **D1 = A "solo con W3.13"**, y **D1 deja de estar bloqueada por un gate**:
   pasa a ser decisión pura del owner. **Corrección al brief, verificada abriendo los archivos:**
   `complete.actions.ts` (usuario de Google en `:54`, service-role en `:87`, `insert` en `:121-129`) **no
   alcanza** — en el escenario del ataque la fila `coaches` ya existe y esa acción **no corre**
   (`lib/auth/activate-confirmed-coach.ts:16-18`), y el camino post-Google es 100 % de cliente
   (`lib/auth/post-google-auth.ts:1,29`) ⇒ W3.13 lleva **dos** call sites, uno de ellos server-side nuevo.
   Estimación: **+1,5 h ARREGLA −1 h de W2.7 = 65 h base**.
11. **El owner respondió las once decisiones (23-08, tarde) y descartó una tarea.** **Registradas:** acá
   **D1 = A · D2 = A · D3 = C · D4 = A · D5 = A · D6 = A · D7 = A pero DIFERIDA al martes 2026-08-25** (con
   recordatorio pedido por él; **G-ASC se lee ese día**, no antes), y en
   [vive-tu-app-directo](../vive-tu-app-directo/TASKS.md) **D1 = A · D3 = A · D4 = B · D8 = A**, escritas en
   su propia sección de decisiones. **G-DEC queda `- [x]`.** Consecuencias: **ninguna wave espera al owner**;
   **W2 solo espera el merge de VTA W3**, no una respuesta (R5 y «Orden de ejecución» actualizados); **D6 = A
   ⇒ W2.8 se hace**, aunque sigue siendo AGREGA en el carril 3; y la **única divergencia con la
   recomendación es D7** (el spec pedía B), anotada bajo la tabla de [SPEC §8](SPEC.md).
   **Descartada: W0.8** — escribirles por WhatsApp a los 21 coaches que no invitaron. Palabras del owner:
   **«es invasivo»**. Queda como `- [x] DESCARTADA`, con su hora fuera de MIDE y del total, fuera del
   carril 2 y fuera del «Resumen para el owner». En [SPEC §1.2 H1](SPEC.md) y en §7 la idea de preguntarles
   se reemplaza por lo único que este producto sí puede hacer: **mirar los datos que ya tiene** (W0.1,
   session recordings consentidas) **o preguntar de forma opcional dentro del producto**. Total: **64 h
   base** (ARREGLA 43 · MIDE 16 · AGREGA 3 · gates 2).
