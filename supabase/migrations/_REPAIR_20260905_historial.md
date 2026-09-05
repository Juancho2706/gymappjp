# Reparación del historial de migraciones — 2026-09-05

Auditoría **solo lectura** del proyecto LIVE `jikjeokundmaafuytdcx` contra `supabase/migrations/`.
La auditoría no aplicó nada; el repair del bloque B sí se **EJECUTÓ el 2026-09-05** (ver § B).

## Resumen

| bloque | cantidad | qué se hizo hoy |
|---|---:|---|
| Versiones **remotas sin archivo local** (nunca existieron en git) | 8 | reconstruidas como `.sql` idempotentes desde el estado de LIVE |
| Archivos **locales sin fila remota** | 5 | verificado que su efecto YA está en LIVE → **repair EJECUTADO 2026-09-05** |

---

## A · Las 8 reconstruidas (ya escritas en `supabase/migrations/`)

| versión | nombre | archivo nuevo | confianza |
|---|---|---|---|
| 20260608160829 | dedup_redundant_rls_policies | `20260608160829_dedup_redundant_rls_policies.sql` | **baja** (no-op documentado) |
| 20260608171306 | revoke_admin_coaches_rpc_from_authenticated | `20260608171306_revoke_admin_coaches_rpc_from_authenticated.sql` | alta |
| 20260608183237 | org_alumno_area_migrated_flag | `20260608183237_org_alumno_area_migrated_flag.sql` | alta |
| 20260608190752 | get_org_branding | `20260608190752_get_org_branding.sql` | alta |
| 20260615003342 | restrict_mrr_rpcs_to_service_role | `20260615003342_restrict_mrr_rpcs_to_service_role.sql` | alta |
| 20260619001030 | nutrition_prefs | `20260619001030_nutrition_prefs.sql` | media |
| 20260620010858 | nutrition_propagation_rpc_v2_service_role | `20260620010858_nutrition_propagation_rpc_v2_service_role.sql` | alta |
| 20260805212650 | revoke_public_execute_mrr_helpers | `20260805212650_revoke_public_execute_mrr_helpers.sql` | alta |

Las 8 filas **ya existen** en `supabase_migrations.schema_migrations`, así que `supabase db push`
**no las reejecuta**. Los archivos existen para que el historial sea replayable desde cero y para
que el diff local ↔ LIVE deje de mentir. Cada uno lleva en su cabecera la evidencia (ACL de
`pg_proc.proacl`, `information_schema.columns`, `to_regclass`, md5 del `prosrc`).

Dos avisos que van con estos archivos:

- **`20260608183237` no es cosmética.** El archivo local `20260608230000_enterprise_alumno_context.sql:37`
  lee `o.alumno_area_migrated_at` y ordena después. Sin ese `ADD COLUMN IF NOT EXISTS`, un replay
  del historial desde cero **rompía** ahí. Ahora ya no.
- **`20260619001030` afirma una AUSENCIA, no un CREATE.** Los timestamps locales están invertidos
  respecto de los remotos: el archivo que dropea el scaffolding (`20260618200000_feature_prefs.sql`)
  ordena ANTES que esta versión. Recrear las tablas acá dejaría el esquema local desalineado con
  LIVE. Ver el comentario en cabecera del archivo.

---

## B · Los 5 archivos locales SIN fila remota — **EJECUTADO 2026-09-05**

**EJECUTADO 2026-09-05 por INSERT vía MCP (el CLI local no está linkeado).** Las 5 filas
(`20260609150000`, `20260614120000`, `20260618181000`, `20260621213600`, `20260621220000`) quedaron
insertadas en `supabase_migrations.schema_migrations`: el historial local ↔ remoto está alineado por
nombre. No se ejecutó SQL de las migraciones — el INSERT hace lo mismo que
`supabase migration repair --status applied`, que no se pudo usar porque el CLI local no está
linkeado al proyecto.

Al momento del repair ninguno tenía fila en `supabase_migrations.schema_migrations`. Se verificó
**uno por uno con SELECT contra LIVE** que su efecto ya estaba aplicado, así que marcar la fila sin
ejecutar SQL era seguro.

### 1. `20260609150000_team_drop_hot_table_rls_incident`
Contenido: `DROP POLICY IF EXISTS` de 16 policies `team_*_member_all`.

Verificación (`pg_policies`): **las 16 policies EXISTEN hoy en LIVE** — `team_clients_member_all`,
`team_check_ins_member_all`, `team_client_intake_member_all`, `team_workout_logs_member_all`,
`team_daily_habits_member_all`, `team_client_food_prefs_member_all`, `team_client_payments_member_all`,
`team_daily_nutrition_logs_member_all`, `team_nutrition_meal_logs_member_all`,
`team_nutrition_plans_member_all`, `team_nutrition_meals_member_all`, `team_food_items_member_all`,
`team_workout_plans_member_all`, `team_workout_blocks_member_all`, `team_workout_programs_member_all`,
`team_nutrition_plan_templates_member_all`.

