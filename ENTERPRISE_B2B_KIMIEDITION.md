# EVA Empresas — Plan Maestro B2B Multi-Coach

> **Versión:** 2026-05-02 · rev. 7 (Kimi Edition)
> **Estado:** planificación completa. Revisión técnica integrada. Sin código hasta que equipo apruebe.
> **Equipo:** 2 fundadores · sin empresa registrada aún · billing manual hasta ~30 orgs.
> **Cuenta oficial:** contacto@eva-app.cl (Gmail profesional + cuenta MP verificada)
> **Documentos relacionados:** [DECISIONES_B2B.md](DECISIONES_B2B.md) · [AGENTS.md](AGENTS.md) · [nuevabibliadelaapp/](nuevabibliadelaapp/)

---

## Índice

| # | Sección | Tipo |
|---|---------|------|
| 1 | Principios rectores | Estrategia |
| 2 | Resumen ejecutivo | Estrategia |
| 3 | Contexto del equipo y etapa | Estrategia |
| 4 | Modelo de datos conceptual | Arquitectura |
| 5 | Personas y jobs-to-be-done | Producto |
| 6 | Alcance MVP vs Post-MVP | Producto |
| 7 | Reglas de precedencia billing y acceso | Producto |
| 8 | Go-to-Market completo | Negocio |
| 9 | UX / UI — dashboard empresarial | Diseño |
| 10 | Frontend Developer | Técnico |
| 11 | Backend Developer | Técnico |
| 12 | Modelo de billing manual | Operaciones |
| 13 | DevOps | Técnico |
| 14 | QA | Calidad |
| 15 | Data & Analytics | Datos |
| 16 | Customer Success | Operaciones |
| 17 | Legal y privacidad | Legal |
| 18 | Riesgos y mitigaciones | Gestión |
| 19 | Roadmap por olas | Ejecución |
| 20 | Registro de decisiones | Gestión |
| 21 | Análisis competitivo e ideas | Estrategia |

---

## 1. Principios rectores

El modo empresarial es un **producto paralelo** al flujo coach individual. Las siguientes reglas son no negociables:

| Regla | Qué significa en la práctica |
|-------|------------------------------|
| **Opt-in por datos** | `organization_id IS NULL` = comportamiento 100% idéntico al de hoy. Cero cambios para coaches retail. |
| **Sin migración forzada** | Ningún coach existente entra a una org sin invitación explícita aceptada por él. |
| **Sin rutas rotas** | `/c/[coach_slug]`, PWA, manifests, webhooks MP retail siguen igual. |
| **Feature isolation** | Todo código nuevo vive detrás de `organization_id IS NOT NULL` o rutas `/org/*`. |
| **Dos monetizaciones independientes** | Retail: N coaches × MP individual. Empresa: 1 pago manual a EVA → fundadores activan. |
| **Un coach, una org** | `coaches.organization_id` es FK única. Coach en org A no puede estar en org B sin desvincularse. |
| **Billing source explícito** | `billing_source = 'self'` (retail) o `'org'` (empresa). Sin ambigüedad. |
| **billing_source siempre consistente** | Trigger DB garantiza que `billing_source = 'self'` cuando `organization_id` se vuelve NULL. Sin excepción. |

**Anti-patrón a evitar:** tratar `coaches` como unidad única de suscripción sin discriminar por `organization_id`. Genera doble cobro o doble bloqueo.

---

## 2. Resumen ejecutivo

### El problema

Un gym con 5 coaches en EVA hoy:
- Paga 5 suscripciones separadas = $149.950/mes
- Tiene 5 dashboards distintos sin vista consolidada
- No sabe cuántos alumnos totales tiene su negocio
- Si un coach se va, el gym pierde visibilidad de sus alumnos
- El dueño gestiona el negocio a ciegas

### La solución

**EVA Empresas** — un solo contrato, panel de administración unificado, cada coach mantiene su identidad y flujo de trabajo intactos.

> "Un contrato. Todo tu equipo. Cada coach con su marca."

### El diferenciador único

EVA es el único sistema donde **cada coach mantiene su white-label propio dentro de la misma organización**. El alumno de Ana sigue viendo la app de Ana. El dueño del gym ve a Ana + Pedro + Carlos en un panel. Identidad del coach + visión del negocio. Sin sacrificar ninguna de las dos.

Trainerize, Glofox, Mindbody, PT Distinction: todos tienen una sola app de marca por gym → los coaches pierden identidad individual. EVA no.

> **Contraargumento para PT Distinction:** su white-label es una sola app para todo el gym. Si el gym tiene coaches con marcas propias (Ana López Fitness, Pedro Ruiz Coaching), PT Distinction los obliga a compartir una sola identidad de marca. En EVA, cada coach mantiene su propia app y URL `/c/[coach_slug]` aunque estén en la misma organización. Ese es el moat.

### Propuesta de valor por persona

| Persona | Antes | Con EVA Empresas |
|---------|-------|-----------------|
| Dueño del gym | 5 logins, sin vista global, 5 facturas | 1 panel, 1 pago, métricas del equipo en tiempo real |
| Coach staff | Pantalla de pago propia aunque el gym ya pagó | Misma pantalla + "Tu acceso está cubierto por [Gym]" |
| Alumno | Sin cambio | Sin cambio |

---

## 3. Contexto del equipo y etapa

- **Equipo:** 2 fundadores, sin empresa registrada.
- **Cuenta oficial:** `contacto@eva-app.cl` — Gmail profesional + cuenta MP verificada.
- **Billing MVP:** manual — gym paga via link MP o transferencia a `contacto@eva-app.cl`; fundador activa org en `/admin` en < 30 min. Ver §12.
- **Formalizar empresa (SpA):** cuando MRR org supere ~$500k CLP/mes. Antes no tiene ROI legal.
- **Objetivo etapa actual:** cerrar 2–3 gyms piloto, validar modelo, construir primer case study.
- **Capacidad operativa:** billing manual escala hasta ~30 orgs sin fricción. Automatizar pagos cuando llegue ese volumen.

---

## 4. Modelo de datos conceptual

```
Organization
  ├── status: trial | active | grace | suspended | cancelled
  ├── billing_source: manual (MVP) → mp_org (post-MVP)
  ├── max_coaches, max_clients_total (NULL=suma coaches), period_end
  │
  ├── OrganizationMember
  │     role: admin_org | coach_staff
  │     └── Coach [coach_id intacto — FK dominante del producto]
  │           └── Clients → workouts, nutrition, check-ins [sin tocar]
  │
  └── OrganizationInvite
        email + token_hash + role + expires_at (7d)
```

*Nota: Se evaluará un patrón Event Sourcing ligero (tablas de audit + events) para escalar sin un bus completo.*

**Principio:** `coach_id` sigue siendo la FK dominante en todo el producto. `organization_id` es extensión, no reescritura. Las 24+ políticas RLS de `coach_id` no se tocan.

**Roles MVP:** `admin_org` (equipo + billing), `coach_staff` (solo su dashboard).
**Roles post-MVP:** `viewer` (métricas sin PII), `billing_only` (solo facturación).

**Caso especial — coach que es también dueño:** un mismo usuario puede tener rol `admin_org` en la org Y ser coach activo. Su perfil de coach funciona exactamente igual; adicionalmente tiene acceso a `/org/*`. No hay conflicto: `organization_members.role` determina acceso al panel org; `coaches.billing_source = 'org'` determina que no ve checkout MP. Documentar en UX con label: "Tenés acceso de administrador y de coach."

---

## 5. Personas y jobs-to-be-done

| Persona | Job principal | Pain hoy | Señal de éxito |
|---------|--------------|----------|----------------|
| **Dueño/ops del gym** | Ver cómo va el negocio sin llamar a cada coach | Ciego, 5 pagos distintos | Entra al panel 3×/semana |
| **Coach staff** | Trabajar con alumnos sin preocuparse por suscripciones | Le aparece checkout aunque el gym ya pagó | Nunca ve una pantalla de pago |
| **Coach que es también dueño** | Gestionar equipo Y atender sus propios alumnos | Dos mundos sin un solo lugar | Accede a panel org y a su dashboard coach sin fricciones |
| **Alumno** | Sin cambio | — | Flujo idéntico a hoy |
| **Fundadores EVA** | Cerrar contratos B2B, activar en < 1h | Proceso sin infraestructura | Activación < 30 min desde pago |

---

## 6. Alcance MVP vs Post-MVP

| Feature | MVP | Post-MVP | Razón del corte |
|---------|:---:|:--------:|-----------------|
| Schema org + vínculo coach | ✅ | — | Base de todo |
| Invitaciones email (7d) | ✅ | Recordatorios automáticos | Mínimo funcional |
| Panel `/org/*` con KPIs básicos | ✅ | Reportes CSV, sedes | Valor inmediato |
| Activación manual por fundadores | ✅ | — | Suficiente para 30 orgs |
| Billing panel (estado + historial + instrucciones) | ✅ | Checkout embebido | Ver §12 |
| Email automático renovación D-7 con link MP | ✅ | — | ROI alto, 0 código nuevo |
| Enforcement seats en transacción DB | ✅ | — | Evita over-provisioning |
| Desvincular coach de org | ✅ | Transferencia alumnos entre coaches | Flujo crítico |
| Trial 14 días para piloto | ✅ | Trial configurable por deal | Cierra demos |
| Notificaciones: invitación, grace, límite seats | ✅ | Digest semanal, inactividad coach | CS mínimo viable |
| Sección `/pricing#equipos` + landing B2B | ✅ (ola 4) | Página `/empresas` dedicada | Go-to-market |
| Calendly "Demo EVA Empresas" | ✅ (antes ola 3) | — | No es código; 30 min de setup |
| MP org automatizado | ❌ | Post-MVP v1 | Complejidad alta, ROI post-piloto |
| Pool global alumnos cross-coach | ❌ | Post-MVP | Decisión de datos compleja |
| SSO / API pública / dominio propio | ❌ | Fase enterprise | Fuera de alcance |
| Downgrade de plan (ej. Pro → Starter con coaches excedentes) | ❌ | Post-MVP | Bloquear UI si `coaches_activos > nuevo_max`; UI: "Desvinculá X coaches antes." |
| Transferencia de alumnos entre coaches de la misma org | ❌ | Post-MVP | Complejidad legal + UX; desvincular coach la requiere |

**Criterio de éxito del piloto:** mínimo 1 coach del gym aceptó invitación + registró al menos 1 sesión de alumno en los primeros 14 días + el admin org ingresó al panel `/org/dashboard` al menos 2 veces en los primeros 7 días.

---

## 7. Reglas de precedencia — billing y acceso

| Condición | Acceso coach | UI que ve el coach |
|-----------|-------------|-------------------|
| `organization_id IS NULL` | Reglas actuales `coaches.subscription_*` | `/coach/subscription` normal |
| Org **active**, coach miembro | ✅ Sin MP propio | "Tu acceso está cubierto por [Gym]" |
| Org en **grace** (7d) | ✅ Con banners de aviso | Banner amarillo + "Contacta al administrador" |
| Org **vencida** | ❌ Bloqueado | "Tu acceso está pausado. Contacta al administrador de [Gym]." — jamás pantalla de pago retail |
| Coach sale con alumnos activos | ❌ UI bloquea salida | "Transfiere o descarga datos antes de desvincular." |
| Datos del alumno (siempre) | ✅ Accesibles | Su historial propio nunca se bloquea |

**Nunca:** mostrar checkout MP a coach con `billing_source = 'org'`.

---

## 8. Go-to-Market completo

### 8.1 Pricing

> **Filosofía de pricing B2B:** El plan de equipo no es solo un descuento por volumen — incluye un producto adicional (panel de administración unificado, KPIs, gestión de equipo) que el coach individual no tiene. El precio refleja ese valor extra, no solo la suma de cuentas. El descuento por coach es ~40% (estándar SaaS B2B), no 60%.

| Plan | Coaches | Precio mensual | Vs retail Pro×N | Ahorro/mes |
|------|---------|----------------|-----------------|------------|
| **Starter Gym** | Hasta 5 | **$89.990** | $149.950 | $59.960 |
| **Pro Gym** | Hasta 10 | **$159.990** | $299.900 | $139.910 |
| **Elite Gym** | Hasta 20 | **$269.990** | $599.800 | $329.810 |
| **Enterprise** | 21+ | **Desde $400.000 · Cotizar** | — | — |

**Costo por coach en cada plan (vs $29.990 individual):**

| Plan | Costo/coach | Descuento vs individual |
|------|-------------|------------------------|
| Starter Gym | $17.998 | –40% |
| Pro Gym | $15.999 | –47% |
| Elite Gym | $13.499 | –55% |

**Descuento anual (–20%):**

| Plan | Mensualizado anual | Total anual |
|------|--------------------|-------------|
| Starter Gym | $71.990/mes | $863.880 |
| Pro Gym | $127.990/mes | $1.535.880 |
| Elite Gym | $215.990/mes | $2.591.880 |

**Copy de ancla para landing:**
> "5 coaches individuales en EVA = $149.950/mes. Pack Starter Gym = $89.990/mes. Ahorrás $60.000 al mes y además obtenés el panel de gestión unificado incluido."

**Incluye en todos los packs:** límites Pro por coach (30 alumnos, nutrición), panel org admin, invitaciones, audit log.

### 8.2 Proceso de venta (5 pasos)

```
PASO 1 — DESCUBRIMIENTO (D+0)
  Canal: referido de coach EVA → su gym / LinkedIn / contacto directo
  Pregunta clave: "¿Cuántos coaches tienes? ¿Cómo gestionas el día a día del equipo?"
  Calificar: ≥ 3 coaches + quieren visión unificada = fit

PASO 2 — DEMO VÍA CALENDLY (D+1 a D+3)
  El gym agenda desde el link de la landing → videollamada 30 min
  Mostrar: panel org → invitar coach → KPIs → billing simple
  No mostrar: nada que no exista todavía
  CTA al final: "Piloto 14 días, sin costo, lo activo hoy."

PASO 3 — PILOTO (D+3 a D+17)
  Fundador activa org manualmente (trial 14 días)
  CS check-in D+3: "¿Todos los coaches aceptaron la invitación?"
  CS check-in D+14: "¿Qué falta para que esto sea tu herramienta principal?"
  CRITERIO DE CONVERSIÓN: ≥1 coach activo + ≥1 sesión de alumno registrada

PASO 4 — CIERRE (D+17 a D+20)
  Si piloto exitoso → fundador envía link MP o datos de transferencia desde contacto@eva-app.cl
  Gym paga → fundador activa org (< 30 min)
  Email de bienvenida con PDF de términos adjunto

PASO 5 — EXPANSIÓN (D+90+)
  CS detecta org en > 80% de seats → "Tus coaches llenan el plan. ¿Agregamos más?"
  Upgrade = nuevo link MP con diferencia de precio (prorrateada si es mid-period: ver §16.4)
```

### 8.3 Calendly — "Demo EVA Empresas"

Calendly es una herramienta donde vos configurás tus horarios disponibles y compartís un link. El gym hace clic, ve los slots disponibles, elige uno, y queda agendado automáticamente. Sin emails de ida y vuelta. Sin coordinación.

**Configuración (ver detalles en [DECISIONES_B2B.md](DECISIONES_B2B.md) §Parte 4):**
- Cuenta: calendly.com con `contacto@eva-app.cl`
- Evento: "Demo EVA Empresas" · 30 minutos
- Disponibilidad: lunes a viernes, horario que fijen los fundadores
- Preguntas al agendar: nombre, nombre del gym, cuántos coaches, cómo nos conocieron
- Link va en el botón CTA de la landing

**Por qué Calendly y no un formulario:**
- Formulario → alguien chequea email → responde → coordina → 2–3 días de friction → el gym enfrió
- Calendly → el gym agenda mientras está caliente → vos recibís notificación → show up → más conversión

### 8.4 Canales de adquisición (priorizados)

