# 05 — Pagos y Operaciones

> **Actualizado:** 2026-04-22 America/Santiago (Sesión 8)
> **Fuentes:** SMOKE-TEST-P1-7-PAGOS.md, EVALUACION-PAGOS-CHILE.md (técnico), ESTADO-PROYECTO.md (pagos)

---

## Flujo Completo de Suscripción Coach

```
1. Coach elige plan en /register (paso 2: tier + ciclo)
   ↓
2. Resumen en paso 3 (plan / facturación / nutrición / total)
   ↓
3. Redirect a /coach/subscription/processing (spinner + polling)
   ↓
4. EVA llama POST /preapproval en MercadoPago
   → obtiene init_point (URL de pago de MP)
   ↓
5. Coach paga en UI de MercadoPago
   ↓
6. Webhook MP → /api/payments/webhook/route.ts
   → Verifica token Bearer + HMAC SHA256 (timing-safe compare)
   → Actualiza coaches: subscription_status, subscription_tier, subscription_mp_id
   → Registra subscription_event
   ↓
7. Processing page detecta status=active → redirect /coach/dashboard
```

---

## Estados del Coach

| Status | Significado | Acceso |
|--------|------------|--------|
| `trialing` | Trial activo | Completo (hasta trial_ends_at) |
| `active` | Suscripción activa | Completo |
| `canceled` | Canceló pero con período vigente | Completo hasta `current_period_end` |
| `pending_payment` | Sin pago confirmado | Bloqueado → /coach/reactivate |
| `expired` | Período terminó sin renovar | Bloqueado → /coach/reactivate |
| `past_due` | Pago fallido | Bloqueado → /coach/reactivate |
| `paused` | Pausado | Bloqueado → /coach/reactivate |

**Lógica de acceso (`coach-subscription-gate.ts`):**
```typescript
function hasEffectiveAccess(status, currentPeriodEnd): boolean {
    if (status === 'active' || status === 'trialing') return true
    if (status === 'canceled' && currentPeriodEnd > now) return true
    return false
}
```

`SUBSCRIPTION_BLOCKED_STATUSES = ['pending_payment', 'expired', 'past_due', 'paused']`
Nota: `'canceled'` **NO está** en esta lista desde Sprint 8 — tiene grace period.

---

## Webhook MercadoPago (`/api/payments/webhook/route.ts`)

### Seguridad
- `MERCADOPAGO_WEBHOOK_TOKEN` (Bearer obligatorio en producción)
- HMAC SHA256 en header `x-signature` (opcional — fallback por token si falta)
- Comparación timing-safe (`crypto.timingSafeEqual`)

### Eventos manejados

| Evento | Acción |
|--------|--------|
| `preapproval.authorized` | Activa cuenta: actualiza `subscription_status='active'`, `subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id`. Si había preapproval anterior, lo cancela en MP y guarda `superseded_mp_preapproval_id`. |
| `preapproval.cancelled` | Marca `subscription_status='canceled'`, preserva `current_period_end` |
| `preapproval.paused` | Marca `subscription_status='paused'` |
| Preapproval stale (id no coincide con `subscription_mp_id`) | Registra evento `stale` en `subscription_events`, no modifica estado |

### Tabla `subscription_events`

Registra cada cambio de estado de suscripción:

| Columna | Descripción |
|---------|-------------|
| `coach_id` | FK a coaches |
| `event_type` | `authorized` / `cancelled` / `paused` / `stale` / `activated` |
| `amount` | Monto del cobro |
| `status` | Estado resultante |
| `mp_preapproval_id` | ID del preapproval en MP |
| `created_at` | Timestamp del evento |

---

## Grace Period al Cancelar

**Sprint 8:** Cuando el coach cancela, **NO se nullea** `current_period_end`. El coach mantiene acceso hasta esa fecha.

Cambios clave:
- `cancel-subscription/route.ts`: preserva `current_period_end` al cancelar
- `coach-subscription-gate.ts`: `hasEffectiveAccess` considera `canceled + futuro`
- Dashboard muestra banner amarillo: "Tu suscripción fue cancelada. Acceso hasta [fecha]."
- Dialog de cancelación muestra: "Conservarás acceso hasta el [fecha]."

---

## Upgrade Mid-Cycle (sin doble cobro)

**Sprint 8:** Coach activo que cambia de plan NO paga dos veces.

Flujo:
1. Coach activo con `current_period_end` futuro inicia cambio de plan
2. `create-preference/route.ts` detecta `status === 'active' && current_period_end > now`
3. Pasa `startDate = current_period_end` al proveedor MP
4. MP crea nuevo preapproval con `auto_recurring.start_date = current_period_end`
5. Coach mantiene `status = 'active'` (sin interrupción)
6. Modal de confirmación muestra: "Plan X continúa hasta [fecha]. Plan Y arranca esa fecha por $Z."

