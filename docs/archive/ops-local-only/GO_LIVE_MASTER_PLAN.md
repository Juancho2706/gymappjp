# 🚀 GO-LIVE MASTER PLAN — Merge `v2/enterprise` → producción (código + DB)

> **Estado:** BORRADOR VIVO · **Fecha:** 2026-06-07 · **Autor:** análisis + ensayo asistido (DevOps + Architect + Security + DBA)
> **Regla de oro:** prod NO se toca hasta que el owner dé OK explícito por paso, con backup hecho y ventana sin clientes.
> Docs hermanas: [`LIVE_VS_LOCAL_DB_INVENTORY.md`](LIVE_VS_LOCAL_DB_INVENTORY.md) (inventario tabla-por-tabla) · [`SUPABASE_MIGRATION_CONFLICT_REPORT.md`](SUPABASE_MIGRATION_CONFLICT_REPORT.md) · [`MERGE_TO_LIVE_RUNBOOK.md`](MERGE_TO_LIVE_RUNBOOK.md).

---

## 0. TL;DR — qué es esto y por qué

Prod (`jikjeokundmaafuytdcx`) hoy es la **app standalone viva**: 21 coaches, 60 clientes, 6.729 workout_logs, datos reales. **NO tiene NADA del schema enterprise.** La rama `v2/enterprise` agrega 14 tablas nuevas + columnas en 9 tablas existentes + un rewrite grande de RLS. Este plan lleva ese schema (y el código que lo usa) a prod **sin perder datos ni romper a los coaches actuales**.

**Decisión del owner:** merge **completo** (enterprise entero) + seguir desarrollando contra live después.

**Veredicto de riesgo tras ensayo:** 🟢🟡 **Medio-bajo y manejable**, con 1 fix de datos ya aplicado y 4 puntos de reconciliación pendientes. NO es push a ciegas — hay plan, ensayo y backup.

---

## 1. Estado verificado (qué se probó, no qué se asume)

| Verificación | Método | Resultado |
|---|---|---|
| Schema prod completo (39 tablas, columnas, RLS, buckets, funciones) | MCP read-only (`list_tables`, `pg_policies`, `storage.buckets`, `pg_proc`) | ✅ Inventariado → [`LIVE_VS_LOCAL_DB_INVENTORY.md`](LIVE_VS_LOCAL_DB_INVENTORY.md) |
| Prod NO tiene enterprise | `supabase_migrations.schema_migrations` ledger | ✅ Confirmado: salta de `20260515222039` a exercises `20260528*` |
| Constraints nuevos contra data real | MCP `SELECT` counts | ✅ Solo el CHECK de `subscription_status` falla (1 fila `trialing`); `workout_programs`/`clients`/`nutrition_plan_templates` null-coach = 0; emails dup = 0 |
| Cadena completa de migraciones aplica en Supabase real | `db push` a proyecto temp **vacío** | ✅ Las 60 migraciones aplicaron LIMPIO (solo NOTICE idempotentes) |
| Cadena + seed aplica local con el fix | `supabase db reset` local | ✅ "Finished" sin errores |
| Idempotencia de migraciones | 2 builds limpios (temp + local) | ✅ Empírico — usan `IF NOT EXISTS` / `DROP POLICY IF EXISTS` |

**Proyecto de ensayo (staging):** `dqefjrbibsahipyqbmih` (free, us-east-2, **descartable — borrar al terminar**).

---

## 2. Los 4 puntos de reconciliación + el fix de datos

### 🔴 FIX-1 — CHECK `subscription_status` (RESUELTO ✅)
- **Problema:** `20260517130008` definía el CHECK SIN `trialing`; prod tiene 1 coach `trialing` → el `ALTER ADD CONSTRAINT` abortaría sobre data real.
- **Fix aplicado:** se amplió el CHECK al superset (incluye `trialing`, `canceled`, `expired`, `pending_payment`, `pending_email` + `org_managed`), con `DROP CONSTRAINT IF EXISTS` previo. Validado con `db reset` local limpio.
- **Estado:** ✅ hecho en `supabase/migrations/20260517130008_coaches_invite_code.sql` (working tree).

