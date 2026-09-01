---
status: draft
owner: product-engineering
last_verified: "2026-08-29"
canonical: false
---

# TESTING & LEGAL — «Cobros coach → alumno» (slug `cobros-coach-alumno`)

Writer «testing-legal» · 2026-08-28 · Repo leído en SOLO LECTURA (`D:\Proyectos\Antigravity\gymappjp`, rama
`rnmobiledenuevo`, HEAD `c85ef28b`). Nombres canónicos tomados de `OUTLINE.md §15`. Cuando el OUTLINE calla,
la decisión va marcada **«Decisión del writer»** para que el jefe la revise.

> **Alineado a las resoluciones del jefe (29-08).** Mandan `DECISIONS.md` (owner) > `OUTLINE-16-RESOLUCIONES.md`
> (**R1–R23**) > `DECISIONS-2.md` > `OUTLINE.md`. Lo tocado en esta pasada: **R1** (`ended`) · **R3** (claim que
> difiere ≤ 5 días, rechazo, forja) · **R5** (nadie sigue cobrando sin acceso) · **R6** (hint sin dominio, en
> `apps/mobile/lib/web-only-hint.ts`) · **R12** (eventos re-procesables) · **R13** (RPC `private.cobros_*`) ·
> **R16** (prepago) · **R21** (`student_billing_consents`, aviso previo corto en `mp_link`, retracto estándar) ·
> **R22** (X1 en nivel C) · **R23** (Notes for Review finales, sin 3.1.3) + las tareas legales W0/W7 y el
> umbral +15 % de DECISIONS-2. Las decisiones del writer que quedaron reemplazadas están marcadas como tales en
> el Anexo final.
>
> **Pasada de remate (consistencia cruzada).** Además: el flag del webhook se llama
> **`COBROS_WEBHOOK_REQUIRE_SIGNATURE`** (nombre de **R22**, antes `…_SIGNATURE_ENFORCE`) · el sweep sigue el
> **único** calendario de `DECISIONS-2 §EMAILS` (E3 en `F+gracia`, corte y E4 en `F+gracia+1`; gracia 0: E2 en
> `F`, corte y E4 en `F+1`) · las migraciones se citan **solo** por `M-n` de `DATA-SECURITY §1` (16, **R17**;
> el diferimiento del umbral A-4 es sobre **M16**) · lo legal es **borrador en W0, publicado y aceptado antes
> de W6, W7 revalida** · y `ended` tiene test propio de espejo web↔RN (**A27**), no solo QA de device.

> **Advertencia de alcance de la PARTE B.** Es investigación de ingeniería de producto sobre fuentes públicas
> (research/s6), **no asesoría legal**. Todo lo marcado ⚠️ **ABOGADO** o 🧮 **CONTADOR** necesita validación
> externa antes de publicarse. Ninguna cláusula de acá se publica tal cual.

---

# PARTE A — PLAN DE PRUEBAS

## A.0 Los tres niveles y por qué el nivel C no es opcional

| Nivel | Qué es | Dónde corre | Qué prueba | Qué NO prueba |
|---|---|---|---|---|
| **A** | vitest con mocks, cero red | CI (`pnpm test`, `package.json:12`) | el contrato entero del motor y del riel MP | nada real de MP |
| **B** | sandbox con test users MLC | preview de Vercel, 1 navegador | OAuth, preapproval, `init_point`, estados, cancelación, aislamiento | **la recepción del webhook del cobro recurrente** |
| **C** | plata real mínima (CLP 2.000) | producción, flag + allowlist beta vacía salvo el par de prueba | el cobro recurrente real → `subscription_authorized_payment` → reactivación/corte | nada más queda |

El motivo de que **C sea obligatorio** está fijado por dos hechos documentados que se suman
(research/s2 §7.1 y §5.3, ratificado por `maps/z-completitud.md §2.7` cuando S1 y S2 se contradijeron):

1. MP, verbatim: *«Los pagos de prueba, creados con credenciales de prueba, no enviarán notificaciones. La única
   vía para probar la recepción de notificaciones es mediante la Configuración a través de Tus integraciones.»*
2. En **MLC**, Suscripciones está **excluida** de ese método de configuración por panel: *«Este método de
   configuración no está disponible para integraciones con Código QR ni Suscripciones.»*

⇒ Para suscripciones en Chile **no existe camino oficial 100 % sandbox** para probar la recepción del webhook
recurrente. Se suple con el script firmado (A.1, caso A16-A17) y se cierra con plata real.

**Corolario que manda sobre todo el riel C (cierra el choque con `DATA-SECURITY §6.1 p.2b`).** Si el webhook
real nunca llega en niveles A y B, entonces **la firma `x-signature` verdadera de MP recién existe en C5/C7**,
o sea **después** de que W5 escribió la validación. Y la hipótesis de qué secret la firma es una **inferencia**
(research/s8 §4.3, marcada por la propia research como el gap de mayor riesgo). Rechazar con 401 sobre una
inferencia no verificada convierte un error de diseño en un apagón silencioso: MP reintenta cada 15 min, ningún
pago se confirma nunca y —como el corte del alumno es derivado— todos los alumnos del riel automático terminan
cortados sin que nadie toque nada.

Por eso el riel se despliega con un interruptor. **R22 lo ratifica**: X1 («qué secret firma») se resuelve en
**nivel C**, con la primera notificación real; hasta entonces el webhook acepta `?token=` **y verifica la firma
si viene**, sin rechazar; en prod la firma pasa a obligatoria recién cuando X1 la confirme.

> **`COBROS_WEBHOOK_REQUIRE_SIGNATURE`** (env, **default `false`**).
> - Con `false`: la firma se **calcula, se compara y se loguea** — evento Sentry
>   `cobros.webhook.signature_mismatch` con el `v1` recibido y el calculado (nunca el secret) — pero **no
>   rechaza**. La autoridad del riel sigue siendo `?token=` (`COBROS_WEBHOOK_TOKEN`, constant-time) **más** el
>   **re-fetch obligatorio** del recurso con el token del coach y la verificación
>   `collector_id === connection.provider_account_id` (T-08), que es la barrera real: el body nunca se cree.
> - Con `true`: rige el 401 de `DATA-SECURITY §6.1 p.2b` tal cual está escrito.
>
> **Secuencia obligada:** W5 se despliega con `REQUIRE_SIGNATURE=false` y allowlist beta de **1** coach → **C7** captura
> la firma real y la compara → si calza con el secret de la app «EVA Cobros», se enciende `REQUIRE_SIGNATURE=true` y eso
> queda como **criterio de salida de la beta** (A.9 S13); si no calza, se rediseña la validación **con el
> sistema en pie y sin plata varada**, en vez de descubrirlo con el riel muerto.
>
> El token **nunca** es opcional: falta `COBROS_WEBHOOK_TOKEN` en prod ⇒ 401 en los dos modos. `REQUIRE_SIGNATURE`
> gobierna **solo** la firma. Es un flag de rampa con fecha de muerte, no una puerta permanente: si sigue en
> `false` al cerrar la beta, no hay GA.

**Riesgo de calendario**: con `frequency_type: 'months'` el segundo cobro llega en ~30 días. El smoke real usa
`frequency: 1, frequency_type: 'days'` en un preapproval descartable con `end_date` corto (+7 días), no el
`+5 años` que usa hoy el billing EVA↔coach (`apps/web/src/lib/payments/providers/mercadopago.ts:269`).

---

## A.1 Nivel A — 26 casos vitest + 2 variantes (CI, sin red)

Convenciones del repo que se respetan (maps/r9 §5): test hermano del archivo (`x.ts` + `x.test.ts`), runner
único en `vitest.config.ts` de la raíz, **mock del módulo de dominio, no de la red** (r9 §8: no hay MSW ni nock).

| # | Caso | Archivo de test sugerido | Test existente a copiar | Aserción central |
|---|---|---|---|---|
| **A1** | `resolveStudentBillingState` — tabla exhaustiva `paid_through × grace_days(0/3) × now × plan_status` → los **seis** estados de **R1**: `off\|ok\|due_soon\|due\|unpaid\|ended` | `packages/cobros/state.test.ts` | `apps/web/src/lib/payments/paid-expiry.test.ts` (tabla de combinaciones, cero mocks) | salida determinista por fila; bordes `endOfDay(paid_through)` y `+grace` en `America/Santiago`; **R2**: un plan recién creado nunca tiene `paid_through null` (se inicializa en `first_due_on`) |
| **A2** | Fail-open del motor: `paid_through == null`, plan `paused`, coach no Pro-activo, módulo apagado, kill-switch on → **siempre `off`** (lista cerrada de **R1**; `canceled` **no** está en ella) | `packages/cobros/state.test.ts` | ídem A1 (regla «en la duda, alert-only» de `paid-expiry.ts`) | ninguna combinación de datos faltantes produce `unpaid` ni `ended` (espejo invertido del gate del coach, que es fail-closed: `20260728125000_student_write_gate_fail_closed.sql:76-104`) |
| **A3** | `periods.ts`: `period_end` por `period_kind` (`monthly/biweekly/quarterly/one_off`), fin de mes (31-ene → 28-feb), año bisiesto, `one_off` sin renovación | `packages/cobros/periods.test.ts` | `tests/mobile-date-utils-santiago-bounds.test.ts` (bordes de día en Santiago) | cero uso de `Date` local: todo por `getSantiagoUtcBoundsForDay` (`apps/web/src/lib/date-utils.ts`) |
| **A4** | Decisiones del cron `cobros-sweep` como función pura: qué plantilla toca cada día y el `dedupe_key` que genera. **Calendario único de DECISIONS-2 §EMAILS** (`F` = `paid_through`, `g` = `grace_days`): E1 en `F-3`, E1-link en `F-5`, **E2 en `F+1`**, **E3 en `F+g`**, **corte y E4 en `F+g+1`**; con `g = 0`, **E2 en `F`** («hoy es el último día») y **corte + E4 en `F+1`**, sin E3. **R4**: el disparo es por **umbral (≤)**, nunca por igualdad de fecha ⇒ un plan creado dentro de la ventana recibe el aviso que corresponda **al día siguiente**, y el dedupe de `client_email_ledger` impide el segundo envío | `apps/web/src/lib/cobros/sweep-decisions.test.ts` | `apps/web/src/lib/payments/paid-expiry.test.ts` | E4 sale **el día del corte**, nunca antes: la fila que sella `cut_notified_at` es la misma que ve al alumno ya sin acceso (aserción explícita contra el off-by-one, cerrado por DECISIONS-2 y por EMAILS §12.3). Con `grace_days = 0` **no** se emite E3; E4 se emite una sola vez (`cut_notified_at`); ninguna fila se «salta» por haber nacido tarde |
| **A5** | Movimiento de `paid_through` según **R8**: **avanza** por confirmación (nunca dos períodos por doble evento) y **retrocede solo** por deshacer confirmación, reembolso o contracargo — cada retroceso auditado en `student_payment_events` | `apps/web/src/services/cobros/confirm-payment.service.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` (admin Supabase stateful in-memory con `Map`) | `update … where paid_through is null or paid_through < nuevo` en el camino de avance (r7 §5.4); el camino de retroceso exige un evento auditado y **no** existe ningún otro `update` que baje el valor |
| **A6** | Idempotencia de la confirmación manual: doble tap del coach en RN ⇒ **una** fila en `client_payments` | mismo archivo que A5 | ídem (caso «redelivery idempotente») | unique en `client_payments.charge_id`; segundo intento devuelve la fila existente, no 500 |
| **A7** | `external-reference.ts` (**R10**): `format`/`parse` de las **dos** formas — preference (`mp_link`) `cobro\|<coachId>\|<clientId>\|<chargeId>` y preapproval (`mp_subscription`) `cobro\|<coachId>\|<clientId>\|<planId>`; UUID inválido ⇒ `null`; string largo ⇒ error explícito; y la cuota de un `authorized_payment` se resuelve **por período** (`[period_start, period_end]`), nunca por el cuarto campo del ref | `apps/web/src/lib/cobros/external-reference.test.ts` | `apps/web/src/lib/payments/checkout-external-reference.test.ts` | round-trip exacto + rechazo de basura (cierra `s1 G4`, longitud máx. no documentada) |
| **A8** | **Defensa en profundidad de la ruta vieja**: `/api/payments/webhook` con `external_reference` que empieza con `cobro\|` ⇒ early-return 200 sin tocar `coaches.subscription_*` | `apps/web/src/app/api/payments/webhook/route.test.ts` (**ampliar el existente**) | el propio archivo (1028 líneas ya escritas) | los tests actuales del billing EVA↔coach siguen verdes: cero cambio de comportamiento |
| **A9** | Canje OAuth `authorization_code`: body exacto (`client_id`, `client_secret`, `code`, `grant_type`, `redirect_uri`, `code_verifier`), **cero query params**, headers `accept`+`content-type` | `apps/web/src/lib/cobros/oauth.test.ts` | `apps/web/src/lib/payments/providers/mercadopago.recurring-webhook.test.ts:21-34` (helper `mockFetchByPath`) | s2 F6: MP responde error si sobran campos |
| **A10** | PKCE: `code_challenge = BASE64URL(SHA256(verifier))`, `code_challenge_method: 'S256'`, verifier de 43-128 chars | `apps/web/src/lib/cobros/oauth.test.ts` | ídem | vector fijo conocido (test de regresión del algoritmo) |
| **A11** | `state` HMAC: se genera con `coachId + nonce + exp`, se valida timing-safe; `state` desconocido, reusado o vencido (>10 min) ⇒ **401** y cero escritura | `apps/web/src/app/api/cobros/mp/callback/route.test.ts` | `apps/web/src/lib/payments/webhook-authorization.test.ts` (182 líneas, patrón de comparación constant-time) | T-14 (r7 §6) |
| **A12** | Refresh del token: `grant_type: 'refresh_token'`, rotación del `refresh_token` persistida atómica; `invalid_grant` ⇒ conexión `error` + correo C5 + planes `mp_*` **no cortan** | `apps/web/src/services/cobros/connection.service.test.ts` | `apps/web/src/lib/payments/paid-expiry.test.ts` (money-safety: en la duda no cortar) | ningún alumno pasa a `unpaid` por un token vencido |
| **A13** | **Anti-mezcla de rieles**: todo request del riel C lleva el `Bearer` de `connection.access_token`, nunca `MERCADOPAGO_ACCESS_TOKEN` | `apps/web/src/lib/cobros/mp-client.test.ts` | `mercadopago.recurring-webhook.test.ts:21-34` (registra las URLs y con qué se llamaron) | + test estático: `getMpAccessToken` **no aparece** en `apps/web/src/lib/cobros/**` (T-11, T-22) |
| **A14** | `auto_recurring.start_date` siempre `.toISOString()` (con milisegundos) | `apps/web/src/lib/cobros/mp-client.test.ts` | el bug ya pagado: `apps/web/src/lib/payments/providers/mercadopago.ts:263-267` (400 «Invalid format in auto_recurring.start_date») | no repetir el 400 |
| **A15** | Webhook `subscription_authorized_payment` ⇒ `GET /authorized_payments/{id}`; **no** toca `/preapproval/{authpay_id}` | `apps/web/src/app/api/cobros/mp/webhook/route.test.ts` | `mercadopago.recurring-webhook.test.ts:37-60` (fija el bug P0-1) | espejo exacto del ruteo ya cicatrizado |
| **A16** | Firma: manifest `id:…;request-id:…;ts:…;` con `data.id` **minusculizado** y campos ausentes **removidos**; y **las dos ramas del interruptor**: con `COBROS_WEBHOOK_REQUIRE_SIGNATURE=false` una firma que no calza ⇒ **se procesa igual** + un solo evento Sentry `cobros.webhook.signature_mismatch` (sin secreto en el payload); con `REQUIRE_SIGNATURE=true` ⇒ **401** | `apps/web/src/lib/cobros/webhook-authorization.test.ts` + `apps/web/src/app/api/cobros/mp/webhook/route.test.ts` | `apps/web/src/lib/payments/webhook-authorization.test.ts` (+ `webhook-authorization.ts:73`, incidente P0-D) | el **token** es obligatorio en prod en los dos modos (falta ⇒ 401, fail-closed); la **firma** solo rechaza con `REQUIRE_SIGNATURE=true`. Contra el helper viejo, que devuelve `true` si falta el secret (`webhook-authorization.ts:57`), acá la ausencia del secret con `REQUIRE_SIGNATURE=true` ⇒ 401, y con `REQUIRE_SIGNATURE=false` ⇒ warning de arranque, nunca un pase silencioso |
| **A17** | **Eventos re-procesables (R12)**: `student_payment_events.status in ('received','applied','failed')`. `insert … on conflict do nothing` **antes** de mutar; existe con `applied` ⇒ 200 y salir sin efectos; existe con `failed`, o con `received` y **más de 2 minutos** de antigüedad ⇒ **se re-procesa** | `apps/web/src/app/api/cobros/mp/webhook/route.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` (dedupe por `provider_event_id` con `Map`) | cierra la ventana check-then-act de `webhook-pipeline.ts:108-118` (r7 §5.1); un `received` de hace 30 s **no** se re-procesa (no hay doble aplicación por redelivery inmediato) |
| **A17b** | **Clasificación de fallos (R12)**: fallo transitorio (MP 5xx / timeout al re-fetchear) ⇒ evento `failed` + **HTTP 502** (MP reintenta cada 15 min); recurso ajeno o tópico desconocido ⇒ `applied` con nota + **200** (no se pide reintento de algo que nunca va a aplicar) | mismo archivo que A17 | ídem | ningún camino devuelve 500; el reintento de MP se pide **solo** cuando re-procesar puede funcionar |
| **A18** | **T-08 cruzado**: evento cuyo recurso re-fetcheado tiene `collector_id ≠ connection.provider_account_id` ⇒ 200 + log, **cero mutación** del alumno | `apps/web/src/app/api/cobros/mp/webhook/route.test.ts` | ídem | el `external_reference` es hint, no autoridad |
| **A19** | **`mp-connect` degrada, no corta (R5)**: `application.deauthorized` ⇒ conexión `revoked`, planes `mp_link`/`mp_subscription` → `manual`, **ningún alumno pierde acceso**, correo **C5** con instrucciones para cancelar en el panel de MP. Aserción negativa: EVA **no** intenta el `PUT status=cancelled` (ya no tiene token) y **no** deja la falla como error silencioso | `apps/web/src/services/cobros/connection.service.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` (caso refund/chargeback que cancela add-ons) | degradación sin corte |
| **A20** | **Claim «ya pagué» (R3)**: `status='claimed'` **no reactiva** — difiere el corte **hasta 5 días** después del fin de la gracia y suspende E2/E3/E4 al alumno mientras vive; **máximo 1 claim vivo por cuota**; rate limit 3/día (`rateLimitCobrosClaim`); el coach recibe C2 al instante y un recordatorio diario | `apps/web/src/app/c/[coach_slug]/pagos/_actions/claim.actions.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` + patrón de `rate-limit.ts` | T-12: forjar un claim compra **como máximo 5 días** y el día 6 el corte ocurre igual sin que nadie intervenga |
| **A20b** | **Rechazo del claim (R3)**: el coach aprieta «Rechazar» ⇒ la cuota vuelve al calendario normal (el diferimiento desaparece, los avisos al alumno se reanudan desde donde corresponda por umbral) y el claim queda registrado como rechazado | mismo archivo que A20 | ídem | rechazar **no** corta antes de tiempo ni reenvía correos ya mandados (dedupe del ledger intacto) |

