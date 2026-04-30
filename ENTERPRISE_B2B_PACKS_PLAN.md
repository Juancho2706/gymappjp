# Plan modo empresarial (B2B multi-coach) — EVA Fitness Platform

> **Versión documento:** 2026-04-30 (rev. 2 — UX dashboard empresarial)  
> **Estado:** planificación; **sin cambios de código** en el repo de producto vinculados a este entregable.  
> **Fuentes internas:** [AGENTS.md](AGENTS.md), [nuevabibliadelaapp/01-ESTADO-ACTUAL.md](nuevabibliadelaapp/01-ESTADO-ACTUAL.md), [nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md](nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md), [nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md), [nuevabibliadelaapp/05-PAGOS-Y-OPERACIONES.md](nuevabibliadelaapp/05-PAGOS-Y-OPERACIONES.md).

---

## 1. Principio rector: coexistencia sin interrupción

El modo empresarial es un **producto paralelo** al flujo actual EVA (coach independiente B2B2C). Debe cumplirse todo lo siguiente:

| Regla | Implicación |
|--------|-------------|
| **Opt-in por datos** | `organization_id` (o equivalente) **NULL** = comportamiento idéntico al de hoy: registro, `/pricing`, MercadoPago, `coach-subscription-gate`, middleware `/coach/*`, RLS por `coach_id`. |
| **Sin migración forzada** | Ningún coach existente pasa a “empresa” sin acción explícita (crear org, invitación, o script operativo documentado). |
| **Sin rutas rotas** | URLs, PWA `/c/[coach_slug]`, manifests, webhooks actuales siguen siendo la fuente de verdad para el segmento retail. |
| **Feature isolation** | Código nuevo detrás de “tiene org” o rutas `/org/*` nuevas; evitar ramas que cambien defaults globales (`constants`, gate, middleware) más allá de **consultas adicionales** cuando exista vínculo org. |
| **Dos vías de monetización** | Retail: N coaches × suscripción individual. Empresa: 1 contrato/pack (facturación agregada) con N seats; no obligar al retail a entender conceptos org en UI. |

**Anti-patrón explícito:** reemplazar la fila `coaches` como única unidad de suscripción para *todos* sin distinguir `organization_id`. El modelo correcto es **“coach retail OR coach bajo org con billing org”** con reglas de precedencia documentadas (sección 6).

---

## 2. Resumen ejecutivo

- **Qué se vende:** packs a negocios (gimnasio, cadena, clínica multi-profesional) con **varios coaches**, posible **pool de alumnos** o límites por coach, y **panel de administración de la cuenta** (no reemplaza el día a día del coach en `/coach/*`).
- **Qué no cambia para el alumno:** sigue entrando por **`/c/[coach_slug]`** con la marca de *su* coach; el white-label por coach se mantiene salvo fases futuras (dominio propio de org).
- **Qué sí cambia para la empresa:** visibilidad consolidada, invitación de staff, un solo pagador, políticas de uso de seats.

---

## 3. Estado actual (baseline técnico y de negocio)

- **Datos:** grafo dominante `coaches` → `clients` → …; suscripción y límites en `coaches` (`subscription_tier`, `max_clients`, `subscription_mp_id`, estados en [05-PAGOS-Y-OPERACIONES](nuevabibliadelaapp/05-PAGOS-Y-OPERACIONES.md)).
- **Auth y aislamiento:** middleware coach + RLS por tenant coach; Panel CEO es operación plataforma, no “dueño de gimnasio”.
- **Workaround ya descrito:** varias cuentas coach sin org → sin vista unificada ([04-NEGOCIO-Y-ESTRATEGIA](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md) § Modelo B2B).

---

## 4. Modelo conceptual post-empresa

```text
Organization (pagador B2B, límites agregados, estado de suscripción org)
    └── OrganizationMember / Invite (quién administra, quién es coach)
            └── Coach (auth + slug + branding; coach_id intacto en todo el producto)
                    └── Clients, programs, nutrition… (sin cambio de FK principal)
```

- **Identidad comercial org:** nombre legal, RUT, contacto facturación (puede vivir en `organizations` + metadatos).
- **Coach:** sigue siendo la entidad que “posee” alumnos en el producto actual; evita reescribir 24+ políticas RLS en un solo sprint.

