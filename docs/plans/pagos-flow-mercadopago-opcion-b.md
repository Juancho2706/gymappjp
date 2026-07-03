# Informe: Pagos multi-gateway — Flow + MercadoPago (Opción B)

> Fecha: 2026-06-30 · Autor: research + diseño (Claude) · Estado: **informe / pre-spec** (no implementado)
> Objetivo: ofrecer DOS pasarelas en paralelo (Flow.cl + MercadoPago) detrás de un puerto común `PaymentGateway`, con cobro recurrente CLP y webhooks normalizados.
> Datos técnicos de Flow marcados **[VERIFICADO jun-2026]** salen de las docs oficiales `developers.flow.cl` (25/25 claims confirmados, verificación adversarial 3-0).

---

## 0. Veredicto en una línea

**La Opción B es técnicamente viable y de trabajo acotado.** Flow tiene suscripciones nativas (Flow agenda y reintenta el cobro, igual que el `preapproval` de MercadoPago), auth simple (HMAC-SHA256), sandbox aislado, y un webhook con la MISMA forma que el de MP (notificación con id → consultar estado). Eso hace natural meter ambas detrás de un puerto único. **El único pendiente que decide el "por qué negocio" (confianza vía Webpay) es empírico:** ninguna fuente aclara si el pagador ve la página REAL de Transbank o un contenedor Flow-branded → **hay que hacer un pago de prueba en sandbox y mirarlo con los ojos antes de comprometerse por ese motivo.**

---

## 1. Contexto y objetivo

- **Quién:** EVA Technology SpA (constituida, RUT, cuenta BancoEstado Empresas). SaaS B2B: cobra suscripción mensual/anual a coaches (~15.000-30.000 CLP/mes) + one-time (add-ons).
- **Hoy:** MercadoPago `preapproval` (suscripción recurrente) YA integrado y en prod, con capa de money-safety endurecida (`billing_snapshots`, dunning, card-change, materialización de add-ons vía webhook).
- **Por qué sumar Flow:** conversión por **confianza**. Flow surfacea Webpay + medios chilenos favoritos. El chileno reconoce Webpay y completa el pago. Es un empujón de conversión, no ahorro de comisión (Flow ~3,4% ≈ MP).
- **Opción B (elegida):** Flow **+** MercadoPago corriendo en paralelo. Dos botones al checkout: "Pagar con Webpay/Flow" y "Pagar con MercadoPago". Ambos detrás de una interface común.

---

## 2. Hallazgos verificados de Flow (implementación)

### 2.1 Cobro recurrente / suscripciones **[VERIFICADO jun-2026]**

Flow tiene modelo NATIVO de suscripciones ("Cargo Automático"). Secuencia fija de 5 pasos + endpoints REST:

| Paso | Endpoint | Qué hace |
|---|---|---|
| 1. Crear plan | `POST /plans/create` (ojo: plural) | Define monto, frecuencia (diaria/semanal/mensual/anual), reintentos, trial |
| 2. Crear cliente | `POST /customer/create` | Crea el `customerId` del coach |
| 3. Registrar tarjeta | `POST /customer/register` | Devuelve **URL + token** para que el coach enrole su tarjeta (redirección) |
| 4. Verificar registro | `GET /customer/getRegisterStatus` | Confirma que la tarjeta quedó asociada |
| 5. Suscribir | `POST /subscription/create` | Asocia `customerId` ↔ `planId` → **Flow empieza a cobrar solo** |

- **Flow AGENDA y EJECUTA el cobro recurrente por sí mismo** según la frecuencia del plan. El comercio NO dispara cada ciclo → funcionalmente equivalente al `preapproval` de MP.
- **One-time (add-ons):** `POST /customer/charge` = débito inmediato sobre una tarjeta ya registrada. Útil para add-ons sobre un coach que ya tiene tarjeta enrolada.
- **Modo dual:** (1) suscripción agendada por Flow, (2) direct-charge merchant-initiated vía `/customer/charge`.

### 2.2 Reintentos / dunning **[VERIFICADO jun-2026]**

- Los planes definen `charges_retries_number` (**default 3**). Flow corre los reintentos, no el comercio.
- Errores legibles vía `payment/getStatusExtended` → objeto `lastError`: **-1 = tarjeta inválida, -8 = tarjeta expirada**.
- Planes soportan `trial_period_days`, cupones de descuento, duración del período. `trial_period_days` es el único campo modificable con suscriptores activos.

