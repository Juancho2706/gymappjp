# Plan modo empresarial (B2B multi-coach) — EVA Fitness Platform

> **Versión documento:** 2026-04-30 (rev. 4 — edición enterprise completa)
> **Estado:** planificación activa. Sin cambios de código en repo hasta aprobar §18.
> **Contexto del equipo:** startup 2 fundadores (sin empresa registrada aún). Billing manual hasta ~30 orgs. Escalar infraestructura de pagos solo cuando el volumen lo justifique.
> **Fuentes internas:** [AGENTS.md](AGENTS.md) · [nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md](nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md) · [nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md) · [nuevabibliadelaapp/05-PAGOS-Y-OPERACIONES.md](nuevabibliadelaapp/05-PAGOS-Y-OPERACIONES.md)

---

## 1. Principio rector: coexistencia sin interrupción

El modo empresarial es un **producto paralelo** al flujo actual EVA (coach independiente B2B2C). Todo lo siguiente debe cumplirse siempre:

| Regla | Implicación técnica |
|--------|---------------------|
| **Opt-in por datos** | `organization_id IS NULL` = comportamiento idéntico al de hoy en 100% de los flujos. |
| **Sin migración forzada** | Ningún coach existente pasa a "empresa" sin acción explícita (invitación aceptada o script documentado). |
| **Sin rutas rotas** | `/c/[coach_slug]`, PWA manifests, webhooks MP retail siguen siendo fuente de verdad para el segmento retail. |
| **Feature isolation** | Todo código nuevo detrás de `organization_id IS NOT NULL` o rutas `/org/*`. Cero cambios a defaults globales. |
| **Dos vías de monetización independientes** | Retail: N coaches × suscripción individual MP. Empresa: 1 pago manual a EVA → activación org → N coaches cubiertos. |
| **Un coach, una org** | `coaches.organization_id` es FK única. Coach en org A no puede ser invitado a org B sin desvincularse primero. |

**Anti-patrón explícito:** convertir `coaches` en unidad de suscripción compartida para retail y org sin discriminar `organization_id`. El modelo correcto: **"coach retail con billing propio OR coach staff con billing org"**, con reglas de precedencia explícitas (§6).

---

## 2. Resumen ejecutivo

### El problema que resolvemos

Un gym con 5 coaches hoy en EVA paga 5 suscripciones individuales, tiene 5 dashboards separados, no sabe cuántos alumnos tiene en total, y si un coach se va, pierde visibilidad de sus alumnos. El dueño del gym gestiona el negocio a ciegas.

### La solución

**"EVA para equipos"** — un solo contrato, panel unificado de gestión, cada coach mantiene su identidad y flujo de trabajo intactos. El gym ve el negocio; cada coach ve sus alumnos.

### Propuesta de valor por persona

| Persona | Antes | Con EVA empresas |
|---------|-------|-----------------|
| **Dueño del gym** | 5 logins distintos, sin vista global, 5 facturas | 1 panel, 1 pago, métricas del equipo en tiempo real |
| **Coach staff** | Misma pantalla + sin saber si el gym pagó por ellos | Misma pantalla + badge "cubierto por [Gym]" |
| **Alumno** | Sin cambio | Sin cambio |

### Diferenciador vs competencia

EVA es el único sistema donde **cada coach mantiene su white-label propio dentro de la misma organización**. Trainerize y Glofox homogenizan la marca del gym → los coaches pierden identidad. En EVA, el alumno de Ana sigue viendo la marca de Ana; el dueño del gym ve a Ana + Pedro + Carlos en un solo panel.

### Estado del equipo y billing

- **Equipo:** 2 fundadores, sin empresa registrada.
- **Billing org MVP:** manual — la org paga a los fundadores (MP link o transferencia bancaria); un fundador activa la org en `/admin`. Escala hasta ~30 orgs sin fricción operativa relevante.
- **Billing org automatizado:** cuando el volumen lo justifique (post-MVP). No antes.

---

## 3. Estado actual (baseline)

- **Grafo de datos:** `coaches` → `clients` → workouts, nutrition, check-ins.
- **Suscripción:** `coaches.subscription_tier`, `max_clients`, `subscription_mp_id` (1:1 coach ↔ pagador MP).
- **Auth:** middleware coach + RLS por `coach_id`; 24 tablas con políticas activas.
- **Pain actual B2B:** múltiples cuentas coach sin vista unificada → workaround manual hoy.
- **Deuda de datos conocida:** `coaches.subscription_mp_id` es 1:1; el modelo org requiere desacoplar billing del coach individual.

---

## 4. Modelo de datos conceptual

```text
Organization
  ├── status: trial | active | grace | suspended | cancelled
  ├── billing_source: manual (MVP) | mp_org (post-MVP)
  ├── max_coaches, max_clients_total, period_end
  │
  ├── OrganizationMember (admin_org | coach_staff)
  │       └── Coach [coach_id intacto — sin cambio de FK en el producto]
  │               └── Clients → workouts, nutrition, check-ins (sin tocar)
  │
  └── OrganizationInvite (email + token_hash + role + expires_at)
```

**Principio de estabilidad:** `coach_id` sigue siendo la FK dominante en todo el producto. Agregar `organization_id` es una extensión, no una reescritura. Las 24+ políticas RLS de `coach_id` no se modifican.

**Roles org MVP:** `admin_org` (gestiona equipo + ve billing), `coach_staff` (solo su dashboard coach).
**Roles org post-MVP:** `viewer` (métricas sin PII), `billing_only` (solo facturación).

---

## 5. Product Manager — alcance, MVP, métricas

### 5.1 Personas y jobs-to-be-done

| Persona | Job principal | Pain sin EVA empresas | Señal de éxito |
|---------|--------------|----------------------|----------------|
| **Org admin (dueño/ops)** | "Quiero ver cómo va mi negocio hoy sin llamar a cada coach" | Ciego operativamente, 5 pagos distintos | Entra al panel 3+ veces por semana |
| **Coach staff** | "Quiero trabajar con mis alumnos sin preocuparme por suscripciones" | Le aparece pantalla de pago aunque el gym ya pagó | Nunca ve una pantalla de checkout |
| **Alumno** | Sin cambio de job | — | Flujo idéntico a hoy |
| **EVA (fundadores)** | "Quiero cerrar contratos B2B y activarlos en < 1 hora" | Proceso manual sin infraestructura | Activación org < 30 min desde pago recibido |

### 5.2 MVP — qué entra, qué no

| Feature | MVP | Post-MVP | Razón del corte |
|---------|-----|----------|-----------------|
| Schema `organizations` + vínculo coach | ✅ | — | Base de todo |
| Invitaciones email (7d expiración) | ✅ | Recordatorios automáticos | Mínimo funcional |
| Panel `/org/*` con KPIs básicos | ✅ | Reportes exportables, sedes | Valor inmediato |
| Activación manual por fundadores | ✅ | — | Suficiente para 30 orgs |
| Billing panel (estado, historial, instrucciones pago) | ✅ | Checkout embebido | Ver §16 |
| Email automático de renovación con link MP | ✅ | — | ROI alto, costo bajo |
| Enforcement seats en tiempo real | ✅ | — | Evita over-provisioning |
| Desvincular coach de org | ✅ | Transferencia alumnos entre coaches | Flujo crítico |
| Trial 14 días para piloto | ✅ | Trial configurable por deal | Cerrar demos |
| Notificaciones: invitación, grace, límite seats | ✅ | Digest semanal, inactividad | Mínimo viable CS |
| MP org automatizado | ❌ | Post-MVP v1 | Complejidad alta, ROI post-piloto |
| SSO / API pública / dominio propio | ❌ | Fase enterprise | Fuera de alcance actual |
| Pool global alumnos cross-coach | ❌ | Post-MVP | Decisión de datos compleja |

