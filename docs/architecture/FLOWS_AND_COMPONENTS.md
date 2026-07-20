---
status: active
owner: engineering
last_verified: 2026-07-20
canonical: true
---

# Flows and components

Este mapa describe recorridos estables y sus boundaries. No es una bitácora de componentes ni una lista exhaustiva de rutas.

## Zonas del producto

| Zona | Actor | Entrada web | Entrada nativa |
|---|---|---|---|
| Público/auth | Visitante, coach | `/`, `/pricing`, `/(auth)/*` | `app/(auth)/*` |
| Coach | Coach standalone, Team o Enterprise | `/coach/*` | `app/coach/*` |
| Alumno standalone | Alumno de coach | `/c/[coach_slug]/*` | `app/alumno/*` |
| Alumno Team | Alumno del pool | `/t/[team_slug]/*` | `app/alumno/*` |
| Alumno Enterprise | Alumno de organización | `/e/[org_slug]/*` | `app/alumno/*` |
| Enterprise staff | Owner/admin/staff | `/org/[slug]/*` | No aplica al panel |
| EVA admin | Operaciones internas | `/admin/*` | No aplica |

## Flujo transversal: sesión y workspace

1. Supabase Auth autentica la identidad.
2. La aplicación descubre todos sus contextos válidos.
3. `workspace.service.ts` resuelve el workspace preferido en web; `apps/mobile/lib/workspace.ts` hace lo equivalente en native.
4. Si hay más de un contexto, el usuario puede elegirlo en `/workspace/select` o en el switcher móvil.
5. Toda query/mutación deriva scope de la sesión y el workspace activo.
6. RLS limita el máximo acceso posible aunque la UI o un filtro fallen.

Tipos de workspace: coach standalone, coach Team, coach/staff Enterprise y alumno standalone/Team/Enterprise.

Archivos principales:

- `apps/web/src/services/auth/workspace.service.ts`
- `apps/web/src/services/auth/workspace-permissions.service.ts`
- `apps/web/src/app/workspace/select/`
- `apps/mobile/lib/workspace.ts`
- `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx`

El identificador recibido desde el navegador o móvil nunca autoriza por sí solo. El servidor vuelve a validar membership, rol y ownership.

## Coach crea y gestiona un alumno

```text
Directorio → formulario validado → Server Action/API → scope activo
           → service/repository → clients + client_memberships → RLS
```

| Etapa | Web | Mobile / backend |
|---|---|---|
| Directorio y ficha | `apps/web/src/app/coach/clients/` | `apps/mobile/app/coach/(tabs)/clientes.tsx`, `coach/cliente/[clientId].tsx` |
| Crear/editar/archivar | `_actions/clients.actions.ts` | `apps/web/src/app/api/mobile/coach/clients/` |
| Caso de uso | `apps/web/src/services/client/` | API delega y revalida mutaciones sensibles |
| Persistencia | `apps/web/src/infrastructure/db/client.repository.ts` y membership repository | Supabase bajo RLS |
| Importación | `/coach/clients/import` | endpoint mobile `clients/import` |

Crear una fila `clients` sin el membership/scope correspondiente deja un estado incompleto. Los tres contextos deben conservarse separados.

## Coach crea y asigna un programa

1. Coach abre un programa asignado o una plantilla.
2. El builder maneja días, fases, bloques, áreas, superseries y objetivos tipados.
3. El payload se valida con `@eva/schemas`.
4. `workout.service.ts` persiste o reconcilia el árbol programa → planes → bloques.
5. La asignación copia/reconcilia por alumno y conserva identidad/historial cuando corresponde.
6. Las notificaciones de asignación se envían server-side e idempotentemente.

| Capa | Web | Mobile / compartido |
|---|---|---|
| UI | `/coach/builder/[clientId]`, `/coach/workout-programs/builder` | `app/coach/program-builder.tsx` |
| Estado builder | `hooks/usePlanBuilder.ts` | `lib/plan-builder/*` |
| Contrato | `@eva/schemas` | `@eva/plan-builder`, `@eva/workout-engine` |
| Mutación | `_actions/builder.actions.ts` | Supabase bajo RLS + API de notificación |
| Caso de uso | `services/workout/workout.service.ts` | reconcile portable en `@eva/workout-engine` |