| Canal | Cuándo | Prioridad |
|-------|--------|----------|
| Red actual de coaches EVA → sus gyms | Ahora | 🔴 Alta — costo cero, conversión máxima |
| Calendly en landing `/pricing#equipos` | Ola 4 | 🔴 Alta |
| WhatsApp directo (link prefilled) `wa.me/+56XXXXXXXXX?text=Hola%2C+quiero+saber+más+sobre+EVA+Empresas+para+mi+gym` | Ola 4 | 🔴 Alta — LATAM prefiere WhatsApp |
| LinkedIn (dueños de gym, gerentes Chile) | Post-piloto | 🟡 Media |
| SEO `/empresas` | Post-piloto | 🟡 Media |
| Referidos: coach que trae su gym → descuento en plan propio | Post-MVP | 🟢 Baja |

### 8.5 Landing — sección `/pricing#equipos`

**Etapa actual (ola 4):** sección nueva en la página de pricing existente con anchor `#equipos`. Más rápido; el tráfico ya llega a `/pricing`.

**Post-piloto (cuando haya 1 case study):** página dedicada `/empresas` con SEO propio.

**Estructura de la sección:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   EVA para equipos                                       │
│   Un contrato. Todo tu equipo. Cada coach con su marca.  │
│                                                          │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│   │  1 panel   │  │  1 pago   │  │  N coaches │        │
│   │ unificado  │  │  mensual  │  │  su marca  │        │
│   └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│   Starter Gym   hasta 5 coaches       $89.990/mes        │
│   Pro Gym       hasta 10 coaches    $159.990/mes         │
│   Elite Gym     hasta 20 coaches    $269.990/mes         │
│   Enterprise    21+ coaches      Desde $400.000          │
│                                                          │
│   "5 cuentas sueltas = $149.950/mes                      │
│    Pack Starter = $89.990/mes — ahorrás $60.000          │
│    + panel de gestión unificado incluido"                │
│                                                          │
│   [Agendar demo gratuita →]    [Hablar por WhatsApp →]   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Toggle mensual/anual:** mostrar ambas columnas con toggle en la landing (mejora conversión vs tabla estática). El toggle activa el –20% en los tres planes.

**Materiales de venta a preparar antes de ola 4:**
- One-pager B2B (estructura abajo)
- Comparativa visual: "3 cuentas sueltas vs Pack Starter"
- FAQ B2B: ¿qué pasa con los alumnos si cancelo? ¿cada coach sigue con su app? ¿cómo pago?
- Email de bienvenida template (con PDF de términos adjunto)
- Video de producto Loom de 60–90 segundos para landing y follow-ups.

**Estructura del one-pager B2B (1 página A4, PDF):**
```
[Logo EVA] + "EVA Empresas"

PROBLEMA:
"Tu gym tiene X coaches. Son X contratos, X dashboards,
 y vos no sabés qué está pasando."

SOLUCIÓN:
"Un contrato. Todo tu equipo. Cada coach con su marca."

3 PILARES:
① Panel unificado: todo el negocio en una pantalla
② Un solo pago: ahorrás hasta $329.810/mes vs cuentas sueltas
③ Marca individual: cada coach mantiene su app y URL propias

PRECIOS:
Starter Gym (hasta 5 coaches):   $89.990/mes
Pro Gym    (hasta 10 coaches):  $159.990/mes
Elite Gym  (hasta 20 coaches):  $269.990/mes
                                  (anual: –20%)

COMPARATIVA VISUAL:
5 cuentas EVA Pro sueltas = $149.950/mes
Pack Starter EVA Empresas =  $89.990/mes → AHORRÁS $60.000/mes
                                         + panel de gestión incluido

SOCIAL PROOF:
Gyms de Chile ya usan EVA Empresas

CTA:
[Agendar demo gratuita] calendly.com/eva-empresas
[WhatsApp] wa.me/+56...
contacto@eva-app.cl
```

### 8.6 Métricas de go-to-market

| Métrica | Objetivo | Señal |
|---------|---------|-------|
| Demo agendada → piloto activado | > 70% | Fit de mercado |
| Piloto → primer pago | > 60% | Producto + pricing correctos |
| Time to first coach activo | < 24h | Onboarding funciona |
| ARPA org vs ARPA retail | ≥ 3× | Modelo B2B viable |
| Orgs en > 80% de seats | > 30% | Expansión natural |
| Churn org anual | < 10% | Retención B2B |

---

## 9. UX / UI — Dashboard Empresarial

### 9.1 Los tres mundos (nunca mezclar)

| Mundo | Usuario | Rutas | Sensación |
|-------|---------|-------|-----------|
| **A — Retail** | Coach independiente | `/coach/*` | "Mi negocio, mi marca, mi ritmo" |
| **B — Staff** | Coach contratado por gym | `/coach/*` + banner sutil | Idéntico a A + "Cubierto por [Gym]" |
| **C — Admin org** | Dueño/ops/contador del gym | `/org/*` | "Mi equipo, mi contrato, mi data" |
| **D — Coach-dueño** | Dueño que también es coach | `/coach/*` + `/org/*` | Banner sutil en coach: "También sos administrador del equipo" |

El admin org nunca ve `/admin/*` (Panel CEO de EVA). Son cliente, no operador de plataforma.

### 9.2 Dirección visual

- **Personalidad:** "control tower" — datos primero, sin animaciones gamificadas del coach dashboard.
- **Marca:** logo del gym en cabecera. "Powered by EVA" en footer, secundario.
- **Color:** paleta neutra slate/zinc + acento del gym (o azul sistema si no configurado). Sin verde EVA landing.
- **Layout:** sidebar desktop + bottom tabs móvil (máx. 5 ítems MVP).
- **KPI cards:** número grande + delta + contexto. Siempre métricas agregadas.
- **Tablas:** badges de estado, densidad legible, acciones inline.
- **Celebraciones:** toasts sobrios únicamente.
- **Estados vacíos:** ícono + 2 líneas + 1 CTA. Ejemplo: "Invita a tu primer coach →"
- **Dark mode:** sí, desde MVP.
- **Accesibilidad:** WCAG 2.1 AA — contraste ≥ 4.5:1, focus visible, teclado en tablas y modales, `aria-label` en acciones.

### 9.3 Flujos críticos completos

**Invitar coach:**
```
Modal: email → rol (UI label: "Administrador del equipo" / "Coach") → confirmar
  [Los labels de UI ocultan admin_org / coach_staff — el dueño del gym no necesita
   conocer los nombres internos del sistema]
  ├── Email sin cuenta EVA     → invitación nueva; coach crea cuenta y se vincula al aceptar
  ├── Email = coach retail     → "Este coach ya tiene cuenta. ¿Vincularla? Deberá aceptar."
  │     Coach recibe: "[Gym] te invitó. Tu acceso quedaría cubierto. [Aceptar] [Rechazar]"
  ├── Email ya en otra org     → Error: "Este coach pertenece a otra org. Debe desvincularse primero."
  └── Org en max_coaches       → Error: "Límite de X coaches alcanzado. Actualiza tu plan."
Estado tabla: Pendiente (7d) → Aceptada | Expirada | Revocada
```

**Coach sale del gym:**
```
Org admin → "Desvincular" →
  ├── Coach con alumnos activos  → Modal bloqueante: "X alumnos activos. Descarga o transfiere antes."
  └── Coach sin alumnos          → Confirmación → coach vuelve a retail (necesita MP propio)
→ Audit log: quién, cuándo, qué
→ Email al coach: "Tu acceso ahora es independiente. Configura tu suscripción en EVA."
→ Trigger DB: billing_source = 'self' automáticamente (ver §11.5)
→ Si el coach tenía suscripción retail previa, el trigger `trg_coach_billing_reset` le restaura `billing_source = 'self'` automáticamente. El coach debe configurar un nuevo método de pago en EVA para continuar.
```

**Org vence:**
```
D-7  → Email a org admin: "Tu plan vence en 7 días. [Ver instrucciones de renovación]"
D-0  → Grace period (7 días)
       Banner rojo org admin: "Plan vencido. Renueva antes del [fecha]."
       Banner amarillo coach: "Tu acceso podría pausarse. Contacta al administrador."
D+7  → Org suspendida
       Coach bloqueado: página informativa sin checkout MP
       Alumno: historial accesible; sin crear nuevo contenido
       Email org admin: "Acceso pausado. Escríbenos para reactivar."
```

### 9.4 Arquitectura de información `/org`

| # | Tab | Contenido MVP | Post-MVP |
|---|-----|--------------|---------|
| 1 | **Resumen** | KPIs, estado suscripción, actividad equipo | Comparativas históricas |
| 2 | **Equipo** | Coaches + invitaciones + barra seats | Acciones masivas |
| 3 | **Uso** | Alumnos vs cupo, desglose por coach (counts) | Export CSV, desglose por período |
| 4 | **Facturación** | Estado plan, historial manual, instrucciones | Checkout embebido |
| 5 | **Ajustes** | Nombre legal, RUT, contacto, logo | Sedes, roles finos |

### 9.5 Wireframe: Pantalla "Resumen"

```
┌────────────────────────────────────────────────────────┐
│ [Logo CrossFit Providencia]   Resumen    [+ Invitar]   │
├──────────────┬──────────────┬────────────┬─────────────┤
│  Coaches     │  Alumnos     │ Sesiones   │ Adherencia  │
│  7 / 10      │  142 / 200   │ 89 (7d)    │ 74% (7d)    │
│  ▲2 este mes │  ▲8 este mes │ ▼3% sem    │ — baseline  │
├──────────────┴──────────────┴────────────┴─────────────┤
│  🟢 Plan Pro · Activo · Renueva 15 May 2026            │
│     [Ver instrucciones de pago]                        │
├────────────────────────────────────────────────────────┤
│  Actividad reciente del equipo                         │
│  · Ana López aceptó invitación — hace 2h               │
│  · Pedro Ruiz alcanzó límite de alumnos — 1d           │
│  · María Torres sin sesión hace 8d  ⚠️                 │
└────────────────────────────────────────────────────────┘
```

**Empty state (0 coaches, org recién creada):**
```
┌────────────────────────────────────────────────────────┐
│ [Logo]                Resumen                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│              [ícono equipo]                            │
│         Tu equipo aún no está en EVA                   │
│   Invitá a tus coaches y empezá a ver las métricas     │
│                                                        │
│              [+ Invitar primer coach →]                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 9.6 Wireframe: Pantalla "Facturación"

```
┌────────────────────────────────────────────────────────┐
│  Tu plan                                               │
│  Pro Gym · hasta 10 coaches · 30 alumnos c/u           │
│  Estado: 🟢 Activo                                     │
│  Próxima renovación: 15 de mayo 2026                   │
├────────────────────────────────────────────────────────┤
│  Historial de pagos                                    │
│  15 abr 2026   $109.990 CLP   ✓ Confirmado            │
│  15 mar 2026   $109.990 CLP   ✓ Confirmado            │
│  15 feb 2026   $109.990 CLP   ✓ Confirmado            │
├────────────────────────────────────────────────────────┤
│  [Ver instrucciones de renovación]  [Contactar a EVA]  │
└────────────────────────────────────────────────────────┘
```

"Ver instrucciones" → modal con link MP o datos de transferencia.

### 9.7 Micro-UX: coach staff

- Banner delgado en `/coach/dashboard`: "Tu acceso está incluido en el plan de **[Gym]**."
- Settings coach: ocultar "Cambiar plan" si `billing_source = 'org'`. Mostrar "Plan gestionado por [Org]."
- Sin checkout MP visible si org activa.
- Si org en grace: "Tu acceso podría pausarse en X días. Contacta al administrador de [Gym]."
- **Ubicación del banner en mobile:** en la vista móvil, el banner gracia/aviso renderiza como una tarjeta full-width ENCIMA del contenido principal, antes del primer módulo, nunca superpuesta. Usar `pb-safe` en el bottom nav para que el banner no quede cortado detrás de él. Alto máximo: 48px para no dominar la pantalla.

### 9.8 Onboarding org admin

```
Email bienvenida (fundadores lo envían manualmente en MVP) →

Checklist en /org/dashboard (desaparece al completar 4 pasos):
  ☐ 1. Completa los datos de tu organización (nombre, RUT, contacto)
  ☐ 2. Sube el logo de tu gimnasio
  ☐ 3. Invita a tu primer coach
  ☐ 4. El coach acepta la invitación
  ☐ 5. Revisá tu primer métrica de equipo en el panel de Resumen
  → [Todo listo — Tu equipo está en EVA 🎉]
```

*Micro-celebración: al completar el paso 4, mostrar un toast de éxito destacado con el KPI de total de alumnos del equipo.*

### 9.9 Wireframe: Página `/org/invite/accept`

Esta es la primera pantalla que ve un coach cuando recibe la invitación. Tres estados obligatorios:

```
ESTADO 1 — Token válido (el caso feliz)
┌────────────────────────────────────────────┐
│ [Logo del gym invitante]                   │
│                                            │
│  CrossFit Providencia te invitó a EVA      │
│                                            │
│  Rol: Coach                                │
│  Tu suscripción quedará cubierta           │
│  por el plan del gym.                      │
│                                            │
│  [Aceptar invitación]   [Rechazar]         │
│                                            │
│  Esta invitación vence el 15 may 2026.     │
└────────────────────────────────────────────┘

ESTADO 2 — Token expirado
┌────────────────────────────────────────────┐
│  Esta invitación expiró                    │
│  Pedile al administrador de tu gym que     │
│  te envíe una nueva invitación.            │
│  [Ir a EVA →]                              │
└────────────────────────────────────────────┘

ESTADO 3 — Token revocado
┌────────────────────────────────────────────┐
│  Esta invitación fue revocada              │
│  Contactá al administrador de tu gym.      │
│  [Ir a EVA →]                              │
└────────────────────────────────────────────┘

ESTADO 4 — Token ya usado (segundo intento)
┌────────────────────────────────────────────┐
│  Esta invitación ya fue utilizada          │
│  Si ya sos parte del equipo,               │
│  [Iniciar sesión en EVA →]                 │
└────────────────────────────────────────────┘
```

### 9.10 Rutas nuevas

| Ruta | Propósito | Auth |
|------|-----------|------|
| `/org` | Redirect → `/org/dashboard` | `admin_org` |
| `/org/dashboard` | Resumen KPIs + actividad | `admin_org` |
| `/org/team` | Equipo + invitaciones | `admin_org` |
| `/org/usage` | Uso vs límites | `admin_org` |
| `/org/billing` | Estado plan, historial, instrucciones | `admin_org` |
| `/org/settings` | Datos org, logo | `admin_org` |
| `/org/invite/accept` | Aceptar invitación | Token válido (pública) |
| `/pricing#equipos` | Sección B2B en landing pricing | Pública (ola 4) |

### 9.11 Qué reutilizar

| Activo actual | Cómo sirve |
|---------------|-----------|
| Layout `admin/(panel)` | Estructura sidebar + mobile tabs |
| Tablas + badges (CEO panel) | Lista coaches en `/org/team` |
| `GlassCard`, `InfoTooltip`, paginación | Coherencia visual |
| Charts Recharts | Uso agregado en `/org/usage` |
| Copy estados suscripción | Adaptar a "cuenta empresa" |
| `useOptimistic` | Feedback inmediato en invite/revoke |

### 9.12 Qué NO reutilizar

| Activo | Por qué |
|--------|---------|
| `/admin/*` Panel CEO | Operación EVA interna; cliente nunca lo ve ni se parece |
| `/coach/subscription` como UI de pago org | Mezcla mentalidades |
| Perfil alumno completo en vista org | Riesgo legal; solo counts agregados en MVP |

### 9.13 Accesibilidad y móvil

- `dvh` / `min-h-dvh`. Sin `h-screen` en layouts org.
- `pb-safe` en bottom nav móvil.
- Focus trap en modales de invitación.
- `aria-label` descriptivo en reenviar, revocar, desvincular.
- Dark mode desde MVP.

---

## 10. Frontend Developer

### 10.1 Estructura de rutas

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
│   │   ├── _data/billing.queries.ts
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
        ├── page.tsx                  # RSC pública — verifica token, muestra estado
        └── loading.tsx               # Skeleton mientras valida token async
