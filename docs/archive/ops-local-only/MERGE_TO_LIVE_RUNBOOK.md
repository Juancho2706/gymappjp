# Runbook: Merge a LIVE (código + Supabase) — INFO, no ejecutar aún

> **Fecha:** 2026-06-01 · **Branch fuente:** `v2/enterprise` → `master` · **Rol:** DevOps + Architect + Security.
> Este documento es **solo información/checklist**. No ejecutar merge, push de branch, ni `supabase db push` hasta que el owner lo decida con ventana + backup.
> Para el detalle profundo de migraciones ver `SUPABASE_MIGRATION_CONFLICT_REPORT.md` (este runbook lo referencia, no lo duplica).

---

## 0. Reglas de oro (no romper)
1. **NUNCA `supabase db push` ciego** desde `v2/enterprise`. El baseline squasheado recrearía tablas que prod ya tiene → error. (ver conflict report §3).
2. Backup de prod **antes** de tocar DB.
3. Código y DB se despliegan **coordinados**: si una migración agrega una columna que el código nuevo usa, la migración va **antes** o **junto** al deploy de código, nunca después.
4. Hay **2 frentes independientes**: (A) merge de código a `master` + deploy Vercel, y (B) sync de migraciones Supabase. B es el riesgoso.

---

## 1. Pre-flight (verificar en local ANTES de cualquier cosa)
- [ ] `pnpm typecheck` → limpio.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test` (Vitest) → verde.
- [ ] `supabase db reset` local + suite E2E enterprise (`tests/enterprise/`) → verde.
- [ ] `supabase db lint --local` → "No schema errors found".
- [ ] Confirmar paridad de **env vars** prod vs lo que el código nuevo espera (sección 4).
- [ ] Confirmar que `.env.local` apunta a local (`127.0.0.1:54321`), no a prod, para no mezclar.

---

## 2. PARTE A — Merge de código a `master`

### A1. Preparar la branch
```bash
git checkout v2/enterprise
git pull
git status            # árbol limpio
```

### A2. Reconciliar con master
```bash
git fetch origin master
git merge origin/master        # o rebase; resolver conflictos en local
pnpm typecheck && pnpm lint     # re-verificar tras merge
```
Puntos calientes de conflicto esperables: `middleware.ts`→`proxy.ts` (renombrado en esta branch), `package.json`/`pnpm-workspace.yaml` (migración a pnpm), `database.types.ts`.

### A3. PR a master
- Abrir PR `v2/enterprise` → `master`.
- CI debe correr: typecheck, lint, vitest, **`Enterprise RLS isolation`** (ya hay step dedicado en `.github/workflows/ci.yml`).
- Revisar que el PR **no** incluya artefactos ignorados (`test-results*`, `playwright-report/`, `supabase/.temp/`).
- ⚠️ NO mergear el PR hasta que la PARTE B (Supabase) esté planificada para la misma ventana.

---

## 3. PARTE B — Sync de migraciones Supabase (el paso crítico)

Resumen del plan seguro (detalle completo en `SUPABASE_MIGRATION_CONFLICT_REPORT.md` §4):

```bash
# Paso 0 — Backup completo de prod
supabase db dump --linked -f backup-prod-pre-enterprise.sql

# Paso 1 — Traer el batch 2026-05-28 que la branch nunca incorporó (7 migraciones)
supabase db pull          # en branch temporal; revisar archivos 20260528*

# Paso 2 — Marcar el baseline como YA aplicado (NO re-ejecutar; prod ya tiene ese schema)
supabase migration repair --status applied 00000000000001

# Paso 3 — Aplicar SOLO las migraciones enterprise nuevas (20260517+)
supabase db push          # una a una, verificando