---

## Reactivación desde `canceled`

**Sprint 1 (Sesión 1):** Coach en `canceled` sin período vigente que reactiva:
- `/coach/reactivate` crea nuevo preapproval
- `start_date = now + 60s` (no hereda fecha del preapproval antiguo)
- Evita cobros retroactivos o con fechas pasadas

---

## Rate Limiting en Endpoints Críticos

| Endpoint | Límite | Redis Key |
|----------|--------|-----------|
| Auth (login, register) | 40 req/min | `ratelimit:auth` |
| Payments (/api/payments/*) | 15 req/min | `ratelimit:payments` |
| Recipes search | 30 req/min | `ratelimit:recipes` |
| Email drip cron | Bearer token obligatorio | N/A |

Implementado con Upstash Redis. Fallback graceful (permite si Redis no disponible).

---

## Variables de Entorno Requeridas

### Producción obligatorias

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=          # Token de producción (empieza con APP_USR-)
MERCADOPAGO_WEBHOOK_TOKEN=         # Token secreto para verificar webhooks
MERCADOPAGO_PUBLIC_KEY=            # Para el frontend de checkout

# App
NEXT_PUBLIC_APP_URL=               # URL pública de la app (para webhooks y redirects)

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email drip cron
DRIP_CRON_TOKEN=                   # Bearer token para /api/internal/email-drip/run
```

### Opcionales (desarrollo/debug)

```bash
# USDA FoodData Central (scripts auditoría alimentos)
USDA_API_KEY=

# Performance logging
ENABLE_PERF_LOG_NAV=true
ENABLE_PERF_LOG_COACH_EMAIL=true

# Sandbox MP (solo para testing)
MERCADOPAGO_TEST_ACCESS_TOKEN=     # Token TEST-...
MERCADOPAGO_TEST_PAYER_EMAIL=      # Email del pagador de prueba
```

---

## Smoke Test Manual — P1.7

Ejecutar en **sandbox** con `MERCADOPAGO_ACCESS_TOKEN=TEST-...` y `MERCADOPAGO_TEST_PAYER_EMAIL` configurados.

### Preparación
1. Cuenta coach nueva o de prueba en estado `pending_payment` o `canceled`
2. URL pública para webhooks (ngrok o deploy preview de Vercel)
3. Variables de entorno sandbox configuradas

### Flujo A — Registro → pago → activación

1. Registrar coach con plan y ciclo válidos — **validación previa:** el correo no debe existir ya como usuario Auth ni como email huérfano en `clients` (RPC `check_platform_email_availability`). Si falla, la UI muestra error sin crear usuario duplicado.
2. Tras validación → creación Auth + fila `coaches` → redirige a `/coach/subscription/processing`
3. Completar checkout en MercadoPago hasta autorizar la tarjeta
4. Verificar redirección automática (webhook) o manual a `/coach/dashboard?subscription=active`
5. En Supabase verificar: `subscription_status = 'active'`, `subscription_mp_id` no nulo, `current_period_end` coherente con el plan

### Flujo B — Cancelar suscripción y grace period

1. Cancelar suscripción activa desde la app o via API
2. Confirmar en MP que el preapproval queda cancelado
3. Verificar que coach sigue con acceso hasta `current_period_end`
4. Tras vencer el período: confirmar bloqueo o redirección a `/coach/reactivate`

### Flujo C — Upgrade / nuevo preapproval (P2.4)

1. Coach **activo** inicia cambio de plan desde la UI
2. Completar pago del nuevo plan
3. Verificar webhook:
   - Preapproval anterior cancelado en MP
   - `coaches.subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id` alineados con nuevo plan
   - `superseded_mp_preapproval_id` guardado (y luego limpiado tras `authorized`)

### Flujo D — Reactivación desde `canceled`

1. Coach en `canceled` sin período vigente abre `/coach/reactivate` y elige plan
2. En MP (API o panel), confirmar que el preapproval creado tiene `auto_recurring.start_date` cercano a `now + ~60s`
3. No debe heredar fecha de una suscripción antigua

### Regresión webhook

1. Disparar notificación de preapproval **no actual** (id distinto de `subscription_mp_id` del coach)
2. No debe pisar estado de suscripción
3. Debe registrarse evento `stale` en `subscription_events`

**Marcar P1.7 como OK solo si todos los flujos relevantes pasan sin errores en logs ni inconsistencias en DB.**

---

## Migraciones y entornos Supabase

**Producción (EVA operativa):** RLS, `goal_weight_kg`, alimentos, pagos y demás migraciones históricas se aplicaron vía **MCP / flujo directo**; no dependas de que el árbol local liste todos los `.sql` antiguos.

**Repo actual (`supabase/migrations/`):** ver tabla en [`02-ROADMAP-PENDIENTES.md`](nuevabibliadelaapp/02-ROADMAP-PENDIENTES.md) (Sesión 8). Para un **proyecto nuevo** o un fork: usar `supabase migration list` / `supabase db push` y comparar con [`database.types.ts`](src/lib/database.types.ts).

### Paso a paso (entorno nuevo o drift)

```bash
supabase migration list
supabase db push
supabase db diff
```

---

## Provisionamiento manual de coaches (sin MP)

Para cuentas internas o QA sin pasar checkout:

- Script: [`scripts/create-coach-account.mjs`](scripts/create-coach-account.mjs) — requiere `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Valida email con `check_platform_email_availability` antes de crear.
- **Purga** de un correo (alumno o coach con datos dependientes): [`scripts/purge-platform-email.mjs`](scripts/purge-platform-email.mjs) con `--email` y `--yes` (irreversible).
- **Inventario:** [`scripts/list-coaches.mjs`](scripts/list-coaches.mjs) — lista emails/slugs y heurística “probable prueba” (`active`/`trialing` sin `subscription_mp_id`).

**No documentar contraseñas** en markdown del repo.

---

## Checklist Pre-Lanzamiento

### Supabase y BD
- [ ] Todas las migraciones aplicadas en producción con evidencia (panel Supabase + tipos alineados)
- [ ] RLS habilitado y revisado (24 tablas críticas — revalidar en panel si el proyecto se recreó)
- [ ] Service role key solo en servidor (nunca en cliente ni repo público)
- [ ] Backup automático confirmado en panel Supabase
- [ ] Índices en FKs frecuentes: `workout_logs(client_id, logged_at)`, `check_ins(client_id, created_at)`, `daily_nutrition_logs(client_id, log_date)`

### MercadoPago
- [ ] Credenciales de producción (`APP_USR-...`) en variables de entorno
- [ ] KYC completo en cuenta MP (RUT, cédula, cuenta bancaria, actividad SaaS)
- [ ] URL webhook apuntando a producción: `https://[dominio]/api/payments/webhook`
- [ ] `MERCADOPAGO_WEBHOOK_TOKEN` configurado en Vercel
- [ ] Límite de retiro desbloqueado (contactar soporte MP)
- [ ] Smoke test P1.7 completado y sin errores

### App y deploy
- [ ] Todas las variables de entorno en Vercel/hosting
- [ ] Dominio con TLS activo
- [ ] `NEXT_PUBLIC_APP_URL` correcto (para redirects y webhooks)
- [ ] `middleware.ts` verificado con `SUBSCRIPTION_BLOCKED_STATUSES` correcto
- [ ] `coach-subscription-gate.ts` verificado con `current_period_end` correcto

### Post-deploy día 0–7
- [ ] Monitor de errores activo (Vercel logs / Sentry)
- [ ] Revisión diaria de tabla `subscription_events` en BD
- [ ] Canal de soporte con plantillas listas (`contacto@eva-app.cl`)
- [ ] Smoke post-deploy: registrar alumno → log set → check-in en producción

---

## Cómo Integrar un Nuevo Proveedor (guía rápida)

La interfaz `PaymentsProvider` en `src/lib/payments/types.ts` ya está preparada:

```typescript
export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe' // agregar | 'flow' | 'transbank'
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
    processWebhook(payload: unknown): Promise<WebhookProcessResult>
    fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot>
    cancelCheckoutAtProvider(checkoutId: string): Promise<void>
}
```

**Pasos para agregar Flow.cl (3-4 días):**

1. Crear `src/lib/payments/providers/flow.ts` implementando `PaymentsProvider`
2. Registrar en factory `src/lib/payments/providers/index.ts`
3. Agregar `'flow'` a los tipos del campo `payment_provider` en DB (ya existe el campo en `coaches`)
4. Agregar selector de proveedor en `src/app/(auth)/register/` paso 2
5. El endpoint `/api/payments/webhook/route.ts` ya detecta proveedor desde BD del coach — solo agregar handling del payload de Flow

**Esfuerzo estimado por proveedor:**

| Proveedor | Días |
|-----------|------|
| Flow.cl | 3–4 días |
| WebPay OneClick (Transbank) | 5–7 días (flujo inscripción + scheduler) |
| Stripe | 2–3 días (SDK excelente, stub ya existe) |