### 🟡 REC-2 — Overlap de exercises (ledger)
- Prod ya tiene la serie exercises como `20260528*` (5 migraciones) + 2 hotfixes prod-only (`20260528223023 fix_exercises_rls_overly_permissive_policies`, `20260528230731 fix_exercise_media_bucket_gif_size_limit`).
- Local las tiene como `20260527*` + `20260530100000_exercises_drop_conflicting_policies`.
- **Acción:** marcar las `20260527*` como applied en prod vía `migration repair` (prod ya tiene esos cambios), o dejar que se reapliquen (son idempotentes). Verificar que el end-state de RLS de exercises (local) sea **igual o más estricto** que el hotfix prod (lo es: local deja solo el set workspace-scoped).

### 🟡 REC-3 — Baseline no aplicable a prod
- `00000000000001_baseline.sql` hace `CREATE TABLE` de todo (sin `IF NOT EXISTS`). Prod ya tiene esas tablas → push directo = `relation already exists`.
- **Acción:** `migration repair --status applied 00000000000000 00000000000001` (marca el baseline como ya aplicado SIN ejecutarlo — solo toca la tabla ledger, cero SQL de schema).

### 🟡 REC-4 — `push_tokens` local-only
- `20260518000000_push_tokens` crea tabla nueva (no en prod). Es aditiva pura → se aplica normal en el push. Sin acción especial.

### 🔴 REC-5 — `pg_trgm` falta en prod (cazado por el ensayo 1:1)
- `20260517140000_clients_trgm_indexes` crea un índice GIN `gin_trgm_ops` → necesita la extensión **`pg_trgm`**, que prod NO tiene. La crea `00000000000000_extensions.sql`.
- **Acción:** NO reparar `00000000000000` (dejarlo correr en el push) **y/o** habilitar `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;` antes (Fase 3.0). Validado: con pg_trgm, todo aplica limpio.

### 🟡 REC-6 — `db push` requiere `--include-all`
- Las migraciones enterprise (`20260517*`) son anteriores a la última de prod (`20260528*`) → `db push` sin flag las rechaza pidiendo `--include-all`. Confirmado en el ensayo. Fase 3.3 ya lo usa.

---

## 3. Estrategia de reconciliación: **B (repair + push selectivo)** ✅ recomendada

Dos caminos posibles (research 2026 confirma ambos válidos):

| | **A — Rebaseline desde prod-now** | **B — Repair baseline + push selectivo** ✅ |
|---|---|---|
| Qué hace | Dump de prod actual → nuevo baseline → re-stack enterprise → historias alinean | `migration repair` marca baseline+overlap como applied → `db push` aplica solo lo nuevo |
| Toca data prod | No (dump read) | No (`repair` solo toca el ledger) |
| Riesgo | Más pasos, dump/restore dance | Menor: aditivo + ledger-only |
| Alineación futura local↔prod | Perfecta | Cosmética desalineada (prod conserva hotfixes; local conserva baseline) — funcional |
| Esfuerzo | Alto | Bajo |

**Recomendación: B** — menor toque sobre data viva. `repair` no ejecuta DDL, solo actualiza `supabase_migrations.schema_migrations`. Las migraciones enterprise son aditivas (probado idempotente). **Después** del go-live, opcional `supabase db pull` para realinear el ledger local con prod y seguir desarrollando forward sin ruido.