---

## 5. Product Manager — alcance, MVP, métricas

### 5.1 Personas

| Persona | Necesidad |
|---------|-----------|
| **Org admin (pagador)** | Factura, renovación, agregar/quitar coaches, ver uso vs pack. |
| **Coach staff** | Misma UX coach que hoy; opcional badge “Cuenta gestionada por [Gym]”. |
| **Alumno** | Sin cambio de flujo principal; opcional mención de marca gym en copy futuro. |
| **EVA ops / CEO** | Misma línea que hoy: soporte, activación manual, auditoría. |

### 5.2 MVP vs siguientes entregas

| Inclusión | MVP | Post-MVP |
|-----------|-----|----------|
| Tabla org + vínculo coach | Sí | — |
| Invitaciones email | Sí (mínimo) | Recordatorios, expiración configurable |
| Panel org | Lista coaches + estado billing | Reportes exportables, sedes |
| Cobro MP unificado por org | Ideal; si no, **modo manual** activado por CEO | Automatización completa |
| Pool `max_clients` cross-coach | Decidir regla única en MVP | Reglas mixtas por tier |
| SSO / dominio / API pública | No | Fase enterprise ([04](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md) ya bosqueja fases B2B) |

### 5.3 Métricas

- ARPA org vs ARPA retail; expansión (seats); churn org; tiempo invitación → coach activo; % coaches “covered” sin preapproval propio.

### 5.4 Criterios de aceptación “no regresión retail”

- Registro nuevo coach **sin** flujo org: idéntico a hoy (tiempos, MP, `processing`).
- Coach con `organization_id IS NULL`: middleware y gate **solo** leen columnas `coaches` como hoy.
- Tests automatizados: matriz “retail only” en CI obligatoria en cada PR que toque gate/middleware/RLS org.

---

## 6. Reglas de precedencia (billing y acceso)

Definición explícita para evitar doble bloqueo o doble cobro:

1. Si `organization_id IS NULL` → **solo** reglas actuales `coaches.subscription_*` + `hasEffectiveAccess` ([`coach-subscription-gate`](src/lib/coach-subscription-gate.ts)).
2. Si `organization_id IS NOT NULL` y org está **vigente** (activa / trial org / grace org según producto) → coach **tiene acceso** aunque su fila tenga flags “sin MP propio” (estado explícito tipo `billing_source=org` o equivalente).
3. Si org **vencida** o suspendida → política producto: grace por X días solo staff o bloqueo inmediato; documentar y alinear con Legal/CS.
4. **Nunca** exigir checkout MP en el coach staff si el pack org ya cubre su seat (evita fricción y doble cargo).

---

## 7. UX / UI — dashboard empresarial (visión creativa + diferencias con coach común)

Esta sección responde en concreto: **cómo podría verse** el panel de la empresa, **qué es distinto** frente a un coach que paga y usa EVA hoy, **qué páginas serían nuevas**, y **qué se reaprovecha** del producto actual (solo producto/UX; sin implementación).

### 7.1 Tres “mundos” en la cabeza del usuario (para no mezclarlos)

| Mundo | Quién entra | Sensación | Analogía en EVA hoy |
|--------|----------------|-----------|----------------------|
| **A — Coach retail** | Coach independiente | “Mi negocio, mi marca, mis alumnos” | Todo `/coach/*` + cobro propio + `/coach/subscription` |
| **B — Coach staff (empresa)** | Profesional contratado por un gym | Igual que A en el día a día operativo | **Mismas** pantallas coach; solo pequeños hints de “cuenta gestionada” |
| **C — Admin empresa** | Dueño/a ops, gerente, contador del gym | “Mi equipo, mi contrato, mi uso agregado” | **Nuevo:** `/org/*` — no existe hoy para el cliente |

El error a evitar en UI: que el admin empresa “sienta” el Panel CEO (`/admin/*`). El CEO es **EVA**; el admin empresa es **cliente B2B**. Visual y copy deben diferenciarse (marca del gym + EVA secundaria, no KPIs de toda la plataforma).

### 7.2 Dirección visual del dashboard empresa (propuesta creativa)

