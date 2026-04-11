# Sprint 6 - Revenue Fast (Cierre)

Fecha: 2026-04-10

## Objetivo
Acelerar activacion y conversion temprana con alcance minimo viable para founder solo.

## Entregables completados

### 1) Dashboard coach P0 (`ENG-035`, `ENG-038`, `ENG-041`)
- Refactor de carga de datos a patron `_data/_components`:
  - `src/app/coach/dashboard/_data/dashboard.queries.ts`
  - `src/app/coach/dashboard/_components/DashboardContent.tsx`
  - `src/app/coach/dashboard/page.tsx`
- Alertas top 5 alumnos en riesgo usando `attentionScore` (de `DashboardService`).
- Quick actions visibles en header de dashboard:
  - Registrar alumno
  - Programas
  - Nutricion

### 2) Branding MVP (`ENG-045`, `ENG-047`, `ENG-050` minimo)
- Nuevo campo `welcome_message` en `coaches`:
  - `supabase/migrations/20260412100000_sprint6_welcome_message.sql`
  - `src/lib/database.types.ts`
- Configuracion en "Mi Marca":
  - `src/app/coach/settings/BrandSettingsForm.tsx`
  - `src/app/coach/settings/actions.ts`
  - `src/app/coach/settings/page.tsx`
- Aplicacion en experiencia alumno:
  - `src/app/c/[coach_slug]/login/page.tsx`
  - `src/app/c/[coach_slug]/dashboard/_components/DashboardHeader.tsx`
  - `src/app/c/[coach_slug]/dashboard/page.tsx`
  - `src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`

### 3) Email transaccional (`ENG-071`, `ENG-072`, `ENG-074`)
- Plantillas transaccionales:
  - `src/lib/email/transactional-templates.ts`
- Hook de bienvenida al crear alumno:
  - `src/app/coach/clients/actions.ts`
- Hook de aviso al asignar programa:
  - `src/app/coach/builder/[clientId]/actions.ts`
- Evidencia y smoke operativo:
  - `docs/RET-003-TRANSACTIONAL-EMAILS-SMOKE.md`

## QA y smoke
- `npm run lint` (sin errores bloqueantes)
- `npm run typecheck` (ok)
- `npx vitest run` (ok)
- `npx playwright test` (4 passed, 2 skipped)

## Pendientes manuales en produccion
1. Ejecutar migracion de `welcome_message`.
2. Confirmar en Vercel:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `NEXT_PUBLIC_SITE_URL` (o `NEXT_PUBLIC_APP_URL`)
3. Ejecutar smoke manual de emails (ver `docs/RET-003-TRANSACTIONAL-EMAILS-SMOKE.md`).

## Backlog priorizado Sprint 7
1. Completar dashboard avanzado (`ENG-037`, `ENG-039`, `ENG-042`, `ENG-043`, `ENG-044`).
2. Extender branding avanzado (colores secundarios/tipografia de `ENG-050` completo).
3. Notificaciones adicionales (`ENG-073`, `ENG-075`, `ENG-076`).
4. Mejoras de workout/check-in de Epic 2.3/2.4.
5. In-app/push notifications (`ENG-077`, `ENG-078`, `ENG-079`) solo tras validar traccion.