```

### 10.2 Estado y datos

- `React.cache` en `_data/*.queries.ts` — deduplicación por request.
- `Promise.all()` para KPIs paralelos en dashboard.
- `useTransition` + server actions + `revalidatePath` como patrón único.
- `useOptimistic` para invite/revoke → feedback instantáneo.
- Props opcionales en componentes shared: `managedByOrg?: { name: string; orgId: string }` sin romper contratos existentes.
- Inyección de `managedByOrg` vía RSC parent prop (no Context) para evitar re-renders. Si el árbol de componentes es profundo, evaluar un Context org de solo lectura scoped a `/coach/*` layout.
- Sin Redux, Zustand, SWR, React Query — regla de producto EVA.

### 10.3 Helpers de contexto org

```typescript
// src/lib/org/get-org-context.ts
export const getOrgContext = cache(async (coachId: string): Promise<OrgContext | null> => {
  // Fallo silencioso → null → modo retail (safe default siempre)
  // Nunca lanzar excepción — degradar a retail si falla
})

// src/lib/org/require-org-admin.ts
export async function requireOrgAdminMember(): Promise<OrgMember> {
  const member = await getOrgMemberForCurrentUser()
  if (!member || member.role !== 'admin_org') redirect('/coach/dashboard')
  return member
}
```

*Si el árbol de componentes es profundo (prop drilling >2 niveles), evaluar un `OrgBannerContext` de solo lectura scoped al layout `/coach/*`. No viola la regla de estado global porque es derivado de RSC y solo lectura.*

### 10.4 Middleware

- `/org/*`: verificar sesión + rol `admin_org`; si no → `redirect('/coach/dashboard')`.
- `/org/invite/accept`: pública — verificación de token en RSC, no en middleware.
- `/coach/*` y `/c/[slug]/*`: no tocar. Mismo comportamiento de hoy.

### 10.5 Caching y revalidación

- Tags: `['org-team', orgId]`, `['org-usage', orgId]`, `['org-billing', orgId]`.
- `revalidateTag` tras invite/revoke/unlink/billing update.
- Cuando fundador registra pago en `/admin`, el server action debe llamar `revalidateTag(['org-billing', orgId])` y `revalidateTag(['org-dashboard', orgId])` para que el panel del gym refleje el nuevo estado en tiempo real.
- Sin `unstable_cache` — incompatible con Supabase SSR (regla EVA global).

### 10.6 i18n

- Strings de UI en español hardcodeado en MVP — correcto para LATAM.
- Centralizar strings de UI org en `src/lib/org/strings.ts` (objeto de constantes, no i18n framework) para facilitar traducción futura sin reescribir componentes.
- Templates de email: misma lógica — centralizar en `src/lib/org/email-templates.ts`.

### 10.7 Error boundaries

- `error.tsx` en cada módulo org con mensaje específico.
- Queries org fallidas → datos parciales; nunca pantalla en blanco.
- Server action errors → `useActionState` + Zod v4 → mensajes inline.
- Renderizar KPI cards como Server Components independientes con sus propios `error.tsx` y `loading.tsx` para falla aislada.

---

## 11. Backend Developer

### 11.1 Schema completo

```sql
-- ============================================================
-- organizations
-- ============================================================
CREATE TABLE organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  legal_name           TEXT,
  tax_id               TEXT,          -- RUT/RUC; cifrar con Supabase Vault (ver §17.5)
  billing_email        TEXT,
  status               TEXT NOT NULL DEFAULT 'trial'
                         CHECK (status IN ('trial','active','grace','suspended','cancelled')),
  billing_source       TEXT NOT NULL DEFAULT 'manual'
                         CHECK (billing_source IN ('manual','mp_org')),
  max_coaches          INT NOT NULL DEFAULT 5,
  max_clients_total    INT,           -- NULL = suma max_clients por coach; INT = pool global (post-MVP)
  trial_ends_at        TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  grace_ends_at        TIMESTAMPTZ,  -- = current_period_end + '7 days'
  mp_preapproval_id    TEXT,         -- NULL en MVP; post-MVP mp_org
  notes                TEXT,         -- notas internas EVA (invisibles para org admin)
  calendly_demo_at     TIMESTAMPTZ,  -- fecha de la demo agendada (tracking)
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- coaches (alteraciones)
-- ============================================================
ALTER TABLE coaches
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN billing_source  TEXT DEFAULT 'self'
                               CHECK (billing_source IN ('self','org'));

-- Migración segura en tabla existente: ambas columnas son NULL por defecto.
-- ON DELETE SET NULL en organization_id es instantáneo en Postgres.
-- billing_source DEFAULT 'self' es instantáneo (no reescribe filas existentes en Postgres 11+).

CREATE INDEX CONCURRENTLY idx_coaches_org
  ON coaches(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_coaches_user_org
  ON coaches(user_id, organization_id)
  WHERE organization_id IS NOT NULL;

-- ============================================================
-- organization_members
-- ============================================================
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  coach_id        UUID REFERENCES coaches(id) ON DELETE SET NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin_org','coach_staff')),
  joined_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_org  ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- organization_invites
-- ============================================================
CREATE TABLE organization_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin_org','coach_staff')),
  token_hash      TEXT NOT NULL UNIQUE, -- SHA-256 del token; nunca guardar token plano
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  invited_by      UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_invites_org   ON organization_invites(organization_id);
CREATE INDEX idx_org_invites_email ON organization_invites(email) WHERE accepted_at IS NULL;

-- ============================================================
-- org_payment_records (billing manual MVP)
-- ============================================================
CREATE TABLE org_payment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  amount_clp      INT NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  payment_method  TEXT DEFAULT 'manual'
                    CHECK (payment_method IN ('manual','mp_link','transfer','mp_org')),
  reference       TEXT,      -- número de transferencia o referencia MP
  proof_url       TEXT,      -- URL de comprobante de transferencia en Storage
  activated_by    UUID REFERENCES auth.users(id), -- fundador que activó
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_payment_records_org ON org_payment_records(organization_id, paid_at DESC);

-- ============================================================
-- org_audit_logs
-- ============================================================
CREATE TABLE org_audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_user_id   UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  -- invite_sent | invite_accepted | invite_revoked | invite_expired
  -- coach_linked | coach_unlinked | org_activated | org_suspended
  -- org_renewed | role_changed | settings_updated
  target_user_id  UUID,
  target_coach_id UUID,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_audit_org ON org_audit_logs(organization_id, created_at DESC);

-- ============================================================
-- org_subscription_events (analytics)
-- ============================================================
CREATE TABLE org_subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type      TEXT NOT NULL,
  -- trial_start | activated | renewed | seat_added | seat_removed
  -- grace_entered | suspended | cancelled | reactivated
  mrr_delta_clp   INT,
  seats_after     INT,
  payment_record_id UUID REFERENCES org_payment_records(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
-- Índice crítico para cohort analysis
CREATE INDEX idx_sub_events_org ON org_subscription_events(organization_id, created_at DESC);
```

### 11.2 RLS — políticas aditivas

```sql
-- Org admin lee coaches de su org
CREATE POLICY "org_admin_read_own_coaches" ON coaches FOR SELECT
USING (
  organization_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = coaches.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin_org'
  )
);

-- Org admin lee miembros de su org
CREATE POLICY "org_admin_read_own_members" ON organization_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members me
    WHERE me.organization_id = organization_members.organization_id
      AND me.user_id = auth.uid()
      AND me.role = 'admin_org'
  )
);

-- Org admin lee historial de pagos de su org
CREATE POLICY "org_admin_read_payments" ON org_payment_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_payment_records.organization_id
      AND user_id = auth.uid()
      AND role = 'admin_org'
  )
);

-- IMPORTANTE: las políticas existentes coach_id = auth.uid() NO se modifican.
-- Nuevas políticas son ADITIVAS. Las existentes no se tocan.
```

### 11.3 RPC métricas dashboard

```sql
-- **PRECONDICIÓN BLOCKER OLA 1:** Auditar estructura real de `workout_logs` en staging.
-- Si no tiene `coach_id` directo, crear un VIEW materializado `org_workout_stats` o ajustar el JOIN.
-- No avanzar a ola 2 sin esto verificado.

CREATE OR REPLACE FUNCTION get_org_dashboard_metrics(p_org_id UUID)
RETURNS TABLE (
  active_coaches  INT, total_seats     INT,
  active_clients  INT, max_clients     INT,
  sessions_7d     INT, checkins_7d     INT,
  org_status      TEXT, period_end     TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND role = 'admin_org'
  ) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN QUERY
    SELECT
      COUNT(c.id)::INT FILTER (WHERE c.subscription_status IN ('active','trial')),
      o.max_coaches,
      COALESCE(SUM(c.current_client_count),0)::INT,
      COALESCE(o.max_clients_total, SUM(c.max_clients))::INT,
      -- Ajustar el JOIN de workout_logs según estructura real de la tabla
      (SELECT COUNT(*)::INT FROM workout_logs wl JOIN coaches cc ON cc.id = wl.coach_id
       WHERE cc.organization_id = p_org_id AND wl.created_at >= now() - INTERVAL '7 days'),
      (SELECT COUNT(*)::INT FROM check_ins ci JOIN clients cl ON cl.id = ci.client_id
       JOIN coaches cc ON cc.id = cl.coach_id
       WHERE cc.organization_id = p_org_id AND ci.created_at >= now() - INTERVAL '7 days'),
      o.status, o.current_period_end
    FROM organizations o
    JOIN coaches c ON c.organization_id = o.id
    WHERE o.id = p_org_id
    GROUP BY o.id, o.max_coaches, o.max_clients_total, o.status, o.current_period_end;
END;
$$;
```

### 11.4 Enforcement de seats (transaccional — sin race condition)

```sql
-- Token comparison: SHA-256 del token enviado en el link de email.
-- El link contiene el token plano; aquí se hashea y compara con el hash guardado.
-- Requiere pgcrypto (disponible en Supabase por defecto): CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION accept_org_invite(p_token TEXT, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite organization_invites%ROWTYPE;
  v_org    organizations%ROWTYPE;
  v_count  INT;
BEGIN
  SELECT * INTO v_invite FROM organization_invites
  WHERE token_hash = encode(digest(p_token::bytea, 'sha256'), 'hex')
    AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"error":"invalid_or_expired_token"}'::JSONB; END IF;

  SELECT * INTO v_org FROM organizations WHERE id = v_invite.organization_id FOR UPDATE;
  SELECT COUNT(*) INTO v_count FROM organization_members WHERE organization_id = v_org.id;
  IF v_count >= v_org.max_coaches THEN RETURN '{"error":"seats_limit_reached"}'::JSONB; END IF;

  UPDATE organization_invites SET accepted_at = now() 
  WHERE id = v_invite.id AND accepted_at IS NULL;
  INSERT INTO organization_members(organization_id, user_id, role)
    VALUES (v_org.id, p_user_id, v_invite.role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  UPDATE coaches SET organization_id = v_org.id, billing_source = 'org' WHERE user_id = p_user_id;
  INSERT INTO org_audit_logs(organization_id, actor_user_id, action, target_user_id)
    VALUES (v_org.id, p_user_id, 'invite_accepted', p_user_id);

  RETURN '{"ok":true}'::JSONB;
END;
$$;
```

*Idempotencia: si el usuario hace doble clic, el segundo intento encontrará `accepted_at IS NOT NULL` y no generará error ni duplicados.*

### 11.5 Trigger: billing_source siempre consistente

```sql
-- Sin este trigger, ON DELETE SET NULL nullifica organization_id pero billing_source
-- queda como 'org' aunque el coach ya no esté en ninguna org. Generaría coach
-- sin checkout MP visible pero sin org que lo cubra — bloqueado sin salida.

CREATE OR REPLACE FUNCTION reset_coach_billing_on_unlink()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    NEW.billing_source := 'self';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coach_billing_reset
BEFORE UPDATE ON coaches
FOR EACH ROW EXECUTE FUNCTION reset_coach_billing_on_unlink();
```

*Validación post-migración obligatoria: ejecutar `SELECT COUNT(*) FROM coaches WHERE organization_id IS NULL AND billing_source != 'self'` → debe retornar 0.*

### 11.6 Cascade y retención de datos

| Evento | Comportamiento |
|--------|---------------|
| Org cancelada | `coaches.organization_id = NULL` via ON DELETE SET NULL; trigger resetea `billing_source = 'self'` automáticamente |
| Coach desvinculado | Row en `organization_members` deleted; trigger `trg_coach_billing_reset` activa `billing_source = 'self'` |
| Datos de alumnos | **Nunca** cascade delete por cambio de org |
| `org_payment_records` | Retener 6 años (SII Chile) |
| `org_audit_logs` | Retener 2 años |
| Org cancelada voluntariamente | Datos retenidos 90 días; coaches pueden exportar. Tras 90 días: org + metadata eliminados. Datos de alumnos permanecen con su coach si el coach continúa en EVA retail. |

---

## 12. Modelo de billing manual

### 12.1 Por qué manual es correcto ahora

MercadoPago pre-approvals son 1:1 con pagador-persona y tarjeta específica. Para B2B (tarjetas corporativas, múltiples administradores, pago por transferencia) este modelo genera problemas: si el pagador se va de la empresa la pre-approval queda en su cuenta personal; si expira la tarjeta el gym debe hacer checkout completo de nuevo; empresas chilenas con RUT prefieren transferencia + boleta.

Con 2–30 orgs el costo operativo de activación manual es ~5 min/org/mes. Correcto para esta etapa.

### 12.2 Cuenta oficial

**MercadoPago y email:** `contacto@eva-app.cl` (cuenta MP verificada).
Todos los links de pago, transferencias y comunicaciones de billing salen desde esta cuenta.

### 12.3 Flujo de cobro

```
D-7 antes de vencimiento:
  Fundador envía email desde contacto@eva-app.cl:
    Opción A — Link MP: [Pagar $XXX.XXX CLP →]
               (generado en cuenta MP contacto@eva-app.cl)
    Opción B — Transferencia bancaria a cuenta vinculada
               Referencia: GYM-[nombre]-[mes-año]
    Opción C — Comprobante de transferencia: si el gym paga por transferencia,
               sube el comprobante (foto/PDF) a un bucket seguro de Storage
               y referencialo en `org_payment_records.proof_url`.
               El fundador valida antes de activar.

Gym paga → pago visible en cuenta MP/banco

Fundador en /admin (< 5 min):
  1. Selecciona org
  2. Registra en org_payment_records: monto, método, referencia
  3. Extiende current_period_end
  4. Confirma status = 'active'
  5. Server action llama revalidateTag(['org-billing', orgId]) → panel gym se actualiza

Automatización sin código nuevo:
  Notion/Google Sheets con calendario de vencimientos por org
  Cron job simple para cambiar status a 'grace' y 'suspended' (ola 4)
```

### 12.4 Panel `/org/billing` (sin checkout embebido)

El org admin ve estado + historial + instrucciones. El "Pagar" abre un modal con el link MP o datos de transferencia — es profesional. Muchos SaaS B2B chilenos (Bsale, Defontana) operan exactamente así.

### 12.5 Cuándo automatizar billing

Automatizar tiene sentido cuando:
- **> 30 orgs activas** → el tiempo operativo empieza a ser relevante.
- **Empresa registrada** → necesitás facturación electrónica SII automática.
- **Deal enterprise** que exija automatización contractual.
- **>10 orgs con pago anual upfront:** el cash flow justifica invertir en facturación electrónica SII.

---

## 13. DevOps

### 13.1 Variables de entorno

```env
ENTERPRISE_ORG_ENABLED=true       # false = rutas /org/* retornan 404
ORG_GRACE_PERIOD_DAYS=7
ORG_RENEWAL_EMAIL_DOMAIN=eva-app.cl
RESEND_API_KEY=...                # Email transaccional ola 4 (ver §13.5)
```

*El from address fijo reduce riesgo de spoofing. Solo el dominio es configurable.*

### 13.2 CI/CD

- Job `retail-regression` en CI — corre en cada PR que toque gate, middleware, RLS, `organizations/*`.
- Feature branch `feat/enterprise-org` → staging (ENTERPRISE_ORG_ENABLED=true) → producción controlada.
- Producción inicial: `ENTERPRISE_ORG_ENABLED=false` hasta validar en staging.

**Comportamiento de `ENTERPRISE_ORG_ENABLED=false` con orgs activas:** el flag solo afecta el registro de rutas de Next.js (`/org/*` retorna 404). La lógica de gate de coaches no depende del flag — un coach con `billing_source = 'org'` y org activa sigue teniendo acceso aunque el flag esté en false. El flag es para habilitar/deshabilitar la UI del panel org, no el acceso de coaches. Si se apaga en emergencia, los coaches de org activa mantienen acceso; el org admin no puede entrar al panel hasta que el flag vuelva a true.

### 13.3 Monitoreo

- Logs estructurados: `{ event, orgId, coachId, durationMs, actorId }`.
- Alerta: cualquier 5xx en `/org/*` → notificación inmediata fundadores.
- RPCs org: alerta si p95 > 300ms.
- Métricas separadas `/org/*` vs `/coach/*` — no contaminar baseline retail.

### 13.4 Scripts operativos

```
scripts/
├── provision-org.ts          # Crear org + vincular coaches (staging/prod)
├── renew-org.ts              # Extender period_end tras pago manual
├── deactivate-org.ts         # Suspender org + notificar coaches (dry-run primero)
└── migrate-retail-to-org.ts  # Para gyms con varias cuentas sueltas
```

### 13.5 Email transaccional — decisión de proveedor

**Problema con Gmail SMTP:** para > 10 orgs con emails automáticos (invitaciones, grace, renovación D-7, bienvenida), el volumen supera los límites de Gmail SMTP (500/día con cuenta standard). Un email bloqueado en grace period = potencial churn.

**Decisión para ola 4:** migrar emails automáticos a **Resend** (`resend.com`).
- Plan gratuito: 3.000 emails/mes (suficiente hasta > 50 orgs).
- SDK TypeScript nativo, integra con Next.js server actions.
- Soporte SPF/DKIM/DMARC desde `contacto@eva-app.cl` (dominio propio).
- Los emails manuales de fundadores (bienvenida, cierre de deal) siguen saliendo de Gmail — eso es intencional (tono personal).

### 13.6 Cron para transiciones de estado

**Transiciones automáticas necesarias (ola 4):**
- `active` → `grace` cuando `current_period_end < now()`
- `grace` → `suspended` cuando `grace_ends_at < now()`

**Opción A — pg_cron:** disponible en Supabase Pro+. Verificar plan antes de depender de él con `SELECT * FROM pg_extension WHERE extname = 'pg_cron'`.

**Opción B — Supabase Edge Function con schedule:** disponible en todos los planes. Más portable. Recomendada si el plan actual no incluye pg_cron.

**Decisión:** implementar como Edge Function schedule en ola 4. Migrar a pg_cron si se necesita precisión sub-minuto (no aplica para billing diario).

*Edge Function schedules tienen granularidad mínima de 1 hora. Para transiciones exactas de billing, considerar `pg_cron` si el plan de Supabase lo permite. Documentar que la transición puede tardar hasta 60 min.*

### 13.7 Backup y PII

- `organizations` (RUT, contacto): backup diferencial diario.
- `org_payment_records`: retención 6 años; backup semanal adicional.
- `org_audit_logs`: retención 2 años.
- DR: documentar RTO/RPO para `organizations` en runbook ops.
- *Dado que Supabase backup es a nivel de proyecto, implementar exportación selectiva semanal con `pg_dump --table=org_*` para retenciones diferenciadas.*

---

## 14. QA

### 14.1 Matriz de regresión (obligatoria en cada PR)

| Escenario | Resultado esperado |
|-----------|-------------------|
| Coach nuevo retail | Flujo idéntico a hoy; cero menciones de org |
| Coach `organization_id IS NULL` | Gate idéntico; sin queries org en logs |
| Coach retail visita `/org/*` | Redirect a `/coach/dashboard` |
| Org activa, coach staff | Acceso sin MP; banner "Cubierto por [Gym]" visible |
| Org en grace (día 3) | Coach con acceso; banners de aviso correctos |
| Org vencida (día 8) | Coach bloqueado; página informativa; sin checkout MP |
| Invitación expirada | "Esta invitación ha expirado." — no vincula |
| Invitación revocada | "Esta invitación fue revocada." — no vincula |
| Token usado dos veces | "Esta invitación ya fue utilizada." — no vincula |
| Email ya en otra org | Error claro; sin vincular |
| Seats en límite | Invitación rechazada; UI muestra límite |
| Race condition: 2 invites en último seat | Solo una pasa; otra → error seats_limit |
| Coach desvinculado | `billing_source = 'self'` (via trigger); necesita MP propio |
| Coach desvinculado — `billing_source` verificado DB | Verificar directo en DB que trigger actuó correctamente |
| Alumno `/c/[slug]` | Sin cambio de permisos; historial accesible |
| IDOR: org admin A intenta ver org B | 403 / datos vacíos |
| **Coach que es también admin_org** | Accede a `/org/*` y a `/coach/*` sin conflicto; sin checkout MP visible |
| **Org admin accede a `/org/*` con `ENTERPRISE_ORG_ENABLED=false`** | 404 retornado; coach mantiene acceso |
| **Coach retail existente migrado a org** | Flujo `migrate-retail-to-org.ts` con `--dry-run`; validar en DB que `billing_source = 'org'` y que no perdió datos. |
| **Performance baseline** | RPC `get_org_dashboard_metrics` con org de 20 coaches / 500 alumnos debe responder <300ms en staging. |

### 14.2 Tests de seguridad

- Org A no accede a coaches/métricas de org B (RLS con dos JWTs).
- Coach staff no accede a `/org/*` sin rol `admin_org`.
- Token hash nunca expuesto en respuestas API.
- Audit log generado en cada acción crítica.

### 14.3 Automatización

```
tests/
├── rls/rls-org-isolation.test.ts       # JWT admin_org vs otra org
├── e2e/org-smoke.test.ts               # crear org → invitar → aceptar → ver panel
├── e2e/retail-smoke.test.ts            # flujo retail sin cambios
├── unit/accept-org-invite.test.ts      # race condition; token expirado; token revocado; doble uso
├── unit/billing-source-trigger.test.ts # trigger billing_source al desvincular coach
├── unit/rpc-metrics-join.test.ts       # verificar que el JOIN de workout_logs no retorne 0 silenciosamente con datos sintéticos.
└── a11y/org-dashboard.test.ts          # axe-core checks en /org/dashboard, /org/team, /org/invite/accept
```

**Accessibility test scope (WCAG 2.1 AA):**
- `axe-core` via Playwright en `/org/dashboard`, `/org/team`, modales de invitación, `/org/invite/accept`.
- Focus trap verificado manualmente en modales (InviteModal, CoachDrawer).
- Contraste mínimo 4.5:1 verificado con `storybook-addon-a11y` o herramienta similar.

---

## 15. Data & Analytics

### 15.1 Funnel B2B

```
Visita /pricing#equipos  ← trackear con custom_event('b2b_pricing_section_view')
                           cuando el usuario hace scroll hasta el anchor #equipos
                           (Plausible custom event o GA4 scroll trigger)
Demo agendada (Calendly) ←
Demo realizada           ←
Piloto activado (trial)  ←
Primer coach activo      ← (aceptó invitación + registró sesión de alumno)
Primer pago recibido     ←
Renovación mes 2         ←
Seat adicional (expansión) ←
Invite sent/opened/clicked ← tracking UTM en links de email para medir onboarding drop-off.
```

Medir drop-off en cada paso. Si alto en "demo agendada → demo realizada" → problema de no-show → agregar recordatorio automático Calendly.

### 15.2 Dashboards CEO

- MRR org vs MRR retail stacked.
- Orgs: activas / trial / grace / canceladas.
- ARPA org vs retail; objetivo ≥ 3×.
  - Query ARPA org: `SELECT AVG(amount_clp) FROM org_payment_records WHERE period_start >= date_trunc('month', now() - INTERVAL '1 month')`
  - Comparar vs ARPA retail: promedio de `coaches.subscription_amount` donde `billing_source = 'self'`
  - *Normalizar pagos anuales: `amount_clp / months_covered` antes de promediar, para evitar distorsión por upfront payments.*
- Heatmap: orgs > 80% de seats → candidatas a upgrade.
- Cohort retención org: definido por **mes de primer pago** (no de activación trial). Trial es pre-cohort. Ventanas: mes 1 → 3 → 6 → 12.

### 15.3 Alertas accionables

| Señal | Acción |
|-------|--------|
| Org en grace + sin pago en 3d | CS envía WhatsApp/email proactivo |
| Org en grace + sin pago en 6d | CS realiza llamada directa como última acción |
| Demo agendada pero no se realizó | Fundador hace follow-up en 24h |
| Org > 90% alumnos del pack | CS ofrece upgrade |
| Cohort mes 1 churn > 15% | Revisar onboarding — reunión equipo |

---

## 16. Customer Success

### 16.1 Runbook: Alta org manual

```
1. Gym agenda demo via Calendly
2. Demo 30 min → gym dice sí → fundador envía link MP desde contacto@eva-app.cl
3. Gym paga → fundador confirma recepción en cuenta MP
4. Fundador en /admin:
     → Crea org (nombre, max_coaches según plan)
     → Registra en org_payment_records
     → status = 'active' (o 'trial' para piloto)
5. Fundador envía email de bienvenida (manual, desde Gmail):
     → Link a /org/dashboard
     → Checklist de primeros pasos
     → PDF de términos adjunto
5.5. Enviar email de bienvenida separado a cada coach staff (no solo al admin):
     explicar que mantienen su marca y autonomía.
6. CS check-in D+3: "¿Coaches aceptaron invitaciones?"
7. CS check-in D+30: "¿Están usando el panel? ¿Qué les falta?"
   (Solicitar testimonio/quote si la respuesta es positiva — para one-pager y landing)
```

### 16.2 Runbook: Coach sale del gym

```
1. Org admin desvincula en /org/team
   (UI bloquea si tiene alumnos activos → org admin debe transferir o descargar primero)
2. Fundador ejecuta scripts/deactivate-org.ts --coachId=XXX (dry-run primero)
3. Coach recibe email: "Tu acceso es ahora independiente. Configura tu suscripción en EVA."
4. Audit log registra actor + timestamp
5. Verificar en DB que billing_source = 'self' fue seteado por el trigger
```

### 16.3 Runbook: Cancelación voluntaria (org decide irse)

```
0. Realizar 'exit interview' obligatorio con 5 opciones: precio, no usan panel,
   coaches se fueron, cambiaron de software, otros. Registrar en `organizations.notes`.
1. Org admin contacta a EVA (email o WhatsApp)
2. Fundador ejecuta: scripts/deactivate-org.ts --orgId=XXX --reason=voluntary_cancel (dry-run primero)
3. org.status = 'cancelled'; trigger activa billing_source = 'self' en coaches
4. Datos retenidos 90 días (coaches pueden exportar sus alumnos y programas)
5. Email a org admin:
   "Tu cuenta EVA Empresas fue cancelada. Tus datos estarán disponibles
    hasta [fecha +90d]. Cualquier consulta: contacto@eva-app.cl"
6. Email a cada coach de la org:
   "El plan de [Gym] fue cancelado. Tu acceso es ahora independiente.
    Para continuar usando EVA configurá tu suscripción aquí: [link]"
7. Tras 90 días: eliminar org + metadata. Datos de alumnos permanecen
   con su coach si el coach sigue activo en EVA retail.
```

### 16.4 Runbook: Escalación P0 (org pagó, coaches bloqueados)

```
1. CS recibe reporte → /admin → verifica org.status
2. Status 'active' pero coaches bloqueados → bug de gate → ENTERPRISE_ORG_ENABLED=false → investigar
3. Status incorrecto → activación manual inmediata → notificar org admin + coaches
4. SLA resolución: < 2 horas desde reporte
5. Post-mortem en 48h: causa raíz + acción preventiva
```

### 16.5 SLA por severidad

| Nivel | Descripción | SLA |
|-------|-------------|-----|
| **P0** | Org pagó, coaches bloqueados / acceso caído | < 2 horas |
| **P1** | Feature crítica rota (invitación no llega, panel da error 500) | < 24 horas |
| **P2** | Problema de UX, confusión en dashboard, dato incorrecto | < 72 horas / próximo sprint |

### 16.6 Proceso de upgrade mid-period

```
CS detecta org en > 80% de seats → contacto proactivo.
Si gym confirma upgrade:
  1. Calcular diferencia prorrateada: (precio_nuevo - precio_actual) / 30 × días_restantes
  2. Fundador envía link MP por el monto prorrateado
  3. Gym paga → fundador actualiza max_coaches en /admin
  4. Desde el próximo período, cobro al nuevo precio completo
  5. Registrar en org_payment_records (2 registros: prorate + nuevo período)
```

### 16.7 Health Score

| Señal | Peso | Cálculo |
|-------|------|---------|
| % coaches activos (log < 7d) | 40% | coaches_con_sesion_7d / total_seats |
| % alumnos activos (log < 7d) | 30% | alumnos_con_log_7d / total_alumnos_org |
| Uso de seats | 20% | seats_usados / max_coaches |
| Días hasta renovación | 10% | min(días_restantes/30, 1.0) |

Score < 50 → alerta CS → contacto proactivo en 24h con script específico (ver §16.8).

**Definición canónica de "coach activo":** tiene al menos 1 fila en `workout_logs` o `nutrition_meal_logs` con `created_at >= now() - INTERVAL '7 days'` de algún alumno de su cartera.

*Nota: evaluar ajustar a coaches activos 30%, alumnos activos 40% si el modelo de negocio del gym es de alta rotación de coaches.*

### 16.8 Script de contacto CS (health score bajo)

```
"Hola [nombre], te escribo desde EVA. Veo que algunos coaches
del equipo de [Gym] no han tenido actividad esta semana.
¿Hay algo en lo que podamos ayudar? ¿Algún coach tuvo
problemas para aceptar la invitación o usar el panel?
Estoy disponible para una llamada de 15 min si necesitás."
```

### 16.9 Plantillas de email clave

```
BIENVENIDA ORG:
Asunto: Tu cuenta EVA Empresas está activa — [Nombre Gym]
Cuerpo: "Bienvenido/a. Tu panel está en [link]. Checklist de primeros pasos: [...]
         Cualquier duda: contacto@eva-app.cl o WhatsApp [número]."
Adjunto: PDF Términos de uso

INVITACIÓN COACH:
Asunto: [Gym] te invitó a EVA
"[Nombre], [Dueño] del [Gym] te invitó como coach.
Tu acceso queda cubierto por el plan del gym.
[Aceptar invitación →] — válido 7 días."

RENOVACIÓN D-7:
Asunto: Tu plan EVA renueva el [fecha] — [Gym]
"Sin acción requerida si ya coordinaste el pago.
Si necesitas renovar: [link MP] o responde este email."

GRACE PERIOD:
Asunto: ⚠️ Tu plan EVA venció — acceso activo 7 días más
"Para renovar antes del [fecha]: [Ver instrucciones de pago]
Después de esa fecha el acceso se pausará."

CANCELACIÓN:
Asunto: Tu cuenta EVA Empresas fue cancelada — [Gym]
"Tus datos estarán disponibles hasta [fecha +90d].
Coaches del equipo recibirán instrucciones por separado.
Si fue un error, escribinos a contacto@eva-app.cl"
```

---

## 17. Legal y privacidad

### 17.1 Situación del equipo

- 2 fundadores como personas naturales. Contratos firmados a nombre propio → válidos en Chile.
- Sin RUT empresa → cobros vía MP personal de `contacto@eva-app.cl` o cuenta bancaria.
- Formalizar SpA/SRL cuando MRR org > ~$500k CLP/mes.
- Si un gym es SpA o SA y pide contrato con RUT empresa → tener respuesta preparada: "Actualmente operamos como personas naturales; el contrato es igualmente válido en Chile. Te enviamos los términos en formato PDF para tu revisión." Formalizar empresa si ese gym es un deal crítico.
- *Solución transitoria para facturación: si un gym SpA exige factura antes de la formalización de EVA, evaluar facturación a través de tercero autorizado o boleta de honorarios con glosa explícita. Documentar en runbook FinOps.*

### 17.2 Términos B2B

Documento de 1–2 páginas (template completo en [DECISIONES_B2B.md](DECISIONES_B2B.md) §Parte 3). Se envía como PDF adjunto al email de bienvenida.

**Mecanismo de aceptación:** "El pago = aceptación" solo es débil si no hay evidencia de que el gym leyó los términos. Para reforzarlo:
- Desde MVP, agregar checkbox en `/org/billing` o en email de bienvenida: "He leído y acepto los Términos de uso B2B". Guardar timestamp + IP como evidencia. Post-MVP: checkout con aceptación embebida.
- Incluir en el email de bienvenida: "Al realizar el pago confirmaste haber leído y aceptado nuestros [Términos de uso B2B]. Documento adjunto."
- Guardar timestamp del pago + referencia en `org_payment_records.notes` como evidencia.

### 17.3 Ley 19.628 (Chile) — actualizada 2024

- **Encargo de datos desde el primer momento:** desde que EVA almacena datos de alumnos del gym, existe una relación de encargo. No esperar a que la org vea datos individuales.
- Datos de coaches: base legal = contrato de servicio.
- Datos de alumnos: gym actúa como responsable; EVA como encargado.
- **DPA mínimo en MVP:** incluir una cláusula de encargo de datos en los Términos B2B ("EVA trata los datos de los clientes del gym únicamente para prestación del servicio, sin ceder a terceros, con medidas de seguridad según estándar SaaS"). No necesita ser un documento separado hasta que MRR > $500k CLP o gym > 100 alumnos.
- **Post-MVP (si org ve datos individuales):** DPA firmado separado + mención en política de privacidad de EVA.

### 17.4 Roles de datos

| Actor | Rol | Datos |
|-------|-----|-------|
| EVA (plataforma) | Encargado | Procesa según instrucciones del gym |
| Gym (org) | Responsable | Decide qué datos recoger de sus clientes |
| Coach staff | Sub-encargado | Datos de alumnos de su cartera |

### 17.5 Datos sensibles y cifrado

- `tax_id` (RUT org): **Decisión final: No recolectar `tax_id` hasta que Supabase Vault esté disponible y verificado en producción.** Si se habilita el campo en UI antes del cifrado, bloquear en middleware.
- `org_payment_records`: no almacenar datos de tarjeta — solo referencia de transacción MP o número de transferencia.
- Retención contable SII Chile: 6 años.

### 17.6 Política de retención post-cancelación

| Dato | Retención tras cancelación | Quién puede acceder |
|------|---------------------------|---------------------|
| Perfil org + metadata | 90 días, luego eliminar | Nadie (excepto fundadores via /admin) |
| Datos de alumnos | Permanecen con coach si coach sigue en EVA | Coach retail |
| org_payment_records | 6 años (SII) | Fundadores |
| org_audit_logs | 2 años | Fundadores |

Comunicar retención de 90 días en email de cancelación (§16.3).

*Los términos deben garantizar que el gym puede exportar sus datos en formato estándar (CSV/JSON) durante la relación contractual y dentro de los 90 días post-cancelación.*

---

## 18. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| RLS org rompe políticas retail | Media | Alto | Políticas aditivas; tests JWT en CI antes de merge |
| Race condition en seats | Baja | Medio | `accept_org_invite()` usa `FOR UPDATE` lock |
| Alumnos huérfanos al desvincular coach | Alta | Alto | UI bloquea si hay alumnos activos; transferencia obligatoria |
| Org admin ve PII alumnos sin DPA | Media | Alto | MVP solo counts; cláusula DPA en términos desde ola 3 |
| Email invite en spam | Media | Medio | SPF/DKIM configurado; texto sin palabras spam; Resend en ola 4 |
| No-show en demos Calendly | Media | Medio | Recordatorio automático Calendly 24h antes + 1h antes |
| Scope creep SSO/API | Alta | Medio | Documentado fuera de MVP; rechazar en backlog |
| Churn temprano por mal onboarding | Media | Alto | Checklist + health score + CS D+3 y D+30 + script de contacto |
| Billing manual no escala > 30 orgs | Alta (futuro) | Medio | Documentado; automatizar cuando llegue ese volumen |
| Fundadores sin empresa = limitación contratos grandes | Media | Bajo | Persona natural válido; formalizar a $500k CLP MRR |
| `billing_source` inconsistente al desvincular | Alta (sin mitigación) | Alto | **Mitigado: trigger `trg_coach_billing_reset` en §11.5** |
| Bug silencioso en RPC métricas (workout_logs join) | Media | Medio | Verificar estructura `workout_logs` en staging antes de ola 3 |
| Gmail SMTP throttled > 10 orgs | Media | Alto | Migrar a Resend en ola 4 (§13.5) |
| PT Distinction undercutting en precio | Media | Medio | Contraargumento listo: white-label individual vs white-label de gym. El pitch debe mencionarlo proactivamente. |
| Gym pide contrato con RUT empresa | Baja | Bajo | Respuesta preparada; formalizar SpA si deal es crítico |
| Cancelación sin política de retención clara | Media | Medio | Runbook §16.3 + email de cancelación con fecha de expiración |

---

## 19. Roadmap por olas

| Ola | Bloque A | Bloque B | Entregable | Est. |
|-----|----------|----------|-----------|------|
| **1 — Base datos** | Schema `organizations` + `coaches.organization_id` nullable + tipos TS + índices + **trigger `trg_coach_billing_reset`** + **Verificación JOIN workout_logs en staging** (blocker técnico) | Precedencia gate/middleware solo con `org_id IS NOT NULL` + job `retail-regression` en CI verde | Retail intacto; DB lista; trigger activo | 1 sem |
| **2 — Flujo B2B** | `organization_members` + `organization_invites` + RLS aditivas + `accept_org_invite()` (SHA-256 token) + audit log | UI `/org/team` (lista + invitar + aceptar) + `/org/invite/accept` tokenizada (4 estados) + strings centralizados | Flujo cerrado en staging | 2 sem |
| **3 — Panel + activación** | Activación manual desde `/admin` + `org_payment_records` + enforcement seats + UX grace/blocked + **verificar `workout_logs` join** + **implementar `tax_id` cifrado (Vault o pgcrypto)** | RPCs métricas + `/org/dashboard` KPIs (+ empty state) + `/org/billing` estado + historial + instrucciones + **cláusula DPA en términos B2B** + **Template DPA separado preparado** (bloqueante para deals enterprise) | Piloto 2–3 gyms posible | 1–2 sem |
| **4 — Go-to-Market** | Email automático renovación D-7 + **migrar a Resend** + Edge Function schedule (grace/suspend) + `/org/usage` + `/org/settings` | **Sección `/pricing#equipos`** (+ toggle mensual/anual) + Calendly + one-pager B2B + runbook CS + custom_event tracking + **Video Loom de producto (60–90s)** | Ventas abiertas | 1 sem |
| **5 — Autonomía producto** | Digest semanal org admin + notificación seat límite + onboarding checklist interactivo + health score en CEO panel | `/org/settings` con logo + ARPA dashboard + cohort retención | Producto más autónomo | 1 sem |
| **Post-MVP** | MP org automatizado (> 30 orgs) + factura electrónica SII | Reportes CSV + pool global + transferencia alumnos entre coaches + `/empresas` página dedicada + downgrade de plan | Escala | TBD |

**Nota ola 4:** Calendly es configuración externa (30 min) — no es código. Se hace en paralelo con la sección de landing.

---

## 20. Registro de decisiones

Todas resueltas. Sin decisiones bloqueantes pendientes. Se puede arrancar ola 1.

| # | Decisión | Resolución |
|---|----------|-----------|
| 1 | Pool alumnos | Suma de `max_clients` por coach. `max_clients_total = NULL` en MVP. Pool global post-MVP. |
| 2 | Email duplicado en invite | Vincular con confirmación del coach. Coach recibe email con [Aceptar] / [Rechazar]. |
| 3 | Naming | `organization`/`org_` en código. "Plan de equipo" en UI. "EVA Empresas" en marketing. |
| 4 | Pricing | Starter $89.990 · Pro $159.990 · Elite $269.990 · Enterprise desde $400.000 · cotizar. Anual –20%. Descuento por coach ~40–55% vs individual — refleja valor del panel de gestión, no solo volumen. |
| 5 | Suite retail CI | Job `retail-regression`, 5 casos obligatorios, ~3h técnicas. Template en §14. |
| 6 | Runbook alta org | Documentado en §16.1. Simulacro en staging entre los dos fundadores. |
| 7 | Términos B2B | Template en [DECISIONES_B2B.md](DECISIONES_B2B.md) §Parte 3. Pago + email confirma aceptación. |
| 8 | Cuenta billing | `contacto@eva-app.cl` (MP verificado + Gmail profesional). |
| 9 | Email comunicaciones | `contacto@eva-app.cl` manual (bienvenida, deals). Resend automático (invitaciones, grace, renovación). |
| 10 | Landing B2B | Sección `/pricing#equipos` en ola 4 con toggle mensual/anual. Página `/empresas` post-piloto. |
| 11 | Cómo reciben demos | Calendly configurado antes de ola 3. Link en landing. WhatsApp con texto prefilled. |
| 12 | Roles UI | `admin_org` → "Administrador del equipo". `coach_staff` → "Coach". Nunca mostrar nombre técnico en UI. |
| 13 | Token hashing | SHA-256 vía `encode(digest(token::bytea, 'sha256'), 'hex')`. No bcrypt (crypt()) para invite tokens. |
| 14 | billing_source reset | Trigger `trg_coach_billing_reset` en DB. No depender de lógica de aplicación. |
| 15 | Email provider | Resend para emails automáticos (ola 4). Gmail para emails personales de fundadores. |
| 16 | Cron implementación | Supabase Edge Function schedule (ola 4). Migrar a pg_cron solo si se necesita precisión sub-minuto. |
| 17 | tax_id cifrado | Supabase Vault (Pro+). Fallback: pgcrypto PGP_SYM_ENCRYPT. No recolectar hasta implementado. |
| 18 | DPA | Cláusula incluida en términos B2B desde ola 3. Documento separado post-MVP. |
| 19 | Retención datos cancelación | Org + metadata: 90 días. Pagos: 6 años (SII). Alumnos: con coach si sigue activo. |
| 20 | Invite accept auth | `/org/invite/accept` requiere sesión activa con email coincidente al invite. Evita aceptación por terceros si el link se filtra. |
| 21 | Rate limit invites | Máximo 10 invites/hora por org para prevenir enumeración de emails y spam. |
| 22 | Prorrateo upgrade | Cobrar mes completo al nuevo precio si faltan <15 días del período actual; prorrateo lineal si faltan ≥15 días. |
| 23 | Exportación selectiva backup | `pg_dump --table=org_*` semanal para retenciones diferenciadas por tabla. |

---

## 21. Análisis competitivo e ideas

### 21.1 Mapa competitivo (actualizado mayo 2025)

| Competidor | Fortaleza | Debilidad crítica vs EVA | Dato clave |
|-----------|-----------|--------------------------|------------|
| **TrueCoach** | UX limpia, coach-first, coaches ilimitados gratis | Sin modo B2B; sin billing org; sin panel de equipo; solo theming (no app propia) | Desde $19.99/mes por capacidad de clientes |
| **TrainHeroic** | Team management, por atleta | Asistentes $9.99 c/u; sin white-label | Desde pago por atleta; Enterprise 1000+ = $0.50/atleta |
| **MyPTHub** | Precio más bajo del mercado, coaches ilimitados | Sin white-label; sin org dashboard; producto mínimo | $14.40/mes flat, unlimited |
| **CoachAccountable** | Coaches ilimitados, Fortune 500 clientes | White-label = +$50/mes add-on; orientado a life coaching, no fitness | Per-cliente; Enterprise = Amazon, L'Oreal, Pepsi |
| **PT Distinction** ⚠️ | White-label **incluida** en Pro ($59.90), coaches ilimitados | **White-label es una sola app del gym, no por coach**. Sin visión consolidada por org. | Pro: $59.90/25 clientes; Master: $89.90/50 clientes |
| **Mindbody / ABC Fitness** | Gestión gym completa, reservas, pagos presenciales | Sin coaching digital personalizado; costoso ($159–$699) | Gestión de clases, no coaching 1:1 |
| **ABC Trainerize** | White-label completa en Enterprise, multi-sede | $248/mes mínimo; no per-coach white-label | Enterprise para cadenas/franquicias |
| **Glofox** | App branded por gym, clases grupales | Sin programación 1:1; sin nutrición avanzada | Nicho clases grupales |
| **Wodify** | CrossFit/box fuerte | Nicho muy específico; sin white-label individual | Específico CrossFit |
| **Varias cuentas sueltas** | "Ya funciona" | Sin visión unificada; más caro; gym ciego | El estado actual de la mayoría de gyms |

**Conclusión:** EVA tiene el diferenciador correcto. PT Distinction es la amenaza más cercana en precio — pero su white-label es UNA app por gym, no por coach. Ese es el argumento que hay que usar en demos cuando el gym menciona PT Distinction.

### 21.2 Cómo responder "¿Por qué no PT Distinction?" en demos

> "PT Distinction tiene white-label, es verdad. Pero es una sola app para todo el gym. Todos tus coaches comparten una identidad de marca. Si Ana López tiene su marca personal y Pedro Ruiz tiene la suya, en PT Distinction ambos quedan bajo la marca del gym. En EVA, Ana sigue siendo Ana López Fitness con su propia URL y su propia app, y vos como dueño ves a Ana + Pedro + Carlos en un panel. Eso no existe en ninguna otra plataforma."

### 21.3 Moat a construir

1. **Datos históricos:** más tiempo en EVA = más historial de alumnos, adherencia, progresión. Difícil migrar.
2. **Identidad del coach:** coaches construyen su marca en `/c/[coach_slug]`. Cambiar plataforma = perder esa URL e historial.
3. **Red de referidos:** coach EVA recomienda a su gym → gym se convierte en cliente B2B → flywheel.

### 21.4 Ideas post-MVP para evaluar

**Producto:**
- Asignación de alumnos entre coaches de la org (sin que el alumno pierda historial).
- Rol `viewer` para inversores/directivos: métricas sin acceso operativo.
- Digest semanal org admin por email sin entrar al panel.

**Monetización:**
- Referido: coach retail que convierte su gym → descuento en plan propio.
- Add-on análisis avanzado: CSV, LTV por alumno, comparativas históricas.
- Franquicia: cadena de gyms con sub-orgs por sede, una factura matriz.

**Técnico:**
- API pública org: webhooks salientes → integración con CRM del gym.
- Dominio propio por org: `app.mygym.cl`.
- Integración Mindbody/Glofox: importar roster de alumnos automáticamente.

---

*Fin del plan rev. 7 (Kimi Edition). Todas las decisiones resueltas. Arrancar ola 1 cuando equipo apruebe.*

## 10. Frontend Developer

### 10.1 Estructura de rutas

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
│   │   ├── _data/billing.queries.ts
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
        ├── page.tsx                  # RSC — verifica token + sesión activa con email coincidente
        └── loading.tsx               # Skeleton mientras valida token async
```

### 10.2 Estado y datos

- `React.cache` en `_data/*.queries.ts` — deduplicación por request.
- `Promise.all()` para KPIs paralelos en dashboard.
- `useTransition` + server actions + `revalidatePath` como patrón único.
- `useOptimistic` para invite/revoke → feedback instantáneo.
- Props opcionales en componentes shared: `managedByOrg?: { name: string; orgId: string }` sin romper contratos existentes.
- Inyección de `managedByOrg` vía RSC parent prop (no Context) para evitar re-renders. Si el árbol de componentes es profundo, evaluar un Context org de solo lectura scoped a `/coach/*` layout.
- Sin Redux, Zustand, SWR, React Query — regla de producto EVA.

### 10.3 Helpers de contexto org

```typescript
// src/lib/org/get-org-context.ts
export const getOrgContext = cache(async (coachId: string): Promise<OrgContext | null> => {
  // Fallo silencioso → null → modo retail (safe default siempre)
  // Nunca lanzar excepción — degradar a retail si falla
})

// src/lib/org/require-org-admin.ts
export async function requireOrgAdminMember(): Promise<OrgMember> {
  const member = await getOrgMemberForCurrentUser()
  if (!member || member.role !== 'admin_org') redirect('/coach/dashboard')
  return member
}
```

*Si el árbol de componentes es profundo (prop drilling >2 niveles), evaluar un `OrgBannerContext` de solo lectura scoped al layout `/coach/*`. No viola la regla de estado global porque es derivado de RSC y solo lectura.*

### 10.4 Middleware

- `/org/*`: verificar sesión + rol `admin_org`; si no → `redirect('/coach/dashboard')`.
- `/org/invite/accept`: requiere sesión activa con email coincidente al invite. Verificación de token en RSC. Si no hay sesión o el email no coincide → redirigir a login con mensaje contextual.
- `/coach/*` y `/c/[slug]/*`: no tocar. Mismo comportamiento de hoy.

### 10.5 Caching y revalidación

- Tags: `['org-team', orgId]`, `['org-usage', orgId]`, `['org-billing', orgId]`, `['org-dashboard', orgId]`.
- `revalidateTag` tras invite/revoke/unlink/billing update.
- Cuando fundador registra pago en `/admin`, el server action debe llamar `revalidateTag(['org-billing', orgId])` y `revalidateTag(['org-dashboard', orgId])` para que el panel del gym refleje el nuevo estado en tiempo real.
- Sin `unstable_cache` — incompatible con Supabase SSR (regla EVA global).

### 10.6 i18n

- Strings de UI en español hardcodeado en MVP — correcto para LATAM.
- Centralizar strings de UI org en `src/lib/org/strings.ts` (objeto de constantes, no i18n framework) para facilitar traducción futura sin reescribir componentes.
- Templates de email: misma lógica — centralizar en `src/lib/org/email-templates.ts`.

### 10.7 Error boundaries

- `error.tsx` en cada módulo org con mensaje específico.
- Queries org fallidas → datos parciales; nunca pantalla en blanco.
- Server action errors → `useActionState` + Zod v4 → mensajes inline.
- Renderizar KPI cards como Server Components independientes con sus propios `error.tsx` y `loading.tsx` para falla aislada.


## 11. Backend Developer

### 11.1 Schema completo

```sql
-- ============================================================
-- organizations
-- ============================================================
CREATE TABLE organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  legal_name           TEXT,
  tax_id               TEXT,          -- RUT/RUC; cifrar con Supabase Vault (ver §17.5)
  billing_email        TEXT,
  status               TEXT NOT NULL DEFAULT 'trial'
                         CHECK (status IN ('trial','active','grace','suspended','cancelled')),
  billing_source       TEXT NOT NULL DEFAULT 'manual'
                         CHECK (billing_source IN ('manual','mp_org')),
  max_coaches          INT NOT NULL DEFAULT 5,
  max_clients_total    INT,           -- NULL = suma max_clients por coach; INT = pool global (post-MVP)
  trial_ends_at        TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  grace_ends_at        TIMESTAMPTZ,  -- = current_period_end + '7 days'
  mp_preapproval_id    TEXT,         -- NULL en MVP; post-MVP mp_org
  notes                TEXT,         -- notas internas EVA (invisibles para org admin)
  calendly_demo_at     TIMESTAMPTZ,  -- fecha de la demo agendada (tracking)
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- coaches (alteraciones)
-- ============================================================
ALTER TABLE coaches
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN billing_source  TEXT DEFAULT 'self'
                               CHECK (billing_source IN ('self','org'));

-- Migración segura en tabla existente: ambas columnas son NULL por defecto.
-- ON DELETE SET NULL en organization_id es instantáneo en Postgres.
-- billing_source DEFAULT 'self' es instantáneo (no reescribe filas existentes en Postgres 11+).

CREATE INDEX CONCURRENTLY idx_coaches_org
  ON coaches(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_coaches_user_org
  ON coaches(user_id, organization_id)
  WHERE organization_id IS NOT NULL;

-- ============================================================
-- organization_members
-- ============================================================
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  coach_id        UUID REFERENCES coaches(id) ON DELETE SET NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin_org','coach_staff')),
  joined_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_org  ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- organization_invites
-- ============================================================
CREATE TABLE organization_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin_org','coach_staff')),
  token_hash      TEXT NOT NULL UNIQUE, -- SHA-256 del token; nunca guardar token plano
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  invited_by      UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_invites_org   ON organization_invites(organization_id);
CREATE INDEX idx_org_invites_email ON organization_invites(email) WHERE accepted_at IS NULL;

-- ============================================================
-- org_payment_records (billing manual MVP)
-- ============================================================
CREATE TABLE org_payment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  amount_clp      INT NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  payment_method  TEXT DEFAULT 'manual'
                    CHECK (payment_method IN ('manual','mp_link','transfer','mp_org')),
  reference       TEXT,      -- número de transferencia o referencia MP
  proof_url       TEXT,      -- URL de comprobante de transferencia en Storage
  activated_by    UUID REFERENCES auth.users(id), -- fundador que activó
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_payment_records_org ON org_payment_records(organization_id, paid_at DESC);

-- ============================================================
-- org_audit_logs
-- ============================================================
CREATE TABLE org_audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_user_id   UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  -- invite_sent | invite_accepted | invite_revoked | invite_expired
  -- coach_linked | coach_unlinked | org_activated | org_suspended
  -- org_renewed | role_changed | settings_updated
  target_user_id  UUID,
  target_coach_id UUID,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_audit_org ON org_audit_logs(organization_id, created_at DESC);

-- ============================================================
-- org_subscription_events (analytics)
-- ============================================================
CREATE TABLE org_subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type      TEXT NOT NULL,
  -- trial_start | activated | renewed | seat_added | seat_removed
  -- grace_entered | suspended | cancelled | reactivated
  mrr_delta_clp   INT,
  seats_after     INT,
  payment_record_id UUID REFERENCES org_payment_records(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
-- Índice crítico para cohort analysis
CREATE INDEX idx_sub_events_org ON org_subscription_events(organization_id, created_at DESC);
```

### 11.2 RLS — políticas aditivas

```sql
-- Org admin lee coaches de su org
CREATE POLICY "org_admin_read_own_coaches" ON coaches FOR SELECT
USING (
  organization_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = coaches.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin_org'
  )
);

-- Org admin lee miembros de su org
CREATE POLICY "org_admin_read_own_members" ON organization_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members me
    WHERE me.organization_id = organization_members.organization_id
      AND me.user_id = auth.uid()
      AND me.role = 'admin_org'
  )
);

-- Org admin lee historial de pagos de su org
CREATE POLICY "org_admin_read_payments" ON org_payment_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_payment_records.organization_id
      AND user_id = auth.uid()
      AND role = 'admin_org'
  )
);

-- IMPORTANTE: las políticas existentes coach_id = auth.uid() NO se modifican.
-- Nuevas políticas son ADITIVAS. Las existentes no se tocan.
```

### 11.3 RPC métricas dashboard

```sql
-- PRECONDICIÓN BLOCKER OLA 1: Auditar estructura real de workout_logs en staging.
-- Si no tiene coach_id directo, crear un VIEW materializado org_workout_stats
-- o ajustar el JOIN. No avanzar a ola 2 sin esto verificado.

CREATE OR REPLACE FUNCTION get_org_dashboard_metrics(p_org_id UUID)
RETURNS TABLE (
  active_coaches  INT, total_seats     INT,
  active_clients  INT, max_clients     INT,
  sessions_7d     INT, checkins_7d     INT,
  org_status      TEXT, period_end     TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND role = 'admin_org'
  ) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN QUERY
    SELECT
      COUNT(c.id)::INT FILTER (WHERE c.subscription_status IN ('active','trial')),
      o.max_coaches,
      COALESCE(SUM(c.current_client_count),0)::INT,
      COALESCE(o.max_clients_total, SUM(c.max_clients))::INT,
      (SELECT COUNT(*)::INT FROM workout_logs wl JOIN coaches cc ON cc.id = wl.coach_id
       WHERE cc.organization_id = p_org_id AND wl.created_at >= now() - INTERVAL '7 days'),
      (SELECT COUNT(*)::INT FROM check_ins ci JOIN clients cl ON cl.id = ci.client_id
       JOIN coaches cc ON cc.id = cl.coach_id
       WHERE cc.organization_id = p_org_id AND ci.created_at >= now() - INTERVAL '7 days'),
      o.status, o.current_period_end
    FROM organizations o
    JOIN coaches c ON c.organization_id = o.id
    WHERE o.id = p_org_id
    GROUP BY o.id, o.max_coaches, o.max_clients_total, o.status, o.current_period_end;
END;
$$;
```

### 11.4 Enforcement de seats (transaccional — sin race condition)

```sql
-- Token comparison: SHA-256 del token enviado en el link de email.
-- El link contiene el token plano; aquí se hashea y compara con el hash guardado.
-- Requiere pgcrypto (disponible en Supabase por defecto): CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION accept_org_invite(p_token TEXT, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite organization_invites%ROWTYPE;
  v_org    organizations%ROWTYPE;
  v_count  INT;
BEGIN
  SELECT * INTO v_invite FROM organization_invites
  WHERE token_hash = encode(digest(p_token::bytea, 'sha256'), 'hex')
    AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"error":"invalid_or_expired_token"}'::JSONB; END IF;

  SELECT * INTO v_org FROM organizations WHERE id = v_invite.organization_id FOR UPDATE;
  SELECT COUNT(*) INTO v_count FROM organization_members WHERE organization_id = v_org.id;
  IF v_count >= v_org.max_coaches THEN RETURN '{"error":"seats_limit_reached"}'::JSONB; END IF;

  UPDATE organization_invites SET accepted_at = now()
  WHERE id = v_invite.id AND accepted_at IS NULL;

  INSERT INTO organization_members(organization_id, user_id, role)
    VALUES (v_org.id, p_user_id, v_invite.role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  UPDATE coaches SET organization_id = v_org.id, billing_source = 'org' WHERE user_id = p_user_id;
  INSERT INTO org_audit_logs(organization_id, actor_user_id, action, target_user_id)
    VALUES (v_org.id, p_user_id, 'invite_accepted', p_user_id);

  RETURN '{"ok":true}'::JSONB;
END;
$$;
```

*Idempotencia: si el usuario hace doble clic, el segundo intento encontrará `accepted_at IS NOT NULL` y no generará error ni duplicados.*

### 11.5 Trigger: billing_source siempre consistente

```sql
-- Sin este trigger, ON DELETE SET NULL nullifica organization_id pero billing_source
-- queda como 'org' aunque el coach ya no esté en ninguna org. Generaría coach
-- sin checkout MP visible pero sin org que lo cubra — bloqueado sin salida.

CREATE OR REPLACE FUNCTION reset_coach_billing_on_unlink()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    NEW.billing_source := 'self';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coach_billing_reset
BEFORE UPDATE ON coaches
FOR EACH ROW EXECUTE FUNCTION reset_coach_billing_on_unlink();
```

*Validación post-migración obligatoria: ejecutar `SELECT COUNT(*) FROM coaches WHERE organization_id IS NULL AND billing_source != 'self'` → debe retornar 0.*

### 11.6 Cascade y retención de datos

| Evento | Comportamiento |
|--------|---------------|
| Org cancelada | `coaches.organization_id = NULL` via ON DELETE SET NULL; trigger resetea `billing_source = 'self'` automáticamente |
| Coach desvinculado | Row en `organization_members` deleted; trigger `trg_coach_billing_reset` activa `billing_source = 'self'` |
| Datos de alumnos | **Nunca** cascade delete por cambio de org |
| `org_payment_records` | Retener 6 años (SII Chile) |
| `org_audit_logs` | Retener 2 años |
| Org cancelada voluntariamente | Datos retenidos 90 días; coaches pueden exportar. Tras 90 días: org + metadata eliminados. Datos de alumnos permanecen con su coach si el coach continúa en EVA retail. |


## 12. Modelo de billing manual

### 12.1 Por qué manual es correcto ahora

MercadoPago pre-approvals son 1:1 con pagador-persona y tarjeta específica. Para B2B (tarjetas corporativas, múltiples administradores, pago por transferencia) este modelo genera problemas: si el pagador se va de la empresa la pre-approval queda en su cuenta personal; si expira la tarjeta el gym debe hacer checkout completo de nuevo; empresas chilenas con RUT prefieren transferencia + boleta.

Con 2–30 orgs el costo operativo de activación manual es ~5 min/org/mes. Correcto para esta etapa.

### 12.2 Cuenta oficial

**MercadoPago y email:** `contacto@eva-app.cl` (cuenta MP verificada).
Todos los links de pago, transferencias y comunicaciones de billing salen desde esta cuenta.

### 12.3 Flujo de cobro

```
D-7 antes de vencimiento:
  Fundador envía email desde contacto@eva-app.cl:
    Opción A — Link MP: [Pagar $XXX.XXX CLP →]
               (generado en cuenta MP contacto@eva-app.cl)
    Opción B — Transferencia bancaria a cuenta vinculada
               Referencia: GYM-[nombre]-[mes-año]
    Opción C — Comprobante de transferencia:
               El gym sube foto/PDF del comprobante a un bucket seguro de Storage.
               El fundador valida el comprobante antes de activar en /admin.

Gym paga → pago visible en cuenta MP/banco

Fundador en /admin (< 5 min):
  1. Selecciona org
  2. Registra en org_payment_records: monto, método, referencia, proof_url (si aplica)
  3. Extiende current_period_end
  4. Confirma status = 'active'
  5. Server action llama revalidateTag(['org-billing', orgId]) → panel gym se actualiza

Automatización sin código nuevo:
  Notion/Google Sheets con calendario de vencimientos por org
  Cron job simple para cambiar status a 'grace' y 'suspended' (ola 4)
```

### 12.4 Panel `/org/billing` (sin checkout embebido)

El org admin ve estado + historial + instrucciones. El "Pagar" abre un modal con el link MP o datos de transferencia — es profesional. Muchos SaaS B2B chilenos (Bsale, Defontana) operan exactamente así.

### 12.5 Cuándo automatizar billing

Automatizar tiene sentido cuando:
- **> 30 orgs activas** → el tiempo operativo empieza a ser relevante.
- **Empresa registrada** → necesitás facturación electrónica SII automática.
- **Deal enterprise** que exija automatización contractual.
- **>10 orgs con pago anual upfront:** el cash flow justifica invertir en facturación electrónica SII.


## 13. DevOps

### 13.1 Variables de entorno

```env
ENTERPRISE_ORG_ENABLED=true       # false = rutas /org/* retornan 404
ORG_GRACE_PERIOD_DAYS=7
ORG_RENEWAL_EMAIL_DOMAIN=eva-app.cl  # Dominio fijo para reducir riesgo de spoofing
RESEND_API_KEY=...                # Email transaccional ola 4 (ver §13.5)
```

*El from address fijo reduce riesgo de spoofing. Solo el dominio es configurable.*

### 13.2 CI/CD

- Job `retail-regression` en CI — corre en cada PR que toque gate, middleware, RLS, `organizations/*`.
- Feature branch `feat/enterprise-org` → staging (ENTERPRISE_ORG_ENABLED=true) → producción controlada.
- Producción inicial: `ENTERPRISE_ORG_ENABLED=false` hasta validar en staging.

**Comportamiento de `ENTERPRISE_ORG_ENABLED=false` con orgs activas:** el flag solo afecta el registro de rutas de Next.js (`/org/*` retorna 404). La lógica de gate de coaches no depende del flag — un coach con `billing_source = 'org'` y org activa sigue teniendo acceso aunque el flag esté en false. El flag es para habilitar/deshabilitar la UI del panel org, no el acceso de coaches. Si se apaga en emergencia, los coaches de org activa mantienen acceso; el org admin no puede entrar al panel hasta que el flag vuelva a true.

**Sub-flags para granularidad de emergencia:** evaluar `ORG_TEAM_ENABLED`, `ORG_BILLING_ENABLED` para apagar solo secciones sin tirar todo el panel.

### 13.3 Monitoreo

- Logs estructurados: `{ event, orgId, coachId, durationMs, actorId }`.
- Alerta: cualquier 5xx en `/org/*` → notificación inmediata fundadores.
- RPCs org: alerta si p95 > 300ms.
- Métricas separadas `/org/*` vs `/coach/*` — no contaminar baseline retail.
- Alerta de health check de Resend: si el volumen mensual supera el 70% del límite del plan gratuito (3.000 emails/mes), notificar a fundadores.

### 13.4 Scripts operativos

```
scripts/
├── provision-org.ts          # Crear org + vincular coaches (staging/prod)
├── renew-org.ts              # Extender period_end tras pago manual
├── deactivate-org.ts         # Suspender org + notificar coaches (dry-run primero)
├── migrate-retail-to-org.ts  # Para gyms con varias cuentas sueltas
└── schema-diff.sh            # Comparar migraciones locales vs staging (blocker CI)
```

### 13.5 Email transaccional — decisión de proveedor

**Problema con Gmail SMTP:** para > 10 orgs con emails automáticos (invitaciones, grace, renovación D-7, bienvenida), el volumen supera los límites de Gmail SMTP (500/día con cuenta standard). Un email bloqueado en grace period = potencial churn.

**Decisión para ola 4:** migrar emails automáticos a **Resend** (`resend.com`).
- Plan gratuito: 3.000 emails/mes (suficiente hasta > 50 orgs).
- SDK TypeScript nativo, integra con Next.js server actions.
- Soporte SPF/DKIM/DMARC desde `contacto@eva-app.cl` (dominio propio).
- Los emails manuales de fundadores (bienvenida, cierre de deal) siguen saliendo de Gmail — eso es intencional (tono personal).

### 13.6 Cron para transiciones de estado

**Transiciones automáticas necesarias (ola 4):**
- `active` → `grace` cuando `current_period_end < now()`
- `grace` → `suspended` cuando `grace_ends_at < now()`

**Opción A — pg_cron:** disponible en Supabase Pro+. Verificar plan antes de depender de él con `SELECT * FROM pg_extension WHERE extname = 'pg_cron'`.

**Opción B — Supabase Edge Function con schedule:** disponible en todos los planes. Más portable. Recomendada si el plan actual no incluye pg_cron.

**Decisión:** implementar como Edge Function schedule en ola 4. Migrar a pg_cron si se necesita precisión sub-minuto (no aplica para billing diario).

*Edge Function schedules tienen granularidad mínima de 1 hora. Para transiciones exactas de billing, considerar `pg_cron` si el plan de Supabase lo permite. Documentar que la transición puede tardar hasta 60 min.*

### 13.7 Backup y PII

- `organizations` (RUT, contacto): backup diferencial diario.
- `org_payment_records`: retención 6 años; backup semanal adicional.
- `org_audit_logs`: retención 2 años.
- DR: documentar RTO/RPO para `organizations` en runbook ops. Valores sugeridos: RTO 4 horas, RPO 24 horas.
- Dado que Supabase backup es a nivel de proyecto, implementar exportación selectiva semanal con `pg_dump --table=org_*` para retenciones diferenciadas por tabla.


## 14. QA

### 14.1 Matriz de regresión (obligatoria en cada PR)

| Escenario | Resultado esperado |
|-----------|-------------------|
| Coach nuevo retail | Flujo idéntico a hoy; cero menciones de org |
| Coach `organization_id IS NULL` | Gate idéntico; sin queries org en logs |
| Coach retail visita `/org/*` | Redirect a `/coach/dashboard` |
| Org activa, coach staff | Acceso sin MP; banner "Cubierto por [Gym]" visible |
| Org en grace (día 3) | Coach con acceso; banners de aviso correctos |
| Org vencida (día 8) | Coach bloqueado; página informativa; sin checkout MP |
| Invitación expirada | "Esta invitación ha expirado." — no vincula |
| Invitación revocada | "Esta invitación fue revocada." — no vincula |
| Token usado dos veces | "Esta invitación ya fue utilizada." — no vincula |
| Email ya en otra org | Error claro; sin vincular |
| Seats en límite | Invitación rechazada; UI muestra límite |
| Race condition: 2 invites en último seat | Solo una pasa; otra → error seats_limit |
| Coach desvinculado | `billing_source = 'self'` (via trigger); necesita MP propio |
| Coach desvinculado — `billing_source` verificado DB | Verificar directo en DB que trigger actuó correctamente |
| Alumno `/c/[slug]` | Sin cambio de permisos; historial accesible |
| IDOR: org admin A intenta ver org B | 403 / datos vacíos |
| **Coach que es también admin_org** | Accede a `/org/*` y a `/coach/*` sin conflicto; sin checkout MP visible |
| **Org admin accede a `/org/*` con `ENTERPRISE_ORG_ENABLED=false`** | 404 retornado; coach mantiene acceso |
| **Coach retail existente migrado a org** | Flujo `migrate-retail-to-org.ts` con `--dry-run`; validar en DB que `billing_source = 'org'` y que no perdió datos |
| **Performance baseline** | RPC `get_org_dashboard_metrics` con org de 20 coaches / 500 alumnos debe responder <300ms en staging |

### 14.2 Tests de seguridad

- Org A no accede a coaches/métricas de org B (RLS con dos JWTs).
- Coach staff no accede a `/org/*` sin rol `admin_org`.
- Token hash nunca expuesto en respuestas API.
- Audit log generado en cada acción crítica.
- Rate limit de invites: máximo 10 invites/hora por org para prevenir enumeración de emails.

### 14.3 Automatización

```
tests/
├── rls/rls-org-isolation.test.ts       # JWT admin_org vs otra org
├── e2e/org-smoke.test.ts               # crear org → invitar → aceptar → ver panel
├── e2e/retail-smoke.test.ts            # flujo retail sin cambios
├── unit/accept-org-invite.test.ts      # race condition; token expirado; token revocado; doble uso
├── unit/billing-source-trigger.test.ts # trigger billing_source al desvincular coach
├── unit/rpc-metrics-join.test.ts       # verificar que el JOIN de workout_logs no retorne 0 silenciosamente
└── a11y/org-dashboard.test.ts          # axe-core checks en /org/dashboard, /org/team, /org/invite/accept
```

**Accessibility test scope (WCAG 2.1 AA):**
- `axe-core` via Playwright en `/org/dashboard`, `/org/team`, modales de invitación, `/org/invite/accept`.
- Focus trap verificado manualmente en modales (InviteModal, CoachDrawer).
- Contraste mínimo 4.5:1 verificado con `storybook-addon-a11y` o herramienta similar.


## 15. Data & Analytics

### 15.1 Funnel B2B

```
Visita /pricing#equipos  ← trackear con custom_event('b2b_pricing_section_view')
                           cuando el usuario hace scroll hasta el anchor #equipos
                           (Plausible custom event o GA4 scroll trigger)
Demo agendada (Calendly) ←
Demo realizada           ←
Piloto activado (trial)  ←
Primer coach activo      ← (aceptó invitación + registró sesión de alumno)
Primer pago recibido     ←
Renovación mes 2         ←
Seat adicional (expansión) ←
```

**Eventos faltantes a implementar:**
- `invite_sent`, `invite_opened`, `invite_clicked` — tracking UTM en links de email para medir onboarding drop-off.

Medir drop-off en cada paso. Si alto en "demo agendada → demo realizada" → problema de no-show → agregar recordatorio automático Calendly.

### 15.2 Dashboards CEO

- MRR org vs MRR retail stacked.
- Orgs: activas / trial / grace / canceladas.
- ARPA org vs retail; objetivo ≥ 3×.
  - Query ARPA org: `SELECT AVG(amount_clp / NULLIF(months_covered,0)) FROM org_payment_records WHERE period_start >= date_trunc('month', now() - INTERVAL '1 month')`
  - *Normalizar pagos anuales: `amount_clp / months_covered` antes de promediar, para evitar distorsión por upfront payments.*
  - Comparar vs ARPA retail: promedio de `coaches.subscription_amount` donde `billing_source = 'self'`
- Heatmap: orgs > 80% de seats → candidatas a upgrade.
- Cohort retención org: definido por **mes de primer pago** (no de activación trial). Trial es pre-cohort. Ventanas: mes 1 → 3 → 6 → 12.

### 15.3 Alertas accionables

| Señal | Acción |
|-------|--------|
| Org en grace + sin pago en 3d | CS envía WhatsApp/email proactivo |
| Org en grace + sin pago en 6d | CS realiza llamada directa como última acción de retención |
| Demo agendada pero no se realizó | Fundador hace follow-up en 24h |
| Org > 90% alumnos del pack | CS ofrece upgrade |
| Cohort mes 1 churn > 15% | Revisar onboarding — reunión equipo |

---

## 16. Customer Success

### 16.1 Runbook: Alta org manual

```
1. Gym agenda demo via Calendly
2. Demo 30 min → gym dice sí → fundador envía link MP desde contacto@eva-app.cl
3. Gym paga → fundador confirma recepción en cuenta MP
4. Fundador en /admin:
     → Crea org (nombre, max_coaches según plan)
     → Registra en org_payment_records
     → status = 'active' (o 'trial' para piloto)
5. Fundador envía email de bienvenida (manual, desde Gmail):
     → Link a /org/dashboard
     → Checklist de primeros pasos
     → PDF de términos adjunto
5.5. Enviar email de bienvenida separado a cada coach staff (no solo al admin):
     → Explicar que mantienen su marca y autonomía.
     → Link a su dashboard con banner de "Acceso cubierto por [Gym]".
6. CS check-in D+3: "¿Coaches aceptaron invitaciones?"
7. CS check-in D+30: "¿Están usando el panel? ¿Qué les falta?"
   (Solicitar testimonio/quote si la respuesta es positiva — para one-pager y landing)
```

### 16.2 Runbook: Coach sale del gym

```
1. Org admin desvincula en /org/team
   (UI bloquea si tiene alumnos activos → org admin debe transferir o descargar primero)
2. Fundador ejecuta scripts/deactivate-org.ts --coachId=XXX (dry-run primero)
3. Coach recibe email: "Tu acceso es ahora independiente. Configura tu suscripción en EVA."
4. Audit log registra actor + timestamp
5. Verificar en DB que billing_source = 'self' fue seteado por el trigger
```

### 16.3 Runbook: Cancelación voluntaria (org decide irse)

```
0. Realizar 'exit interview' obligatorio con 5 opciones:
   precio | no usan panel | coaches se fueron | cambiaron de software | otros.
   Registrar en organizations.notes.
1. Org admin contacta a EVA (email o WhatsApp)
2. Fundador ejecuta: scripts/deactivate-org.ts --orgId=XXX --reason=voluntary_cancel (dry-run primero)
3. org.status = 'cancelled'; trigger activa billing_source = 'self' en coaches
4. Datos retenidos 90 días (coaches pueden exportar sus alumnos y programas)
5. Email a org admin:
   "Tu cuenta EVA Empresas fue cancelada. Tus datos estarán disponibles
    hasta [fecha +90d]. Cualquier consulta: contacto@eva-app.cl"
6. Email a cada coach de la org:
   "El plan de [Gym] fue cancelado. Tu acceso es ahora independiente.
    Para continuar usando EVA configurá tu suscripción aquí: [link]"
7. Tras 90 días: eliminar org + metadata. Datos de alumnos permanecen
   con su coach si el coach sigue activo en EVA retail.
```

### 16.4 Runbook: Escalación P0 (org pagó, coaches bloqueados)

```
1. CS recibe reporte → /admin → verifica org.status
2. Status 'active' pero coaches bloqueados → bug de gate → ENTERPRISE_ORG_ENABLED=false → investigar
3. Status incorrecto → activación manual inmediata → notificar org admin + coaches
4. SLA resolución: < 2 horas desde reporte
5. Post-mortem en 48h: causa raíz + acción preventiva
```

### 16.5 SLA por severidad

| Nivel | Descripción | SLA |
|-------|-------------|-----|
| **P0** | Org pagó, coaches bloqueados / acceso caído | < 2 horas |
| **P1** | Feature crítica rota (invitación no llega, panel da error 500) | < 24 horas |
| **P2** | Problema de UX, confusión en dashboard, dato incorrecto | < 72 horas / próximo sprint |

### 16.6 Proceso de upgrade mid-period

```
CS detecta org en > 80% de seats → contacto proactivo.
Si gym confirma upgrade:
  1. Calcular diferencia prorrateada:
     - Si faltan >= 15 días: (precio_nuevo - precio_actual) / 30 × días_restantes
     - Si faltan < 15 días: cobrar mes completo al nuevo precio (sin prorrateo parcial)
  2. Fundador envía link MP por el monto prorrateado
  3. Gym paga → fundador actualiza max_coaches en /admin
  4. Desde el próximo período, cobro al nuevo precio completo
  5. Registrar en org_payment_records (2 registros: prorate + nuevo período)
```

### 16.7 Health Score

| Señal | Peso | Cálculo |
|-------|------|---------|
| % coaches activos (log < 7d) | 40% | coaches_con_sesion_7d / total_seats |
| % alumnos activos (log < 7d) | 30% | alumnos_con_log_7d / total_alumnos_org |
| Uso de seats | 20% | seats_usados / max_coaches |
| Días hasta renovación | 10% | min(días_restantes/30, 1.0) |

Score < 50 → alerta CS → contacto proactivo en 24h con script específico (ver §16.8).

**Definición canónica de "coach activo":** tiene al menos 1 fila en `workout_logs` o `nutrition_meal_logs` con `created_at >= now() - INTERVAL '7 days'` de algún alumno de su cartera.

*Nota: evaluar ajustar a coaches activos 30%, alumnos activos 40% si el modelo de negocio del gym es de alta rotación de coaches.*

### 16.8 Script de contacto CS (health score bajo)

```
"Hola [nombre], te escribo desde EVA. Veo que algunos coaches
del equipo de [Gym] no han tenido actividad esta semana.
¿Hay algo en lo que podamos ayudar? ¿Algún coach tuvo
problemas para aceptar la invitación o usar el panel?
Estoy disponible para una llamada de 15 min si necesitás."
```

### 16.9 Plantillas de email clave

```
BIENVENIDA ORG:
Asunto: Tu cuenta EVA Empresas está activa — [Nombre Gym]
Cuerpo: "Bienvenido/a. Tu panel está en [link]. Checklist de primeros pasos: [...]
         Cualquier duda: contacto@eva-app.cl o WhatsApp [número]."
Adjunto: PDF Términos de uso

INVITACIÓN COACH:
Asunto: [Gym] te invitó a EVA
"[Nombre], [Dueño] del [Gym] te invitó como coach.
Tu acceso queda cubierto por el plan del gym.
[Aceptar invitación →] — válido 7 días."

RENOVACIÓN D-7:
Asunto: Tu plan EVA renueva el [fecha] — [Gym]
"Sin acción requerida si ya coordinaste el pago.
Si necesitás renovar: [link MP] o responde este email."

GRACE PERIOD:
Asunto: ⚠️ Tu plan EVA venció — acceso activo 7 días más
"Para renovar antes del [fecha]: [Ver instrucciones de pago]
Después de esa fecha el acceso se pausará."

CANCELACIÓN:
Asunto: Tu cuenta EVA Empresas fue cancelada — [Gym]
"Tus datos estarán disponibles hasta [fecha +90d].
Coaches del equipo recibirán instrucciones por separado.
Si fue un error, escribinos a contacto@eva-app.cl"
```

---

## 17. Legal y privacidad

### 17.1 Situación del equipo

- 2 fundadores como personas naturales. Contratos firmados a nombre propio → válidos en Chile.
- Sin RUT empresa → cobros vía MP personal de `contacto@eva-app.cl` o cuenta bancaria.
- Formalizar SpA/SRL cuando MRR org > ~$500k CLP/mes.
- Si un gym es SpA o SA y pide contrato con RUT empresa → tener respuesta preparada: "Actualmente operamos como personas naturales; el contrato es igualmente válido en Chile. Te enviamos los términos en formato PDF para tu revisión." Formalizar empresa si ese gym es un deal crítico.
- *Solución transitoria para facturación: si un gym SpA exige factura antes de la formalización de EVA, evaluar facturación a través de tercero autorizado o boleta de honorarios con glosa explícita. Documentar en runbook FinOps.*

### 17.2 Términos B2B

Documento de 1–2 páginas (template completo en [DECISIONES_B2B.md](DECISIONES_B2B.md) §Parte 3). Se envía como PDF adjunto al email de bienvenida.

**Mecanismo de aceptación:** "El pago = aceptación" solo es débil si no hay evidencia de que el gym leyó los términos. Para reforzarlo:
- Incluir en el email de bienvenida: "Al realizar el pago confirmaste haber leído y aceptado nuestros [Términos de uso B2B]. Documento adjunto."
- Guardar timestamp del pago + referencia en `org_payment_records.notes` como evidencia.
- *Desde MVP, agregar checkbox en `/org/billing` o en email de bienvenida: 'He leído y acepto los Términos de uso B2B'. Guardar timestamp + IP como evidencia. Post-MVP: checkout con aceptación embebida.*

### 17.3 Ley 19.628 (Chile) — actualizada 2024

- **Encargo de datos desde el primer momento:** desde que EVA almacena datos de alumnos del gym, existe una relación de encargo. No esperar a que la org vea datos individuales.
- Datos de coaches: base legal = contrato de servicio.
- Datos de alumnos: gym actúa como responsable; EVA como encargado.
- **DPA mínimo en MVP:** incluir una cláusula de encargo de datos en los Términos B2B ("EVA trata los datos de los clientes del gym únicamente para prestación del servicio, sin ceder a terceros, con medidas de seguridad según estándar SaaS"). No necesita ser un documento separado hasta que MRR > $500k CLP o gym > 100 alumnos.
- **Post-MVP (si org ve datos individuales):** DPA firmado separado + mención en política de privacidad de EVA.
- *Template DPA separado preparado desde ola 3 (bloqueante para deals enterprise).*

### 17.4 Roles de datos

| Actor | Rol | Datos |
|-------|-----|-------|
| EVA (plataforma) | Encargado | Procesa según instrucciones del gym |
| Gym (org) | Responsable | Decide qué datos recoger de sus clientes |
| Coach staff | Sub-encargado | Datos de alumnos de su cartera |

### 17.5 Datos sensibles y cifrado

- `tax_id` (RUT org): **Decisión final: No recolectar `tax_id` hasta que Supabase Vault esté disponible y verificado en producción.** Si se habilita el campo en UI antes del cifrado, bloquear en middleware.
- Si no usás Vault y usás `pgcrypto`, la clave está en `app.settings.vault_key`. Si alguien tiene acceso a la DB, tiene acceso a la clave y a los RUT. Con Vault, la clave está en un HSM.
- `org_payment_records`: no almacenar datos de tarjeta — solo referencia de transacción MP o número de transferencia.
- Retención contable SII Chile: 6 años.

### 17.6 Política de retención post-cancelación

| Dato | Retención tras cancelación | Quién puede acceder |
|------|---------------------------|---------------------|
| Perfil org + metadata | 90 días, luego eliminar | Nadie (excepto fundadores via /admin) |
| Datos de alumnos | Permanecen con coach si coach sigue en EVA | Coach retail |
| org_payment_records | 6 años (SII) | Fundadores |
| org_audit_logs | 2 años | Fundadores |

Comunicar retención de 90 días en email de cancelación (§16.3).

*Los términos deben garantizar que el gym puede exportar sus datos en formato estándar (CSV/JSON) durante la relación contractual y dentro de los 90 días post-cancelación. Esto evita litigios y es requisito de la Ley 19.628 (derecho de portabilidad).*


## 18. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| RLS org rompe políticas retail | Media | Alto | Políticas aditivas; tests JWT en CI antes de merge |
| Race condition en seats | Baja | Medio | `accept_org_invite()` usa `FOR UPDATE` lock + idempotencia en UPDATE |
| Alumnos huérfanos al desvincular coach | Alta | Alto | UI bloquea si hay alumnos activos; transferencia obligatoria |
| Org admin ve PII alumnos sin DPA | Media | Alto | MVP solo counts; cláusula DPA en términos desde ola 3; template DPA separado listo |
| Email invite en spam | Media | Medio | SPF/DKIM configurado; texto sin palabras spam; Resend en ola 4 |
| No-show en demos Calendly | Media | Medio | Recordatorio automático Calendly 24h antes + 1h antes |
| Scope creep SSO/API | Alta | Medio | Documentado fuera de MVP; rechazar en backlog |
| Churn temprano por mal onboarding | Media | Alto | Checklist + health score + CS D+3 y D+30 + script de contacto |
| Billing manual no escala > 30 orgs | Alta (futuro) | Medio | Documentado; automatizar cuando llegue ese volumen |
| Fundadores sin empresa = limitación contratos grandes | Media | Bajo | Persona natural válido; formalizar a $500k CLP MRR; solución transitoria de facturación documentada |
| `billing_source` inconsistente al desvincular | Alta (sin mitigación) | Alto | **Mitigado: trigger `trg_coach_billing_reset` en §11.5 + validación post-migración obligatoria** |
| Bug silencioso en RPC métricas (workout_logs join) | Media | Medio | **Blocker ola 1:** verificar estructura `workout_logs` en staging antes de ola 2; test `rpc-metrics-join.test.ts` |
| Gmail SMTP throttled > 10 orgs | Media | Alto | Migrar a Resend en ola 4 (§13.5) |
| PT Distinction undercutting en precio | Media | Medio | Contraargumento listo: white-label individual vs white-label de gym. El pitch debe mencionarlo proactivamente. |
| Gym pide contrato con RUT empresa | Baja | Bajo | Respuesta preparada; formalizar SpA si deal es crítico |
| Cancelación sin política de retención clara | Media | Medio | Runbook §16.3 + email de cancelación con fecha de expiración |
| Invite token filtrado / aceptación no autorizada | Media | Alto | **Mitigado:** `/org/invite/accept` requiere sesión activa con email coincidente (§10.4) |
| DB lock entre cron y invite acceptance | Baja | Medio | **Mitigado:** usar `SKIP LOCKED` en cron si toca `organization_invites`; documentar en runbook DevOps |

---

## 19. Roadmap por olas

| Ola | Bloque A | Bloque B | Entregable | Est. |
|-----|----------|----------|-----------|------|
| **1 — Base datos** | Schema `organizations` + `coaches.organization_id` nullable + tipos TS + índices + **trigger `trg_coach_billing_reset`** + **verificación JOIN workout_logs en staging** | Precedencia gate/middleware solo con `org_id IS NOT NULL` + job `retail-regression` en CI verde | Retail intacto; DB lista; trigger activo; JOIN verificado | 1 sem |
| **2 — Flujo B2B** | `organization_members` + `organization_invites` + RLS aditivas + `accept_org_invite()` (SHA-256 token + idempotencia) + audit log | UI `/org/team` (lista + invitar + aceptar) + `/org/invite/accept` tokenizada (4 estados + auth obligatoria) + strings centralizados | Flujo cerrado en staging | 2 sem |
| **3 — Panel + activación** | Activación manual desde `/admin` + `org_payment_records` + enforcement seats + UX grace/blocked + **implementar `tax_id` cifrado (Vault o pgcrypto)** | RPCs métricas + `/org/dashboard` KPIs (+ empty state) + `/org/billing` estado + historial + instrucciones + **cláusula DPA en términos B2B** + **template DPA separado preparado** | Piloto 2–3 gyms posible | 1–2 sem |
| **4 — Go-to-Market** | Email automático renovación D-7 + **migrar a Resend** + Edge Function schedule (grace/suspend) + `/org/usage` + `/org/settings` | **Sección `/pricing#equipos`** (+ toggle mensual/anual) + Calendly + one-pager B2B + runbook CS + custom_event tracking + **video Loom de producto (60–90s)** | Ventas abiertas | 1 sem |
| **5 — Autonomía producto** | Digest semanal org admin + notificación seat límite + onboarding checklist interactivo + health score en CEO panel | `/org/settings` con logo + ARPA dashboard + cohort retención | Producto más autónomo | 1 sem |
| **Post-MVP** | MP org automatizado (> 30 orgs) + factura electrónica SII | Reportes CSV + pool global + transferencia alumnos entre coaches + `/empresas` página dedicada + downgrade de plan | Escala | TBD |

**Nota ola 4:** Calendly es configuración externa (30 min) — no es código. Se hace en paralelo con la sección de landing.

---

## 20. Registro de decisiones

Todas resueltas. Sin decisiones bloqueantes pendientes. Se puede arrancar ola 1.

| # | Decisión | Resolución |
|---|----------|-----------|
| 1 | Pool alumnos | Suma de `max_clients` por coach. `max_clients_total = NULL` en MVP. Pool global post-MVP. |
| 2 | Email duplicado en invite | Vincular con confirmación del coach. Coach recibe email con [Aceptar] / [Rechazar]. |
| 3 | Naming | `organization`/`org_` en código. "Plan de equipo" en UI. "EVA Empresas" en marketing. |
| 4 | Pricing | Starter $89.990 · Pro $159.990 · Elite $269.990 · Enterprise desde $400.000 · cotizar. Anual –20%. Descuento por coach ~40–55% vs individual — refleja valor del panel de gestión, no solo volumen. |
| 5 | Suite retail CI | Job `retail-regression`, 5 casos obligatorios, ~3h técnicas. Template en §14. |
| 6 | Runbook alta org | Documentado en §16.1. Simulacro en staging entre los dos fundadores. |
| 7 | Términos B2B | Template en [DECISIONES_B2B.md](DECISIONES_B2B.md) §Parte 3. Pago + email confirma aceptación. Checkbox de aceptación desde MVP. |
| 8 | Cuenta billing | `contacto@eva-app.cl` (MP verificado + Gmail profesional). |
| 9 | Email comunicaciones | `contacto@eva-app.cl` manual (bienvenida, deals). Resend automático (invitaciones, grace, renovación). |
| 10 | Landing B2B | Sección `/pricing#equipos` en ola 4 con toggle mensual/anual. Página `/empresas` post-piloto. |
| 11 | Cómo reciben demos | Calendly configurado antes de ola 3. Link en landing. WhatsApp con texto prefilled. |
| 12 | Roles UI | `admin_org` → "Administrador del equipo". `coach_staff` → "Coach". Nunca mostrar nombre técnico en UI. |
| 13 | Token hashing | SHA-256 vía `encode(digest(token::bytea, 'sha256'), 'hex')`. No bcrypt (crypt()) para invite tokens. |
| 14 | billing_source reset | Trigger `trg_coach_billing_reset` en DB. No depender de lógica de aplicación. |
| 15 | Email provider | Resend para emails automáticos (ola 4). Gmail para emails personales de fundadores. |
| 16 | Cron implementación | Supabase Edge Function schedule (ola 4). Migrar a pg_cron solo si se necesita precisión sub-minuto. |
| 17 | tax_id cifrado | Supabase Vault (Pro+). Fallback: pgcrypto PGP_SYM_ENCRYPT. No recolectar hasta implementado. |
| 18 | DPA | Cláusula incluida en términos B2B desde ola 3. Documento separado post-MVP. Template listo desde ola 3. |
| 19 | Retención datos cancelación | Org + metadata: 90 días. Pagos: 6 años (SII). Alumnos: con coach si sigue activo. |
| 20 | Invite accept auth | `/org/invite/accept` requiere sesión activa con email coincidente al invite. Evita aceptación por terceros si el link se filtra. |
| 21 | Rate limit invites | Máximo 10 invites/hora por org para prevenir enumeración de emails y spam. |
| 22 | Prorrateo upgrade | Cobrar mes completo al nuevo precio si faltan <15 días del período actual; prorrateo lineal si faltan ≥15 días. |
| 23 | Exportación selectiva backup | `pg_dump --table=org_*` semanal para retenciones diferenciadas por tabla. |

---

## 21. Análisis competitivo e ideas

### 21.1 Mapa competitivo (actualizado mayo 2025)

| Competidor | Fortaleza | Debilidad crítica vs EVA | Dato clave |
|-----------|-----------|--------------------------|------------|
| **TrueCoach** | UX limpia, coach-first, coaches ilimitados gratis | Sin modo B2B; sin billing org; sin panel de equipo; solo theming (no app propia) | Desde $19.99/mes por capacidad de clientes |
| **TrainHeroic** | Team management, por atleta | Asistentes $9.99 c/u; sin white-label | Desde pago por atleta; Enterprise 1000+ = $0.50/atleta |
| **MyPTHub** | Precio más bajo del mercado, coaches ilimitados | Sin white-label; sin org dashboard; producto mínimo | $14.40/mes flat, unlimited |
| **CoachAccountable** | Coaches ilimitados, Fortune 500 clientes | White-label = +$50/mes add-on; orientado a life coaching, no fitness | Per-cliente; Enterprise = Amazon, L'Oreal, Pepsi |
| **PT Distinction** ⚠️ | White-label **incluida** en Pro ($59.90), coaches ilimitados | **White-label es una sola app del gym, no por coach**. Sin visión consolidada por org. | Pro: $59.90/25 clientes; Master: $89.90/50 clientes |
| **Mindbody / ABC Fitness** | Gestión gym completa, reservas, pagos presenciales | Sin coaching digital personalizado; costoso ($159–$699) | Gestión de clases, no coaching 1:1 |
| **ABC Trainerize** | White-label completa en Enterprise, multi-sede | $248/mes mínimo; no per-coach white-label | Enterprise para cadenas/franquicias |
| **Glofox** | App branded por gym, clases grupales | Sin programación 1:1; sin nutrición avanzada | Nicho clases grupales |
| **Wodify** | CrossFit/box fuerte | Nicho muy específico; sin white-label individual | Específico CrossFit |
| **Varias cuentas sueltas** | "Ya funciona" | Sin visión unificada; más caro; gym ciego | El estado actual de la mayoría de gyms |

**Conclusión:** EVA tiene el diferenciador correcto. PT Distinction es la amenaza más cercana en precio — pero su white-label es UNA app por gym, no por coach. Ese es el argumento que hay que usar en demos cuando el gym menciona PT Distinction.

### 21.2 Cómo responder "¿Por qué no PT Distinction?" en demos

> "PT Distinction tiene white-label, es verdad. Pero es una sola app para todo el gym. Todos tus coaches comparten una identidad de marca. Si Ana López tiene su marca personal y Pedro Ruiz tiene la suya, en PT Distinction ambos quedan bajo la marca del gym. En EVA, Ana sigue siendo Ana López Fitness con su propia URL y su propia app, y vos como dueño ves a Ana + Pedro + Carlos en un panel. Eso no existe en ninguna otra plataforma."

### 21.3 Moat a construir

1. **Datos históricos:** más tiempo en EVA = más historial de alumnos, adherencia, progresión. Difícil migrar.
2. **Identidad del coach:** coaches construyen su marca en `/c/[coach_slug]`. Cambiar plataforma = perder esa URL e historial.
3. **Red de referidos:** coach EVA recomienda a su gym → gym se convierte en cliente B2B → flywheel.

### 21.4 Ideas post-MVP para evaluar

**Producto:**
- Asignación de alumnos entre coaches de la org (sin que el alumno pierda historial).
- Rol `viewer` para inversores/directivos: métricas sin acceso operativo.
- Digest semanal org admin por email sin entrar al panel.

**Monetización:**
- Referido: coach retail que convierte su gym → descuento en plan propio.
- Add-on análisis avanzado: CSV, LTV por alumno, comparativas históricas.
- Franquicia: cadena de gyms con sub-orgs por sede, una factura matriz.

**Técnico:**
- API pública org: webhooks salientes → integración con CRM del gym.
- Dominio propio por org: `app.mygym.cl`.
- Integración Mindbody/Glofox: importar roster de alumnos automáticamente.

---

*Fin del plan rev. 7 (Kimi Edition). Todas las decisiones resueltas. Arrancar ola 1 cuando equipo apruebe.*