Scope permitido: standalone, Team o Enterprise activo. Un draft y su conflicto optimista pertenecen al programa/workspace que los originó.

## Alumno ejecuta un entrenamiento

```text
Dashboard → rutina del día → Executor → log optimista/offline
          → validación + RLS → workout_logs → resumen/PR/historial
```

| Etapa | Web/PWA | Mobile |
|---|---|---|
| Entrada | `/c/[coach_slug]/dashboard` y `/workout/[planId]` | `app/alumno/(tabs)/workout.tsx`, `alumno/workout/[planId].tsx` |
| Lectura | `_data/workout-execution.queries.ts` | `lib/workout-session.ts` |
| Ejecución | `WorkoutExecutionClient.tsx` | `components/alumno/workout/ExecutorV2.tsx` |
| Registro | `_actions/workout-log.actions.ts` | cola/offline y Supabase con RLS |
| UI portable | lista/paso a paso, keypad, timers, superseries, sustitución | mismos conceptos con controles native |
| Cierre | `WorkoutSummaryOverlay.tsx` | overlay/resumen native |

Los motores de objetivos, intervalos y reconciliación viven en `@eva/workout-engine`. La UI no recalcula reglas de dominio con fórmulas propias.

## Nutrition V2: coach prescribe

1. El gate server-side valida rollout, entitlement y scope.
2. El hub carga alumnos y planes del workspace activo.
3. El coach crea o edita un draft versionado.
4. Publicar valida el draft completo y detecta conflictos.
5. La versión publicada alimenta read models; la historia anterior permanece congelada.
6. El coach puede asignar el plan a otros alumnos dentro del mismo scope autorizado.

| Capa | Web | Mobile / compartido |
|---|---|---|
| Hub | `/coach/nutrition-v2` | `app/coach/nutrition-v2/index.tsx` |
| Detalle/quick edit | `/coach/nutrition-v2/[clientId]` | `app/coach/nutrition-v2/[clientId].tsx` |
| Builder | `/coach/nutrition-v2/[clientId]/builder` | `app/coach/nutrition-v2/builder/[clientId].tsx` |
| Persistencia web | `_actions/plan-persistence.ts` | API Nutrition V2 para operaciones server-authoritative |
| Contratos/read models | `@eva/nutrition-v2` | `@eva/nutrition-v2` |
| Autorización | `nutrition-v2-rollout.service.ts`, RPCs scoped | `app/api/mobile/nutrition-v2/*` |

Nutrition V1 permanece como fallback/compatibilidad. No mezclar tablas o actions V1/V2 en un recorrido nuevo sin una estrategia explícita de conversión.

## Nutrition V2: alumno registra

```text
Hoy/Plan/Historial → read model versionado → intake idempotente
                    → RPC autorizada → snapshot histórico → reconciliación UI
```

| Etapa | Web/PWA | Mobile |
|---|---|---|
| Entrada | `/c/[coach_slug]/nutrition-v2` | `app/alumno/(tabs)/nutrition-v2/index.tsx` |
| Catálogo/alta | `/nutrition-v2/scanner`, `/nutrition/add` | scanner y `add-food-v2.tsx` |
| Experiencia diaria | `TodayExperience.tsx` | componentes `alumno/nutrition-v2/*` |
| Mutación | `_actions/intake.actions.ts` | `lib/nutrition-v2-intake*.ts`, cola offline |
| Backend nativo | Server Action/RPC | `app/api/mobile/nutrition-v2/intake` y `catalog` |

Cada consumo conserva snapshot de cantidad y nutrientes. Las idempotency keys evitan duplicados por retry; un estado optimista debe reconciliarse o revertirse según la respuesta autoritativa.

## Check-in y progreso

1. Alumno registra peso, energía, notas y fotografías.
2. Las imágenes se suben al bucket autorizado.
3. La mutación crea el check-in bajo RLS.
4. Coach consulta la ficha y puede marcarlo revisado.
5. Gráficos y analítica combinan check-ins, logs y mediciones autorizadas.

