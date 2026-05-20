# Handoff Claude AI - EVA Enterprise / Movida

Fecha: 2026-05-20  
Rama: `v2/enterprise`  
Contexto: Supabase local con Docker, pruebas locales en esta rama.

## Objetivo

Continuar el flujo Enterprise de EVA sin romper el flujo standalone que ya se usa en produccion.

EVA ahora debe soportar dos modelos:

- Standalone: coach independiente paga EVA, gestiona marca, billing y alumnos.
- Enterprise: empresa/gym paga EVA, crea coaches internos, controla alumnos, marca, seats y asignaciones.

El identificador publico nuevo para alumnos es `coaches.invite_code`. `coaches.slug` queda como fallback legacy.

## Implementado En Este Commit

- Redirect inteligente post-login:
  - owner/admin enterprise -> `/org/[slug]`
  - coach enterprise -> `/coach/dashboard`
  - coach standalone -> `/coach/dashboard`
  - alumno -> su app alumno
- Fix de `/org/movida`:
  - `getOrgBySlug()` ahora usa `.is('deleted_at', null)` para evitar loop/render infinito.
- Sidebar coach enterprise:
  - oculta `Mi Marca`
  - oculta `Suscripcion`
  - muestra contexto `Gestionado por [Empresa]`
  - muestra link `Panel empresa` solo si aplica.
- Panel `/org/[slug]/coaches`:
  - accion primaria: `Crear coach enterprise`
  - accion secundaria: `Vincular coach existente`
  - tabla con rol, estado, alumnos asignados, codigo publico y acciones.
- Server action `createEnterpriseCoachAction()`:
  - crea usuario Supabase Auth con service role
  - crea row en `coaches`
  - setea `subscription_status = 'org_managed'`
  - setea `active_org_id`
  - genera `invite_code` unico
  - crea membership en `organization_members`
  - registra audit log `create_enterprise_coach`
  - devuelve password temporal y codigo publico.
- Acciones enterprise adicionales:
  - resetear password temporal
  - convertir coach/admin
  - vincular coach existente como flujo secundario.
- `invite_code`:
  - helper de generacion y validacion
  - helper server-side de unicidad contra DB
  - tests unitarios.
- Nuevos registros standalone y beta:
  - ahora nacen con `invite_code`.
- Coaches existentes sin codigo:
  - al entrar a `/coach/*`, se genera codigo automaticamente
  - aparece modal bloqueante
  - no se puede cerrar sin confirmar
  - slug viejo sigue funcionando como fallback.
- URLs nuevas de alumno:
  - emails/UI usan `/c/[invite_code]/login`
  - rutas legacy `/c/[slug]` se mantienen.
- Panel `/org/[slug]/clients`:
  - tabs basicos: todos, sin asignar, inactivos.
- Demo Movida:
  - docs y SQL local en `docs/ENTERPRISE_DEMO_AND_ROADMAP.md`
  - `docs/MOVIDA_LOCAL_DEMO.sql`
  - logo en `apps/web/public/logomovida.png`.

## Validacion Ejecutada

Pasaron:

```bash
npm run typecheck -w @eva/web
npx vitest run apps/web/src/lib/coach/invite-code.test.ts apps/web/src/lib/auth/post-login-redirect.test.ts apps/web/src/lib/coach-subscription-gate.test.ts
npm run build -w @eva/web
```

Build OK. Warning conocido de Next 16:

```text
The "middleware" file convention is deprecated. Please use "proxy" instead.
```

No migrar a `proxy` todavia salvo que se planifique aparte.

## Cuentas Demo Local

Password comun:

```text
TestPass123!
```

Owner/admin Movida:

```text
coach-owner-a@eva-test.cl
```

Coach enterprise demo:

```text
coach-member-a1@eva-test.cl
```

Alumno demo:

```text
client-a1@eva-test.cl
```

Rutas clave:

```text
/login
/org/movida
/org/movida/coaches
/org/movida/clients
/coach/dashboard
/c/[invite_code]/login
```

## Archivos Clave

- `apps/web/src/app/org/[slug]/_actions/org.actions.ts`
- `apps/web/src/app/org/[slug]/coaches/page.tsx`
- `apps/web/src/app/org/[slug]/coaches/_components/CreateEnterpriseCoachForm.tsx`
- `apps/web/src/app/org/[slug]/coaches/_components/CoachEnterpriseActions.tsx`
- `apps/web/src/app/coach/layout.tsx`
- `apps/web/src/app/coach/_components/PublicCodeRequiredModal.tsx`
- `apps/web/src/app/coach/_data/public-code.queries.ts`
- `apps/web/src/lib/coach/invite-code.ts`
- `apps/web/src/lib/coach/invite-code.server.ts`
- `apps/web/src/lib/auth/post-login-redirect.ts`
- `apps/web/src/lib/auth/post-login-redirect.server.ts`
- `apps/web/src/components/coach/CoachSidebar.tsx`

## Pendientes Recomendados

1. Crear migracion formal para reforzar DB:
   - constraint/pattern de `invite_code`
   - indice unico case-safe
   - RPC transaccional opcional para generar codigo.
2. Mejorar create enterprise coach:
   - email real de onboarding/reset
   - opcion magic link en vez de password temporal visible.
3. Completar panel enterprise:
   - reasignacion individual desde tabla
   - bulk reassign
   - suspender coach
   - reportes/adherencia/health score.
4. RLS/audit:
   - revisar politicas cross-org para `coach_client_assignments`
   - ampliar audit logs para reasignacion, suspension, branding.
5. Playwright:
   - owner login -> `/org/movida`
   - owner crea coach enterprise
   - coach enterprise no ve billing/marca
   - alumno entra por `/c/[invite_code]/login`
   - `/c/[slug]` legacy sigue funcionando.
6. UX:
   - copiar credenciales con mejor feedback
   - mejorar estado vacio de coaches/clientes
   - bloquear creacion si seats llenos con CTA comercial.

## Notas Importantes

- No convertir coaches standalone a enterprise automaticamente.
- No eliminar `coaches.slug`.
- No cambiar `/register`: sigue siendo solo standalone.
- No implementar fintech alumno-final. Billing MVP: empresa paga a EVA.
- No usar Redux/Zustand/SWR/React Query.
- Seguir patron App Router + RSC + Server Actions + Zod v4.
- `supabase/.temp/cli-latest` es estado local; no incluir en commits.