### 5.3 Métricas de éxito

**Adquisición B2B**
- Demo solicitada → org activada: objetivo ≤ 48h desde primer contacto.
- Conversion rate demo → piloto pagado: > 50% (señal de fit de mercado).

**Activación**
- Time to first coach activo tras crear org: objetivo < 24h.
- % coaches en org que completan invitación en 7d: > 80%.

**Retención y expansión**
- ARPA org vs ARPA coach retail: objetivo ≥ 3×.
- Net Revenue Retention org a 12 meses: > 110% (expansión de seats).
- Churn org anual: < 10%.

**Producto**
- % coaches bajo org sin MP propio: objetivo 100% (validación del modelo).
- Orgs que usan ≥ 80% de seats: señal de upgrade inminente → acción CS.

**Operativo (fundadores)**
- Tiempo de activación manual org: < 30 min por org.
- Incidencias P0 org: objetivo 0/mes; SLA resolución < 2h.

### 5.4 Criterios de no-regresión retail (bloqueantes de merge)

- Coach nuevo retail: flujo idéntico a hoy — MP, `processing`, tiempos, UI sin mención de org.
- Coach con `organization_id IS NULL`: middleware y gate solo leen columnas `coaches`.
- `p95` de queries coach retail no se degrada al añadir índices org.
- Suite "retail-only" en CI pasa en verde en cada PR que toque gate/middleware/RLS.

### 5.5 Definición de Done — MVP

- [ ] Coach retail se registra sin ver ningún concepto de organización.
- [ ] Fundador puede crear org desde `/admin`, setear período, activar manualmente.
- [ ] Org admin puede invitar coaches, ver lista con estados, ver KPIs básicos.
- [ ] Coach staff trabaja en `/coach/*` sin pantalla de pago si org activa.
- [ ] Org admin ve billing panel con estado, historial manual, instrucciones de pago.
- [ ] Suite retail en CI verde.
- [ ] Runbook CS aprobado.

---

## 6. Reglas de precedencia — billing y acceso

Definición explícita para eliminar doble bloqueo o doble cobro:

| Condición | Acceso coach | Billing mostrado |
|-----------|-------------|-----------------|
| `organization_id IS NULL` | Reglas actuales `coaches.subscription_*` | `/coach/subscription` normal |
| `organization_id NOT NULL` + org **active** | ✅ Sin necesidad de MP propio | Banner "Cubierto por [Org]"; ocultar checkout |
| Org en **grace** (7d) | ✅ Con banners de aviso | Banner rojo en org admin; amarillo en coach staff |
| Org **vencida/suspendida** | ❌ Bloqueado | "Tu acceso está pausado. Contacta al administrador de [Gym]." — no pantalla de pago retail |
| Coach intenta salir con alumnos activos | ❌ UI bloquea | "Transfiere o descarga datos de alumnos antes de desvincular." |

**Nunca:** mostrar checkout MP a coach staff si `billing_source = 'org'`.
**Siempre:** datos históricos del alumno accesibles aunque org venza (sus datos son suyos).

---

## 7. UX / UI — dashboard empresarial

### 7.1 Los tres mundos (nunca mezclar)

| Mundo | Usuario | Experiencia | Rutas |
|-------|---------|-------------|-------|
| **A — Retail** | Coach independiente | "Mi negocio, mi marca, mi ritmo" | `/coach/*` |
| **B — Staff** | Coach contratado por gym | Idéntico a A + badge sutil | `/coach/*` + banner |
| **C — Admin org** | Dueño/ops/contador del gym | "Mi equipo, mi contrato, mi data" | `/org/*` |

El admin org **nunca** ve el Panel CEO de EVA (`/admin/*`). Son cliente, no operador de plataforma.

### 7.2 Dirección visual

- **Personalidad:** "control tower" — datos primero, calma, densidad informativa. Sin animaciones gamificadas del dashboard coach.
- **Marca:** logo del **gym** en cabecera. "Powered by EVA" en footer, pequeño. El gym es el protagonista.
- **Color:** paleta neutra (slate/zinc) + un acento (primario del gym si está configurado, azul sistema si no). Sin verde EVA de landing como fondo completo.
- **Layout:** sidebar en desktop + bottom tab bar en móvil (máx. 5 ítems).
- **Cards KPI:** número grande + delta + contexto. Métricas siempre **agregadas**.
- **Tablas:** estilo directorio — badges de estado, densidad legible, acciones inline.
- **Celebraciones:** toasts sobrios únicamente. Sin confetti.
- **Estados vacíos:** ícono + 2 líneas + un CTA. "Invita a tu primer coach →"
- **Dark mode:** sí, desde MVP.
- **Accesibilidad:** WCAG 2.1 AA — contraste ≥ 4.5:1, focus visible, navegación teclado, `aria-label` en todas las acciones de tabla.

### 7.3 Flujos con todos los estados

**Invitar coach**
```
Modal: email → rol (admin_org / coach_staff) → confirmar
  ├── Email sin cuenta EVA     → invitación nueva; coach crea cuenta y se vincula
  ├── Email = coach retail     → "Este coach ya tiene cuenta. ¿Vincularla? Deberá aceptar."
  ├── Email ya en otra org     → Error: "Este coach pertenece a [Otra Org]. Debe desvincularse primero."
  └── Org en max_coaches       → Error: "Límite de X coaches alcanzado. Actualiza tu plan."
Estado en tabla: Pendiente (7d) → Aceptada | Expirada | Revocada
```

**Coach sale del gym**
```
Org admin → "Desvincular" →
  ├── Coach con alumnos        → Modal: "X alumnos activos. Descarga o transfiere antes."
  └── Coach sin alumnos        → Confirmación → coach vuelve a retail (necesita MP propio)
→ Audit log: quién, cuándo, qué acción
→ Email coach: "Tu acceso ahora es independiente. Configura tu suscripción."
```

**Org vence**
```
D-7: Email org admin "Tu plan vence en 7 días. [Instrucciones de renovación]"
D-0: Org pasa a grace (7d)
     → Banner rojo org admin: "Plan vencido. Renueva para evitar pausa."
     → Banner amarillo coach staff: "Tu acceso podría pausarse. Contacta al administrador."
D+7: Org suspendida
     → Coach bloqueado: página informativa, sin pantalla MP
     → Alumno: historial accesible, sin crear contenido nuevo
     → Email org admin: "Acceso pausado. Escríbenos para reactivar."
```

### 7.4 Arquitectura de información `/org`

**Sidebar MVP (5 ítems máximo):**

| # | Sección | Qué muestra |
|---|---------|-------------|
| 1 | **Resumen** | KPIs del negocio, estado suscripción, actividad reciente |
| 2 | **Equipo** | Coaches, invitaciones, progreso de seats |
| 3 | **Uso** | Alumnos vs cupo, desglose por coach (solo counts en MVP) |
| 4 | **Facturación** | Estado del plan, historial de pagos manuales, instrucciones renovación |
| 5 | **Ajustes** | Nombre legal, RUT, contacto, logo org |