- **Personalidad:** “control tower” — calma, datos primero, menos animación que el dashboard coach gamificado. Objetivo: **confianza y claridad de facturación**, no creatividad del builder.
- **Marca:** logo y nombre del **gimnasio/empresa** en cabecera; EVA como “Powered by” pequeño (refuerza que el software es EVA pero la cuenta es de ellos).
- **Color:** neutro profesional (p. ej. slate/zinc) con **un solo acento** (el primario del gym si se cargó en org settings, o azul sistema si no). **No** reutilizar el verde agresivo de landing EVA como fondo completo — evita competir con la marca del cliente.
- **Layout:** sidebar izquierda en desktop + **bottom tab bar en móvil** (mismo patrón mental que `CoachSidebar` / admin panel ya descritos en docs), con 4–5 ítems máximo en MVP.
- **Cards KPI:** mismo *lenguaje* que el coach dashboard (número grande + delta + hint) pero métricas **agregadas** (coaches activos, alumnos totales, sesiones 7d sumadas, % uso de pack). Opcional: mini sparkline cuando existan RPCs org.
- **Tablas:** estilo “War Room / directorio” ya familiar en EVA coach (`GlassCard`, densidad legible, badges de estado). La empresa debe sentir que **no aprende un segundo producto** distinto, solo otra **lente** sobre datos agregados.
- **Momentos de celebración:** evitar confetti; sustituir por toasts sobrios (“Invitación enviada”, “Pack actualizado”).
- **Estados vacíos:** ilustración o icono + 2 líneas + CTA único (“Invita a tu primer coach”) — mismo principio que onboarding coach pero copy B2B.

### 7.3 Arquitectura de información del `/org` panel (MVP rico en utilidad)

**Sidebar / tabs sugeridos (orden):**

1. **Resumen** — pulso del negocio en una pantalla (ver 7.4).
2. **Equipo** — coaches vinculados + invitaciones + seats usados/libres.
3. **Uso y límites** — alumnos totales vs cupo del pack; opcional desglose por coach sin entrar al detalle de nombres de alumnos si Legal pide minimización en v1.
4. **Facturación** — estado del plan org, renovación, descargar/comprobantes si aplica, CTA “Actualizar pack” o “Hablar con ventas”.
5. **Ajustes de cuenta** — nombre legal, RUT, contacto facturación, logo org (opcional futuro).

**Post-MVP (no mezclar en MVP):** Sedes, roles finos, reportes CSV, comparativas mes a mes, integraciones.

### 7.4 Pantalla “Resumen” (wireframe en palabras)

- **Fila superior:** 3–4 KPI cards: “Coaches activos / seats”, “Alumnos activos / límite pack”, “Sesiones de entreno (7d)”, “Check-ins (7d)” o “Adherencia nutrición agregada” si hay dato sin PII fina.
- **Segunda fila:** banda de **salud de la suscripción** (activa / próxima renovación / grace / acción requerida) con color semántico discreto — reutiliza el *concepto* del banner amarillo de cancelación coach pero copy orientado a “cuenta empresa”.
- **Tercera fila:** tabla compacta “Actividad reciente del equipo” (últimos eventos: coach X invitó, coach Y alcanzó tope de alumnos, nuevo coach aceptó invitación). Inspiración: “Activity feed” del dashboard coach documentado en `01-ESTADO-ACTUAL`, pero **sin** fotos de check-in de alumnos si Legal pide agregación solo en MVP.
- **CTA flotante o primario en header:** “Invitar coach” (siempre visible en MVP).

### 7.5 Pantalla “Equipo” (la más diferenciadora vs coach común)

- Lista de **filas coach**: avatar o iniciales, nombre, **slug** (link externo a la PWA del coach para probar), rol staff/admin org si aplica, badge “Activo / Invitado / Suspendido”.
- **Barra de progreso** de seats: “7 / 10 coaches en pack”.
- **Drawer o sheet** al hacer clic en fila: detalle mínimo (email contacto si permitido, fecha alta, alumnos activos count, última sesión agregada) — **no** reemplazar el perfil alumno del coach; eso sigue en `/coach/clients/[id]` para el coach.
- **Flujo invitar:** modal pasos cortos (email → rol → enviar); estado en tabla invitaciones con reenviar / revocar.

### 7.6 Qué es **distinto** para la empresa vs un coach común (mensaje de producto)