# Paso 4 — Verificar
supabase db lint --linked
```

### Antes del Paso 3, revisar tabla de riesgo por migración
(conflict report §5) — verificar que el batch 28-may no haya tocado las mismas tablas:
`clients`, `coaches`, `organizations`, `check_ins`, `nutrition_plan_templates`, `workout_programs`, y especialmente **RLS de `check_ins`** (`20260530170000_fix_checkins_rls_leak`).

### Tras aplicar migraciones
```bash
# Regenerar tipos desde prod y commitearlos si difieren
supabase gen types typescript --linked > src/lib/database.types.ts
```

---

## 4. PARTE C — Env vars / secrets en prod (Vercel)
Verificar que existan en el entorno de producción (lista completa en `CLAUDE.md` + `MANUAL_TASKS.md §MT-25`). Críticas para enterprise:
- `SUPABASE_SERVICE_ROLE_KEY` (solo prod) — usado por todas las server actions admin (crear coach/cliente/staff).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `NEXT_PUBLIC_SITE_URL` = `https://eva-app.cl`; `ENTERPRISE_DOMAIN` = `enterprise.eva-app.cl`.
- `CRON_SECRET` (cron de snapshots semanales/onboarding).
- `RESEND_API_KEY` / `EMAIL_FROM` (emails transaccionales — nota: **alumnos enterprise NO reciben email** por decisión de producto; sí coaches/registro).
- `ADMIN_EMAILS`, VAPID keys, Upstash, MercadoPago, Edamam.
- **JWT hook:** confirmar que `custom_access_token_hook` está habilitado en Supabase Auth de prod (agrega `org_id`/`org_role`). Sin esto, el enterprise no autoriza.

---

## 5. PARTE D — Seguridad pre-prod (mismo release)
- [ ] **Migrar bucket `checkins` a privado + signed URLs** (hoy `public=true`; contiene fotos de salud). Ver `enterprise-reference-matrices.md §10`. Es el único hardening de seguridad pendiente antes de vender datos de salud.
- [ ] Verificar policies de `storage.objects` para `org-assets` en prod (cross-org write/list bloqueado).

---

## 6. PARTE E — Orden de deploy
1. Backup prod (B-Paso 0).
2. Aplicar migraciones Supabase (B-Pasos 1–4) y verificar verde.
3. Mergear PR de código → master → Vercel auto-deploya.
4. Configurar/confirmar dominio `enterprise.eva-app.cl` apunta al deploy.

> Migraciones primero, código después: el código nuevo asume columnas nuevas (`organizations.default_coach_capacity`, `check_ins.reviewed_at`, etc.).

---

## 7. PARTE F — Smoke post-deploy (prod)
- [ ] Login org_owner → `/org/[slug]` carga (Command center visible).
- [ ] Crear coach enterprise → recibe credenciales; login coach OK.
- [ ] Crear alumno → credenciales mostradas en pantalla (NO email a alumno); login alumno en `/c/[slug]/login` OK.
- [ ] Asignar alumno del pool → credenciales devueltas.
- [ ] Verificar aislamiento: org A no ve datos de org B (spot check).
- [ ] MFA: org_admin redirige a setup-mfa.
- [ ] Cron snapshots: disparar `/api/cron/*` con `CRON_SECRET` y verificar fila en `org_weekly_snapshots`.

---

## 8. PARTE G — Rollback
- **Código:** revertir el merge en `master` (`git revert -m 1 <merge_sha>`) → Vercel re-deploya el estado previo. Inmediato.
- **DB:** las migraciones enterprise son aditivas en su mayoría (`ADD COLUMN`, `CREATE TABLE/POLICY`). Rollback = restaurar `backup-prod-pre-enterprise.sql` (destructivo, pierde datos creados post-deploy) **o** escribir migraciones inversas puntuales. Preferir inversas puntuales si ya hay datos enterprise reales.
- **Regla:** no hacer rollback de DB si ya hay datos de clientes enterprise nuevos sin antes exportarlos.

---

## 9. Quick reference
```bash
# Local sano
supabase db reset && pnpm typecheck && npx playwright test tests/enterprise/ --workers=1

# Prod (ventana de deploy, con backup)
supabase db dump --linked -f backup.sql
supabase db pull                                  # capturar 20260528*
supabase migration repair --status applied 00000000000001
supabase db push
supabase db lint --linked
supabase gen types typescript --linked > src/lib/database.types.ts
```

> **Lo único que falta para poder mergear con seguridad:** correr el `supabase db pull` en branch temporal y evaluar los 7 archivos `20260528*` (drift no reconciliado). Hasta hacer eso, el deploy enterprise a prod fallaría o causaría drift silencioso.