**Post-MVP (no en v1):** Sedes, roles finos, reportes CSV, comparativas, integraciones.

### 7.5 Pantalla "Resumen"

```
┌────────────────────────────────────────────────────────┐
│ [Logo CrossFit Providencia]   Resumen    [+ Invitar]   │
├──────────────┬──────────────┬────────────┬─────────────┤
│  Coaches     │  Alumnos     │ Sesiones   │ Adherencia  │
│  7 / 10      │  142 / 200   │ 89 (7d)    │ 74% (7d)    │
│  ▲2 este mes │  ▲8 este mes │ ▼3% vs sem │ — baseline  │
├──────────────┴──────────────┴────────────┴─────────────┤
│  🟢 Plan Pro · Activo · Renueva 15 May 2026            │
│     [Ver instrucciones de pago]                        │
├────────────────────────────────────────────────────────┤
│  Actividad reciente del equipo                         │
│  · Ana López aceptó invitación — hace 2h               │
│  · Pedro Ruiz alcanzó límite de alumnos — 1d           │
│  · María Torres no inicia sesión hace 8d ⚠️            │
└────────────────────────────────────────────────────────┘
```

### 7.6 Pantalla "Equipo"

- Lista coach: avatar/iniciales, nombre, slug (link a PWA del coach), rol, badge (Activo / Invitado / Suspendido / Sin actividad).
- Barra de progreso seats: "7 / 10 coaches en plan. [Ampliar plan]"
- Drawer al hacer clic en coach: email, fecha alta, alumnos activos, última sesión, acciones (desvincular, cambiar rol).
- Invitaciones pendientes con reenviar / revocar / copiar link.

### 7.7 Pantalla "Facturación" (sin checkout embebido — §16)

```
┌────────────────────────────────────────────────────────┐
│  Tu plan                                               │
│  Pro Gym · 10 coaches · 200 alumnos                    │
│  Estado: 🟢 Activo                                     │
│  Próxima renovación: 15 de mayo 2026                   │
├────────────────────────────────────────────────────────┤
│  Historial de pagos                                    │
│  15 mar 2026   $XXX.XXX CLP   ✓ Confirmado            │
│  15 feb 2026   $XXX.XXX CLP   ✓ Confirmado            │
│  15 ene 2026   $XXX.XXX CLP   ✓ Confirmado            │
├────────────────────────────────────────────────────────┤
│  ¿Necesitas renovar o cambiar de plan?                 │
│  [Ver instrucciones de pago]  [Contactar a EVA]        │
└────────────────────────────────────────────────────────┘
```

"Ver instrucciones de pago" → modal con link MP o datos de transferencia (configurable por el fundador que activa la org).

### 7.8 Micro-UX para coach staff

- Banner delgado en `/coach/dashboard`: "Tu acceso está incluido en el plan de **[Gym]**."
- Settings coach: ocultar "Cambiar plan" si `billing_source = 'org'`. Mostrar "Plan gestionado por [Org]."
- Sin checkout MP visible si org activa.
- Si org entra en grace: "Tu acceso podría pausarse en X días. Contacta a tu administrador de [Gym]."

### 7.9 Onboarding org admin

```
Email bienvenida: "Tu cuenta empresarial EVA está activa" →

Checklist en /org/dashboard (desaparece al completar):
  ☐ 1. Completa los datos de tu organización (nombre, RUT, contacto)
  ☐ 2. Sube el logo de tu gimnasio
  ☐ 3. Invita a tu primer coach
  ☐ 4. Coach acepta la invitación
  → [Todo listo 🎉 — Tu equipo está en EVA]
```

### 7.10 Rutas nuevas

| Ruta | Propósito | Auth |
|------|-----------|------|
| `/org` | Redirect a `/org/dashboard` | `admin_org` |
| `/org/dashboard` | Resumen | `admin_org` |
| `/org/team` | Equipo + invitaciones | `admin_org` |
| `/org/usage` | Uso vs límites | `admin_org` |
| `/org/billing` | Estado plan, historial, instrucciones | `admin_org` |
| `/org/settings` | Datos org, logo | `admin_org` |
| `/org/invite/accept` | Aceptar invitación | Token válido (pública) |
| `/empresas` | Landing B2B | Pública |

### 7.11 Reutilizar del producto actual

| Activo | Cómo sirve |
|--------|-----------|
| Layout `admin/(panel)` | Estructura sidebar + mobile tabs; renombrar KPIs |
| Tablas + badges (CEO panel) | Lista coaches en `/org/team` |
| `GlassCard`, `InfoTooltip`, paginación | Coherencia visual |
| Charts Recharts | Uso agregado en `/org/usage` |
| Copy estados suscripción (grace, active) | Adaptar a "cuenta empresa" |
| `useOptimistic` | Feedback inmediato en invite/revoke |

### 7.12 NO reutilizar

| Activo | Por qué |
|--------|---------|
| `/admin/*` Panel CEO | Operación EVA interna; cliente empresa nunca lo ve |
| `/coach/subscription` como UI pago org | Mezcla mentalidades |
| Perfil alumno completo en vista org | Riesgo legal; solo aggregados en MVP |

### 7.13 Accesibilidad y móvil

- `dvh` / `min-h-dvh`; sin `h-screen` en layouts org.
- `pb-safe` en bottom nav móvil.
- Focus trap en modales de invitación.
- `aria-label` descriptivo en reenviar, revocar, desvincular.

---

## 8. Frontend Developer

### 8.1 Estructura de rutas

```
src/app/org/
├── (panel)/
│   ├── layout.tsx                    # RSC — requireOrgAdminMember(); sidebar org
│   ├── dashboard/
│   │   ├── page.tsx                  # RSC — Promise.all([kpis, activityFeed])
│   │   ├── loading.tsx               # Skeleton 4 cards + tabla
│   │   └── _components/
│   │       ├── OrgKpiCard.tsx
│   │       ├── OrgSubscriptionBanner.tsx
│   │       └── OrgActivityFeed.tsx
│   ├── team/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   ├── _data/team.queries.ts     # getOrgCoaches(), getOrgInvites()
│   │   ├── _actions/team.actions.ts  # inviteCoach(), revokeInvite(), unlinkCoach()
│   │   └── _components/
│   │       ├── CoachRow.tsx
│   │       ├── InviteModal.tsx       # 3 pasos: email → rol → confirmar
│   │       ├── CoachDrawer.tsx
│   │       └── SeatProgressBar.tsx
│   ├── usage/
│   │   ├── page.tsx
│   │   ├── _data/usage.queries.ts
│   │   └── _components/
│   │       ├── UsageLimitBar.tsx
│   │       └── UsageByCoachTable.tsx
│   ├── billing/
│   │   ├── page.tsx
│   │   ├── _data/billing.queries.ts  # getOrgBillingHistory()
│   │   └── _components/
│   │       ├── PlanStatusCard.tsx
│   │       ├── PaymentHistoryTable.tsx
│   │       └── PaymentInstructionsModal.tsx
│   └── settings/
│       ├── page.tsx
│       ├── _actions/settings.actions.ts
│       └── _components/OrgSettingsForm.tsx
└── invite/
    └── accept/
        └── page.tsx                  # RSC pública — verifica token, muestra estado
```

### 8.2 Estado y datos