Esto **no** contradice el repair: el efecto de este archivo es **transitorio a propósito**. El
archivo siguiente, `20260609160000_team_rls_optimized.sql:102-198` (= versión remota **20260609152457
`team_rls_optimized`, SÍ aplicada**), vuelve a crear las 16 con la forma initplan-optimizada. El par
drop→recreate ya corrió en LIVE. Además el archivo es 100 % `DROP POLICY IF EXISTS`: aunque se
ejecutara, sería idempotente.

### 2. `20260614120000_billing_snapshots_kind_tier_upgrade`
Contenido: reemplazo del CHECK de `billing_snapshots.kind` para admitir `tier_upgrade_proration`.

Verificación (`pg_get_constraintdef`):
`billing_snapshots_kind_check = CHECK ((kind = ANY (ARRAY['recurring'::text, 'addon_proration'::text, 'tier_upgrade_proration'::text])))` ✔ **aplicado**.

### 3. `20260618181000_nutrition_set_updated_at_search_path`
Contenido: `CREATE OR REPLACE FUNCTION public.nutrition_set_updated_at()` con `SET search_path = ''`.

Verificación (`pg_proc`): `proconfig = {search_path=""}` y
`prosrc = ' BEGIN NEW.updated_at = now(); RETURN NEW; END; '` ✔ **aplicado**.

### 4. `20260621213600_grant_anon_select_whitelabel_v2_branding_cols`
Contenido: `GRANT SELECT (7 columnas) ON public.coaches TO anon`.

Verificación (`information_schema.column_privileges`): `anon` tiene `SELECT` sobre las **7**
columnas — `brand_secondary_color`, `accent_light`, `accent_dark`, `neutral_tint`, `logo_url_dark`,
`brand_font_key`, `loader_variant` ✔ **aplicado**.

### 5. `20260621220000_grant_update_whitelabel_v2_brand_cols`
Contenido: `GRANT UPDATE` de esas 7 columnas de `public.coaches` y de
`brand_secondary_color`/`loader_variant` de `public.teams`, a `authenticated`.

Verificación (`information_schema.column_privileges`): `authenticated` tiene `UPDATE` sobre las 7 de
`coaches` y sobre `brand_secondary_color` y `loader_variant` de `teams` ✔ **aplicado**.

---

## Comandos de repair (equivalente CLI — el 05-09 se hizo por INSERT vía MCP)

El efecto ya está aplicado (ver § B). Estos son los comandos equivalentes para quien tenga el
proyecto linkeado desde la raíz del repo. **Sólo marcan la fila; no ejecutan SQL.**

```bash
supabase migration repair --status applied 20260609150000
supabase migration repair --status applied 20260614120000
supabase migration repair --status applied 20260618181000
supabase migration repair --status applied 20260621213600
supabase migration repair --status applied 20260621220000
```

Después, para confirmar que el historial quedó alineado:

```bash
supabase migration list
```

## Evidencia y método

- Proyecto: `jikjeokundmaafuytdcx` (LIVE). Durante la **auditoría** todas las consultas fueron
  **SELECT** vía MCP (cero escrituras, cero `apply_migration`, cero `migration repair`). El repair
  del § B se ejecutó **después**, el mismo 05-09, como 5 `INSERT` en
  `supabase_migrations.schema_migrations` vía MCP.
- **Drift del 05-09, REPARADO el mismo día:** las dos migraciones de la tarde se aplicaron en LIVE con
  la versión que genera `apply_migration` (`20260905171020 revoke_trigger_fns_from_anon` y
  `20260905171031 nutrition_v2_valid_timezone_fast`) y los archivos locales nacieron como
  `20260905170000_…` / `20260905170100_…`; se renombraron con `git mv` al timestamp de LIVE. La
  tercera, `20260905190100_sec01_phase3_revoke_invite_code_anon`, coincidía desde el inicio.
  Regla para las próximas: aplicar con MCP y DESPUÉS nombrar el archivo con la versión que devuelve
  `schema_migrations`, no al revés.
- Fuentes del estado vigente: `supabase_migrations.schema_migrations`, `pg_proc` (`proacl`,
  `proconfig`, `prosrc`, `pg_get_functiondef`), `pg_policies`, `pg_constraint`,
  `information_schema.columns`, `information_schema.column_privileges`, `to_regclass`.
- Repo en el momento de la auditoría: rama `rnmobiledenuevo`, HEAD `f9ba8a3f`, working tree limpio.
- Conteo de migraciones: **278 antes**, **+8** por esta reconstrucción. `ls supabase/migrations | grep -c '^[0-9]'`
  devuelve **288** porque otros dos workers de la misma ola agregaron en paralelo las dos migraciones
  de la tarde (hoy `20260905171020_…` y `20260905171031_…`), y **289** con la de SEC-01 fase 3.
  Este `.md` no entra en el conteo (no empieza con dígito).
