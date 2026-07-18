# PLAN — Separación de login/área del alumno Enterprise

> Implementa el SPEC.md. Requiere aprobación del dueño antes de codear (es el proyecto grande de Fase 5). El resto del plan de aislamiento (Fases 0-4 + B-7/B-9/B-10/B-11) ya está hecho y testeado.

## Arquitectura de rutas + cookies

- **Standalone (sin cambios):** `/c/[coach_slug]/*` en `eva-app.cl`. NO se toca → cero regresión.
- **Enterprise alumno (nuevo):** `/e/[org_slug]/*` servido en `eva-app.cl` (o, ideal, `enterprise.eva-app.cl` reusando el rewrite de `proxy.ts:89-110`). Login en `/e/[org_slug]/login`.
- **Cookies:** la sesión del alumno enterprise se scope al área enterprise. Hoy las cookies de Supabase son por dominio. Opciones: (a) mismo dominio, distinta ruta — cookies compartidas (no ideal); (b) subdominio `enterprise.eva-app.cl` → cookies separadas (alineado con la política coach vs org_admin existente). Recomendado (b).
- Branding: el área `/e/*` resuelve marca de la **org** (no del coach). Reusar el resolver de branding actual de `proxy.ts` pero por `org_slug`/`client.org_id`.

## Componentes compartidos

Extraer de `c/[coach_slug]/*` los componentes de pantalla (dashboard, workout, nutrition, check-in, exercises) a `components/client-app/*` (o `_shared`), parametrizados por contexto (coach vs org). Montar los mismos en `/c/*` y `/e/*`. Evitar duplicar lógica de auth: **funciones de resolución paralelas**, no condicionales sobre el mismo código.

## Modelo de doble pertenencia (US3 — híbrido por email)

Decisión: por defecto cuentas/áreas separadas; si la misma cuenta pertenece a ambos mundos → selector. La fila `clients` (`id = auth.uid`) solo soporta XOR. Para "ambos":

- **Tabla nueva `client_memberships`** (`id, user_id, scope ('standalone'|'enterprise'), coach_id NULL, org_id NULL, created_at, deleted_at`). Una fila por contexto del que la cuenta es alumno.
- `clients` sigue siendo la fila "primaria"; `client_memberships` representa la(s) pertenencia(s). Migración: backfill 1 fila por cada `clients` existente según `org_id`.
- Selector de alumno post-login: si `client_memberships` activas > 1 → pantalla de selección (grid de cards, reusar lenguaje del `WorkspaceSwitcher`); guardar elección en `workspace_preferences` (ya existe).
- Resolver `resolveClientWorkspace(userId)` análogo a `resolvePreferredWorkspace` de coaches.

> Alternativa más simple si el dueño acepta NO soportar "misma cuenta en ambos": cuentas separadas (mismo email permitido por área vía constraint `(area, email)`), sin junction ni selector. Decidir en revisión.

## Creación enterprise (ya parcialmente hecho)
- B-7 (hecho): `organization_members.invite_code` → enterprise; `coaches.invite_code` → standalone.
- B-10 (hecho): email de accesos al asignar/crear-con-coach.
- Pendiente: menú "Agregar alumno a la organización" en el dashboard del coach enterprise → llama `addClientToOrgAction` (org-linked), gated por membresía activa.

## Forks a cuidar (regresión standalone)
- `clientLoginAction` (`c/[coach_slug]/login/_actions`): crear `enterpriseClientLoginAction` paralelo para `/e/*`; NO tocar el standalone.
- `proxy.ts` rama `/c/*`: agregar rama `/e/*` (resolución de org + branding org + guardas de cliente).
- Reset password: `/forgot-password?org_slug=` además de `?coach_slug=`.
- Email uniqueness: `clients_org_email_unique (org_id, email)` vs unicidad global standalone — revisar con el modelo elegido.
- `workspace_preferences` para el selector de alumno.

## Migración / transición
- Los alumnos enterprise existentes siguen entrando por `/c/[coach_slug]` hasta que se active `/e/*`; redirección suave (proxy) cuando esté listo. Sin romper sesiones activas.

## Fases de implementación
1. `client_memberships` + backfill + `resolveClientWorkspace` (o decisión "cuentas separadas").
2. Rutas `/e/[org_slug]/login` + `/e/[org_slug]/*` con componentes compartidos + branding org.
3. `enterpriseClientLoginAction` + guardas en `proxy.ts`.
4. Selector de alumno (post-login, multi-membresía) + `workspace_preferences`.
5. Reset password variante org + menú "agregar alumno" en dashboard coach enterprise.
6. Transición/redirección de alumnos enterprise existentes a `/e/*`.
7. Mobile: definir entrada del alumno enterprise (app EVA enterprise RN futura vs contexto).

## Verificación
- Extender `apps/web/scripts/enterprise-isolation-test.mjs` + Playwright: login standalone intacto, login enterprise por `/e/*`, selector con cuenta dual, cookies no compartidas.
