# EVA Enterprise — Matrices de Referencia

**Fecha:** 2026-06-01
**Estado:** Entregable de documentación del Plan C. Cierra los ítems de matrices/inventario/legal que no requieren código.
**Fuente de verdad código:** `domain/org/permissions.ts`, `services/auth/workspace-permissions.service.ts`, `services/auth/workspace-brand.service.ts`.

---

## 1. Matriz de Permisos por Workspace

Dos capas de permisos coexisten:

### 1A. Workspace-level (`WorkspacePermission` — qué superficie ve la persona)

| Workspace type | Permisos | Billing propio | Marca propia |
|---|---|---|---|
| `coach_standalone` | coach.dashboard.view, coach.clients.manage, coach.brand.manage, coach.billing.view | ✅ | ✅ |
| `enterprise_coach` | coach.dashboard.view, coach.clients.manage | ❌ (org) | ❌ (org) |
| `enterprise_staff` | org.dashboard.view, org.team.manage, org.brand.manage, org.audit.view, org.billing.view | ❌ (org manual) | ✅ (org) |
| `student_standalone` | student.dashboard.view | — | hereda coach |
| `student_enterprise` | student.dashboard.view | — | hereda org |

`canViewBilling(workspace)` → solo `coach_standalone`.

### 1B. Org-role-level (`OrgPermission` — qué hace el staff dentro de `/org/*`)

| Permiso | owner | admin | ops | analyst | brand_manager |
|---|---|---|---|---|---|
| org.dashboard.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| org.coaches.view | ✅ | ✅ | ✅ | ✅ | — |
| org.coaches.invite/suspend | ✅ | ✅ | ✅ | — | — |
| org.clients.view | ✅ | ✅ | ✅ | ✅ | — |
| org.clients.assign/archive | ✅ | ✅ | ✅ | — | — |
| org.payments.view | ✅ | ✅ | ✅ | ✅ | — |
| org.payments.edit/export | ✅ | ✅ | — | — | — |
| org.reports.view/export | ✅ | ✅ | ✅ | ✅ | — |
| org.brand.view/edit | ✅ | ✅ | — | — | ✅ |
| org.brand.publish | ✅ | — | — | — | ✅ |
| org.team.view | ✅ | ✅ | ✅ | — | — |
| org.team.invite | ✅ | ✅ | — | — | — |
| org.team.modify | ✅ | — | — | — | — |
| org.audit.view | ✅ | ✅ | ✅ | ✅ | — |
| org.audit.export | ✅ | — | — | — | — |
| org.settings.view | ✅ | ✅ | ✅ | — | ✅ |
| org.settings.edit | ✅ | — | — | — | — |

Enforcement: route guards server-side en cada page (`if (!orgRoleCan(org.myRole, 'org.X.view')) redirect`). Verificado por `tests/enterprise/multi-role-access.spec.ts` (18 tests).

---

## 2. Matriz de Branding por Workspace

`resolveBrandForWorkspace(activeWorkspace)` decide la marca visible. Prioridad:

| Contexto | Marca aplicada | Fuente |
|---|---|---|
| enterprise_staff | Organización | `organizations.logo_url/primary_color/name` |
| enterprise_coach | Organización | org (coach individual subordinado) |
| student_enterprise (`client.org_id` set) | Organización | org — gana siempre sobre coach |
| coach_standalone | Coach | `coaches.brand_name/primary_color/logo_url` |
| student_standalone (`org_id` null) | Coach | coach asignado |
| sin marca | EVA default | `SYSTEM_PRIMARY_COLOR #007AFF` / `BRAND_PRIMARY_COLOR #10B981` |

Regla madre: si `client.org_id` existe, branding enterprise gana. Verificado en `rls-isolation.spec.ts` (branding workspace tests).

Publicación: `publishEnterpriseBrandAction` promueve `brand_draft` → live → sincroniza `coaches` enterprise activos. Estado: draft/published vía `organizations.brand_draft` (jsonb) + `brand_published_at`. Versionado/rollback avanzado (tabla de historial) = post-MVP.

---

## 3. Lista de Rutas Enterprise (web)

