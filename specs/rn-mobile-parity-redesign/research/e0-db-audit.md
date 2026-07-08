# E0-B1 — Auditoria DB + borrador de migracion (RN parity)

Fecha: 2026-07-08 · Modo: SOLO-LECTURA sobre PROD (MCP Supabase `execute_sql`, unicamente SELECT).
Cero escrituras a la base. Draft de migracion: `supabase/migrations/20260708_DRAFT_rn_parity_e0_grants.sql.draft`.

## Resultado ejecutivo

**CERO DELTAS.** Los cuatro puntos auditados ya estan cubiertos en produccion (verificado
contra `information_schema` / `pg_policies` LIVE, no solo contra los `.sql`). No hace falta
aplicar ninguna migracion. El `.draft` queda como evidencia + patron idempotente por si un
reset/rebase de Supabase perdiera algun grant.

Gotcha importante confirmado: para bodycomp, el **archivo** de migracion original no reflejaba
el estado real: PROD tiene ramas de lectura del alumno que el `.sql` no muestra (una migracion
posterior las agrego). Por eso la verificacion se hizo contra `pg_policies`, no contra el repo.

---

## (a) coaches — GRANT SELECT a `anon` de columnas de branding del login alumno

**Columnas que necesita el login alumno**: las que lee `proxy.ts` en `coachBrandingPromise`
(corre como rol `anon` en el login pre-auth), fuente:
`apps/web/src/proxy.ts` L203 —
`id, brand_name, primary_color, logo_url, slug, loader_text, use_custom_loader,
loader_text_color, loader_icon_mode, subscription_tier, brand_secondary_color, accent_light,
accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant, theme_preset_key,
login_layout_key, loader_config` (20 columnas).

**Query usada**:
```sql
SELECT column_name, privilege_type FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='coaches' AND grantee='anon'
ORDER BY column_name, privilege_type;
```

**Hallazgo: EXISTE (completo).** Las 20 columnas tienen `SELECT` para `anon`. Aplicado por
`20260617033845` (base branding), `20260621213600` (whitelabel v2: secondary/accent/neutral/
logo_dark/font/loader_variant) y `20260702210000` (theme_preset_key/login_layout_key/loader_config).
Las columnas sensibles (card_*, registration_ip, trial_used_email, subscription_mp_id,
enabled_modules, payment_provider, ...) siguen SIN SELECT para anon (solo REFERENCES residual,
inofensivo). **Sin gap.**

---

## (b) GRANT UPDATE a `authenticated` de columnas que mobile escribe

### b.1 — biometria en `clients`

**Query usada**:
```sql
SELECT column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='clients'
  AND grantee='authenticated' AND privilege_type='UPDATE' ORDER BY column_name;
-- + role_table_grants para confirmar que UPDATE de TABLA esta revocado.
```

**Hallazgo: EXISTE (completo).** `UPDATE` a nivel tabla esta revocado para `authenticated`
(confirmado: en `role_table_grants` aparecen SELECT/INSERT/DELETE/TRIGGER/TRUNCATE/REFERENCES
pero NO UPDATE). Hay GRANT UPDATE de 17 columnas (allowlist de `20260612140001_clients_scoping_grants.sql`),
que incluye toda la biometria/cardio que mobile escribe: `birth_date`, `goal_weight_kg`,
`resting_hr`, `max_hr_override`, `ref_5k_time_sec` (+ full_name, phone, email, onboarding, etc.).
Las 4 de scoping (`id/org_id/team_id/coach_id`) quedan solo service-role. RLS `clients_self_update`
(`id = auth.uid()`) permite al alumno editar SU fila. **Sin gap.**

### b.2 — `client_intake.sex`

**Query usada**:
```sql
SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='client_intake' AND grantee='authenticated'
ORDER BY column_name, privilege_type;
-- + pg_policies de client_intake.
```

**Hallazgo: EXISTE (completo).** `sex` tiene INSERT/SELECT/UPDATE para `authenticated`
(`20260701120000_add_client_intake_sex.sql`). RLS `client_intake_client`
(`client_id = auth.uid()`, FOR ALL) deja al alumno escribir su propio sexo biologico
(y `client_intake_coach` / `team_client_intake_member_all` cubren coach y pool). **Sin gap.**