### 2.3 Autenticación + firma **[VERIFICADO jun-2026]**

- Credenciales: `apiKey` + `secretKey` (dashboard → Integraciones → "Mis datos").
- **Firma HMAC-SHA256 por request:**
  1. Ordenar params alfabético ascendente (excluir `s`).
  2. Concatenar como `nombreValor` sin separador. Ej: `amount=5000, apiKey=XXXX, currency=CLP` → `"amount5000apiKeyXXXXcurrencyCLP"`.
  3. `crypto.createHmac('sha256', secretKey).update(toSign).digest('hex')`.
  4. Agregar el hex como parámetro `s`.
- `apiKey` viaja en los params; `secretKey` NUNCA se transmite (solo firma).
- **No hay SDK oficial de Node.** Clientes de comunidad: `EstebanFuentealba/flowcl-node-api-client`, `nicotordev/flowcl-pagos`. El esquema HMAC es trivial → **conviene adaptador propio en TypeScript** (menos dependencia de terceros, control total).

### 2.4 Sandbox **[VERIFICADO jun-2026]**

- Sandbox: `https://sandbox.flow.cl/api` (registro y credenciales separadas, plata falsa).
- Producción: `https://www.flow.cl/api`.
- Cuentas aisladas: sandbox no procesa prod ni viceversa. Equivalente al sandbox de MP en preview.

### 2.5 Webhook / confirmación **[VERIFICADO jun-2026]**

- Flow hace `POST` server-to-server a la `urlConfirmation` (definida al crear la orden), `Content-Type: application/x-www-form-urlencoded`, **body con UN solo parámetro: `token`**.
- El comercio DEBE responder **HTTP 200 en <15s** (ideal 1-10s).
- Luego el comercio llama `GET /payment/getStatus` con ese `token` (`apiKey`, `token`, `s`) para resolver el estado real.
- **Patrón idéntico en forma al de MP** (notificación con id → consultar API) → normalización natural a un evento único.
- `urlConfirmation` = server-to-server (fuente de verdad). `urlReturn` = redirect del browser (solo UX).
- Si no respondés 200, Flow manda un email "Alerta: Problema de integración - Flow" (NO reintentos indefinidos → **la idempotencia y el re-fetch los maneja tu diseño, no Flow**).

### 2.6 Comisión **[VERIFICADO jun-2026]**

- **2,89% + IVA** (abono al 3er día hábil) **o 3,19% + IVA** (abono al día hábil siguiente). Costo fijo **$0**.
- **Misma tarifa** para Cargo Automático/recurrente que para tarjeta one-time. Sin recargo por suscripción.
- Aplica a Webpay, débito/crédito/prepago, wallets (Mach, OnePay, Tapp).
- Nota: es "+IVA" → costo efectivo depende del tratamiento tributario (crédito fiscal si emitís factura afecta). **Validar con contador.**

### 2.7 Medios y Webpay **[VERIFICADO parcialmente]**

- Flow surfacea: **Webpay** (débito/crédito/prepago bancarias), Onepay, MACH, Khipu, Servipag, ETpay, Banca.me, FlowPay, Cargo Automático, POS. Configurable por comercio.
- Dentro de Webpay, el pagador es "derivado a su banco" (flujo 3DS/Webpay Plus real).
- ⚠️ **ABIERTO (decisivo para el negocio):** ninguna fuente aclara si el pagador ve la página **GENUINA de Transbank/Webpay** o un **contenedor Flow-branded**. → **Verificar con un pago de prueba real en sandbox y mirar la UI/URL.** Este es el punto que justifica (o no) toda la Opción B por "confianza".

---

## 3. Arquitectura propuesta

### 3.1 Puerto común `PaymentGateway` (domain/services)

Una interface que abstrae ambos proveedores. Todo el resto de la app habla con el puerto, nunca con Flow/MP directo.

```
interface PaymentGateway {
  createSubscription(input): { provider, externalId, initPointOrRegisterUrl }
  cancelSubscription(externalId): void
  chargeOneTime(input): { provider, externalId, status }   // add-ons
  parseWebhook(rawBody, headers): { provider, externalId, kind }  // devuelve identificador
  fetchAuthoritativeStatus(externalId): NormalizedPaymentEvent    // el "source of truth"
}
```

