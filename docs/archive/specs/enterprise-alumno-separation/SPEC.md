# SPEC — Separación total del flujo de alumno Enterprise vs Standalone

> Estado: DRAFT. Feature nueva (no bugfix) → requiere SPEC/PLAN/TASKS antes de implementar (regla SDD, CLAUDE.md). Se aborda DESPUÉS de estabilizar Fases 0-4 + B-7/B-9/B-10/B-11 (todas ya implementadas).

## Contexto / problema

Hoy el alumno enterprise y el standalone **comparten todo el flujo**: el mismo login (`/c/[coach_slug]/login`), las mismas rutas `/c/[coach_slug]/*`, las mismas cookies (`.eva-app.cl`) y el mismo JWT (sin claim de tipo). Lo único que los separa es `clients.org_id`. Síntoma observado en pruebas: un alumno **creado en enterprise** se ve y entra como si fuera standalone (misma app; si la org no tiene marca cargada cae a genérico). El dueño quiere **separar de todas las formas** ambos mundos, con **logins distintos**.

Branding org + announcements ya están guardados por `client.org_id` (proxy.ts / dashboard.queries). La separación pendiente es de **identidad/área/login**, no de datos (los datos ya están aislados por RLS — Fases 2B/2C verificadas).

## User stories

- US1: Como alumno **enterprise**, quiero un **login/área propia de la organización** (no el del coach standalone) para entrar con la identidad de mi gimnasio.
- US2: Como **dueño/staff de la org**, quiero que los alumnos enterprise se creen **solo** por flujos org (org-admin / roles con permiso / app EVA enterprise RN / menú org-linked del coach enterprise) — nunca por el `invite_code` standalone del coach. (Ya garantizado por B-7: el `invite_code` standalone crea standalone; el `organization_members.invite_code` crea enterprise.)
- US3: Como **persona que es alumno en ambos mundos** (standalone + enterprise) — modelo **híbrido por email** (decisión #6): por defecto áreas/logins separados; si la misma cuenta pertenece a ambos, un **selector de workspace de alumno** al entrar (espejo del coach).
- US4: Como **alumno huérfano** (su coach salió de la org), ver marca EVA + banner "Habla con [org] para que te asignen un coach" (ya implementado en B-9).

## Diseño propuesto (a validar)

### Área/login dedicado
- Ruta nueva `/e/[org_slug]/login` (o bajo `enterprise.eva-app.cl`), separada de `/c/[coach_slug]`. Cookies scoped al área enterprise (no compartidas con standalone). Branding = org.
- El alumno enterprise, tras login, entra a `/e/[org_slug]/*` (dashboard/workout/nutrition/check-in) — RSC que reusan los mismos componentes de `/c/*` pero con resolución de marca/contexto org.
- Reuso máximo: extraer los componentes de `/c/[coach_slug]/*` a componentes compartidos y montarlos en ambas áreas; evitar duplicar lógica de auth con condicionales — **lógica paralela** por área.

### Modelo de doble pertenencia (US3 — híbrido por email)
- La fila `clients` actual (`id = auth.uid`) solo soporta **XOR** (enterprise o standalone, no ambos en una cuenta). Para "ambos" hay dos opciones:
  - **(A) Junction `client_memberships`** (account ↔ {standalone coach | org}) — permite una cuenta en varios contextos; el selector lista las membresías. Cambio de schema mayor.
  - **(B) Cuentas separadas** por área (mismo email permitido en cada área) — sin junction; sin selector in-session.
- **Decisión #6 = híbrido:** por defecto (B) cuentas/áreas separadas; si la misma cuenta tiene membresías en ambos mundos → mostrar selector (requiere (A) para representar la doble pertenencia). Resolver en PLAN: ¿junction nuevo o puente mínimo?
- Reusar `resolvePreferredWorkspace` / `workspace_preferences` (ya existen para coaches) para el selector de alumno.

### Creación enterprise (ya parcialmente hecho)
- B-7: `organization_members.invite_code` → join enterprise (`org_id` set + assignment). `invite_code` standalone → standalone.
- B-10: email de accesos al crear/resetear alumno org.
- Pendiente: menú "Agregar alumno a la organización" en el dashboard del coach enterprise (crea cliente org-linked), gated por membresía.

### Forks a cuidar (⚠️ riesgo de romper standalone)
- `clientLoginAction` (`c/[coach_slug]/login/_actions/login.actions.ts`): hoy detecta enterprise vs standalone por `org_id`. Al separar área, mantener el flujo standalone intacto y crear el enterprise en paralelo.
- Verificación de cliente en `proxy.ts` (rama `/c/*`): no romper la resolución actual; agregar rama `/e/*`.
- Reset password (`/forgot-password?coach_slug=` → variante `?org_slug=`).
- Constraint email: `clients_org_email_unique (org_id, email)` (enterprise) vs unicidad global standalone.
- `workspace_preferences` para el selector de alumno.

### Mobile
- El alumno mobile hoy no aplica branding org ni distingue contexto. El PLAN define si el alumno enterprise entra por la futura app **EVA enterprise RN** (para staff no-coach) o por selección de contexto en la app actual. No bloquear esta fase con mobile; documentar.

## Out of scope (de este SPEC)
- Migración de los alumnos enterprise existentes a la nueva área (se define en PLAN con estrategia de transición sin romper sesiones).

## Acceptance criteria (alto nivel)
- AC1: Alumno standalone entra por `/c/[coach_slug]/login` y NO ve nada enterprise (sin regresión).
- AC2: Alumno enterprise entra por el área/login enterprise, con marca org.
- AC3: `invite_code` standalone jamás crea enterprise; código enterprise jamás crea standalone (B-7, ya verificado).
- AC4: Cuenta en ambos mundos → selector; sin mezcla de datos entre áreas en la sesión.
- AC5: Cookies de enterprise alumno no compartidas con standalone.

## Siguiente paso
Escribir `PLAN.md` (arquitectura de rutas/cookies + decisión junction vs cuentas separadas + estrategia de migración) y `TASKS.md` (tareas atómicas + DoD). No implementar hasta aprobar PLAN.
