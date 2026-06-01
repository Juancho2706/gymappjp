# Informe: Conflicto de Migraciones Supabase — Remoto vs Local

**Fecha:** 2026-06-01
**Branch:** `v2/enterprise`
**Proyecto remoto linkeado:** `jikjeokundmaafuytdcx`
**Autor:** análisis pre-merge (rol: DevOps + Software Architect)
**Veredicto:** ⚠️ **RIESGO ALTO de conflicto en merge/push. NO hacer `supabase db push` ciego desde esta branch.**

---

## 1. Resumen ejecutivo

La branch `v2/enterprise` usa un **baseline squasheado** (`00000000000001_baseline.sql`, 3832 líneas, dump de schema estilo `pg_dump`) + 56 migraciones enterprise encima. El remoto (prod) tiene la **historia granular real** (~100+ migraciones desde abril 2026) y **NO tiene el baseline ni las migraciones enterprise**.

Además: prod recibió un batch de **7 migraciones el 2026-05-28** (`20260528*`) que esta branch **NUNCA incorporó** (la branch salta de `20260527130100` a `20260530100000`).

Resultado: las historias de migración **divergieron**. Un `db push` directo intentaría aplicar el baseline a prod → recrear tablas existentes → **ERROR**.

---

## 2. Estado de las tres zonas

### 2A. Solo en LOCAL (branch) — no en remoto
- `00000000000000`, `00000000000001` → **baseline squasheado** (snapshot de schema, ~mayo 27).
- Las 55 migraciones enterprise: `20260517140000` … `20260601000600`.

Estas son las que aportan TODO el trabajo enterprise (org tables, RLS, workspace, brand, programs, nutrition templates, capacity, snapshots, reviewed_at, etc.).

### 2B. Solo en REMOTO (prod) — no en local
- **~100+ migraciones abril–mayo** (`20260410` … `20260516`): la historia real pre-baseline. El baseline las "contiene" como schema, pero no como archivos.
- **🔴 Batch 2026-05-28 (7 migraciones)** que la branch NO tiene:
  - `20260528014920`, `20260528014933`, `20260528014944`
  - `20260528024335`, `20260528024346`
  - `20260528223023`, `20260528230731`

### 2C. En AMBOS
- Solo `00000000000000` (placeholder vacío). Nada más coincide por timestamp.

---

## 3. Por qué hay conflicto

1. **Baseline no aplicable a prod.** `00000000000001_baseline.sql` hace `CREATE TABLE`/`CREATE TYPE` de todo el schema. Prod ya tiene esas tablas. `db push` lo intentaría aplicar (no está en el historial remoto) → `relation already exists`.

2. **Drift del batch 2026-05-28.** Prod tiene 7 migraciones del 28-may que la branch desconoce. Si alguna alteró tablas que las migraciones enterprise también tocan (`clients`, `coaches`, `organizations`, `check_ins`, `nutrition_plans`...), el schema asumido por las migraciones enterprise **no coincide** con el prod real. El baseline fue tomado ~27-may, ANTES de ese batch.

3. **Historial `supabase_migrations.schema_migrations` divergente.** El CLI compara por timestamp de migración. Push solo aplica "local-not-remote", pero como el baseline es local-not-remote, lo incluiría.

---

## 4. Plan de merge seguro (cuando el owner decida)

> NO ejecutar ahora. Documentado para la fase de deploy. Requiere backup + ventana.

### Paso 0 — Backup
```bash
# Snapshot completo de prod antes de tocar nada
supabase db dump --linked -f backup-prod-pre-enterprise.sql
```

### Paso 1 — Traer el batch 2026-05-28 a la branch
```bash
supabase db pull   # genera archivos de las migraciones remotas faltantes
```
Revisar los 7 archivos `20260528*`. Si tocan `clients/coaches/organizations/check_ins/nutrition_*`, **rebasar** las migraciones enterprise para que sean compatibles.

### Paso 2 — Marcar baseline como ya aplicado en prod (NO re-ejecutar)
```bash
# El baseline representa schema que prod YA tiene. Marcarlo aplicado sin correrlo:
supabase migration repair --status applied 00000000000001
```

### Paso 3 — Aplicar SOLO las migraciones enterprise nuevas
Orden cronológico, una por una, verificando cada una:
```bash
supabase db push   # ahora solo aplica 20260517+ que faltan en prod
```
Las migraciones enterprise deben ser idempotentes donde sea posible (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` — ya lo son en su mayoría).

### Paso 4 — Verificar
```bash
supabase db lint --linked
# correr rls-isolation + multi-role contra staging si existe
```

---

## 5. Riesgos específicos por migración enterprise

| Migración local | Tabla tocada | Riesgo si prod cambió la tabla el 28-may |
|---|---|---|
| `20260526103000_clients_nullable_coach` | `clients` | Verificar que prod no haya alterado `clients.coach_id` |
| `20260601000000_workout_programs_nullable_coach` | `workout_programs` | Constraint nuevo — verificar datos prod existentes pasan el CHECK |
| `20260601000100_nutrition_plan_templates_nullable_coach` | `nutrition_plan_templates` | idem CHECK |
| `20260601000200_org_members_expand_roles` | `organization_members` | DROP+ADD constraint role — verificar no rompe filas prod |
| `20260601000500_organizations_coach_capacity` | `organizations` | ADD column default 25 — seguro |
| `20260601000600_check_ins_reviewed_at` | `check_ins` | ADD columns — verificar batch 28-may no agregó las mismas |
| `20260530170000_fix_checkins_rls_leak` | `check_ins` RLS | **Crítico**: si prod 28-may tocó RLS de check_ins, puede haber conflicto de policies |

---

## 6. Recomendaciones (rol: Security + DevOps)

1. **Nunca** `supabase db push` directo desde esta branch a prod sin Paso 1–2.
2. Antes del merge: `supabase db pull` para reconciliar el batch 28-may. Es el paso que falta.
3. Considerar regenerar el baseline desde el prod ACTUAL (post 28-may) para eliminar el drift, luego re-aplicar enterprise encima en local y re-test.
4. Bucket `checkins` sigue `public=true` — migrar a privado + signed URLs en el mismo release de deploy (ver `enterprise-reference-matrices.md` §10).
5. Mantener `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` solo en prod env (ya documentado en CLAUDE.md).

---

## 7. Estado local (sano para desarrollo)

Local está **consistente**: 57 archivos de migración aplicados, `db reset` reconstruye todo desde baseline + enterprise + seed. Los tests (RLS 46, multi-role 18) corren verde sobre local. El problema es **exclusivamente** la reconciliación con prod al momento del deploy.

---

> **Acción inmediata recomendada:** antes de cualquier merge, correr `supabase db pull` en una branch temporal para capturar los 7 archivos `20260528*` y evaluarlos. Sin eso, el deploy enterprise a prod fallará o causará drift silencioso.