| Web/PWA | Mobile | Backend |
|---|---|---|
| `/c/[coach_slug]/check-in` | `app/alumno/(tabs)/check-in.tsx` | `_actions/check-in.actions.ts`, API mobile de fotos/review |
| `/coach/clients/[clientId]` | `app/coach/cliente/[clientId].tsx` | `services/client/client-detail.service.ts` |
| `/coach/clients/[clientId]/bodycomp` | coach/alumno `bodycomp` | `services/bodycomp`, endpoints mobile bodycomp |

Composición corporal y movimiento requieren consentimiento, entitlement y guards adicionales; no se habilitan solo porque exista la pantalla.

## Marca por workspace

```text
Sesión → workspace → brand resolver → tokens/preset → layout, loader y assets
```

| Contexto | Edición | Resolución |
|---|---|---|
| Standalone | `/coach/settings/brand` | coach + gate de tier |
| Team | `/coach/team` | marca del Team |
| Enterprise | `/org/[slug]/brand` | draft/publicación de la organización |

Archivos centrales: `services/auth/workspace-brand.service.ts`, `@eva/brand-kit` y `@eva/tiers`. La marca EVA/sistema es el fallback fail-closed.

## Suscripción standalone

1. Coach elige tier/ciclo en `/coach/subscription`.
2. `api/payments/create-preference` valida identidad, transición y monto canónico de `@eva/tiers`.
3. El provider abre checkout MercadoPago o, cuando está habilitado, enrolamiento Flow/Webpay.
4. Webhook firmado reconsulta/normaliza el evento y ejecuta el pipeline idempotente.
5. La suscripción actualizada gobierna acceso, cupo y branding.
6. Crons reconcilian drift, vencimientos y eventos terminales perdidos.

Implementación: `apps/web/src/lib/payments/`, `apps/web/src/app/api/payments/` y `apps/web/src/services/billing/`.

Enterprise no usa este flujo como self-service: mantiene contrato y registros propios. Teams tampoco debe mutar la suscripción standalone de un miembro para representar el entitlement del pool.

## Team

1. Coach crea o entra a un Team.
2. `workspace.service.ts` lo expone como workspace independiente.
3. Owner/manager administra miembros, cupos, marca y módulos en `/coach/team`.
4. Coaches operan el mismo pool de alumnos desde `/coach/*`.
5. Alumnos ingresan por `/t/[team_slug]`.

Código principal: `apps/web/src/app/coach/team/`, `services/team/`, `services/auth/team.service.ts` y endpoints `api/mobile/team/*`.

El pool es plano. No reutilizar `organizations` ni permisos Enterprise para implementar Teams.

## Enterprise

```text
Org login/MFA → rol staff → org guard → feature action
              → org service/repository → RLS + audit event
```

`/org/[slug]` incluye dashboard, coaches, clientes, asignaciones, programas, nutrición, check-ins, marca, equipo staff, pagos, reportes y auditoría. Las acciones sensibles validan permisos granulares definidos en `domain/org/permissions.ts`.

Código principal:

- `apps/web/src/app/org/[slug]/`
- `apps/web/src/services/org/org.service.ts`
- `apps/web/src/infrastructure/db/org.repository.ts`
- `apps/web/src/domain/org/permissions.ts`

El alumno Enterprise usa `/e/[org_slug]`; no debe caer en rutas `/c` o `/t` para resolver su tenant.

## Administración EVA

`/admin/*` permite operar coaches, alumnos, Teams, organizaciones, finanzas, cupones, novedades, auditoría y sistema. Estas rutas usan identidad admin y operaciones server-side; nunca exponerlas como capacidad de coach o mediante el cliente nativo.

## Mantenimiento del mapa

Actualizar este archivo cuando cambie un recorrido principal, el boundary de autorización, el sistema de persistencia o la relación web/mobile. No agregar detalles de una incidencia puntual, un commit, una campaña de QA o un componente puramente presentacional.
