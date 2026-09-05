---
status: draft
owner: product-engineering
last_verified: "2026-08-28"
canonical: false
---

# SPEC — Cobros coach → alumno: un motor, tres modos (transferencia · link MP · suscripción MP)

Slug: `cobros-coach-alumno`. Nombre de producto: **«Cobros»**. Documentos hermanos, **los seis en la
misma carpeta y creados en el mismo commit** (`docs/specs/cobros-coach-alumno/`):
[PLAN](PLAN.md) · [TASKS](TASKS.md) · [EMAILS](EMAILS.md) · [DATA-SECURITY](DATA-SECURITY.md) ·
[TESTING](TESTING-LEGAL.md).

> **Regla de enlaces (para no romper `pnpm docs:check`).** `scripts/check-docs.mjs:247-258` corre
> `validateLinks` sobre todo el Markdown activo del repo y `validateLinks:155-174` falla con «enlace
> relativo roto» si el destino no existe. Por eso los seis archivos se commitean juntos (tarea W0.8)
> y ningún documento de este SDD enlaza uno que no vaya en el mismo commit. Los ejemplos de líneas
> para `CURRENT.md`/`MOBILE_PARITY.md` se escriben dentro de un bloque cercado o con la ruta desde la
> raíz (`/docs/specs/…`), que `isExternalOrRoute:145` deja pasar: los backticks **inline** no salvan
> un link roto (`stripFencedCode:117-129` solo neutraliza fences).

> Convención de este documento: toda afirmación sobre el código lleva `ruta/archivo.ext:línea`
> verificada en la rama `rnmobiledenuevo` el 2026-08-28. Los nombres canónicos (tablas, rutas, envs,
> eventos) están cerrados en el §19 y **no se inventan variantes**.

---

## 1. Origen

- **Pedido del owner (28-08-2026).** «Que el coach le cobre a su alumno a través de EVA». Hoy el coach
  cobra por fuera (transferencia o WhatsApp) y, si se acuerda, anota el pago a mano en EVA. El owner
  pidió explícitamente: motor de vencimientos con **corte automático del acceso del alumno**,
  recordatorios por correo, panel «por cobrar», historial por alumno, y encima un riel **automático**
  con MercadoPago donde la plata va directo al coach y **EVA no cobra comisión**.
- **Artifacts previos que originan el diseño** (HTML, en `scratchpad/plan-cobros/context/`):
  `artifact-rieles-del-cobro.html` (los 4 rieles A/B/C/D, competencia y riesgo Apple),
  `artifact-pantallas-del-cobro.html` (mockups B1–B7 y C1–C8; veredicto «B es el motor que C
  necesita»), `artifact-boton-de-cobro-del-coach.html` (la idea original: el coach pega su link de MP
  y el alumno tiene un botón), `artifact-la-escalera-del-cobro.html` (plan anterior por peldaños).
- **Antecedente documental en el repo.** `docs/specs/embudo-free-pro/SPEC.md:24` ya lo declaró fuera
  de ese tren: «`starter` no se toca. El cobro coach→alumno es otro plan».
  (Esa premisa cambió: ver [retiro-starter-y-enterprise](../retiro-starter-y-enterprise/SPEC.md), 2026-09-05.)
  No existe ninguna spec activa ni archivada del tema; `docs/specs/cobros-coach-alumno/` es carpeta nueva.
- **Lo único reusable como referencia de arquitectura** es el puerto `PaymentsProvider` del billing
  EVA↔coach (`docs/archive/specs/pagos-multigateway-flow/`), que es **otro dominio** (EVA cobrándole
  al coach) y que este feature **no toca** (§4, pregunta 1).

---

## 2. Problema que ataca, con números reales

Consulta de solo lectura sobre producción, 2026-08-28 ~22:30 CL (`STATS.md`):

| Dato | Valor | Lectura |
|---|---|---|
| Alumnos activos no archivados | **110** (22 `is_demo`) ⇒ **88 reales** | universo total del motor |
| Alumnos con correo real | **87** de 88 | el `payer_email` obligatorio de MP **no** bloquea la adopción |
| Alumnos con teléfono | **82** | el puente WhatsApp cubre a casi todos |
| Alumnos standalone (`org_id`/`team_id` null) | **110 de 110** | un módulo solo-standalone hoy no excluye a nadie |
| Coaches con alumnos | 47 | |
| Coaches con plan pago activo | **7** | universo de la beta |
| Alumnos de coaches Pro activos | **55** | universo real del motor en v1 |
| `client_payments` en toda la historia | **11 filas, de 1 solo coach; 1 en 90 días** | el registro manual **no se usa** |
| Mediana de esos pagos | $50.000 CLP | ticket típico del rubro |
| `clients.subscription_start_date` cargada | 98 alumnos | dato **cosmético**: hoy solo produce «Desde marzo 2026» |

**Qué dicen estos números.** El módulo no compite contra la función actual de EVA (11 filas en toda la
historia): compite contra **«transferencia + WhatsApp + Excel»**. Y por eso el valor no está en
«registrar pagos» — está en tres cosas que el Excel no hace:

1. **No perseguir**: el recordatorio sale solo, con la marca del coach.
2. **Corte y reactivación automáticos**: el alumno que no paga pierde acceso sin que el coach haga
   nada, y lo recupera en el segundo en que el coach confirma.
3. **Señal automática de MercadoPago**: en el riel automático nadie confirma nada, el webhook lo hace.

**Qué NO hay hoy en el código** (verificado): `grep -rni "paid_until|pagado hasta|por cobrar|student_payment"`
sobre `apps/web/src`, `apps/mobile`, `packages` y `supabase/migrations` → 0 resultados relevantes. La
única noción de vencimiento viva es `buildClientPaymentSummary`
(`apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts:658-701`), que toma el último pago, le
suma `period_months` y usa un corte fijo de **35 días** (`:696`) para pintar el badge
`Al día`/`Vencido`/`Sin pago` del «Panel de ingresos». El motor parte de cero.

Y hay una deuda de seguridad que este tren tiene que pagar: `GRANT ALL ON client_payments TO anon`
sigue vivo (`supabase/migrations/00000000000001_baseline.sql:3592`).

---

## 3. Decisiones del owner (cerradas — no reabrir)

| # | Decisión | Elegida | Consecuencia |
|---|---|---|---|
| D1 | Días de gracia tras el vencimiento | **A** — configurable por el coach: **0 o 3 días** (default 3) | Durante la gracia el alumno tiene **acceso normal + aviso**; al terminar, corte. Override por alumno permitido. `grace_days` nullable en el plan (null = default del coach), CHECK 0..14, la UI ofrece solo 0 y 3 |
| D2 | Quién cancela la suscripción del alumno | **A** — **el alumno cancela solo**, sin pedirle nada al coach | Botón único en `/c/[slug]/pagos`; en `mp_subscription` dispara `PUT /preapproval/{id} {status:'cancelled'}`. Cumple la Ley 21.398 (baja simétrica). Dos consecuencias que el diseño respeta: el plan `canceled` **se sigue evaluando** hasta `paid_through` y después cae al estado derivado **`ended`** (§5.1, R1) — cancelar no es acceso gratis —, y la baja **nunca se apaga**, ni con el kill-switch (§5.4) |
| D3 | Tiers habilitados | **A** — **solo planes pagos (Pro)** | Free ve la tarjeta del módulo en Herramientas con estado «no incluido en tu plan». Guard real en `packages/tiers`, no en la UI |
| D4 | Responsabilidad de reclamos, reembolsos, boletas y contracargos | **A** — **siempre del coach** | EVA **no es intermediario ni recaudador**, comisión **0 %**. Se declara por escrito en el anexo T&C antes de conectar MP |
| D5 | Orden de construcción | **A** — **motor + riel en un solo tren** (el modo manual primero como base, los modos MP encima) | El modo manual queda vivo para siempre (transferencia/efectivo) |
| D6 | Gateway del riel automático | **A** — **MercadoPago** (OAuth marketplace), **sin Stripe** | Transbank/Flow «comercios asociados» quedan documentados como alternativa, fuera de alcance v1 |
| D7 | Modos de cobro del primer tren | **A** — **tres sobre el mismo motor**: `manual`, `mp_link` (link por ciclo), `mp_subscription` (preapproval) | Un mismo coach puede tener alumnos en modos distintos. El motor (vencimiento, gracia, corte, correos) es idéntico en los tres |
| D8 | Ubicación en la web del coach | **A** — página nueva `/coach/cobros` enlazada **desde Herramientas**, sin tocar el navbar | + pill «Pagos» en la ficha del alumno + tarjeta «Cobros del mes» en el dashboard. Conectar MP y ajustes globales viven en `/coach/cobros` |
| D9 | Lanzamiento | **A** — **beta cerrada** por allowlist: 2-3 coaches Pro reales, 2-3 semanas, plata real | Flag por coach + kill-switch global. Después se abre a todos los Pro |
| D10 | Hint «esto se termina en la web» dentro de la app | **A** — **sí para el coach, no para el alumno** | Coach: `<WebOnlyHint/>` con ícono `Monitor`, copy impersonal, no tocable. Alumno: solo estado + WhatsApp al coach, cero mención de la web |
| D11 | Frontera con el billing EVA↔coach | **A** — **subsistema aparte**: tablas nuevas, ruta de webhook nueva, **segunda aplicación de MercadoPago** | Del billing viejo se reutilizan solo helpers puros. Cero cambio de comportamiento en el billing actual |
| D12 | Dónde vive el estado «cortado» | **A** — **derivado, nunca almacenado** | Ningún cron escribe «cortado». Confirmar un pago reactiva al instante. Fail-open si falta el ancla |
| D13 | Alcance del cobro | **A** — **solo alumnos standalone** (sin `org_id`/`team_id`), no demo, no archivados | Hoy no excluye a nadie (110/110 standalone) |
| D14 | Comisión de EVA sobre el cobro coach→alumno | **A** — **0 %, para siempre** | No se usa `marketplace_fee` de MP. Es el argumento competitivo central (§14) |

### 3.1 Resoluciones del jefe tras la crítica adversarial (R1–R23, 29-08)

Mandan sobre el resto de este documento; si algún párrafo las contradice, gana la resolución. Las que
cambian el diseño descrito acá:

| R | Qué cierra | Dónde vive en esta SPEC |
|---|---|---|
| **R1** | Seis estados derivados: `off · ok · due_soon · due · unpaid · ended`. Un plan `canceled` cae a `ended` (no a acceso eterno, no a `unpaid`) | §5.1, §5.2, §15.10 |
| **R2** | `paid_through` se inicializa al crear el plan = `first_due_on`. Nunca `null` en un plan activo | §5.1, T1 |
| **R3** | El claim «ya pagué» **difiere el corte hasta 5 días** y suspende E2/E3/E4; no reactiva. El coach tiene botón **Rechazar** | §5.3, T8, §7.3, §8.1 |
| **R4** | Los avisos se disparan por **umbral (≤)**, nunca por igualdad de fecha, con dedupe en `client_email_ledger` | §5.3, §11 |
| **R5** | Nadie sigue cobrando a quien perdió el acceso: se **cancela** (no se pausa) el preapproval | §5.4, T17, T18, T19, §15.7/8/11/23 |
| **R6** | Hint web-only: **un** copy, sin dominio, iOS = Android, literal en `apps/mobile/lib/web-only-hint.ts` | §9.3, §10.1, §10.2, §19 |
| **R7** | `/api/mobile/config` emite `studentAccess: { state:'blocked', reason:'unpaid'\|'ended' }` + `studentBilling` | §9.2, §9.3, §19 |
| **R8/R9** | **Deshacer confirmación** (≤ 7 días) ≠ **Reversa** por reembolso/contracargo. Pago duplicado con `status='duplicate'` | §5.5, §7.3, §15.13/14/20, §16.9 |
| **R10** | `external_reference` distinto por modo (`chargeId` en `mp_link`, `planId` en `mp_subscription`) | §4 P5, §6.2, §6.3, §19 |
| **R16** | Prepago de N períodos = **N cuotas cerradas** por un mismo pago (`periods_covered`) | §15.5, §19 |
| **R19** | Claim desde RN por `POST /api/mobile/student/cobros/claim`; «+ Pago» con plan abre confirmación de cuota | §9.1, §9.2, §19 |
| **R20** | `BUSINESS_TOOLS` con tipo propio; `active` = `resolveCobrosAccess`, no add-ons comprados | §7.1 |
| **R21** | `description ≤ 140` obligatoria, `student_billing_consents`, aviso previo corto también en el primer checkout `mp_link`, **E0 existe** | §5, §6.2, §8.4, §11, §13, §19 |
| **R22** | Firma del webhook: `?token=` **siempre** obligatorio; firma verificada **si viene** y exigida solo con el flag **`COBROS_WEBHOOK_REQUIRE_SIGNATURE`** en `true`, tras X1 (nivel C) | §4 P9, §19 |
| **R23** | Redacción final de las Notes for Review | §10.3 |

Y de DECISIONS-2 §SPEC: **no existe un estado `recycling`** (el reloj de MP no manda sobre la gracia),
**no hay prorrateo automático** del primer período (queda fuera de alcance) y **E0 sí se manda**.

Y de DECISIONS-2 §EMAILS, el **calendario de cobranza** (F = `paid_through`): gracia 3 ⇒ E2 en F+1,
E3 en F+3, corte y E4 en **F+4**; gracia 0 ⇒ E2 en F, corte y E4 en **F+1** — el corte y E4 caen
**siempre el mismo día** (§5.2). El conteo de plantillas vigente es **22** (13 alumno + 9 coach): las
16 de DECISIONS-2 son el número previo a R3 (C2-bis), R5 (C6), R9 (E11, C7, C8) y R21 (E0).

---

## 4. Respuestas a las once preguntas del owner

**1. ¿Qué partes del código toca? ¿Toca «mis pagos con los coaches»?**
**No.** Es un subsistema aparte (D11): tablas nuevas, webhook nuevo `/api/cobros/mp/webhook`, **segunda
app de MercadoPago** («EVA Cobros», con su propio `client_id`/`client_secret`/signing secret) y crons
propios. Del billing EVA↔coach se reutilizan **solo helpers puros** con refactor mínimo:
`mpRequest`/`mpPostJson`/`mpPutJson` con token inyectado, `verifyMercadoPagoSignature` con el secret
parametrizado, `constantTimeEquals`, `extractMercadoPagoNotificationId`, `mapProviderStatus`,
`ProviderRequestError`, `rateLimitPayment`, `sendTransactionalEmail`/`wrapEmailLayout` y el auth de
cron con `timingSafeEqual`. Además se agrega **defensa en profundidad en la ruta vieja**
(`/api/payments/webhook`): validar UUID al parsear el `external_reference`, early-return si empieza con
`cobro|`, y no escribir `subscription_mp_id` sin plan resuelto. Detalle de arquitectura en PLAN.md.

**2. ¿Dónde ve el coach el pago de sus alumnos?**
En cuatro lugares, en este orden de importancia: (a) la página **`/coach/cobros`** (§7.2), (b) la pill
**«Pagos»** en la ficha del alumno (§7.3), (c) la tarjeta **«Cobros del mes»** en el dashboard (§7.5),
(d) un chip `Debe`/`En gracia`/`Avisó` en el roster con filtro «Por cobrar» (§7.6).

**3. ¿Qué queda en React Native y qué no?**
RN = **solo estado y confirmación**. Cero configuración de plata, cero links de pago, cero precios de
EVA. El coach ve estado, historial y puede **confirmar un pago recibido**; el alumno ve estado y puede
**avisar que pagó**. Todo lo demás es web. Tabla completa en §9.

**4. Diseño de los correos.**
**22 plantillas: 13 al alumno + 9 al coach** (conteo cerrado, EMAILS.md §9). Al alumno **E0…E11 +
E1-link** (E0 «tu coach activó tu cobro» al crear el plan, R21; E1-link solo en `mp_link`; E11 «tu
pago fue reembolsado/desconocido», R9) y al coach **C1…C8 + C2-bis** (C2-bis = recordatorio diario
mientras el claim siga vivo, exigido por R3; C6 «bajaste a Free» por R5, C7 «reembolso/contracargo» y
C8 «pago duplicado» por R9), con ledger nuevo `client_email_ledger` y dedupe por
`template + charge_id`. Las **16** que cita DECISIONS-2 son el conteo **previo** a R3/R5/R9/R21: el
número vigente es 22, y quien construya la lista construye 22 (fusionar E10 dentro de E5 o C2-bis
dentro de C1 es la única reducción admitida, y exige aprobación del jefe). Resumen en §11; el detalle
(asunto, preheader, cuerpo, CTA único, variables) vive en EMAILS.md.

**5. ¿Cómo funcionan los links de cobro de MercadoPago y para qué riel sirven?**
El **«link de pago» que el coach crea a mano en su panel de MP no le notifica nada a EVA**: es un
recurso de la cuenta del coach, creado fuera de la aplicación de EVA, sin `notification_url` ni
`external_reference` controlados por EVA. Sirve **solo como texto en el modo manual** (el coach lo
pega una vez en sus ajustes, el alumno paga, avisa, el coach confirma). La señal automática sale de
recursos creados **con el token OAuth del coach desde la app de EVA**: una preference de Checkout Pro
(modo `mp_link`) o un `preapproval` sin plan con `status: pending` que devuelve `init_point` (modo
`mp_subscription`). Los dos con `notification_url` **por recurso** (gana sobre el del panel) y
`external_reference` **distinto según el modo** (R10): la preference de `mp_link` referencia la cuota
(`cobro|<coachId>|<clientId>|<chargeId>`) porque muere con ella; el preapproval de `mp_subscription`
referencia el **plan** (`cobro|<coachId>|<clientId>|<planId>`) porque el ref es inmutable y la
suscripción vive N cuotas. La cuota de un `authorized_payment` se resuelve **por período** (la fecha de
cobro dentro de `[period_start, period_end]`; si no existe, se crea), nunca por un `chargeId` del ref.

**6. ¿Cómo se testea el riel automático: sandbox o plata real?**
**Los tres niveles, en orden.** Nivel A: mocks en CI (el molde ya existe: test de webhook firmado).
Nivel B: sandbox con test users MLC — sirve para OAuth, creación de preapproval, `init_point`, estados
y cancelación; **no** sirve para webhooks (MP no los entrega en modo test; solo el Simulador del
panel). Nivel C: **plata real mínima, obligatoria** — CLP 1.000 × 2 cobros con `frequency_type: days`,
coach = segunda cuenta MP, alumno = tarjeta del owner, reembolso al final. Más un script
`scripts/cobros-fake-webhook.mjs` para firmar webhooks a mano contra preview.

**7. Diseño UI/UX de cada pieza.**
§7 (web coach), §8 (web alumno) y §9 (RN) describen cada pantalla con anatomía, copy, estados vacíos y
de error, y a qué componente existente se parece. Los mockups los hace el jefe.

**8. Backend que no rompa lo existente.**
Todo aditivo: tablas nuevas, gate **fail-open**, ruta y aplicación de MP separadas, feature flag +
allowlist de beta + kill-switch, y **cero escritura** sobre `clients.is_active` / `clients.is_archived`
/ GoTrue. El gate nuevo se compone con el existente sin reemplazarlo (§8.6).

**9. Seguridad.**
Threat model completo en **[DATA-SECURITY.md](DATA-SECURITY.md) §12** (T-01…T-22) — **no** en PLAN.md,
que solo lo cita de pasada en los riesgos de W5. Los titulares: tokens OAuth cifrados AES-256-GCM y nunca
legibles por `authenticated`; webhook con **`?token=` siempre obligatorio** y firma `x-signature`
**verificada si viene** — la firma pasa a **exigida** solo cuando el flag
**`COBROS_WEBHOOK_REQUIRE_SIGNATURE`** esté en `true`, y eso ocurre recién cuando X1 confirme qué
secret firma con la primera notificación real de nivel C (R22; hasta entonces default `false`, y la
autoridad son `?token=` + re-fetch + `collector_id`); re-fetch del recurso con el token del coach y
verificación de que
`collector_id === connection.provider_account_id`; `external_reference` con los tres ids validados
contra la DB; ledger de eventos con inserción **antes** de mutar; rate limit del claim «ya pagué»;
`checkout_url` **jamás** servido a RN; `REVOKE ALL ON client_payments FROM anon`.

**10. ¿Cómo avisar dentro de la app que «esto se termina en la web»?**
Solo al **coach**, con el componente `<WebOnlyHint topic="cobros"/>` (ícono `Monitor`, `View` con
`accessibilityRole="text"`, **sin `onPress`**), con **una sola** redacción impersonal, la misma en iOS
y en Android y **sin dominio** (R6): «**El cobro a tus alumnos se configura desde el computador**»
(variante de la ficha: «El cobro de este alumno se configura desde el computador»), literal único en
`apps/mobile/lib/web-only-hint.ts` (§10.2). Al **alumno, nunca**: solo estado + «Escríbele a tu coach».
Tabla mensaje por mensaje en §10.

**11. ¿Cómo se le gana a la competencia?**
0 % de comisión (TrueCoach 5 %, Everfit 3,15-4,65 %, Trainerize ~1,9 % + USD 10/mes, AgendaPro +1-2 %
encima de MP), pasarela local con débito y RedCompra (ninguno de los globales opera en CLP), tres modos
conviviendo, corte automático **con gracia configurable** y reactivación instantánea, el alumno cancela
solo (TrueCoach no lo permite; Fitco exige chat a soporte), puente WhatsApp desde el panel, y un diseño
iOS-safe por construcción. Detalle en §14.