- `React.cache` en `_data/*.queries.ts` — deduplicación por request.
- `Promise.all()` para KPIs paralelos en dashboard.
- `useTransition` + server actions + `revalidatePath('/org/...')` como patrón estándar.
- `useOptimistic` para invite/revoke (feedback instantáneo).
- Props opcionales en componentes shared: `managedByOrg?: { name: string; orgId: string }` — sin romper contratos existentes.

### 8.3 Helpers de contexto

```typescript
// src/lib/org/get-org-context.ts
export const getOrgContext = cache(async (coachId: string): Promise<OrgContext | null> => {
  // Fallo silencioso → null → modo retail (safe default siempre)
})

// src/lib/org/require-org-admin.ts
export async function requireOrgAdminMember(): Promise<OrgMember> {
  const member = await getOrgMemberForCurrentUser()
  if (!member || member.role !== 'admin_org') redirect('/coach/dashboard')
  return member
}
```

### 8.4 Middleware

- Matcher `/org/*`: verificar sesión + rol `admin_org`; si no → `redirect('/coach/dashboard')`.
- `/org/invite/accept`: pública. Verificación de token en RSC (no en middleware — puede ser email sin sesión).
- Rutas `/coach/*` y `/c/[slug]/*`: **no tocar**. Mismo comportamiento que hoy.

### 8.5 Caching y revalidación

- Tags: `['org-team', orgId]`, `['org-usage', orgId]`, `['org-billing', orgId]`.
- `revalidateTag('org-team', orgId)` tras invite/revoke/unlink.
- `revalidateTag('org-billing', orgId)` tras activación manual desde `/admin`.
- Sin `unstable_cache` — incompatible con Supabase SSR.

### 8.6 Error boundaries

- `error.tsx` en cada módulo org con mensajes específicos.
- Queries org fallidas → datos parciales; no pantalla en blanco total.
- Server action errors: `useActionState` → mensajes inline vía Zod v4.

---

## 9. Backend Developer (Supabase, RLS, RPCs)

### 9.1 Schema completo

```sql
-- ============================================================
-- TABLA: organizations
-- ============================================================
CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  legal_name            TEXT,
  tax_id                TEXT,           -- RUT/RUC; cifrar en reposo (pgcrypto/vault)
  billing_email         TEXT,
  status                TEXT NOT NULL DEFAULT 'trial'
                          CHECK (status IN ('trial','active','grace','suspended','cancelled')),
  billing_source        TEXT NOT NULL DEFAULT 'manual'
                          CHECK (billing_source IN ('manual','mp_org')),
  max_coaches           INT NOT NULL DEFAULT 5,
  max_clients_total     INT,            -- NULL = suma max_clients por coach; INT = pool global
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  grace_ends_at         TIMESTAMPTZ,   -- = current_period_end + INTERVAL '7 days'
  mp_preapproval_id     TEXT,          -- post-MVP; NULL en MVP
  notes                 TEXT,          -- notas internas EVA (no visibles por org)
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ALTERACIONES: coaches
-- ============================================================
ALTER TABLE coaches
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN billing_source  TEXT DEFAULT 'self'
                               CHECK (billing_source IN ('self','org'));

-- Índice parcial — sin overhead para coaches retail (organization_id IS NULL)
CREATE INDEX CONCURRENTLY idx_coaches_org
  ON coaches(organization_id)
  WHERE organization_id IS NOT NULL;

-- ============================================================
-- TABLA: organization_members
-- ============================================================
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  coach_id        UUID REFERENCES coaches(id) ON DELETE SET NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin_org','coach_staff')),
  joined_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)  -- un user = un rol por org
);
CREATE INDEX idx_org_members_org  ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- TABLA: organization_invites
-- ============================================================
CREATE TABLE organization_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin_org','coach_staff')),
  token_hash      TEXT NOT NULL UNIQUE,  -- hash del token enviado por email (nunca guardar token plano)
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  invited_by      UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_invites_org   ON organization_invites(organization_id);
CREATE INDEX idx_org_invites_email ON organization_invites(email) WHERE accepted_at IS NULL;

-- ============================================================
-- TABLA: org_payment_records (billing manual MVP)
-- ============================================================
CREATE TABLE org_payment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  amount_clp      INT NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  payment_method  TEXT DEFAULT 'manual' CHECK (payment_method IN ('manual','mp_link','transfer','mp_org')),
  reference       TEXT,     -- número de transferencia, referencia MP, etc.
  activated_by    UUID REFERENCES auth.users(id),  -- fundador que activó
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_payment_records_org ON org_payment_records(organization_id, paid_at DESC);

-- ============================================================
-- TABLA: org_audit_logs
-- ============================================================
CREATE TABLE org_audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_user_id   UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  -- Valores: invite_sent | invite_accepted | invite_revoked | invite_expired
  --          coach_linked | coach_unlinked | org_activated | org_suspended
  --          org_renewed | role_changed | settings_updated
  target_user_id  UUID,
  target_coach_id UUID,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_audit_org ON org_audit_logs(organization_id, created_at DESC);
```

### 9.2 RLS — políticas aditivas

```sql
-- Org admin: leer coaches de su org
CREATE POLICY "org_admin_read_own_coaches"
ON coaches FOR SELECT
USING (
  organization_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = coaches.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin_org'
  )
);

-- Org admin: leer miembros de su org
CREATE POLICY "org_admin_read_own_members"
ON organization_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members me
    WHERE me.organization_id = organization_members.organization_id
      AND me.user_id = auth.uid()
      AND me.role = 'admin_org'
  )
);

-- Org admin: leer historial de pagos de su org
CREATE POLICY "org_admin_read_payments"
ON org_payment_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_payment_records.organization_id
      AND user_id = auth.uid()
      AND role = 'admin_org'
  )
);

-- IMPORTANTE: las políticas existentes de coaches (coach_id = auth.uid()) NO se modifican.
-- Las políticas org son ADITIVAS — OR implícito en evaluación de políticas Supabase.
```

### 9.3 RPCs de métricas

```sql
CREATE OR REPLACE FUNCTION get_org_dashboard_metrics(p_org_id UUID)
RETURNS TABLE (
  active_coaches   INT,
  total_seats      INT,
  active_clients   INT,
  max_clients      INT,
  sessions_7d      INT,
  checkins_7d      INT,
  org_status       TEXT,
  period_end       TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Auth check: caller debe ser admin_org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role = 'admin_org'
  ) THEN RAISE EXCEPTION 'unauthorized: not an admin_org of this organization'; END IF;

  RETURN QUERY
    SELECT
      COUNT(c.id)::INT                      FILTER (WHERE c.subscription_status IN ('active','trial')),
      o.max_coaches,
      COALESCE(SUM(c.current_client_count), 0)::INT,
      COALESCE(o.max_clients_total, SUM(c.max_clients))::INT,
      COALESCE((
        SELECT COUNT(*)::INT FROM workout_logs wl
        JOIN coaches cc ON cc.id = wl.coach_id
        WHERE cc.organization_id = p_org_id
          AND wl.created_at >= now() - INTERVAL '7 days'
      ), 0),
      COALESCE((
        SELECT COUNT(*)::INT FROM check_ins ci
        JOIN clients cl ON cl.id = ci.client_id
        JOIN coaches cc ON cc.id = cl.coach_id
        WHERE cc.organization_id = p_org_id
          AND ci.created_at >= now() - INTERVAL '7 days'
      ), 0),
      o.status,
      o.current_period_end
    FROM organizations o
    JOIN coaches c ON c.organization_id = o.id
    WHERE o.id = p_org_id
    GROUP BY o.id, o.max_coaches, o.max_clients_total, o.status, o.current_period_end;
END;
$$;
```