Implementaciones: `MercadoPagoGateway` (ya existe, refactor a la interface), `FlowGateway` (nueva). Futuro: `TransbankGateway`.

### 3.2 Normalización de webhooks → 1 evento de dominio

**Clave para no reescribir la money-safety 2 veces.** Ambos webhooks se traducen a un `NormalizedPaymentEvent` interno único:

```
NormalizedPaymentEvent {
  provider: 'mercadopago' | 'flow'
  externalId: string          // MP: payment/preapproval id · Flow: token/commerceOrder
  kind: 'payment.approved' | 'payment.failed' | 'subscription.charged' | 'subscription.cancelled'
  amountClp, currency, paidAt, subscriptionRef, ...
}
```

Tu capa existente (`billing_snapshots`, dunning, materialización de add-ons) consume ESTE evento, no el formato crudo. Se escribe/adapta **una vez** detrás del puerto.

Ambos siguen el patrón **notificación → consulta autoritativa**:
- MP: webhook con `id` → `GET /v1/payments/{id}` o `/preapproval`.
- Flow: `POST token` → `GET /payment/getStatus`.

### 3.3 Cambios de DB (Supabase)

- Nueva columna `provider` en la tabla de suscripciones (`'mercadopago' | 'flow'`), default `'mercadopago'` para las existentes.
- Guardar `provider_external_id` (id de la suscripción/preapproval en el proveedor) + para Flow el `customerId` y `planId`.
- Idempotencia por `(provider, provider_payment_id)` en `billing_snapshots` (hoy es por `provider_payment_id` — ampliar la clave para evitar colisión entre proveedores).
- ⚠️ **Column-level grants gotcha (CLAUDE.md):** toda columna nueva editable user-scoped exige `GRANT UPDATE(col)` en la MISMA migración. Estas columnas de billing son **service-role-only** (compra-only), así que NO se grantean a `authenticated` — se escriben solo desde el webhook/service.

---

## 4. Plan paso a paso (fases)

### Fase 0 — Verificación empírica (ANTES de codear) 🔴 bloqueante del "por qué"
1. Crear cuenta **sandbox** Flow (`sandbox.flow.cl`).
2. Hacer un pago de prueba con Webpay en el checkout de Flow.
3. **Observar:** ¿se ve la página real de Transbank/Webpay o un contenedor Flow? Sacar screenshot. → Decide si la Opción B se justifica por confianza.
4. En paralelo: pedir a Flow (comercial/soporte) requisitos de **alta de SpA** (RUT, inicio actividades, docs, contrato, plazo de abono real a BancoEstado). *(No verificado en la investigación.)*

### Fase 1 — Puerto + refactor MP (sin cambio de comportamiento)
5. Definir `PaymentGateway` interface + `NormalizedPaymentEvent` en `domain/`/`services/`.
6. Refactorizar la integración MP actual detrás de `MercadoPagoGateway` implementando la interface. **Sin cambiar comportamiento** — solo mover código detrás del puerto. Typecheck + tests verdes.
7. Migración DB: agregar `provider` (default `mercadopago`) + columnas de external ids. Backfill de las suscripciones vivas a `provider='mercadopago'`.

### Fase 2 — `FlowGateway` (sandbox)
8. Adaptador propio TS: cliente HMAC (`sign()`, `post()`, `get()`) contra `sandbox.flow.cl/api`.
9. Implementar métodos del puerto: crear plan(es), `customer/create`, `customer/register` (redirección de enrolamiento), `getRegisterStatus`, `subscription/create`, `customer/charge` (one-time), `payment/getStatus`.
10. Endpoint webhook Flow (`/api/payments/flow/webhook`): recibe `POST token`, responde 200 <15s, encola/consulta `getStatus`, emite `NormalizedPaymentEvent`.
11. Conectar el evento normalizado a la money-safety existente (snapshots, dunning, add-ons).

### Fase 3 — UI de checkout (dos botones)
12. En el flujo de suscripción del coach, ofrecer elección de pasarela: **"Pagar con Webpay (Flow)"** vs **"Pagar con MercadoPago"**. Logo Webpay prominente.
13. Manejar el redirect de enrolamiento de tarjeta de Flow (paso 3) + `urlReturn`.
14. Estados: pendiente de registro de tarjeta, activo, fallido, en dunning.

