# TASKS — Separación de login/área del alumno Enterprise

> Pendiente de aprobación del PLAN. Tareas atómicas con DoD. NO empezar hasta que el dueño apruebe el modelo (junction `client_memberships` vs cuentas separadas).

## Decisión bloqueante (antes de todo)
- [ ] **D1** — Modelo de doble pertenencia: `client_memberships` (soporta selector híbrido) **o** cuentas separadas (sin selector). DoD: dueño elige; el resto de tareas se ajusta.

## Schema
- [ ] **S1** — (si D1=junction) Migración `client_memberships` (user_id, scope, coach_id, org_id, deleted_at) + índices + RLS (cada user ve solo las suyas). DoD: migración aplicada en remoto, RLS testeada por SDK.
- [ ] **S2** — Backfill: 1 fila por cada `clients` existente según `org_id`. DoD: count(client_memberships activas) == count(clients activos).
- [ ] **S3** — `resolveClientWorkspace(userId)` en `services/auth/`. DoD: unit + uso en login.

## Rutas / área enterprise
- [ ] **R1** — `/e/[org_slug]/login` (RSC + form) con branding org. DoD: render con marca de "Gym Prueba".
- [ ] **R2** — Extraer componentes de pantalla `/c/*` → `components/client-app/*` parametrizados. DoD: `/c/*` sigue idéntico (regresión 0).
- [ ] **R3** — `/e/[org_slug]/*` (dashboard/workout/nutrition/check-in/exercises) montando los compartidos con contexto org. DoD: alumno enterprise navega su app con marca org.
- [ ] **R4** — `proxy.ts`: rama `/e/*` (resolución org, branding, guardas de cliente, cookies scoped). DoD: standalone `/c/*` sin cambios; `/e/*` protegido.

## Auth
- [ ] **A1** — `enterpriseClientLoginAction` paralelo (no tocar `clientLoginAction`). DoD: login enterprise OK; standalone intacto.
- [ ] **A2** — Reset password variante `?org_slug=`. DoD: flujo de recovery cae en el área correcta.
- [ ] **A3** — Selector de alumno post-login (si >1 membresía). DoD: cuenta dual ve selector; elección persiste en `workspace_preferences`.

## Creación enterprise
- [ ] **C1** — Menú "Agregar alumno a la organización" en dashboard coach enterprise → `addClientToOrgAction` (org-linked, gated por membresía). DoD: coach enterprise crea alumno org; no puede crear standalone por ahí.

## Mobile
- [ ] **M1** — Definir entrada del alumno enterprise (app EVA enterprise RN futura vs selección de contexto). DoD: documento de decisión.

## Tests
- [ ] **T1** — Extender `enterprise-isolation-test.mjs` + Playwright: login standalone intacto, login enterprise por `/e/*`, selector dual, cookies no compartidas. DoD: suite verde.

## Regresión (gate en cada PR)
- [ ] **G1** — `coach standalone → alumno standalone` byte-idéntico (el flujo live actual). DoD: test #1 de la suite verde en cada cambio.