### 9.4 Enforcement de seats (transaccional)

```sql
-- Función llamada al aceptar invitación
CREATE OR REPLACE FUNCTION accept_org_invite(p_token TEXT, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite   organization_invites%ROWTYPE;
  v_org      organizations%ROWTYPE;
  v_count    INT;
BEGIN
  -- 1. Verificar token y no expirado
  SELECT * INTO v_invite FROM organization_invites
  WHERE token_hash = crypt(p_token, token_hash)
    AND accepted_at IS NULL AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;  -- lock para prevenir race condition
  IF NOT FOUND THEN RETURN '{"error":"invalid_or_expired_token"}'::JSONB; END IF;

  -- 2. Verificar seats disponibles
  SELECT * INTO v_org FROM organizations WHERE id = v_invite.organization_id FOR UPDATE;
  SELECT COUNT(*) INTO v_count FROM organization_members WHERE organization_id = v_org.id;
  IF v_count >= v_org.max_coaches THEN
    RETURN '{"error":"seats_limit_reached"}'::JSONB;
  END IF;

  -- 3. Vincular coach y marcar invitación
  UPDATE organization_invites SET accepted_at = now() WHERE id = v_invite.id;
  INSERT INTO organization_members(organization_id, user_id, role)
    VALUES (v_org.id, p_user_id, v_invite.role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  UPDATE coaches SET organization_id = v_org.id, billing_source = 'org'
    WHERE user_id = p_user_id;

  -- 4. Audit log
  INSERT INTO org_audit_logs(organization_id, actor_user_id, action, target_user_id)
    VALUES (v_org.id, p_user_id, 'invite_accepted', p_user_id);

  RETURN '{"ok":true}'::JSONB;
END;
$$;
```

### 9.5 Cascade y retención

| Evento | Comportamiento |
|--------|---------------|
| Org cancelada | `coaches.organization_id = NULL`, `billing_source = 'self'` (via ON DELETE SET NULL + trigger) |
| Coach desvinculado | `organization_members` row deleted; coach → retail |
| Datos de alumnos | **Nunca** cascade delete por cambio de org |
| `org_payment_records` | Retener 6 años (SII Chile) |
| `org_audit_logs` | Retener 2 años |

---

## 10. DevOps

### 10.1 Variables de entorno

```env
# Feature flag — false = rutas /org/* retornan 404
ENTERPRISE_ORG_ENABLED=true

# Grace period configurable sin redeploy
ORG_GRACE_PERIOD_DAYS=7

# Email de renovación (si se usa Resend/SendGrid para los automáticos)
ORG_RENEWAL_EMAIL_FROM=pagos@eva.fitness
```

### 10.2 CI/CD

- Job separado `retail-regression` en CI — ejecuta suite retail en cada PR que toque: gate, middleware, cualquier política RLS, `organizations/*`.
- Feature branch `feat/enterprise-org` → staging → producción controlada.
- Deploy staging: `ENTERPRISE_ORG_ENABLED=true`; producción inicial: `false` hasta validar.

### 10.3 Monitoreo

- Logs estructurados: `{ event: "org_invite_accepted", orgId, coachId, durationMs, actorId }`.
- Alerta: cualquier error 5xx en rutas `/org/*` → notificación inmediata fundadores.
- Dashboard Supabase: RPCs org → alerta si p95 > 300ms.
- Métrica separada: requests `/org/*` vs `/coach/*` — no contaminar baseline retail.

### 10.4 Scripts operativos

```
scripts/
├── provision-org.ts         # Crear org + vincular coaches (staging/prod manual)
├── deactivate-org.ts        # Suspender org + notificar coaches (dry-run primero siempre)
├── renew-org.ts             # Extender period_end tras confirmar pago manual
└── migrate-retail-to-org.ts # Para gyms que ya tienen cuentas sueltas → org
```

### 10.5 Backup y PII

- `organizations` (RUT, contacto): backup diferencial diario.
- `org_payment_records`: retención 6 años; backup semanal adicional.
- `org_audit_logs`: retención 2 años.
- DR: documentar RTO/RPO para tabla `organizations` en runbook ops.

---

## 11. QA

### 11.1 Matriz de regresión (obligatoria en cada PR)

| Escenario | Resultado esperado |
|-----------|-------------------|
| Coach nuevo retail | Flujo idéntico a hoy; cero menciones de org |
| Coach `organization_id IS NULL` | Gate idéntico; sin queries org en logs |
| Coach retail visita `/org/*` | Redirect a `/coach/dashboard` |
| Org activa, coach staff | Acceso sin MP propio; banner "Cubierto por [Gym]" visible |
| Org en grace (día 3) | Coach con acceso; banner amarillo; org admin con banner rojo |
| Org vencida (día 8) | Coach bloqueado; página informativa correcta; sin checkout MP |
| Invitación expirada | "Esta invitación ha expirado." — no vincula |
| Invitación revocada | "Esta invitación fue revocada." — no vincula |
| Email ya en otra org | Error claro; sin vincular |
| Seats en límite (max_coaches) | Invitación rechazada; UI muestra límite |
| Race condition: 2 invites simultáneas en último seat | Solo una pasa; otra → error seats_limit |
| Coach desvinculado | `billing_source = 'self'`; necesita MP propio |
| Alumno `/c/[slug]` | Sin cambio de permisos; historial accesible |
| IDOR: org admin A intenta ver org B | 403 / datos vacíos |
| Coach staff intenta acceder `/org/*` | Redirect a `/coach/dashboard` |
| Token de invitación usado dos veces | Segunda vez → error invalid_token |

### 11.2 Tests de seguridad

- Org admin A no accede a coaches/métricas de org B (test RLS con dos JWTs distintos).
- SQL injection en campos texto org: Zod bloquea antes de DB.
- Token de invitación: hash nunca expuesto en respuestas de API.
- Audit log: cada acción crítica produce registro (test en server actions).

### 11.3 Automatización

```
tests/
├── rls/rls-org-isolation.test.ts   # JWT admin_org vs otra org; JWT coach_staff vs /org/*
├── e2e/org-smoke.test.ts            # Flujo completo: crear org → invitar → aceptar → ver panel
├── e2e/retail-smoke.test.ts         # Flujo retail sin cambios (existente, extender si falta)
└── unit/accept-org-invite.test.ts   # Race condition seats; token expirado; token revocado
```

---

## 12. Data & Analytics

### 12.1 Modelo de eventos