| Aspecto | Coach común (hoy) | Admin empresa (nuevo) |
|----------|-------------------|------------------------|
| Pagador | El mismo coach | La empresa (contrato / tarjeta org) |
| Objetivo del panel | Operar alumnos y programas | Operar **equipo** y **cumplimiento del pack** |
| Vista de datos | Solo su `coach_id` | **Agregada** cross-coaches de su org |
| Suscripción en UI | `/coach/subscription` | `/org/billing` (nombre ilustrativo) |
| Invitar colegas | No es flujo de producto | **Sí**, corazón del valor B2B |
| Marca hacia alumno | Su slug `/c/[slug]` | Sigue siendo **por coach** en MVP; la empresa no “reemplaza” slugs |
| Panel EVA plataforma | No lo ve | No lo ve (sigue siendo `/admin` solo staff EVA) |

### 7.7 Páginas / rutas **nuevas** (solo cuenta empresa)

Estas no existen para el coach retail hoy; serían el núcleo del modo empresarial:

| Ruta conceptual | Propósito |
|-----------------|-----------|
| `/org` o `/org/dashboard` | Resumen (7.4) |
| `/org/team` | Equipo + invitaciones (7.5) |
| `/org/usage` | Límites pack, tendencias agregadas |
| `/org/billing` | Plan org, renovación, historial de eventos de pago org |
| `/org/settings` | Datos de facturación, contacto, futura sede |
| `/org/invite/accept` (pública tokenizada) | Aceptar invitación y enlazar usuario existente o crear coach |

Opcional marketing (no es “dashboard” pero es nuevo): `/empresas` o ancla en landing/pricing.

### 7.8 Qué **sigue igual** (coach común o coach staff de empresa)

Todo el trabajo operativo diario permanece en las rutas ya documentadas en arquitectura:

- `/coach/dashboard`, `/coach/clients`, `/coach/clients/[clientId]`, `/coach/builder/[clientId]`, `/coach/workout-programs`, `/coach/nutrition-plans`, `/coach/foods`, `/coach/exercises`, `/coach/settings` (Mi Marca), `/coach/subscription` **solo si** el coach retail paga solo; bajo org cubierto, esa página puede redirigir o mostrar “Gestionado por [Org]” según producto.

**El alumno:** sin cambio de rutas: `/c/[coach_slug]/*` (login, dashboard, workout, nutrición, check-in, etc.).

**Auth genérico:** login/callback Supabase sigue igual; solo cambia **a dónde** redirige según rol (coach vs org admin).

### 7.9 Qué **reutilizar** del producto actual (sin reinventar)

| Activo actual | Cómo serviría al modo empresa |
|---------------|-------------------------------|
| **Patrón layout** `admin/(panel)` | Misma idea: sidebar + mobile tabs + tokens oscuros o claros — **no** copiar KPIs de plataforma; solo estructura y componentes base (`AdminKpiCard`-like renombrado a nivel diseño). |
| **Tablas densas + badges** (directorio coach, `CoachTable` CEO) | Lista de coaches en `/org/team` con estados y acciones masivas futuras. |
| **`GlassCard`, `InfoTooltip`, paginación** | Coherencia visual con el resto de EVA. |
| **Charts Recharts** | Gráficos de uso agregado en `/org/usage` cuando haya RPCs. |
| **Flujo “invitar por email”** (concepto similar a beta invites / registro) | Misma expectativa de usuario: email → token → cuenta. |
| **Estados de suscripción** (copy y semántica de grace) | Traducir a “cuenta empresa” en `/org/billing`. |
| **Rate limiting / Zod / server actions** | Mismos estándares de ingeniería; no es UI pero evita UX rota por errores. |

### 7.10 Qué **no** reutilizar tal cual (para no confundir)

| Activo | Por qué no |
|--------|------------|
| **`/admin/*` Panel CEO** | Es operación EVA, métricas de **toda** la base; el cliente empresa no debe verlo ni parecerse demasiado. |
| **`/coach/subscription` como única UI de pago org** | Mezcla dos mentalidades; el pack es de la **org**, no del coach staff. |
| **Perfil alumno 6 tabs** en vista org | Riesgo legal y de confianza; si se expone, debe ser decisión explícita post-MVP con permisos y audit log. |