---

## 5. Modelo de dominio

```
Coach ──1── coach_billing_settings        ajustes del módulo: gracia default, días de recordatorio,
   │                                      instrucciones de transferencia, link propio, RUT +
   │                                      declaración tributaria, versión del anexo T&C aceptado
   ├──0..1── coach_payment_connections    OAuth MP del coach (tokens cifrados; deny-all al rol
   │                                      authenticated) + coach_payment_connection_events
   └──*── client_billing_plans            UN plan vivo por alumno: monto, periodicidad, modo, gracia,
            │                             description (≤ 140, obligatoria), first_due_on,
            │                             paid_through, next_due_on, status
            ├──*── student_billing_charges    LA CUOTA: período, monto, modo, estado, preference e
            │        │                        init_point si es mp_link, claim «ya pagué», comprobante
            │        └──*..1── client_payments  el pago confirmado: source ∈ manual | student_claim |
            │                                   mp_link | mp_subscription; provider_payment_id único;
            │                                   periods_covered = cuántas cuotas cierra (R16)
            ├──0..1── student_subscriptions   preapproval MP vivo: status remoto, canceled_by
            ├──*── student_billing_consents   evidencia legal: kind ∈ subscription | first_checkout,
            │                                 terms_version, consented_at, ip_hash, user_agent (R21)
            └──*── student_payment_events     bitácora idempotente: webhooks + acciones manuales
Alumno ──*── client_email_ledger          dedupe de correos por plantilla + período
```

**Vocabulario cerrado.**

- **Plan de cobro** (`client_billing_plans`): el acuerdo vivo entre coach y alumno. Uno por alumno
  (índice único parcial sobre `status='active'`).
- **Cuota** (`student_billing_charges`): un período concreto a pagar. Es la unidad sobre la que se
  mandan correos, se dedupean, se confirma y se corta.
- **Pago** (`client_payments`): el hecho consumado. Una cuota tiene 0 o 1 pago; **un pago puede cerrar
  N cuotas consecutivas** (prepago, R16): las cuotas comparten `payment_id` y el pago guarda
  `periods_covered`. Por eso **no hay índice único** sobre `student_billing_charges.payment_id`.
- **Descripción del servicio** (`client_billing_plans.description`, texto ≤ 140, **obligatoria**,
  R21): «Asesoría online mensual». Es lo que el alumno lee en E0/E5/E6 y en el aviso previo; sin ella
  no se puede crear el plan.
- **Modo** (`client_billing_plans.mode`): `manual` · `mp_link` · `mp_subscription`.
- **Periodicidad** (`period_kind`): `monthly` (default) · `biweekly` · `quarterly` · `one_off`
  (paquete o sesión suelta; sin renovación).
- **Gracia** (`grace_days smallint null`): null = usa el default del coach. CHECK entre 0 y 14; la UI
  ofrece **0 o 3** (D1).

### 5.1 El estado es DERIVADO, nunca almacenado

**Firma real de la función pura** (la que implementa DATA-SECURITY §3.1; no inventar variantes):

```
resolveStudentBillingState({ plan, coachIsPro, clientExcluded, gateEnabled, now }) → StudentBillingResult
                                                                      { state, paidThrough, cutsAt,
                                                                        graceDays, deferredByClaim }
```

`plan` es un `StudentBillingPlanRow` con el estado del plan **ya materializado en su propia fila**
—`paidThrough`, `effectiveGraceDays`, `reminderDaysBefore`, `moduleEnabled`, `engineHoldAt`,
`claimDeferralUntil`, `mode`— para que el gate SQL y el TS lean **exactamente las mismas columnas** y
no puedan driftear (D-W14). `tz` no es parámetro: todo se evalúa en `America/Santiago` con los
helpers de fecha, y `now` es inyectable para que la cadena sea determinista.

```
  !gateEnabled                                           →  'off'      (R14: kill-switch Edge Config +
                                                                        private.cobros_gate_enabled())
  clientExcluded                                         →  'off'      (demo / archivado / inactivo /
                                                                        org / team: si el motor no le
                                                                        cobra, el motor no lo corta)
  !plan  ||  !coachIsPro  ||  !plan.moduleEnabled  ||  plan.engineHoldAt != null
         ||  plan.status === 'paused'                    →  'off'      (fail-open)
  plan.paidThrough == null                               →  'off'      (fail-open: sin ancla no se corta;
                                                                        un plan activo nunca la tiene, R2)

  plan.status === 'canceled':                                          (dado de baja por el alumno o el coach)
      now ≤ endOfDay(paidThrough)                        →  'ok'       (conserva lo pagado; copy «tu plan
                                                                        termina el X», sin CTA de pago)
      else                                               →  'ended'    (corte, SIN gracia: ya avisó que se iba)

  plan.status === 'active':
      now ≤ endOfDay(paidThrough)                        →  'ok'       (+ 'due_soon' si faltan ≤ reminderDaysBefore)
      now < cutsAt                                       →  'due'      (vencido, en gracia: acceso normal + aviso)
      else                                               →  'unpaid'   (corte)

  cutsAt = max( endOfDay(paidThrough) + effectiveGraceDays , claimDeferralUntil )
           (R3: el claim vivo corre el corte hasta 5 días después del fin de la gracia;
            deferredByClaim = true cuando gana la segunda rama. Con gracia 0, cutsAt === el
            vencimiento ⇒ no existe estado 'due')
```

**Los cinco nombres nuevos que entran con esto** (registrados también en §19, porque §19 exige que
todo nombre se registre antes de usarse): `client_billing_plans.effective_grace_days`,
`.module_enabled`, `.claim_deferral_until`, `.engine_hold_at` y `.needs_manual_cancel`.
`engine_hold_at` es el **freno del motor**: se pone cuando EVA pierde la señal de cobro (MP
desconectado, T18/T18b) y su efecto es `off` —no cortar, no cobrar—, mientras `needs_manual_cancel`
marca las suscripciones que EVA ya no puede cancelar por API y que el coach debe bajar en su panel de
MP (R5). `moduleEnabled` es la copia materializada de `coach_billing_settings.enabled`, y
`gateEnabled` la del kill-switch: un flag ilegible **no** apaga el cobro de nadie (default `true`,
D-W12).

**Seis estados derivados, no cinco** (R1): `off · ok · due_soon · due · unpaid · ended`. `unpaid` y
`ended` cortan igual, pero **no son lo mismo y no se dicen igual**: `unpaid` es «me falta pagar» y
tiene remedio inmediato (pagar o que el coach confirme); `ended` es «esta relación de cobro se
terminó» y el remedio es hablar con el coach para volver a empezar. Copys cerrados:

| Estado | Web del alumno | App nativa del alumno | `reason` en `/api/mobile/config` |
|---|---|---|---|
| `unpaid` | «Tu acceso está en pausa» + cómo pagar | «Tu acceso está en pausa» (sin cómo pagar) | `'unpaid'` |
| `ended` | «Tu plan con {coach} terminó» + «Escríbele si quieres volver» | «Tu acceso está en pausa» (**el mismo copy**, §10) | `'ended'` |

**`paid_through` se inicializa al crear el plan** = `first_due_on`, la fecha de «primer vencimiento»
que el coach elige (R2). La regla que se le promete al alumno es literal: **el acceso vale hasta el
primer vencimiento; después corre la gracia; después el corte.** Un plan `active` con `paid_through
null` es un bug, no un estado: la rama de fail-open existe solo para datos rotos.

**Por qué `canceled` sigue evaluándose** (y no cae a `off`): si un plan cancelado apagara el gate, el
alumno que aprieta «Dar de baja mi plan» se quedaría con **acceso completo e indefinido** — gratis
hasta que el coach lo notara a mano. Como la baja es autoservicio y existe en los tres modos (D2), eso
convertiría el botón en la puerta de salida del negocio del coach. La promesa «conserva acceso hasta
`paid_through`» solo es verdad si `canceled` se sigue mirando, y **después de esa fecha el estado es
`ended`**, no `off`. La función pura, el espejo SQL `private.student_billing_allowed` y la fila
**B-12** de DATA-SECURITY §3.3 (con su test) dicen esto mismo: un plan `canceled` **no** es un plan
invisible.

**El caso de cancelación, completo** (T14 + R5 + R1), porque es donde se juntan las tres reglas:

1. El alumno aprieta «Dar de baja mi plan/suscripción» (o el coach cancela el plan desde la ficha).
2. Si hay preapproval vivo, EVA **lo cancela en MP** (`PUT /preapproval/{id} {status:'cancelled'}`,
   irreversible) **antes** de escribir nada: si esa llamada falla, se reintenta y se alerta (R5); nunca
   se deja el plan cancelado en EVA con la tarjeta debitándose en MP.
3. `client_billing_plans.status = 'canceled'`, `canceled_by`, `canceled_at`. `paid_through` **no se
   toca**: es lo que el alumno ya pagó.
4. Las cuotas futuras `pending` pasan a `canceled`; la cuota vigente, si ya se pagó, se queda `paid`.
5. Correos: **E7** al alumno («tu plan termina el {paid_through}») y aviso al coach (§11).
6. Derivado: `ok` hasta `paid_through` con el copy «tu plan termina el X» y **sin CTA de pago**;
   después, `ended`.
7. Volver = plan nuevo (§15.10). No hay «descancelar».

Vive dos veces, con el mismo contrato: como función pura en `packages/cobros` (TS, con tests de borde)
y como espejo SQL `private.student_billing_allowed`. **Ningún cron escribe «cortado»**: el cron solo
notifica y marca `cut_notified_at`. Confirmar un pago avanza `paid_through` dentro de la RPC
`private.cobros_confirm_charge` (`security definer`, `select … for update` sobre el plan, R13), nunca
con un `paid_through + interval` calculado en JS sin candado. `paid_through` **avanza por
confirmaciones y retrocede solo por deshacer, reembolso o contracargo** (§5.5, R8/R9).
Todo en `America/Santiago`, con los helpers ya existentes
(`apps/web/src/lib/date-utils.ts`: `getTodayInSantiago`, `getSantiagoUtcBoundsForDay`);
`paid_through` y `period_*` son `date`, no `timestamptz`.

Este diseño es deliberado y responde a la trampa más cara del dominio: **si el corte usara
`clients.is_active`, el coach quedaría encerrado fuera del registro del pago que reactiva**, porque
`assertCoachCanManageClient` exige `is_active = true`
(`apps/web/src/services/client/client.service.ts:33`).

### 5.2 Máquina de estados

Estados del **plan** (`client_billing_plans.status`): `active` · `paused` · `canceled`.
Estados **derivados** del alumno (nunca en la DB): `off` · `ok` · `due_soon` · `due` · `unpaid` ·
`ended` — **seis, cerrados por R1**; no existe `recycling` (DECISIONS-2: el reloj de reintentos de MP
no manda sobre la gracia).
Estados de la **cuota** (`student_billing_charges.status`): `pending` · `claimed` · `paid` ·
`refunded` · `charged_back` · `expired` · `canceled` (los dos del medio los escribe la reversa, R9).

| # | Estado actual | Evento | Estado nuevo | Efectos | Correo / push |
|---|---|---|---|---|---|
| T1 | (sin plan) | El coach activa el cobro del alumno | plan `active`, `paid_through = first_due_on` (R2) ⇒ derivado `ok` | Se crea la 1.ª cuota `pending` con `due_on` = `first_due_on`; se exige `description` (R21) | **E0** «Tu coach activó tu cobro» (monto, ciclo, primer vencimiento, cómo pagar, quién responde) |
| T2 | `ok` | `now` cruza `paid_through − reminder_days` | `due_soon` | El cron sella el envío en el ledger | **E1** al alumno (recordatorio, con link o instrucciones) |
| T3 | `ok`/`due_soon`, modo `mp_link` | Faltan 5 días para `due_on` | igual | El cron crea la preference con el token del coach; guarda `provider_preference_id`, `checkout_url`, `checkout_expires_at` (+30 días) | **E1-link** «Tu link de pago de {mes}» |
| T4 | `due_soon` | `now > endOfDay(paid_through)` y gracia > 0 (**F+1**, con F = `paid_through`) | `due` | Acceso **normal**; banner en web, fila de estado en RN | **E2** «Tu plan venció» — sale en **F+1** |
| T5 | `due_soon` | `now > endOfDay(paid_through)` y gracia = 0 (**F+1**) | `unpaid` | **Corte** el día siguiente al vencimiento (derivado); `cut_notified_at` | En **F**: **E2** «Hoy es el último día». En **F+1**, con el corte ya efectivo: **E4** «Tu acceso está en pausa» + push `cobros_access_paused`. **Dos días distintos** (DECISIONS-2 §EMAILS) |
| T6 | `due` | **Último día de gracia** = **F+gracia** (F+3 con gracia 3): el corte es mañana | `due` | Acceso todavía normal | **E3** «Mañana se pausa tu acceso» — sale en **F+3**, solo si la gracia es 3 |
| T7 | `due` | Se agota la gracia: **F+gracia+1** (F+4 con gracia 3) | `unpaid` | Corte derivado **el mismo día que sale E4**; el cron sella `cut_notified_at` una sola vez | **E4** «Tu acceso está en pausa» — sale en **F+4** + push `cobros_access_paused` |
| T8 | `due` o `unpaid`, modo `manual` | El alumno aprieta «Ya pagué» (web o RN, R19) | igual (**el acceso NO se reactiva**) pero **el corte se difiere hasta 5 días** después del fin de la gracia (R3) | Cuota → `claimed`, `claimed_at` (máx. **1 claim vivo por cuota**), nota ≤ 280 y comprobante opcional (solo web). **E2/E3/E4 al alumno quedan suspendidos** mientras el claim viva | **C2** al coach al instante + push `cobros_claim_received` + **recordatorio diario** al coach («{alumno} avisó hace N días: confirmar o rechazar») |
| T8b | cuota `claimed` | El coach aprieta **«Rechazar»** | vuelve al calendario normal | Cuota → `pending`, `claim_rejected_at`; se acaba el diferimiento y se reanudan E2/E3/E4 | — (el alumno lo ve en `/pagos`) |
| T9 | cualquiera | El coach confirma el pago (web o RN) | `ok` | Cuota → `paid`; fila en `client_payments` con `source` y `provider_payment_id`; `paid_through = period_end`; se crea la cuota siguiente; **reactivación instantánea** si estaba cortado | **E5** «Pago confirmado» (+ **E10** si venía de corte) + push `cobros_payment_confirmed` / `cobros_access_restored`; **C3** al coach si tiene el aviso activo |
| T10 | cualquiera, modo `mp_link` | Webhook `payment` con `status=approved` y `collector_id` verificado | `ok` | Igual que T9, `source='mp_link'`, sin intervención del coach | **E5** + push; **C3** |
| T11 | cualquiera, modo `mp_subscription` | Webhook `subscription_authorized_payment` aprobado | `ok` | Igual que T9, `source='mp_subscription'`; la cuota se **materializa** desde el evento | **E5** + push; **C3** |
| T12 | `ok`, modo `mp_subscription` | Webhook de cobro **rechazado** | **el calendario del motor no cambia**: `due` durante la gracia y `unpaid` al agotarse, igual que en los otros modos (DECISIONS-2: no hay estado `recycling`) | `student_subscriptions.last_charge_status='rejected'` + contador de reintentos. Si MP recupera el cobro después, el webhook lo confirma y el acceso **vuelve solo** (R12) | **E8** «El cobro automático no pasó» (cómo actualizar la tarjeta en MP) |
| T13 | modo `mp_subscription` | MP cancela la suscripción sola tras 3 cuotas rechazadas | El plan pasa a modo `manual`, sigue `active` | `student_subscriptions.status='cancelled'`; el alumno queda con el estado derivado que le corresponda (típicamente `unpaid`) | **E7** al alumno + **C5** al coach |
| T14 | plan `active` | **El alumno se da de baja** (web o el coach cancela el plan) | plan `canceled`, `canceled_by`; derivado `ok` hasta `paid_through` y **después `ended`** (R1) | En `mp_subscription`: `PUT /preapproval/{id} {status:'cancelled'}` **antes** de escribir el plan (**irreversible**, con reintentos + alerta si falla, R5). Las cuotas futuras `pending` → `canceled`. Copy en `ok`: «tu plan termina el X», sin CTA de pago. Secuencia completa en §5.1 | **E7** al alumno + aviso al coach (push `cobros_plan_canceled` + fila en el panel; §11) |
| T15 | plan `active` | **El coach pausa** el cobro | plan `paused` → derivado `off` | No se cobra ni se corta. En `mp_subscription`: `PUT {status:'paused'}` (reversible) | **E9** «Tu coach pausó tu cobro» |
| T16 | plan `paused` | El coach reanuda | plan `active` | Se recalcula `next_due_on`; en MP `PUT {status:'authorized'}` | **E9** variante «reanudado» |
| T17 | cualquiera | **El coach deja de ser Pro** (downgrade o vencimiento) | derivado `off`; los planes quedan **`paused`** (R5) | Motor **en pausa**: no se crean cuotas, no se manda cobranza, **nadie se corta**. Y por §5.4 se **cancelan** en MP (`PUT {status:'cancelled'}`) todas las suscripciones vivas del coach: EVA no deja un débito mensual corriendo por un servicio que dejó de administrar | **C6** al coach «bajaste a Free» (con el conteo de suscripciones canceladas) + **E9** al alumno |
| T18 | cualquiera | El coach **desvincula MP desde EVA** | Los planes `mp_*` → `manual`, **sin cortar**: se les pone `engine_hold_at = now()` ⇒ derivado `off` mientras el freno esté puesto | El diálogo de desconexión **lo dice explícitamente**: EVA **cancela TODAS las suscripciones vivas ANTES de revocar los tokens** (R5). Recién después la conexión pasa a `revoked`. Las que la API rechace quedan con `needs_manual_cancel = true` | **C5** al coach + **E9** al alumno |
| T18b | cualquiera | La desautorización llega **desde MP** (topic `mp-connect` / `application.deauthorized`) | Los planes `mp_*` → `manual`, **sin cortar**: `engine_hold_at = now()` ⇒ derivado `off` (EVA perdió la señal de cobro; cortar a ciegas sería cortar a quien quizá sí pagó) | EVA **ya no puede** llamar a la API: conexión `revoked` y punto. No se intenta cancelar nada: las suscripciones vivas quedan con **`needs_manual_cancel = true`** y son las que enumera el C5 | **C5** al coach **con instrucciones para cancelar en su panel de MP** + **E9** al alumno con el paso a paso en su propia cuenta |
| T19 | cualquiera | El alumno es **archivado, desactivado o eliminado** | derivado `off` | Manda el gate viejo (`is_archived`/`is_active`, `apps/web/src/proxy.ts:1377`): el alumno pierde el acceso **en el acto**. Por eso el plan se congela **y el preapproval se cancela en MP** (`PUT {status:'cancelled'}`, §5.4): archivar sin cancelar es cobrar sin servicio | **E9** al alumno si había cobro automático |
| T20 | cualquiera | Se enciende el **kill-switch** `COBROS_KILL_SWITCH` | derivado `off` para todos | Gate, cron y webhook apagados en un click; nadie cortado. **El kill-switch NO cancela suscripciones** (es temporal, R5). **Excepción**: la página `/c/[slug]/pagos` en modo mínimo y la baja de la suscripción siguen sirviéndose para quien tenga un preapproval vivo (§5.4) | — |

**Calendario de la cobranza, cerrado por DECISIONS-2 §EMAILS** (F = `paid_through`; es el mismo que
usan EMAILS.md, el sweep de DATA-SECURITY §9.1 y el caso A4 de TESTING). El corte y **E4 caen el
mismo día**: no existe la ventana en que el alumno recibe «tu acceso está en pausa» un día antes de
que se pause.

| Gracia | E1 | E2 | E3 | Corte + E4 |
|---|---|---|---|---|
| **3** | F − `reminder_days` | **F+1** | **F+3** (= F+gracia) | **F+4** (= F+gracia+1) |
| **0** | F − `reminder_days` | **F** («hoy es el último día») | — (no existe) | **F+1** |

**Transiciones irreversibles** (exigen confirmación explícita en la UI): T14, T17, T18 y T19 en modo
`mp_subscription` (MP no reactiva un preapproval cancelado; hay que crear uno nuevo, y el diálogo lo
dice con esas palabras) y **«Deshacer confirmación»** de un pago (§5.5), que queda auditada con autor,
motivo y timestamp.

### 5.3 Reglas del motor

1. **Confirmar un pago** (de cualquier fuente) es la única operación que **avanza** `paid_through`, y
   se hace siempre por la RPC `private.cobros_confirm_charge` / `private.cobros_apply_provider_payment`
   (R13). Idempotente por `client_payments.charge_id`: dos confirmaciones de la misma cuota no suman.
2. **`paid_through` arranca en `first_due_on`** al crear el plan (R2) y nunca queda `null` en un plan
   activo.
3. **La cuota siguiente** se crea al confirmar la anterior (o por el cron si falta), con
   `period_start = paid_through + 1 día` y `period_end = period_start + period_kind`. En `one_off` no
   hay cuota siguiente. En un **prepago de N períodos** se cierran N cuotas consecutivas con el mismo
   `payment_id` y `paid_through` = `period_end` de la última (R16, §15.5).