> Fuente: [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) — "updates the tracking table only, does not apply or revert SQL". [DB Migrations](https://supabase.com/docs/guides/deployment/database-migrations).

---

## 4. RUNBOOK de deploy (orden exacto · 🔴 = toca prod)

### Fase 0 — Pre-flight (local, ❌ no toca prod)
- [ ] `pnpm typecheck` limpio · `pnpm lint` 0 errores · `pnpm test` verde.
- [ ] `supabase db reset` local + `npx playwright test tests/enterprise/ --workers=1` verde (RLS isolation + multi-role).
- [ ] `supabase db lint --local` → "No schema errors found".
- [ ] Confirmar fixes REC/FIX aplicados en working tree.
- [ ] Commit de la rama (el owner) con todo el laburo.

### Fase 1 — Ensayo en proyecto temp (❌ no toca prod) — *ver §5*
- [ ] Reproducir estado prod-like en temp (standalone + exercises + 1 coach `trialing`).
- [ ] Correr la secuencia repair+push de Fase 3 contra el temp.
- [ ] Verificar: migraciones OK, coach `trialing` sobrevive, coach standalone conserva acceso (RLS), org-admin aislado.

### Fase 2 — Backup de prod (🔴 read-only)
- [ ] `supabase db dump --linked -f backup-prod-$(fecha).sql` (schema + data Postgres).
- [ ] **Backup separado de Storage** (las fotos NO van en el dump): export del bucket `checkins` (+ otros) vía script/Studio. Sin PITR automático (plan free) → este dump es la única red.

### Fase 3 — Migraciones a prod (🔴 ESCRIBE — ventana sin clientes + OK por paso)
> ⚠️ **2 correcciones validadas por el ensayo 1:1** (sin estas, el push REAL rompe):
> 1. **`pg_trgm` falta en prod** → hay que habilitarla. Por eso NO se repara `00000000000000` (que la crea); se deja correr.
> 2. Las migraciones enterprise son **anteriores** a la última de prod (`20260528*`) → el push exige **`--include-all`**.

```bash
# 3.0 habilitar pg_trgm en prod (1 línea, idempotente, NO toca datos) — belt-and-suspenders
#     (también la crea 00000000000000_extensions en 3.3; este paso lo garantiza)
#     correr vía SQL editor del dashboard o psql:  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

# 3.1 marcar SOLO el baseline de TABLAS como aplicado (NO 00000000000000 — ese debe correr para crear pg_trgm)
supabase migration repair --status applied 00000000000001
# 3.2 marcar overlap exercises como aplicado (prod ya los tiene como 20260528*)
supabase migration repair --status applied 20260527120000 20260527120100 20260527120200 20260527130000 20260527130100
# 3.3 aplicar enterprise + 00000000000000_extensions (crea pg_trgm). REQUIERE --include-all
supabase db push --include-all
# 3.4 verificar
supabase db lint --linked
supabase gen types typescript --linked > apps/web/src/lib/database.types.ts   # commitear si difiere
```
- [ ] Tras push: `get_advisors security` (MCP) para confirmar que el leak de `check_ins` quedó cerrado.
- [ ] Confirmar `pg_trgm` creada: `SELECT extname FROM pg_extension WHERE extname='pg_trgm';`

### Fase 4 — Config manual en prod (🔴 dashboard)
- [ ] **Habilitar `custom_access_token_hook`** en Supabase Auth → Hooks (sin esto enterprise NO autoriza; agrega `org_id`/`org_role` al JWT).
- [ ] Confirmar bucket `org-assets` creado (lo crea `20260521000004`; verificar).
- [ ] Env vars en Vercel (§6) presentes.

### Fase 5 — Deploy de código (🔴)
- [ ] Merge PR `v2/enterprise` → `master` → Vercel auto-deploy. **Migraciones PRIMERO, código después** (el código asume columnas nuevas).
- [ ] Confirmar dominio `enterprise.eva-app.cl` apunta al deploy.

### Fase 6 — Smoke tests post-deploy (🔴) — *ver §8*

### Fase 7 — Mobile (aparte, no bloquea web)
- [ ] Apuntar `apps/mobile/.env` (o EAS env del perfil `production`) a la URL+anon de **prod**.
- [ ] Build EAS → probar login coach/alumno contra prod.
- [ ] (Los 7 P0 de la mobile readiness review siguen aplicando antes de tiendas.)

---

## 5. Ensayo prod-like en el temp (la validación capstone)

**Objetivo:** reproducir el escenario REAL de prod (standalone + exercises + coach `trialing`, SIN enterprise) y correr la secuencia repair+push, para cazar lo que el push-fresh no ve.

**Approach sin credenciales de prod (privacy-safe — NO copiar data real):**
1. Reset del temp a vacío.
2. Aplicar solo: extensions + baseline + serie exercises `20260527*` → ≈ schema prod pre-merge.
3. Insertar data sintética mínima: 1 coach `subscription_status='trialing'` + 1 cliente + 1 programa.
4. Marcar baseline+exercises como applied; `db push` del resto enterprise.
5. **Aserciones:**
   - [ ] Todas las migraciones aplican (en especial el CHECK de `subscription_status` con la fila `trialing` presente → debe pasar con el FIX-1).
   - [ ] El coach standalone (org_id NULL) sigue pudiendo `SELECT/UPDATE` sus clientes tras el rewrite de RLS (`clients_standalone_coach_manage`).
   - [ ] exercises RLS queda en el set workspace-scoped (no se re-introduce el leak que el hotfix prod removió).

### ✅ Resultados del ensayo (2026-06-07, proyecto temp `dqefjrbibsahipyqbmih`)
Sobre infra Supabase REAL (no Docker local), con schema fixeado + seed (coaches/clientes/orgs de prueba):

| Aserción | Resultado |
|---|---|
| Las 60 migraciones aplican (fresh push + reset) | ✅ limpio ×2, solo NOTICE idempotentes |
| `subscription_status` CHECK con el fix | ✅ reset+seed sin error; superset incluye `trialing` |
| **Coach standalone retiene acceso a SUS clientes** (riesgo #1) | ✅ ve 3/3 propios (org_id null), scoped |
| Coach de org retiene acceso | ✅ ve sus asignados (funciona vía `user_id`, incluso sin el hook) |
| **Leak `check_ins` `USING(true)` cerrado** | ✅ anon = 0 filas; coach = solo las suyas |
| Anon sin sesión | ✅ 0 en clients y check_ins (RLS bloquea) |

**Conclusión:** el end-state (schema + RLS + data) corre **impecable** en infra real. Riesgo de lockout de coaches = descartado empíricamente. Leak de salud = se cierra con el merge.

### ✅ Ensayo 1:1 GOLD-STANDARD completado (2026-06-07)
Se dumpeó el **schema REAL de prod** (`prod-schema.sql`, read-only, schema-only sin data personal), se cargó en el temp (réplica exacta: 42 tablas, sin enterprise, con los 2 hotfixes de exercises + tablas leftover), se sembró el ledger (= el `repair`), y se corrió `db push --include-all` (= el go-live).

| Aserción | Resultado |
|---|---|
| Enterprise aplica sobre el schema EXACTO de prod | ✅ **las 58 migraciones, "Finished"** (tras habilitar `pg_trgm`) |
| End-state | ✅ 56 tablas (42 + 14 enterprise), `organizations`/`organization_members`/`push_tokens` presentes |
| Reconciliación exercises (legacy policies de prod) | ✅ `exercises_drop_conflicting_policies` dropeó las legacy, sin error |
| `security_fixes` sobre tablas reales (`exercises_backup`, `personal_gastos`) | ✅ aplica (las tablas existen en prod) |

**🎯 2 landmines que SOLO el ensayo 1:1 cazó** (el push-fresh los ocultaba porque corría `00000000000000_extensions`):
1. **`pg_trgm` no está en prod** → `clients_trgm_indexes` rompe con `operator class "gin_trgm_ops" does not exist`. Fix en Fase 3.0/3.1 (habilitar pg_trgm / no reparar `00000000000000`).
2. **`db push` exige `--include-all`** (enterprise < última migración de prod). Fix en Fase 3.3.

→ Ambos ya incorporados al runbook. **El go-live quedó validado 1:1 contra el schema real.**

---

## 6. Env vars en prod (Vercel) — checklist

Críticas para enterprise (lista completa en CLAUDE.md + `MANUAL_TASKS.md §MT-25`):
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (solo prod) — server actions admin (crear coach/cliente/staff).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] `NEXT_PUBLIC_SITE_URL=https://eva-app.cl` · `ENTERPRISE_DOMAIN=enterprise.eva-app.cl`.
- [ ] `CRON_SECRET` (cron snapshots) · `ADMIN_EMAILS`.
- [ ] `RESEND_API_KEY` / `EMAIL_FROM` · VAPID keys · Upstash · MercadoPago · Edamam.
- [ ] Auth hook `custom_access_token_hook` habilitado (§4).

---

## 7. Seguridad (post-merge, pero anotada — fugas LIVE hoy)

El owner difiere seguridad al post-merge. Pero hay fugas activas en prod AHORA (independientes del merge):
- 🔴 **`check_ins` RLS `USING(true)`** (SELECT/INSERT/UPDATE/DELETE) — cualquier user autenticado lee/edita check-ins de todos (data de salud). **El merge lo arregla** (`fix_checkins_rls_leak` + `security_fixes` entran en el push). ✅ se cierra solo con el go-live.
- 🔴 **RLS OFF** en `personal_gastos` (tus gastos) y `exercises_backup_20260405`. `security_fixes` los arregla (entra en el push). ✅
- 🟠 **Funciones SECURITY DEFINER ejecutables por `anon`**: `get_admin_coaches_paginated` (PII de coaches), `check_platform_email_availability` (email enumeration). **Independiente del merge** → preparar `REVOKE EXECUTE ... FROM anon` como migración aparte.
- 🟠 **Bucket `checkins` público** (fotos de salud). Fix = privado + signed URLs → toca código (web + mobile, ver §9). **Post-merge** como release propio.
- 🟠 Leaked-password protection OFF (toggle dashboard).

---

## 8. Smoke tests post-deploy (prod)
- [ ] Login coach standalone existente → ve sus clientes/planes (RLS no los dejó afuera). **CRÍTICO.**
- [ ] Alumno existente login `/c/[slug]` → ve su plan/nutrición.
- [ ] check-in: subir foto + ver historial (bucket sigue funcionando).
- [ ] Login org_owner → `/org/[slug]` carga (si se crea una org de prueba).
- [ ] Crear coach enterprise → credenciales → login OK.
- [ ] Aislamiento: org A no ve org B (spot check).
- [ ] MFA: org_admin redirige a setup-mfa.
- [ ] Cron snapshot: `/api/cron/*` con `CRON_SECRET` → fila en `org_weekly_snapshots`.
- [ ] `get_advisors security` → leak de check_ins cerrado.

---

## 9. Rollback
- **Código:** `git revert -m 1 <merge_sha>` → Vercel re-deploya el estado previo. Inmediato.
- **DB:** las migraciones enterprise son aditivas → rollback = restaurar `backup-prod-*.sql` (destructivo, pierde data post-deploy) **o** migraciones inversas puntuales. **Regla:** no rollback de DB si ya hay datos enterprise nuevos sin exportarlos.
- **Bucket privado (cuando se haga):** revertir a público es 1 toggle; pero las signed URLs ya emitidas siguen válidas hasta expirar.

---

## 10. Data-safety — "¿y si un coach mete datos entre el snapshot y el push?"
- Las migraciones van **forward-only y aditivas**. NO bajamos/subimos data; prod conserva sus filas.
- **Aditiva** (`CREATE TABLE`, `ADD COLUMN` nullable): la fila nueva del coach recibe la columna nueva (default/NULL). No se pierde nada.
- **CHECK/NOT NULL**: único riesgo → ya verificado contra data real (solo `subscription_status`, ya fixeado). Backfills (`nutrition_plans.org_id`) son inocuos (clients.org_id NULL en prod).
- **Backup** se toma JUSTO antes del push → captura todo lo agregado hasta ese segundo.
- Ventana de riesgo real: los ~minutos del push → por eso el horario sin clientes.

---

## 11. Decisiones abiertas para el owner
1. **Ensayo capstone:** ¿approach sin-prod (sintético) o me pasás un `db dump --schema-only` de prod (read-only) para ensayo 1:1?
2. **Hardening anon RPC** (`get_admin_coaches_paginated` etc.): ¿lo incluyo como migración en este release o lo dejo para el de seguridad?
3. **Ventana:** confirmar fecha/hora sin clientes para Fase 2-6.
4. **Realineación post-merge** (`db pull` para sincronizar ledger local↔prod): ¿sí?

---

## 12. Checklist Go / No-Go
- [ ] Fase 0 verde (typecheck/lint/test/RLS).
- [ ] Ensayo §5 verde en temp.
- [ ] Backup prod (DB + Storage) hecho.
- [ ] Env vars Vercel + auth hook confirmados.
- [ ] Ventana sin clientes confirmada.
- [ ] Owner dio OK explícito.
→ **Solo entonces:** Fase 3-6.
</content>
</invoke>