### 7.11 Micro-UX para coach staff bajo org (sin nuevas páginas obligatorias)

- **Banner delgado** arriba del dashboard coach: “Tu acceso está incluido en el plan de **[Nombre Gym]**.” + link “Ver facturación” solo si el usuario también es org admin.
- **Settings coach:** deshabilitar o ocultar secciones de “cambiar plan” si `billing_source = org` para no frustrar (“Me pide pagar pero ya pagó el gym”).

### 7.12 Accesibilidad y móvil

- Mismas reglas AGENTS: `dvh`, safe areas, sin `h-screen` móvil en layouts nuevos; bottom nav con `pb-safe` como coach móvil.

---

## 8. Frontend Developer

### 8.1 Estructura de rutas sugerida

- `src/app/org/(panel)/...` con layout propio (similar patrón a `admin/(panel)` pero rol org, no CEO).
- Patrón de módulo: `page.tsx` RSC, `_data/*.queries.ts` con `React.cache`, `_actions`, `_components`.

### 8.2 Estado y datos

- Sin Redux/Zustand: `useTransition`, server actions; revalidación explícita tras invitar/revocar.
- No cambiar contratos de componentes coach compartidos salvo props opcionales (ej. `managedByOrg?: { name: string }`).

### 8.3 Feature detection

- Helpers tipo `getCoachWithOrgContext()` en servidor para decidir banner o nav; **default** si falla query org = modo retail.

---

## 9. Backend Developer (Supabase, RLS, acciones)

### 9.1 Esquema (evolutivo)

- `organizations`: id, nombre, estado suscripción, límites (seats, pool clientes), MP ids si aplica, fechas período, metadata JSON acotado.
- `coaches.organization_id` nullable FK; índice parcial para listados org.
- `organization_invites` o `organization_members`: org_id, email, role, token hash, expires_at, accepted_at, user_id.
- Consideración **email único plataforma:** invitar un email que ya es coach retail requiere regla producto (rechazar, merge, o “vincular cuenta existente”).

### 9.2 RLS (coexistencia)

- Políticas actuales: coach ve solo `coach_id = authCoach`.
- **Añadir** políticas para rol org admin: lectura agregada de coaches y métricas donde `organization_id` coincida y `auth.uid()` sea miembro admin (implementación vía join a `organization_members`).
- Principio: **no relajar** políticas existentes para usuarios sin rol org; nuevas políticas **aditivas** con `AND EXISTS (...)` membership.

### 9.3 RPCs y SELECT

- Nuevas funciones `get_org_*`: columnas explícitas; índices en `coaches(organization_id)`, `clients(coach_id)` ya alineados con patrones actuales.

### 9.4 Webhooks y server actions

- Ramificar por `external_reference` / metadata MP: tipo `coach` vs `org` para no pisar columnas incorrectas.
- Idempotencia y logs de auditoría (reutilizar patrón `admin_audit_logs` o tabla `org_audit_logs` si el volumen lo justifica).

---

## 10. DevOps Engineer

- Env vars: URLs de retorno MP para checkout org; flags opcionales `ENTERPRISE_ORG_BETA=true` en staging.
- Monitoreo: métricas separadas webhook org vs coach; alertas si tasa de error org > umbral.
- Scripts: provisioning org + attach coaches en staging; documentar en `scripts/` sin romper `create-coach-account` retail.
- Backups / restore: documentar que `organizations` es PII comercial agregada.

---

## 11. QA Engineer

### 11.1 Matriz obligatoria (no regresión)

| Caso | Esperado |
|------|----------|
| Coach nuevo retail | Flujo completo register → MP → dashboard |
| Coach `organization_id` null | Gate idéntico a baseline |
| Org activa, coach miembro | Acceso coach aunque sin MP propio |
| Org vencida | Bloqueo según política; mensajes claros |
| Invitación expirada / revocada | No acepta; estado UI correcto |
| Alumno `/c/[slug]` | Sin cambio permisos por fila client |
| Panel CEO | Sigue siendo plataforma; opcional fila “org” para soporte |

### 11.2 Automatización

