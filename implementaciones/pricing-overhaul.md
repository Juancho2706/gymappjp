# EVA — Pricing Overhaul: Documento Maestro
### Freemium + Growth Tier + Annual Billing + Conversión

> **Estado:** Aprobado para implementación  
> **Fecha:** Mayo 2026  
> **Última actualización:** Revisión 4 — anti-abuso + code deep-dive · 22 gaps totales resueltos  
> **Autores del análisis:** Software Architect · Backend · Frontend · DevOps · QA · SecOps · SRE · PM · UX · Data · Sales · SDR · CSM · Onboarding · Marketing · Legal Chile · Fintech · FinOps

---

## Índice

1. [Por qué hacemos esto](#1-por-qué-hacemos-esto)
0. [Decisiones resueltas — referencia rápida](#0-decisiones-resueltas--referencia-rápida)
2. [Nueva estructura de planes](#2-nueva-estructura-de-planes)
3. [Software Architect](#3-software-architect)
4. [Senior Backend Engineer](#4-senior-backend-engineer)
5. [Senior Frontend Engineer](#5-senior-frontend-engineer)
6. [DevOps / Infrastructure Engineer](#6-devops--infrastructure-engineer)
7. [QA Automation Engineer](#7-qa-automation-engineer)
8. [Security Engineer (SecOps)](#8-security-engineer-secops)
9. [Site Reliability Engineer (SRE)](#9-site-reliability-engineer-sre)
10. [Product Manager (PM)](#10-product-manager-pm)
11. [UX / UI Designer](#11-ux--ui-designer)
12. [Data Scientist / Data Analyst](#12-data-scientist--data-analyst)
13. [Head of Sales (B2B Enterprise)](#13-head-of-sales-b2b-enterprise)
14. [SDR — Sales Development Representative](#14-sdr--sales-development-representative)
15. [Customer Success Manager (CSM)](#15-customer-success-manager-csm)
16. [Implementation Specialist (Onboarding)](#16-implementation-specialist-onboarding)
17. [Marketing & Growth Lead](#17-marketing--growth-lead)
18. [Legal & Compliance — Chile](#18-legal--compliance--chile)
19. [Fintech / Integrations Specialist](#19-fintech--integrations-specialist)
20. [FinOps Specialist](#20-finops-specialist)
21. [Roadmap de implementación (olas)](#21-roadmap-de-implementación-olas)
22. [Verificación end-to-end](#22-verificación-end-to-end)

---

## 0. Decisiones resueltas — referencia rápida

Tabla de todas las decisiones no obvias que ya están tomadas. No re-discutir estas.

| Decisión | Qué elegimos | Por qué |
|----------|-------------|---------|
| Límite free plan | **3 alumnos** | 5 = mercado (Everfit). 3 = presión de upgrade más rápida. Coach con 3 alumnos valida el flujo pero no puede operar un negocio real. |
| Free plan permanente vs trial | **Permanente** | Trial time-limited crea presión artificial. Free permanente genera mejor word-of-mouth y conversión orgánica cuando el negocio crece. |
| Branding en free | **Sin white-label** | Branding es upgrade driver #1 de Free→Starter. Todos los competidores lo hacen así. El alumno ve colores EVA (`#007AFF`) — buena experiencia igual. |
| Nutrición en Starter | **Sin nutrición** | Nutrición es upgrade driver #1 de Starter→Pro. Gate en el momento de intención convierte al 12% vs 5% (Mixpanel data). |
| Annual billing en Starter/Pro | **Sí** | Planes anuales retienen 92% vs 68% mensual. 10-20% adopción reduce churn proyectado 17%. |
| Descuento anual | **20%** (sin cambio) | Competitivo con mercado (PT Distinction ~15%, Harbiz 25%). No cambiar. |
| Display de precio anual | **Mensualizado** | "$15.992/mes cobrado anualmente" no "$191.904". MyFitnessPal: +13% conversión a anual con este cambio. |
| Coaches `expired` existentes | **Migrar a free (Ola 6)** | Coach bloqueado nunca vuelve. Coach en free puede volver. Costo: ~$0.05/mes. |
| Feature flags | **PostHog + Edge Config** | PostHog gratis hasta 1M eventos, incluye analytics. Edge Config = kill switch &lt;30 segundos sin deploy. |
| Descuento SDR | **Admin panel manual** | Sin nuevo código. Admin activa plan con `billing_provider='admin'` y `period_end` en 30 días. Escala hasta ~50 deals/mes. |
| PostHog tracking usuarios existentes | **Anonimizado** hasta nueva ToS | Ley 21.719 requiere consentimiento explícito para tracking identificado. |
| Admin panel — tiers free/growth | **Sí los agrega** | Fundadores necesitan crear coaches free para testing/demos/soporte. Sin restricción especial. |

---

## 1. Por qué hacemos esto

### El problema actual

EVA no tiene plan gratuito ni trial público. Un coach que llega solo no puede probar — se va a Everfit, Sporty Chile o Trainerize. Además:

| Problema | Impacto |
|----------|---------|
| Sin free plan ni trial público | Sangrado de conversión en tope de funnel; competidores tienen free tier o trial sin CC |
| Starter y Pro solo mensuales | Churn alto; planes anuales retienen 92% vs 68% mensual (Recurly 2025) |
| Gap Elite ($44.990, 60 alumnos) → Scale ($190.000, 500 alumnos) | Coaches con 60–150 alumnos quedan sin plan — nicho no capturado |
| No hay upgrade prompts comportamentales | Prompts genéricos convierten al 5%; prompts en momento de intención convierten al 12% (Mixpanel) |

### La competencia

| Plataforma | Free tier | Trial | Precio entrada |
|-----------|-----------|-------|----------------|
| Everfit | ✅ 5 clientes permanente | 30 días | $19 USD |
| Trainerize | ✅ 1 cliente permanente | 30 días full-access | $9 USD |
| PT Distinction | ❌ | 30 días sin CC | $19.90 USD |
| Sporty Chile | ❌ | 7 días | $19.990 CLP |
| **EVA hoy** | ❌ | Solo admin-activado | $19.990 CLP |

---

## 2. Nueva estructura de planes

| Plan | Precio/mes | Alumnos | Nutrición | Branding | Billing disponible | Estado |
|------|-----------|---------|-----------|----------|--------------------|--------|
| **Free** | $0 | **3** | ❌ | ❌ | — | 🆕 Nuevo |
| **Starter** | $19.990 | 10 | ❌ | ✅ | Mensual + **Anual** | ➕ Agregar anual |
| **Pro** | $29.990 | 30 | ✅ | ✅ | Mensual + **Anual** | ➕ Agregar anual |
| **Elite** | $44.990 | 60 | ✅ | ✅ | Mensual / Trim. / Anual | Sin cambio |
| **Growth** | **$84.990** | **120** | ✅ | ✅ | Mensual / Trim. / Anual | 🆕 Nuevo |
| **Scale** | $190.000 | 500 | ✅ | ✅ | Mensual / Trim. / Anual | Sin cambio |

### Ladder de conversión (cada salto tiene trigger natural)

```
Free (3 alumnos, sin marca, sin nutrición)
  ↓ trigger: alumno #4 | quiero mi app con mi nombre
Starter (10 alumnos, branding propio, sin nutrición)
  ↓ trigger: alumno pide plan de nutrición
Pro (30 alumnos, nutrición completa)
  ↓ trigger: negocio crece, necesito más de 30
Elite (60 alumnos)
  ↓ trigger: academia, equipo, 60+ alumnos
Growth (120 alumnos)   ← gap antes inexistente
  ↓ trigger: gym grande, franquicia
Scale (500 alumnos)
```

### Precios anuales — display mensualizado

> Siempre mostrar equivalente mensual, no monto total anual. Dato: MyFitnessPal logró +13% conversión a anual con este cambio (A/B test publicado).

| Plan | Pago total anual | Display en UI | Ahorro vs mensual |
|------|-----------------|--------------|-------------------|
| Starter | $191.904 | **$15.992/mes** · cobrado anualmente | $48.984/año |
| Pro | $287.904 | **$23.992/mes** · cobrado anualmente | $71.976/año |
| Elite | $431.904 | **$35.992/mes** · cobrado anualmente | $107.976/año |
| Growth | $815.904 | **$67.992/mes** · cobrado anualmente | $203.976/año |
| Scale | $1.900.000 | **$158.333/mes** · cobrado anualmente | $380.000/año |

---

## 3. Software Architect

### Principio de diseño: extensión, no reescritura

El tipo `SubscriptionTier` y toda la lógica de billing/acceso son status-based, no tier-based. El free tier es simplemente un estado válido más en el sistema. No requiere nueva tabla ni nueva arquitectura — solo extender los registros existentes.

### Modelo de datos — cambios mínimos necesarios

```
coaches
  subscription_tier:  'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'
  subscription_status: 'active' (para free, sin pago)
  billing_cycle:       'monthly' (placeholder para free — sin efecto)
  max_clients:         3 (para free)
  trial_used_email:    email normalizado (prevención de abuso — campo ya existe en DB)
```

No se crean tablas nuevas. No se toca el schema de clientes, workouts, ni nutrition.

### Feature flag architecture

Dos capas:
1. **PostHog** (rollout gradual, targeting por `created_at`, porcentaje) — para nuevos signups
2. **Vercel Edge Config** (kill switch de emergencia, &lt;500ms, sin deploy) — para apagar todo instantáneamente

Los coaches existentes no son afectados por las flags. Las flags controlan solo la visibilidad del free tier en el registro.

### Downgrade cascade (cuando un coach pago cancela)

```
subscription expira
  → webhook MP: status = 'expired'/'cancelled'
  → server action: subscription_tier = 'free', subscription_status = 'active', max_clients = 3
  → alumnos > 3: quedan read-only (ver historial, no agregar ni modificar)
  → email al coach: "Tu plan expiró — tus 3 primeros alumnos siguen activos"
```

Esto reemplaza el estado "bloqueado" actual — reduce trauma de churn y facilita reactivación.

### Separación coach free vs coach pago en `/coach/*`

Todo comportamiento diferenciado ocurre dentro de la app vía `getTierCapabilities(tier)`. El middleware no discrimina por tier, solo por `subscription_status`. Un coach free con status 'active' pasa el middleware igual que un coach Pro con status 'active'.

---

## 4. Senior Backend Engineer

### Archivos a modificar

#### `src/lib/constants.ts`

```typescript
// 1. Extender el union type
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'

// 2. TIER_STUDENT_RANGE_LABEL
free: 'Hasta 3 alumnos',
growth: '61–120 alumnos',

// 3. TIER_CONFIG — agregar free y growth
free: {
    label: 'Free',
    maxClients: 3,
    monthlyPriceClp: 0,
    features: [
        'Rutinas ilimitadas con GIFs',
        'Catálogo de ejercicios con GIF',
        'Programas de entrenamiento',
        'Check-in y progreso',
        'Dashboard coach',
    ],
},
growth: {
    label: 'Growth',
    maxClients: 120,
    monthlyPriceClp: 84990,
    features: [...SHARED_TIER_FEATURES, 'Planes de nutrición'],
},

// 4. TIER_CAPABILITIES
free:   { canUseNutrition: false, canUseBranding: false, canUseAdvancedReports: false },
growth: { canUseNutrition: true,  canUseBranding: true,  canUseAdvancedReports: true  },

// 5. TIER_ALLOWED_BILLING_CYCLES
free:    [],
starter: ['monthly', 'annual'],        // CAMBIO
pro:     ['monthly', 'annual'],        // CAMBIO
elite:   ['monthly', 'quarterly', 'annual'],
growth:  ['monthly', 'quarterly', 'annual'],  // nuevo
scale:   ['monthly', 'quarterly', 'annual'],

// 6. getTierBillingCycleSummary — agregar casos nuevos
if (cycles.length === 0) return 'Plan gratuito'
if (cycles.includes('monthly') && cycles.includes('annual') && !cycles.includes('quarterly'))
    return 'Cobro mensual o anual'
```

#### `src/app/(auth)/register/actions.ts`

Cambios puntuales:
```typescript
// Línea 35 — agregar 'free' y 'growth' a la validación
const isTierValid = ['free', 'starter', 'pro', 'elite', 'growth', 'scale'].includes(selectedTier)

// Saltar validación de ciclo para free (no tiene ciclos)
if (selectedTier !== 'free' && !isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
    return { error: 'La frecuencia elegida no está disponible para ese plan.' }
}

// Al crear el coach row:
const isFreeTier = selectedTier === 'free'
await adminDb.from('coaches').insert({
    ...camposExistentes,
    subscription_status: isFreeTier ? 'active' : 'pending_payment',
    billing_cycle: isFreeTier ? 'monthly' : selectedBillingCycle,
    max_clients: getTierMaxClients(selectedTier),
    ...(isFreeTier && { trial_used_email: normalizePlatformEmail(email) }),
})

// Redirect diferenciado
if (isFreeTier) {
    redirect('/coach/dashboard?welcome=free')
}
redirect(`/coach/subscription/processing?from=register&tier=...`)
```

#### Migración SQL

```sql
-- timestamp: YYYYMMDDHHmmss_pricing_overhaul.sql
ALTER TABLE coaches DROP CONSTRAINT IF EXISTS coaches_subscription_tier_check;
ALTER TABLE coaches
  ADD CONSTRAINT coaches_subscription_tier_check
  CHECK (subscription_tier IN ('free','starter','pro','elite','growth','scale'));

-- Índice para queries analíticas y emails de free coaches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coaches_free_tier
  ON coaches(subscription_tier)
  WHERE subscription_tier = 'free';

-- Índice para coaches Growth (nuevo tier)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coaches_growth_tier
  ON coaches(subscription_tier)
  WHERE subscription_tier = 'growth';
```

#### Edge cases críticos

| Caso | Manejo |
|------|--------|
| Free coach intenta ir a `/coach/subscription/processing` | Redirigir a `/coach/dashboard` |
| Free coach cancela (no debería poder — no paga) | Guard en cancel action: if tier=free → no-op |
| Coach pago cancela → downgrade a free | Cron/webhook que cambia tier a 'free' al expirar (Ola 6) |
| `getTierPriceClp('free', 'monthly')` | Retorna 0 — funciona ya si monthlyPriceClp=0 |
| `isBillingCycleAllowedForTier('free', 'monthly')` | Retorna false (array vacío) — correcto |

---

## 5. Senior Frontend Engineer

### Patrón de modal de upgrade — Bottom Sheet (PWA)

En mobile (PWA), un **bottom sheet** de 55-65% de viewport convierte mejor que modal centrado. Es el patrón nativo que los usuarios esperan. En desktop, modal centrado estándar.

Usar Radix `Dialog` + detección de breakpoint. **Nunca `alert()`** — no funciona consistentemente en PWA instalada.

```
Mobile (bottom sheet):              Desktop (modal centrado):
┌────────────────────────────────┐  ┌──────────────────────────────────────┐
│                                │  │  [Ilustración]                       │
│                                │  │                                      │
│ ╔══════════════════════════╗   │  │  Agregá más alumnos a tu negocio     │
│ ║ [Ilustración]            ║   │  │  Para agregar el 4º alumno, pasá     │
│ ║ Agregá más alumnos       ║   │  │  al plan Starter.                    │
│ ║ Plan Starter incluye:    ║   │  │                                      │
│ ║ ✓ Hasta 10 alumnos       ║   │  │  ✓ Hasta 10 alumnos                  │
│ ║ ✓ Tu app con tu marca    ║   │  │  ✓ Tu app con tu marca               │
│ ║ ✓ $15.992/mes anual      ║   │  │  ✓ $15.992/mes con plan anual        │
│ ║                          ║   │  │                                      │
│ ║ [Ver planes →]           ║   │  │  [Ver planes →]    [Ahora no]        │
│ ║ [Ahora no]               ║   │  └──────────────────────────────────────┘
│ ╚══════════════════════════╝   │
│            ▓▓▓▓▓ (swipe bar)   │
└────────────────────────────────┘
```

**Safe area:** El botón CTA debe tener `pb-safe` para no quedar bajo el home indicator del iPhone.

**Botón CTA sticky:** En el sheet mobile, el botón "Ver planes" queda fijo abajo mientras el usuario scrollea los beneficios. No debe desaparecer.

### Registro — free path

```
Step 1: Nombre, marca, email, password (sin cambio)
Step 2: Selección de plan
  - Si free: ocultar selector de ciclo de billing
  - Si free: mostrar "Sin costo · Acceso inmediato"
Step 3: Resumen
  - Si free: "Crear cuenta gratuita" (sin mención de pago)
  - Si paid: flujo actual a MP
```

### Pricing page — cambios visuales

- Agregar card "Free" al inicio (con badge "Gratis para siempre")
- Agregar card "Growth" entre Elite y Scale
- Starter y Pro: mostrar precio anual con badge "−20%"
- Display anual: "$15.992/mes · cobrado anualmente" (no el total)
- Toggle mensual/anual: ahora funciona para Starter y Pro también

### Copy de upgrade modals — patrones que funcionan

| ❌ Evitar | ✅ Usar |
|-----------|---------|
| "Upgrade to Pro" | "Agregá más alumnos a tu negocio" |
| "Unlock premium features" | "Desbloqueá nutrición para [Nombre del alumno]" |
| "This is a paid feature" | "Tu alumno puede estar esperando un plan de alimentación" |
| "Upgrade required" | "Llegaste al límite de 3 alumnos en Free" |

### Dashboard banner para free coaches

Solo cuando el coach tiene 2+ alumnos (no saturar al usuario nuevo):

```
[🔒 Alumnos: ███░ 2/3  ·  Plan Free  ·  Expandir límite →]
```

Progress bar visual. Una sola línea, color gris sutil (no rojo — no queremos alarmar, queremos guiar).

### Gate de branding (nuevo — igual patrón que nutrición)

```typescript
// En src/app/coach/[ruta-de-branding]/page.tsx
const capabilities = getTierCapabilities(tier)
if (!capabilities.canUseBranding) {
    return <BrandingUpgradePage currentTier={tier} />
}
```

`BrandingUpgradePage`: mostrar preview de cómo se ve la app del alumno con branding propio vs sin branding. Imagen comparativa de alto impacto.

---

## 6. DevOps / Infrastructure Engineer

### Rollout en fases — nunca big bang

```
Semana 1-2:   Shadow mode — código detrás de flag OFF. Tests en staging.
Semana 2-3:   Preview interno — cuentas de fundadores + 2-3 coaches amigos.
Semana 3-4:   Nuevos signups solamente (created_at filter en PostHog targeting).
Semana 4+:    10% → 25% → 50% → 100% de nuevos signups. Monitorear en cada escalón.
```

### PostHog (feature flags + analytics + session replay)

Herramienta única para flags, funnels, cohorts y replay. Gratis hasta 1M eventos/mes. Instalar primero.

```bash
npm install posthog-js posthog-node
```

Flag: `free-tier-v1`
- Target: usuarios con `created_at >= '2026-XX-XX'`
- Rollout: porcentaje creciente
- Evaluación RSC: `posthog-node` en server components (no exposición de flag en cliente)

### Vercel Edge Config — kill switch de emergencia

```typescript
// middleware.ts
import { get } from '@vercel/edge-config'

const killSwitch = await get('free_tier_kill_switch') // boolean
if (killSwitch) redirect('/maintenance')
```

Actualizar desde Vercel dashboard en &lt;30 segundos, sin deploy. Primer nivel de respuesta ante abuso.

### Estrategia de rollback — 4 niveles

| Nivel | Tiempo | Acción | Cuándo |
|-------|--------|--------|--------|
| 1 | &lt;1 min | PostHog flag → 0% rollout | Problema de conversión, métricas bajas |
| 2 | &lt;30 seg | Edge Config kill switch | Spike de abuso, error crítico |
| 3 | &lt;5 min | Supabase RLS policy temporal | Abuso masivo en DB |
| 4 | Inmediato | Upstash: bajar rate limit signup de 10/h a 2/h por IP | Flood de signups falsos |

### Configuración de Upstash (ya en el env de la app)

```typescript
// src/app/(auth)/register/actions.ts — agregar al inicio
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 signups por IP por hora
    analytics: true,
})

const ip = headers().get('x-forwarded-for') ?? '127.0.0.1'
const { success } = await ratelimit.limit(`signup:${ip}`)
if (!success) return { error: 'Demasiados intentos. Intentá más tarde.' }
```

---

## 7. QA Automation Engineer

### Test cases críticos — Ola 1

**Happy path — registro free:**
1. Coach llega a `/register`, selecciona Free
2. Selector de billing cycle no aparece
3. Step 3 muestra "Crear cuenta gratuita" sin monto
4. Submit → coach creado con `subscription_status = 'active'`, `subscription_tier = 'free'`, `max_clients = 3`
5. Redirect a `/coach/dashboard?welcome=free` (no a `/coach/subscription/processing`)
6. Middleware NO redirige a `/coach/reactivate`

**Límite de alumnos — free:**
1. Free coach crea alumno 1, 2, 3 → OK
2. Intenta crear alumno 4 → modal de upgrade aparece (no toast, no 500)
3. Coach cierra modal → sigue en free, alumno no creado
4. Coach hace clic en "Ver planes" → navega a `/coach/subscription`

**Gates de features:**
1. Free coach navega a nutrición → pantalla de upsell (no 500)
2. Free coach navega a branding → pantalla de upsell
3. Free coach navega a `/coach/subscription/processing` → redirect a dashboard

**Regresión — planes existentes (CRÍTICO):**
1. Coach Starter mensual: flujo de registro sin cambios
2. Coach Pro mensual: flujo de registro sin cambios
3. Coach Elite trimestral: flujo sin cambios
4. Todos los webhooks MP siguen procesando correctamente
5. `getTierCapabilities('starter')` → `{ canUseNutrition: false, canUseBranding: true }` (sin cambio)

**Ola 2 — Annual billing:**
1. Starter puede seleccionar anual en registro → monto MP es $191.904 (no $19.990)
2. Pro puede seleccionar anual → monto MP es $287.904
3. Display en pricing page: "$15.992/mes · cobrado anualmente" con badge −20%

### E2E tests a agregar (Playwright)

```typescript
// tests/register-free.spec.ts
test('free coach registers without payment', async ({ page }) => {
    await page.goto('/register')
    // ... seleccionar free, completar form
    await expect(page).toHaveURL('/coach/dashboard?welcome=free')
    await expect(page.getByText('3')).toBeVisible() // límite visible
})

test('free coach blocked at 4th client', async ({ page }) => {
    // ... setup: free coach con 3 clientes
    // ... intento agregar cliente 4
    await expect(page.getByRole('dialog')).toBeVisible() // modal upgrade
})
```

---

## 8. Security Engineer (SecOps)

### Capas de protección contra abuso del Free plan

**Capa 1 — Rate limiting en signup (Upstash, ya configurado)**
- 5 signups por IP por hora (sliding window)
- `analytics: true` para detectar patrones en PostHog
- Threshold ajustable sin deploy (variable de entorno)

**Capa 2 — Validación de email al signup**
- Usar AbstractAPI Email Validation (free: 100 req/mes) o MailerCheck
- Bloquear: dominios desechables, MX record inválido
- Alertar: patrones `+suffix@gmail.com` repetitivos desde misma IP

```typescript
const emailCheck = await fetch(
    `https://emailvalidation.abstractapi.com/v1/?api_key=${key}&email=${email}`
)
const { is_disposable_email, deliverability } = await emailCheck.json()
if (is_disposable_email.value || deliverability === 'UNDELIVERABLE') {
    return { error: 'Por favor usá un correo válido.' }
}
```

**Capa 3 — `trial_used_email` (campo ya existe en DB)**
- Al crear coach free: guardar `normalizePlatformEmail(email)` en `trial_used_email`
- En `assertPlatformEmailAvailable` (ya existente): verificar si ese email ya tiene una cuenta free
- No bloquear completamente (falsos positivos con + alias) — mostrar aviso: "Este email ya tiene una cuenta gratuita. [Iniciar sesión]"

**Capa 4 — Device fingerprinting (FingerprintJS — open source, gratis)**
```bash
npm install @fingerprintjs/fingerprintjs
```
- Generar `visitorId` en client-side al llegar al register form
- Enviar con el form al server action
- Guardar en `coaches.metadata->>'device_fingerprint'`
- Query: si mismo device_fingerprint tiene &gt;2 cuentas en 7 días → alertar (no bloquear — demasiados falsos positivos en devices compartidos)

**Capa 5 — Supabase RLS como backstop**
```sql
-- Policy de emergencia (activar solo si hay abuso masivo)
CREATE POLICY "free_tier_client_hard_limit" ON clients
  AS RESTRICTIVE
  FOR INSERT
  USING (
    (SELECT subscription_tier FROM coaches WHERE id = coach_id) != 'free'
    OR (SELECT COUNT(*) FROM clients WHERE coach_id = coach_id) < 3
  );
```

**Flujo free → pago — seguridad de transición**
- El primer checkout MP de un coach free es idéntico al de un coach nuevo
- No hay información de pago almacenada en free (MP maneja todo)
- Verificar que `isBillingCycleAllowedForTier('free', cualquierCiclo)` devuelve false en el endpoint de checkout — previene que un request manipulado bypasee el tier

---

## 9. Site Reliability Engineer (SRE)

### Stack de observabilidad recomendado (equipo de 2)

| Herramienta | Propósito | Costo |
|-------------|-----------|-------|
| **PostHog Cloud** | Funnels, flags, session replay, cohortes, alertas | Gratis hasta 1M eventos/mes |
| **Sentry** | JS error tracking en PWA | Gratis hasta 5K errores/mes |
| **Vercel Analytics** | Core Web Vitals, page load | Gratis (Hobby) |
| **Supabase built-in logs** | DB queries, auth events, RLS violations | Incluido |
| **Upstash** | Rate limiting + analytics (ya configurado) | Gratis hasta 10K req/día |

### 5 dashboards PostHog — crear el día del lanzamiento

1. **Activación** — `signup → agregar_primer_alumno → crear_primer_workout → enviar_primer_plan`
2. **Funnel free→pago** — `free_account_created → upgrade_modal_shown → pricing_page_viewed → subscription_started`
3. **Retención por cohorte** — N-day retention por semana de signup
4. **Señales de abuso** — signups/hora, distribución de IPs, emails desechables bloqueados
5. **Adopción de features** — qué hace el coach free antes de convertir o churnar

### Eventos PostHog a instrumentar

```typescript
// Al mostrar cualquier gate de upgrade
posthog.capture('upgrade_gate_hit', {
    gate_id: 'client_limit' | 'nutrition' | 'branding',
    coach_id: coachId,
    current_tier: 'free',
    count_at_trigger: clientCount,
})

// Al cerrar el modal sin actuar
posthog.capture('upgrade_modal_dismissed', {
    gate_id: 'client_limit',
    time_in_modal_seconds: elapsed,
})

// Al iniciar el upgrade
posthog.capture('upgrade_initiated', {
    source: 'client_limit_modal' | 'nutrition_gate' | 'branding_gate' | 'dashboard_banner',
    target_tier: 'starter',
})
```

### Umbrales de alerta

| Alerta | Umbral | Urgencia |
|--------|--------|---------|
| Activación D+1 cae | &lt;30% de nuevos signups vuelven en 24h | Alta |
| Free→paid en 30 días | &lt;1% | Alta — problema de gating |
| Upgrade modal → pricing page | &lt;25% del baseline | Media — problema de UX |
| Signups por hora spike | &gt;5x promedio rolling | Alta — abuso potencial |
| Error rate PWA (Sentry) | &gt;0.5% sesiones con errores JS | Media |
| DB connection pool | &gt;80% saturación | Crítica |

### SLOs para free tier

- Disponibilidad del flujo de registro free: **99.5%** (toleramos más que el 99.9% de paid por ser gratis)
- Latencia p95 del dashboard coach free: **&lt;2 segundos** (misma que paid)
- Tiempo de respuesta de gates de upgrade: **&lt;200ms** (es solo una query de tier capabilities)

---

## 10. Product Manager (PM)

### User stories

**Coach nuevo sin cuenta:**
> Como coach sin cuenta, quiero probar EVA gratis con mis primeros 3 alumnos para decidir si vale la pena pagar, sin tener que ingresar mi tarjeta de crédito.

**Coach free que creció:**
> Como coach free con 3 alumnos activos, cuando intento agregar un 4º alumno, quiero entender claramente qué plan necesito y cuánto cuesta, para poder tomar la decisión de upgrade en ese momento.

**Coach Starter que quiere comprometerse:**
> Como coach Starter con facturación mensual, quiero poder cambiar a billing anual para ahorrar $48.984 al año sin tener que cambiar de plan.

**Coach con 80 alumnos (gap actual):**
> Como coach con 80 alumnos activos, quiero un plan que no me obligue a pagar por 500 slots que no necesito, para pagar proporcionalmente a mi negocio.

### KPIs de éxito — post-lanzamiento

| Métrica | Objetivo 30 días | Objetivo 90 días |
|---------|-----------------|-----------------|
| Registro free / semana | Baseline + 40% nuevos signups | Baseline + 60% |
| Free → paid conversión (30d) | &gt;5% | &gt;7% |
| Time to first client added | &lt;30 min median | &lt;20 min |
| Day-7 retention free coaches | &gt;20% | &gt;25% |
| Adopción anual en Starter/Pro | &gt;10% nuevos suscriptores | &gt;20% |
| Coaches en Growth (nuevo tier) | Mínimo 5 | Mínimo 20 |
| Churn mensual Starter/Pro | Baseline − 15% | Baseline − 20% |

### Criterios go/no-go para cada ola

**Ola 1 (Free tier):**
- `npm run typecheck` y `npm run build` pasan ✅
- Tests E2E nuevos pasan ✅
- 0 regresiones en tests existentes ✅
- Staging: flujo completo testeado por ambos fundadores ✅

**Escalar de 10% a 100%:**
- Tasa de activación (coach agrega ≥1 alumno en 24h) &gt;40%
- Sin anomalías de abuso (Upstash alerts)
- Error rate Sentry normal

### A/B test planificado: copy del upgrade modal

Variante A: "Llegaste al límite de 3 alumnos"  
Variante B: "Querés seguir creciendo con tus alumnos"

Métrica: click en "Ver planes" dentro del modal. PostHog experiment, 50/50 split. Duración: 30 días o 200 triggers.

---

## 11. UX / UI Designer

### Los 4 patrones de gate (elegir el correcto para cada feature)

| Patrón | Cuándo usar | Ejemplo en EVA |
|--------|-------------|----------------|
| **Hard Gate** — feature invisible/disabled hasta upgrade | Feature con ROI claro, usuario ya entiende qué es | Agregar alumno #4 |
| **Soft Gate (Teaser)** — usuario ve la interfaz pero no puede guardar | Feature donde la aha moment requiere ser vista | Vista previa de nutrición en free |
| **Usage-limit Gate** — progress bar + modal al límite | Límites cuantitativos claros | 3/3 alumnos, barra de progreso |
| **Progressive Disclosure** — multi-step antes de mostrar precio | Flujos de upgrade o pricing page | Página `/coach/subscription` para free coaches |

### Anatomía del upgrade modal (especificación)

```
┌─────────────────────────────────────────┐
│                                         │
│  [Ilustración o ícono — 48×48px]        │
│                                         │
│  Agregá más alumnos a tu negocio        │  ← H2: nombra el unlock, no "Go Pro"
│  Llegaste al límite de 3 alumnos en     │  ← 1 línea: contexto de dónde están
│  tu plan Free.                          │
│                                         │
│  ✓  Hasta 10 alumnos                    │  ← Máximo 3 bullets, específicos
│  ✓  Tu app con tu nombre y colores      │
│  ✓  $15.992/mes · cobrado anualmente    │  ← Precio mensualizado, no total
│                                         │
│  ┌─────────────────────────────────┐    │
│  │       Ver planes →              │    │  ← CTA primario: filled, goes to /coach/subscription
│  └─────────────────────────────────┘    │
│             Ahora no                    │  ← CTA secundario: ghost, dismiss
│                                         │
└─────────────────────────────────────────┘
```

**Reglas de diseño:**
- Nunca decir "Upgrade" — hablar del benefit, no del action
- El precio aparece mensualizado con la opción más barata (anual)
- El dismiss siempre está disponible — no trapping
- En mobile: bottom sheet 55-65% viewport, botón CTA sticky con `pb-safe`
- No confetti, no animaciones celebratorias — coaches son usuarios B2B profesionales

### Gate de nutrición — mejora del existente

El gate actual es texto plano. Mejorar con:
1. Preview visual: captura de pantalla de cómo se ve un plan de nutrición
2. Copy: "Tus alumnos te pueden estar pidiendo un plan de alimentación"
3. Precio concreto: "Incluido en Pro — $29.990/mes o $23.992/mes anual"
4. CTA pre-selecciona Pro en `/coach/subscription?upgrade=pro`

### Gate de branding — diseño nuevo

Elemento más poderoso: **comparativa visual lado a lado**.

```
┌─────────────────────────────────┐  ┌──────────────────────────────────┐
│  Sin tu marca (ahora)           │  │  Con tu marca (Starter)          │
│                                 │  │                                  │
│  [Screenshot app EVA genérica]  │  │  [Screenshot app personalizada]  │
│  powered by EVA                 │  │  ANA LÓPEZ FITNESS               │
│  colores EVA                    │  │  verde + logo de Ana             │
└─────────────────────────────────┘  └──────────────────────────────────┘
                      [Personalizar mi app →]
                     Disponible en Starter · $19.990/mes
```

### Pricing page — layout actualizado

```
[Free] [Starter] [Pro] [Elite] [Growth] [Scale]
 $0    $19.990  $29.990  $44.990  $84.990  $190.000

Toggle: [Mensual] [Anual −20%]
```

Card "Free" tiene badge "Gratis para siempre" (no "Free trial"). Card "Growth" tiene badge "Nuevo".

---

## 12. Data Scientist / Data Analyst

### Modelo de LTV — free coaches

**Inputs validados:**
- Conversión free→paid esperada: **7%** en 6 meses
- Precio Pro mensual: **$29.990 CLP**
- Duración promedio suscripción: **18 meses**

```
LTV por coach convertido  = $29.990 × 18            = $539.820 CLP
Expected LTV por signup   = $539.820 × 0.07         = $37.787 CLP (~$42 USD)
Costo infra por free user = $0.05/mes × 6 meses     = $0.30 por usuario (~$300 CLP)
ROI sobre costo infra     = $37.787 / $300           ≈ 126x
```

**Tabla de sensibilidad:**

| Conversión | Expected LTV/signup | Break-even |
|-----------|--------------------|-|
| 3% | $16.194 CLP | Solo si soporte &lt;$2.700 CLP/mes por usuario |
| 5% | $26.991 CLP | Sostenible con soporte razonable |
| **7%** | **$37.787 CLP** | **Cómodo — objetivo** |
| 10% | $53.982 CLP | Excelente |
| 15% | $80.973 CLP | Excepcional (top quartile PLG) |

**Conversión mínima de break-even** (asumiendo $5.000 CLP/mes en soporte por free coach, 6 meses):
```
Min conversión = ($5.000 × 6) / $539.820 = 5.6%
```
El objetivo de 7% está 25% por encima del break-even.

### Funnel a medir desde día 1

```
signup_free
  → alumno_1_agregado        (target: >60% en 24h)
  → workout_1_creado         (target: >50% en 48h)
  → plan_1_enviado           (target: >40% en 7d)
  → upgrade_gate_hit         (target: >70% en 30d para coaches que alcanzan límite)
  → upgrade_modal_cta_click  (target: >40% del gate hit)
  → subscription_started     (target: >15% del CTA click)
```

### Cohort analysis setup

- Segmentar por semana de signup
- Medir Day-1, Day-7, Day-14, Day-30 retention
- Comparar cohortes antes/después del lanzamiento del free tier (¿sube la calidad de los signups?)
- Si D-7 retention &lt;20% consistentemente → problema de activación, no de precios

### A/B test framework — límite free (futuro)

Después de 90 días:
- Si free→paid &lt;5% en 30d → bajar límite a 2 alumnos
- Si D-7 retention &lt;15% (coaches free inactivos) → subir límite a 5 alumnos
- Datos necesarios: mínimo 200 free signups por variante para significancia estadística

---

## 13. Head of Sales (B2B Enterprise)

### El free plan como motor de pipeline enterprise

Modelo validado por Figma y Slack:
```
Coach individual firma free →
  Usa EVA con sus alumnos →
  Dueño del gym lo ve / pregunta →
  EVA recibe consulta enterprise inbound →
  CAC ≈ $0 (costo de infraestructura del coach free)
```

**Datos de referencia:**
- Slack: **70%** de sus contratos enterprise &gt;$100K empezaron con adopción bottom-up de teams free
- Figma: **37%** de ARR viene de clientes &gt;$100K; todos empezaron como usuarios individuales
- PLG-sourced enterprise deals cierran **40-60% más rápido** que outbound (Bessemer Venture Partners)

### PQL (Product-Qualified Lead) — definición para EVA

Un coach free se convierte en PQL (warm enterprise lead) cuando:
- Tiene **5+ alumnos activos** (hit su límite, buscó workaround, claramente tiene negocio real)
- Ha estado **activo 14+ días** (no trial de curiosidad)
- **Opcional:** tiene email corporativo de gym (`@crossfitprovidencia.cl`, `@gymnasio.cl`)

**Acción cuando se detecta PQL:**
1. Alerta en PostHog → notificación a fundadores
2. Verificar manualmente si el coach trabaja en un gym
3. Si sí → outreach personalizado: "Vimos que usás EVA con tus alumnos — ¿tu gym quiere gestionar todo el equipo?"

### Trigger de enterprise outreach

**No empezar ventas enterprise hasta tener 200-300 coaches free activos.** Antes de ese número, el tiempo de los fundadores se invierte mejor en producto. Post ese milestone, comenzar light enterprise outreach con los coaches que trabajen en gyms.

### Posicionamiento free vs enterprise

**Crítico:** Free plan debe estar claramente en una categoría diferente al enterprise gym plan:
- Free = "herramienta personal del coach" (no panel multi-coach, no analytics de equipo)
- Enterprise = producto categorialmente distinto (gestión de equipo, visión consolidada, billing unificado)
- **Nunca** dejar que un gym use 8 cuentas free como alternativa al enterprise — esto se previene por la ausencia de features multi-coach en el tier free

---

## 14. SDR — Sales Development Representative

### Outreach para free coaches → upgrade

El SDR activa cuando el coach free llega a PQL (5+ alumnos, 14+ días activo).

**Secuencia de outreach (3 toques máximo — no saturar):**

**Toque 1 — Email personalizado (D+0 desde PQL trigger):**
```
Asunto: [Nombre], veo que ya tenés 5 alumnos en EVA

Hola [Nombre],

Vi que ya estás usando EVA con 5 alumnos — eso es genial.

¿Notaste que hay un límite de 3 alumnos en el plan gratuito? 
Quería avisarte antes de que te bloquee.

Con Starter podés tener hasta 10 alumnos y tu app con tu nombre.
Son $19.990/mes — menos de lo que cobrás por una sesión.

¿Querés que te active el Starter por 14 días gratis para que lo pruebes?

[Nombre del fundador]
contacto@eva-app.cl
```

**Toque 2 — WhatsApp (D+3 sin respuesta):**
```
Hola [Nombre]! Te escribí por email el [día] sobre tu cuenta en EVA.
¿Querés que te paso a Starter gratis por 14 días? 
No se cobra nada — si no te convence, seguís en Free.
```

**Toque 3 — Cierre (D+7 sin respuesta):**
```
[Nombre], último mensaje sobre esto.
Tengo un código de descuento de 30% en el primer mes de Starter para los primeros 20 coaches.
¿Te interesa? Si no, sin problema — seguís en Free tranquilo.
```

### Para coaches que trabajan en gyms (enterprise lead):

Mismo toque 1 pero agregar:
```
P.D.: Si trabajás en un gym y quieren gestionar todo el equipo de coaches desde un panel,
tenemos un plan para eso también. ¿Tiene sentido conversar 15 minutos?
```

---

## 15. Customer Success Manager (CSM)

### Onboarding de free coaches

**D+0 — Email de bienvenida (transaccional — no requiere marketing consent):**
- Tono: celebración sobria, no gamificado
- Contenido: "Así agregás tu primer alumno" (1 acción, no lista de features)
- CTA: botón a `/coach/clients/new`

**D+3 — Check-in de activación:**
- Si tiene ≥1 alumno: "Tu alumno completó su primer entrenamiento — ¿cómo fue?"
- Si no tiene alumnos: "¿Tuviste algún problema para agregar tu primer alumno? Te ayudo."

**D+7 — Feature spotlight:**
- Si está en free y no ha visto nutrición: "Algunos de tus alumnos probablemente te preguntan por alimentación. Con Pro podés darles planes completos."
- Mostrar screenshot de cómo se ve un plan de nutrición

**D+14 — Social proof:**
- "Coaches como vos en EVA manejan en promedio X alumnos. Los que tienen Pro retienen 2x más alumnos." (dato a validar con primeros datos reales)

**D+21 — Urgencia suave:**
- No urgencia artificial — mostrar lo que están dejando en la mesa: "Tu app hoy se ve con branding EVA. Con Starter, tus alumnos entran a tu app con tu logo y tus colores."

### Protocolo cuando un coach pago cancela → downgrade a free

1. Email automático: "Tu plan expiró. Tus 3 primeros alumnos siguen en free."
2. Check-in manual del CSM a las 48h: "¿Cancelaste por precio, por algún problema, o el negocio cambió?"
3. Si es precio → ofrecer descuento reactivación
4. Si es bug/problema → escalar a backend, reactivar gratis mientras se resuelve
5. Si el negocio cambió (temporada baja, etc.) → guardar el lead para recontacto en 60 días

---

## 16. Implementation Specialist (Onboarding)

### Onboarding en-app para coach free (welcome flow)

Al entrar por primera vez (`?welcome=free` en URL):

**Banner/modal de bienvenida (una vez, no intrusivo):**
```
┌─────────────────────────────────────────────────┐
│  ¡Bienvenido a EVA! 🎉                          │
│                                                 │
│  Estás en el plan Free — 3 alumnos incluidos.   │
│                                                 │
│  Tu primer paso:                                │
│  → Agregá tu primer alumno                      │
│                                                 │
│  [Agregar primer alumno →]    [Explorar solo]   │
└─────────────────────────────────────────────────┘
```

**Checklist en dashboard (primeras 2 semanas):**
```
□ Agregá tu primer alumno
□ Crea tu primer programa de entrenamiento
□ Enviá el primer plan a tu alumno
□ Revisá los resultados del check-in
```

**Time-to-first-value target:** &lt;30 minutos desde signup hasta que el alumno 1 está en el sistema. Todo el onboarding debe estar diseñado alrededor de ese objetivo.

### Onboarding del alumno (el cliente del coach)

El alumno accede a `/c/[coach_slug]`. En free:
- App funciona normalmente
- Usa branding EVA (no del coach)
- No ve diferencia vs plan pago (la limitación es del coach, no del alumno)
- Esto importa: el alumno tiene buena experiencia → no hay razón para que se queje al coach por usar free

---

## 17. Marketing & Growth Lead

### SEO — nueva oportunidad con el Free plan

El free plan abre keywords que antes no podías rankear:

| Keyword | Volumen estimado Chile | Dificultad | Antes | Ahora |
|---------|----------------------|------------|-------|-------|
| "app gratuita para entrenadores" | Baja-media | Media | ❌ No aplica | ✅ |
| "software coach gratis" | Baja | Baja | ❌ | ✅ |
| "app gratis para personal trainers Chile" | Baja | Baja | ❌ | ✅ |
| "alternativa gratis a Sporty Chile" | Muy baja | Muy baja | ❌ | ✅ |

**Acción:** Crear sección `/pricing#free` con copy específico para estos keywords. No una página separada aún (poco tráfico para justificar) — un anchor bien posicionado en la página de precios existente.

### Comparativa explícita vs Sporty Chile

Sporty Chile no tiene free plan. EVA sí. Esta es una ventaja de marketing directa:

```
┌──────────────────────────────────────────────────────────────┐
│           EVA Free    vs    Sporty Chile básico              │
├──────────────────┬───────────────────────────────────────────┤
│ Precio           │    $0 / $19.990                           │
│ Alumnos          │    3  /  10                               │
│ App alumno       │    ✅  /  ✅                              │
│ Branding propio  │  Con pago / ❌ Nunca                      │
│ Nutrición        │  Con Pro  / ❌ Nunca                      │
│ Prueba gratis    │    ✅  /  7 días                          │
└──────────────────┴───────────────────────────────────────────┘
```

**Mensaje clave:** Al mismo precio ($19.990/mes), EVA da white-label + nutrición. Sporty no. Cuando el coach free de EVA decide pagar, obtiene más.

### Campaña de lanzamiento annual billing

Al lanzar billing anual para Starter/Pro:

**Email a coaches Starter/Pro existentes:**
```
Asunto: Ahorrá $48.984 este año con EVA Starter Anual

[Nombre], agregamos billing anual al plan Starter.

Pasás de $19.990/mes a $15.992/mes — y pagás una vez por año.
Ahorro total: $48.984.

[Cambiar a anual →]

Si preferís seguir mensual, no cambia nada.
```

**Banner en dashboard** para coaches mensuales existentes:
```
[💡 Ahorrá $48.984/año con billing anual — Ver oferta →]
```

Mostrar por 30 días, luego desaparecer. No repetir.

### Paid acquisition — cómo cambia con free tier

Antes: difícil hacer paid ads sin trial → baja conversión de visitante a lead.  
Ahora: "Empezá gratis" es el CTA de acquisition → baja fricción → más leads → más datos.

Target en Google/Meta:
- "entrenador personal" + "app" + Chile
- Lookalike de coaches Starter/Pro actuales
- Retargeting a free coaches que visitaron pricing page pero no upgradearon

---

## 18. Legal & Compliance — Chile

### Ley 21.719 — cronograma crítico

| Hito | Fecha | Acción EVA |
|------|-------|-----------|
| Ley publicada | Diciembre 2024 | Conocimiento |
| **Efectiva** | **1 diciembre 2026** | **Cumplimiento obligatorio** |
| Período SME (solo advertencias) | Dic 2026 – Dic 2027 | Margen para ajustar sin multas |
| Multas plenas | Desde 2028 | Máx. 20.000 UTM (~$1.55M USD) |

### Lo que cambia para EVA con el free plan

**Dato de salud = dato sensible bajo Ley 21.719 (Art. 16):**

Workout logs, nutrición, body metrics, check-ins son datos de salud. Esto significa:
- **Consentimiento explícito y separado** — no puede estar enterrado en los ToS
- El coach (data processor) y EVA (data controller) son co-responsables del tratamiento
- El alumno del coach tiene derechos ARCO+ directamente contra EVA

**Lo que se requiere hacer ANTES del 1 diciembre 2026:**

### 1. Doble capa de consentimiento en registro

```
□ Acepto los Términos de Servicio y la Política de Privacidad
   [link a ambos documentos]

□ Acepto el tratamiento de datos de salud de mis alumnos para
   prestar el servicio de coaching digital. [Qué significa esto →]
   (Este consentimiento es necesario para usar el módulo de seguimiento)

□ Quiero recibir novedades y ofertas de EVA por email
   (Opcional — podés desuscribirte cuando quieras)
```

**Reglas:**
- Las tres casillas deben ser independientes
- Las dos primeras son requeridas para usar el servicio — pero formuladas así, no como "acepta todo"
- La tercera (marketing) es **opcional y sin marcar por defecto** — pre-ticked es inválido bajo la nueva ley

### 2. "Eliminar mi cuenta" — flujo completo de borrado

Flujo técnico que debe existir antes del 1 diciembre 2026:

```typescript
// Server action: deleteCoachAccount
async function deleteCoachAccount(coachId: string) {
    // 1. Anonimizar datos de alumnos (no eliminar workouts — son IP del coach)
    await adminDb.from('clients').update({
        full_name: '[Eliminado]',
        email: null,
        phone: null,
        // ... todos los PII fields
    }).eq('coach_id', coachId)
    
    // 2. Eliminar logs de actividad con PII
    await adminDb.from('workout_logs').delete().eq('coach_id', coachId)
    await adminDb.from('nutrition_meal_logs').delete().eq('coach_id', coachId)
    
    // 3. Desuscribir de todos los emails
    // await resend.contacts.remove(...)
    
    // 4. Cancelar suscripción MP si activa
    // await cancelMPSubscription(coach.subscription_mp_id)
    
    // 5. Eliminar usuario de auth (cascade elimina coaches row via FK)
    await adminDb.auth.admin.deleteUser(coachId)
    
    // 6. Log de la acción (retener por 6 años — obligación SII)
    await adminDb.from('deletion_audit_log').insert({
        coach_id: coachId,
        deleted_at: new Date().toISOString(),
        requested_by: 'user',
    })
}
```

**Datos que NO se pueden borrar:** historial de facturación y pagos — Ley SII requiere retención 6 años. Anonimizar el nombre del titular pero conservar el registro financiero.

### 3. Aviso de privacidad — contenido obligatorio

El documento de privacidad debe especificar:
1. Identidad del responsable: EVA + datos de contacto (email + dirección física)
2. DPO: designar cuando corresponda (evaluar al superar ~5.000 coaches activos)
3. Propósitos específicos por categoría de dato (no genérico)
4. Base legal de cada tratamiento (contrato, consentimiento explícito, etc.)
5. Terceros que acceden: **nombrar a Supabase como encargado de tratamiento** con su ubicación (servidores en EE.UU./UE)
6. Transferencias internacionales: dato crítico — Supabase almacena en AWS; Chile requiere garantías para transferencias fuera del país
7. Plazos de retención por categoría
8. Derechos ARCO+ y cómo ejercerlos
9. Derecho a reclamar ante la Agencia de Protección de Datos Personales

### 4. Email marketing — cumplimiento

- **Emails transaccionales** (bienvenida, límite de alumnos, facturación): permitidos sin consentimiento de marketing — son parte del servicio
- **Emails promocionales** (upgrade a Pro, nuevas features, descuentos): requieren el tercer checkbox del registro
- **Unsubscribe:** debe procesar en &lt;72 horas. Implementar con Resend o Loops.so que tienen unsubscribe automático
- **No comprar/compartir listas** — prohibido explícitamente bajo Art. 21 de la nueva ley

### 5. Uso de datos de free users para analytics

Bajo Ley 21.719: los datos anonimizados/agregados caen fuera del ámbito de la ley. **Recomendación:**
- Para analytics de producto (PostHog): usar datos anonimizados siempre que sea posible
- Para datos identificados en PostHog: obtener consentimiento explícito en el tercer checkbox ("¿Aceptás que usemos tu actividad de forma anónima para mejorar el producto?")
- En la práctica: separar el consentimiento de analytics del consentimiento de marketing

---

## 19. Fintech / Integrations Specialist

### Free → Paid: primera vez con MercadoPago

Un coach free **nunca ha tenido una pre-aprobación MP**. La primera vez que hace upgrade es idéntica al flujo de un coach nuevo que elige Starter:

1. Coach va a `/coach/subscription`
2. Selecciona Starter (o el plan que quiera)
3. Llama a `/api/payments/create-preference`
4. Redirect a MP para autorizar pre-aprobación
5. Webhook confirma → `subscription_status = 'active'`, `subscription_tier = 'starter'`

**Verificaciones críticas:**
- El endpoint `create-preference` debe rechazar tier='free' (`isBillingCycleAllowedForTier('free', cualquierCiclo')` → false → error 400)
- Al hacer upgrade desde free, `isActiveUpgrade` debe ser `false` (no hay `current_period_end` válida en free) — verificar la lógica actual:
  ```typescript
  const isActiveUpgrade = 
      currentCoach?.subscription_status === 'active' &&  // ← free coaches son 'active'
      currentCoach.current_period_end != null &&          // ← free coaches NO tienen period_end
      new Date(currentCoach.current_period_end).getTime() > Date.now()
  ```
  Como `current_period_end` es null en free, `isActiveUpgrade = false`. Correcto — el upgrade free→paid es un fresh start.

### Annual billing — montos correctos para MP

| Plan | Ciclo | Monto pre-aprobación MP |
|------|-------|------------------------|
| Starter anual | 1 cobro de $191.904 CLP | Confirmar que MP soporta pre-approvals anuales (vs mensuales) |
| Pro anual | 1 cobro de $287.904 CLP | Ídem |
| Growth trimestral | $229.473 CLP cada 3 meses | Calcular: `applyDiscount(84990 * 3, 0.10)` |

**Verificar con MP:** Las pre-aprobaciones tienen una frecuencia configurada (`frequency` + `frequency_type`). Para billing anual: `frequency: 1, frequency_type: 'years'`. Para trimestral: `frequency: 3, frequency_type: 'months'`. Confirmar que la API de MP Chile soporta estos valores correctamente.

### Downgrade a Free al cancelar — sin MP

Cuando se hace el downgrade automático de plan pago a free:
- No hay ninguna acción de MP requerida — la suscripción ya estaba cancelada o expirada
- Solo se actualiza la tabla `coaches` en Supabase
- Siguiente vez que el coach quiera pagar → flujo normal de primera vez

---

## 20. FinOps Specialist

### Costo de infraestructura del free tier

**Costo marginal por coach free/mes (stack Next.js + Supabase):**

| Recurso | Plan Pro Supabase (incluido) | Costo marginal por usuario |
|---------|------------------------------|---------------------------|
| Auth MAU | 100K incluidos | ~$0.003/usuario |
| Database storage | 8 GB incluidos | ~$0.001/usuario (datos ligeros) |
| File storage | 100 GB incluidos | ~$0.001/usuario |
| Egress/bandwidth | Tier generoso | ~$0.003/usuario |
| Vercel requests | 1TB incluidos | ~$0.002/usuario |
| **Total** | — | **~$0.01–0.05/usuario/mes** |

**Proyección de costo total por escenario:**

| Free coaches | Costo infra/mes | Costo infra/año |
|-------------|----------------|----------------|
| 100 | ~$5 | ~$60 |
| 500 | ~$25 | ~$300 |
| 2.000 | ~$100 | ~$1.200 |
| 5.000 | ~$250 | ~$3.000 |

Para referencia: si 7% de esos 5.000 coaches convierten a Pro ($29.990/mes), son 350 coaches pagos = $10.496.500 CLP/mes en revenue. La infraestructura del free tier es &lt;0.03% del revenue generado.

### Free:paid ratio — sustentabilidad

| Ratio libre:pago | Conversión implícita | Evaluación |
|-----------------|---------------------|------------|
| 5:1 | 20% | Excepcional — casi imposible de mantener |
| 14:1 | 7% | **Objetivo EVA — sostenible** |
| 20:1 | 5% | Saludable |
| 50:1 | 2% | Industria media — sostenible con costo infra bajo |
| &gt;100:1 | &lt;1% | Requiere re-evaluar gating |

**Techo de costo del free tier:**
```
LTV por convertido × conversión esperada = máximo costo justificable por free user
$539.820 × 0.07 = $37.787 CLP por free signup (a lo largo de su vida como free)

Si el coach free dura 6 meses antes de convertir o churnar:
$37.787 / 6 meses = $6.298 CLP/mes por free coach como máximo gasto justificable
Costo real: ~$45 CLP/mes

Margen sobre el techo: 140x
```

El free tier es económicamente trivial en infraestructura. El riesgo no es el costo de infra — es el costo de oportunidad de coaches que consumen soporte sin convertir.

### Regla de FinOps — cuándo preocuparse

Si el ratio free:paid supera 100:1 (conversión &lt;1%), revisar:
1. ¿El free tier es demasiado generoso? (reducir límite de 3 a 2)
2. ¿Los gates de upgrade están en los lugares correctos?
3. ¿El problema es de activación o de conversión? (diferentes soluciones)

Medir en PostHog desde día 1 para detectar esta señal temprano.

---

## 21. Roadmap de implementación (olas)

### Ola 1 — Free tier (fundación) · Prioridad Crítica

**Objetivo:** Coach llega, elige free, usa EVA sin tarjeta. **Duración estimada: 3-4 días dev.**

Archivos a modificar:
- `src/lib/constants.ts` — extender SubscriptionTier, agregar free/growth a todos los Records
- `src/app/(auth)/register/actions.ts` — branch free sin MP, guardar trial_used_email
- `src/app/(auth)/register/page.tsx` — opción free, ocultar billing step, CTA diferenciado
- `src/app/pricing/page.tsx` — card Free, card Growth
- `src/components/landing/LandingPricingPreview.tsx` — ídem
- `src/app/coach/[branding-page]/page.tsx` — gate de branding
- `src/middleware.ts` — verificar que free+active no bloquea
- `supabase/migrations/<ts>_pricing_overhaul.sql` — check constraint + índices
- `src/lib/database.types.ts` — regenerar

**Instalar en esta ola:**
- PostHog (`posthog-js` + `posthog-node`) — para flags + analytics desde día 1
- Sentry — error tracking PWA
- Email validation API (AbstractAPI) en signup action

**Go/no-go:** `npm run typecheck` ✅ + `npm run build` ✅ + E2E tests ✅ + 0 regresiones

### Ola 2 — Annual billing en Starter y Pro · Prioridad Alta

**Objetivo:** Reducir churn 15-20% con compromiso anual. **Duración estimada: 1-2 días dev.**

- `TIER_ALLOWED_BILLING_CYCLES`: ya actualizado en Ola 1
- `pricing/page.tsx`: mostrar precio anual mensualizado con badge −20%
- `LandingPricingPreview.tsx`: toggle anual funciona para Starter/Pro
- `register/page.tsx`: selector de ciclo visible para Starter/Pro
- `coach/subscription/page.tsx`: cambio a anual disponible para coaches existentes
- Validar montos con MP: $191.904 anual Starter, $287.904 anual Pro

### Ola 3 — Nuevo tier Growth · Prioridad Alta

**Objetivo:** Capturar coaches con 60-150 alumnos. **Duración estimada: 1 día dev.**

- Todo en constants.ts ya cubierto en Ola 1
- Verificar orden en pricing page (entre Elite y Scale)
- Badge "Nuevo" en el card de Growth por 60 días

### Ola 4 — Upgrade prompts comportamentales · Prioridad Media

**Objetivo:** Subir conversión de upgrade gates de 5% a 12%. **Duración estimada: 2-3 días dev.**

- Modal de upgrade al agregar alumno #4 (Radix Dialog, bottom sheet mobile)
- Mejorar gate de nutrición con precio concreto y preview
- Gate de branding con comparativa visual (nueva pantalla)
- Banner de progreso en dashboard (`X/3 alumnos`)
- Instrumentar eventos PostHog en todos los gates

### Ola 5 — Emails de conversión · Prioridad Media

**Objetivo:** Capturar el 78% de conversiones que ocurren en las primeras 48h de un trigger. No es código de Next.js — es configuración de Resend/Loops.so.**

- Secuencia D+0, D+3, D+7, D+14, D+21 para coaches free
- Email de límite hit (behavioral — el más importante)
- Email de annual billing para coaches mensuales existentes

### Ola 6 — Downgrade automático a Free al expirar · Post-MVP

**Objetivo:** Reducir trauma de churn, facilitar reactivación.**

- Webhook MP: cuando coach cancela y expira → tier=free, status=active, max_clients=3
- Email automático al downgradearse
- Lógica read-only para alumnos 4+ en coach downgradeado

### Ola 7 — Legal compliance · Deadline: 1 dic 2026

**Objetivo:** Cumplimiento Ley 21.719.**

- Refactorizar registro: doble consentimiento (health data + marketing)
- Flujo "Eliminar mi cuenta" con cascade deletion
- Actualizar política de privacidad con contenido obligatorio nuevo
- Designar DPO cuando la base de usuarios lo requiera (~5.000 coaches)

---

## 22. Verificación end-to-end

### Flujo completo a testear manualmente antes de producción

**1. Registro free:**
```
/register → elegir Free → llenar form → submit
→ redirect /coach/dashboard?welcome=free (no /subscription/processing)
→ coach.subscription_status = 'active'
→ coach.subscription_tier = 'free'
→ coach.max_clients = 3
→ coach.trial_used_email = email normalizado
```

**2. Límite de alumnos:**
```
Crear alumno 1, 2, 3 → OK
Intentar crear alumno 4 → modal upgrade (no toast, no 500)
Cerrar modal → sigue en free, alumno no existe en DB
Click "Ver planes" → /coach/subscription
```

**3. Feature gates:**
```
/coach/nutrition-plans → pantalla de upsell con precio de Pro
/coach/[branding] → pantalla de upsell con comparativa visual
/coach/subscription/processing (acceso directo) → redirect /coach/dashboard
```

**4. Middleware — free no bloqueado:**
```
Cualquier ruta /coach/* con free+active → pasa (no redirige a /coach/reactivate)
```

**5. Regresión — coaches existentes sin cambios:**
```
Starter mensual: registro, checkout, dashboard → idéntico a hoy
Pro mensual: ídem
Elite trimestral: ídem
Webhooks MP: procesamiento correcto
```

**6. Annual billing (Ola 2):**
```
Registro Starter anual → monto MP: $191.904 CLP (no $19.990)
Display: "$15.992/mes · cobrado anualmente"
Webhook: status=active, billing_cycle='annual', current_period_end = +12 meses
```

**7. Growth tier (Ola 3):**
```
Registro Growth → checkout MP → $84.990/mes o equivalente anual/trimestral
max_clients = 120 al confirmarse el pago
```

---

## 23. Gaps resueltos — Revisión 2

### Gap 1: Branding del plan Free — DECISIÓN TOMADA

**Decisión: Free plan NO tiene white-label. El alumno ve branding EVA por defecto.**

**Fundamentación:**

| Competidor | ¿Da branding en free? |
|-----------|----------------------|
| Everfit (5 clientes free) | ❌ No |
| Trainerize (1 cliente free) | ❌ No ($250/mes add-on incluso en pagos) |
| PT Distinction | ❌ No — solo desde plan pago |
| **EVA** | ❌ No — decisión alineada con mercado |

El branding es el upgrade driver #1 de Free→Starter. Darlo gratis lo elimina como razón de pagar.

**Experiencia del alumno en plan free (`/c/[coach_slug]`):**
- Logo: logo EVA por defecto
- Color primario: `SYSTEM_PRIMARY_COLOR = '#007AFF'` (definido en CLAUDE.md)
- Nombre en header: nombre de marca del coach se muestra (es su identidad, no el branding visual)
- Footer: "Powered by EVA" visible — esto actúa como marketing orgánico de EVA
- Funcionalidad: **100% idéntica** al plan pago — el alumno no sufre ninguna degradación funcional
- El coach ve en su dashboard: preview de cómo se ve su app (con colores EVA) + CTA "Personalizá tu app con Starter"

**Spec técnica del cliente web free (`/c/[coach_slug]/`):**

La RSC que genera la app del alumno ya obtiene `coach.primary_color` y `coach.logo_url` de la DB para aplicar el branding. Para coaches free:

```typescript
// En la RSC de /c/[coach_slug]
const isFreeTier = coach.subscription_tier === 'free'
const effectivePrimaryColor = isFreeTier ? SYSTEM_PRIMARY_COLOR : (coach.primary_color ?? SYSTEM_PRIMARY_COLOR)
const effectiveLogo = isFreeTier ? null : coach.logo_url  // null → mostrar logo EVA
```

Esto no requiere ningún cambio en la experiencia del alumno — solo la fuente del color/logo cambia. Si el coach sube de Starter+, su color y logo aparecen automáticamente (sin hacer nada extra).

**¿Qué ve el coach sobre su propia app?**

En el dashboard del coach free, agregar un widget "Tu app ahora mismo":
```
┌──────────────────────────────────────────────────────────┐
│  Tu app del alumno                                       │
│                                                          │
│  [Mockup con colores EVA]    [Mockup con TU marca]       │
│  ← Así se ve ahora           Así con Starter →          │
│                                                          │
│  [Personalizá tu app con Starter — $19.990/mes]          │
└──────────────────────────────────────────────────────────┘
```

Esto reemplaza al gate de branding estático — es más aspiracional que punitivo.

---

### Gap 2: Panel `/admin` — soporte de nuevos tiers

**Decisión: agregar 'free' y 'growth' al admin panel, con política clara.**

**Política:**
- **Free**: admins SÍ pueden crear coaches free (para testing interno, demos, coaches que contactan por soporte)
- **Growth**: admins SÍ pueden crear coaches Growth (igual que Elite o Scale)
- **Restricción**: no hay restricción especial — el admin ya tiene control total

**Cambios en `src/app/admin/(panel)/coaches/_actions/coach-actions.ts`:**
```typescript
// Línea de validación del tier — actualizar el z.enum:
subscription_tier: z.enum(['free', 'starter', 'pro', 'elite', 'growth', 'scale']),

// Para coaches free creados por admin: subscription_status debe ser 'active' directamente
// billing_cycle: 'monthly' como placeholder (sin efecto real)
// max_clients: 3
```

**UI del admin:** El dropdown de tiers en el formulario de creación de coach debe incluir 'Free' y 'Growth'. El admin que elige 'Free' ve una nota: "El coach free no requiere pago — se activa inmediatamente."

---

### Gap 3: Auditoría de listas hardcodeadas — PRE-IMPLEMENTACIÓN OBLIGATORIA

**Antes de tocar una sola línea de código, ejecutar:**

```bash
# Buscar cualquier array o enum hardcodeado con los 4 tiers actuales
grep -r "starter.*pro.*elite.*scale\|starter\|pro\|elite\|scale" src/ --include="*.ts" --include="*.tsx" -l
```

**Lugares de riesgo conocidos:**
1. `register/actions.ts` línea 35: `['starter', 'pro', 'elite', 'scale'].includes(selectedTier)` — **ya documentado para cambiar**
2. Cualquier `switch (tier)` sin `default` — TypeScript no va a avisar si falta el caso 'free' en un switch sobre el tipo previo
3. Cualquier componente que renderice tabs o cards de planes con array hardcodeado
4. Tests en `constants.test.ts` — pueden tener expectativas sobre los 4 tiers

**Protocolo:** Antes de empezar Ola 1, uno de los fundadores hace el grep, lista todos los archivos afectados, y los agrega a la lista de archivos a modificar. Solo entonces se empieza a codear.

---

### Gap 4: Coaches `expired` existentes — DECISIÓN TOMADA

**Decisión: migración retroactiva SÍ — todos los coaches `expired` pasan a `free` en Ola 6.**

**Fundamentación:**
- Coach bloqueado = trauma de churn. Coach en free = puede volver sin fricción.
- El costo de tenerlos en free es ~$0.05/mes/coach
- Si alguno ve que puede usar la app limitada, puede reactivar — revenue recuperado que antes era 0

**Migración SQL (ejecutar como parte de Ola 6):**
```sql
-- Coaches expirados sin period_end activo → free
UPDATE coaches
SET
    subscription_tier = 'free',
    subscription_status = 'active',
    max_clients = 3,
    billing_cycle = 'monthly'
WHERE
    subscription_status IN ('expired', 'past_due')
    AND (current_period_end IS NULL OR current_period_end < NOW());
```

**Email a coaches migrados:**
```
Asunto: Tu cuenta EVA sigue activa — en plan gratuito

Hola [Nombre],

Tu suscripción de pago expiró, pero no te bloqueamos.

Tus primeros 3 alumnos siguen activos en tu cuenta.
Podés seguir usando EVA gratis — sin fecha límite.

Si querés volver a un plan completo, podés hacerlo cuando quieras:
[Reactivar mi plan →]

El equipo de EVA
```

**Alumnos 4+ de estos coaches:**
- Si el coach tenía más de 3 alumnos activos al expirar → los alumnos 4+ quedan en estado `archived` (read-only)
- El coach los ve pero no puede agregar nuevos ni modificarlos
- Si el coach reactiva → todos vuelven a estado activo automáticamente

---

### Gap 5: Sistema de descuentos para SDR — SOLUCIÓN INTERIM

**Decisión: usar el panel `/admin` existente como mecanismo de descuento. Sin código nuevo.**

El admin panel ya permite crear o editar coaches con `billing_provider = 'admin'` — esto significa que EVA activa el plan sin pasar por MP. El fundador puede:

1. Cambiar el tier del coach a 'starter' con `billing_cycle = 'monthly'`
2. Poner `subscription_status = 'active'`
3. Poner `current_period_end = fecha en 30 días` (prueba gratis)
4. Cuando el periodo termina → coach recibe email de vencimiento → puede pagar normalmente

**Esto es el "30% de descuento" del SDR en la práctica:**
- SDR ofrece "1 mes gratis de Starter"
- Fundador activa manualmente en admin
- Coach usa Starter 30 días
- Al vencimiento → email automático para pagar → flujo normal con MP

**Limitaciones:** No escala más allá de ~50 deals/mes. Cuando el volumen lo justifique → construir sistema de cupones real.

**Documentar en DECISIONES_B2B.md:** Este flujo manual existe, cómo funciona, y quién lo ejecuta.

---

### Gap 6: PostHog + privacidad de coaches existentes

**Decisión: tracking anonimizado para coaches existentes hasta actualizar ToS.**

**Qué hacer antes de instalar PostHog:**

1. **Para coaches existentes (antes del 1 dic 2026):** PostHog en modo `person_profiles: 'identified_only'` — solo crea perfiles identificados cuando el usuario hace opt-in explícito. Para todos los demás, los eventos se capturan pero son anónimos (no vinculados a un coach_id específico).

2. **Para coaches nuevos (desde el lanzamiento del free plan):** El tercer checkbox del registro nuevo ("Aceptás el uso de tus datos para mejorar el producto") habilita el tracking identificado.

3. **Configuración:**
```typescript
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    person_profiles: 'identified_only',  // no crear perfiles sin consentimiento
    capture_pageview: false,             // control manual de qué se captura
})
```

4. **Cuando el usuario da consentimiento:**
```typescript
posthog.identify(coachId, { tier: coach.subscription_tier })
```

5. **Actualizar la política de privacidad** antes de lanzar (mencionar PostHog como procesador de datos anónimos/anonimizados).

---

### Gap 7: Comunicación a coaches existentes — PLAN DETALLADO

**Coaches actuales no van a saber de los cambios si no los avisamos activamente.**

**Email 1 — Lanzamiento annual billing (Ola 2, día del deploy):**

```
Para: todos los coaches Starter y Pro con billing mensual
Asunto: Ahorrá $71.976 este año — nuevo billing anual disponible en EVA

[Nombre],

Escuchamos a los coaches: querían poder pagar anualmente para comprometerse y ahorrar.

Desde hoy, podés cambiar tu plan Pro a billing anual:
→ En vez de $29.990/mes: $23.992/mes (cobrado $287.904 una vez al año)
→ Ahorro: $71.976 al año

Si preferís seguir mensual, no cambia nada — no se toca tu plan.
Solo si vos decidís cambiar.

[Ver mi plan y cambiar a anual →]

El equipo de EVA
```

**Email 2 — Lanzamiento plan Free y Growth (Ola 1, día del deploy):**

```
Para: todos los coaches activos
Asunto: EVA ahora tiene plan gratuito — y un nuevo plan Growth

[Nombre],

Dos novedades de hoy:

① Plan Free: cualquier coach puede probar EVA gratis con 3 alumnos.
   → Si tenés colegas que dudan en arrancar, podés recomendarles el free.
   → Tu plan no cambia absolutamente nada.

② Plan Growth (nuevo): hasta 120 alumnos a $84.990/mes.
   → Si tenés más de 60 alumnos, tenés un plan hecho para vos.

[Ver todos los planes →]

El equipo de EVA
```

**Banner en dashboard (30 días):**
```
[🆕 Hay un plan Growth para coaches con 60–120 alumnos — Ver →]
```
Mostrar solo a coaches Elite que están en 80%+ de su límite de alumnos.

---

### Gap 8: Encuesta D+30 para free coaches sin conversión

**Objetivo:** Entender por qué no convierten — los datos son más valiosos que cualquier suposición.

**Implementación:** Email simple al D+30 si el coach sigue en free y no ha tocado upgrade:

```
Asunto: Una pregunta rápida sobre EVA, [Nombre]

Hola [Nombre], ¿cómo va el coaching?

Llevas 30 días en el plan gratuito de EVA. Quería preguntarte:

¿Qué te frena de pasar a un plan pago?
(1 click — anónimo si querés)

○ El precio
○ No uso EVA lo suficiente aún
○ Me falta alguna feature que no tiene
○ Ya uso otra herramienta
○ Otro: [campo de texto]

[Responder →]  (Typeform o Google Form embebido)

Gracias — nos ayuda a mejorar.
[Nombre del fundador]
```

**Cómo usar los datos:**
- Si mayoría responde "precio" → evaluar plan de $14.990 o período gratis más largo
- Si mayoría responde "no uso suficiente" → problema de activación, no de pricing
- Si responde "me falta X feature" → backlog de producto
- Si responde "uso otra herramienta" → pregunta de seguimiento: ¿cuál? → datos competitivos

---

### Gap 9: Impacto en coaches actuales — resumen definitivo

**Para coaches Starter, Pro, Elite, Scale activos:**

| Qué cambia | Qué NO cambia |
|-----------|--------------|
| Pricing page: aparecen cards Free y Growth | Su precio |
| Landing: ídem | Su billing cycle |
| `/coach/subscription`: opción anual disponible para Starter/Pro | Su acceso a features |
| Dashboard Elite cerca del límite: banner de Growth | Su dashboard |
| | Sus clientes, workouts, nutrición |
| | Sus webhooks MP |
| | Su slug, PWA, app del alumno |

**Riesgo técnico para coaches existentes: bajo.**

El único riesgo real es si TypeScript rompe algo al extender el union type. Mitigación: `npm run typecheck` + auditoría de hardcoded lists (Gap 3) antes de deploy.

**Para coaches en `expired` o `past_due`:**
- Al ejecutar Ola 6: pasan a free automáticamente
- Reciben email explicativo
- Sus alumnos 4+ quedan read-only (no se pierden datos)

**Para coaches en `trialing` (activados manualmente por admin):**
- Sin cambio — siguen en su trial hasta que el admin cambie su estado

---

## 24. Pre-implementación — checklist de auditoría

Completar ANTES de escribir la primera línea de código de Ola 1:

- [ ] **Grep de listas hardcodeadas:** ejecutar búsqueda de `['starter', 'pro', 'elite', 'scale']` en todo el codebase y listar archivos afectados
- [ ] **Grep de switch sin default:** buscar `switch.*subscription_tier` en todo el codebase
- [ ] **Identificar ruta de branding del coach:** encontrar dónde está la página de configuración de branding para agregar el gate
- [ ] **Identificar dónde `/c/[coach_slug]` usa `primary_color` y `logo_url`:** para agregar la lógica de branding EVA para free coaches
- [ ] **Verificar con MP:** confirmar que `frequency_type: 'years'` está soportado en pre-approvals de MercadoPago Chile
- [ ] **Confirmar Supabase plan actual:** verificar que estamos en Pro plan (no Free) — el free plan de Supabase pausa proyectos inactivos
- [ ] **Instalar PostHog y Sentry en staging primero** — verificar que no rompen el build antes de producción
- [ ] **Revisar tests existentes en `constants.test.ts`** — actualizar expectativas para los 4 tiers nuevos (free, growth) + los cambios de billing cycles

---

---

## 25. Gaps resueltos — Revisión 3 (cross-reference código real)

> Esta revisión emergió de leer el código fuente contra el plan y verificar que cada cambio está especificado con suficiente precisión para implementarlo sin ambigüedad. Se encontraron 10 gaps adicionales.

---

### Gap R3-1: `payment_provider` para coaches free — DECISIÓN TOMADA

**Problema encontrado:** En `register/actions.ts` línea 108, el coach se crea con:
```typescript
payment_provider: process.env.PAYMENT_PROVIDER ?? 'mercadopago',
```
Un coach free nunca tiene una relación con MercadoPago. Si el campo queda como `'mercadopago'`, los reportes financieros y cualquier query sobre `payment_provider` va a contaminar los datos (coaches sin suscripción aparecen como clientes MP).

**Decisión:** Para coaches free → `payment_provider: 'admin'` (mismo valor que los coaches activados manualmente por el admin).

**Fix en `register/actions.ts`:**
```typescript
payment_provider: isFreeTier ? 'admin' : (process.env.PAYMENT_PROVIDER ?? 'mercadopago'),
```

---

### Gap R3-2: `primary_color` hardcodeado en register — FIX REQUERIDO

**Problema encontrado:** `register/actions.ts` línea 104:
```typescript
primary_color: '#10B981',
```
Este es `BRAND_PRIMARY_COLOR` (verde EVA), no `SYSTEM_PRIMARY_COLOR` (`#007AFF`). Para un coach free cuya app del alumno debe mostrar el estilo EVA (azul), el verde es inconsistente.

**Decisión:** El `primary_color` del coach en DB es la preferencia del coach para cuando tenga branding. Para coaches free que aún no configuraron branding, la app del alumno usa `SYSTEM_PRIMARY_COLOR` vía la lógica en el RSC de `/c/[coach_slug]` — no en el `primary_color` de la DB.

**Entonces hay dos sub-decisiones:**
1. El campo `primary_color` en DB para coaches free: dejar `'#10B981'` como está (es el default que verán cuando hagan upgrade a Starter y abran configuración de branding por primera vez — el verde EVA es un buen punto de partida).
2. La app del alumno para coaches free: **no** leer `coach.primary_color` — usar `SYSTEM_PRIMARY_COLOR` directamente.

**Esto significa que la lógica en `/c/[coach_slug]` RSC es:**
```typescript
// Coaches free: branding EVA system siempre, ignorar lo que tenga en DB
const isFreeTier = coach.subscription_tier === 'free'
const effectivePrimaryColor = isFreeTier
    ? SYSTEM_PRIMARY_COLOR   // '#007AFF'
    : (coach.primary_color ?? SYSTEM_PRIMARY_COLOR)
const effectiveLogo = isFreeTier ? null : coach.logo_url
```

**No cambiar** `primary_color: '#10B981'` en `register/actions.ts` — sirve como default de branding cuando el coach haga upgrade.

---

### Gap R3-3: `isMostAffordable` — DECISIÓN TOMADA

**Problema encontrado:** En `TIER_CONFIG`:
```typescript
starter: {
    isMostAffordable: true,
    ...
}
```
Con Free a $0, Starter ya no es el plan más asequible en términos absolutos. El badge/indicador que usa este flag quedaría semánticamente incorrecto si se deja donde está.

**Decisión:** Cambiar la semántica del flag.

- `isMostAffordable: true` en **Starter** significa **"plan pago de entrada más accesible"** — no "el más barato de todos". El badge debe cambiar de "Más accesible" a "Precio de entrada" o "Plan recomendado para empezar" en el UI.
- Free no necesita este flag — su precio $0 ya es suficiente indicador visual.
- El campo `isMostAffordable` en `TierConfig` type permanece; solo cambia el copy en el componente que lo renderiza.

**Fix en el componente de pricing page:**
```typescript
// Donde se renderiza isMostAffordable:
// Antes: "Más asequible"
// Después: "Ideal para empezar"
```

---

### Gap R3-4: `canUseAdvancedReports` — DEAD CODE, LIMPIAR

**Problema encontrado:** En `TIER_CAPABILITIES`, todos los tiers tienen `canUseAdvancedReports: true` o `false`, pero en ningún lugar del codebase se llama a `getTierCapabilities(tier).canUseAdvancedReports` para hacer un gate real. Es un campo del tipo `TierCapabilities` que existe pero nunca se usa.

**Decisión:** No implementar el gate de reportes en este overhaul (fuera de scope). Mantener el campo en el tipo para uso futuro — **pero quitar la asimetría**: dar `canUseAdvancedReports: true` a todos los tiers pagos (incluyendo Growth) y `false` solo a Free. Esto no cambia ningún comportamiento visible hoy porque el gate no existe, pero mantiene la lógica limpia para cuando se implemente.

**Acción:** Solo actualizar `TIER_CAPABILITIES` para free y growth. El campo queda documentado como "reservado para implementación futura de reportes avanzados."

---

### Gap R3-5: Archivos con tier lists hardcodeadas — LISTA COMPLETA

**Problema:** El plan mencionaba hacer un grep antes de empezar, pero ahora ya tenemos la lista completa de archivos afectados. Documentarla aquí para que el implementador no pierda tiempo.

**Lista de todos los archivos con tier lists hardcodeadas** (identificados en cross-reference):

| Archivo | Línea aprox. | Qué tiene | Acción |
|---------|-------------|-----------|--------|
| `src/lib/constants.ts` | 45 | `type SubscriptionTier` | Agregar 'free' y 'growth' |
| `src/lib/constants.ts` | 68-73 | `TIER_STUDENT_RANGE_LABEL` | Agregar free y growth |
| `src/lib/constants.ts` | 75-102 | `TIER_CONFIG` | Agregar free y growth |
| `src/lib/constants.ts` | 114-135 | `TIER_CAPABILITIES` | Agregar free y growth |
| `src/lib/constants.ts` | 167-172 | `TIER_ALLOWED_BILLING_CYCLES` | Agregar/modificar free, starter, pro, growth |
| `src/app/(auth)/register/actions.ts` | 35 | `['starter', 'pro', 'elite', 'scale']` | Agregar 'free' y 'growth' |
| `src/app/(auth)/register/page.tsx` | tierOptions array | Cards de planes disponibles | Agregar Free y Growth |
| `src/app/pricing/page.tsx` | planDisplay array | Cards con colores/iconos | Agregar Free y Growth |
| `src/components/landing/LandingPricingPreview.tsx` | ~línea 75 | `['starter', 'pro', 'elite', 'scale']` | Agregar Free y Growth |
| `src/app/coach/subscription/page.tsx` | tierOptions ~línea 51 | Opciones de upgrade | Agregar Free y Growth |
| `src/app/admin/(panel)/coaches/_actions/coach-actions.ts` | z.enum | Validación de tier | Agregar 'free' y 'growth' |
| `src/app/admin/(panel)/dashboard/_components/ChartSection.tsx` | hardcoded array | Analytics chart por tier | Agregar free y growth |
| `src/app/admin/(panel)/finanzas/_data/finanzas.queries.ts` | pricing logic | Revenue projections por tier | Agregar free ($0) y growth ($84.990) |
| `src/lib/database.types.ts` | enum de tier | Tipos generados por Supabase | Regenerar tras migración SQL |

**Total: 14 archivos.** No deben haber más — pero ejecutar el grep igualmente como verificación.

---

### Gap R3-6: `finanzas.queries.ts` y `ChartSection.tsx` — AGREGAR A OLA 1

**Problema:** Estos dos archivos no estaban en la lista de modificaciones de Ola 1, pero ambos tienen lógica que depende del conjunto de tiers.

- `finanzas.queries.ts`: calcula revenue por tier (si usa precios hardcodeados, Growth y Free no aparecerán). Verificar si hace un `GROUP BY subscription_tier` con filtro o si los precios están hardcodeados en el TS.
- `ChartSection.tsx`: probablemente itera sobre los tiers para el chart del dashboard admin. Sin 'free' y 'growth', los coaches en esos tiers no aparecerán en las gráficas.

**Acción:** Agregar ambos archivos a la lista de modificaciones de Ola 1. Son cambios de bajo riesgo (solo afectan admin analytics, no el flujo de coaches).

---

### Gap R3-7: `getDefaultBillingCycleForTier('free')` — EDGE CASE DOCUMENTADO

**Problema:** La función actual retorna:
```typescript
return TIER_ALLOWED_BILLING_CYCLES[tier][0] ?? 'monthly'
```
Para free, `TIER_ALLOWED_BILLING_CYCLES['free'] = []`, así que retorna `'monthly'` por el `?? 'monthly'` fallback.

**Esto es correcto** — pero puede confundir a quien lea el código. El comportamiento es intencional: free coaches tienen `billing_cycle = 'monthly'` en DB como placeholder (sin efecto real, nunca se cobra).

**Acción:** Agregar un comentario de una línea en la función:
```typescript
// Free tier returns 'monthly' as placeholder — it has no billing cycle in practice
export function getDefaultBillingCycleForTier(tier: SubscriptionTier): BillingCycle {
    return TIER_ALLOWED_BILLING_CYCLES[tier][0] ?? 'monthly'
}
```
Solo un comentario. No cambiar lógica.

---

### Gap R3-8: Register flow Step 2 — spec exacta para path free

**Problema:** El plan dice "ocultar selector de billing cycle para free" y "mostrar CTA diferenciado en Step 3", pero no especifica si el indicador de steps cambia.

**Spec definitiva:**

**Con un plan pago:**
```
Step 1: Tu cuenta  →  Step 2: Tu plan  →  Step 3: Resumen y pago
```

**Con plan Free:**
```
Step 1: Tu cuenta  →  Step 2: Tu plan  →  Step 3: Confirmar
```

- El indicador de 3 steps **permanece igual visualmente** — no saltear steps visibles (confunde al usuario)
- Step 2 Free: mostrar el plan seleccionado, ocultar el selector de ciclo de billing, mostrar badge "Sin costo · Acceso inmediato"
- Step 3 Free: reemplazar la sección de monto/MP por:
  ```
  ┌──────────────────────────────────────────┐
  │  Tu plan: Free                            │
  │  ✓ 3 alumnos incluidos                   │
  │  ✓ Sin tarjeta de crédito                │
  │  ✓ Podés hacer upgrade en cualquier      │
  │    momento desde tu dashboard            │
  │                                          │
  │  [Crear mi cuenta gratuita →]            │
  └──────────────────────────────────────────┘
  ```
- El botón "Crear mi cuenta gratuita" dispara el submit del form normalmente — el server action detecta `tier=free` y hace el branch sin MP

---

### Gap R3-9: UI de pricing page con 6 planes — agrupación actualizada

**Problema:** La pricing page actual tiene una agrupación visual implícita: Starter solo (sin nutrición), luego Pro/Elite/Scale (con nutrición). Con 6 planes, la agrupación necesita redefinirse.

**Spec definitiva — 3 grupos visuales:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  GRUPO 1: "Empezá gratis"                                               │
│  [Free — $0]                                                             │
│  Badge: "Gratis para siempre"                                            │
│  Sin nutrición, sin branding                                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  GRUPO 2: "Coach individual" · Toggle [Mensual] [Anual −20%]            │
│  [Starter — $19.990]   [Pro — $29.990]                                  │
│  Sin nutrición          Con nutrición                                    │
│  Badge Starter: "Ideal para empezar"                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  GRUPO 3: "Negocio establecido" · Toggle [Mensual] [Trimestral] [Anual] │
│  [Elite — $44.990]  [Growth — $84.990]  [Scale — $190.000]              │
│                      Badge: "Nuevo"                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Reglas de UI:**
- El toggle de billing cycle es **por grupo**, no global — el toggle anual/mensual no tiene sentido para Free
- Cada card tiene su color/ícono (ver Gap R3-10)
- El card Free no muestra precios anuales ni trimestrales — solo "$0 / mes · siempre gratis"
- Separador visual entre grupos (label del grupo o divisor visual)

---

### Gap R3-10: Colores e íconos para Free y Growth — spec para LandingPricingPreview.tsx y pricing/page.tsx

**Problema:** `LandingPricingPreview.tsx` y `pricing/page.tsx` tienen arrays hardcodeados con colores/íconos por tier. Se necesita spec para los dos nuevos tiers.

**Paleta de colores sugerida para cada tier** (consistente entre landing y pricing page):

| Tier | Color de acento | Ícono sugerido | Rationale |
|------|----------------|----------------|-----------|
| Free | `slate` / gris neutro | `Sprout` o `Leaf` (Lucide) | Neutral, no compite con los planes pagos |
| Starter | `sky` / azul claro | `Star` o `Zap` | Entrada, energía |
| Pro | `violet` / violeta | `Trophy` o `Rocket` | Más poder, profesional |
| Elite | `amber` / dorado | `Crown` | Élite, exclusivo |
| Growth | `emerald` / verde | `TrendingUp` o `ChartLine` | Crecimiento, escala progresiva |
| Scale | `rose` / rojo cálido | `Building2` o `Layers` | Empresa, estructura |

**Para la landing carousel (mobile-first):** 6 cards en el mismo patrón existente. El carousel scroll-snap ya funciona — solo agregar los dos nuevos objetos al array.

**Para pricing/page.tsx:** El `planDisplay` array usa className de Tailwind para el color del borde/header del card. Agregar:
```typescript
{ tier: 'free',   color: 'border-slate-300',   headerBg: 'bg-slate-50',    icon: Sprout },
{ tier: 'growth', color: 'border-emerald-300', headerBg: 'bg-emerald-50', icon: TrendingUp },
```

---

### Gap R3-11: Redirect a `/coach/subscription/processing` — guard en server action

**Problema identificado:** Si un coach free accede directamente a `/coach/subscription/processing` (URL que solo deberían tener coaches que acaban de hacer checkout), podría ver una pantalla de "procesando pago" que no tiene sentido para él.

**Solución:** En la página `/coach/subscription/processing/page.tsx`, verificar el tier del coach:
```typescript
// Al inicio de la página (RSC):
if (coach.subscription_tier === 'free') {
    redirect('/coach/dashboard')
}
```
Este guard ya estaba en los test cases de QA — pero no estaba especificado en el código de dónde exactamente implementarlo. Ahora queda claro: en el RSC de la página.

---

### Gap R3-12: `TIER_STUDENT_RANGE_LABEL` — agregar a ambas estructuras

**Problema:** `TIER_STUDENT_RANGE_LABEL` es un Record separado de `TIER_CONFIG`. Si solo se actualiza `TIER_CONFIG` y se olvida este Record, TypeScript **sí avisará** (porque `Record<SubscriptionTier, string>` requiere todas las keys). Pero es fácil olvidarlo en el medio de la implementación.

**Documentar explícitamente:** Cuando se extiende `SubscriptionTier` en `constants.ts`, actualizar estos Records en este orden para que TypeScript guíe el proceso y no haya errores silenciosos:

1. `SubscriptionTier` (el type) — primero
2. `TIER_STUDENT_RANGE_LABEL` — TypeScript fuerza actualizar
3. `TIER_CONFIG` — TypeScript fuerza actualizar
4. `TIER_CAPABILITIES` — TypeScript fuerza actualizar
5. `TIER_ALLOWED_BILLING_CYCLES` — TypeScript fuerza actualizar

**Valores para Free y Growth:**
```typescript
TIER_STUDENT_RANGE_LABEL: {
    free: 'Hasta 3 alumnos',
    growth: '61–120 alumnos',
    // ... existentes sin cambio
}
```

---

### Resumen de gaps Revisión 3

| Gap | Tipo | Acción requerida | Ola |
|-----|------|-----------------|-----|
| R3-1: payment_provider | Bug latente | `'admin'` en lugar de `'mercadopago'` para free | 1 |
| R3-2: primary_color | Aclaración | No cambiar DB default; sí cambiar RSC de `/c/[coach_slug]` | 1 |
| R3-3: isMostAffordable | Decisión UI | Cambiar copy de badge en pricing page | 1 |
| R3-4: canUseAdvancedReports | Dead code | Documentar como futuro; no implementar gate aún | 1 (solo constants) |
| R3-5: Lista completa de archivos | Documentación | 14 archivos identificados — usar como checklist | Pre-Ola 1 |
| R3-6: finanzas + ChartSection | Gap de scope | Agregar a lista de modificaciones Ola 1 | 1 |
| R3-7: getDefaultBillingCycleForTier | Clarity | Agregar comentario de una línea | 1 |
| R3-8: Register flow free spec | UX | Spec de 3 steps con Step 3 diferenciado | 1 |
| R3-9: Pricing page agrupación | UX | 3 grupos visuales con toggle por grupo | 1 |
| R3-10: Colores/íconos nuevos tiers | UI | Paleta definida para Free y Growth | 1 |
| R3-11: Guard en processing page | Bug prevention | Redirect a dashboard si tier=free | 1 |
| R3-12: TIER_STUDENT_RANGE_LABEL | Orden de impl. | Actualizar Records en orden específico | 1 |

---

---

## 26. Gaps resueltos — Revisión 4 (anti-abuso + code deep-dive)

> Cross-reference directo con el código real de `platform-email.ts`, `create-preference/route.ts`, `subscription/page.tsx`. Se encontraron gaps críticos de seguridad y UX.

---

### Gap R4-1: `normalizePlatformEmail` NO normaliza aliases — BUG CRÍTICO DE SEGURIDAD

**Hallazgo en código real** (`src/lib/auth/platform-email.ts` línea 4–6):
```typescript
export function normalizePlatformEmail(email: string): string {
    return email.trim().toLowerCase()
}
```

Solo hace trim + lowercase. **No maneja:**
- `+aliases` de Gmail: `juan+bot1@gmail.com`, `juan+bot2@gmail.com` → tratados como emails distintos
- Puntos ignorados por Gmail: `j.u.a.n@gmail.com` = `juan@gmail.com` — mismo inbox, tratados como distintos
- Aliases de Outlook/Hotmail: soporte similar

**Impacto:** Un coach puede crear **decenas de cuentas free** desde el mismo Gmail usando `+alias`. El `trial_used_email` (que usa esta función) no los detecta. La Capa 3 del plan de seguridad está rota en la práctica.

**Fix requerido en `normalizePlatformEmail`:**
```typescript
export function normalizePlatformEmail(email: string): string {
    const [local, domain] = email.trim().toLowerCase().split('@')
    if (!local || !domain) return email.trim().toLowerCase()
    
    // Gmail (y Google Workspace): ignorar dots + strip +alias
    const gmailDomains = ['gmail.com', 'googlemail.com']
    if (gmailDomains.includes(domain)) {
        const withoutAlias = local.split('+')[0]!
        const withoutDots = withoutAlias.replace(/\./g, '')
        return `${withoutDots}@gmail.com` // googlemail.com → gmail.com (misma inbox)
    }
    
    // Outlook/Hotmail: strip +alias (no ignoran dots)
    const outlookDomains = ['outlook.com', 'hotmail.com', 'live.com']
    if (outlookDomains.includes(domain)) {
        const withoutAlias = local.split('+')[0]!
        return `${withoutAlias}@${domain}`
    }
    
    // Todo lo demás: solo trim + lowercase
    return `${local}@${domain}`
}
```

**Importante:** Esta función ya se usa en `assertPlatformEmailAvailable` y en el registro. Cambiarla mejora automáticamente todas las capas de detección de emails duplicados — sin cambios adicionales.

**Impacto en coaches existentes:** Si dos coaches existentes tienen emails que se normalizan al mismo valor (ej: `juan@gmail.com` y `j.u.a.n@gmail.com`), no hay problema — ya tienen cuentas distintas en Supabase Auth. La normalización solo afecta a futuros intentos de registro.

---

### Gap R4-2: `create-preference` tiene tiers hardcodeados — BLOQUEARÁ GROWTH

**Hallazgo en código real** (`src/app/api/payments/create-preference/route.ts` línea 16):
```typescript
const schema = z.object({
    tier: z.enum(['starter', 'pro', 'elite', 'scale']),
    billingCycle: z.enum(['monthly', 'quarterly', 'annual']),
})
```

**Dos problemas:**
1. 'growth' no está — cuando se lance Growth, cualquier intento de checkout retornará 400. **Agregar a la lista de modificaciones de Ola 3.**
2. 'free' tampoco está — **esto es correcto** y debe mantenerse. Si un coach free manipula el request para llegar a este endpoint, el schema validation lo bloquea en 400 antes de tocar MP. No añadir 'free' aquí nunca.

**Fix para Ola 3:** Actualizar el z.enum a `['starter', 'pro', 'elite', 'growth', 'scale']`.

---

### Gap R4-3: `subscription/page.tsx` mostrará "Free" como opción de cambio — UX BREAK

**Hallazgo en código real** (`src/app/coach/subscription/page.tsx` línea 51):
```typescript
const tierOptions = Object.keys(TIER_CONFIG) as SubscriptionTier[]
```

Esto es dinámico — cuando agreguemos 'free' y 'growth' a `TIER_CONFIG`, ambos aparecerán automáticamente en el grid de "Cambiar plan". **'Free' no debe aparecer como opción de upgrade/downgrade en esta página** — un coach pago no puede elegir bajar a free manualmente (el downgrade a free es automático al cancelar, no voluntario).

**Fix requerido:** Filtrar 'free' del tierOptions en subscription page:
```typescript
const tierOptions = (Object.keys(TIER_CONFIG) as SubscriptionTier[]).filter(t => t !== 'free')
```

**Growth sí debe aparecer** — es un upgrade válido.

---

### Gap R4-4: `email_confirm: true` — free coaches nunca verifican su email

**Hallazgo en código real** (`src/app/(auth)/register/actions.ts` línea 86):
```typescript
const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,   // ← bypassa verificación de email
})
```

`email_confirm: true` crea el usuario con email ya confirmado — sin enviar ningún email de verificación. Esto es intencional para el flujo actual (coaches pagos van directo a MP). Pero para coaches free, significa que se puede registrar con cualquier email inventado (incluyendo emails de otras personas) sin ninguna verificación.

**Decisión:** Para coaches free, deberíamos exigir verificación de email antes del primer acceso.

**Opción A — Verificación via Supabase (recomendado):**
```typescript
// Para free: crear usuario SIN email_confirm — Supabase envía el email automáticamente
const { data: authData } = await adminDb.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: isFreeTier ? false : true,
})
// → redirect a `/register/verify-email` (pantalla de "Revisá tu email")
// → coach solo puede acceder a /coach/* cuando haga clic en el link
```

**Opción B — Mantener como está (menos seguro, más fricción-free):**
- Aceptar que hay emails no verificados en free
- Mitigar con AbstractAPI (descarta emails indeliverable) + rate limiting
- Trade-off: menor fricción de onboarding, pero coach puede registrarse con email falso

**Recomendación: Opción A.** La verificación de email es el filtro de calidad #1. Un bot que no controla el inbox no puede activar la cuenta. El trade-off de fricción vale la seguridad.

**Pantalla a crear:** `/register/verify-email` — "Revisá tu bandeja de entrada. Te enviamos un link para activar tu cuenta." Sin formulario, solo mensaje + botón "Reenviar email".

---

### Gap R4-5: Welcome modal sin persistencia — re-show en cada refresh

**Hallazgo:** No existe ningún código que maneje `?welcome=free` en el dashboard. El plan lo especifica como redirect destino (`/coach/dashboard?welcome=free`) pero no dice cómo evitar que se muestre en cada refresh de la URL.

**Spec definitiva — usar localStorage:**
```typescript
// En el componente del dashboard:
const [showWelcome, setShowWelcome] = useState(false)

useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('welcome')
    const alreadySeen = localStorage.getItem('eva_welcome_seen')
    
    if (param === 'free' && !alreadySeen) {
        setShowWelcome(true)
        // Limpiar la URL sin reload
        window.history.replaceState({}, '', '/coach/dashboard')
    }
}, [])

function dismissWelcome() {
    localStorage.setItem('eva_welcome_seen', '1')
    setShowWelcome(false)
}
```

**Por qué localStorage y no DB:** No requiere una query extra. No importa si el coach limpia localStorage — ver el modal de bienvenida dos veces no es un problema. Solo queremos evitar el re-show en cada F5.

---

### Gap R4-6: "Powered by EVA" en la app del alumno — oportunidad de growth no especificada

**No está en el plan.** Si el alumno de un coach free ve "Powered by EVA" en el footer, ¿a dónde apunta ese link? Actualmente no hay especificación.

**Decisión:**
- **Free coaches:** footer visible con "Powered by EVA" → link a `eva-app.cl?utm_source=client_app&utm_medium=footer&utm_campaign=free_tier_viral`
- **Coaches Starter+:** sin footer de EVA (la app es su marca). Esta es la propuesta de valor del branding.

**Esto significa que el footer "Powered by EVA" también es un upgrade driver:** el coach que ve que sus alumnos ven el logo de EVA (y no el suyo) tiene un incentivo adicional para pagar Starter.

**Implementación:** Agregar a la lista de Ola 1 — en el RSC de `/c/[coach_slug]`, si `isFreeTier` → renderizar footer con link y UTM. Si no → sin footer.

---

### Gap R4-7: Cloudflare Turnstile — la capa de anti-bot más efectiva NO está en el plan

**El plan tiene 5 capas de anti-abuso pero le falta la más efectiva:** un challenge de bot a nivel de red, antes de que el request llegue a Next.js.

**Cloudflare Turnstile** es la mejor opción para EVA:
- Gratis hasta 10M requests/mes (excede cualquier escenario razonable)
- Invisible para usuarios reales — no hay "marque los semáforos"
- Resuelve bots antes del rate limiter de Upstash
- No requiere Cloudflare como CDN — solo instalar el widget
- GDPR-friendly (no tracking como reCAPTCHA v3)

**Implementación:**
```bash
npm install turnstile-next  # o usar el widget JS directo
```

**En el form de registro (client component):**
```typescript
import { Turnstile } from '@marsidev/react-turnstile'

<Turnstile
    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
    onSuccess={(token) => setTurnstileToken(token)}
/>
```

**En register/actions.ts (server):**
```typescript
// Verificar token antes de cualquier lógica
const turnstileToken = formData.get('cf-turnstile-response') as string
const cfVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        secret: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: headers().get('x-forwarded-for'),
    }),
})
const { success } = await cfVerify.json()
if (!success) return { error: 'Verificación fallida. Recargá la página e intentá de nuevo.' }
```

**Dos nuevas env vars:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `CLOUDFLARE_TURNSTILE_SECRET_KEY`.

---

### Gap R4-8: Honeypot field — capa zero-cost contra bots simples

Antes de Turnstile, el más simple: un campo oculto que los bots llenan y los humanos no.

**En el form de registro:**
```html
<!-- Campo trampa — CSS oculto, no aria-hidden para confundir scrapers -->
<input
    name="website"
    type="text"
    tabIndex={-1}
    autoComplete="off"
    style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
    aria-label="No llenar este campo"
/>
```

**En register/actions.ts:**
```typescript
const honeypot = formData.get('website') as string
if (honeypot) {
    // Bot detectado — no revelar el motivo del rechazo
    // Simular éxito para que el bot no sepa que fue bloqueado
    return { error: 'Algo salió mal. Intentá de nuevo en unos minutos.' }
}
```

Costo: 0. Falsos positivos en humanos: prácticamente 0 (el campo está hidden y tiene `tabIndex=-1`).

---

### Gap R4-9: Slug squatting — bots pueden reservar slugs de valor

Un bot que crea 500 cuentas free reserva 500 slugs. Un coach legítimo que quiera `eva-app.cl/c/crossfit-vitacura` puede encontrar ese slug tomado por un bot.

**Mitigaciones a agregar:**

**1. Lista de slugs reservados:**
```typescript
const RESERVED_SLUGS = [
    'admin', 'api', 'coach', 'register', 'login', 'pricing', 'about', 'contact',
    'eva', 'antigravity', 'soporte', 'help', 'blog', 'app', 'www', 'mail',
    'nike', 'adidas', 'crossfit', 'gym', // marcas conocidas
    // agregar según necesidad
]

// En register/actions.ts, antes de buscar slug disponible:
if (RESERVED_SLUGS.includes(baseSlug)) {
    return { error: 'Este nombre de marca no está disponible. Intentá con otro.' }
}
```

**2. Slug auto-generado incluye caracteres del email (entropía):**
El slug actual viene solo del `brand_name`. Para bots que usan `brand_name = "a"` repetidamente, el slug generado es `a`, `a-abc123`, etc. No es un problema grave — el rate limiter los bloquea antes.

**3. No exponer slugs en errores:** El mensaje "Este nombre ya está tomado" no debe diferenciar si fue tomado por bot o por coach legítimo. Tratar todos los slugs tomados igual.

---

### Gap R4-10: `current_period_end` — comportamiento confirmado para free coaches

**Hallazgo:** En `subscription/page.tsx` línea 212:
```tsx
{coach.current_period_end ? (
    <p>Próximo cobro: {new Date(coach.current_period_end).toLocaleDateString(...)}</p>
) : null}
```

Como coaches free tienen `current_period_end = NULL`, este bloque **no renderiza**. ✅ Correcto — no hay "Próximo cobro" para coaches free. No se necesita fix.

**Pero hay un gap en qué se muestra en su lugar:** Un coach free que abre `/coach/subscription` ve el encabezado de su plan ("Free · Hasta 3 alumnos") pero no hay ningún texto que explique que es gratuito de por vida. Agregar:

```tsx
{!coach.current_period_end && coach.subscription_tier === 'free' && (
    <p className="text-sm text-muted-foreground mt-1">
        Plan gratuito · Sin fecha de vencimiento
    </p>
)}
```

---

### Resumen anti-abuso — stack completo actualizado

El stack de anti-abuso queda así (en orden de ejecución):

| # | Capa | Qué bloquea | Costo |
|---|------|-------------|-------|
| 1 | **Honeypot field** | Bots simples (form scrapers) | $0 |
| 2 | **Cloudflare Turnstile** *(nuevo)* | Bots sofisticados a nivel de red | $0 |
| 3 | **Rate limiting Upstash** | Flood de signups por IP | Ya configurado |
| 4 | **Email verification** *(nuevo — Opción A)* | Emails inventados/no controlados | $0 (Supabase) |
| 5 | **normalizePlatformEmail mejorado** *(fix R4-1)* | Gmail +aliases y dots | $0 (código) |
| 6 | **AbstractAPI email validation** | Dominios desechables, MX inválido | Free 100 req/mes |
| 7 | **`trial_used_email`** | Emails normalizados duplicados | $0 (ya en DB) |
| 8 | **Device fingerprinting** | Mismo device, múltiples cuentas | $0 (FingerprintJS OSS) |
| 9 | **Slug reservados** *(nuevo)* | Squatting de slugs de valor | $0 (código) |
| 10 | **RLS backstop** | Abuso masivo en DB | $0 (ya en Supabase) |

Con este stack, las rutas de abuso restantes son:
- Bots con múltiples IPs reales (proxies residenciales) — Turnstile los filtra a nivel de comportamiento, no IP
- Cuentas manuales masivas — difícil de hacer con verificación de email
- Un coach legítimo con 2-3 cuentas (el que prueba con diferentes brands) — **aceptable, no es el problema real**

---

### Resumen de nuevos gaps Revisión 4

| Gap | Severidad | Acción | Ola |
|-----|----------|--------|-----|
| R4-1: normalizePlatformEmail roto | CRÍTICA | Fix antes de cualquier deploy | 1 |
| R4-2: create-preference sin 'growth' | Media | Agregar a Ola 3 modification list | 3 |
| R4-3: tierOptions muestra 'free' | Alta | Filtrar 'free' de subscription page | 1 |
| R4-4: email_confirm bypasea verificación | Alta | Opción A: verificación real para free | 1 |
| R4-5: welcome modal sin persistencia | Baja | localStorage + history.replaceState | 1 |
| R4-6: "Powered by EVA" footer no especificado | Media | Agregar a Ola 1 con UTM link | 1 |
| R4-7: Cloudflare Turnstile no está | Alta | Agregar a anti-abuso stack | 1 |
| R4-8: Honeypot field no está | Media | 10 líneas de código, hacerlo ya | 1 |
| R4-9: Slug squatting | Baja-media | Lista de slugs reservados | 1 |
| R4-10: Subscription page sin texto "gratuito de por vida" | Baja | Una línea de JSX | 1 |

---

*Documento vivo — actualizar cuando cambien decisiones de implementación.*  
*Carpeta: `implementaciones/` en la raíz del proyecto EVA.*  
*Revisión 4 completada: Mayo 2026 — anti-abuso + code deep-dive.*