4. **Gracia** = `plan.grace_days ?? coach.default_grace_days` (0 o 3). Un **claim vivo** la extiende de
   hecho hasta 5 días más, solo para diferir el corte (R3): no reactiva ni cambia la cuota.
5. **Los avisos se disparan por umbral (`≤`), nunca por igualdad de fecha** (R4), con dedupe en
   `client_email_ledger`. Un plan creado dentro de la ventana de un aviso lo recibe **al día siguiente
   en el sweep**, no lo pierde.
6. **Corte** = derivado. El cron **solo notifica** y sella `cut_notified_at` para no repetir.
7. **Reactivación** = derivada al confirmar. En `mp_subscription` también cuando MP recupera el cobro
   después de un rechazo: el webhook confirma y el acceso vuelve solo, sin estado intermedio.
8. **`mp_link`**: el cron crea la preference con el token del coach **5 días antes** del vencimiento
   (o al crear el plan si ya venció); el link expira a los 30 días (`expiration_date_to`).
9. **Fuera del motor, siempre**: alumnos `is_demo`, alumnos con `org_id`/`team_id`, alumnos archivados,
   y todo alumno de un coach que no sea Pro activo con el módulo habilitado.
10. **Zona horaria**: `America/Santiago`. El cron `cobros-sweep` corre a las 09:00 CL, después de
    `paid-expiry`.

### 5.4 Ningún cobro automático sobrevive a la pérdida del acceso o de la relación

Regla dura del módulo, con rango de invariante (§16.12). Un `preapproval` vivo es una tarjeta que se
sigue debitando **todos los meses** aunque EVA haya apagado el motor. Cobrar sin servicio es el caso
más caro de la Ley 19.496 y el detonante clásico del contracargo — que además se le descuenta **al
coach** (D4). Por eso, en **todos** los eventos que terminan el acceso o la relación, EVA usa el token del
coach para **cancelar** en MP (`PUT /preapproval/{id} {status:'cancelled'}`, con reintentos y alerta si
falla). **Se cancela, no se pausa** (R5): una suscripción «pausada» es una bomba de tiempo que alguien
puede reanudar por error meses después. Volver al automático siempre es un preapproval **nuevo**, con
su aviso previo y su E6.

| Evento | Llamada a MP | Punto de enganche verificado | Aviso |
|---|---|---|---|
| **El plan se cancela** (T14) | `PUT {status:'cancelled'}` **antes** de escribir el plan | baja del alumno en `/c/[slug]/pagos` y «Cancelar» de la ficha | **E7** al alumno |
| Alumno **archivado** o `is_active=false` | `PUT {status:'cancelled'}` | acción del roster/ficha que hoy escribe `is_archived`/`is_active` (`ClientActionsSheet.tsx`, `ToggleStatusButton`) | **E9** al alumno |
| Alumno **borrado** | `PUT {status:'cancelled'}` | mismo servicio de borrado del alumno | **E9** al alumno |
| Coach **baja a Free** o se le vence el plan (T17) | `PUT {status:'cancelled'}` en todas las vivas; los planes quedan **`paused`** | el mismo cron que dispara **C6** | **C6** + **E9** |
| Coach **borra su cuenta** | `PUT {status:'cancelled'}` en **todos** los preapprovals **antes** de tocar la conexión | `apps/web/src/app/coach/settings/_actions/settings.actions.ts:388` (`deleteCoachAccountAction`), con el mismo patrón con que ya cancela la suscripción EVA↔coach en el proveedor | **E9** a cada alumno |
| Coach **desvincula MP desde EVA** (T18) | `PUT {status:'cancelled'}` en **TODAS** las suscripciones vivas **ANTES de revocar los tokens**, con un diálogo que se lo dice al coach | `/api/cobros/mp/disconnect` | **C5** + **E9** |
| Desautorización **desde MP** (T18b) | **ninguna: ya no hay token** | topic `mp-connect` del webhook | **C5** con instrucciones para cancelar en su panel MP + **E9** con el paso a paso |
| **Kill-switch global** (T20) | **ninguna, a propósito**: es temporal y solo apaga gate, cron y webhook | Edge Config + `platform_flags.cobros_gate` | — |

Si en cualquiera de esos casos EVA **ya no puede** llamar a MP (token revocado, `invalid_grant`), la
obligación no desaparece: se le manda al **alumno** —no solo al coach— el correo **E9** con el paso a
paso para dar de baja el cobro desde su propia cuenta de Mercado Pago.

**Corolario en el borrado de cuenta.** `apps/web/src/app/privacidad/page.tsx:157` promete hoy, por
escrito: «Tu suscripción activa será cancelada en MercadoPago». Hoy es cierto porque la única
suscripción es la del coach con EVA; con este módulo deja de serlo si no se cancelan también las de
sus alumnos. El texto publicado se mantiene verdadero **por construcción**, no por suerte.

**La salida del alumno nunca se apaga.** Mientras exista una fila en `student_subscriptions` con
`status in ('authorized','pending')`, la página `/c/[slug]/pagos` **se sirve siempre**, en «modo
mínimo» (estado del cobro automático + «Dar de baja mi suscripción» + cómo hacerlo en MP), aunque el
plan esté `off`, el coach sea Free, el módulo esté apagado o el kill-switch encendido; lo mismo vale
para el POST de la baja. `resolveCobrosAccess` lleva esa **excepción explícita** para esa ruta y ese
endpoint (los demás siguen devolviendo 404). Sin esto se rompe el invariante 10 y la Ley 21.398: el
kill-switch —pensado como red de seguridad— cerraría la única salida del alumno mientras la plata
sigue saliendo.

### 5.5 Deshacer una confirmación ≠ revertir por reembolso o contracargo

Son **dos operaciones distintas, con dos nombres distintos y dos reglas distintas** (R8 y R9). El
error de diseño que hay que evitar es meterlas en una sola acción llamada «Anular pago»: la primera
corrige un dedo del coach, la segunda registra que la plata se fue. Se llaman siempre así, en la UI,
en el código y en el resto del SDD.

| | **Deshacer confirmación** (R8) | **Reversa por reembolso o contracargo** (R9) |
|---|---|---|
| Quién la dispara | El **coach**, a mano | El **webhook de MP** (`refunded` / `charged_back`) o el coach cuando devolvió por fuera |
| Cuándo se puede | Solo la **última** confirmación de esa cuota, **≤ 7 días** | Siempre que MP lo notifique |
| Qué pasa con la cuota | Vuelve a `pending`, `payment_id = null` | Queda `refunded` o `charged_back` |
| Qué pasa con el pago | Se marca deshecho y sale del historial vivo | `client_payments.status = 'refunded' \| 'charged_back'` |
| `paid_through` | Retrocede al **valor previo**, guardado por la confirmación | Retrocede al `period_end` de la **cuota anterior pagada** |
| Correos | — (es una corrección interna del coach) | **E11** al alumno + **C7** al coach |
| RPC (R13) | `private.cobros_undo_confirmation(charge_id, actor, reason)` | `private.cobros_revert_charge(charge_id, kind)` |

**Deshacer confirmación.** Reemplaza al ícono de borrar: `FacturacionTab` **pierde el botón de borrar
en toda fila con `charge_id`** (los pagos legacy sin `charge_id` conservan el borrado de siempre,
porque no hay motor detrás que se descuadre). En su lugar hay una server action **«Deshacer
confirmación»**, disponible solo para la última confirmación de esa cuota y solo dentro de **7 días**,
que reabre la cuota, retrocede `paid_through` al valor previo y **queda auditada** (autor, motivo,
timestamp) en `student_payment_events`. Pasados los 7 días, o si hubo otra confirmación después, la
salida correcta ya no es deshacer sino la reversa.

**Reversa por reembolso o contracargo — una sola regla.** La versión anterior de esta spec decía que
un contracargo no tocaba el acceso; **R9 la reemplaza**: la cuota pasa a `refunded` o `charged_back`,
`client_payments.status` lo mismo, y `paid_through` retrocede al `period_end` de la cuota anterior
pagada. El estado derivado se recalcula solo y **puede quedar `unpaid`** — que es la verdad: ese
período no está pagado. Se avisa a los dos lados el mismo día: **E11** al alumno («tu pago fue
reembolsado/desconocido; tu acceso queda en pausa el X») y **C7** al coach. El panel pinta el badge
`Reembolsado` o `Contracargo` sobre la fila.

**Pago duplicado** (un segundo pago aprobado para una cuota que ya está `paid`): se registra en
`client_payments` con `charge_id null` y `status = 'duplicate'`, **nunca avanza `paid_through` dos
veces**, y se manda **C8** al coach para que lo devuelva desde su panel de MP. EVA no reembolsa (D4).

**Consecuencias de esquema** (van en DATA-SECURITY): `client_payments.status` admite
`paid | refunded | charged_back | duplicate`; `student_billing_charges.status` admite `refunded` y
`charged_back`; **no hay índice único sobre `student_billing_charges.payment_id`** (R16: un pago cierra
N cuotas); el índice único de `client_payments.charge_id` es **parcial** (no aplica a las filas
`duplicate`, que lo llevan en `null`); y la confirmación guarda siempre el `paid_through` previo para
que deshacer pueda restaurarlo.

**La invariante que rige** (§16.9, redacción de R8): `paid_through` **avanza por confirmaciones y
retrocede solo por deshacer, reembolso o contracargo** — tres eventos auditados, ninguno de ellos un
cron ni un webhook fuera de orden.

---

## 6. Los tres modos de cobro, paso a paso

Los tres comparten el motor: mismo plan, mismas cuotas, mismos correos, misma gracia, mismo corte.
Lo que cambia es **quién produce la señal de que el alumno pagó**.

### 6.1 Modo `manual` — transferencia, efectivo, o el propio link del coach

**El coach:**
1. Entra a `/coach/cobros` → **Ajustes de cobros** → escribe sus **instrucciones de transferencia**
   (texto libre ≤ 600 caracteres: banco, tipo de cuenta, número, RUT, correo) y, si tiene, pega su
   **link de pago propio** (validado en el servidor contra una allowlist de hosts: `mpago.la`,
   `link.mercadopago.cl`, `mercadopago.cl`, `mercadopago.com`, `flow.cl`, `payku.cl`, `khipu.com`).
2. En la ficha del alumno → pill **Pagos** → «Activar cobro»: monto, cada cuánto, primer vencimiento,
   modo `Transferencia`, gracia (0 o 3).
3. Recibe el digest diario (**C1**) si hay algo por cobrar, y un aviso (**C2**) cuando un alumno dice
   que pagó.
4. Aprieta **«Confirmar pago»** (un toque, en web o en RN). Listo.

**El alumno:**
1. Recibe **E1** tres días antes: «Tu plan con {coach} vence el 12 de septiembre» + las instrucciones
   del coach.
2. Paga por fuera (transferencia, efectivo, el link del coach). EVA no interviene.
3. Entra a `/c/[slug]/pagos` (link del correo) y aprieta **«Avisar a mi coach»**: puede escribir una
   nota corta y adjuntar el comprobante (imagen o PDF ≤ 5 MB). También puede avisar desde la app.
4. Ve el estado cambiar a «Avisaste que pagaste — esperando la confirmación de {coach}». **Avisar no
   reactiva nada**: el acceso vuelve cuando el coach confirma. Lo único que hace el claim es
   **posponer el corte hasta 5 días** más allá del fin de la gracia y **callar E2/E3/E4** mientras
   tanto (R3). Forjar un claim compra, como máximo, esos 5 días — y el coach los ve todos los días en
   su recordatorio.

**El botón «Rechazar».** Junto a «Confirmar pago», el coach tiene **«Rechazar»** en toda cuota
`claimed`: la devuelve a `pending`, corta el diferimiento y reanuda el calendario de correos. Es la
salida para el aviso falso o equivocado, y evita que un claim eterno tape la cobranza.

**Lo que este modo garantiza:** funciona sin MercadoPago, sin tarjeta, sin correo del alumno (aunque
conviene tenerlo), y para siempre. Es el piso del producto.

### 6.2 Modo `mp_link` — un link de MercadoPago por ciclo, sin tarjeta guardada

**El coach:**
1. En `/coach/cobros` → «Cómo cobras» → **Conectar Mercado Pago**. Se va a MP, autoriza a «EVA Cobros»
   y vuelve a `/coach/cobros?conectado=1` con la conexión activa («Conectado como @nickname»). Antes
   de esto acepta el **anexo T&C** y declara su RUT e inicio de actividades.
2. En la ficha del alumno elige el modo **«Link de pago»**.
3. No hace nada más. Cinco días antes de cada vencimiento, EVA crea el link con **su** cuenta y se lo
   manda al alumno, con `external_reference = cobro|<coachId>|<clientId>|<chargeId>` — el ref de este
   modo apunta a **la cuota**, porque la preference muere con ella (R10). Cuando el alumno paga, el
   webhook confirma solo.
4. Puede «Reenviar link» desde `/coach/cobros` o desde la ficha, y copiarlo para mandarlo por WhatsApp.

**El alumno:**
1. Recibe **E1-link**: «Tu link de pago de septiembre», con un único botón.
2. **La primera vez** que va a pagar por este riel ve el **aviso previo corto** (R21, §8.4): qué
   contrata (`description` del plan), monto en CLP, quién presta el servicio y responde por él, y que
   EVA no cobra comisión ni retiene la plata. Marca el checkbox y sigue; queda una fila en
   `student_billing_consents` con `kind='first_checkout'`. Las veces siguientes va directo al link.
3. Abre el link → checkout de MercadoPago (débito, crédito, saldo MP, RedCompra) → paga.
4. Vuelve a `/c/[slug]/pagos/retorno`, que hace poll cada 4 s hasta confirmar.
4. Recibe **E5** con el comprobante y la nueva fecha de «pagado hasta».
5. **No deja tarjeta guardada**: el mes siguiente recibe un link nuevo.

**La plata** va directo a la cuenta MP del coach. EVA no usa `marketplace_fee` (D14). La comisión de
MP (~2,9-3,2 % + IVA) la paga el coach, y se le dice por escrito en **C4** al conectar.

### 6.3 Modo `mp_subscription` — suscripción recurrente (preapproval)

**El coach:**
1. Igual que 6.2 pasos 1-2, eligiendo el modo **«Suscripción automática»**.
2. Aprieta **«Invitar a suscribirse»**: EVA crea el preapproval con
   `external_reference = cobro|<coachId>|<clientId>|<planId>` — acá el ref apunta al **plan**, porque
   es inmutable y la suscripción vive N cuotas (R10) —, le manda el correo al alumno y le muestra al
   coach el link y un QR para mandarlo por WhatsApp. Cada `authorized_payment` que llegue después se
   imputa a la cuota **por período** (la fecha de cobro dentro de `[period_start, period_end]`; si esa
   cuota no existe todavía, se crea).
3. Cuando el alumno autoriza, el coach recibe **C3** y el alumno queda en «Automático · próximo cobro
   el 12 de octubre». Desde ahí el coach no toca nada nunca más.

**El alumno:**
1. Abre el link y ve primero el **aviso legal previo** (§8.4): precio total en CLP, periodicidad, día
   del cobro, que puede cancelar con un botón cuando quiera, que **EVA no cobra ni retiene** y que
   quien responde por el servicio es el coach. Marca el checkbox («soy mayor de 18 y autorizo el cobro
   periódico») y aprieta **«Continuar a Mercado Pago»**.
2. En MP ingresa su tarjeta y autoriza. Vuelve al retorno.
3. Recibe **E6**: la confirmación escrita del contrato, obligatoria por el art. 12 A de la Ley 19.496.
4. Cada ciclo MP cobra solo y el alumno recibe **E5**. Si el cobro falla recibe **E8**.
5. Puede **darse de baja solo**, con un botón en `/c/[slug]/pagos`. Conserva el acceso hasta
   `paid_through` y después queda en `ended` (§5.1). Ese botón sigue vivo aunque el módulo se apague
   (§5.4): mientras MP le cobre, EVA le deja la salida abierta.

**El choque de relojes, resuelto.** MP reintenta un cobro rechazado hasta 4 veces en 10 días y cancela
la suscripción sola tras 3 cuotas rechazadas; la gracia de EVA es 0 o 3 días. **No se inventa un estado
`recycling`** (DECISIONS-2): en `mp_subscription` el corte ocurre al terminar la gracia, exactamente
igual que en los otros dos modos, y si MP recupera el cobro después, el webhook lo confirma y **el
acceso vuelve solo** (R1/R12). Un motor con una regla es explicable; uno con un reloj distinto por
modo, no.

Lo único que cambia es el **copy del banner mientras corre la gracia en este modo**, porque el alumno
no tiene nada que apretar: «**Mercado Pago está reintentando tu cobro. Puedes actualizar tu tarjeta en
tu cuenta de Mercado Pago.**» — sin botón de pago, en web y en la app.

---

## 7. Superficies — WEB del COACH

Regla transversal: todos los estados de cobro se pintan con el componente `Badge` del DS
(`apps/web/src/components/ui/badge.tsx`, API `tone × variant × size`, tonos
`neutral|sport|ember|success|warning|danger|info|aqua`). **No** se repite el drift del
`RevenueSheet.tsx:112-126`, que usa `emerald-500`/`orange-500` crudos en vez de los tokens.

**Vocabulario de estados, cerrado y único para toda la app:**

| Etiqueta | Tono `Badge` | Cuándo |
|---|---|---|
| `Al día` | `success` | derivado `ok` |
| `Por vencer` | `info` | derivado `due_soon` |
| `Vencido` | `warning` | derivado `due`, con gracia corriendo |
| `En gracia` | `warning` | variante de `Vencido` cuando el coach quiere ver el reloj |
| `Cortado` | `danger` | derivado `unpaid` |
| `Terminado` | `neutral` | derivado `ended` (plan `canceled` pasado `paid_through`) — no es una deuda, es una relación que se acabó |
| `Avisó que pagó` | `aqua` | cuota `claimed` (con el reloj «se corta el X» al lado, R3) |
| `Automático` | `sport` | modo `mp_subscription` con suscripción `authorized` |
| `Sin cobro` | `neutral` | alumno sin plan |
| `Deshecho` | `neutral` | confirmación deshecha por el coach (§5.5); la cuota volvió a `pending` |
| `Reembolsado` | `warning` | cuota `refunded` (§5.5); `paid_through` retrocedió |
| `Contracargo` | `danger` | cuota `charged_back` (§5.5); `paid_through` retrocedió |
| `Duplicado` | `info` | pago con `status='duplicate'`; no movió `paid_through` |

### 7.1 Herramientas — la puerta de entrada

**Archivo:** `apps/web/src/app/coach/tools/_components/ToolsHub.tsx` (482 líneas). Hoy tiene
`TOOLS: ToolDef[]` (`:54-79`) con Cardio, Movimiento y Composición (`scope: 'student'`) y `PLAN_TOOL`
(`:82-89`, Intercambios). El tipo `ToolDef` (`:43-51`) exige `key: ModuleKey`.

**Qué se agrega.** Una sección nueva **«Tu negocio»** con una sola tarjeta. **No se toca `ToolDef` ni
se ensancha `ModuleKey`** (R20): Cobros no es un add-on de `coach_addons`, es una capacidad de tier, y
forzarlo dentro del tipo de los módulos comprables es lo que haría que la tarjeta se pinte «activa»
por tener el add-on equivocado. En su lugar:

- Un array **`BUSINESS_TOOLS: BusinessToolDef[]`** con su **propio tipo** (`key: 'cobros'`, `href`,
  `icon`, `title`, `value`), hermano de `TOOLS` y `PLAN_TOOL`, y su propia sección «Tu negocio» en
  `ToolsHub.tsx` (y el espejo en el hub RN).
- Ícono `Receipt` (lucide), título **«Cobros»**, `value`: «Cobra a tus alumnos: vencimientos,
  recordatorios y corte automático.», `href: '/coach/cobros'`.
- **`active` se calcula con `resolveCobrosAccess`** —tier + flag de beta + kill-switch—, **nunca** con
  los add-ons comprados: un coach Pro dentro de la allowlist entra; uno fuera de ella ve la tarjeta
  inactiva aunque tenga todos los add-ons del mundo.
- Se renderiza con el mismo `ModuleHubCard` (`:120`) y el mismo `ROW_BASE`/`ROW_INTERACTIVE`
  (`:97-101`) que las demás, para que no se note el injerto.

**Estados.** Coach **Pro** con el módulo activo: tarjeta interactiva. Coach **Pro** sin activar: misma
tarjeta con un chip «Configurar». Coach **Pro fuera de la allowlist de la beta**: tarjeta inactiva con
«Cobros está en prueba con un grupo de coaches» (no dice «mejora tu plan»: ya lo tiene). Coach
**Free**: tarjeta inactiva bajo el `SectionTitle` «Incluido en los planes pagos» (`:414`), exactamente
como hoy se muestran los módulos no comprados. Coach `managed` (team): tarjeta inactiva con «Pídele al
owner de tu equipo que active el módulo» (el copy ya existe en `:411`).

### 7.2 `/coach/cobros` — el panel

Ruta nueva (`apps/web/src/app/coach/cobros/page.tsx`; verificado que **no existe**: `ls
apps/web/src/app/coach/` no la lista). Server page + islas cliente. `max-w-[1600px] space-y-8`, el
mismo contenedor de la ficha del alumno.