```sql
-- Tabla separada de eventos org (no mezclar con coach_subscription_events)
CREATE TABLE org_subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type      TEXT NOT NULL,
  -- Valores: trial_start | activated | renewed | seat_added | seat_removed
  --          grace_entered | suspended | cancelled | reactivated
  mrr_delta_clp   INT,         -- cambio en MRR mensual (positivo = expansión, negativo = contracción)
  seats_after     INT,
  payment_record_id UUID REFERENCES org_payment_records(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 12.2 Funnels B2B

```
Visita /empresas →
Demo solicitada →
Org creada (trial) →
Primer coach invitado →
Primer coach activo (aceptó + log de alumno) →
Primer pago recibido →
Renovación mes 2 →
Seat adicional (expansión)
```

Medir conversion en cada paso. Drop-off alto en "primer coach activo" → problema de onboarding.

### 12.3 Dashboards CEO (nuevas dimensiones)

- **MRR:** org vs retail stacked; trend mensual.
- **Orgs:** activas / trial / grace / canceladas.
- **ARPA:** org vs retail; objetivo org ≥ 3×.
- **Heatmap expansión:** orgs usando > 80% de seats → candidatas a upgrade.
- **Cohort retención org:** mes 1 → 3 → 6 → 12; alertar si mes 1 churn > 15%.

### 12.4 Alertas automáticas (accionables)

| Señal | Acción |
|-------|--------|
| Org en grace + sin pago en 3d | CS envía WhatsApp/email proactivo |
| Org usando > 90% alumnos del pack | CS ofrece upgrade de plan |
| Coach inactivo > 14d en org | Alerta org admin (post-MVP digest) |
| Cohort mes 1 churn > 15% | Revisar onboarding — reunión equipo |

---

## 13. Sales & Product Marketing

### 13.1 Narrativa de producto (mensaje único)

**Para gyms:** "Un contrato. Todo tu equipo. Cada coach con su sello."

**Expansión del mensaje:**
> Tus coaches trabajan con su propia marca, sus alumnos los conocen así. Pero tú, como dueño del gym, necesitas ver el negocio completo. EVA te da las dos cosas: cada coach mantiene su identidad, tú tienes la visión de equipo que nunca tuviste.

**Por qué EVA vs alternativas:**
- Trainerize: borra la identidad del coach, todo es marca Trainerize.
- Glofox/Mindbody: para reservas y pagos presenciales, no para coaching digital personalizado.
- Varias cuentas sueltas: sin visión de negocio, sin un solo contrato, más caro.

### 13.2 Proceso de venta

```
1. DESCUBRIMIENTO (D+0)
   Canal: referido de coach existente / LinkedIn / contacto directo
   Pregunta: "¿Cuántos coaches tienes? ¿Cómo gestionas el día a día?"
   Objetivo: confirmar fit (≥ 3 coaches, quieren visión unificada)

2. DEMO (D+2 a D+5)
   Formato: videollamada 30 min
   Mostrar: panel org → invitar coach → ver KPIs → billing simple
   No mostrar: nada que no exista aún
   CTA: "Piloto 14 días, sin costo, yo lo activo hoy."

3. PILOTO (D+5 a D+19)
   Fundador activa org manualmente
   CS hace check-in D+3: "¿Todos los coaches aceptaron?"
   CS hace check-in D+14: "¿Qué falta para que esto sea tu herramienta principal?"

4. CIERRE (D+20)
   Si piloto exitoso → enviar link MP o datos de transferencia
   Pago recibido → fundador activa org (< 30 min)
   Email: "Tu plan está activo. Bienvenido a EVA."

5. EXPANSIÓN (D+90)
   CS detecta org en 80%+ de seats → "Tus coaches llenan el plan, ¿agregamos más?"
```

### 13.3 Pricing (propuesta — decidir antes de ola 4)

| Plan | Seats coaches | Alumnos máx. | Precio mensual | Precio anual |
|------|--------------|-------------|----------------|-------------|
| **Starter** | 3 | 75 | $XX.XXX CLP | $XX.XXX × 10 (2 meses gratis) |
| **Pro** | 10 | 250 | $XX.XXX CLP | $XX.XXX × 10 |
| **Elite** | 25 | 600 | $XX.XXX CLP | $XX.XXX × 10 |
| **Enterprise** | Ilimitado | Ilimitado | Contactar | Contrato anual |

**Ancla de precio:** mostrar siempre "vs X cuentas individuales" en la comparativa. Si un coach individual paga $Z/mes, Pro Gym (10 coaches) debe ser visiblemente más barato que $Z×10.

**Descuento anual:** 2 meses gratis (≈17%) → incentiva pago adelantado → cash flow para startup.

**Piloto:** 14 días sin costo → baja barrera de entrada → cierra demos más rápido.

### 13.4 Materiales de venta

- **One-pager B2B** (1 página A4): problema → solución → cómo funciona → precios → CTA demo.
- **Comparativa** en `/pricing#equipos`: 3 cuentas sueltas vs Pack Starter (tabla visual).
- **FAQ B2B:** ¿Qué pasa con los alumnos si cancelo? ¿Puede cada coach seguir con su app? ¿Cómo pago?
- **Case study piloto** (post ola 3): gym X → resultados → cita del dueño.

### 13.5 Canales de adquisición

| Canal | Etapa | Prioridad |
|-------|-------|----------|
| Red actual de coaches EVA → sus gyms | Ahora | 🔴 Alta |
| LinkedIn (dueños de gym, gerentes fitness Chile) | Ola 4 | 🟡 Media |
| SEO `/empresas` ("software para gimnasios Chile") | Ola 4 | 🟡 Media |
| Referidos: coach retail que trae su gym → descuento | Post-MVP | 🟢 Baja |
| LinkedIn Ads Latinoamérica | Post-piloto | 🟢 Baja |

**Prioridad absoluta en etapa actual:** hablar con los coaches que ya usan EVA y preguntarles si su gym pagaría por visión unificada. Son el canal de menor costo y mayor conversión.

---

## 14. Customer Success

### 14.1 Runbook: Alta org manual (MVP)

```
1. Fundador recibe pago (MP link o transferencia)
2. Fundador verifica pago en su cuenta MP o banco
3. Fundador abre /admin → crea org → setea:
     - max_coaches, max_clients_total
     - current_period_start, current_period_end
     - status = 'active'
     - Registra en org_payment_records
4. Script: scripts/renew-org.ts --orgId=XXX (o UI /admin)
5. Fundador envía email de bienvenida al org admin con:
     - Link a /org/dashboard
     - Checklist de primeros pasos
6. CS check-in D+3: "¿Coaches aceptaron invitaciones?"
7. CS check-in D+30: "¿Están usando el panel? ¿Qué les falta?"
```

### 14.2 Runbook: Coach sale del gym

```
1. Org admin desvincula en /org/team → UI bloquea si tiene alumnos activos
2. Org admin decide: ¿alumnos quedan con la org (otro coach) o se van con él?
3. Fundador ejecuta scripts/deactivate-org.ts --coachId=XXX --orgId=XXX (dry-run primero)
4. Coach recibe email: "Tu acceso es ahora independiente. Configura tu suscripción."
5. Audit log registra actor + timestamp + metadata
```

### 14.3 Runbook: Escalación P0 (org pagó, coaches bloqueados)

```
1. CS recibe reporte → entra a /admin → verifica org.status
2. Status OK pero coaches bloqueados → bug de gate → rollback ENTERPRISE_ORG_ENABLED → investigar
3. Status incorrecto → activación manual inmediata → notificar org admin + coaches afectados
4. SLA resolución: < 2 horas desde reporte
5. Post-mortem en 48h: causa raíz + acción preventiva documentada
```

### 14.4 Health Score por org

| Señal | Peso | Cálculo |
|-------|------|---------|
| % coaches activos (log < 7d) | 40% | coaches_activos / total_seats |
| % alumnos activos (log < 7d) | 30% | alumnos_con_log / total_alumnos |
| Uso de seats | 20% | seats_usados / max_coaches |
| Días hasta renovación | 10% | min(días_restantes / 30, 1.0) |

- Score 0–49: alerta CS → contacto proactivo en 24h.
- Score 50–74: monitoreo semanal.
- Score 75–100: saludable; check-in mensual.