### Fase 4 — QA en sandbox (money-safety)
15. Testear en sandbox: alta de suscripción, cobro recurrente exitoso, cobro fallido (tarjeta -1/-8), reintentos, cancelación, cambio de tarjeta, one-time add-on.
16. Verificar idempotencia (doble webhook = un solo snapshot), reconciliación (plata Flow + MP suman en el panel de finanzas).
17. Verificar emisión de **boleta/factura DTE** desde el evento normalizado (independiente del gateway — ver informe de pagos previo).

### Fase 5 — Go-live gradual
18. Afiliación productiva Flow (RUT SpA) + credenciales prod + `www.flow.cl/api`.
19. Flag de rollout: habilitar Flow para coaches nuevos primero.
20. Suscripciones MP existentes **siguen en MP** (no se tocan). Migración opcional y gradual.
21. Monitorear webhooks (el email "Alerta: Problema de integración" de Flow es señal de que no respondiste 200).

---

## 5. Riesgos y pendientes por verificar

| # | Pendiente | Impacto | Cómo resolver |
|---|---|---|---|
| 1 | **¿Webpay real o Flow-branded?** | Decide el "por qué" del proyecto | Pago de prueba en sandbox (Fase 0) |
| 2 | Alta de SpA en Flow (requisitos, contrato, plazo abono real) | Planificación go-live | Contactar comercial Flow |
| 3 | ¿Flow manda webhook de invoice separado por cada ciclo recurrente? ¿`/invoice/get`? | Mapeo del evento recurrente vs `subscription_authorized_payment` de MP | Revisar docs de suscripción / probar en sandbox |
| 4 | Money-safety ×2 | El 70% del esfuerzo real | Se domina con la normalización (§3.2): reescribís dunning/reconciliación una vez |
| 5 | Sin SDK oficial Node | Bajo | Adaptador propio (HMAC trivial) |
| 6 | Comisión "+IVA" y tratamiento tributario | Costo real | Validar con contador |
| 7 | Boleta/DTE | Legal (ortogonal al gateway) | Ver informe pagos previo: emitir DTE propio desde el evento normalizado |

---

## 6. Trabajo estimado (orden de magnitud, no compromiso)

- Fase 0 (verificación): horas.
- Fase 1 (puerto + refactor MP): 1-2 días.
- Fase 2 (FlowGateway sandbox): 2-4 días.
- Fase 3 (UI): 1-2 días.
- Fase 4 (QA money-safety): 2-3 días (lo más delicado).
- Fase 5 (go-live): horas + espera de afiliación Flow.

El grueso NO es el happy-path Flow (bien documentado) — es **replicar la money-safety** y el **QA de renovaciones fallidas**. La normalización a evento único es lo que evita duplicar ese trabajo.

---

## 7. Fuentes (todas VERIFICADO jun-2026 salvo indicado)

- Flow API general: https://developers.flow.cl/en/api
- Suscripciones (integración): https://developers.flow.cl/en/docs/suscripciones/integration-flow
- Planes de suscripción: https://developers.flow.cl/en/docs/category/planes-de-suscripci%C3%B3n
- Registro de tarjeta: https://developers.flow.cl/en/docs/suscripciones/register-card
- Firma/intro: https://developers.flow.cl/en/docs/intro · quick-start: https://developers.flow.cl/en/docs/quick-start
- Confirmación (webhook): https://developers.flow.cl/en/docs/tutorial-basics/order-confirmation
- getStatus: https://developers.flow.cl/en/docs/tutorial-basics/status
- Tarifas: https://web.flow.cl/es-cl/tarifas/
- Cargo Automático FAQ: https://web.flow.cl/es-cl/preguntas-frecuentes/cargo-automatico/
- Webpay FAQ: https://web.flow.cl/es-cl/preguntas-frecuentes/webpay/
- Clientes comunidad Node: https://github.com/EstebanFuentealba/flowcl-node-api-client · https://github.com/nicotordev/flowcl-pagos

> **Abierto (no verificado):** branding Webpay real vs Flow, onboarding SpA/plazo abono BancoEstado, webhook de invoice recurrente, adaptador propio vs comunidad. Resolver en Fase 0.