**Anatomía, de arriba a abajo:**

1. **Header.** Título «Cobros» en `font-display font-black tracking-tighter`, bajada «Lo que te deben
   tus alumnos este mes». A la derecha, el chip de estado de MercadoPago: `Conectado como @nick`
   (tono `success`) · `Conectar` (botón `sport`) · `Reconectar` (tono `danger`, cuando el refresh
   falló).
2. **Cuatro KPIs del mes** (fila de tiles, molde `KpiStrip.tsx:20-27` del dashboard, con
   `formatCurrency` es-CL y `tabular-nums`):
   `Cobrado $X` · `Por cobrar $Y (N alumnos)` · `Vencido $Z (M alumnos)` · `Automático 40 %`.
   El tile de «Vencido» es clickeable y aplica el filtro.
3. **Tabla del mes.** Columnas: `Alumno` · `Modo` (ícono + palabra: `Transferencia`/`Link`/
   `Automático`) · `Monto` · `Vence` · `Estado` (el `Badge` del vocabulario de arriba) · `Acción`.
   La acción es contextual: `Confirmar` (manual/claimed) · **`Rechazar`** (solo `claimed`, R3) ·
   `Reenviar link` (mp_link) · `Ver` (todos). En una fila `claimed` el estado dice además hasta cuándo
   corre el diferimiento («Avisó hace 2 días · se corta el 20 de septiembre»).
   Fila clickeable → ficha del alumno, pill Pagos. Orden por defecto: **vencidos primero**, luego por
   `due_on` ascendente (el mismo criterio que ya usa `RevenueSheet.tsx:31-34`).
   Filtros: `Todos` · `Por cobrar` · `Vencidos` · `Avisaron` · `Automáticos`. Buscador por nombre.
   Deep links desde los correos: `?alumno=<id>` (abre la fila) y `?filtro=vencidos`.
4. **«Cómo cobras»** (panel lateral en desktop, acordeón arriba en móvil):
   - Estado de MercadoPago con el botón de conectar/desconectar y la advertencia legal.
   - **Instrucciones de transferencia** (textarea ≤ 600, con preview de cómo lo ve el alumno).
   - **Mi link de pago** (input url validado).
   - **Gracia por defecto**: `segmented-control` con dos opciones, `Sin gracia (0 días)` y
     `3 días` (default). Texto de apoyo: «Cuando se acaba la gracia, el alumno pierde el acceso hasta
     que pague.»
   - **Recordatorio**: `Input type=number` de días antes (default 3).
   - **Avisos por correo**: dos `Switch` — «Avísame cuando reciba un pago» y «Resumen diario».
5. **Primer uso (onboarding de 3 pasos).** Si `coach_billing_settings.enabled = false`, la página
   reemplaza todo por un stepper de 3 tarjetas, molde `AddStudentStepper.tsx:609-616`
   (`grid gap-4 md:grid-cols-3`, card `rounded-card border border-subtle bg-surface-card p-4` con
   `StepHead`):
   1. **«Lo legal primero»** — RUT + checkbox «Tengo inicio de actividades vigente y emito boleta por
      mis servicios» + aceptación del anexo T&C «Cobros» (link al texto). Sin esto no sigue.
   2. **«Cómo cobras»** — instrucciones de transferencia y/o conectar MercadoPago.
   3. **«Actívalo en tus alumnos»** — lista de alumnos con un botón «Activar cobro» por fila.

**Estados vacíos y de error.**

| Situación | Qué se ve |
|---|---|
| Módulo activo, cero planes | Card centrada: «Todavía no le cobras a nadie por acá» + «Activa el cobro en la ficha de un alumno y EVA se encarga de recordar, cortar y reactivar.» + botón «Ver mis alumnos». Molde: el estado vacío que vende de `ToolsHub.tsx:389-411` |
| Hay planes, nada vence este mes | Tabla vacía con «Nada por cobrar este mes. Tus {N} alumnos están al día.» (tono celebratorio, no de error) |
| Filtro sin resultados | «Ningún alumno coincide con estos filtros.» + botón «Limpiar filtros» (copy 1:1 con `clientes.tsx:874-875`) |
| MP conectado pero el token expiró | Banner `danger` arriba de la tabla: «Mercado Pago se desconectó. Los cobros automáticos están en pausa hasta que vuelvas a conectar.» + botón «Reconectar». **No corta a nadie** |
| Coach dejó de ser Pro | Toda la página en modo lectura con banner `warning`: «Cobros es parte de los planes pagos. Tus alumnos no perdieron el acceso; el motor está en pausa.» |
| Error de carga | `ErrorState` estándar con «Reintentar» |
| Cargando | Skeletons de KPI + 5 filas (`skeleton.tsx` del DS) |

### 7.3 Ficha del alumno → pill «Pagos»

**Dónde.** `apps/web/src/app/coach/clients/[clientId]/ProfileTabNav.tsx:13-19` define hoy 5 pills:
`overview→Resumen`, `progress→Progreso`, `workout→Entreno`, `program→Programa`,
`nutrition→Nutrición`. Se agrega la **sexta**: `payments→Pagos`. El tipo `ProfileMainTabId` (`:21`) se
deriva solo del array. La rama de render va en `ClientProfileDashboard.tsx` (el `activeTab` vive en
`useState`, cambia con `startTransition`).

**Estilo, ya definido por el componente:** barra `sticky z-20` full-bleed con backdrop
`color-mix(surface-app 80%)` + `blur(12px)`; pills de 38 px, `rounded-pill border-[1.5px] px-3.5
text-[13.5px] font-bold`; activa `border-sport-500 bg-sport-500 text-[var(--text-on-sport)]`.
La pill «Pagos» puede llevar el badge circular de 18 px con `'!'` (`bg-[var(--danger-500)]`) cuando el
alumno está `unpaid` o tiene un claim sin confirmar.

**Carga diferida, obligatoria.** La pestaña de facturación existió y **se borró** justamente por su
costo: `ClientProfileDashboard.tsx:20-22` («`BillingTabB8` quedó sin importadores y se borró en la
poda 2026-07-29») y `client-detail.service.ts:146-150` («se pagaba en CADA carga de ficha y de
panel»). El plan **no repone la lectura en el bundle**: los datos se traen al abrir la pill, por route
handler (`GET /api/cobros/clients/[clientId]/plan`).

**Anatomía del contenido:**

1. **Bloque «Plan de cobro»** (card `rounded-card border border-subtle bg-surface-card p-4`):
   - Monto grande `text-3xl font-black tabular-nums` + «cada mes» (nunca «/mes»).
   - Fila de metadatos: modo con ícono · gracia · **«Pagado hasta el 12 de septiembre»** · «Próximo
     vencimiento: 12 de octubre» · `Badge` de estado.
   - Acciones en fila: `Confirmar pago` (primaria, `sport`) · `Enviar link` (solo `mp_link`) ·
     `Invitar a suscribirse` (solo `mp_subscription`) · `Editar` · `Pausar` · `Cancelar` (destructiva,
     con `alert-dialog` de confirmación que dice explícitamente si es irreversible).
2. **Historial** — molde exacto del `FacturacionTab` de RN que ya está escrito
   (`apps/mobile/components/coach/clientDetail/FacturacionTab.tsx`): tres métricas arriba
   (`Total cobrado` · `Último pago` · `Próx. vencimiento`), y una lista de filas con punto de color por
   estado, monto en display bold, `Badge` de estado, y subtítulo `12 sep 2026 · Mensualidad · 1 mes`.
   A la derecha, miniatura 38×38 del comprobante si hay, y la **fuente** del pago (`Transferencia`,
   `Link MP`, `Automático`, `Registrado a mano`). **No hay «Borrar pago» en ninguna fila con
   `charge_id`** (R8): el ícono de borrar sobrevive solo en los pagos legacy sin cuota detrás. En su
   lugar, el menú `⋮` de la **última** confirmación de una cuota, y solo dentro de **7 días**, ofrece
   **«Deshacer confirmación»** (§5.5): `alert-dialog` que pide motivo, advierte «El alumno vuelve a
   quedar con esta cuota pendiente y su acceso se recalcula» y avisa que queda registrado. Pasados los
   7 días el ítem no aparece. Las filas revertidas por MP se muestran con el badge `Reembolsado` o
   `Contracargo` (`paid_through` **ya retrocedió**, R9) y las duplicadas con `Duplicado` y la nota
   «devuélvelo desde tu panel de Mercado Pago».
3. **Eventos** (colapsado, `<details>`): bitácora legible de `student_payment_events` — «12 sep 09:03
   · Recordatorio enviado», «15 sep 14:22 · El alumno avisó que pagó», «15 sep 18:40 · Pago
   confirmado por ti».

**Sin plan (estado vacío).** Card con ícono `HandCoins`, título «Este alumno no tiene cobro activado»,
bajada «Define cuánto y cada cuánto te paga. EVA le recuerda, le corta si no paga y lo reactiva cuando
confirmas.» y un **formulario inline** de 6 campos (mismo grid pill de
`QuickAddPaymentModal.tsx`): `Monto` (number, placeholder `CLP`) · **`Qué le cobras`** (text ≤ 140,
**obligatorio**, default «Asesoría online mensual» — es `description`, R21, y es lo que el alumno lee
en E0/E5/E6) · `Cada` (select: mes / quincena / trimestre / pago único) · `Primer vencimiento` (date,
default: hoy + 1 mes) · `Modo` (radios como tarjetas, molde del paso 2 de `AddStudentStepper`) ·
`Gracia` (segmented 0/3, prellenado con el default del coach). Botón `Activar cobro`.

Debajo del campo de fecha, una línea que dice exactamente lo que va a pasar, porque es la regla de R2:
«**Tu alumno tiene acceso hasta el 12 de octubre; después corren los 3 días de gracia y se corta.**»
(`paid_through` se inicializa en ese primer vencimiento).

**Badge en el hero.** El hero (`ClientProfileHero.tsx:287-390`) tiene un grid 2×2 de `HeroStatChip`
que es «sin hueco impar» por diseño (comentario en `:343`), así que **no** se agrega un quinto chip:
el estado de cobro va como **segundo `Badge` junto al de estado** (`:309-316`).

**Ojo: la ficha vive dos veces.** `/coach/clients/[clientId]/page.tsx` y `CoachFichaPanel.tsx` (el
master-detail, con su propio bundle `_data/ficha-panel.data.ts`). La pill se cablea en los dos.

### 7.4 Alta del alumno

`AddStudentStepper.tsx` (855 líneas): el paso 1 tiene un `<details>` con summary literal `Opcional`
(`:665-693`) que hoy esconde `Teléfono (WhatsApp)` y **`Inicio de mensualidad`** (`:683-692`).

Con el módulo activo, ese `<details>` pasa a llamarse **«Cobro (opcional)»** y contiene el mismo
formulario inline de 6 campos de §7.3. **`subscription_start_date` deja de mostrarse** en el alta web
(la columna sigue existiendo y sigue alimentando el «Desde marzo 2026» del hero; simplemente ya no se
pide, porque el primer vencimiento del plan la reemplaza como dato accionable).

### 7.5 Dashboard del coach

- **Tarjeta «Cobros del mes».** Evoluciona el «Panel de ingresos» actual
  (`RevenueSheet.tsx`, abierto desde el KPI «Ingresos del mes» de `KpiStrip.tsx:20-27`). El sheet
  mantiene el monto grande + delta + «Mes anterior: $X», y **agrega** debajo una línea
  «**Por cobrar: $Y · N alumnos**» y un botón «Ver cobros» → `/coach/cobros`. Los badges del sheet
  (`Sin pago`/`Al día`/`Vencido`, `:106-127`) se migran al `Badge tone=` del DS y se amplían con
  `En gracia`, `Cortado` y `Avisó que pagó`.
- **`+ Pago` en la barra de acciones rápidas.** `QuickActionsBar.tsx:56-66` (botón pill con ícono
  `Receipt`, cuarto de la fila) sigue existiendo, pero abre el **`ConfirmPaymentDialog` nuevo**: elige
  alumno → si tiene plan, muestra la cuota pendiente y confirma en un toque; si no tiene plan, cae al
  formulario libre de hoy (`QuickAddPaymentModal`, 5 campos) para no perder la función. **El espejo RN
  de este botón se recablea igual** (§9.1): dejar uno de los dos sin recablear es cortarle el acceso a
  un alumno que ya pagó.

### 7.6 Roster de alumnos

- **Chip de cobro** en la tabla (`DesktopRosterTable.tsx`, columnas en `:434-440`) y en las tarjetas
  (`DirRowCard.tsx`). Ojo: el `STATUS_META` actual (`:51-70`) es de **actividad**
  (`Al día`/`En riesgo`/`Atrasada`) y `rosterStatus(pulse)` (`:75-82`) no mira pagos — un moroso hoy
  aparece «Al día». El chip de cobro es **una columna aparte, «Pagos»**, no un cambio del estado
  existente, para no romper la semántica que el coach ya aprendió.
- **Filtro «Por cobrar»**: entrada nueva en `DirectoryRiskFilter` (`directory-types.ts:1-8`), su label
  en `DirectoryActionBar` (`riskLabels`, `:150-168`) y su espejo RN en
  `directory-shared.ts:158-167`.
- **Acción rápida** «Confirmar pago» en `ClientActionsSheet.tsx` (el menú `⋮` reusado por el
  directorio y la ficha; ítems en `:160-226`).
- **CSV**: columna `Pagos` en el header de export (`DesktopRosterTable.tsx:309`).

### 7.7 Puente WhatsApp (solo web)

Botón **«Cobrar por WhatsApp»** en la fila de la tabla de `/coach/cobros` y en la pill Pagos: arma
`https://wa.me/<tel>?text=<plantilla>` con el monto, el vencimiento y el link o las instrucciones. La
plantilla es editable en los ajustes. **En RN esto no existe con monto** (§10, mensaje 10).

---

## 8. Superficies — WEB del ALUMNO