| **A21** | **`canceled` ≠ acceso eterno (R1)**: plan cancelado por el alumno con `now ≤ paid_through` ⇒ `ok` con copy «tu plan termina el X»; un día después de `paid_through` ⇒ **`ended`** (corte; web «Tu plan con {coach} terminó», app «Tu acceso está en pausa») | `packages/cobros/state.test.ts` | `apps/web/src/lib/payments/paid-expiry.test.ts` | `canceled` **nunca** devuelve `off`; el corte llega por `ended`, no por `unpaid`, y no depende de la gracia |
| **A22** | **Nadie sigue cobrando a quien perdió el acceso (R5)** — los cuatro disparadores del `PUT /preapproval/{id} {status:'cancelled'}`: (a) el plan se cancela; (b) el alumno se **archiva o elimina**; (c) el coach **desconecta MP desde EVA** ⇒ se cancelan **TODAS** sus suscripciones vivas **ANTES** de revocar tokens; (d) el coach **baja a Free** ⇒ correo **C6** + cancelación de suscripciones vivas y planes a `paused`. Reintentos + alerta si la cancelación falla | `apps/web/src/services/cobros/subscription-cancel.service.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` (cancelación de add-ons) | orden verificado en (c): cero llamadas a MP **después** del revoke; ningún disparador deja una suscripción viva; el **kill-switch global NO cancela nada** (solo apaga gate, cron y webhook) |
| **A23** | **Las RPC de plata son atómicas (R13)**: `private.cobros_confirm_charge`, `private.cobros_apply_provider_payment`, `private.cobros_undo_confirmation`, `private.cobros_revert_charge` — cada servicio las invoca **con service-role** y **no** hace la mutación por partes desde JS | `apps/web/src/services/cobros/rpc.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` (mock stateful del cliente admin) | test de barrido: en `services/cobros/**` no hay ningún `update` directo sobre `student_billing_charges`, `client_payments` ni `client_billing_plans.paid_through` — todo pasa por una RPC. El grant se verifica en SQL (A.7) |
| **A24** | **Prepago de N períodos (R16)**: un pago con `client_payments.periods_covered = 3` cierra **3 cuotas consecutivas** con el mismo `payment_id` y deja `paid_through` en el `period_end` de la **última** | `apps/web/src/services/cobros/confirm-payment.service.test.ts` | `apps/web/src/lib/payments/paid-expiry.test.ts` | tres cuotas `paid` apuntando al mismo `payment_id` (**no** hay unique sobre `student_billing_charges.payment_id`); `paid_through` avanza **una** vez, al final del tramo, y el sweep no manda avisos de las cuotas ya cubiertas |
| **A25** | **Consentimiento registrado (R21)**: alta de `mp_subscription` ⇒ fila en `student_billing_consents` con `kind='subscription'`; **primer** checkout de `mp_link` ⇒ fila con `kind='first_checkout'`; ambas con `terms_version`, `consented_at`, `ip_hash` y `user_agent`; el **segundo** checkout del mismo plan **no** vuelve a insertar | `apps/web/src/services/cobros/consent.service.test.ts` | `apps/web/src/app/api/payments/webhook/route.test.ts` | la IP se guarda **hasheada** (nunca cruda) y el user agent truncado; sin fila de consentimiento el export de evidencia (§B.8) **no** se ofrece |
| **A26** | **`description` obligatoria (R21)**: `client_billing_plans.description` no vacía y **≤ 140** caracteres en el Zod del alta; el texto viaja tal cual a **E5** y **E6** | `packages/cobros/schemas.test.ts` | patrón Zod de `packages/schemas` | 141 caracteres ⇒ error de validación; el plan no se crea sin descripción |
| **A27** | **Espejo web ↔ RN de los seis estados (R1 + R7)**: para `off\|ok\|due_soon\|due\|unpaid\|ended`, la web y `/api/mobile/config` dicen **lo mismo**. Los dos estados de corte se distinguen: `unpaid` ⇒ web `/c/[slug]/suspended?reason=unpaid` + RN `studentAccess:{state:'blocked',reason:'unpaid'}` (copy `blockScreen.unpaid`, «Tu acceso está en pausa»); **`ended`** ⇒ web `/c/[slug]/suspended?reason=ended` con «Tu plan con {coach} terminó» **y sin CTA de pago** + RN `reason:'ended'` con el copy **`blockScreen.ended`**. `off\|ok\|due_soon\|due` **no** redirigen ni bloquean en ninguna de las dos | `apps/web/src/app/c/[coach_slug]/suspended/page.test.ts` + `apps/web/src/app/api/mobile/config/route.test.ts` | `apps/web/src/lib/payments/paid-expiry.test.ts` + los tests vivos de `/api/mobile/config` | tabla de 6 filas × 2 superficies: **cero** filas donde la web corte y RN no (o al revés), y **cero** filas donde `ended` caiga en el default genérico «Acceso pausado» — el `reason` viaja entero desde el estado derivado hasta el copy. Con un **binario viejo** (sin el OTA) `ended` degrada a la pausa genérica, nunca a texto vacío (R7) |

**Casos extra recomendados (no numerados, mismo nivel):** rechazos `FUND`/`OTHE` ⇒ el alumno entra en `due`
(gracia), nunca `unpaid` inmediato · `checkout_url`/`init_point` **jamás** en la respuesta de
`/api/mobile/config` ni de las rutas `api/mobile/coach/cobros` (T-20; ver A.8 guard G4) · `client_email_ledger`
deduplica por `<template>:<charge_id>` y un segundo envío del mismo día no genera fila nueva.

**Decisión del writer (A-1).** El motor puro vive en `packages/cobros` (OUTLINE §4) y sus tests corren en el
runner de la raíz sin tocar `apps/mobile` — evita el gotcha `project_ci_root_test_mobile_dep_gotcha`.

---

## A.2 Nivel B — sandbox con test users MLC, paso a paso

**Presupuesto de cuentas**: 4 de las 15 disponibles. Las cuentas de prueba **no se pueden borrar** (s2 §2):
`EVA-C-coach-A` (Vendedor MLC, con saldo), `EVA-C-alumno-A1` (Comprador MLC), `EVA-C-coach-B` (Vendedor, para
aislamiento), `EVA-C-alumno-B1` (Comprador). Credenciales (usuario, contraseña, código de 6 dígitos) van al
gestor de secretos del owner, **nunca al repo**.

**Camino elegido: (b) credenciales del vendedor de prueba + comprador de prueba** — no el sandbox por
`X-scope: stage`. El propio código lo dejó escrito: *«(a) sandbox: token TEST- + X-scope:stage — simple pero
**inestable en preapproval**; (b) … el camino que MP recomienda para suscripciones»*
(`apps/web/src/lib/payments/providers/mercadopago.ts:125-131`). El guard de `@testuser.com`
(`mercadopago.ts:133-137`) y el guard inverso en prod (`:141-144`) hay que **replicarlos** en `lib/cobros/mp-client.ts`.

**Pasos**

| # | Paso | Detalle |
|---|---|---|
| B0 | App MP «EVA Cobros (test)» con `redirect_uri` **estática** de preview | s2 F6: la URI debe coincidir exacto ⇒ un preview efímero de Vercel **no sirve**; hace falta un host fijo (alias de preview estable o `staging.eva-app.cl`) |
| B1 | `COBROS_ENABLED=true`, `COBROS_BETA_COACH_IDS` = solo el coach QA, `MERCADOPAGO_TEST_PAYER_EMAIL` = comprador `@testuser.com` | envs del entorno de QA, nunca prod |
| B2 | OAuth end-to-end en navegador: `auth.mercadopago.com/authorization` → login `EVA-C-coach-A` → consentimiento → callback → `POST /oauth/token` con `test_token: true` | **gated por el experimento X2** (A.4) |
| B3 | Verificar persistencia: `coach_payment_connections` con `provider_account_id`, tokens cifrados, evento en `coach_payment_connection_events` | leer con service-role; **no** transcribir tokens a ningún archivo |
| B4 | `POST /preapproval` con el token del coach ⇒ `id` + `init_point` + `status: 'pending'` | `mercadopago.ts:272-291` es la forma; `status:'pending'` porque `'authorized'` exige `card_token_id` (`:281-282`) |
| B5 | El comprador abre el `init_point`, paga con tarjeta MLC + titular **`APRO`** ⇒ `authorized` | tarjetas MLC en s2 §6; **el resultado lo decide el nombre del titular**, no la tarjeta |
| B6 | Matriz de rechazos: `FUND`, `OTHE`, `SECU`, `CONT` | `FUND` es el caso real (alumno sin saldo) ⇒ debe producir `due`, no `unpaid` |
| B7 | `GET /preapproval/{id}` (`next_payment_date`), `PUT` para pausar y cambiar monto | espejo del cron `cobros-mp-reconcile` |
| B8 | Cancelación por el alumno desde `/c/<slug>/pagos` ⇒ `status: 'cancelled'` en MP | **irreversible** (s2 F8: *«Una vez que canceles un suscriptor, no podrás volver a activar a ese cliente»*) ⇒ el modelo soporta N preapprovals por par (coach, alumno) |
| B9 | Refresh forzando `expires_at` en DB | y el camino `invalid_grant` |
| B10 | Aislamiento: coach A no lee ni muta recursos del coach B; alumno A1 no toca la cuota de B1 | se cruza con los tests SQL de A.7 |
| B11 | Webhooks **emulados** con `scripts/cobros-fake-webhook.mjs` (a construir; hoy no existe ninguno: `ls scripts \| grep -i "mp\|pay\|webhook"` = 0) | firma el manifest a mano y postea `subscription_preapproval` / `subscription_authorized_payment` contra preview |

**Evidencia a guardar** (carpeta de QA del owner, fuera del repo): captura del consentimiento OAuth · JSON de
`/oauth/token` **con `access_token` y `refresh_token` redactados** · `preapproval.id` + `init_point` ·
capturas del checkout con `APRO` y con `FUND` · `GET /preapproval/{id}` antes y después.

**Qué NO valida el nivel B (decirlo en el plan, no descubrirlo en prod):** recepción del webhook del cobro
recurrente · reintentos y dunning reales de MP · la firma `x-signature` **real** de MP para tópicos de
suscripción · liquidación y comisión efectiva · correos de MP al suscriptor · `mp-connect` al desvincular.

---

## A.3 Nivel C — plata real (checklist C0..C13)

**Precondiciones**

- El «coach» es una cuenta MP **distinta de la dueña de la aplicación**: cuenta personal del socio o segunda
  cuenta MP del owner. **Nunca** la cuenta Empresa «EVA SPA» que sostiene el billing EVA↔coach (riesgo abierto
  s2 §4.2 G3; se cierra con el experimento X3).