| Ruta | Guard (permiso) | Estado |
|---|---|---|
| `/org/[slug]` | org.dashboard.view | ✅ role home por rol |
| `/org/[slug]/clients` | org.clients.view | ✅ + detail sheet, bulk actions |
| `/org/[slug]/assignments` | org.clients.view | ✅ cockpit + autopilot |
| `/org/[slug]/payments` | org.payments.view | ✅ ledger + export CSV |
| `/org/[slug]/coaches` | org.coaches.view | ✅ + detalle `[coachId]` |
| `/org/[slug]/team` | org.team.view | ✅ CRUD staff |
| `/org/[slug]/brand` | org.brand.view | ✅ + mobile tabs |
| `/org/[slug]/announcements` | org.coaches.invite (admin) | ✅ + scheduling |
| `/org/[slug]/nutrition` | org.coaches.invite (admin) | ✅ + planes activos |
| `/org/[slug]/programs` | org.dashboard.view | ✅ overview + org templates |
| `/org/[slug]/check-ins` | org.dashboard.view | ✅ participación + streaks |
| `/org/[slug]/reports` | org.reports.view | ✅ + PDF + period toggle |
| `/org/[slug]/trust` | (staff) | ✅ + Ley 21.719 checklist |
| `/org/[slug]/proof` | org.dashboard.view | ✅ proof pack + PDF |
| `/org/[slug]/audit` | org.audit.view | ✅ filtros + export |
| `/org/[slug]/settings` | (staff) | ✅ accordion + capacity config |
| `/org/[slug]/onboarding` | (staff) | ✅ progress tracker |
| `/org/[slug]/setup-mfa` | requires_mfa_setup | ✅ |
| `/org/[slug]/setup-password` | requires_password_change | ✅ first-login |
| `/org/login` | público | ✅ staff login aislado |

---

## 4. Contratos Compartibles Mobile (RN futuro)

DTOs/schemas que deben vivir en `packages/schemas` / `packages/types` antes de la app RN:

- `ActiveWorkspace`, `WorkspaceSummary`, `WorkspaceBrand` (auth/workspace)
- `OrgClient`, `OrgMember`, `OrgClientPayment` (org entities)
- `OrgCheckInOverview`, `OrgWorkoutProgramOverview`, `CoachStreak` (dashboards)
- `OrgPermission` + `orgRoleCan()` (RBAC portable)
- `CreateEnterpriseCoachSchema`, `UpdateOrgSchema`, `EnterpriseCoachLoginSchema` (forms)
- payment status / due-date DTO, assignment/capacity DTO, brand draft/published DTO

Regla: RN consume los mismos DTOs, no reimplementa lógica. Matriz mobile parity por menú ya documentada en plan principal (sección responsive).

---

## 5. Data Inventory (Ley 21.719)

| Tabla | Campos personales/sensibles | Categoría | Responsable |
|---|---|---|---|
| `auth.users` | email, teléfono | Identificación | EVA (procesador) |
| `clients` | full_name, email, phone, goal_weight | Identificación | Empresa (responsable) / coach |
| `check_ins` | weight, energy_level, front/back_photo_url | **Salud + biométrico** | Empresa / coach |
| `workout_logs` | rendimiento físico | Salud | Empresa / coach |
| `nutrition_meal_logs`, `daily_nutrition_logs` | ingesta alimentaria | Salud | Empresa / coach |
| `client_payments` | monto, estado, método | Financiero (operacional) | Empresa |
| `org_audit_logs` | actor_id, IP/user agent | Trazabilidad | EVA + Empresa |
| `push_subscriptions` | endpoint device | Técnico | EVA |

Datos de mayor cuidado: fotos de progreso (`check_ins.*_photo_url`) y biométricos (peso/medidas). Bucket `checkins` es `public=true` con RLS por path — **migrar a privado + signed URLs antes de vender salud avanzada** (deuda registrada).

---

## 6. Retention / Export / Delete (borrador de política)

- **Retención:** datos de alumno activos mientras la membresía exista. Tras baja: 12 meses de retención operacional, luego anonimización.
- **Export (portabilidad):** alumno puede solicitar export de sus datos (workouts, nutrición, check-ins, pagos) vía owner enterprise. CSV/JSON. Pendiente endpoint dedicado.
- **Delete (borrado):** revocar membresía NO borra; borrado duro requiere solicitud explícita + ventana. `auth.users` y standalone se preservan.
- **Derechos ARCO:** Acceso (dashboard), Rectificación (editar perfil), Cancelación (solicitud a owner), Oposición (opt-out analytics PostHog ya existe vía CookieConsent).

---

## 7. Responsable de Datos por Contexto (TOS enterprise — borrador)

- **Standalone:** coach es responsable; EVA es procesador.
- **Enterprise:** la **empresa (organización) es responsable** de datos de sus alumnos y coaches; EVA es procesador/encargado. Coach enterprise opera bajo mandato de la empresa.
- **Plataforma:** EVA responsable de datos de cuenta (email, auth) y trazabilidad técnica.

Pendiente legal formal: redactar TOS enterprise con esta distinción + DPA (Data Processing Agreement) antes de primer cliente de pago. Checklist operativo en `/org/[slug]/trust`.

---

> Este documento cierra los entregables de documentación del Plan C (matrices de permisos/branding, lista de rutas, contratos mobile, data inventory, retention, responsable de datos). Los ítems legales formales (TOS/DPA redactados por abogado) y los que requieren deploy (runbook migraciones prod) quedan para la fase post-implementación.