Inventario verificado del árbol del alumno (`ls apps/web/src/app/c/[coach_slug]/`): `dashboard`,
`perfil`, `check-in`, `workout`, `workout-history`, `nutrition`, `nutrition-v2`, `movimiento`,
`bodycomp`, `exercises`, `onboarding`, `login`, `change-password`, `suspended`, `page.tsx`,
`layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `_components`, `_data`.
**No existe** `pagos` (verificado: `ls .../pagos` → «No such file or directory»).

### 8.1 `/c/[coach_slug]/pagos` — «Mi plan con {coach}» (ruta nueva)

Página server + islas cliente, dentro del layout del alumno (o sea: hereda marca, tipografía, sello y
navegación). Contenedor `mx-auto max-w-2xl px-4` (el mismo ancho que usan los banners del layout,
`layout.tsx:449`).

**Anatomía:**

1. **Tarjeta de estado** (la pieza grande). Ícono + titular según el estado derivado:
   - `ok` → `CheckCircle` verde · «Estás al día» · «Tu plan está pagado hasta el **12 de septiembre**.»
   - `due_soon` → `Clock` info · «Tu plan vence el 12 de septiembre» · «Te quedan 3 días.»
   - `due` → `AlertTriangle` warning · «Tu plan venció el 12 de septiembre» · «Tienes hasta el **15 de
     septiembre** para pagar. Tu acceso sigue funcionando normal hasta esa fecha.»
   - `unpaid` → `Pause` danger · «Tu acceso está en pausa» · «Tu progreso está guardado y te espera.»
   - `ended` → `Flag` neutral · «**Tu plan con {coach} terminó**» · «Tuviste acceso hasta el 12 de
     septiembre. Escríbele a {coach} si quieres volver.» **Sin botón de pago** (no hay cuota que
     pagar: el plan está cancelado) y sin la palabra «deuda».
   - `ok` con el plan **cancelado** → «Tu plan termina el 12 de septiembre» · «Hasta esa fecha usas
     todo normal.» Sin CTA de pago.
   - `off` → la página no se muestra en el menú; si se entra directo, «Tu coach no tiene cobros
     activados por acá.» **Salvo** que exista una suscripción viva (`student_subscriptions` en
     `authorized`/`pending`): ahí la página se sirve **siempre**, en «modo mínimo» (§5.4), aunque el
     plan esté `off`, el coach sea Free, el módulo esté apagado o el kill-switch encendido.
2. **Monto y periodicidad**: «$45.000 cada mes» + el modo en lenguaje humano («Pagas por
   transferencia» / «Pagas con un link de Mercado Pago» / «Se cobra automático a tu tarjeta»).
3. **Botón principal**, uno solo, según el modo:
   - `manual` → **«Ver cómo pagar»** → hoja (`sheet.tsx` del DS) con las instrucciones de
     transferencia del coach, el link propio si lo hay, y el bloque **«Avisar a mi coach»**: textarea
     de nota ≤ 280 y adjuntar comprobante (imagen o PDF ≤ 5 MB) → botón «Avisar que pagué». Después
     de avisar, la tarjeta dice qué compró ese aviso: «Le avisamos a {coach}. Tu acceso sigue
     funcionando hasta el 20 de septiembre mientras él confirma.» (R3: difiere, no reactiva).
   - `mp_link` → **«Pagar ahora»** → la **primera vez**, aviso previo corto (§8.4) → `POST
     /api/cobros/checkout` → redirección al `checkout_url`.
   - `mp_subscription` sin suscripción → **«Suscribirme»** → aviso legal previo (§8.4) → `init_point`.
   - `mp_subscription` con suscripción viva → sin botón de pago; solo «Próximo cobro: 12 de octubre».
4. **La salida del alumno** — link discreto abajo (nunca un botón rojo grande), con el nombre que le
   corresponde a cada modo: **«Dar de baja mi plan»** en `manual` y `mp_link` (no hay ninguna
   suscripción que cancelar) y **«Dar de baja mi suscripción»** en `mp_subscription`. Abre
   `alert-dialog`: «Si te das de baja, tu acceso sigue hasta el 12 de septiembre y después termina.
   Puedes volver cuando quieras, hablando con {coach}.» + selector opcional de motivo + `Dar de baja` /
   `Mejor no`. En `mp_subscription` el diálogo agrega, porque es irreversible: «Esto cancela el cobro
   automático en Mercado Pago. Para volver al automático hay que autorizarlo de nuevo.»
   Efectos en T14: se cancela el preapproval en MP **antes** de escribir el plan (R5), el alumno recibe
   **E7** y el coach su aviso; el acceso vive hasta `paid_through` y después queda en **`ended`**, sin
   gracia (§5.1).
   **Modo mínimo** (§5.4): cuando la página se sirve solo porque hay un preapproval vivo, esta es la
   única acción, acompañada del estado del cobro («Mercado Pago te cobra $45.000 el 12 de cada mes»)
   y —si EVA ya no tiene token del coach— del paso a paso para darlo de baja en la app de Mercado
   Pago.
5. **Historial** — lista simple con `divide-y`: fecha, monto, modo, y link «Ver comprobante» cuando
   existe. Vacío: «Todavía no hay pagos registrados.»
6. **«Recibir recordatorios»** — `Switch` que escribe `reminder_opt_out_at`. Solo apaga **E1**; los
   correos de vencimiento y corte son transaccionales del contrato y no se pueden apagar.

**Estados de error:** claim ya enviado hoy («Ya le avisaste a {coach} hace 2 horas. Te avisamos apenas
lo confirme.»), rate limit (3 claims/día), archivo demasiado grande, y fallo de creación del checkout
(«No pudimos generar el link. Intenta de nuevo en unos minutos o escríbele a {coach}.»).

### 8.2 Banner en el layout del alumno

**Archivo:** `apps/web/src/app/c/[coach_slug]/layout.tsx`. Ya tiene el patrón exacto: lee headers del
proxy en `:201-205` (`studentAccessState = headersList.get(STUDENT_ACCESS_STATE_HEADER)`,
`isStudentGrace` en `:202`, `isStudentReadonly` en `:203`, `isOrphan` en `:205`) y pinta tres banners
dentro de `<main>`, en `:448-475`, cada uno con el mismo chasis:
`<div className="mx-auto mt-3 max-w-2xl px-4 pt-safe">` + `rounded-xl border … px-4 py-3 text-sm`
con `role="status"`, usando **rampas DS fijas, nunca white-label**: `info-*` para la gracia
(`:451-453`), `warning-*` para el modo solo-lectura (`:459-464`) y ámbar para el huérfano (`:468-471`).

**Qué se agrega:** un cuarto banner, hermano de esos tres, alimentado por un header nuevo
`x-student-billing-state`:

- `due_soon` → tono `info`: «Tu plan con {coach} vence el 12 de septiembre.» + link «Ver mi plan» →
  `/c/[slug]/pagos`.
- `due` → tono `warning`: «**Tu plan venció el 12 de septiembre.** Tienes hasta el 15 para pagar.» +
  botón «Pagar» o «Ver cómo pagar» según el modo.
- `due` en modo **`mp_subscription`** → tono `warning`, copy propio y **sin botón de pago** (el alumno
  no tiene nada que apretar en EVA): «Mercado Pago está reintentando tu cobro. Puedes actualizar tu
  tarjeta en tu cuenta de Mercado Pago.»
- `due` **con claim vivo** → tono `info`: «Le avisaste a {coach} que pagaste. Tu acceso sigue hasta el
  20 de septiembre mientras él confirma.» (R3).
- `ok` con el plan **cancelado** → tono `info`: «Tu plan con {coach} termina el 12 de septiembre.» Sin
  CTA de pago.
- `unpaid` / `ended` → **no hay banner**: el proxy ya redirigió a
  `/suspended?reason=unpaid|ended`.

**Precedencia entre banners** (importante, porque pueden coincidir): el del coach moroso con EVA
(`readonly`/`grace`) **gana siempre** sobre el de cobros. Si el coach no le paga a EVA, hablarle al
alumno de su propia deuda es ruido.

### 8.3 `/c/[coach_slug]/suspended?reason=unpaid` y `?reason=ended`

**Archivo:** `apps/web/src/app/c/[coach_slug]/suspended/page.tsx` (147 líneas). Hoy acepta
`searchParams.reason` (`:10`, `:15`) con tres ramas verificadas: `coach` (bloqueo total post-gracia,
diseño v3.3 con avatar del coach, `:26-95`), `archived` (`:104-105`) y el default «pausado»
(`:106-110`). El chasis del default es: tile 80×80 `bg-[var(--warning-100)]` con `Pause` (`:114-116`),
`h1` **«Acceso pausado»** (`:117-119`), cuerpo, subtexto «Todos tus progresos y datos están a salvo.»
(`:123-125`), botón WhatsApp al coach si hay `coachData.whatsapp` (`:128-138`) y
`SuspendedSignOutButton` (`:140-143`).

**Qué se agrega:** **dos** ramas nuevas, `reason === 'unpaid'` y `reason === 'ended'`, reusando el
chasis del default. Son dos causas distintas y **el copy tiene que decir cuál es** (invariante 5).

`reason === 'unpaid'` (hay una cuota impaga, tiene remedio hoy):

- `h1`: «Tu acceso está en pausa»
- Cuerpo: «Tu plan con **{brandName}** venció el 12 de septiembre.»
- Subtexto: «Tu progreso está guardado y te espera.»
- **Botón primario (web SÍ puede)**: `Pagar ahora` (modos MP) o `Ver cómo pagar` (manual) →
  `/c/[slug]/pagos`. Es la diferencia clave con la app nativa (§10).
- Botón secundario: `Escribir a mi coach` (WhatsApp), con el mismo `wa.me` de `:130`.
- `SuspendedSignOutButton` sin cambios.

`reason === 'ended'` (el plan está cancelado y ya pasó `paid_through`, R1):

- `h1`: «**Tu plan con {brandName} terminó**»
- Cuerpo: «Tuviste acceso hasta el 12 de septiembre.»
- Subtexto: «Tu progreso está guardado y te espera.»
- **Sin botón de pago**: no hay cuota que pagar. El primario es `Escribir a mi coach` (WhatsApp) y
  debajo, en secundario, `Ver mi plan` → `/c/[slug]/pagos` (historial + la salida en modo mínimo si
  quedara algún preapproval vivo).
- `SuspendedSignOutButton` sin cambios.

Tono: **nunca culpa al alumno**, nunca usa la palabra «moroso» ni «deuda», y no muestra el monto en el
titular (el monto vive en `/pagos`).

**Las dos ramas se construyen en la misma tarea, no una sola.** El proxy ya redirige con
`reason = billing.state` (`'unpaid' | 'ended'`), así que si solo se implementa `unpaid`, el alumno
`ended` cae en el default «Acceso pausado» y el QA de device queda probando una pantalla que nadie
construyó. Vale igual en RN: `STUDENT_ACCESS_COPY.blockScreen` necesita **`unpaid` y `ended`**, y el
test de espejo web↔RN cubre los **seis** estados derivados, `ended` incluido.

### 8.4 Aviso previo (pantalla legal) — versión completa y versión corta

Hay **dos**, no una (R21). La diferencia no es cosmética: en `mp_subscription` el alumno autoriza a que
le debiten **para siempre**, y en `mp_link` autoriza **un pago**. Las dos dejan fila en
`student_billing_consents` (`kind = 'subscription' | 'first_checkout'`, `terms_version`,
`consented_at`, `ip_hash`, `user_agent`), que es la evidencia con la que el coach se defiende de un
contracargo.

**Versión corta — primer checkout de `mp_link`** (solo la primera vez que ese alumno paga por este
riel; después va directo al link). Media pantalla, cuatro líneas y un checkbox:

- «Vas a pagar **$45.000** a **{coach}** por **{description del plan}**.»
- «El servicio lo presta {coach} y él responde por él. **EVA no cobra comisión ni retiene tu
  dinero**: la plata va directo a su cuenta de Mercado Pago.»
- «{coach} es quien emite el documento tributario.»
- **Checkbox** (obligatorio): «Entiendo y quiero pagar.» + botón `Continuar a Mercado Pago`.

**Versión completa — modo `mp_subscription`.** Pantalla intermedia obligatoria entre «Suscribirme» y
MercadoPago. Exigida por la Ley 19.496 (art. 12 A) y la Ley 21.398. Card única, texto legible, sin
diseño publicitario:

- **Qué contratas**: «{coach} te va a cobrar **$45.000 cada mes** por **{description del plan}**.»
- **Cuándo**: «El primer cobro es hoy. Después se cobra el 12 de cada mes.»
- **Cómo cancelas**: «Cancelas cuando quieras, con un botón en esta misma página. Sin llamar, sin
  escribir a nadie.»
- **Quién responde**: «El servicio lo presta {coach}. Si tienes un problema con el cobro o quieres un
  reembolso, habla con {coach}. **EVA no cobra comisión ni retiene tu dinero**: la plata va directo a
  la cuenta de {coach} en Mercado Pago.»
- **Boleta**: «{coach} es quien emite el documento tributario por su servicio.»
- **Checkbox** (obligatorio): «Soy mayor de 18 años y autorizo el cobro periódico.»
- **Derecho a retracto** (texto estándar, marcado «VALIDAR CON ABOGADO» en TESTING-LEGAL): «Tienes
  derecho a retractarte dentro de 10 días desde la contratación si el servicio aún no comenzó. Al usar
  tu plan antes de ese plazo, aceptas que el servicio comience de inmediato.»
- Botón `Continuar a Mercado Pago` + link `Volver`.

Se guarda evidencia de la autorización en `student_billing_consents`: `kind='subscription'`,
timestamp, `terms_version`, `ip_hash` y `user_agent` (defensa del coach ante un contracargo). El
paquete se exporta en CSV desde admin, se retiene **24 meses** (más que los 6 meses de ventana de
contracargo) y **se excluye de `purge-data`**.

### 8.5 `/c/[coach_slug]/pagos/retorno`

Molde `flow-processing` ya existente: poll cada 4 s durante 60 s. Tres desenlaces:

- **Aprobado**: check verde, «Listo, tu pago se registró» + «Tu plan está pagado hasta el 12 de
  octubre» + botón «Volver a mi entrenamiento».
- **Pendiente** (transferencia MP, cupón): reloj, «Mercado Pago está procesando tu pago» + «Te
  avisamos por correo apenas se confirme» + botón volver.
- **Rechazado**: «El pago no se pudo completar» + «Intenta con otro medio de pago o escríbele a
  {coach}» + botón reintentar.

### 8.6 Proxy: dónde entra el gate nuevo

**Archivo:** `apps/web/src/proxy.ts`. El bloque del alumno hoy hace, en orden: setea el header de
gracia del gate del coach (`:1370-1373`), y luego **bloquea por archivado o pausado** —
`const isBlocked = client.is_archived === true || client.is_active === false` (`:1377`) → redirect a
`/c/${coachSlug}/suspended?reason=archived|paused` (`:1378-1383`) —, y después el forzado de cambio de
contraseña (`:1386-1391`).

**Qué se agrega**, respetando la precedencia:

1. `readonly` (coach moroso con EVA, bloqueo total) — **ya existe, gana sobre todo**.
2. `archived` / `paused` (`is_active`/`is_archived`) — **ya existe, no se toca**.
3. **`unpaid` (nuevo)** → `redirect /suspended?reason=unpaid`, **salvo** en las rutas permitidas:
   `/pagos`, `/pagos/retorno`, `/suspended`, `/login`, `/change-password`.
4. **`ended` (nuevo, R1)** → `redirect /suspended?reason=ended`, con las mismas rutas permitidas.
   Corta igual que `unpaid`, pero el copy es otro (§8.3).
5. **`due` (nuevo)** → no redirige: setea el header `x-student-billing-state` para el banner.

El header `x-student-billing-state` transporta el estado derivado completo (`ok|due_soon|due|unpaid|
ended`, más un `off` implícito por ausencia), no un booleano: el layout necesita distinguir `due` con
claim vivo, `due` en modo automático y `ok` con plan cancelado para elegir banner (§8.2). La consulta
del plan es la **segunda** query service-role del proxy, en `try/catch` **fail-open**, nunca embebida
en el SELECT de identidad (R15): un 42501 ahí dejaría al alumno fuera de la app entera.

Los árboles `/e` (enterprise) y `/t` (pool) **no cambian**: el módulo es solo-standalone (D13).

### 8.7 Dashboard y perfil del alumno: dónde entra el enlace

**Dashboard** (`apps/web/src/app/c/[coach_slug]/dashboard/page.tsx`, 180 líneas). El orden de la
columna móvil es: `OrgAnnouncementBanner` (si hay anuncios) → `DashboardHeader` → `StreakRibbonSection`
→ `CheckInBanner` → `HeroAndComplianceGroup` → **`CoachPresenceCard`** → `MomentumCard` →
«Tu programa» → «Peso y records» → historial → hábitos → nutrición. **El dashboard no tiene slot
propio de banner de estado**: los banners de acceso viven en el layout (§8.2), que es lo correcto
porque se ven en todas las pantallas del alumno, no solo en el inicio.

**Decisión del writer:** el dashboard **no recibe ninguna pieza nueva**. El estado de cobro se
comunica por el banner del layout (que ya cubre el dashboard) y por la página `/pagos`. Meter una
tarjeta de plata en el inicio del alumno contamina la pantalla que el owner quiere que sea sobre
entrenar, y duplica un mensaje que el banner ya da. (Si el jefe la quiere igual, el lugar natural es
dentro de `CoachPresenceCard` — la card que ya representa «tu coach» —, no una card suelta.)

**Perfil** (`apps/web/src/app/c/[coach_slug]/perfil/page.tsx` → `_components/ProfileClient.tsx`, 500
líneas). Estructura verificada: dos `StatCard` (Entrenos / Racha, `:293-294`) → `SectionTitle`
«Apariencia» (`:318`) → «Preferencias» (`:327`) → «Módulos» (`:352`, con dos `Row` a Movimiento y
Composición) → **«Cuenta»** (`:394`) con `Row leadingIcon={History} title="Historial de entrenos"`
(`:396`), «Ayuda» (`:398`) y el salir (`:400`).

**Qué se agrega:** un `Row` en la sección **«Cuenta»**, justo encima de «Historial de entrenos»:
`leadingIcon={Receipt}`, `title="Mi plan y pagos"`, `subtitle` = el estado en una línea («Al día hasta
el 12 de septiembre» / «Vence el 12 de septiembre» / «En pausa»), `href={`${base}/pagos`}` y chevron.
El componente `Row` (`:102-150`) ya soporta `leadingIcon`, `title`, `subtitle`, `href` interno o
externo, y es el espejo exacto del `ListRow` que RN usa en su propia sección «Cuenta»
(`apps/mobile/app/alumno/(tabs)/perfil.tsx:644`).

---

## 9. Superficies — REACT NATIVE

Build única, split por `Platform.OS` **solo** donde `apps/mobile/AGENTS.md` lo permite. Entrega por
**OTA** a los runtimes vigentes; **no requiere binario nuevo** (son pantallas y copys, sin módulos
nativos).

### 9.1 Coach

| Superficie | Punto de inserción verificado | Qué muestra |
|---|---|---|
| Pill **«Pagos»** en la ficha | `app/coach/cliente/[clientId].tsx:616-638` (array de tabs) + `case` en `:743-795`. El tipo ya admite el valor: `ClientTabBar.tsx:13` declara `'facturacion'` | Revive `components/coach/clientDetail/FacturacionTab.tsx` (105 líneas, **huérfano hoy**: 1 solo hit en todo `apps/mobile`). Tres métricas + historial + `Confirmar pago recibido` + `<WebOnlyHint/>` |
| Chip de estado en el hero | cerca de `[clientId].tsx:729` | `Badge` del DS (`components/Badge.tsx`) con el mismo vocabulario de §7 |
| Banner en el dashboard | junto a `MobileBillingBanners` (`CoachDashboardSections.tsx:147`), con `MobileBanner` (`:347`) tono `warn` | «3 alumnos por cobrar» + acción «Ver cobros» → pantalla **interna** |
| Pantalla `coach/cobros.tsx` | ruta nueva RN | Lista del mes con chips y `Confirmar`. **Sin ajustes, sin conectar MP, sin links** |
| Tarjeta «Cobros» en el hub de Herramientas RN | espejo de §7.1: array `BUSINESS_TOOLS` propio, `active` = `resolveCobrosAccess` (R20) | Pro dentro de la beta: entra. Free: `ModuleOffNotice` con «Cobros no está incluido en tu plan actual.» (**sin decir dónde se mejora**). Pro fuera de la allowlist: «Cobros está en prueba con un grupo de coaches» |
| `CreateClientModal` | `:929-940` («Inicio de mensualidad») | Se mantiene el campo + `<WebOnlyHint/>` |

**Los dos botones viejos de «registrar pago» se recablean o el módulo miente.** En RN ya existen hoy
dos caminos que escriben un pago **sin** cuota: `+ Pago` en las acciones rápidas del dashboard
(`apps/mobile/components/coach/CoachDashboardSections.tsx:647`) y `Registrar pago` dentro del propio
`FacturacionTab` (`apps/mobile/components/coach/clientDetail/FacturacionTab.tsx:63`). Los dos postean
a `/api/mobile/coach/payments` (`CoachDashboardSections.tsx:1091`), que inserta en `client_payments`
**sin `charge_id` ni `billing_plan_id`** — y `paid_through` solo se mueve en `confirmCharge` (§5.3.1).
Tal cual, el coach cobra, aprieta el botón que usa hace un año, y **su alumno sigue cortado**. Por eso:

1. Con **plan activo**, los dos botones abren el diálogo **«Confirmar pago»** de la cuota (cuota
   pendiente preseleccionada, monto prellenado, y **«Rechazar»** si está `claimed`) y postean a
   `/api/mobile/coach/cobros`. Nunca a `/api/mobile/coach/payments` (R19).
2. Sin plan activo, siguen funcionando como hoy (registro libre): no se pierde la función.
3. **Defensa en profundidad en el servidor**, porque los binarios viejos van a seguir posteando a la
   ruta vieja durante semanas: `POST /api/mobile/coach/payments` responde **409** con un cuerpo
   accionable (`{ error: 'CLIENT_HAS_BILLING_PLAN', chargeId }`) cuando el alumno tiene plan activo, en
   vez de escribir una fila huérfana. La app vieja muestra el mensaje del error; la nueva no lo ve
   nunca.
4. **Test bloqueante**: un pago creado por la ruta vieja para un alumno con plan activo no cambia el
   estado derivado, y la ruta devuelve 409.

**Prohibido en RN, sin excepción:** precios de EVA, la cadena `/mes` (el guard
`tests/mobile-no-prices.test.ts` la prohíbe con regex — usar «cada mes»), `checkout_url`, `init_point`,
QR de pago, y cualquier configuración del cobro.

### 9.2 Alumno

| Superficie | Punto de inserción verificado | Qué muestra |
|---|---|---|
| Fila de estado en el home | `app/alumno/(tabs)/home.tsx:556` (hermano de `<StudentAccessBanner/>`) | «Tu plan con tu coach · Al día hasta el 12 sep». **Sin monto** |
| Fila en el perfil | `app/alumno/(tabs)/perfil.tsx:613-631`, sección «Información», junto al `InfoLine` de «Miembro desde» (`:630`) | «Tu plan con tu coach» / «Al día hasta el 12 sep» |
| Banner `due` | mismo slot `home.tsx:556`, molde `StudentAccessBanner.tsx:19-32` | «Tu pago con tu coach está pendiente. Tu acceso sigue funcionando hasta el 15 de septiembre.» + `Avisar a mi coach`. En `mp_subscription`: «Mercado Pago está reintentando tu cobro.» **sin acción** |
| Claim desde la app | ruta nueva **`POST /api/mobile/student/cobros/claim`** (bearer, rate limit, **sin nota ni archivo**; R19) | El botón `Avisar a mi coach` del banner y de la fila de estado. Web y RN llaman **al mismo servicio**, así que el diferimiento de 5 días y el dedupe son idénticos |
| Pantalla bloqueada `unpaid` / `ended` | `app/alumno/_layout.tsx:100-106`, molde `components/alumno/StudentAccessBlocked.tsx` | **El mismo copy en los dos casos**: «Tu acceso está en pausa» · «Escríbele a tu coach para reactivarlo.» · «Tu progreso está guardado y te espera.» + `Escribir a mi coach` + `Cerrar sesión`. La app **no** dice «tu plan terminó» ni nombra montos: la distinción `unpaid`/`ended` la usa el servidor y la ve el alumno en la web |

**`app/alumno/suspended.tsx` no se toca** (y la push de corte tampoco apunta ahí). Esa pantalla lee su
`reason` **solo** del caché de `account-status` (`suspended.tsx:44`), y el validador
`apps/mobile/lib/student-account-status.ts:23` **descarta el objeto entero** si `reason` no es
`'archived' | 'paused' | null`. Como `/api/mobile/auth/account-status` no cambia (decisión firme:
ese contrato es del gate del coach), una rama `'unpaid'` ahí sería **código muerto** que además
mostraría el copy equivocado («El plan de tu coach está inactivo») a un alumno cuyo coach está al día.
Por eso el corte por impago vive **solo** en el layout, que ya lee `studentAccess` de
`/api/mobile/config`, y la push **P5** apunta a `screen: '/alumno/(tabs)/home'` (el layout monta el
bloqueo antes que cualquier screen), no a `/alumno/suspended`.

**Copy compartido, causa distinta.** `STUDENT_ACCESS_COPY.blockScreen`
(`apps/mobile/lib/student-access-copy.ts:31-40`) dice hoy «Tu cuenta está en pausa / **El plan de tu
coach está inactivo**. Escríbele para reactivar tu acceso.» — que es falso cuando la causa es el
impago del alumno. Se agregan a ese mismo objeto las **variantes neutras por causa**
(`blockScreen.unpaid` y `blockScreen.ended`, hoy con **el mismo texto**: «Tu acceso está en pausa» /
«Escríbele a tu coach para reactivarlo.» / «Tu progreso está guardado y te espera.»), y
`StudentAccessBlocked` elige por `studentAccess.reason` con **fail-open al copy actual** si el valor es
desconocido — que es exactamente lo que hace un **binario viejo**: muestra la pausa genérica, que es
segura, y el OTA agrega el copy por `reason` (R7). Cero cambios en `account-status`, cero pantallas
nuevas.

### 9.3 La tabla iOS / Android

| Superficie | iOS | Android | Diferencia |
|---|---|---|---|
| Coach · pill «Pagos» (historial, montos del coach, «pagado hasta») | ✅ completo | ✅ completo | ninguna |
| Coach · botón `Confirmar pago recibido` | ✅ | ✅ | ninguna |
| Coach · banner «N por cobrar» → pantalla interna | ✅ | ✅ | ninguna |
| Coach · `<WebOnlyHint topic="cobros"/>` | ✅ «El cobro a tus alumnos se configura desde el computador» | ✅ **la misma frase** | **ninguna: sin split, sin dominio** (R6, §10.2) |
| Coach · tarjeta Cobros bloqueada en Free | ✅ «Cobros no está incluido en tu plan actual.» | ✅ igual + la línea única `STORE_PLAN_CHANGE_CAPTION` | la caption vive **solo** en `lib/client-cap.ts` |
| Alumno · fila «Al día hasta el 12 sep» | ✅ | ✅ | ninguna (sin monto en ninguna) |
| Alumno · banner de gracia | ✅ (sin monto, sin link) | ✅ igual | ninguna |
| Alumno · `Avisar a mi coach` (claim) | ✅ (sin monto ni instrucciones al lado) | ✅ igual | ninguna |
| Alumno · pantalla en pausa | ✅ solo estado + WhatsApp | ✅ igual | **ninguna**: al alumno no se le nombra la web en ninguna plataforma |
| Alumno · `wa.me` al coach | ✅ **sin `?text=`** | ✅ igual | ninguna |
| Alumno · monto, link, «paga acá», «entra a la web» | ❌ | ❌ | prohibido en ambas |

**Contrato de datos hacia RN** (R7). `/api/mobile/config` emite dos cosas:

- **El corte, por el canal que la app ya obedece**: `studentAccess: { state: 'blocked', reason:
  'unpaid' | 'ended' }`. Se usa `state:'blocked'` —el valor que el layout ya sabe leer— justamente para
  que **los binarios viejos hagan lo correcto sin OTA**: muestran la pantalla de pausa genérica, que es
  segura y verdadera. El OTA solo agrega el copy por `reason`.
- **El detalle, en un campo hermano** que no ensucia `studentAccess` (que es del gate del coach):
  `studentBilling: { state, paidThrough, cutsAt, canClaim }` — **`cutsAt`**, el mismo nombre que
  devuelve la función pura `resolveStudentBillingState` (DATA-SECURITY §3.1); **no** `dueUntil`.

`toStudentAccess` normaliza con fail-open: un `reason` desconocido se lee como el bloqueo genérico, y
un `state` desconocido, como activo. `/api/mobile/auth/account-status` **no cambia**. El
`checkout_url`, el `init_point` y el monto de EVA **nunca** viajan en este payload (hay un test que lo
prohíbe).

---

## 10. Compliance de tiendas

**Regla vigente, no negociable** (`apps/mobile/AGENTS.md`, sección «Pagos y tiendas»): el rail de
cobro es la web; dentro de la app **no existe ningún camino a pagar**. iOS: cero (ni botón, ni link, ni
URL, ni precio, ni nombre de plan, ni texto que explique dónde se paga). Android: **una** línea de
texto plano sin link, literal único en `apps/mobile/lib/client-cap.ts`
(`STORE_PLAN_CHANGE_CAPTION`, `storePlanChangeCaption(platform)`). Split por `Platform.OS`, nunca por
storefront ni país. Fuera de la app (correo, WhatsApp) todo es libre: Apple 3.1.3 lo autoriza
expresamente.

**La regla específica de este feature:** el alumno que debe plata **no** puede ver en la app «paga
acá» ni «entra a la web a pagar», en ninguna plataforma. Solo estado + «Habla con tu coach». La razón
no es solo Apple: el destinatario del pago es **el coach**, no EVA, así que mandarlo a eva-app.cl sería
además confuso.

### 10.1 Tabla mensaje por mensaje

| # | Mensaje propuesto | iOS | Android | Riesgo | Redacción que se implementa |
|---|---|---|---|---|---|
| 1 | Coach: «Configura el cobro de tus alumnos en eva-app.cl» | ❌ | ⚠️ | **Alto en iOS** (`AGENTS.md`: «ni una URL, ni un texto que explique dónde se paga») y en Android crearía una **segunda** línea de compliance con dominio | **Descartada.** Se implementa la fila 3, igual en las dos plataformas |
| 2 | Coach: «Conecta tu MercadoPago en eva-app.cl» | ❌ | ⚠️ | Medio-alto (nombra la pasarela **y** el dominio) | La frase de la fila 3 |
| 3 | Coach: «**El cobro a tus alumnos se configura desde el computador**» (variante de la ficha: «El cobro de este alumno se configura desde el computador») | ✅ | ✅ | Muy bajo | **La que se implementa**, sin split por plataforma: es la redacción cerrada del hint de Cobros (R6, §10.2) |
| 4 | Coach: panel «Por cobrar» dentro de RN, con montos | ✅ | ✅ | Bajo | Tal cual: es el estado del negocio del coach, no una compra suya |
| 5 | Coach: botón «Confirmar pago recibido» | ✅ | ✅ | Bajo | Tal cual |
| 6 | Alumno: «Tu acceso está en pausa» | ✅ | ✅ | Bajo | «Tu acceso está en pausa» + «Escríbele a tu coach para reactivarlo.» |
| 7 | Alumno: «…Renueva en eva-app.cl» | ❌ | 🟡 | **Alto en iOS** | **Se elimina la segunda frase.** Build única ⇒ no existe en ninguna plataforma |
| 8 | Alumno: instrucciones de transferencia dentro de la app | ❌ | ❌ | Alto | Fuera de la app: correo y WhatsApp |
| 9 | Alumno: botón «Ya pagué» | ✅ | ✅ | Bajo-medio | **«Avisar a mi coach»**, sin monto ni instrucciones al lado |
| 10 | Alumno: `wa.me` con `?text=` que incluye el monto | ❌ | ⚠️ | Medio-alto | `wa.me/<num>` **sin `text`** |
| 11 | Alumno: «Vence el 12 de septiembre» | ✅ | ✅ | Bajo | Tal cual: es una fecha, no una venta |
| 12 | Coach Free entra a Cobros: «es de Pro, mejora en eva-app.cl» | ❌ | ⚠️ | Alto | `ModuleOffNotice`: «Cobros no está incluido en tu plan actual.» + `RefreshPlanButton`. **Cero** mención de dónde se mejora |
| 13 | Coach: «Los cambios de plan se hacen en eva-app.cl» | ❌ (no se monta) | ✅ | Ya mitigado | Sin cambios: `client-cap.ts` + `storePlanChangeCaption`, split por `Platform.OS` |

### 10.2 El componente `<WebOnlyHint/>`

`apps/mobile/components/WebOnlyHint.tsx`, extraído del **chasis visual** del callout de
`app/coach/(tabs)/subscription.tsx:354-370`. Ojo con el detalle que decide todo: ese callout **no
existe en iOS** — se renderiza dentro de `{platformPlanCaption ? … }` (`:355`) y
`storePlanChangeCaption` devuelve `undefined` fuera de Android (`apps/mobile/lib/client-cap.ts:91-93`).
O sea que lo que «ya pasó review» en iOS es la **ausencia** del nodo, no la frase. Cualquier
razonamiento del tipo «esto ya lo aprobaron» aplicado a montar texto con dominio en iOS es falso.

**Redacción cerrada, una sola, sin split** (R6; esto reemplaza todas las variantes que circulaban entre
SPEC §9.3, SPEC §10.1 y las notas de testing): el hint de Cobros dice **«El cobro a tus alumnos se
configura desde el computador»** en iOS y en Android, con **una** variante para la ficha de un alumno
concreto: «El cobro de este alumno se configura desde el computador». Consecuencias, todas buscadas:

- **Cero literal nuevo de compliance**: la frase no nombra dominio, no explica dónde se paga y no
  menciona plan ni precio, así que no entra en el régimen de la línea única de Android
  (`STORE_PLAN_CHANGE_CAPTION`, `apps/mobile/lib/client-cap.ts:81`) ni obliga a ampliar la allowlist de
  `tests/mobile/store-copy.test.ts`.
- **Cero excepción a `apps/mobile/AGENTS.md` §«Pagos y tiendas»**, que para iOS prohíbe «ni una URL, ni
  un texto que explique dónde se paga» y advierte que una excepción es conversación de producto, nunca
  un guard que se afloja. Con esta redacción no hay nada que enmendar y nada que negociar.
- `WebOnlyHint` **no necesita `platform`** para `topic:'cobros'`: se monta `<WebOnlyHint
  topic="cobros"/>` a secas. El `topic:'plan'` sigue usando `storePlanChangeCaption(platform)` sin
  ningún cambio (hoy es Android-only).
- El literal vive en **un solo lugar nuevo**, `apps/mobile/lib/web-only-hint.ts` (R6), y el componente
  lo **importa**, nunca lo escribe. **No se crea `STORE_COBROS_SETUP_CAPTION` en `client-cap.ts`**: esa
  constante es del régimen de compliance de Android y este copy no entra ahí.
- `tests/mobile/store-copy.test.ts` se **amplía** para pinear que el hint de Cobros **no contiene
  «eva-app.cl» ni «http»** — el guard vigila la ausencia del dominio, no la presencia de una excepción.

La variante con dominio en Android **no se implementa** y no queda como pregunta abierta: exigiría
enmendar `apps/mobile/AGENTS.md` con la firma del owner, una segunda constante exportada y ampliar la
allowlist del test. Si algún día se quiere, es una conversación de producto nueva.

Props `{ topic: 'plan'|'cobros', variant?: 'general'|'client', platform? }`; el copy de `'cobros'` sale
de `lib/web-only-hint.ts` — **el componente nunca escribe el literal**. Es un `View` con
`accessibilityRole="text"`, **sin `onPress` y sin `Linking`**. Ícono `Globe` para `plan`, `Monitor`
para `cobros`. Un hint por pantalla; nunca en onboarding ni en ninguna pantalla del alumno.

**Guards de CI que se agregan:** test de que el hint no es tocable; test de que ningún `wa.me` del
alumno lleva `?text=` con `$` o la palabra «pagar»; y una excepción **angosta** en
`tests/mobile-no-prices.test.ts` (los montos que vienen de datos sí se pueden mostrar en la pill del
coach; los literales del tarifario de EVA no).

### 10.3 Notes for Review

**Redacción final, cerrada por R23**, para `docs/operations/APP_REVIEW_NOTES.md`, a incluir en el envío
del binario siguiente. Se copia **literal**, sin agregarle frases:

> Coaches on paid plans can track payments their clients make to them. Payments are made outside the
> app — by bank transfer or on Mercado Pago, to the coach's own Mercado Pago account — never inside the
> app; there is no purchase flow, price, or payment link in the app. EVA does not collect funds or take
> a commission. When a client's access is paused, the app shows status only and lets the client contact
> their coach.

**Sin citar 3.1.3(f)** (R23): invocar una excepción de «Free Standalone App» que no aplica —el rail no
es una suscripción del usuario a EVA, es un cobro entre dos terceros— le regala al revisor el marco
equivocado. La nota describe el hecho y se calla la doctrina.

Tres razones para escribirlo **antes** del envío: la guideline 2.3.1 lo exige con especificidad; si el
revisor ve la palabra «payments» sin contexto el default es rechazo por 3.1.1; y la cuenta de Apple
Developer es de un tercero, con 4 rechazos previos en 1.1.0.

---

## 11. Correos y push (resumen; el detalle vive en EMAILS.md)

**Infraestructura reutilizada:** Resend vía `apps/web/src/lib/email/send-email.ts`
(`sendTransactionalEmail`), shell visual `base-layout.ts` (`wrapEmailLayout`/`ctaButton`), white-label
por coach. **Ledger nuevo `client_email_ledger`** (molde del `coach_email_ledger` existente), con
`dedupe_key = <template>:<charge_id>`. Kill-switch propio `EVA_COBROS_EMAILS_DISABLED`, del que
**E5, E6 y E7 quedan exentos** (son obligación contractual, no marketing: el comprobante, la
confirmación escrita del art. 12 A y la constancia de la baja salen igual). Remitente
`EMAIL_FROM`; **`replyTo` = el correo del coach** en todos los correos al alumno (así el alumno le
contesta al coach, no a EVA). Un solo CTA por correo, sin IVA, sin urgencia falsa, sin countdown.

**Total cerrado: 22 plantillas = 13 al alumno (E0…E11 + E1-link) + 9 al coach (C1…C8 + C2-bis).**
Las 16 de DECISIONS-2 son el conteo previo a R3/R5/R9/R21; el número vigente es 22 y así se construye
(EMAILS.md §9). Fusionar E10 dentro de E5 o C2-bis dentro de C1 son las únicas reducciones admitidas
y requieren aprobación del jefe; ninguna obligación legal (E0, E6, E7, E11) se puede fusionar.

**Al alumno — E0…E11 + E1-link** (los avisos del calendario se disparan **por umbral `≤`, nunca por
igualdad de fecha**, R4, y se dedupean en `client_email_ledger`; el calendario, con F =
`paid_through`, es el de §5.2):

| Clave | Cuándo | Titular |
|---|---|---|
| **E0** | al crear el plan (T1, R21) | «{coach} activó tu plan de cobro» — monto, `description`, ciclo, primer vencimiento, cómo pagar y quién responde |
| **E1** | T−3 (o `reminder_days_before`) | «Tu plan con {coach} vence el 12 de septiembre» |
| **E1-link** | T−5, solo `mp_link` | «Tu link de pago de septiembre» |
| **E2** | **F+1** con gracia 3 · **F** con gracia 0 | «Tu plan venció» / con gracia 0: «Hoy es el último día» |
| **E3** | **F+gracia** (= F+3), solo si gracia = 3 | «Mañana se pausa tu acceso» |
| **E4** | **F+gracia+1** (F+4 con gracia 3, F+1 con gracia 0), el **mismo día del corte**, una sola vez | «Tu acceso está en pausa» |
| **E5** | al confirmar | «Pago confirmado» + comprobante (**no es boleta**) + «tu acceso sigue hasta el X» |
| **E6** | al autorizar el preapproval | Confirmación escrita del contrato (art. 12 A): `description`, monto, periodicidad, día de cobro, cómo cancelar, quién responde |
| **E7** | al cancelar (alumno, coach o MP) | «Tu plan termina el 12 de septiembre» / «Tu suscripción quedó cancelada» |
| **E8** | cobro automático rechazado | «El cobro automático no pasó» + cómo actualizar la tarjeta en MP |
| **E9** | el coach pausa o cambia el cobro; se cancela el cobro automático por §5.4 (archivo, baja de Pro, borrado, desvinculación) | «Tu coach ajustó tu cobro» — con la variante «tu cobro automático quedó cancelado» y, cuando EVA ya no puede tocar MP, el **paso a paso para darlo de baja en Mercado Pago** |
| **E10** | reactivación tras un corte | «Tu acceso volvió» (puede fundirse con E5) |
| **E11** | reembolso o contracargo (R9) | «Tu pago fue reembolsado / desconocido; tu acceso queda en pausa el X» |

**Al coach — C1…C8 + C2-bis:** **C1** digest diario «Hoy: N por cobrar, M vencidos, K avisaron» (solo si hay
algo) · **C2** «{alumno} avisó que pagó» (con el comprobante, `replyTo` del alumno) ·
**C2-bis** «{alumno} avisó hace {n} días: confirmar o rechazar» — **plantilla propia**, recordatorio
**diario** mientras el claim siga vivo, tope 5 días (R3; sin ella R3 queda incompleto) · **C3** «Cobro recibido de {alumno}» (con
toggle) · **C4** «Conectaste Mercado Pago» (con el aviso legal: la comisión ~2,9-3,2 % + IVA la pagas
tú, los contracargos son tuyos, la boleta la emites tú) · **C5** «Mercado Pago se desvinculó o el token
venció» (con el conteo de suscripciones y, si la desautorización vino desde MP, las instrucciones para
cancelarlas en su panel) · **C6** «Bajaste a Free: cancelamos los cobros automáticos de tus alumnos»
(R5) · **C7** «Reembolso o contracargo de {alumno}» (R9) · **C8** «Pago duplicado de {alumno} —
devuélvelo desde Mercado Pago» (R9).

> **Nota de alineación.** DECISIONS-2 reasignó **C6** a «bajaste a Free» y cerró la lista en C1…C8, así
> que el aviso al coach por la **baja del alumno** (T14) **no tiene correo propio**: se resuelve con la
> push `cobros_plan_canceled` y la fila del panel, que es donde el coach ya mira. Si el jefe prefiere un
> correo, es un C9 y hay que abrirlo en EMAILS.md.

**Push** (infra existente `apps/web/src/lib/push.ts`, catálogo en `push-events.ts`, todas best-effort y
gateadas por `isPushEventEnabled`):
coach → `cobros_claim_received`, `cobros_payment_received` (solo riel MP), `cobros_plan_canceled`,
`cobros_daily_digest`.
Alumno, **solo estado, sin monto ni link, iOS = Android** → `cobros_payment_confirmed`,
`cobros_access_paused`, `cobros_access_restored`.
**No hay push de recordatorio previo al alumno**: el correo lo cubre, y una notificación «te toca
pagar» en la pantalla bloqueada del teléfono es, a ojos de un revisor de App Store, un CTA de compra.

---

## 12. Analytics

PostHog, server (`capturePostHogServerEvent`, `distinctId = coach_id`) y RN (`captureAppEvent`,
escalares planos). **Sin montos y sin `client_id`** en las propiedades: el monto es un dato financiero
de un tercero. Taxonomía `snake_case`, formato `objeto_accion`.

| Evento | Propiedades |
|---|---|
| `cobros_module_enabled` | — |
| `cobros_plan_created` | `mode`, `period`, `grace` |
| `cobros_charge_link_sent` | `mode` |
| `cobros_claim_sent` | `surface` (`web`/`rn`) |
| `cobros_payment_confirmed` | `source`, `surface` |
| `cobros_access_cut` | — |
| `cobros_access_restored` | `hours_cut` |
| `cobros_mp_connected` | — |
| `cobros_mp_disconnected` | `reason` |
| `cobros_subscription_authorized` | — |
| `cobros_subscription_canceled` | `by` (`student`/`coach`/`mp`) |
| `cobros_email_sent` | `template` |

**North-star del módulo: el porcentaje de cuotas cobradas dentro de T+3.** Métricas de apoyo: coaches
con al menos un plan activo, porcentaje de cuotas en modo automático, mediana de horas entre el corte y
la reactivación, y tasa de claims que el coach confirma.

---

## 13. Legal y tributario (Chile)

Resumen de la investigación; **no es una opinión legal** y hay una verificación con el contador
declarada como bloqueante blando en la semana 1.

1. **EVA no es recaudador**: la plata nunca entra a una cuenta de EVA (el riel MP usa el
   `access_token` **del coach** y MP liquida al coach; el modo manual ni siquiera toca el pago). Eso
   cierra el problema de custodia de fondos y evita el registro CMF de la Ley Fintec 21.521.
2. **Pero EVA sí califica como «operador de plataforma digital de intermediación»** para el SII: la
   definición vigente (Ley 21.713, Circular SII N° 39 de 30-04-2025) es «la interfaz que a través de
   internet permita **o facilite** a terceros la conclusión de ventas o servicios» — no exige tocar la
   plata. Obligaciones concretas: exigir **inicio de actividades** al coach, poder **verificar su
   cumplimiento tributario**, y poder **informar al SII** cantidad y montos de operaciones.
   **Consecuencia de diseño:** el onboarding del módulo pide **RUT** y una **declaración** («tengo
   inicio de actividades vigente y emito boleta por mis servicios»), y se guarda con fecha.
3. **La boleta la emite el coach, siempre.** Persona natural de segunda categoría → boleta de
   honorarios electrónica, exenta de IVA (art. 12 letra E N° 8 LIVS). Coach con sociedad → boleta
   afecta con IVA 19 %. **EVA nunca emite un documento que parezca boleta**: lo que manda en E5 se
   llama literalmente «comprobante de pago» y dice «Este comprobante no es una boleta ni una factura.
   El documento tributario lo emite {coach}.»
4. **Consumidor.** El alumno contrata con el coach. Aunque el coach probablemente no sea «proveedor»
   bajo la Ley 19.496 si tiene título y ejerce independiente, se diseña **como si la LPC aplicara**:
   **descripción obligatoria del servicio** (`client_billing_plans.description ≤ 140`, R21 — sin ella no
   hay plan, y es lo que viaja a E0/E5/E6), aviso previo con precio total en sus **dos versiones**
   (completa en `mp_subscription`, **corta también en el primer checkout de `mp_link`**, §8.4),
   **confirmación escrita** del contrato (E6, art. 12 A), **cancelación tan fácil como la contratación**
   (un botón, Ley 21.398) y retracto según ley. Cada autorización deja fila en
   **`student_billing_consents`** (`kind`, `terms_version`, `consented_at`, `ip_hash`, `user_agent`),
   exportable en CSV desde admin, retenida **24 meses** y **excluida de `purge-data`**: es la prueba con
   la que el coach se defiende de un contracargo.
5. **Contracargos.** Son plata que MP le saca **al coach**, no a EVA (resolución hasta 6 meses). Encaja
   con D4, pero hay que decirlo por escrito **antes** de que el coach conecte su MP: eso es el correo
   **C4** y el anexo T&C.
6. **Datos personales.** Hoy EVA se declara **encargado** del tratamiento (`docs/legal/tos.md:116`).
   El módulo suma datos de pago del **alumno** para una finalidad del **coach** ⇒ coach responsable,
   EVA encargada, y con la Ley 21.719 (vigente 01-12-2026) hace falta **contrato de encargo por
   escrito**. Hoy no existe un DPA coach↔EVA (el único con DPA es el contrato enterprise, y enterprise
   está congelada) ⇒ el anexo T&C «Cobros» incluye el DPA.
7. **Menores.** EVA hoy confirma 14+ (`apps/web/src/app/c/[coach_slug]/onboarding/OnboardingForm.tsx:386`)
   y guarda `age_confirmed_at` (`apps/web/src/app/join/[invite_code]/_actions/join.actions.ts:101`).
   Para **cobrar** eso no basta: un menor de 18 es incapaz relativo y no puede obligarse solo a una
   suscripción recurrente. Es la pregunta abierta **Q7** del §18.
8. **Cobro sin servicio: el riesgo legal más caro del módulo.** Un `preapproval` vivo se debita solo,
   todos los meses, aunque EVA haya apagado el motor. Por eso §5.4 tiene rango de invariante (§16.12):
   cancelar el plan, archivar al alumno, borrarlo, caer de Pro, borrar la cuenta del coach o desvincular
   MP **cancelan** la suscripción en MP, con aviso **al alumno**. Además mantiene verdadera la promesa ya
   publicada en `apps/web/src/app/privacidad/page.tsx:157` («Tu suscripción activa será cancelada en
   MercadoPago»), que hoy es cierta solo porque la única suscripción es la del coach con EVA. El anexo
   T&C dice explícitamente qué pasa con las suscripciones vivas en cada uno de esos casos.
9. **Textos a crear, con tarea propia y responsable** (R21). **Regla única de tiempos, para que no
   haya dos respuestas**: **borrador en W0**, **publicados y aceptados ANTES de W6** —la beta cobra
   plata real y el coach acepta el anexo con `terms_version` para poder crear un plan, así que lo
   legal **bloquea W6**, no W7— y **W7 solo revalida** que lo publicado siga vigente (no vuelve a
   publicar). No hay una segunda publicación en W2: W2 **no toca** los archivos legales.
   Las tareas:
   **LEGAL-01** sección «Cobros» en `apps/web/src/app/legal/page.tsx`; **LEGAL-02** anexo «Módulo de
   Cobros» en `docs/legal/tos.md`; **LEGAL-03** actualización de la política de privacidad por los
   datos de pago del alumno; **LEGAL-04** el **DPA** coach↔EVA dentro del anexo. La versión y la fecha
   quedan registradas en `coach_billing_settings.terms_version` / `terms_accepted_at` y, por alumno, en
   `student_billing_consents.terms_version`. **Sin estos textos publicados no se abre la beta (W6).**

---

## 14. Competencia: por qué se gana

| Eje | La competencia | EVA |
|---|---|---|
| Comisión de la plataforma | TrueCoach **5 %** + USD 15 por contracargo · Everfit USD 9/mes + 3,15 % (tarjeta local) / 4,65 % (internacional) · Trainerize USD 10/mes + ~1,9 % + USD 0,30 · AgendaPro **1-2 % encima** de lo que ya cobra MP | **0 %** (D14). Solo paga la comisión de MP, directa |
| Pasarela | Todos con Stripe (o Paddle). **Ninguno** con cobro nativo en CLP ni liquidación a cuenta chilena para el flujo coach→alumno | **MercadoPago Chile**: débito, RedCompra, saldo MP, crédito |
| Países soportados | TrueCoach: solo EE.UU., Reino Unido, Canadá y Australia. Chile **no** | Chile de nacimiento |
| Modos conviviendo | Hevy Coach no cobra a alumnos (el coach factura con una herramienta externa). El resto solo tiene tarjeta recurrente | **Tres modos** sobre el mismo motor, mezclables en el mismo coach |
| Corte por impago | Everfit: **corte inmediato**, sin gracia documentada. Glofox: 7 días. BoxMagic: bloqueo físico en el torniquete | **Gracia configurable 0 o 3 días**, con aviso escalonado (E2 → E3 → E4) |
| Reactivación | Everfit: el coach reintenta la tarjeta a mano desde «All invoices» | **Instantánea y derivada**: confirmas y el alumno entra |
| Cancelación por el alumno | TrueCoach: **solo el coach** puede cancelar. Fitco: el alumno cancela en MP y **además** tiene que escribirle al chat de soporte para que le desactiven la membresía a mano | **Un botón**, autoservicio, sincronizado con MP (D2) |
| Suspender ≠ dejar de cobrar | Wodify: un cliente suspendido **sigue siendo cobrado** si su membresía sigue activa | Pausar el plan detiene el cobro **y** el corte, en el mismo gesto (T15) |
| Puente WhatsApp | Nadie | Botón «Cobrar por WhatsApp» con plantilla editable (web) |
| Compliance de tiendas | Todos resuelven por link web; ninguno tiene el problema resuelto por diseño | **Diseñado iOS-safe desde el día cero**: en la app del alumno no existe la palabra «pagar» |

**Lo que no vamos a copiar:** los add-ons de pago por función (Everfit cobra USD 39/mes por planes de
comida), la fricción de cancelación de Fitco, y el corte sin aviso de Everfit.

---

## 15. Casos borde

| # | Caso | Comportamiento definido |
|---|---|---|
| 1 | **Alumno nuevo a mitad de mes** | El coach elige el **primer vencimiento** al activar el plan y `paid_through` arranca ahí (R2). La primera cuota va de hoy a esa fecha, con el monto que el coach escriba: **no hay prorrateo automático** (DECISIONS-2 lo dejó fuera de alcance; prorratear a ciegas es la fuente número uno de reclamos). Si quiere medio mes, usa «Monto distinto…» y escribe medio monto |
| 2 | **Cambio de monto a mitad de ciclo** | Se edita el plan; **la cuota vigente no cambia** (ya se comunicó y puede tener un link creado). El monto nuevo rige desde la cuota siguiente. En `mp_subscription` el cambio exige `PUT /preapproval/{id}` con el nuevo `transaction_amount`; MP puede pedir re-autorización del alumno ⇒ la UI avisa «El alumno tendrá que autorizar el nuevo monto» |
| 3 | **Cambio de modo** (`manual` → `mp_link`, etc.) | Permitido en cualquier momento. La cuota vigente **conserva su modo**; el modo nuevo aplica desde la siguiente. Si se sale de `mp_subscription`, primero hay que cancelar el preapproval (el diálogo lo dice y lo hace en el mismo paso) |
| 4 | **Pago parcial** | El coach confirma con el **monto real recibido**. Si es menor al de la cuota, la cuota queda `pending` con `amount_paid` parcial y una nota; `paid_through` **no avanza**. El panel muestra «Pagó $20.000 de $45.000». No se inventa un prorrateo de días |
| 5 | **Pago adelantado de 3 meses (prepago de N períodos)** | El coach confirma y marca «cubre N períodos» (N ≤ 12). **Se materializan y se cierran las N cuotas consecutivas**, todas con el mismo `payment_id`, y el pago guarda `client_payments.periods_covered = N` (R16). `paid_through` = `period_end` de la **última**; la cuota siguiente arranca al día después. El alumno ve «Pagado hasta el 12 de diciembre» y el coach ve los tres meses en su historial, que es lo que va a buscar cuando el alumno pregunte. **Esto exige quitar el índice único sobre `student_billing_charges.payment_id`** (un pago, N cuotas): va en la lista de migraciones de DATA-SECURITY. *(Reemplaza la solución anterior de «extender `period_end` de una sola cuota», que escondía dos períodos del historial.)* |
| 6 | **Gracia = 0** | No hay estado `due`: el día siguiente al vencimiento el alumno pasa directo a `unpaid` (T5). **E2 sale en F** («hoy es el último día») y **E4 en F+1**, el mismo día del corte —**no** salen juntas— y **E3 no existe** (DECISIONS-2 §EMAILS, calendario de §5.2). La UI del coach lo advierte al elegirlo: «Sin gracia, el acceso se corta al día siguiente del vencimiento.» |
| 7 | **El coach baja a Free (o se le vence el plan) con cobros activos** | Motor **en pausa**: los planes quedan `paused` ⇒ derivado `off` para todos sus alumnos, **nadie se corta**, no se crean cuotas, no sale ningún correo de cobranza. Y los preapprovals **se cancelan en MP** (`PUT {status:'cancelled'}`, §5.4, R5): EVA no deja corriendo un débito mensual por un servicio que dejó de administrar, y no deja una suscripción «pausada» que alguien reanude por error. **C6** al coach («bajaste a Free», con el conteo) y **E9** al alumno. Al volver a Pro, el motor retoma desde `paid_through`, pero el riel automático hay que **rearmarlo**: preapproval nuevo, aviso previo nuevo, E6 nuevo. La UI del coach lo dice antes de que baje de plan |
| 8 | **El coach desvincula MercadoPago** | **Desde EVA**: el diálogo avisa que se van a **cancelar TODAS las suscripciones vivas**, EVA las cancela **antes de revocar los tokens** y recién ahí la conexión pasa a `revoked` (R5). **Desde MP** (`application.deauthorized`, topic `mp-connect`): EVA ya no tiene token y no puede cancelar nada ⇒ conexión `revoked`, **C5 al coach con las instrucciones para cancelarlas en su panel de MP** y **E9 al alumno** con el paso a paso en su propia cuenta. En los dos casos los planes `mp_link` y `mp_subscription` pasan a `manual` **sin cortar a nadie**. Las cuotas con link ya emitido siguen siendo pagables, pero EVA ya no recibe el webhook ⇒ vuelven a depender del claim |
| 9 | **MP cancela por 3 cuotas rechazadas** | T13: la suscripción queda `cancelled` en MP (**terminal**), el plan pasa a modo `manual` y sigue `active`. El alumno recibe E7 y queda con el estado derivado que le toque (normalmente `unpaid`). Para volver al automático hay que crear un **preapproval nuevo** |
| 10 | **El alumno se da de baja y después vuelve** | La baja deja el plan `canceled`: conserva el acceso hasta `paid_through` con el copy «tu plan termina el X», y **después queda en `ended`**, sin gracia (§5.1, R1) — un plan `canceled` se sigue evaluando, nunca se convierte en acceso gratis indefinido, y tampoco se le dice «no pagaste» a alguien que avisó que se iba. Volver = el coach crea un plan nuevo (la UI ofrece «Reactivar con los mismos datos»). En `mp_subscription` es un preapproval nuevo, con aviso previo y E6 nuevos |
| 11 | **Alumno archivado con cuota pendiente** | El gate de archivado gana (T19): derivado `off`, el alumno ve la pantalla de archivado de siempre. El plan y la cuota quedan congelados, visibles en el historial del coach. **Y el preapproval se cancela en MP** (§5.4, R5) + **E9** al alumno: archivar quita el acceso en el acto (`apps/web/src/proxy.ts:1377`), así que dejar la tarjeta debitándose sería cobrar sin servicio. Si el coach lo desarchiva, el motor retoma con la misma cuota (probablemente vencida), pero el automático hay que rearmarlo con un preapproval nuevo |
| 12 | **Dos coaches del mismo alumno** | **No aplica**: `clients` tiene un solo `coach_id`. Un alumno pertenece a un coach. Si un coach «traspasa» un alumno, es un registro nuevo y un plan nuevo |
| 13 | **Reembolso** | EVA **no reembolsa** (D4): el coach devuelve la plata desde su panel de MercadoPago o por transferencia. En EVA corre la **reversa** (R9, §5.5, RPC `private.cobros_revert_charge`): cuota → `refunded`, `client_payments.status='refunded'`, `paid_through` retrocede al `period_end` de la cuota anterior pagada, el estado derivado se recalcula (puede quedar `unpaid`), y salen **E11** al alumno y **C7** al coach. Si lo que pasó es que el coach confirmó por error hace dos días, la acción correcta no es esta sino **«Deshacer confirmación»** (≤ 7 días, R8) |
| 14 | **Contracargo** | MP le descuenta la plata al coach y lo notifica por webhook (`payment` con `status=charged_back`). **Misma regla que el reembolso** (R9, una sola regla para los dos): cuota → `charged_back`, `client_payments.status='charged_back'`, `paid_through` retrocede al `period_end` de la cuota anterior pagada, **E11** al alumno y **C7** al coach; el panel pinta el badge `Contracargo`. *(Esto reemplaza la regla anterior de «cero cambio de acceso»: dejar el acceso vivo cuando la plata volvió al alumno le regala al coach el peor de los dos mundos.)* El contracargo lo pierde el coach (D4). **Test de nivel A**: contracargo ⇒ `paid_through` retrocede exactamente un período, cuota `charged_back`, E11 + C7 enviados una sola vez |
| 15 | **Cambio de correo del alumno** | El `payer_email` va en el `preapproval`; si el alumno cambia su correo en EVA, la suscripción viva en MP **sigue apuntando al viejo**. No se toca (MP no permite cambiarlo sin re-autorizar). Los correos de EVA salen al nuevo. La UI del coach muestra «El correo registrado en Mercado Pago es otro» cuando difieren |
| 16 | **Alumno de ejemplo (`is_demo`)** | Fuera del motor, en todas las superficies: no tiene plan, no cuenta en los KPIs, no recibe correos, nunca se corta. Hay 22 en producción |
| 17 | **Fin de mes: 31 → 30 → 28** | El período se calcula con `date` en `America/Santiago` sumando meses calendario con **clamp al último día del mes**: un vencimiento el 31 de enero cae el 28 de febrero y el 31 de marzo (no se corre a marzo). El día ancla original se conserva en el plan, no se pierde por el clamp |
| 18 | **Cambio de horario de verano / medianoche** | Todos los cortes usan `endOfDay(paid_through)` en `America/Santiago`, resuelto con los helpers existentes de `date-utils.ts`. El cron corre a las 09:00 CL, así que nunca decide un corte en el borde de medianoche |
| 19 | **Webhook duplicado o fuera de orden** | `student_payment_events.provider_event_id` único (`x-request-id` o `<topic>:<data.id>:<action>` en minúsculas); se inserta **antes** de mutar, con `on conflict do nothing` ⇒ si no insertó nada, responde 200 y no hace nada. Un webhook viejo nunca retrocede `paid_through`: solo lo hacen las tres operaciones auditadas de §5.5 |
| 20 | **El alumno paga dos veces la misma cuota** | El segundo pago se registra en `client_payments` con su `provider_payment_id` propio, **`charge_id null`** y **`status='duplicate'`** (R9), y **no avanza `paid_through` otra vez** (la cuota ya está `paid`). Sale **C8** al coach: «Pago duplicado de {alumno} — devuélvelo desde Mercado Pago». En el panel se ve con el badge `Duplicado`. EVA no reembolsa (D4) |
| 21 | **El alumno abre un link de pago vencido** | La preference expira a los 30 días (`expiration_date_to`). `/api/cobros/checkout` detecta la expiración y **crea una nueva** con el mismo `charge_id` y una `X-Idempotency-Key` versionada, así no se duplican cobros |
| 22 | **El coach confirma un pago desde RN y desde la web al mismo tiempo** | La confirmación pasa siempre por `private.cobros_confirm_charge`, que toma `select … for update` sobre el plan (R13), y `client_payments.charge_id` es único: la segunda escritura choca y se resuelve como **éxito idempotente** (la UI muestra el estado final, no un error) |
| 22b | **El alumno avisa «ya pagué» dos veces, o avisa desde la web y desde la app** | **Máximo un claim vivo por cuota** (R3): el segundo aviso no crea nada, no reinicia el diferimiento de 5 días y no manda otro C2. La UI dice «Ya le avisaste a {coach} hace N horas». Web y RN pegan al mismo servicio (`POST /api/mobile/student/cobros/claim` en RN, R19), así que la regla es una sola |
| 22c | **El claim se vence sin respuesta del coach** | Pasados los 5 días de diferimiento, el corte ocurre igual: el estado derivado deja de mirar el claim y cae a `unpaid`. La cuota **sigue** `claimed` (el aviso existió) y el coach sigue viendo «Avisó hace N días» en su panel y en su recordatorio diario hasta que confirme o rechace |
| 23 | **El coach borra su cuenta con suscripciones vivas** | `deleteCoachAccountAction` (`apps/web/src/app/coach/settings/_actions/settings.actions.ts:388`) ya cancela hoy la suscripción EVA↔coach en el proveedor y borra a sus alumnos; **se le agrega el paso de cancelar TODOS los preapprovals de sus alumnos** (`PUT {status:'cancelled'}`, §5.4) **antes** de tocar `coach_payment_connections` — si se borra primero la conexión, el token se va por cascade y quedan N tarjetas debitándose a alumnos que ya no existen, sin nadie que pueda pararlas. Cada alumno recibe **E9**. Sin este paso, la promesa publicada en `apps/web/src/app/privacidad/page.tsx:157` («Tu suscripción activa será cancelada en MercadoPago») pasa a ser falsa |
| 24 | **El módulo se apaga con una suscripción viva** | El **kill-switch global no cancela nada** (R5): es temporal, apaga gate, cron y webhook, y deja los preapprovals corriendo — por eso justamente la **salida del alumno nunca se apaga**: `/c/[slug]/pagos` se sirve en modo mínimo y el POST de la baja sigue vivo (§5.4), con excepción explícita en `resolveCobrosAccess`. Devolver 404 ahí sería cerrar la única puerta de salida mientras la plata sigue saliendo: rompe el invariante 10 y la Ley 21.398. En cambio, los apagados **permanentes** (Free, desvinculación, borrado) sí cancelan en MP antes de apagarse |

---

## 16. Invariantes

1. **La comisión de EVA sobre el cobro coach→alumno es 0 %, siempre.** No se usa `marketplace_fee`.
2. **EVA nunca toca la plata**: ningún flujo del módulo liquida a una cuenta de EVA.
3. **El estado de corte es derivado**, jamás una columna. Ningún cron escribe «cortado».
4. **Fail-open**: sin plan, sin `paid_through`, sin coach Pro, con el kill-switch encendido o ante
   cualquier error del gate, el alumno **entra**.
5. **El gate de cobros no comparte flag, columna ni copy con el gate del coach moroso**
   (`STUDENT_ACCESS_GRACE_DAYS = 7`, `apps/web/src/lib/student-access.ts:32`). Son dos causas distintas
   con dos remedios distintos y el copy tiene que decir cuál es.
6. **El motor nunca escribe `clients.is_active` ni `clients.is_archived`.**
7. **Ningún precio, link de pago, `checkout_url` ni `init_point` llega a la app nativa.**
8. **Los tokens OAuth del coach no son legibles por el rol `authenticated`**, en ninguna consulta.
9. **Un pago confirmado es idempotente** por `charge_id`, y `paid_through` **avanza por confirmaciones;
   retrocede solo por deshacer, reembolso o contracargo** (R8) — tres eventos auditados, cada uno con su
   RPC (§5.5). Ningún cron, ningún webhook fuera de orden y ninguna reconciliación lo mueven hacia
   atrás por su cuenta.
10. **Darse de baja es tan fácil como suscribirse**: un botón, sin trámite, aun con deuda — **y
    también cuando el módulo está apagado**. Mientras exista un preapproval vivo, la página de pagos y
    el endpoint de baja se sirven aunque el plan esté `off`, el coach sea Free o el kill-switch esté
    encendido (§5.4).
11. **EVA no emite documentos tributarios.** Lo que manda es un «comprobante», y lo dice.
12. **Ningún cobro automático sobrevive a la pérdida del acceso o de la relación** (§5.4, R5): cancelar
    el plan, archivar, desactivar o borrar al alumno, caer de Pro, borrar la cuenta del coach o
    desvincular MP **cancelan** el preapproval —no lo pausan—, y si EVA ya no puede hacerlo, se lo dice
    **al alumno** con el paso a paso. El kill-switch global es la única excepción, por ser temporal.
13. **Un plan `canceled` se sigue evaluando** hasta `paid_through` y después queda en **`ended`**
    (§5.1, R1). Cancelar nunca es un atajo a acceso gratis indefinido, y `ended` nunca se le muestra al
    alumno como si fuera una deuda.
14. **`paid_through` nunca es `null` en un plan activo**: se inicializa en `first_due_on` al crear el
    plan (R2). La rama de fail-open existe para datos rotos, no para un estado normal.
15. **El claim difiere, no reactiva** (R3): avisar «ya pagué» pospone el corte hasta 5 días y calla los
    correos al alumno; el acceso solo vuelve con una confirmación real.
16. **Los avisos se disparan por umbral, nunca por igualdad de fecha** (R4): un plan creado dentro de
    la ventana recibe su aviso en el sweep siguiente, no lo pierde.
17. **El corte y E4 caen el mismo día** (§5.2, DECISIONS-2 §EMAILS): F+gracia+1 — F+4 con gracia 3,
    F+1 con gracia 0. E4 («tu acceso está en pausa») nunca se manda un día antes de que el acceso se
    pause, y el día del corte nunca se queda sin correo. El sweep sella `cut_notified_at` **ese** día.
18. **Token siempre, firma cuando el flag lo diga** (R22): el webhook rechaza sin `?token=` válido,
    verifica la firma cuando viene y solo la **exige** con `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true`.

---

## 17. Fuera de alcance (deuda declarada)

- **Transbank/Flow como riel automático** («comercios asociados»): documentado como alternativa, no se
  construye en v1 (D6).
- **IAP en iOS o Google Play Billing**: no, en ninguna forma. El rail es la web.
- **Cobros para coaches de org/team (pool y enterprise)**: el módulo es solo-standalone (D13). Hoy no
  excluye a nadie (110/110 alumnos son standalone).
- **Cobros en el plan Free**: no (D3).
- **Boletas, facturación y contabilidad del coach**: es del coach (D4). EVA no las emite ni las integra
  con el SII en v1.
- **Reembolsos y contracargos operados desde EVA**: solo se registran, no se ejecutan.
- **Multi-moneda**: solo CLP.
- **Cobro de sesiones sueltas con agenda / paquetes de sesiones consumibles**: `period_kind = one_off`
  cubre el pago único, pero no hay contador de sesiones.
- **Prorrateo automático del primer período** (DECISIONS-2): el coach elige el primer vencimiento y, si
  quiere, ajusta a mano el monto de la primera cuota con «Monto distinto…». EVA no calcula
  proporciones.
- **Descuentos, cupones y precios promocionales por alumno**: el coach escribe el monto que quiera; no
  hay motor de descuentos.
- **Split de pagos entre varios coaches**: no aplica (un alumno, un coach).
- **Recordatorio por WhatsApp automático** (API de WhatsApp Business): el puente es manual, el coach
  aprieta el botón.
- **Backfill masivo de `paid_through` desde `client_payments`**: con 11 filas históricas de un solo
  coach no se justifica. Cada coach activa alumno por alumno (o con el paso 3 del onboarding).

---

## 18. Preguntas abiertas para el owner

Las que estaban acá y **ya se cerraron** (no volver a preguntarlas): el choque de relojes de
`mp_subscription` (DECISIONS-2: no hay estado `recycling`, manda la gracia, §6.3), el prorrateo del
primer período (DECISIONS-2: no automático, §17), el correo al activar el cobro (R21: **E0 existe**,
T1) y el hint con dominio en Android (R6: una sola frase sin dominio, §10.2).

Quedan seis, y las seis son del owner porque tienen costo de plata, de legal o de relación con
personas concretas — ninguna se resuelve leyendo el código.

**Q1 — ¿Se construye el modo `mp_subscription` si MercadoPago exige algo que el coach persona natural
no tiene?** El riel automático depende de que un preapproval se pueda crear con la cuenta del coach.
Si en la homologación aparece que MP pide cuenta de empresa, giro específico o un nivel de cuenta que
un personal trainer a honorarios no alcanza, el modo 3 se cae para la mayoría de los 7 coaches Pro.

- **(A) Recomendada — verificar en nivel B antes de construir W5, y si el requisito existe, cortar el
  modo 3 del tren.** Los modos `manual` y `mp_link` no lo necesitan y cubren el 100 % del valor
  prometido; `mp_link` incluso da la señal automática. El modo 3 vuelve cuando haya un coach que
  califique.
- **(B) Construirlo igual** y dejar que cada coach descubra si califica. Riesgo: el modo más caro de
  construir termina apagado, y el coach se entera con un error de MP en la cara.
- **(C) Cambiar el modo 3 por «tarjeta guardada con `mp_link` reutilizable»**, si MP lo permite en la
  cuenta del coach. Hay que investigarlo antes de prometerlo.

**Q2 — ¿El paso legal del onboarding es bloqueante o se puede saltar?** Hoy el diseño exige RUT +
declaración de inicio de actividades + aceptación del anexo T&C antes de activar el módulo (§7.2 paso
1, §13.2). Es lo que sostiene el rol de EVA frente al SII, y también lo que puede frenar en seco al
primer coach de la beta un lunes a las 22:00.

- **(A) Recomendada — bloqueante, sin excepción.** Sin RUT y sin declaración no hay módulo. Es una
  pantalla de 30 segundos y es exactamente la obligación que la Circular 39 le pone a la plataforma.
- **(B) Bloqueante solo para los modos MP**, libre para el modo manual (donde EVA ni siquiera toca el
  pago). Más adopción, y un argumento defendible; pero deja a EVA «facilitando» servicios de gente sin
  inicio de actividades declarado, que es justo lo que la definición del SII mira.
- **(C) Pedirlo después de los primeros 30 días.** Máxima adopción, mínima defensa. No recomendado.

**Q3 — ¿Quiénes son los 2-3 coaches de la beta cerrada?** D-D fijó el formato (allowlist,
`COBROS_BETA_COACH_IDS`, 2-3 semanas, plata real) pero no los nombres, y `COBROS_BETA_COACH_IDS` vacío
= nadie entra. Hay **7 coaches con plan pago activo** y **55 alumnos** entre todos.

- **(A) Recomendada — el owner elige por nombre**, priorizando coaches que hoy ya cobran por
  transferencia todos los meses (el módulo les ahorra trabajo desde el día 1) y que contesten rápido
  cuando algo falle.
- **(B) Empezar con la cuenta del propio owner / socio** y un coach real. Menos señal de producto, más
  control del desastre.
- **(C) Abrir a los 7 Pro de una.** No recomendado: 55 alumnos con corte automático de acceso y plata
  real es demasiada superficie para la primera semana.

**Q4 — ¿El coach puede ver el comprobante que el alumno subió, en la app nativa?** El comprobante vive
en un bucket privado y en web se sirve con URL firmada.

- **(A) Recomendada — sí, con URL firmada de vida corta**, igual que en web. `FacturacionTab` ya tiene
  la miniatura 38×38 y el lightbox escritos.
- **(B) No, solo en web.** Cero superficie nueva en RN; el coach ve «Adjuntó comprobante — míralo en el
  computador», que además obliga a un `<WebOnlyHint/>` más.

**Q5 — ¿El alumno ve el monto de su plan dentro de la app nativa?** Hoy la spec dice que **no**, en
ninguna plataforma (§9.2, §9.3, §10.1 fila 11): la app muestra «Al día hasta el 12 sep», sin cifras.
La regla de tiendas no lo exige —el monto es una deuda con un tercero, no una compra a EVA—, pero
mostrar plata en la pantalla de un alumno cortado es lo que un revisor de App Store lee como CTA de
compra, y la cuenta de Apple es de un tercero con 4 rechazos previos.

- **(A) Recomendada — sin monto en la app del alumno**, iOS y Android igual. El monto vive en el
  correo, en WhatsApp y en la web. Cero riesgo, y el alumno igual sabe cuánto paga.
- **(B) Monto visible en Android, oculto en iOS.** Split por `Platform.OS`, una diferencia más que
  mantener y explicar, y un guard nuevo en los tests.
- **(C) Monto visible en las dos.** Lo más útil para el alumno y lo más caro si sale mal: no hay
  segunda oportunidad barata con esa cuenta de Apple.

**Q6 — ¿Qué periodicidades se ofrecen en v1?** El diseño trae cuatro: `monthly` (default), `biweekly`,
`quarterly` y `one_off`. Cada una multiplica los casos de prueba del motor (vencimientos, clamp de fin
de mes, prepago, correos) y `biweekly` además choca con el ciclo mensual con el que MP piensa las
suscripciones.

- **(A) Recomendada — `monthly` + `one_off` en el primer tren**, las otras dos detrás del mismo flag y
  encendidas cuando el motor lleve un mes sin sustos. Cubre lo que hacen hoy los 7 coaches Pro.
- **(B) Las cuatro desde el día 1.** Más completo, más superficie de bug en la parte del sistema que
  corta accesos.
- **(C) Solo `monthly`.** Lo más simple; deja fuera el pago único, que es justo lo que un coach usa
  para vender una evaluación suelta.

**Q7 — Alumnos menores de 18 en el riel automático.** Un menor de 18 es incapaz relativo y no puede
obligarse solo a una suscripción recurrente. EVA hoy solo confirma 14+.

- **(A) Recomendada — checkbox de pagador adulto.** En el aviso previo (§8.4), el checkbox dice «Soy
  mayor de 18 años y autorizo el cobro periódico»; queda registrado en `student_billing_consents` con
  fecha y versión del texto. Costo: cero.
- **(B) Bloquear el riel automático si `birth_date` implica menos de 18** y dejar solo el modo manual
  para esos alumnos. Más estricto, pero el bloqueo sería aleatorio según quién completó el dato.
- **(C) Campo «pagador» separado** (nombre + correo del adulto que paga). Lo más correcto legalmente y
  lo más caro: un formulario más, una columna más, y fricción real en el alta.

---

### 18.1 Preguntas vigentes al owner (29-08-2026, formato del artifact «El motor de cobros» · SIN responder)

Cerradas por el owner el 28-08: tres modos · gracia 0/3 elegida por el coach · Herramientas (no navbar) · beta cerrada.
Cerradas por el jefe tras la crítica (R1–R23 + DECISIONS-2): sin estado `recycling`, sin prorrateo, E0 existe.

| # | Pregunta | Opciones (la primera = recomendada) | Estado |
|---|---|---|---|
| P1 | Si Mercado Pago exige que el alumno tenga cuenta para suscribirse, ¿qué hacemos con el modo suscripción? | A) igual se ofrece; el link por ciclo (sin cuenta) queda como camino por defecto · B) postergar la suscripción a un tren 2 · C) se cae si el experimento falla | pendiente |
| P2 | ¿El paso legal (RUT + declaración de inicio de actividades + anexo «Cobros») es obligatorio para activar el módulo? | A) obligatorio, una vez · B) solo el anexo, RUT opcional · C) obligatorio solo para conectar Mercado Pago | pendiente |
| P3 | ¿Qué coaches Pro entran en la beta cerrada (2-3 semanas, plata real)? | A) JP (jotap-coach) + 1-2 Pro con más alumnos activos · B) solo cuentas del owner con alumnos reales, después externos · C) los 7 Pro con kill-switch | pendiente |
| P4 | ¿El alumno puede adjuntar comprobante de transferencia en la web? | A) sí: imagen/PDF ≤ 5 MB en bucket privado, visible al coach en ficha y en C2 · B) no en el primer tren, solo nota | pendiente |
| P5 | ¿La app nativa muestra al alumno cuánto paga (sin botón)? | A) no: solo «al día hasta el X» / «en pausa» · B) sí, monto informativo | pendiente |
| P6 | ¿Qué periodicidades ofrece el primer tren? | A) mensual + quincenal + trimestral + pago único · B) solo mensual · C) mensual + pago único | pendiente |
| P7 | ¿Todo en un tren (26-32 días-agente) o partirlo? | A) un solo tren con los tres modos (decisión original) · B) tren 1 = motor + transferencia + link MP (~15-18 d) → beta; tren 2 = suscripción MP | pendiente |
| P8 | ¿Alumnos menores de 18 en el riel automático? | A) solo si paga un adulto (checkbox «paga mi apoderado» + correo del pagador); si no, transferencia · B) excluir a menores de todos los modos MP | pendiente |

### 18.2 Verificaciones externas del owner (no frenan el desarrollo)

1. **Contador — «¿EVA es operador de plataforma de intermediación para el SII?»** (Ley 21.713, Circular SII 39/2025).
   La ley alcanza a sitios que *facilitan* una venta o servicio aunque la plata nunca pase por ellos; si aplica, EVA debe
   pedir inicio de actividades al coach, verificar cumplimiento tributario e informar al SII si lo pide. Por eso el paso 1
   pide RUT + declaración. Pregunta literal: «Si mis coaches cobran a sus alumnos desde mi web pero la plata va directo a
   la cuenta del coach y yo no cobro comisión, ¿soy operador de plataforma según la Circular 39? ¿Qué debo pedirles y
   guardar?». La respuesta ajusta el paso 1 (más estricto / igual / se saca); no cambia el diseño técnico.
2. **Abogado — texto del derecho a retracto en E6 y en el aviso previo.** Fórmula propuesta: «Tienes derecho a
   retractarte dentro de 10 días desde la contratación si el servicio aún no comenzó. Al usar tu plan antes de ese plazo,
   aceptas que el servicio comience de inmediato.» Un párrafo; requiere bendición legal porque puede usarse en un reclamo.
3. **Experimentos con Mercado Pago (TESTING-LEGAL §A.4, 8 en total).** El clave: **con qué clave firma MP el aviso
   (`x-signature`) cuando el cobro es a nombre del coach** — la doc no lo dice y no se puede probar con cuentas de prueba
   (MP no envía avisos en modo test). Se resuelve en el nivel C con plata real ($1.000 × 2, tarjeta del owner, cuenta MP
   del socio como «coach»): se captura el primer aviso real y se verifica contra el secret de la app «EVA Cobros»
   (flag `COBROS_WEBHOOK_REQUIRE_SIGNATURE` apagado hasta confirmar; la autoridad mientras tanto es `?token=` + re-fetch
   del pago con el token del coach + `collector_id`). Los otros 7: monto mínimo CLP, si el alumno necesita cuenta MP para
   el `init_point` de suscripción, expiración del link, test user vendedor autoriza OAuth, Simulador con suscripciones,
   payload de `mp-connect`, homologación no requerida — cada uno con «qué cambia si falla».

### 18.3 Aclaraciones dadas al owner (29-08)

- **La plata nunca pasa por EVA** en los tres modos: transferencia → banco del coach; link por ciclo y suscripción →
  cuenta Mercado Pago del coach (recursos creados con su token OAuth; `collector_id` = coach). EVA no custodia, no cobra
  comisión, no ve tarjetas; la comisión de MP, los reembolsos y los contracargos son del coach.
- **El link de cobro que el coach genera en su panel de MP es «ciego»**: MP no le avisa a EVA cuando se paga, así que
  vive en el modo transferencia (el coach lo pega en «Cómo cobras»; el alumno paga y avisa; el coach confirma). El
  **link por ciclo** lo genera EVA cada mes a nombre del coach (Checkout Pro con su token): misma página de pago, misma
  cuenta destino, pero MP sí avisa y la confirmación es automática.

## 19. Glosario de nombres canónicos

**No inventar variantes.** Si algo no está acá, se agrega acá antes de usarlo.

| Categoría | Nombre canónico |
|---|---|
| Slug de la spec | `cobros-coach-alumno` (`docs/specs/cobros-coach-alumno/`) |
| Nombre de producto | **«Cobros»** |
| Página del coach | `/coach/cobros` |
| Página del alumno | `/c/[coach_slug]/pagos` · retorno: `/c/[coach_slug]/pagos/retorno` |
| Pantalla de corte | `/c/[coach_slug]/suspended?reason=unpaid` · `?reason=ended` (R1) |
| Webhook MP | `/api/cobros/mp/webhook` |
| OAuth MP | `/api/cobros/mp/connect` · `/api/cobros/mp/callback` · `/api/cobros/mp/disconnect` |
| Checkout del alumno | `/api/cobros/checkout` |
| API de la pill | `/api/cobros/clients/[clientId]/plan` |
| APIs móviles | `/api/mobile/coach/cobros` · `/api/mobile/coach/clients/[clientId]/cobros` · **`/api/mobile/student/cobros/claim`** (POST, bearer, rate limit, sin nota ni archivo; R19) |
| Crons | `cobros-sweep` (`45 12 * * *` UTC) · `cobros-mp-reconcile` (`15 13 * * *` UTC) |
| `external_reference` (R10) | `mp_link` (preference): `cobro\|<coachId>\|<clientId>\|<chargeId>` · `mp_subscription` (preapproval): `cobro\|<coachId>\|<clientId>\|<planId>`. La cuota de un `authorized_payment` se resuelve **por período**, nunca por el ref |
| Tablas | `coach_billing_settings` · `client_billing_plans` · `student_billing_charges` · `student_subscriptions` · **`student_billing_consents`** (R21) · `student_payment_events` · `coach_payment_connections` · `coach_payment_connection_events` · `client_email_ledger` · `public.platform_flags` (`key='cobros_gate'`, service-role-only) |
| Tabla existente extendida | `client_payments` (+ `billing_plan_id`, `charge_id`, `source`, `status`, `provider_payment_id`, `period_start`, `period_end`, `periods_covered`, `receipt_path`, `confirmed_by`, `confirmed_at`) |
| Función de gate SQL | `private.student_billing_allowed(p_client_id, p_coach_tier, p_coach_status)` |
| Función pura TS | `resolveStudentBillingState({ plan, coachIsPro, clientExcluded, gateEnabled, now })` en `@eva/cobros` → `StudentBillingResult { state, paidThrough, cutsAt, graceDays, deferredByClaim }` (§5.1) |
| RPCs de plata (R13, `security definer` en `private`, sin grant a `authenticated`) | `private.cobros_confirm_charge` · `private.cobros_apply_provider_payment` · **`private.cobros_undo_confirmation`** · **`private.cobros_revert_charge`** |
| Las dos operaciones que retroceden `paid_through` | **«Deshacer confirmación»** (R8: coach, última confirmación de la cuota, ≤ 7 días, auditada) · **«Reversa»** por reembolso o contracargo (R9: cuota → `refunded`\|`charged_back`, E11 + C7). **Nunca** «Anular pago» ni `reverse-payment.service.ts` |
| Ancla previa | `student_payment_events.payload.previous_paid_through` (la escribe la confirmación, la lee `cobros_undo_confirmation`) |
| Gate del módulo | `resolveCobrosAccess(...)` en `@eva/cobros` (tier + `COBROS_BETA_COACH_IDS` + kill-switch) · `private.cobros_gate_enabled()` en SQL |
| Tarjeta del hub | `BUSINESS_TOOLS: BusinessToolDef[]` (`key: 'cobros'`, sección «Tu negocio») — **no** `ToolDef`, **no** `ModuleKey` (R20) |
| Literal RN del hint (R6) | `apps/mobile/lib/web-only-hint.ts` = «El cobro a tus alumnos se configura desde el computador» · variante de ficha: «El cobro de este alumno se configura desde el computador» (**sin dominio, sin split, iOS = Android**). **No** se crea `STORE_COBROS_SETUP_CAPTION` en `client-cap.ts` |
| Copy RN del corte | `STUDENT_ACCESS_COPY.blockScreen.unpaid` y `.ended` en `apps/mobile/lib/student-access-copy.ts` (hoy con el mismo texto) |
| Documentos del SDD | `SPEC.md` · `PLAN.md` · `TASKS.md` · `EMAILS.md` · `DATA-SECURITY.md` (DDL, lista única de migraciones M1..Mn según R17, threat model) · `TESTING-LEGAL.md` — los seis en `docs/specs/cobros-coach-alumno/`, creados en el mismo commit |
| Package | `@eva/cobros` (`packages/cobros`) |
| Bucket de Storage | `payment-receipts` (privado; path `<coach_id>/<client_id>/<charge_id>.<ext>`) |
| Envs | `COBROS_ENABLED` · `COBROS_GA` · `COBROS_MP_CLIENT_ID` · `COBROS_MP_CLIENT_SECRET` · `COBROS_MP_REDIRECT_URI` · `COBROS_WEBHOOK_TOKEN` · `COBROS_WEBHOOK_SIGNING_SECRET` · **`COBROS_WEBHOOK_REQUIRE_SIGNATURE`** (R22; default `false`, pasa a `true` cuando X1 confirme el secret — **nunca** `COBROS_WEBHOOK_SIGNATURE_ENFORCE`, que es una variante muerta) · `COBROS_OAUTH_ENC_KEY_V1` · `EVA_COBROS_EMAILS_DISABLED` |
| Edge Config | `COBROS_KILL_SWITCH` · `COBROS_BETA_COACH_IDS` |
| Headers del proxy | `x-student-billing-state` (`STUDENT_BILLING_STATE_HEADER`, el estado derivado) · `x-student-billing-until` (`STUDENT_BILLING_UNTIL_HEADER`, = `paidThrough`) · `x-student-billing-cuts-at` (`STUDENT_BILLING_CUTS_AT_HEADER`, = `cutsAt`). Los tres se setean solo en `due`/`due_soon` |
| Campo en `/api/mobile/config` (R7) | `studentAccess: { state: 'blocked', reason: 'unpaid' \| 'ended' }` + `studentBilling: { state, paidThrough, cutsAt, canClaim }` — el nombre es **`cutsAt`** (el de la función pura), nunca `dueUntil` |
| Componente RN | `<WebOnlyHint topic="cobros"/>` (sin `platform`; `topic="plan"` sigue usando `storePlanChangeCaption(platform)`) |
| Modos | `manual` · `mp_link` · `mp_subscription` |
| Periodicidades | `monthly` · `biweekly` · `quarterly` · `one_off` |
| Estados derivados (R1) | `off` · `ok` · `due_soon` · `due` · `unpaid` · **`ended`** — seis, cerrados. **No existe `recycling`** |
| Estados de cuota | `pending` · `claimed` · `paid` · **`refunded`** · **`charged_back`** · `expired` · `canceled` |
| Estados de `client_payments.status` | `paid` · `refunded` · `charged_back` · **`duplicate`** (R9; el duplicado va con `charge_id null`) |
| Campo obligatorio del plan | `client_billing_plans.description` (texto ≤ 140, R21) · `first_due_on` = valor inicial de `paid_through` (R2) |
| Columnas materializadas del plan (las lee el gate SQL **y** la función pura, para que no drifteen) | `client_billing_plans.effective_grace_days` (`effectiveGraceDays`) · `.module_enabled` (`moduleEnabled`, copia de `coach_billing_settings.enabled`) · `.claim_deferral_until` (`claimDeferralUntil`, R3) · `.engine_hold_at` (`engineHoldAt`: EVA perdió la señal de cobro ⇒ `off`, T18/T18b) · `.needs_manual_cancel` (suscripción que EVA ya no puede cancelar por API, R5) |
| Entradas del gate que no son columnas | `clientExcluded` (demo / archivado / inactivo / org / team) · `gateEnabled` (`COBROS_KILL_SWITCH` + `private.cobros_gate_enabled()`, default `true`) |
| Fuentes de pago | `manual` · `student_claim` · `mp_link` · `mp_subscription` |
| Aplicación de MercadoPago | «EVA Cobros» (prod) y «EVA Cobros (test)» (preview) — **distintas** de la app del billing EVA↔coach |

---

## 20. Referencias

- [PLAN](PLAN.md) · [TASKS](TASKS.md) · [EMAILS](EMAILS.md) · [DATA-SECURITY](DATA-SECURITY.md)
  (DDL, espejo SQL del gate, threat model T-01…T-22, tests SQL) · [TESTING](TESTING-LEGAL.md) (niveles A/B/C)
- Artifacts de origen: `artifact-rieles-del-cobro.html`, `artifact-pantallas-del-cobro.html`,
  `artifact-boton-de-cobro-del-coach.html`, `artifact-la-escalera-del-cobro.html`
- [Embudo Free→Pro](../embudo-free-pro/SPEC.md) — declara este feature como plan aparte (`:24`)
- [Pricing v3](../pricing-v3/SPEC.md) — el molde de la tabla de decisiones del owner
- [Pagos multigateway Flow (archivada)](../../archive/specs/pagos-multigateway-flow/SPEC.md) —
  referencia del puerto `PaymentsProvider` del billing EVA↔coach, que **este feature no toca**
- Reglas de tiendas: `apps/mobile/AGENTS.md`, sección «Pagos y tiendas»
- Gate de acceso vigente (el del coach moroso, **no confundir**): `apps/web/src/lib/student-access.ts`