- Extender tests RLS existentes ([`tests/rls/rls-tenant-isolation.test.ts`](tests/rls/rls-tenant-isolation.test.ts)) con escenarios org cuando exista JWT de miembro.
- Playwright: smoke org admin + coach miembro + login alumno en misma org multi-coach (dos slugs distintos).

---

## 12. Data Scientist / Data Analyst

- **Atribución MRR:** eventos `subscription_events` o tabla paralela `organization_subscription_events` para no mezclar semántica con filas coach retail.
- Dashboards CEO: tile “Cuentas B2B”, MRR org, coaches bajo org vs independientes.
- Funnels: demo B2B → org creada → primer coach activo → primer log alumno.

---

## 13. PMM (Product Marketing)

- Narrativa: “EVA para equipos” vs “EVA para coaches independientes”; pricing claro (pack + seat).
- Materiales: one-pager B2B, comparativa “3 cuentas sueltas vs pack”, FAQ cancelación a nivel org.
- SEO: página dedicada o ancla `/pricing#equipos` sin cannibalizar keywords coach solo.

---

## 14. Customer Success

- Runbook: alta org, invitación staff, qué hacer si coach deja el gym (desvincular vs desactivar cuenta).
- Comunicación a org admin sobre renovación y límites; plantillas email.
- Escalación P0: org pagó y coaches bloqueados por bug de gate → procedimiento y rollback.

---

## 15. Legal y privacidad (Chile / buenas prácticas)

- **Contrato B2B:** objeto del servicio, seats, uso aceptable, confidencialidad, terminación y exportación de datos.
- **Ley 19.628:** bases de tratamiento; si el admin org accede a datos de alumnos de coaches de su org, informar en política de privacidad y términos; minimización (preferir agregados en MVP).
- **Responsables vs encargados:** clarificar si el gym actúa como responsable frente a sus alumnos para ciertos datos.
- **Menores / salud:** sin cambio de sensibilidad; documentar límites de lo que el panel org puede ver.

---

## 16. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Complejidad RLS | Políticas aditivas; tests JWT; code review enfocado |
| MP un solo pagador | Metadata + external_reference; fallback manual CEO |
| Confusión retail vs org | UX separada; nunca mezclar wizard |
| Email duplicado invite | Regla explícita + copy en UI |
| Scope creep SSO | Fuera de MVP; documentar en roadmap |

---

## 17. Roadmap por olas (alineado a “dos bloques, pulir, testear”)

| Ola | Bloque A | Bloque B | Salida |
|-----|----------|----------|--------|
| 1 | Migración `organizations` + `coaches.organization_id` (nullable) + tipos | Precedencia gate/middleware **solo cuando org_id presente** + tests retail | Retail intacto |
| 2 | `organization_members` + invites + RLS aditivas | UI mínima `/org` lista + invitar | Flujo B2B cerrado en staging |
| 3 | Checkout MP org **o** activación manual documentada + webhook | Enforcement seats / pool + mensajes UX | Venta piloto posible |
| 4 | RPCs analytics + CEO dimensión org | Legal + pricing página + runbook CS | Go-to-market controlado |

---

## 18. Checklist pre-implementación (equipo)

- [ ] Decisión producto: pool global de alumnos vs suma de `max_clients` por coach bajo org.
- [ ] Decisión pagos: MP org en MVP sí/no; si no, proceso manual y columnas `organizations`.
- [ ] Copy legal revisado para acceso admin org.
- [ ] Naming estable: “Organización”, “Cuenta equipo”, “EVA Empresas” (evitar choque con tier `scale`).

---

## 19. Referencia cruzada documentación interna

Actualizar cuando exista implementación real:

- [nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md](nuevabibliadelaapp/04-NEGOCIO-Y-ESTRATEGIA.md) — sección “Modelo B2B” y fases B2B.
- [nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md](nuevabibliadelaapp/03-ARQUITECTURA-TECNICA.md) — diagrama de datos y middleware.
- [AGENTS.md](AGENTS.md) — patrones `_data/_actions`, sin nuevas libs de estado, Zod v4, `revalidatePath`.

---

*Fin del plan ampliado (incl. sección 7 — dashboard empresarial, rutas nuevas vs reutilización). Siguiente paso acordado con el equipo: implementar por olas; no modificar código hasta aprobación explícita de alcance MVP (olas 1–2).*
