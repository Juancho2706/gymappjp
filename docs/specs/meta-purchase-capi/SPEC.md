---
status: draft
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# SPEC — Píxel de compra (Meta `Purchase` por servidor) en MP y Flow

> Cada vez que un coach **paga de verdad** por primera vez, Meta recibe un `Purchase` con el monto real,
> sin importar si pagó por Mercado Pago o por Flow (Webpay) y sin depender de que acepte cookies.
>
> Origen: tarea de Sergio (marketing) en el correo «Tarea Sergio», 26-09: «Hacer pixel de compra a los
> dos flujos». Estado: **borrador** — esperan D1–D4 (§4). Plan en [PLAN.md](PLAN.md); tareas en
> [TASKS.md](TASKS.md).

## 1. Qué hay hoy (HEAD `822153a7`)

- Solo se envía `CompleteRegistration` (navegador + servidor, con el mismo `eid`):
  `app/(auth)/register/_actions/register.actions.ts` y `app/coach/onboarding/complete/_actions/complete.actions.ts`.
- `Purchase`, `Subscribe` e `InitiateCheckout` están **tipados pero nadie los dispara**
  (`lib/meta/pixel.ts:18-27`, `lib/meta/capi.ts:27-34`).
- Todo cobro real aprobado termina en `insertBillingSnapshot` (`services/billing/addon-webhook.service.ts:68`),
  **idempotente por `(provider, provider_payment_id)`** y con el monto cobrado (`total_clp`). Devuelve
  `{ inserted }`. Llamadas: `lib/payments/webhook-pipeline.ts:365` (recurrente MP/Flow), `:537`
  (prorrateo de add-on), `:951` y `:1513` (recurrente), y `app/api/payments/flow/confirm-enrollment/route.ts:523`
  (primer cobro Flow, `invoice:<id>`).
- LIVE: 15 cobros desde junio, de 11 coaches (MP 8 cobros / 4 coaches; Flow 7 / 7).

## 2. El problema técnico que hay que esquivar

`sendMetaCapiEvent` sin `context` llama a `collectMetaCapiContext()` (`lib/meta/capi.ts:130`), que lee
headers y cookies **del request actual**. En un webhook ese request es de los servidores de MP o de Flow:
Meta recibiría la IP y el navegador de MP como si fueran del coach, y sin `fbp`/`fbc`. Eso ensucia el cruce
de datos en lugar de mejorarlo. Además `sendMetaCapiEvent` no tiene timeout (`fetch` sin `AbortSignal`) y
hubo un `ETIMEDOUT` a graph.facebook.com el 18-08: un webhook de pago no puede quedar colgado por Meta.

## 3. Requisitos

**R1 · Un solo enganche.** Después de `insertBillingSnapshot` con `inserted === true` se envía el evento.
Así cubre MP y Flow, los webhooks repetidos no duplican (lo garantiza el UNIQUE de la base) y el evento
lleva el monto real.

**R2 · Solo el primer pago del coach** (D1). Los cobros siguientes no se envían.

**R3 · Contexto correcto.** Se envía siempre con `context` explícito, **nunca** el del request del webhook:
`fbp`, `fbc` y user agent guardados cuando el coach eligió medio de pago (D2), `clientIpAddress: null`.
Datos del usuario: email del coach (desde `auth.users`) y `externalId = coach.id`, hasheados por el helper.

**R4 · Nunca rompe un pago.** try/catch propio + `AbortSignal.timeout(3000)` en el `fetch` del helper
(mejora también el registro). Si Meta falla, el webhook responde igual.

**R5 · Fuera las cuentas de prueba y las cortesías.** `isTestCoachEmail` (`lib/test-accounts.ts:44`) y
cobros de `payment_provider = 'internal'` no se envían.

**R6 · Datos del evento.** `event_name: 'Purchase'` (D3), `event_id: purchase:<provider>:<provider_payment_id>`,
`value: total_clp` entero, `currency: 'CLP'`, `content_name: '<tier>_<ciclo>'`, `action_source: 'website'`,
`event_source_url: https://www.eva-app.cl/coach/subscription`.

**R7 · Observabilidad.** Log `[meta-capi] enviado Purchase <eid>` (ya existe en el helper) y fila en
`admin_audit_logs` `meta.purchase_sent` con `provider` y `total_clp` (sin PII) para auditar después.

## 4. Decisiones del owner (pendientes)

- **D1 · Qué cobros se envían.** (a) **Solo el primer cobro de cada coach.** **Recomendada**: es la
  conversión que produce el anuncio; las renovaciones caen fuera de la ventana de atribución y solo meten
  ruido. (b) Todos los cobros (sirve para medir ingresos totales en Meta, pero infla «compras»).
- **D2 · Contexto del navegador.** (a) **Guardar `fbp`, `fbc` y el user agent** en el payload del intent
  (`persistCheckoutIntent`, `lib/payments/checkout-intent.ts:81`) cuando el coach elige medio de pago; la IP
  no se guarda (Ley 21.719: mínimo necesario). **Recomendada.** (b) Enviar sin contexto con
  `action_source: 'system_generated'`: más simple, pero Meta casi no puede atribuirlo a un anuncio.
- **D3 · Nombre del evento.** (a) **`Purchase`**, que es lo que pidió Sergio y lo que Ads Manager muestra
  como «Compras». **Recomendada.** (b) `Subscribe` (más preciso para suscripciones, menos usado en
  reportes).
- **D4 · Espejo en el navegador.** (a) **No en v1**: el píxel del navegador depende de las cookies y la
  vuelta desde MP/Flow no siempre pasa por una página nuestra. **Recomendada.** (b) Sumarlo en
  `processing`/`flow-processing` con el mismo `eid`.

## 5. Expectativa honesta para Sergio

Con ~2–5 primeros pagos al mes, Meta **no puede optimizar las campañas por `Purchase`** (necesita del orden
de 50 por semana). Sirve para **medir** qué campaña trae coaches que pagan (retorno por campaña). Las
campañas deberían seguir optimizando por «Registro completo».

## 6. Fuera de alcance

App móvil (el pago siempre ocurre en la web), `InitiateCheckout` (se puede sumar después con el mismo
patrón), Test Events de Meta (el helper no soporta `test_event_code`; la verificación es por logs de Vercel).

## 7. QA del owner

1. Un coach real paga por MP ⇒ en Vercel aparece `[meta-capi] enviado Purchase purchase:mercadopago:<id>`
   una sola vez, aunque MP repita el webhook.
2. Un coach real paga por Flow ⇒ igual, con `purchase:flow:invoice:<id>`.
3. La renovación del mes siguiente del mismo coach **no** envía nada (D1a).
4. Una cuenta de prueba que paga no envía nada.
5. En Events Manager, «Compras» aparece con método «Servidor» y el valor en CLP (lag de 1–3 h).
