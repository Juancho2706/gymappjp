# Checklist DB — write-paths nuevos de mobile (RN parity)

Checklist vivo. Aplica a **todo PR de `apps/mobile` que agregue un write-path nuevo**
(insert/update/delete desde el cliente vía `authenticated`, o desde `anon` en flujos
pre-auth como login/branding). Basado en el patrón confirmado en
`specs/rn-mobile-parity-redesign/research/e0-db-audit.md` (auditoría E0-B1, 2026-07-08:
cero deltas hoy — este checklist es para lo que se agregue de ahora en adelante) y en el
gotcha de "Column-level grants" de `CLAUDE.md`.

No mergear un write-path nuevo de mobile sin marcar todos los ítems aplicables.

---

## 1. Identificar el patrón de la tabla

- [ ] ¿La tabla tiene GRANT de **tabla completa** para `authenticated` (INSERT/UPDATE/DELETE
      sin restricción de columna), o tiene el patrón **REVOKE-tabla + GRANT-columnas**
      (allowlist)?
  ```sql
  -- ¿UPDATE de tabla completa revocado?
  SELECT grantee, privilege_type FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='<tabla>' AND grantee='authenticated';
  ```
  - Si aparece `UPDATE` en `role_table_grants` → tabla completa, cualquier columna nueva
    ya es escribible, **no requiere GRANT extra** (ver ejemplo `workout_logs` en el audit).
  - Si **no** aparece `UPDATE` (solo SELECT/INSERT/DELETE/...) → la tabla usa allowlist de
    columnas (patrón `coaches`, `teams`, `clients`) y **toda columna nueva que el alumno/coach
    deba escribir desde mobile exige un `GRANT UPDATE(col)` explícito en la MISMA migración
    que la crea**.

## 2. Si es allowlist: agregar el GRANT en la misma migración

- [ ] La migración que crea la columna incluye:
  ```sql
  GRANT UPDATE (nueva_columna) ON public.<tabla> TO authenticated;
  ```
- [ ] **NO** usar `REVOKE UPDATE(col)` esperando que anule un grant de tabla — es no-op.
      El patrón correcto es `REVOKE UPDATE ON tabla FROM authenticated` (una vez, a nivel
      tabla) + `GRANT UPDATE (col1, col2, ...) ON tabla TO authenticated` (allowlist).
- [ ] Verificar post-aplicación contra `information_schema.column_privileges` (no contra
      el `.sql` — puede haber grants agregados por migraciones posteriores que el archivo
      original no refleja; el audit E0-B1 encontró este caso real en
      `body_composition_measurements`):
  ```sql
  SELECT column_name, privilege_type FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='<tabla>'
    AND grantee='authenticated' AND privilege_type='UPDATE'
  ORDER BY column_name;
  ```

## 3. RLS de la tabla

- [ ] Existe policy `FOR UPDATE` (o `FOR ALL`) que cubra el actor mobile real:
      `client_id = auth.uid()` (alumno) / `coach_id = auth.uid()` (coach) / membership vía
      `client_memberships` (pool). Sin la policy correcta, el GRANT de columna es necesario
      pero no suficiente (PostgREST igual devuelve 0 filas afectadas o 403).
  ```sql
  SELECT policyname, cmd, roles::text, qual, with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='<tabla>';
  ```
- [ ] Si la tabla tiene lectura para `anon` (branding/login pre-auth), confirmar que las
      columnas nuevas sensibles (tokens, PII, billing) **NO** quedaron incluidas en el
      GRANT SELECT a `anon` por accidente (copy-paste de una migración de branding previa).

## 4. Columnas de scoping / compra-only — nunca las toques desde mobile

- [ ] Si la columna nueva es de scoping (`org_id`, `team_id`, `coach_id` en `clients`) o de
      billing/entitlements (`enabled_modules`, `subscription_*`, `max_clients` en
      `coaches`/`teams`) → **service-role only**, no agregar GRANT a `authenticated` bajo
      ninguna circunstancia. Estas ya están explícitamente reservadas
      (`20260611120000_modules_compra_only_grants.sql`,
      `20260611120001_clients_scoping_grants.sql`).

## 5. Suite de regresión

- [ ] Correr `tests/separation/module-grants.sql` (chequea drift contra
      `information_schema.column_privileges`) antes de mergear cualquier migración que
      toque grants de `coaches`/`teams`/`clients`.
- [ ] Si la tabla nueva/columna nueva introduce un patrón de scoping equivalente
      (multi-tenant), considerar agregar un caso a esa suite en el mismo PR.

## 6. Storage (si el write-path sube archivos, ej. fotos de check-in/perfil)

- [ ] Policies de `storage.objects` scoped a `(storage.foldername(name))[1] = auth.uid()::text`
      (o equivalente coach/team), **no** SELECT público amplio salvo que sea intencional
      (ver gotcha `checkins` bucket, tightened en `20260608120200`).
- [ ] Confirmar policy con:
  ```sql
  SELECT policyname, cmd, roles::text, qual, with_check FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%<bucket>%';
  ```

## 7. Verificación final (contra PROD real, no contra el `.sql`)

- [ ] `information_schema.column_privileges` muestra el GRANT esperado.
- [ ] `pg_policies` muestra la policy esperada.
- [ ] Prueba manual desde mobile (o Playwright/RLS test) como `authenticated` con claims
      reales — nunca validar con `service_role` (eso siempre pasa, no prueba nada).
- [ ] Actualizar `specs/rn-mobile-parity-redesign/research/e0-db-audit.md` (o el doc de
      auditoría vigente de la etapa) si el hallazgo cambia el estado "cero deltas".

---

## Referencias

- Auditoría base (E0-B1): `specs/rn-mobile-parity-redesign/research/e0-db-audit.md`
- Gotcha de grants por columna: `CLAUDE.md` §Database → "Column-level grants gotcha"
- Suite de regresión: `tests/separation/module-grants.sql`
- Migraciones ejemplo del patrón: `supabase/migrations/20260611120000_modules_compra_only_grants.sql`,
  `supabase/migrations/20260611120001_clients_scoping_grants.sql`,
  `supabase/migrations/20260612140001_clients_scoping_grants.sql`