- El «alumno» = tarjeta real del owner/socio, en cuenta MP distinta de la del coach (evita
  *«You can't pay yourself»*, s8 gap 10) y en **otro navegador o perfil**.
- Saldo ≥ **CLP 5.000** en la cuenta del coach: sin saldo el reembolso **no se ejecuta** (s2 F9).
- `COBROS_ENABLED=true` en prod con `COBROS_BETA_COACH_IDS` = **solo** el coach de prueba, `COBROS_GA=false`.
- Alumno de prueba propio, correo `@evatest.cl`, marcado para purga posterior.

| # | Paso | Qué verifica | Evidencia |
|---|---|---|---|
| C0 | Probe de monto mínimo: crear y cancelar preapprovals de 100 / 500 / 1.000 CLP | el piso real de CLP (crear un preapproval **no cobra**; cobra recién al autorizar) | los 3 status/errores HTTP |
| C1 | Coach real → `/coach/cobros` → «Conectar Mercado Pago» → autoriza (OAuth productivo, sin `test_token`) | `redirect_uri` exacta, `state` validado, tokens cifrados | captura del consentimiento + fila en DB (token **no** transcrito) |
| C2 | Ver en el panel MP del coach que «EVA Cobros» aparece vinculada y es revocable | el coach puede salir solo | captura |
| C3 | Coach crea el cobro: **CLP 1.000**, `frequency: 1, frequency_type: 'days'`, `end_date` +7 días | preapproval creado con el token del coach; `init_point` válido | `preapproval.id`, `init_point`, `external_reference` |
| C4 | Alumno abre el `init_point` y paga con tarjeta real | primer cobro real; `status: authorized` | comprobante MP, `payment.id` |
| C5 | Llega `subscription_preapproval` a `notification_url` | el `notification_url` **por recurso** funciona (en MLC es la única vía) | log de Vercel del POST + 200 |
| C6 | **Esperar el cobro del día siguiente** | `subscription_authorized_payment` real ⇒ EVA avanza `paid_through` y mantiene acceso | log + fila en `client_payments` + `notifications_history` de MP |
| C7 | **Capturar y comparar la firma real** (el riel corre con `COBROS_WEBHOOK_REQUIRE_SIGNATURE=false`, así que un desajuste **no** tira el pago) | si el `v1` calculado con `COBROS_WEBHOOK_SIGNING_SECRET` de «EVA Cobros» coincide con el `x-signature` de MP — **cierra X1**. Coincide ⇒ se enciende `REQUIRE_SIGNATURE=true` y se re-corre C6 para ver un evento firmado aceptado; no coincide ⇒ `REQUIRE_SIGNATURE` sigue en `false` y se rediseña la validación | log con `v1` recibido vs calculado (sin secretos) + captura del evento Sentry `cobros.webhook.signature_mismatch` si lo hubo |
| C8 | Simular impago (pausar el preapproval o dejar caer la tarjeta) | EVA entra en `due` (gracia 3) y recién al vencer corta | timeline de estados + correos E2/E3/E4 |
| C9 | Reactivar (reanudar / nuevo cobro aprobado) | reactivación **sin intervención manual** (estado derivado) | timeline + correo E5/E10 |
| C10 | **El alumno cancela solo** desde `/c/<slug>/pagos` | `PUT /preapproval/{id} {status:'cancelled'}`; MP avisa al suscriptor; **irreversible** | captura + estado MP + correo E7 |
| C11 | Reembolsar los cobros reales (`POST /v1/payments/{id}/refunds`) | el coach tiene saldo; devolución dentro de 180 días | comprobantes |
| C12 | El coach **desvincula** su MP desde el panel de MP | llega `mp-connect`; EVA degrada a `manual` **sin cortar** — cierra X11 | log + estado + correo C5 |
| C12b | **Desconectar desde EVA (R5)**: con una suscripción viva, el coach usa «Desconectar Mercado Pago» en `/coach/cobros` | el diálogo dice que se cancelarán las suscripciones; EVA hace el `PUT status=cancelled` de **todas** las vivas **ANTES** de revocar los tokens; ninguna queda cobrando | orden de las llamadas en el log + `GET /preapproval/{id}` = `cancelled` + estado de la conexión |
| C13 | Limpieza: borrar el par de prueba, revocar tokens, vaciar la allowlist beta | nada queda vivo cobrando; se re-verifica que no quede **ningún** preapproval en estado `authorized` del par de prueba | checklist firmado + listado de preapprovals vacío |

- **Costo**: 2 cobros × CLP 1.000 = **CLP 2.000**, reembolsables (neto ≈ 0 menos la comisión que MP no
  devuelva — a confirmar en X8).
- **Duración**: C0-C5 en una tarde; C6 exige **1 día calendario**; C8-C13 al día siguiente ⇒ **2 días de
  calendario, ~3 h de trabajo efectivo**. Si C7 calza y se enciende `REQUIRE_SIGNATURE=true`, sumar **1 día más** para
  ver un cobro firmado aceptado con la firma ya siendo barrera (no se enciende el flag a ciegas al final).
- **Quién lo hace**: el **owner** (C1-C3, C10-C13 tocan su cuenta MP y su plata) con un agente asistiendo en
  la lectura de logs. El «coach» puede ser el **socio** si presta su cuenta MP; en ese caso C1, C2 y C12 los
  hace el socio y el owner mira. **Ningún agente ejecuta pasos que muevan plata.**

---

## A.4 Los experimentos MP sin dueño (X1..X12)

Ordenados por **cuántas decisiones del SDD desbloquean**, no por dificultad. Cierran `maps/z-completitud.md`
G7 y los gaps de research/s1 §8 y s8 §11. Ninguno lo ejecuta un agente por su cuenta: los que **mutan** la
cuenta MP real del owner (crear test users es irreversible y hay 15 en total) van con aprobación explícita.

| # | Experimento | Hipótesis | Procedimiento | Criterio de aceptación | Dueño | Si falla |
|---|---|---|---|---|---|---|
| **X1** | **¿Qué secret firma el webhook de un recurso creado con el token OAuth del vendedor?** | El de la **app de EVA** (s8 §4.3: la clave es atributo de la aplicación; el `preapproval` lleva `application_id` de EVA). Es una **inferencia**, no una frase oficial | **Es el paso C7 del nivel C, no el nivel B.** En sandbox no hay POST que capturar (A.0: con credenciales de prueba MP no notifica, y en MLC Suscripciones está fuera del simulador), así que el nivel B solo valida el **verificador** contra firmas **sintéticas** (`scripts/cobros-fake-webhook.mjs`, B11). En C7, con el riel ya en prod y `COBROS_WEBHOOK_REQUIRE_SIGNATURE=false`, la ruta loguea el `x-signature` crudo recibido y el `v1` calculado con el secret de «EVA Cobros», y se comparan | El `v1` calculado con el secret de EVA **coincide** con el `x-signature` real de un evento `subscription_authorized_payment` de C6 | owner (C7; el agente lee logs). El endpoint ya está desplegado: no hace falta staging | **NO bloquea W5** (con `REQUIRE_SIGNATURE=false` el riel funciona: la autoridad es `?token=` + re-fetch con el token del coach + `collector_id`). Lo que bloquea es **encender `REQUIRE_SIGNATURE`** y, con él, el GA: si el `v1` no calza, se rediseña la validación (probar el secret de la app del coach, o aceptar que la firma no es barrera y dejarla en modo observación permanente, documentado) |
| **X2** | **¿Un test user vendedor puede autorizar la app por OAuth?** | Sí (práctica de la industria; **ninguna frase oficial** lo dice — s2 §4.2) | Crear `EVA-C-coach-A` (Vendedor MLC), abrir `auth.mercadopago.com/authorization?...` logueado con él, completar el consentimiento | Vuelve un `code` válido y `POST /oauth/token` con `test_token:true` devuelve access+refresh | owner (mutación: crea test user) | **El nivel B entero se cae.** Todo OAuth se valida recién en nivel C, con plata real, y el riesgo del riel se dispara. |
| **X3** | **¿La cuenta dueña de la app puede autorizarse a sí misma?** | No (sugerido por un resumen de F6; **el texto crudo no lo dice** — s2 §4.2 G3) | Intentar el OAuth logueado con la cuenta Empresa «EVA SPA» | Si MP rechaza ⇒ hipótesis confirmada | owner | Si **sí puede**, se simplifica el nivel C (el owner puede ser su propio coach). Si **no puede**, C1 exige la cuenta del socio o una segunda cuenta MP ⇒ dependencia externa en el calendario de la beta. |
| **X4** | **¿El alumno necesita cuenta MP para el `init_point` de suscripción en Chile?** | No para Checkout Pro; **no confirmado para suscripciones** (s1 G5) | Abrir un `init_point` real de preapproval en **ventana privada, sin sesión MP** y llegar hasta el formulario de tarjeta | Se puede completar el alta sin crear cuenta MP | owner (2 min, gratis) | Si **exige cuenta MP**, la adopción del modo `mp_subscription` se desploma (el alumno chileno promedio no tiene cuenta MP) ⇒ el modo `mp_link` (Checkout Pro por ciclo) pasa a ser el riel automático principal y `mp_subscription` queda como opción avanzada. **Cambia la jerarquía de la UI del alumno.** |
| **X5** | **Monto mínimo en CLP** | Existe uno y está por debajo de 1.000 (las páginas de ayuda `.cl` dan **403** — s1 G3, s2 G5, s8 gap 8) | Es el paso **C0**: crear y cancelar preapprovals de 100/500/1.000 CLP y registrar cuál devuelve 400 | Se conoce el piso exacto | owner (gratis: crear un preapproval no cobra) | Si el piso es alto (p. ej. 5.000), hay que validar `amount_clp` en el form del coach y avisar por copy. Afecta el Zod de `packages/cobros/schemas.ts`. |
| **X6** | **¿`EVA SPA` (AppID `539042216877374`) tiene OAuth/Redirect URI, o hace falta app nueva?** | Hace falta **app nueva** (recomendado igual por higiene: secret de webhook separado — s2 G8, s8 §2.10) | Abrir el panel → Tus integraciones → ver si la app expone Redirect URI y toggle PKCE; crear «EVA Cobros» (producto Suscripciones) y «EVA Cobros (test)» | Existen dos apps nuevas con Redirect URI HTTPS y PKCE activo | owner (mutación de cuenta) | Si MP **no deja** crear una segunda app, el riel C comparte secret con el billing crítico ⇒ hay que endurecer la separación por ruta y aceptar el blast radius (contradice OUTLINE §0.1). |
| **X7** | **¿`/preapproval` acepta e ignora `marketplace_fee`, o devuelve 400?** | Lo ignora o lo rechaza; la doc de suscripciones **no lo menciona** (s2 G7, s8 gap 5) | Enviar un preapproval de prueba con `marketplace_fee: 0` y con `marketplace_fee: 100` | Se sabe si el campo existe en este endpoint | agente (con token de test user, sin plata) | Irrelevante hoy (comisión 0 %). Si lo **acepta silenciosamente**, hay que dejarlo documentado como trampa: el día que EVA cobre un fee, cambia el encuadre tributario (PARTE B §B.7 y R6). |
| **X8** | **Comisión real de MP Chile 2026 (Suscripciones y Checkout Pro)** | Entre 2,89 % y 3,19 % + IVA; terceros se contradicen y `mercadopago.cl/ayuda/...` da **403** (s1 G3, s2 G6) | El owner abre su panel MP → Costos, y el coach de prueba el suyo | Un número citable con fecha | owner (5 min) | Sin el número, el copy de conexión (correo C4, §B.2 N.6) no puede decirlo y el coach lo pregunta igual. **No bloquea código, bloquea copy.** |
| **X9** | **Expiración del link de pago y de la preference** | El link del panel no expira o expira a 30 días (fuentes se contradicen, s1 G2); la preference acepta `expiration_date_to` | Crear un link en el panel y mirar qué dice; crear una preference con `expiration_date_to` +30 días y verificar el rechazo posterior | Se conoce el comportamiento de ambos | owner (panel) + agente (API) | Si la preference **no** respeta `expiration_date_to`, el cron `cobros-mp-reconcile` tiene que expirar las cuotas por su cuenta (ya está previsto) — impacto bajo. |
| **X10** | **¿El Simulador de notificaciones ofrece `subscription_authorized_payment`?** | Probablemente **no** en MLC (Suscripciones está excluida del método por panel — s2 §5.3, G4) | Abrir Tus integraciones → app → Webhooks → Simular, y mirar el desplegable de tópicos | Se sabe si hay simulador utilizable | owner (2 min) | Si no lo ofrece (lo esperado), el único camino de prueba de recepción en sandbox es `scripts/cobros-fake-webhook.mjs` (B11) y el nivel C queda **más** obligatorio. Ya está asumido así. |
| **X11** | **Payload real de `mp-connect`** | Existe el tópico; **no hay JSON de ejemplo ni tabla de atributos** en la doc (s8 gap 2) | Es el paso **C12**: el coach desvincula desde su panel y se captura el POST | Se conoce la forma del body para escribir el handler | owner (C12) | Sin el payload, el handler de desvinculación se escribe defensivo (leer `user_id`/`application_id` con `??` y caer al reconcile diario). Impacto medio: la degradación a `manual` se retrasa hasta el cron. |
| **X12** | **Homologación: confirmar que Suscripciones no la exige** | Confirmado hoy: `quality_checklist` contra AppID `539042216877374` devuelve *«Product not homologable»*, y el enum de `form_homologation` es `["checkout","in_person_payments","qr_orders"]` (s2 §8) | Repetir `quality_checklist` contra la app **nueva** «EVA Cobros» una vez creada (X6) | Mismo resultado ⇒ no hay checklist bloqueante | agente (tool de solo lectura) | Si la app nueva **sí** es homologable, hay que presupuestar el proceso antes de GA (semanas). **Correrlo apenas exista la app.** |

**Regla operativa transversal**: cada experimento se cierra con una línea en `docs/specs/cobros-coach-alumno/`
(fecha, quién, resultado, evidencia) — un experimento sin registro se vuelve a correr.

---

## A.5 Playwright e2e

**Reglas heredadas, no negociables** (`docs/operations/QA_PLAYWRIGHT.md`, `playwright.config.ts:18-26`, memoria
`feedback_qa_playwright_prod_un_navegador`): **1 solo navegador** (`workers: 1`, `fullyParallel: false`), un
solo proceso a la vez, tandas ≤ 15 min, prohibido `networkidle` (`pnpm qa:lint` lo caza), y **cuentas propias
`@evatest.cl`** — la allowlist estructural de `tests/e2e-accounts.ts:22-52` tira `throw` si un spec apunta
fuera de ella (nació de un incidente real: la suite archivó el plan de una alumna real bajo `josefit`).

**Decisión del writer (A-2).** Los specs de cobros corren contra **preview de Vercel**, no contra producción:
mutan plata y estado de acceso. Se agrega un **project nuevo** en `playwright.config.ts` con la misma forma que
`nutrition-v2` (`playwright.config.ts:72-82`): `name: 'cobros'`, `testMatch: /tests[\\/]cobros[\\/].+\.spec\.ts$/`,
`fullyParallel: false`, se auto-omite sin `PLAYWRIGHT_BASE_URL`. Script: `"test:e2e:cobros": "playwright test
--project=cobros --workers=1"`. Cuentas nuevas a sumar a la allowlist: `e2e-cobros-coach@evatest.cl` (Pro, en
`COBROS_BETA_COACH_IDS` del preview) y `e2e-cobros-alumno@evatest.cl`.

| Spec | Flujo | Pasos y aserciones |
|---|---|---|
| `tests/cobros/cobros-manual-ciclo.spec.ts` | **Ciclo completo modo `manual`** | (1) coach entra a `/coach/tools` y ve la tarjeta **Cobros**; (2) `/coach/cobros` → onboarding 3 pasos (declaración tributaria + anexo T&C) → «Cómo cobras»; (3) ficha del alumno → pill **Pagos** → «Activar cobro» (monto, cada mes, primer vencimiento, modo manual, gracia 3); (4) login del alumno → banner `due_soon` visible en `/c/<slug>`; (5) alumno en `/c/<slug>/pagos` → «Avisar a mi coach» + adjunta comprobante (`tests/fixtures/checkin-tiny.png` ya existe) ⇒ badge «Avisó que pagó» en el panel del coach; (6) coach confirma ⇒ `paid_through` avanza, estado `Al día`, fila en el historial; (7) alumno recarga: banner desaparece |
| `tests/cobros/cobros-gracia.spec.ts` | **Gracia 0 vs 3** | Con dos alumnos y `paid_through` en el pasado sembrado por fixture: alumno con `grace_days=3` ⇒ **acceso normal + banner `due`** con la fecha límite; alumno con `grace_days=0` ⇒ redirect a `/suspended?reason=unpaid` con «Tu acceso está en pausa». Aserción negativa clave: **el alumno en gracia puede guardar un registro** (el gate no lo bloquea antes de tiempo) |
| `tests/cobros/cobros-cancelacion.spec.ts` | **El alumno cancela solo** | `/c/<slug>/pagos` → «Cancelar mi suscripción» → confirmación con motivo ⇒ plan `canceled`, `canceled_by='student'`, **conserva acceso hasta `paid_through`** con el copy «tu plan termina el X»; con `paid_through` sembrado en el pasado el mismo alumno cae en **`ended`** (**R1**) y es redirigido a **`/c/<slug>/suspended?reason=ended`** con «Tu plan con {coach} terminó» **sin CTA de pago** — nunca acceso eterno ni el genérico «Acceso pausado». Aserciones legales (Ley 21.398, §B.1 E11): el botón está disponible **también con la cuota vencida** (no se condiciona al pago) y el camino tiene **≤ los mismos pasos** que suscribirse |
| `tests/cobros/cobros-claim.spec.ts` | **«Ya pagué» difiere, no reactiva (R3)** | Cuota vencida y gracia terminada: (1) el alumno manda el claim ⇒ el coach ve «Diego avisó hace N días» y **cero** correos E2/E3/E4 nuevos al alumno; (2) el acceso **no** vuelve a `ok` — sigue en `due`/`unpaid` con el corte **diferido hasta 5 días**; (3) con el reloj sembrado en el día 6, el corte ocurre igual; (4) el coach **rechaza** el claim ⇒ vuelve el calendario normal; (5) un segundo claim sobre la misma cuota es rechazado (máx. 1 vivo) |
| `tests/cobros/cobros-aviso-previo.spec.ts` | **Aviso previo y consentimiento (R21)** | Alta de `mp_subscription`: el aviso **completo** (§B.3) es visible sin scroll oculto, los dos checkboxes son bloqueantes y al aceptar queda una fila `student_billing_consents` con `kind='subscription'`. **Primer** checkout de `mp_link`: se muestra la **versión corta** antes de salir a MP y queda la fila con `kind='first_checkout'`; el **segundo** checkout del mismo plan **no** vuelve a mostrarla ni a insertar. Aserción negativa: ninguna pantalla muestra la IP del alumno |
| `tests/cobros/cobros-kill-switch.spec.ts` | **Kill-switch** | Con `COBROS_KILL_SWITCH` activo en el Edge Config del preview **y** la fila `platform_flags.cobros_gate` apagada por el mismo endpoint admin (**R14**): el alumno cortado **recupera acceso** (fail-open), el banner desaparece, `/coach/cobros` muestra el estado «módulo en pausa» y el cron no manda correos. Aserción de **R5**: el kill-switch **no cancela ninguna suscripción** — los preapprovals siguen vivos y al apagarlo todo vuelve como estaba. Espejo del patrón `STUDENT_ACCESS_GATE` (`apps/web/src/lib/student-access.server.ts:18-29`) |

**Fuera del alcance de Playwright** (a propósito): todo lo que hable con MP. El checkout vive en el dominio de
MP; automatizarlo es frágil y contra sandbox es inestable. Los modos `mp_link` y `mp_subscription` se validan
en los niveles B y C, no acá.

---

## A.6 QA en device (iOS / Android)

Se corre por cable con `adb` + Metro (memoria `project_qa_device_adb_metro_gotchas`: el dev apunta a PROD y
leer el repo recarga la app). **Cada pantalla se mira tres veces**: dark, claro y con un coach white-label
(marca ≠ azul EVA) — la causa raíz de `project_whitelabel_rn_vars_identity_root_cause_20260822` fue
exactamente saltarse el SO en claro.

### Checklist de pantallas

| # | Superficie RN | Qué mirar | dark / claro / white-label |
|---|---|---|---|
| D1 | Ficha del alumno → pill **Pagos** (`app/coach/cliente/[clientId].tsx`, revive `FacturacionTab`) | estado, pagado hasta, monto ya cobrado, historial, botón **Confirmar pago recibido**, `<WebOnlyHint/>` | ☐☐☐ |
| D2 | Dashboard del coach: `MobileBanner` «N alumnos por cobrar» | contraste del banner, tap → `coach/cobros.tsx` | ☐☐☐ |
| D3 | `coach/cobros.tsx` (lista del mes) | chips de estado, confirmar, **sin ajustes ni conectar MP** | ☐☐☐ |
| D4 | Hub de Herramientas RN: tarjeta **Cobros** | Pro activa / Free «no incluido en tu plan» (`ModuleOffNotice`) | ☐☐☐ |
| D5 | `CreateClientModal` (alta de alumno) | el hint no empuja el layout ni tapa el teclado | ☐☐☐ |
| D6 | Home / perfil del alumno: fila «Tu plan con tu coach · Al día hasta 12 sep» | **sin monto** | ☐☐☐ |
| D7 | Banner `due` del alumno | «Tu acceso sigue funcionando hasta el X» + `Avisar a mi coach` + `Escribir a mi coach` | ☐☐☐ |
| D8 | Pantalla bloqueada, **los dos motivos de R7**: `reason:'unpaid'` (copy `blockScreen.unpaid`) y `reason:'ended'` (copy **`blockScreen.ended`**, la rama que construye W4) (`StudentAccessBlocked.tsx`) | título, cuerpo, hint «Tu progreso está guardado», un solo CTA (**y en `ended` ningún CTA de pago**), cerrar sesión; y con un **binario viejo** (sin el OTA) la pausa **genérica** se ve bien, sin texto roto ni motivo vacío | ☐☐☐ |
| D9 | Safe areas en las 8 anteriores (notch, barra de gestos, teclado abierto) | nada tapado, nada bajo la barra | ☐☐☐ |

### Checklist de compliance (bloqueante; una sola cruz roja frena el envío)

| # | Verificación | Cómo se comprueba |
|---|---|---|
| P1 | **Cero precios de EVA** en cualquier pantalla del módulo | visual + `tests/mobile-no-prices.test.ts` (barre `apps/mobile/**` buscando `monthlyPriceClp`, `$29.990`, `29990`, `/mes` — `:37-45`) |
| P2 | **Cero links de MercadoPago**: ni `init_point`, ni `checkout_url`, ni `mpago.la` | inspección de la respuesta de `/api/mobile/config` y de `api/mobile/coach/cobros` en el proxy de red; guard G4 (A.8) |
| P3 | **El `<WebOnlyHint/>` no es tocable** | tocarlo con el dedo (sin ripple, sin estado activo) y con **VoiceOver/TalkBack**: debe anunciarse como *texto*, jamás como *link* o *botón* (`accessibilityRole="text"`, patrón vivo en `apps/mobile/app/coach/(tabs)/subscription.tsx:354-370`) |
| P4 | **`wa.me` sin `text`** con monto o con la palabra «pagar» | abrir el CTA «Escribir a mi coach» y mirar la URL: `isStoreSafeUrl` valida host, **no** el query string (`apps/mobile/lib/store-compliance.ts:68-90`) |
| P5 | **El alumno nunca ve «paga en la web»**, ni en iOS ni en Android | leer las 4 pantallas del alumno palabra por palabra |
| P6 | **Un solo hint por pantalla** y ninguno en onboarding ni en la primera pantalla post-login | recorrido completo del coach |
| P7 | **Cero dominio y cero URL en el hint de cobros (R6)**: el copy es «El cobro a tus alumnos se configura desde el computador» (variante ficha: «El cobro de este alumno se configura desde el computador»), **sin** `eva-app.cl`, sin `http`, sin esquema | leer el literal de `apps/mobile/lib/web-only-hint.ts` + guard G2; iOS auto-detecta URLs y las vuelve tocables, así que la defensa es que **no haya** URL. El topic `plan` sigue usando `storePlanChangeCaption(platform)`, que **sí** nombra el dominio en Android — ese es el único lugar donde aparece |
| P8 | El monto que cobra el coach **sí** puede mostrarse (es dato, no tarifario de EVA) pero **nunca** con sufijo `/mes` | usar «cada mes»; `/mes` está prohibido por `mobile-no-prices.test.ts:44` |

**A-3 — RESUELTA POR R6 (ya no es decisión del writer).** El hint de cobros es **un copy único, sin dominio,
iOS = Android**:

- Pantalla del coach / hub: **«El cobro a tus alumnos se configura desde el computador»**
- Ficha del alumno: **«El cobro de este alumno se configura desde el computador»**

Reglas que se prueban:

1. Los dos literales viven en **`apps/mobile/lib/web-only-hint.ts`** (archivo nuevo, propio del hint), y
   `<WebOnlyHint topic="cobros"/>` los importa desde ahí. **No** se crea `STORE_COBROS_SETUP_CAPTION` en
   `apps/mobile/lib/client-cap.ts` ni se toca la allowlist de `tests/mobile/store-copy.test.ts:25` para el
   dominio: el copy de cobros **no nombra ningún dominio**, así que no necesita el permiso que ese guard
   administra.
2. El topic `plan` sigue usando `storePlanChangeCaption(platform)` (`apps/mobile/lib/client-cap.ts:91-93`,
   `undefined` fuera de Android) **sin cambios**. Los dos topics conviven en el mismo componente con fuentes de
   copy distintas, y eso es a propósito: el de plan es una excepción de tienda negociada; el de cobros no
   necesita excepción porque no dice dónde ir.
3. `tests/mobile/store-copy.test.ts` se **amplía** con un caso que pinnea los dos literales de
   `web-only-hint.ts` y que **falla si contienen `eva-app.cl`, `http`, `www.` o cualquier `.cl`** — la
   aserción es de **ausencia**, no de allowlist (guard G2 en §A.8).
4. **Cero «eva-app.cl» nuevo en la app**: el barrido de G2 corre sobre `apps/mobile/**` y el único hit legítimo
   del dominio sigue siendo el ya existente en `client-cap.ts`.

---

## A.7 Tests SQL — grants, aislamiento y `EXPLAIN` del gate

El repo ya tiene la convención: `supabase/tests/*.sql` con `BEGIN … ROLLBACK` (11 archivos hoy, 8 de ellos
`*_rollback.sql`), y el ejemplo de oro es `supabase/tests/student_gate_equivalence.sql:15-16` (`BEGIN;
SET LOCAL statement_timeout = '300s';` … `ROLLBACK`), con criterio de paso doble: **0 veredictos distintos** y
**≥ 150 positivos no triviales** para que la prueba no sea vacua.

| Archivo | Qué asegura | Criterio de paso |
|---|---|---|
| `supabase/tests/cobros_grants.sql` | `has_table_privilege('anon'\|'authenticated', <tabla>, 'INSERT'\|'UPDATE'\|'DELETE') = false` para `coach_billing_settings`, `client_billing_plans`, `student_billing_charges`, `student_subscriptions`, `student_payment_events`, `student_billing_consents` (**R21**), `coach_payment_connections`, `coach_payment_connection_events`, `client_email_ledger`, `platform_flags` (**R14**, service-role-only); y `has_column_privilege('authenticated','coach_payment_connections','access_token_enc','SELECT') = false` | cualquier `true` ⇒ `RAISE EXCEPTION` (patrón de `20260617033845_coaches_restrict_anon_select_to_branding.sql:40-46`) |
| `supabase/tests/cobros_rpc_grants.sql` (**R13**) | las cuatro RPC `security definer` del schema `private` (`cobros_confirm_charge`, `cobros_apply_provider_payment`, `cobros_undo_confirmation`, `cobros_revert_charge`) existen, son `security definer`, tienen `search_path` fijo y **cero grant** a `anon`/`authenticated`: `has_function_privilege('authenticated', '<oid>', 'EXECUTE') = false`; ídem `private.cobros_gate_enabled` y `private.student_billing_allowed` | cualquier `EXECUTE` concedido ⇒ `RAISE EXCEPTION` |
| `supabase/tests/cobros_rpc_atomicidad.sql` (**R13**) | dentro de `BEGIN … ROLLBACK`: `cobros_confirm_charge` sobre una cuota sembrada deja cuota + `client_payments` + `paid_through` coherentes en **una** transacción; forzar un error a mitad (monto inválido) **no** deja la cuota `paid` con `paid_through` sin mover; `cobros_undo_confirmation` retrocede `paid_through` al valor previo y reabre la cuota; **prepago (R16)**: `periods_covered = 3` cierra 3 cuotas con el mismo `payment_id` y `paid_through` = `period_end` de la última | 0 estados intermedios visibles y 0 divergencias entre las tres tablas |
| `supabase/tests/cobros_isolation.sql` | dos coaches y dos alumnos sintéticos: el alumno A no ve el plan ni la cuota de B; el coach A no ve nada del coach B; el alumno **no puede** `UPDATE` su propio plan (42501); el alumno no lee `payload` ni `provider_event_id` de `student_payment_events` (r7 §4.6); el alumno **no lee** `student_billing_consents` (ni el suyo: el export es del coach dueño, por server action) | 0 filas cruzadas y 0 escrituras aceptadas |
| `supabase/tests/cobros_revoke_anon_client_payments.sql` | censo previo: ningún camino usa `anon` sobre `client_payments` antes del `REVOKE ALL … FROM anon` (hoy `GRANT ALL` heredado, `00000000000001_baseline.sql:3592-3594`, confirmado en LIVE por r7 §1.3). RN lee/borra con rol `authenticated` (`apps/mobile/lib/coach-client-detail.ts:802-803`, `:1372`), así que el REVOKE de `anon` debería ser inocuo — **verificarlo, no suponerlo** | el censo devuelve 0 lectores `anon`; tras el REVOKE, `has_table_privilege('anon',…) = false` |
| `supabase/tests/cobros_gate_equivalence.sql` | equivalencia del gate: para **cada** alumno y cada estado, `private.student_write_allowed` **antes** y **después** de sumarle `and private.student_billing_allowed(...)` da el mismo veredicto **salvo** los alumnos con plan vencido más allá de la gracia | 0 diferencias inesperadas + ≥ 150 positivos (mismo criterio que `student_gate_equivalence.sql:9-12`) |
| `supabase/tests/cobros_*_rollback.sql` | un rollback por migración, escrito **al mismo tiempo** que la migración (convención viva) | re-aplica la versión anterior sin pérdida |

### `EXPLAIN (ANALYZE)` del gate — exigido por la migración vigente

`supabase/migrations/20260728125000_student_write_gate_fail_closed.sql:67-68` lo pide literal: *«RENDIMIENTO:
el `left join` cambia el plan y la funcion se evalua por fila en policies RESTRICTIVAS de escritura. Medir con
EXPLAIN (ANALYZE) sobre un insert masivo.»* Está declarado como **no corrido** (z-completitud G16).

**Procedimiento** (dentro de `BEGIN … ROLLBACK`, en LIVE, sin Branching — regla del owner
`feedback_no_supabase_branches`):

1. Medir `Planning Time` / `Execution Time` de un `INSERT` masivo sintético (≥ 1.000 filas) sobre las 4 tablas
   con policies RESTRICTIVE: `workout_logs`, `check_ins`, `daily_nutrition_logs`, `nutrition_meal_logs`.
2. Repetir con `private.student_write_allowed` reescrita para incluir `and private.student_billing_allowed(...)`.
3. Repetir sobre las 3 RPC `security definer` que invocan el gate.
4. Reportar el **delta por fila** en el comentario de la migración.

**Umbral A-4 — ACEPTADO por el jefe (DECISIONS-2 §DATA-SECURITY):** si el delta por fila supera **+15 %** de
`Execution Time` en cualquiera de las 4 tablas, el corte **no** baja a la DB en este tren: se queda app-only
(**proxy + API**, reversible), que es la recomendación de r7 §9.2, la migración **M16**
(`student_write_allowed_billing_term`, la que cuelga el término del gate de escritura) **se difiere a una ola
posterior con medición** y eso se documenta en el RUNBOOK. El número decide, no la opinión.

> **Numeración de migraciones (R17).** La lista es **única y vive en `DATA-SECURITY §1`**: **16 migraciones**
> M1..M16, con M12 `platform_flags` + `cobros_gate_enabled`, M13 `student_billing_consents`, M14 las cuatro
> RPC `private.cobros_*`, M15 `private.student_billing_allowed` y M16 el `create or replace` de
> `private.student_write_allowed`. Este documento cita **solo** por `M-n` y no repite timestamps; cualquier
> otra numeración (PLAN, TASKS) se corrige contra esa lista. El `EXPLAIN` de esta sección mide **M15 + M16** y
> el diferimiento del umbral A-4 recae sobre **M16**.

**Nota (R14):** el `EXPLAIN` se corre sobre la versión final de `private.student_billing_allowed`, que ya
incluye la rama de **módulo apagado** y la llamada a `private.cobros_gate_enabled()` (lectura de
`public.platform_flags`). Medir la versión sin esa rama subestima el costo: es una lectura extra por
evaluación, y el criterio de paso es el de la función completa.

---

## A.8 Guards nuevos de CI

Todos son tests de barrido de árbol (leen archivos y fallan en CI), el mismo molde que los tres que ya existen.

| # | Guard | Archivo | Qué prohíbe | Qué sigue permitiendo |
|---|---|---|---|---|
| **G1** | **Excepción angosta al guard de precios** | `tests/mobile-no-prices.test.ts` (ampliar) | los 5 patrones actuales siguen intactos: `monthlyPriceClp`, `yearlyPriceClp`, `$29.990`, `29990`, `/mes` (`:37-45`) | montos **que vienen de datos** (`charge.amount_clp`, `plan.amount_clp`) formateados con `Intl.NumberFormat('es-CL')`. **La excepción es de nombres, no de números**: se agrega una regla que exige que todo formateo de plata en `apps/mobile/**` pase por un helper único (p. ej. `lib/format-clp.ts`), y se prohíbe cualquier literal numérico de 4-6 dígitos junto a `$` en JSX. Sin esto, alguien va a «arreglar» el guard aflojándolo entero |
| **G2** | **Hint de cobros sin dominio (R6)** | `tests/mobile/store-copy.test.ts` (ampliar) | (a) que los literales del hint de cobros se escriban fuera de `apps/mobile/lib/web-only-hint.ts`; (b) que esos literales contengan **`eva-app.cl`, `http`, `www.` o `.cl`** — aserción de **ausencia**, se rompe si alguien «mejora» el copy agregando la dirección; (c) que aparezca un `eva-app.cl` **nuevo** en `apps/mobile/**` fuera de `client-cap.ts` | los dos copys (hub/pantalla y ficha) pinneados literal en `web-only-hint.ts` e importados; `STORE_PLAN_CHANGE_CAPTION` y `storePlanChangeCaption(platform)` siguen en `client-cap.ts` **sin tocar**, con su allowlist y su pin actuales (`:25`, `:78-84`, `:114`). **No** se crea `STORE_COBROS_SETUP_CAPTION` |
| **G3** | **`WebOnlyHint` no es tocable** | `tests/mobile/web-only-hint.test.ts` (nuevo) | que `apps/mobile/components/WebOnlyHint.tsx` contenga `Pressable`, `TouchableOpacity`, `onPress`, `Linking` o `WebBrowser`; y pin de `accessibilityRole="text"` | el componente como `View` informativo, ícono `Monitor`/`Globe` |
| **G4** | **`checkout_url` / `init_point` fuera de RN** | `tests/mobile/no-checkout-urls.test.ts` (nuevo) + assert en `apps/web/src/app/api/mobile/config/route.test.ts` | los identificadores `checkout_url`, `init_point`, `preference_id`, `mpago.la` en `apps/mobile/**`; y que el JSON de las rutas `api/mobile/**` los incluya | `studentBilling: { state, paidThrough, dueUntil, canClaim }` — estado, nada más (T-20) |
| **G5** | **`wa.me` sin monto** | `tests/mobile/wa-me-no-amount.test.ts` (nuevo) | cualquier construcción de URL `wa.me` en `apps/mobile/**` cuyo `?text=` contenga `$`, un número de 4+ dígitos, «pagar», «pago», «transferencia» o «mensualidad` | `wa.me/<num>` pelado y textos neutros («Hola, quiero reactivar mi acceso») |
| **G6** | **Token del coach no se mezcla** | `apps/web/src/lib/cobros/no-global-token.test.ts` (nuevo) | que `getMpAccessToken` o `MERCADOPAGO_ACCESS_TOKEN` aparezcan en `apps/web/src/lib/cobros/**` o `apps/web/src/services/cobros/**` | el token siempre por `connection` (T-11, T-22) |

**Gates por wave** (formato del repo, `embudo-free-pro/PLAN.md:45-49`):
`pnpm lint` · `pnpm typecheck` · `pnpm test` (dirigido por wave; completo una vez pre-push) · `pnpm build` ·
`pnpm docs:check` · `pnpm check:tokens`. RN además: `pnpm --filter @eva/mobile exec tsc --noEmit` y
`expo export --platform android`. Lint y vitest **no** cubren `apps/mobile` (por eso los guards son tests de
barrido desde `tests/`, que sí corren). SQL: los 5 archivos de A.7 antes y después de cada migración.

---

## A.9 Criterios de salida de la beta cerrada

La beta es de **2-3 coaches Pro reales con plata real durante 2-3 semanas** (DECISIONS D-D). Universo total
disponible hoy: **7 coaches Pro / 55 alumnos** (STATS). Se abre a todos los Pro (`COBROS_GA=true`) **solo si
las 15 condiciones se cumplen**; cualquiera fallida = se extiende la beta, no se abre.

| # | Criterio de salida | Umbral | Cómo se mide |
|---|---|---|---|
| S1 | **Cero cortes injustos** | 0 casos de un alumno cortado con la cuota pagada | `cobros_access_cut` cruzado con `client_payments`; y cero reclamos del coach |
| S2 | **Cero cobros duplicados** | 0 | unique `client_payments.charge_id` + `provider_payment_id`; revisión manual de las filas de la beta |
| S3 | **Reactivación efectiva** | mediana `hours_cut` ≤ 1 h tras confirmar el pago | evento `cobros_access_restored{hours_cut}` |
| S4 | **Webhook sano** | ≥ 99 % de entregas con 200 y sin reintento; 0 firmas rechazadas de eventos legítimos | `notifications_history` de MP + logs de Vercel |
| S13 | **Firma en modo barrera** | `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true` en prod, encendido con la firma real capturada en C7, y **≥ 7 días** sin un solo `cobros.webhook.signature_mismatch` de un evento legítimo. Si X1 no calzó, el GA no se abre sin una decisión escrita del owner sobre la validación alternativa | env de Vercel + Sentry + registro de X1 en la spec |
| S5 | **North-star del módulo** | **% de cuotas cobradas ≤ T+3 ≥ 70 %** en la beta (línea base actual: no existe registro — 11 pagos en toda la historia, 1 coach) | evento `cobros_payment_confirmed` vs `due_on` |
| S6 | **Al menos un ciclo completo por modo** | 1 × `manual`, 1 × `mp_link`, 1 × `mp_subscription`, cada uno con cobro **y** renovación | revisión de `student_billing_charges` |
| S7 | **Correos** | 0 duplicados (ledger), 0 correos a alumnos `is_demo`/archivados, tasa de rebote < 2 % | `client_email_ledger` + panel de Resend |
| S8 | **Los 12 experimentos MP cerrados** con evidencia | X1..X12 registrados | `docs/specs/cobros-coach-alumno/` |
| S9 | **Legal** | anexo T&C publicado y aceptado por los coaches de la beta; correo de confirmación (art. 12 A) enviándose; comprobante que dice «no es boleta» | revisión manual + `terms_accepted_at` en `coach_billing_settings` |
| S10 | **Compliance de tiendas** | P1-P8 de A.6 en verde en device iOS **y** Android; los 6 guards de CI en verde | checklist firmado + CI |
| S11 | **Feedback cualitativo del coach** | los 2-3 coaches responden que **dejaron de perseguir**; ninguno pide volver atrás | conversación del owner (no encuesta por WhatsApp: memoria `feedback_no_contactar_coaches_whatsapp_invasivo`) |
| S12 | **Kill-switch probado en vivo** | activarlo y desactivarlo una vez durante la beta, sin incidentes | log + captura |
| S14 | **Paquete de evidencia real** | exportarlo de verdad para **una cuota de cada modo** y verificar que trae los campos de §B.8 desde `student_billing_consents` (`kind`, `terms_version`, `consented_at`, `ip_hash`, `user_agent`, `consent_snapshot_id`, `payer_age_confirmed_at`, `confirmation_email_message_id`) | export descargado y revisado por el owner; ningún campo vacío; **ninguna IP en claro** |
| S15 | **Nadie queda cobrando (R5)** | 0 preapprovals vivos de alumnos sin acceso al cerrar la beta: se listan las suscripciones de cada coach de la beta y se cruzan con los planes `canceled`/`paused` y con los alumnos archivados | `GET /authorized_payments/search` + `GET /preapproval/search` por coach vs. tabla de planes |

**Criterio de aborto (cualquiera ⇒ kill-switch y vuelta a la mesa):** un alumno cortado por bug · un cobro que
no era del alumno · un token OAuth en un log · un rechazo de tienda relacionado con el módulo · pérdida de
plata de un coach por un error de EVA.

---

# PARTE B — LEGAL Y TRIBUTARIO (CHILE)

## B.1 Obligaciones por actor

### B.1.1 EVA (la plataforma)

| # | Obligación | Fuente | Prioridad |
|---|---|---|---|
| E1 | Exigir y registrar **RUT + inicio de actividades** del coach antes de activar el módulo | Art. **68** Código Tributario, modificado por Ley 21.713; Circular SII N° 39 de 30-04-2025 (vigente **01-10-2025**) | **Bloqueante riel C** |
| E2 | **Verificar el cumplimiento tributario** del coach al alta y **semestralmente**; guardar el resultado | Ley 21.713 + Res. Ex. SII N° 93 de 2025 (vigente **01-01-2026**) | Alta |
| E3 | Poder **informar al SII**, a requerimiento, cantidad de operaciones y montos por contribuyente | Ley 21.713 | Media (basta poder exportar) |
| E4 | **No emitir documentos tributarios** ni nada que parezca boleta | Art. 97 N° 10 CT (no inducir la infracción del coach) | **Bloqueante** |
| E5 | **No tocar la plata**: sin custodia, sin promesa de fecha de liquidación | Ley 21.521 (Fintec) / CMF | **Bloqueante** |
| E6 | **DPA coach↔EVA** por escrito | Ley 21.719, régimen del encargado (plena vigencia **01-12-2026**) | **Bloqueante al 01-12-2026** |
| E7 | Actualizar la **política de privacidad**: datos de pago del **alumno**, finalidad y base de licitud | Ley 21.719 | Alta |
| E8 | Actualizar **T&C** con el módulo y con la **identidad legal real** | pendiente `LEGAL-01`, `docs/legal/tos.md:13-15` | **Bloqueante** |
| E9 | Enviar la **confirmación escrita** del contrato, con copia íntegra | Art. **12 A** Ley 19.496 | **Bloqueante** |
| E10 | Guardar **evidencia de autorización** (timestamp, IP **hasheada**, user agent, versión de T&C, texto exacto mostrado, `message_id` de la confirmación) y poder **exportarla** — **tabla `student_billing_consents` (R21) + export en W5 + export CSV desde admin, retención 24 meses**; ver §B.8 | Ley 20.009 / 21.234 (carga de la prueba invertida) + política de contracargos de MP | **Alta — mayor ROI del documento; si no se construye, hay que borrar la promesa del correo C4** |
| E11 | Que **cancelar sea tan fácil como suscribirse**, y posible **aun con deuda** | Ley 21.398 (simetría de término) | **Bloqueante** |
| E12 | Cifrar tokens OAuth en reposo y **nunca loguearlos** | Ley 21.719 (seguridad) + T&C de MP | **Bloqueante** |
| E13 | Reglas de tiendas: iOS **cero** superficie de cobro para el alumno; Android una línea plana | `apps/mobile/AGENTS.md` §«Pagos y tiendas» | **Bloqueante** |

### B.1.2 Coach (el proveedor real)

| # | Obligación | Fuente |
|---|---|---|
| C1 | Tener **inicio de actividades** vigente y estar al día | Art. 68 CT |
| C2 | **Emitir boleta por cada pago recibido** — BHE si es persona natural (exenta de IVA por art. 12 letra E N° 8 LIVS, ingresos del art. 42 LIR); boleta electrónica **afecta 19 %** si opera con SpA/EIRL (primera categoría) | Ley 21.420 art. 6 + art. 12 E N° 8 LIVS |
| C3 | Declarar y pagar **PPM** (el alumno persona natural **no retiene**; tasa 2026 = **15,25 %**, rampa Ley 21.133 hasta 17 % en 2028) o **IVA** según régimen; cotizaciones si es honorarios | Art. 84 b) LIR; art. 74 N° 2 LIR *a contrario* |
| C4 | Fijar y mostrar un **precio total en CLP**, sin sorpresas | Arts. 30 y 35 Ley 19.496 |
| C5 | Responder **reclamos, reembolsos y contracargos** | Decisión del owner #4 + política MP |
| C6 | Cumplir la LPC frente a su alumno **si** es «proveedor» (excepción del art. 1 N° 2 inc. final para quien posee título profesional y ejerce en forma independiente: defensa **real pero frágil**) | Ley 19.496 |
| C7 | Ser **responsable del tratamiento** de los datos de sus alumnos e instruir a EVA como encargado | Ley 21.719 |
| C8 | No cobrar a menores de 18 sin un adulto pagador | Código Civil (incapacidad relativa) |
| C9 | Mantener su cuenta MP conectada y avisar si la desconecta | contractual (anexo N.6) |

### B.1.3 Alumno

| # | Derecho / carga | Fuente |
|---|---|---|
| A1 | Recibir **antes** de suscribirse: precio total, periodicidad, fecha del primer y del próximo cobro, cómo cancelar, quién responde | Arts. 30/32 + Ley 21.398 |
| A2 | Recibir **confirmación escrita con copia íntegra del contrato** | Art. 12 A Ley 19.496 |
| A3 | **Retracto 10 días**, salvo exclusión informada «de manera inequívoca, destacada y fácilmente accesible»; **sin confirmación escrita el plazo se estira a 90 días**; devolución **sin retención de gastos** en ≤ 45 días | Art. 3 bis letra b) Ley 19.496 |
| A4 | **Cancelar solo**, cuando quiera, sin condicionamientos | Ley 21.398 + decisión del owner #2 |
| A5 | Recibir **su boleta del coach** (no de EVA) | Art. 97 N° 10 CT |
| A6 | **Desconocer cargos** ante su emisor: ≤ 35 UF se abonan en 5 días hábiles y la carga de la prueba es del emisor | Ley 20.009 mod. por Ley 21.234 |
| A7 | Derechos ARCO+P sobre sus datos | `docs/legal/privacy-policy.md:91-109` |

---

## B.2 BORRADOR — Anexo a los T&C de EVA: «Módulo de Cobros»

> **BORRADOR PARA REVISIÓN DE ABOGADO.** No publicar sin corrección profesional. Va como sección nueva en
> `apps/web/src/app/legal/page.tsx` **y** en `docs/legal/tos.md` (hoy divergen: el `.md` dice 17-05-2026 y la
> página `LAST_UPDATED = '12 de junio de 2026'`, `apps/web/src/app/legal/page.tsx:12`; y la cláusula de
> encargado existe en `docs/legal/tos.md:116` pero **no** en la página publicada). Aceptado por el **coach**
> al activar el módulo, con `terms_version` + `terms_accepted_at` en `coach_billing_settings`.

```
N. Módulo de Cobros (cobros del coach a sus alumnos)

N.1 Qué es. EVA pone a disposición del coach herramientas para registrar, recordar y —cuando el coach
conecta su propia cuenta de Mercado Pago— iniciar automáticamente los cobros que el coach le hace a sus
alumnos.

N.2 EVA no es parte del contrato entre el coach y su alumno. El servicio de entrenamiento, nutrición o
asesoría lo presta el coach por su cuenta y riesgo. El precio, la duración, las condiciones y el término
de ese contrato se pactan exclusivamente entre el coach y su alumno.

N.3 EVA no recauda ni custodia dinero. Los pagos de los alumnos se abonan directamente en la cuenta de
Mercado Pago del coach. EVA no recibe, retiene ni administra esos fondos en ningún momento, y no cobra
comisión alguna sobre ellos (0 %). La comisión que cobra Mercado Pago la paga el coach y se descuenta de
los fondos que recibe.

N.4 Responsabilidad del coach. El coach es el único responsable, frente a su alumno y frente a cualquier
autoridad, por: el precio y sus cambios, la prestación efectiva del servicio, la emisión de la boleta o
factura que corresponda conforme a la ley chilena, las devoluciones y reembolsos, los reclamos, los
contracargos y las disputas ante Mercado Pago o ante el emisor de la tarjeta.

N.5 Obligaciones tributarias. El coach declara tener inicio de actividades vigente ante el Servicio de
Impuestos Internos y emitir, por cada pago, el documento tributario que corresponda a su régimen. EVA no
emite documentos tributarios: los comprobantes que genera la plataforma son constancias internas de un
pago registrado y NO reemplazan la boleta ni la factura. EVA podrá solicitar al coach la acreditación de
su inicio de actividades, verificar su situación tributaria de forma periódica, informar al Servicio de
Impuestos Internos cuando la ley lo exija, y suspender el módulo si el coach no acredita cumplimiento.

N.6 Conexión con Mercado Pago. Al conectar su cuenta, el coach autoriza a EVA a crear, consultar, pausar y
cancelar cobros y suscripciones en su nombre, con el único fin de operar este módulo. El coach puede
revocar esa autorización en cualquier momento, desde EVA o desde Mercado Pago. Al revocarla, EVA dejará de
poder gestionar los cobros ya creados y el coach deberá administrarlos directamente en Mercado Pago; los
accesos de sus alumnos no se interrumpen por esa revocación.

N.7 Datos personales. Respecto de los datos de sus alumnos, el coach actúa como responsable del
tratamiento y EVA como encargado, conforme al Anexo de Tratamiento de Datos. EVA tratará esos datos
únicamente siguiendo las instrucciones del coach y para prestar el servicio.

N.8 Suspensión. EVA puede suspender el módulo de cobros de un coach ante indicios fundados de fraude, uso
para fines ilícitos, contracargos reiterados o incumplimiento de esta sección, informándolo por correo.

N.9 Disponibilidad. El módulo se ofrece únicamente en los planes pagos. EVA no garantiza que un cobro
automático se ejecute en una fecha determinada: la ejecución depende de Mercado Pago y del medio de pago
del alumno.

N.10 Menores de edad. El módulo no puede usarse para cobrar a personas menores de 18 años. Si el alumno es
menor de edad, quien contrata y paga debe ser su madre, padre, tutor o representante legal, a nombre de
quien se emiten la suscripción y la confirmación escrita.
```

⚠️ **ABOGADO** — puntos a corregir: (a) redacción del deber de información al SII sin comprometer más de lo
que la ley exige; (b) si la cláusula de suspensión (N.8) resiste el control de cláusulas abusivas de contratos
de adhesión (arts. 16 y 17 Ley 19.496, principio pro consumidor de la Ley 21.398); (c) identidad legal del
prestador — hoy los textos publicados nombran a **una persona natural** (`docs/legal/tos.md:13-15`,
`docs/legal/privacy-policy.md:13-15`), y eso es **prerrequisito de todo lo demás**.

---

## B.3 Aviso previo al alumno + checkbox de mayoría de edad del pagador

**R21 fija dos avisos, no uno:**

| Modo | Cuándo | Versión | Consentimiento que sella |
|---|---|---|---|
| `mp_subscription` | antes del botón «Suscribirme» | **completa** (el bloque de abajo) | `student_billing_consents` con `kind='subscription'` |
| `mp_link` | **antes del primer checkout** (una vez por plan, no en cada ciclo) | **corta** (el bloque «versión corta») | `student_billing_consents` con `kind='first_checkout'` |
| `manual` | — | no hay checkout que interceptar; el contrato viaja en **E0** y **E6** | el claim «ya pagué» queda registrado por su propia vía |

Pantalla anterior al botón de suscribirse (`/c/[slug]/pagos`, OUTLINE §6.4). **Completa, visible, sin scroll
oculto**, con la marca del coach. Cumple arts. 30, 32 y 12 A de la Ley 19.496 y la Ley 21.398. El campo
`{CONCEPTO}` sale de `client_billing_plans.description` (**R21**, obligatoria, ≤ 140 caracteres).

```
[Marca del coach]

Tu plan con {NombreCoach}

  {CONCEPTO}                                (ej.: Asesoría online mensual)

  $ {MONTO} CLP {PERIODICIDAD}              (ej.: $ 35.000 CLP al mes)

  Primer cobro:      hoy, {FECHA}
  Próximo cobro:     {FECHA + PERÍODO}
  Se renueva solo:   sí, cada {PERÍODO}, hasta que lo canceles
  Cancelar:          desde esta misma pantalla, cuando quieras, en un toque

Quién te cobra: {NombreCoach} ({correo del coach}). El servicio lo presta y lo responde tu coach,
y la boleta te la entrega él. EVA es solo la tecnología: no recibe tu dinero ni cobra comisión.

Si dejas de pagar, tu acceso sigue {N} días más y después queda en pausa. Tu progreso no se borra.

[ Ver condiciones completas ]

  [ ] Soy mayor de 18 años y este medio de pago es mío.
  [ ] He leído y acepto las condiciones.

        (  Suscribirme  )
```

**Versión corta (primer checkout de `mp_link`) — R21.** Mismo contenido, sin pantalla intermedia pesada: va
como bloque sobre el botón «Ir a pagar», con la marca del coach.

```
Vas a pagarle a {NombreCoach} — {CONCEPTO}

  $ {MONTO} CLP · período {FECHA_INICIO} a {FECHA_FIN}

Te cobra {NombreCoach} ({correo del coach}), que presta el servicio, responde por él y te entrega la
boleta. EVA es solo la tecnología: no recibe tu dinero ni cobra comisión. Este pago cubre un período;
no se guarda tu tarjeta ni se renueva solo.

Si dejas de pagar, tu acceso sigue {N} días más y después queda en pausa. Tu progreso no se borra.

{BLOQUE DE RETRACTO}                       [ Ver condiciones completas ]

  [ ] Soy mayor de 18 años y este medio de pago es mío.
  [ ] He leído y acepto las condiciones.

        (  Ir a pagar  )
```

### Retracto — texto estándar (DECISIONS-2 §EMAILS)

Se acabó la elección A/B: el jefe fijó **un** texto, que se usa igual en el aviso previo (completo y corto) y
en **E6**.

> ⚠️ **VALIDAR CON ABOGADO** — texto fijado por el jefe, pendiente de revisión profesional. **No bloquea el
> diseño**: la pantalla y el correo se construyen con él y, si el abogado lo corrige, cambia el contenido de
> una versión de `terms_version`, no la estructura.

```
Tienes derecho a retractarte dentro de 10 días desde la contratación si el servicio aún no comenzó.
Al usar tu plan antes de ese plazo, aceptas que el servicio comience de inmediato.
```

**B-1 (actualizada):** el bloque se implementa como **contenido versionado por `terms_version`** —no porque
haya dos variantes que elegir, sino porque la corrección del abogado tiene que poder entrar sin reescribir la
pantalla y sin invalidar la evidencia ya sellada: cada fila de `student_billing_consents` apunta a la versión
exacta que el alumno vio (`consent_snapshot_id`), así que un cambio de texto **no reescribe el pasado**.

### Mayoría de edad — mecanismo mínimo (cierra z-completitud G22)

Lo que hay hoy: el checkbox del alumno dice **«Confirmo que tengo 14 años o más»**
(`apps/web/src/app/c/[coach_slug]/onboarding/OnboardingForm.tsx:386`) y el servidor sella `age_confirmed_at`
(`apps/web/src/app/join/[invite_code]/_actions/join.actions.ts:101`). **No distingue 14 de 18.** Verificado
además: `public.clients` **sí tiene** `birth_date date`
(`supabase/migrations/20260611090004_clients_cardio_profile.sql:12`, con CHECK entre 1920-01-01 y hoy) —
existe el dato para calcular la edad, aunque no medí su cobertura.

Tres ramas, con su costo:

| Rama | Mecanismo | Costo técnico | Riesgo residual |
|---|---|---|---|
| **R-a (recomendada)** | Checkbox bloqueante «Soy mayor de 18 años y este medio de pago es mío» en la pantalla previa (**completa y corta**); se sella `payer_age_confirmed_at` en la fila de **`student_billing_consents`** (R21) — no en M3/M4 | ~0,25 día (la tabla ya se crea para el paquete de evidencia de §B.8) | El alumno miente; pero queda la declaración registrada con fecha, `ip_hash`, user agent y versión del texto (evidencia E10) |
| **R-b** | Además, si `clients.birth_date` implica < 18, **bloquear** el modo `mp_subscription` y exigir modo `manual` con pagador adulto | +0,25 día; requiere cobertura real de `birth_date` | Alumno sin `birth_date` cargado pasa igual |
| **R-c** | Campo «pagador adulto» aparte (nombre + correo) al que van el preapproval y **toda** la comunicación de cobro | +1 día, cambia el modelo de datos y los correos | El más correcto legalmente; desproporcionado para 55 alumnos |

**Decisión del writer (B-2):** ir con **R-a en el primer tren** y dejar R-b escrita como opción del owner.
R-c queda fuera de alcance hasta que exista un caso real. ⚠️ ABOGADO: validar si conviene **prohibir** de plano
al pagador menor de 18, que es lo más simple y probablemente lo correcto.

---

## B.4 Declaración tributaria del coach en el onboarding del módulo

Paso 1 de los 3 del onboarding de `/coach/cobros` (OUTLINE §5.2). Cumple E1/E2.

```
Antes de cobrar por EVA

  RUT: [ __.___.___-_ ]

  [ ] Tengo inicio de actividades vigente ante el Servicio de Impuestos Internos.
  [ ] Emito la boleta o factura que corresponde por cada pago que recibo de mis alumnos.
  [ ] Entiendo que EVA no emite documentos tributarios y que sus comprobantes no son boletas.
  [ ] Acepto el Módulo de Cobros de los Términos y Condiciones y el Anexo de Tratamiento de Datos.

  (  Continuar  )
```

**Qué guarda EVA** (columnas de `coach_billing_settings`, OUTLINE §3.4):

| Campo | Contenido | Nota |
|---|---|---|
| `tax_rut` | RUT del coach, normalizado y con dígito verificador validado del lado servidor | **Dato personal**: sin grant a `anon`/`authenticated`, fuera de logs y de PostHog |
| `tax_declaration_accepted_at` | timestamptz de la declaración | evidencia de E1 |
| `terms_version` + `terms_accepted_at` | versión exacta del anexo aceptado | permite reproducir el texto que el coach vio |

**Verificado en el repo:** **no existe hoy ninguna columna de RUT** — `grep -rn "\brut\b"` sobre
`supabase/migrations/00000000000001_baseline.sql` da 0 hits y no hay `tax_rut`/`coach_rut` en ninguna de las
272 migraciones. Es una columna nueva, y por la regla del proyecto **toda columna user-editable nueva lleva su
column-level grant** (acá: **ninguno** para `authenticated`; escritura solo por service-role).

**Lo que EVA NO hace (a propósito):** no valida el RUT contra el SII (no hay API pública para eso), no emite
BHE por el coach, no calcula ni desglosa IVA, y **nunca** escribe «IVA incluido» en una pantalla del módulo. El
mismo servicio puede ser exento (BHE) o afecto al 19 % (SpA) según el régimen del coach ⇒ **el precio que fija
el coach es bruto y final**. Ojo: `docs/legal/tos.md:88` («Los precios se expresan en pesos chilenos (CLP) e
incluyen IVA cuando corresponda») es correcto para la suscripción EVA↔coach y **no debe copiarse** al anexo.

**Verificación semestral (E2), proporcional al tamaño**: con 7 coaches Pro, un recordatorio al owner cada 6
meses y un `tax_check_at` en la tabla alcanza. No se construye un banco.

---

## B.5 Cláusula DPA coach ↔ EVA (Ley 21.719, vigencia 01-12-2026)

Hoy EVA se declara **encargado** en `docs/legal/tos.md:116` («EVA actúa como encargado de su tratamiento»),
pero esa cláusula **no está en la página publicada**, y el único documento con DPA real es el de enterprise
(`docs/legal/enterprise-contract-template.md`, enlazado desde
`apps/web/src/app/enterprise/_components/sections/EnterpriseFooter.tsx:16`), **con la app enterprise
congelada**. Se puede **clonar y podar** ese texto sin descongelar nada.

```
Anexo de Tratamiento de Datos (Módulo de Cobros)

1. Roles. Respecto de los datos personales de los alumnos que se tratan con motivo de este módulo, el
   coach es el RESPONSABLE del tratamiento y EVA el ENCARGADO.

2. Objeto y finalidad. EVA trata esos datos con la única finalidad de operar el módulo de cobros por
   cuenta del coach: registrar planes y cuotas, enviar recordatorios y confirmaciones, crear y consultar
   cobros en la cuenta de Mercado Pago del coach, y gestionar el acceso del alumno a la aplicación.

3. Datos tratados. Identificación y contacto del alumno; monto, periodicidad y fechas del plan; estado de
   pago y de acceso; identificadores de la operación en Mercado Pago. EVA NO trata ni almacena números de
   tarjeta ni códigos de seguridad: esos datos los tokeniza Mercado Pago.

4. Instrucciones. EVA trata los datos únicamente conforme a las instrucciones del coach, expresadas a
   través del uso de la plataforma y de este anexo. EVA no los usará para fines propios ni los cederá a
   terceros sin autorización, salvo obligación legal.

5. Duración. Mientras el coach mantenga activo el módulo, más los plazos de conservación legal.

6. Confidencialidad y seguridad. EVA aplica medidas técnicas y organizativas: cifrado en tránsito y en
   reposo de las credenciales de cobro, control de acceso por roles, registro de eventos, y minimización
   de los datos que se guardan de cada notificación de pago.

7. Subencargados. EVA utiliza los proveedores declarados en su Política de Privacidad. La incorporación de
   un subencargado nuevo se informa al coach, que puede oponerse terminando el uso del módulo.

8. Asistencia. EVA asiste al coach para responder solicitudes de acceso, rectificación, cancelación,
   oposición y portabilidad de sus alumnos, y le notifica cualquier brecha de seguridad dentro de las
   72 horas siguientes a tomar conocimiento.

9. Devolución y supresión. Terminado el módulo, EVA suprime o devuelve los datos tratados por cuenta del
   coach, salvo los que deba conservar por ley.
```

⚠️ **ABOGADO** — la Ley 21.719 exige **contrato por escrito** que fije objeto, duración, finalidad, tipos de
datos y obligaciones, prohíbe subcontratar sin autorización expresa, y advierte que el encargado que trata
fuera de instrucciones **pasa a ser responsable y responde personal y solidariamente**. Además hay que
actualizar `docs/legal/privacy-policy.md:41` (hoy la fila «Facturación / Email de pago (procesado por
MercadoPago)» apunta solo al **coach**; con este módulo aparece el email de pago del **alumno**).

---

## B.6 Comprobante ≠ boleta

**Regla de UI dura:** las palabras «boleta», «factura» y «documento tributario» **no se usan nunca** para
nombrar esto — ni en la web, ni en RN, ni en el asunto del correo, ni en el nombre del archivo descargado.

Campos del comprobante (E5 del alumno y descarga del coach):

| Campo | Origen | Nota |
|---|---|---|
| N.º interno | `student_billing_charges.id` (o un correlativo por coach) | **no** llamarlo «folio» ni «N.º de boleta» |
| Alumno | `clients.full_name` | |
| Coach | nombre y marca del coach; su correo | el emisor visible del cobro es **el coach**, nunca EVA |
| Monto | `client_payments.amount` en CLP, entero | **monto cobrado al alumno**, no lo liquidado al coach (MP descuenta su comisión) |
| Concepto | `client_billing_plans.description` (**R21**, obligatoria, ≤ 140; se copia a `service_description` al confirmar) | el mismo texto que vio el alumno en el aviso previo y en E5/E6 |
| Período | `period_start` — `period_end` | |
| Fecha de pago | `payment_date` | |
| Medio | `source`: Mercado Pago / transferencia / efectivo | |
| Leyenda obligatoria | ver abajo | destacada, no al pie en gris |

```
Este comprobante lo genera la plataforma como constancia interna del pago.
NO es una boleta ni una factura. El documento tributario lo emite {NombreCoach}
conforme a la ley chilena.
```

**Gap de datos a cubrir en el DDL:** `public.client_payments` hoy tiene solo `id, client_id, coach_id, amount
numeric(10,2), service_description, period_months, payment_date, status, created_at`
(`supabase/migrations/00000000000001_baseline.sql:808-819`) — no distingue cobrado vs liquidado, no guarda el
medio de pago ni la referencia de MP. Las columnas nuevas del OUTLINE §3.5 (`source`, `provider_payment_id`,
`period_start/end`, `receipt_path`, `confirmed_by`, `confirmed_at`) son las que hacen posible este comprobante.

El **paquete de evidencia** de contracargos (§B.8) necesita además la tabla **`student_billing_consents`**
(**R21**), que hoy no existe: sin ella, el comprobante prueba que hubo un pago, pero no que el alumno
**autorizó** el cobro — que es exactamente lo que la disputa discute.

---

## B.7 🧮 Checklist para el contador — **VERIFICACIÓN EXTERNA PENDIENTE**

> **Estado: NO RESUELTO.** Es la pregunta n.º 1 de todo este documento y **nadie de este proyecto puede
> responderla**. Lo que sigue es lo que hay que preguntar y lo que hay que decidir después, no una conclusión.

**El hecho verificado:** la Ley **21.713** (publicada 24-10-2024) define al **operador de plataforma digital
de intermediación** como *«la interfaz que a través de internet permita **o facilite** a terceros la conclusión
de ventas o servicios»* (SII, «Combate a la elusión, evasión e informalidad»). **No exige tocar la plata.** La
Circular SII **N° 39 de 30-04-2025** desarrolla las obligaciones T1-T4 de §B.1.1 (E1-E4), ya vigentes.

**Lo que NO pude resolver:** no existe fuente que aplique ese criterio a un **SaaS vertical B2B2C** de gestión
de coaches. Hay dos lecturas: (a) EVA facilita la conclusión ⇒ T1-T4 aplican; (b) el contrato coach↔alumno se
cierra fuera de EVA y EVA solo instrumenta el cobro de un contrato ya cerrado ⇒ discutible. Los PDF de la
Circular 39 y de la Resolución 93 llegaron **sin capa de texto**: no pude transcribir el porcentaje exacto de
retención de IVA por incumplimiento ni el detalle del procedimiento semestral.

### Qué preguntarle al contador (semana 1 del tren)

1. **¿EVA es «operador de plataforma digital de intermediación» para la Ley 21.713?** Distinguir los tres
   escenarios: (i) solo registra pagos hechos por fuera; (ii) muestra el link de cobro **del coach**;
   (iii) crea el instrumento de cobro con el token OAuth del coach (riel automático). ¿Cambia la respuesta?
2. Si la respuesta es sí: **¿qué implica operativamente T1-T4 para 7 coaches Pro?** ¿Basta pedir RUT +
   declaración, o hay que consultar algún servicio del SII? ¿Con qué periodicidad y con qué registro?
3. **¿Cuál es el porcentaje de retención de IVA** aplicable si se detecta un coach en incumplimiento, y quién
   lo retiene: la plataforma, el medio de pago (MP) o ninguno en este diseño?
4. **¿Hay obligación de informe periódico al SII**, o solo «a requerimiento»? ¿Qué formato?
5. **¿La comisión 0 % cambia el análisis?** Si mañana EVA cobra $1 por transacción, ¿pasa a percibir ingreso
   por intermediación y cambia el encuadre (incluida la posible calificación como recaudador)?
6. **¿EVA incurre en algún riesgo por «facilitar» a un coach que no emite boleta** (art. 97 N° 10 CT), más allá
   de la reputación? ¿Basta la advertencia escrita del anexo N.5?
7. Confirmar que **EVA no tiene hecho gravado nuevo** por este módulo (comisión 0 ⇒ el módulo es prestación
   incluida en la suscripción Pro que ya tributa).

### Qué hay que decidir con su respuesta

- Si es «sí, es operador» ⇒ E1 y E2 pasan de recomendables a **bloqueantes** y el RUT deja de ser opcional.
- Si es «no» ⇒ igual se implementa E1 (cuesta un campo y un checkbox) porque el costo de equivocarse es
  fiscalización y el de cumplir es cero. **Recomendación: cumplir igual.**
- El resultado se registra con fecha en `docs/specs/cobros-coach-alumno/SPEC.md` como decisión externa.

**Antecedente propio:** la memoria `project_iva_estudio_boletas_20260817.md` ya dejó abierto el frente
«EVA NO emite boletas (art. 97 N° 10)» con un pendiente de contador. **Este módulo lo reabre multiplicado por
N coaches.**

---

## B.8 Contracargos y reembolsos: procedimiento y responsable

**Quién pierde la plata: el COACH.** Documentación de MP: cuando el contracargo se resuelve en contra, estado
`settled` = *«Decisión en contra del vendedor. Dinero retirado de la cuenta del vendedor»*; la resolución puede
tardar **hasta 6 meses**; hay que subir documentación por `POST /v1/chargebacks/{id}/documentation` **dentro de
plazo**. Esto encaja con la decisión #4 del owner, pero hay que decírselo por escrito **antes** de que el coach
conecte su cuenta (correo/pantalla C4, texto en §B.2 N.4 y en el aviso de conexión).

### Procedimiento

| # | Paso | Responsable | Plazo |
|---|---|---|---|
| 1 | Llega el evento de contracargo (`topic_claims_integration_wh` o `charged_back` en el pago) | EVA (webhook) | inmediato |
| 2 | EVA notifica al coach: correo + push, con el monto, el alumno, el plazo y el enlace a MP | EVA | mismo día |
| 3 | EVA arma el **paquete de evidencia** en un clic (ver abajo) | EVA | a demanda |
| 4 | El coach sube la documentación en MP y responde | **coach** | dentro del plazo de MP |
| 5 | Si se resuelve **en contra del coach** (`settled`): **R9** — cuota → `charged_back`, `client_payments.status` idem, `paid_through` retrocede al `period_end` de la cuota anterior pagada, el estado se re-deriva (puede quedar `unpaid`), y salen **E11** al alumno y **C7** al coach. Sin que el coach persiga a nadie | EVA | al recibir el evento |
| 6 | Si se resuelve a favor (`reimbursed`): nada cambia | — | — |

### Paquete de evidencia (E10 — la mitigación de mayor ROI) — **hay que construirlo, no solo prometerlo**

Exportable por el coach desde la ficha del alumno: fecha y hora de la aceptación · `ip_hash` y user agent ·
`terms_version` aceptada y **el texto exacto que el alumno vio** · `message_id` del correo de confirmación
(art. 12 A) · historial de uso del alumno en el período cobrado (entrenamientos registrados = servicio
prestado) · `provider_payment_id` y `external_reference`.

**El problema, dicho sin vueltas:** hoy `DATA-SECURITY §12.1` dice «IP / User-Agent: **solo** en
`coach_payment_connection_events`», es decir: la única IP que EVA registra es la del **coach conectando
MercadoPago**, y del acto que hay que probar —el alumno autorizando el cobro— no queda huella técnica. Con la
carga de la prueba invertida de la Ley 20.009 / 21.234, el solo registro de la operación **no basta**: el coach
pierde la disputa y la plata. Y el correo **C4** ya le dice por escrito «EVA te entrega la evidencia» justo
antes de que conecte su cuenta y asuma los contracargos.

**Se construye. Tabla propia `student_billing_consents` (R21)** — no columnas en M3/M4: el consentimiento es un
**acto con fecha**, y una fila por acto (con su `kind`) es lo que permite tener el alta de la suscripción y el
primer checkout del link como eventos distintos, y agregar uno nuevo mañana sin tocar el DDL de las cuotas.

| Columna | Tipo | Qué sella |
|---|---|---|
| `id` | `uuid` | pk |
| `client_id` | `uuid` | el alumno que consintió |
| `plan_id` | `uuid` | el plan al que se refiere el consentimiento |
| `kind` | `text` check in (`'subscription'`, `'first_checkout'`) | qué acto: alta de la suscripción MP, o **primer** checkout de `mp_link` |
| `terms_version` | `text` | versión del aviso previo + del anexo vigentes en ese momento |
| `consented_at` | `timestamptz` | momento exacto del acto |
| `ip_hash` | `text` | **hash** de la IP del alumno (`x-forwarded-for`, primer hop) con sal del servidor — **nunca la IP en claro** |
| `user_agent` | `text` | user agent crudo, truncado a 512 |

**Complementos sobre la misma tabla** (no contradicen R21, la completan; el DDL final vive en la lista única de
`DATA-SECURITY §1`): `consent_snapshot_id` (referencia al **texto congelado** que el alumno vio, para que un
cambio de plantilla no reescriba el pasado), `payer_age_confirmed_at` (el checkbox 18+ de la rama R-a, §B.3) y
`confirmation_email_message_id` (`message_id` de Resend del correo del art. 12 A / **E6** — sin él no se prueba
la confirmación escrita). El resto del paquete se arma leyendo lo que ya existe: `provider_payment_id` y
`external_reference` de la cuota, y el historial de uso del alumno en el período cobrado.

**Sobre el `ip_hash`.** Un hash no sirve para «mostrar de dónde se conectó», sirve para lo que la disputa
necesita: acreditar que **hubo** un acto desde un origen estable y correlacionar dos actos del mismo origen. A
cambio, deja de ser un dato personal en claro guardado 24 meses. Si el abogado exige la IP legible para una
disputa concreta, esa es una decisión del owner que se toma **antes** de construir, no un default.

**Retención: 24 meses, no 180 días.** `student_billing_consents` se **excluye** de la purga de 180 días de
`DATA-SECURITY §12.2` (que aplica al `payload` de `student_payment_events` y a la IP/UA de la bitácora OAuth):
un contracargo puede tardar **hasta 6 meses** en resolverse y la disputa posterior dura más. Con 180 días la
evidencia se autodestruye justo cuando se necesita. La purga a 24 meses vive en el mismo `purge-data` —la tabla
queda **excluida de la purga corta y con su propia regla de 24 meses**— y se **declara en `/privacidad`**
(`docs/legal/privacy-policy.md`), junto con la finalidad («acreditar la autorización de un cobro ante una
disputa») y la base de licitud. Hay que corregir en consecuencia la fila «IP / User-Agent» de
`DATA-SECURITY §12.1` y la §12.2. Estos campos **no** viajan a PostHog, ni a logs, ni a Sentry, y la tabla no
tiene grant para `anon`/`authenticated` (se verifica en `cobros_grants.sql`, §A.7).

**Dos salidas, dos dueños:**

- **Export del coach** (tarea nueva en **W5**; hoy `TASKS.md` y `PLAN.md` no tienen ninguna: 0 hits de
  «evidencia», «contracargo» y «chargeback» fuera de la nota de QA W6.3): *«Exportar paquete de evidencia
  (JSON + PDF) desde la ficha del alumno»*, por **server action del coach dueño**, con criterio de aceptación
  **«contiene todos los campos de §B.8 y falla ruidosamente si falta alguno»**, más un caso vitest que arme el
  paquete de una cuota sembrada.
- **Export CSV desde admin** (DECISIONS-2): el owner puede sacar los consentimientos de un coach o de un rango
  de fechas para responder un requerimiento, sin pedirle nada al coach.

Guard de coherencia: el botón de export **no se muestra** si la cuota no tiene fila de consentimiento (planes
viejos, o `manual`, donde nunca hubo checkout que interceptar), con copy honesto («De este cobro no hay
autorización en línea registrada»), en vez de exportar un paquete vacío que el coach descubre en plena disputa.

**Decisión del writer (B-6).** Se construye en el tren: son ~7 columnas, un `insert` en tres caminos ya
existentes y un export. La alternativa —no construirlo— **obliga** a sacar la frase «EVA te entrega la
evidencia» del correo C4 y de la pantalla de conexión, y a bajar E10 de «mayor ROI» a «no cubierto»; prometerlo
sin tenerlo es peor que no ofrecerlo, porque el coach deja de guardar sus propios respaldos.

### Reembolsos

- Los ejecuta **el coach** en MP (`POST /v1/payments/{id}/refunds`); EVA no puede devolver plata que nunca
  tuvo. Plazo: **180 días** desde la aprobación (MLC). **Requiere saldo disponible en la cuenta del coach**:
  sin saldo, la transacción no se realiza.
- Si el coach reembolsa, EVA ofrece un botón «Marcar cuota como devuelta» que aplica **R9** por la RPC
  `private.cobros_revert_charge` (**R13**): cuota → `refunded`, `paid_through` al `period_end` de la cuota
  anterior pagada, evento en `student_payment_events`, correos **E11** y **C7**. Nunca en silencio.
- **Decisión del writer (B-3):** EVA **no** dispara reembolsos por API en el primer tren, ni siquiera pudiendo
  (tiene el token del coach). Mover plata del coach automáticamente es un riesgo desproporcionado frente al
  valor; el botón abre MP y ya.

### Cobranza extrajudicial

El diseño actual (correos calmos, un solo CTA, sin urgencia falsa) no configura cobranza agresiva. ⚠️ Si algún
día se agregan **recordatorios por WhatsApp automáticos al alumno**, hay que revisar los arts. 37 y ss. de la
Ley 19.496 (horarios, no avergonzar, no contactar a terceros) antes de construirlo.

---

## B.9 Notes for Review (Apple) y notas para Google Play

### B.9.1 Bloque para App Store Connect → App Review Information → Notes

Se **suma** al bloque vigente de `docs/operations/APP_REVIEW_NOTES.md` (sección «Notes for Review (EN) — modelo
de negocio»), **sin tocarlo**: aquel explica que el coach no compra dentro de la app; este explica que el
alumno tampoco. Va como párrafo nuevo, en inglés, con el mismo registro.

**Redacción final fijada por R23 — se envía exactamente esto, sin agregados:**

```text
Coaches on paid plans can track payments their clients make to them. Payments are made outside the app —
by bank transfer or on Mercado Pago, to the coach's own Mercado Pago account — never inside the app;
there is no purchase flow, price, or payment link in the app. EVA does not collect funds or take a
commission. When a client's access is paused, the app shows status only and lets the client contact
their coach.
```

**Qué hace el trabajo en esta redacción.** Las tres afirmaciones que el revisor tiene que poder verificar
abriendo la app: (1) el pago ocurre **fuera** de la app, a la cuenta de Mercado Pago **del coach**; (2) **no
hay** flujo de compra, precio ni link de pago **dentro** de la app; (3) con el acceso en pausa la app muestra
**estado** y un camino para hablar con el coach, nada más. Lo que la nota **no** hace es explicar la
arquitectura interna: quién crea la preferencia, con qué aplicación de Mercado Pago o quién recibe el webhook
es irrelevante para la guideline y solo abre preguntas. La verdad que importa —EVA no recauda ni cobra
comisión— está dicha.

**Tres razones para que esté escrito antes del envío** (research/s3 §11): la guideline **2.3.1** exige
especificidad; si el revisor ve la palabra «payments» en la UI sin contexto, el default es rechazo **3.1.1**; y
la cuenta Apple es de un tercero (memoria `project_cuenta_apple_titularidad_guimel_20260821`) con **4 rechazos
ya ocurridos en 1.1.0** — no hay margen.

**Qué NO poner en las notas de Apple:**

- La línea de Android («Los cambios de plan se hacen en eva-app.cl»). En iOS esa frase no existe ni en la app
  ni en las notas — regla ya escrita en `APP_REVIEW_NOTES.md`.
- **Ninguna cita de la guideline 3.1.3, incluida 3.1.3(f)** — **R23**. El borrador anterior invocaba 3.1.3(f)
  («free stand-alone companion») como postura de defensa; ya no se usa. Citar una excepción es invitar al
  revisor a medirnos contra su lista cerrada de requisitos, y la nota no la necesita: **no hay nada que
  comprar dentro de la app**, que es un argumento más fuerte que cualquier excepción. Tampoco 3.1.3(b) ni
  3.1.3(c). Si el revisor pregunta, se responde su pregunta; no se ofrece la categoría de antemano.

### B.9.2 Google Play

- **Notas de revisión**: el mismo bloque en inglés, más la línea de que en Android existe una única frase de
  texto plano sin link, publicada por Google como forma aceptable para apps *consumption-only*, y que el split
  es por `Platform.OS`, nunca por storefront.
- **Data safety — qué se declara y qué NO**:

| Categoría | ¿Se recolecta? | Detalle |
|---|---|---|
| **Financial info → Payment info** (número de tarjeta, datos bancarios) | **NO** | EVA nunca ve ni almacena PAN, CVV ni cuenta bancaria; MP tokeniza. **No marcar esta categoría.** |
| **Financial info → Purchase history** | **NO** | La app no procesa ninguna compra ni registra un historial de compras del usuario dentro de la app; la transacción del alumno ocurre en la web y en MercadoPago |
| **Financial info → Other financial info** | **SÍ — declararlo** | Es la categoría que Google define como «deudas o ingresos del usuario». La app **muestra** el estado de deuda del alumno (al día / vencido / en pausa) y, del lado del coach, montos cobrados y deuda por alumno. Google pregunta por los datos que la app **recolecta y muestra**, no por quién procesa el cargo: declarar NO acá porque «EVA no procesa» es el error que termina en retiro. Uso: **App functionality**; no compartido con terceros; no usado para publicidad |
| **Personal info → Name, Email** | Sí (ya declarado) | sin cambios por este módulo |
| **App activity** | Sí (ya declarado) | analytics sin montos ni `client_id` (OUTLINE §8) |

**Decisión del writer (B-4):** el estado de morosidad del alumno es **dato reputacionalmente sensible**. Se
declara en Data Safety como *Other financial info* (fila de arriba) porque la app lo muestra, y al mismo tiempo
**no se expone a terceros ni a otros alumnos**: ninguna pantalla compartible (share de entreno, sello «Hecho
con EVA», export público) puede mostrarlo. Declararlo y no exponerlo son cosas distintas y las dos son
obligatorias.

---

## B.10 Riesgos legales R1..R6 y su mitigación **en el producto**

| # | Riesgo | Probabilidad / impacto | Mitigación en el producto (no en un PDF) |
|---|---|---|---|
| **R1** | **EVA calificada como operador de plataforma de intermediación sin cumplir T1-T4** (Ley 21.713 / Circular 39-2025) | Media-alta / fiscalización, retención de IVA a coaches informales, exposición del owner que hoy figura como persona natural | RUT + declaración de inicio de actividades **como requisito para activar el módulo** (§B.4); `tax_check_at` con recordatorio semestral (manual con 7 coaches); export de operaciones y montos por coach (`client_payments` ya casi lo permite); **consulta al contador en la semana 1** (§B.7) |
| **R2** | **Coaches que no emiten boleta, usando EVA como cañería** (art. 97 N° 10 CT: multa 50 %-500 % de la operación, mín. 2 UTM, máx. 40 UTA, clausura hasta 20 días) | **Alta** / el infractor es el coach, pero EVA aparece como el instrumento | Comprobante que **dice que no es boleta** (§B.6) · el alumno lee en el aviso previo y en E5 que la boleta se la da su coach · recordatorio «acuérdate de emitir tu boleta» en cada pago confirmado (correo C3) · **no** ofrecer emisión automática de BHE (tentador, mete a EVA en representación tributaria) · declaración del §B.4 |
| **R3** | **Reclamo SERNAC** por baja difícil, cobro sorpresa o corte de acceso | Media / un caso mediático basta; con white-label la marca visible es la del coach, pero la prensa llega a EVA | Cancelar en **≤ los mismos pasos** que suscribirse, disponible **con deuda** (E11, probado en `cobros-cancelacion.spec.ts`) · precio total + próximo cobro en la pantalla previa · **confirmación escrita** (sin ella el retracto se estira a 90 días) · recordatorio pre-cobro E1 aunque hoy no sea obligatorio · gracia y copy calmo · y el guard mental que ya existe en billing: *«sería re-facturación silenciosa = incidente SERNAC»* (`apps/web/src/services/billing/change-card.service.ts:243`) ⇒ **jamás** mover monto o ciclo sin acto explícito del alumno |
| **R4** | **Contracargo contra un coach** (Ley 20.009/21.234: carga de la prueba invertida, abono en 5 días hábiles ≤ 35 UF) | Media / hasta 6 meses de plata retenida; el coach culpa a EVA | **Paquete de evidencia exportable** (§B.8) · aviso al coach el mismo día · reversa automática del acceso si `settled` · recordatorio pre-cobro · descripción reconocible en el estado de cuenta del alumno (nombre del **coach**, no «EVA») · advertencia escrita antes de conectar MP |
| **R5** | **Ley 21.719 sin contrato de encargo** ⇒ EVA pasa a responsable y responde **solidariamente**; APDP con potestad sancionatoria y registro público | Alta si no se hace nada antes del **01-12-2026** (faltan ~3 meses) | DPA aceptado en el flujo con versión + timestamp (§B.5) · actualizar `privacy-policy.md:41` y la finalidad · **cerrar LEGAL-01** (identidad legal) · cerrar la divergencia entre `docs/legal/tos.md` y `apps/web/src/app/legal/page.tsx:12` |
| **R6** | **Cobrarle a un menor de 18** (contrato anulable + régimen reforzado de NNA de la 21.719) | Media-baja pero real: el piso de EVA es 14 | Checkbox bloqueante de mayoría de edad del **pagador** (§B.3, rama R-a) · cláusula N.10 del anexo · **no** mandarle correos de cobranza al menor · copy de bloqueo calmo, reusando el registro que ya existe (`apps/web/src/lib/student-access.ts:42-53`) |
| **R7** *(bonus, y el más caro)* | **Violar las reglas de tiendas** mostrándole al alumno moroso dónde pagar | **Alta si no se blinda** (es el reflejo natural del diseñador poner un «Pagar» en la pantalla de bloqueo) / rechazo de Apple sobre una cuenta de desarrollador **que no es de EVA** | Los 6 guards de CI de §A.8 · el checklist P1-P8 de device (§A.6) · el copy de la §B.2 del s6 · split por `Platform.OS` · y la regla: **nada que venda vive dentro de la app** |
| **R8** *(bonus)* | **El 0 % que algún día deja de ser 0** | Baja hoy / cambia el encuadre tributario **y** el de consumidor | Dejarlo escrito como **decisión consciente** (§B.7 pregunta 5), no como default de configuración |

---

## B.11 Tareas legales del tren — W0 (borrador) · publicación **antes de W6** · W7 revalida

**R21 + DECISIONS-2 §TESTING-LEGAL**: lo legal deja de ser «un pendiente de abogado» y entra como tareas con
ola asignada. Escribir temprano da tiempo de revisión externa; publicar antes de que corra la primera plata
real es lo que hace que el consentimiento exista cuando se lo necesita.

> **Regla única (cierra la contradicción entre PLAN §W0/§W2/§W7, SPEC §13.9, TASKS y esta sección).**
> **Borrador en W0 · publicado y aceptado ANTES de W6 · W7 solo revalida.** Ninguna de estas tareas bloquea
> **código** de W1-W5: el código de las waves 1-5 no toca `apps/web/src/app/legal/page.tsx` ni
> `docs/legal/**` (por eso PLAN §W2 prohíbe tocarlos: la publicación **no** ocurre en W2). Lo que sí
> bloquean es **W6**, porque W6 es la beta con plata real y el coach no puede crear un plan de cobro sin
> haber aceptado el anexo con su `terms_version` sellada en `coach_billing_settings.terms_accepted_at`.
> **El anexo se publica una sola vez** — no en W2 y otra vez en W7. En **W7** solo se revalida que lo
> publicado sigue vigente (versión, fechas, entidad) y se cierra lo que es propio de tiendas (LEGAL-07).
> Consecuencia: los ítems de la lista «Bloqueantes antes de abrir el riel automático a plata real» de más
> abajo son exactamente la puerta de entrada a **W6**, no al GA.

| # | Tarea | Ola | Artefacto | Criterio de cierre |
|---|---|---|---|---|
| **LEGAL-01** | Identidad legal del prestador (razón social, RUT, representante) | **W0** decidir · **publicar antes de W6** · W7 revalida | `docs/legal/tos.md:13-15`, `docs/legal/privacy-policy.md:13-15`, `apps/web/src/app/legal/page.tsx` | los tres textos nombran a la **misma** entidad; se cierra la divergencia de fechas (`.md` 17-05-2026 vs `LAST_UPDATED = '12 de junio de 2026'`, `legal/page.tsx:12`) |
| **LEGAL-02** | Anexo «Módulo de Cobros» (§B.2) | **W0** borrador → abogado · **publicar y hacer aceptar antes de W6** (una sola publicación) · W7 revalida | `apps/web/src/app/legal/page.tsx` **y** `docs/legal/tos.md` (los dos, no uno) | publicado con `terms_version` nueva; el onboarding del coach lo referencia y sella `terms_accepted_at` |
| **LEGAL-03** | Anexo DPA coach↔EVA (§B.5) | **W0** borrador (clonar y podar `docs/legal/enterprise-contract-template.md`) · **publicar y hacer aceptar antes de W6** · W7 revalida | documento propio + link desde el onboarding | aceptado por los coaches de la beta con versión + timestamp; **vigencia Ley 21.719 el 01-12-2026** |
| **LEGAL-04** | Política de privacidad: datos de pago del **alumno**, finalidad, base de licitud y **retención 24 meses** de `student_billing_consents` | **W0** redactar · **publicar antes de W6** · W7 revalida | `docs/legal/privacy-policy.md` (hoy la fila «Facturación / Email de pago» apunta solo al coach, `:41`) | la retención de 24 meses está **declarada**, no solo implementada |
| **LEGAL-05** | Textos del aviso previo (completo y corto) y del **retracto** (texto estándar de DECISIONS-2) | **W0** borrador → ⚠️ abogado · **versión final publicada antes de W6** · W7 revalida | constantes versionadas por `terms_version` | el abogado revisó el texto de retracto; si lo corrige, entra como versión nueva sin invalidar consentimientos ya sellados |
| **LEGAL-06** | Consulta al **contador** (§B.7, las 7 preguntas) | **W0** (semana 1) | registro con fecha en `docs/specs/cobros-coach-alumno/SPEC.md` | respuesta escrita; si es «sí, es operador», E1/E2 pasan a bloqueantes y el RUT deja de ser opcional |
| **LEGAL-07** | Notes for Review (**R23**) y Data Safety de Play (§B.9) | **W7** | `docs/operations/APP_REVIEW_NOTES.md` + ASC + Play Console | el bloque de R23 va **tal cual**, sin citar 3.1.3 |

---

## Bloqueantes antes de abrir el riel automático a plata real (puerta de entrada a **W6**)

- [ ] Cerrar **LEGAL-01** (razón social, RUT, representante legal) — `docs/legal/tos.md:13-15`
- [ ] Anexo «Módulo de Cobros» publicado y aceptado por el coach con versión + timestamp (§B.2)
- [ ] **DPA coach↔EVA** por escrito (§B.5)
- [ ] Campo **RUT + inicio de actividades**, exigido para activar el módulo (§B.4)
- [ ] **Correo de confirmación art. 12 A** con copia íntegra del contrato, **fuera** del kill-switch de ventas
      (`EVA_SALES_EMAILS_DISABLED` **no** puede apagarlo; `EVA_COBROS_EMAILS_DISABLED` tampoco debería alcanzar
      a E6 — **Decisión del writer (B-5)**: E6 y E7 son transaccional-legales y solo se apagan con el
      kill-switch global del módulo, que también deja de cobrar)
- [ ] Pantalla previa **completa** (`mp_subscription`) y **corta** en el **primer checkout de `mp_link`**
      (§B.3, R21), con el texto estándar de retracto **validado por abogado**
- [ ] **Cancelar en ≤ los mismos pasos que suscribirse**, disponible aun con deuda
- [ ] Comprobante que **dice que no es boleta** y cero uso de «boleta/factura» en la UI
- [ ] **Paquete de evidencia** exportable por el coach: tabla **`student_billing_consents`** (R21:
      `client_id`, `plan_id`, `kind`, `terms_version`, `consented_at`, `ip_hash`, `user_agent`, más
      `consent_snapshot_id`, `payer_age_confirmed_at`, `confirmation_email_message_id`), **export CSV desde
      admin**, retención **24 meses** declarada en `/privacidad` y excluida de la purga corta de `purge-data`,
      y la tarea de export en W5 (§B.8). **Sin esto no se manda el correo C4 con la frase «EVA te entrega la
      evidencia»**
- [ ] **Ninguna suscripción queda viva sin acceso (R5)**: los cuatro disparadores de cancelación probados
      (plan cancelado · alumno archivado o eliminado · desconexión de MP **desde EVA** · coach que baja a
      Free), con reintentos y alerta si el `PUT status=cancelled` falla
- [ ] Guards de tiendas extendidos (§A.8) e iOS con cero camino a pagar (§A.6)
- [ ] Tokens OAuth cifrados, fuera de logs y del cliente
- [ ] Riel desplegado con **`COBROS_WEBHOOK_REQUIRE_SIGNATURE=false`** y allowlist beta de **1** coach: la
      validación **sí** se escribe en W5 (calcula, compara y loguea); lo que no se hace es *enforcearla* antes
      de haber visto una firma real (§A.0)
- [ ] **X1 cerrado con una firma real capturada en C7** — y recién ahí `REQUIRE_SIGNATURE=true`, como criterio de salida
      de la beta (§A.9 S13), no como precondición de W5

---

## Anexo — resumen de las decisiones (estado tras R1–R23 y DECISIONS-2)

| # | Decisión | Estado | Dónde |
|---|---|---|---|
| A-1 | El motor puro vive en `packages/cobros` y sus tests corren en el runner de la raíz | vigente | §A.1 |
| A-2 | Project Playwright nuevo `cobros` contra **preview**, `workers: 1`, dos cuentas `@evatest.cl` nuevas en la allowlist | vigente | §A.5 |
| A-3 | ~~Segunda constante `STORE_COBROS_SETUP_CAPTION` en `client-cap.ts`~~ → **REEMPLAZADA POR R6**: un copy único **sin dominio**, iOS = Android, literal en `apps/mobile/lib/web-only-hint.ts`; el test pinnea la **ausencia** de «eva-app.cl» y «http» | reemplazada | §A.6, §A.8 G2 |
| A-4 | Umbral de `EXPLAIN`: **+15 %** de `Execution Time` por fila ⇒ el corte se queda app-only (proxy + API) y **M16 se difiere** (numeración única de `DATA-SECURITY §1`, 16 migraciones — R17) con medición, documentado en el RUNBOOK | **aceptada** por el jefe (DECISIONS-2) | §A.7 |
| A-5 | La firma del webhook arranca en **modo observación** (`COBROS_WEBHOOK_REQUIRE_SIGNATURE=false`); `REQUIRE_SIGNATURE=true` recién con la firma real capturada en **C7** | **ratificada por R22** (X1 se resuelve en nivel C) | §A.0, §A.4 X1, §A.9 S13 |
| B-1 | ~~Elegir entre retracto (A) respetarlo y (B) excluirlo~~ → **texto estándar único** de DECISIONS-2, marcado **VALIDAR CON ABOGADO**; sigue versionado por `terms_version` para que la corrección del abogado no invalide la evidencia sellada | reemplazada | §B.3 |
| B-2 | Mayoría de edad: rama **R-a** (checkbox bloqueante + sello) en el primer tren; R-b como opción del owner. El sello va en `student_billing_consents`, no en M3/M4 | vigente, reubicada | §B.3 |
| B-3 | EVA **no** dispara reembolsos por API en el primer tren, aunque tenga el token del coach | vigente | §B.8 |
| B-4 | El estado de morosidad se **declara** en Data Safety como *Other financial info* y **no** aparece en ninguna superficie compartible | vigente | §B.9.2 |
| B-5 | E6/E7 (confirmación y cancelación) solo se apagan con el kill-switch global del módulo | vigente (DECISIONS-2: E5/E6/E7 ignoran `EVA_COBROS_EMAILS_DISABLED`) | Bloqueantes |
| B-6 | El **paquete de evidencia se construye en el tren** — ahora sobre la tabla **`student_billing_consents`** (R21) con `ip_hash`, **export CSV desde admin**, retención **24 meses** declarada en `/privacidad` y export del coach en W5 | vigente, reencuadrada por R21 | §B.8 |
| B-7 | **Notes for Review = redacción final de R23**, sin citar 3.1.3 (ni siquiera 3.1.3(f)) | nueva, por R23 | §B.9.1 |
| B-8 | Las tareas legales tienen ola: **borrador en W0, publicación y aceptación antes de W6, W7 revalida** (LEGAL-01..06; LEGAL-07, que es de tiendas, sí es W7). No bloquean código de W1-W5; bloquean **W6** porque ahí corre plata real | actualizada (cierra C-09) | §B.11 |