### 14.5 Plantillas de email

```
INVITACIÓN COACH:
Asunto: [Gym] te invitó a EVA
"[Nombre], [Dueño] del [Gym] te invitó a unirte como coach en EVA.
Tu acceso está cubierto por el plan del gimnasio.
[Aceptar invitación →]  (válido 7 días)"

RENOVACIÓN PRÓXIMA (D-7):
Asunto: Tu plan EVA renueva el [fecha]
"[Gym], tu plan Pro renueva el [fecha].
Sin acción requerida si ya coordinaste el pago.
¿Preguntas? Responde este email."

GRACE PERIOD (D+0):
Asunto: ⚠️ Tu plan EVA venció — tienes 7 días
"El acceso de tu equipo está activo 7 días más.
Para renovar: [Ver instrucciones de pago →]
Después del [fecha], el acceso se pausará."

LIMITE SEATS ALCANZADO:
Asunto: Tu equipo EVA llegó al límite de coaches
"[Gym], tu plan cubre X coaches y ya los tienes todos activos.
Para agregar más: [Ver opciones de plan →]"
```

---

## 15. Legal y privacidad

### 15.1 Contexto del equipo (startup sin empresa registrada)

**Situación actual:** 2 fundadores como personas naturales. Sin RUT empresa. Los contratos y cobros se hacen a nombre de los fundadores hasta formalizar.

**Implicaciones prácticas:**
- Contratos B2B firmados como persona natural → válidos legalmente en Chile.
- Boleta de honorarios (si están en segunda categoría) o factura de empresa cuando se registren.
- Cobros vía MP personal o transferencia bancaria personal → registrar en `org_payment_records` con nombre del fundador que recibió el pago.
- Formalizar empresa (SpA o SRL) cuando MRR org supere ~$500k CLP/mes → antes de eso el overhead legal no vale la pena.

### 15.2 Términos de servicio B2B (mínimo viable)

Documento de 1–2 páginas (no contrato legal complejo en esta etapa) que cubra:

- **Qué se ofrece:** acceso a EVA para N coaches durante el período pagado.
- **Pago:** monto, período, forma de pago, qué pasa si no se paga (grace 7d → suspensión).
- **Datos:** EVA no comparte datos de alumnos con terceros. La org accede solo a métricas agregadas (counts, no nombres).
- **Cancelación:** preaviso de 30 días; datos exportables en 30d post-cancelación.
- **Limitación de responsabilidad:** EVA no responde por pérdida de datos causada por el gym.
- **Aceptación:** email de confirmación de pago = aceptación de términos.

### 15.3 Ley 19.628 (Chile)

- **Datos de coaches** (email, nombre): tratados bajo contrato de servicio — base legal art. 4.
- **Datos de alumnos**: el gym (org) actúa como responsable; EVA actúa como encargado.
- **En MVP**: panel org solo ve counts. Sin nombres, sin datos de salud individuales de alumnos.
- **Post-MVP (si org ve datos individuales de alumnos)**: requiere DPA firmado + mención explícita en política de privacidad.

### 15.4 Datos financieros

- `tax_id` (RUT org): cifrar en reposo con `pgcrypto` o Supabase Vault.
- `org_payment_records`: no almacenar datos de tarjeta — solo referencia de transacción.
- Retención contable: 6 años (SII Chile) para `org_payment_records`.

---

## 16. Modelo de billing manual — cómo funciona en la práctica

### 16.1 Por qué manual es la decisión correcta ahora

MercadoPago pre-approvals son 1:1 con un pagador persona natural y una tarjeta específica. Para B2B (orgs con múltiples administradores, tarjetas corporativas, pago por transferencia) esto genera problemas:
- Si el pagador se va de la empresa, la pre-approval queda en su cuenta personal.
- Si expira la tarjeta, el gym debe volver a hacer checkout completo.
- Empresas chilenas con RUT prefieren transferencia bancaria + boleta/factura, no MP.

Con 2–30 orgs, el costo operativo de activación manual es ~5 min/org/mes. El costo de implementar MP org mal es incalculable en churn y credibilidad.

### 16.2 Cuenta de cobro oficial

**Cuenta MercadoPago:** `contacto@eva-app.cl` (cuenta verificada, email profesional de la app).

Esta es la única cuenta que recibe pagos de orgs. Toda comunicación de pago, links MP y referencias de transferencia salen desde esta cuenta o mencionan este email.

### 16.3 Flujo de cobro manual

```
INICIO DE PERÍODO:
  D-7: Enviar email desde contacto@eva-app.cl con instrucciones:
       Opción A — Link MP: [Pagar $XXX.XXX →]
                  (link generado en cuenta MP contacto@eva-app.cl)
       Opción B — Transferencia bancaria + referencia GYM-[nombre]-[mes]
                  (datos de la cuenta vinculada a contacto@eva-app.cl)

  Org paga → Pago visible en cuenta MP contacto@eva-app.cl o banco

  Fundador en /admin:
    1. Selecciona org
    2. Registra en org_payment_records: monto, método, referencia MP o transfer
    3. Extiende current_period_end
    4. Confirma status = 'active'
    → Org renovada en < 5 min

AUTOMATIZACIÓN PARCIAL (sin construir nada nuevo):
  Herramienta: Notion / Google Sheets con calendario de vencimientos por org
  D-7: email template desde contacto@eva-app.cl
  D+0 sin pago: status → grace (cron job simple)
  D+7 sin pago: status → suspended (cron job)
```

### 16.3 Panel `/org/billing` sin checkout embebido

El panel muestra estado + historial + instrucciones. **No** tiene formulario de pago. El org admin ve:

1. Estado del plan y fecha de vencimiento.
2. Historial de pagos confirmados (los que el fundador registra en `org_payment_records`).
3. Botón "¿Cómo renovar?" → modal con instrucciones (link MP o datos de transferencia).
4. Botón "Contactar a EVA" → email/WhatsApp directo.

Esto es profesional. Muchos SaaS B2B chilenos (Bsale, Defontana, Nubox) operan exactamente así.

### 16.4 Cuándo automatizar billing org

Automatizar tiene sentido cuando:
- **> 30 orgs activas** → el tiempo operativo empieza a ser relevante.
- **Empresa formalmente registrada** → necesitás emisión automática de facturas.
- **Deal de empresa grande** que exija facturación electrónica SII automática.

Hasta entonces: manual es más rápido de implementar, más fácil de debuggear, y permite personalizar el trato con cada cliente.

---

## 17. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| RLS org rompe políticas retail | Media | Alto | Políticas aditivas; tests JWT en CI antes de merge |
| Race condition en seats | Baja | Medio | `accept_org_invite()` usa `FOR UPDATE` lock |
| Coach huérfano sin alumnos al desvincular | Alta | Alto | UI bloquea desvinculación si hay alumnos activos |
| Org admin ve datos PII alumnos sin DPA | Media | Alto | MVP solo counts; acceso granular post-DPA |
| Email invite en spam | Media | Medio | SPF/DKIM configurado; texto de invitación sin palabras spam; link directo |
| Scope creep SSO/API | Alta | Medio | Documentado fuera de MVP; rechazar en backlog |
| Churn temprano por mal onboarding | Media | Alto | Checklist + health score + CS D+3 y D+30 |
| Billing manual no escala > 30 orgs | Alta (a futuro) | Medio | Documentado; automatizar cuando llegue ese momento |
| Fundadores sin empresa registrada = limitación para contratos | Media | Bajo | Contratos como persona natural son válidos; formalizar a $500k CLP MRR org |