### b.3 — columnas de sustitucion de maquina en `workout_logs`

Nombres exactos (migracion `20260704160352_workout_logs_substitution_columns.sql`, Fase L DC-1):
`substituted_exercise_id`, `substituted_exercise_name`, `substitution_reason`.

**Query usada**: incluidas en la de column_privileges de `workout_logs` + `role_table_grants`.

**Hallazgo: EXISTE (completo) / NO requiere grant de columna.** `workout_logs` tiene GRANT de
TABLA (SELECT/INSERT/UPDATE/DELETE) para `authenticated`, asi que las 3 columnas nuevas son
escribibles sin grant extra (asi lo documenta la propia migracion). RLS `client_manage_logs`
(`client_id = auth.uid()`) deja al alumno escribir sus logs. **Sin gap.**

---

## (c) Bucket `checkins` — upload directo del alumno (storage.objects RLS)

**Query usada**:
```sql
SELECT policyname, cmd, roles::text, qual, with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%checkin%'
ORDER BY policyname;
```

**Hallazgo: EXISTE (completo).** Policies TO `authenticated` scoped a la carpeta propia
(`(storage.foldername(name))[1] = auth.uid()::text`):
`checkins_client_insert` (WITH CHECK), `checkins_client_select`, `checkins_client_update`,
`checkins_client_delete` (`20260525181500_storage_workspace_policies.sql`), mas la legacy
"Authenticated users can upload checkin images" (INSERT, mismo predicado). El SELECT publico
amplio fue removido (`20260608120200_tighten_checkins_bucket.sql`). El alumno sube directo a
su carpeta = **sin gap**.

---

## (d) Lecturas del ALUMNO en bodycomp / movement / cardio (aislamiento por client_id)

**Query usada**:
```sql
SELECT tablename, policyname, cmd, roles::text, qual, with_check FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('body_composition_measurements','movement_assessments',
                    'movement_assessment_items','clients')
ORDER BY tablename, cmd, policyname;
-- + tables ILIKE '%cardio%|%movement%|%body_comp%' para confirmar tablas existentes.
```

**Hallazgo: EXISTE (completo) en las tres.**

- **body_composition_measurements** — `bcm_select` (LIVE) incluye las ramas del alumno:
  `... OR client_id = auth.uid() OR client_id IN (client_memberships activas del account)`.
  IMPORTANTE: el archivo `20260611092001_body_composition_measurements.sql` **NO** tiene estas
  ramas (solo pool + standalone coach); una migracion posterior las agrego. Verificado contra
  `pg_policies`, no contra el `.sql`. El alumno lee sus mediciones. **Sin gap.**
- **movement_assessments** / **movement_assessment_items** —
  `movement_assessments_client_self_select` y `movement_assessment_items_client_self_select`:
  SELECT de las propias con `status='final'` (`client_id = auth.uid()` OR via client_memberships)
  (`20260611091001_movement_assessment_module.sql`). **Sin gap.**
- **cardio** — NO existe tabla dedicada (solo aparecen body_composition_measurements,
  movement_assessments, movement_assessment_items en `information_schema.tables`). El modulo
  cardio = columnas de perfil en `clients` (leidas por `clients_self_select`, `id = auth.uid()`)
  + sesiones en `workout_logs` (leidas por `client_manage_logs`, `client_id = auth.uid()`).
  Ambas ya legibles por el alumno. **Sin gap.**

---

## Verificacion — queries ejecutadas (todas SELECT, cero escrituras)

1. `information_schema.column_privileges` — coaches / grantee anon.
2. `information_schema.column_privileges` — clients / authenticated / UPDATE.
3. `information_schema.role_table_grants` — clients/workout_logs/client_intake/bodycomp/movement (authenticated,anon).
4. `information_schema.column_privileges` — client_intake + workout_logs / authenticated.
5. `pg_policies` — storage.objects LIKE '%checkin%'.
6. `pg_policies` — body_composition_measurements / movement_assessments(+items) / clients.
7. `information_schema.tables` — ILIKE cardio/movement/body_comp.
8. `pg_policies` — client_intake.

Ningun `apply_migration`, DDL, DML ni escritura de ningun tipo.