---

## 18. Roadmap por olas

| Ola | Bloque A | Bloque B | Salida | Est. |
|-----|----------|----------|--------|------|
| **1 — Base de datos** | Schema `organizations` + `coaches.organization_id` nullable + tipos TS + índices | Precedencia gate/middleware solo cuando `org_id IS NOT NULL` + suite retail en CI | Retail intacto; DB lista para org | 1 sem |
| **2 — Flujo B2B cerrado** | `organization_members` + `organization_invites` + RLS aditivas + `accept_org_invite()` + audit log | UI `/org/team` (lista + invitar + aceptar) + `/org/invite/accept` tokenizada | Piloto staging con datos reales | 2 sem |
| **3 — Activación y panel** | Activación manual desde `/admin` + `org_payment_records` + enforcement seats + UX grace/blocked | RPCs métricas + `/org/dashboard` KPIs + `/org/billing` (estado + historial + instrucciones) | Venta piloto 2–3 gyms | 1–2 sem |
| **4 — Go-to-market** | Email automático renovación (D-7) + cron grace/suspend + `/org/usage` | `/empresas` landing + pricing B2B + one-pager + runbook CS aprobado | Go-to-market controlado | 1 sem |
| **5 — Expansión producto** | Digest semanal org admin + notificación seat límite | `/org/settings` (logo, datos) + health score en CEO panel | Producto más autónomo | 1 sem |
| **Post-MVP** | MP org automatizado (cuando > 30 orgs) | Reportes exportables, pool global, transferencia alumnos entre coaches | Escala | TBD |

---

## 19. Checklist pre-implementación (decisiones bloqueantes)

Ninguna línea de código de ola 1 hasta tener todas marcadas:

- [x] **Billing:** cuenta MP `contacto@eva-app.cl` (verificada). Links MP y transferencias salen desde esta cuenta. ✅
- [x] **Pool alumnos:** suma de `max_clients` por coach. `organizations.max_clients_total = NULL` en MVP. Pool global post-MVP cuando un gym lo pida. ✅
- [x] **Invite email duplicado:** vincular con confirmación del coach. Email al coach "¿Aceptas unirte a [Gym]?" → Aceptar activa vínculo / Rechazar revoca invitación / Ignorar 7d = expirada. ✅
- [x] **Naming:** `organization` / `org_` en código y DB. "Plan de equipo" en copy de UI. "EVA Empresas" en marketing y landing. Nunca mezclar en la misma pantalla. ✅
- [x] **Pricing:** Starter Gym $59.990/mes (hasta 5 coaches) · Pro Gym $109.990/mes (hasta 10) · Elite Gym $199.990/mes (hasta 20) · Enterprise desde $300.000 cotizar. Anual –20%. Ver DECISIONES_B2B.md. ✅
- [x] **Suite retail CI:** job `retail-regression` con 5 casos obligatorios antes de merge ola 1. Template en DECISIONES_B2B.md. Tarea técnica ~3h. ✅
- [x] **Runbook alta org:** simulacro en staging entre los dos fundadores — crear org ficticia → activar → invitar coach → confirmar acceso sin MP. Documento en §14.1. ✅
- [x] **Términos B2B:** documento de 1–2 páginas listo. Template completo en DECISIONES_B2B.md. Enviar como PDF adjunto al email de bienvenida. ✅
- [x] **Cuenta de email:** `contacto@eva-app.cl` — Gmail profesional comprado para la app; también es la cuenta MP. ✅

---

## 20. Referencia cruzada — actualizar con implementación real

- [nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md) — sección "Modelo B2B" y fases.
- [nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md](nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md) — diagrama de datos y middleware.
- [AGENTS.md](AGENTS.md) — patrones `_data/_actions`, Zod v4, `revalidatePath`, sin nuevas libs de estado.

---

## 21. Análisis competitivo y ventaja diferencial

### 21.1 Mapa competitivo

| Competidor | Fortaleza | Debilidad crítica vs EVA |
|-----------|-----------|--------------------------|
| **Trainerize** | Team management maduro, marketplace | Sin white-label por coach; marca Trainerize siempre visible. El gym absorbe la identidad de cada coach. |
| **TrueCoach** | UX limpia, excelente coach-first | Sin modo B2B real; sin billing org; sin panel de gestión de equipo. |
| **Mindbody / ABC Fitness** | Gestión gym completa (reservas, pagos presenciales, clases grupales) | No tiene herramientas de coaching digital personalizado; no reemplaza lo que hace EVA. |
| **Glofox** | App branded por gym, buena para clases | Sin programación personalizada por coach; sin nutrición; no coaching 1:1 serio. |
| **Wodify** | Fuerte en CrossFit/box | Nicho muy específico; sin white-label individual; sin nutrición avanzada. |
| **Varias cuentas sueltas** | "Ya funciona" | Sin visión unificada; más caro; no escala; el gym está ciego operativamente. |

### 21.2 Ventaja diferencial de EVA (irreplicable a corto plazo)

**"White-label por coach dentro de la misma organización"**

Ningún competidor ofrece esto:
- Trainerize: todos los coaches bajo marca Trainerize.
- Glofox: todos bajo marca del gym.
- EVA: cada coach tiene su app con su marca (`/c/[coach_slug]`), y el gym tiene visión consolidada.

El alumno de Ana ve la app de Ana. El alumno de Pedro ve la app de Pedro. El dueño del gym ve a Ana y Pedro en un solo panel. **Identidad del coach + visión del negocio**. Sin sacrificar ninguna de las dos.

### 21.3 Moat a construir

1. **Datos de rendimiento del gym:** a más tiempo con EVA, más histórico de alumnos, adherencia, progresión. Difícil de migrar.
2. **Identidad del coach:** los coaches construyen su marca en `/c/[coach_slug]`; cambiar de plataforma = perder esa URL y el historial de sus alumnos.
3. **Red de coaches referidos:** si los coaches recomiendan EVA a su gym, el gym puede convertirse en cliente B2B → flywheel.

### 21.4 Ideas de producto para explorar (post-MVP)

**Corto plazo:**
- **Digest semanal org admin por email:** "Esta semana: X sesiones, Y alumnos nuevos." Sin entrar al panel.
- **Asignación de alumnos entre coaches de la org:** org admin puede mover un alumno de Ana a Pedro sin que el alumno pierda su historial.
- **Rol `viewer` para directivos:** métricas sin acceso a datos operativos. Ideal para inversores o socios del gym.

**Mediano plazo:**
- **Referidos gym:** coach retail que convierte su gym → descuento en plan personal.
- **Add-on análisis avanzado:** exportación CSV, LTV por alumno, comparativas históricas → cobro adicional.
- **Franquicia digital:** cadena de gyms con sub-orgs por sede y una factura matriz.

**Largo plazo:**
- **API pública org:** webhooks salientes (alumno completa workout → CRM del gym).
- **Dominio propio por org:** `app.mygym.cl` sirviendo EVA con branding completo del gym.
- **Integración Mindbody/Glofox:** importar roster de alumnos del gym → crear clients en EVA automáticamente.

---

*Fin del plan rev. 4 — edición enterprise completa. Siguiente paso: aprobar decisiones bloqueantes (§19) y comenzar ola 1 cuando estén todas marcadas.*
