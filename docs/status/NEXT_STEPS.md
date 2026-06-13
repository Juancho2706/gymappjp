# NEXT STEPS — Prioridades actuales

> Leer al inicio de cada sesión (referenciado en `CLAUDE.md`). Última actualización: 2026-06-12 (plan 04 consolidación planes+ciclos + gate Planes 2+3 + incidente E2E + archivado enterprise).

### Estado 2026-06-12 — Plan 04 consolidación de planes + ciclos (código + migración MRR)

**Plan:** `docs/plans/estrategia/04-PLAN-consolidacion-planes-ciclos.md`. Decisiones del dueño (2026-06-11, NO se re-litigan).

**Oferta pública consolidada — exactamente 4 planes: free + starter + pro + elite.**
- **Precios SIN cambios:** starter $19.990 · pro $29.990 · elite $44.990 (free $0). El dueño decidió dar más valor (techo elite 60→100) al mismo precio; revisión post-cierre Movida.
- **Ciclos: mensual, trimestral y anual seleccionables y cobrables en los 3 planes pagos** (antes el trimestral existía solo en elite+). El cobro trimestral ya corre en prod (MercadoPago `months=1/3/12`); habilitarlo en starter/pro fue solo abrir la compuerta de la constante.
- **pro marcado "Más popular"** en register y pricing (anchoring + paridad de superficies de venta).

**Política grandfather (growth/scale):** `growth` y `scale` salen de TODA superficie de venta (register, pricing, landing preview, reactivate, subscription upgrade, create-preference) pero quedan **intactos solo en runtime, admin y DB** — NO se borran del union type ni del `TIER_CONFIG`; el CHECK de DB no se toca. Los suscriptores legacy mantienen plan, precio y límite de alumnos mientras no cambien nada. Un grandfathered NO puede cambiar de ciclo ni reactivarse self-service en su tier muerto: se resuelve vía admin/soporte (ver `docs/operations/RUNBOOK.md`) o migrando a elite/Teams. `scale` además sigue siendo el placeholder de cuentas `team_managed`/`org_managed` — por eso jamás se borra del runtime.

**Techo elite = 100 alumnos** (subió de 60). El bump es **regalado** a los elite existentes vía UPDATE idempotente post-deploy (statuses `active`/`trialing`/`canceled`/`past_due`/`paused`; el webhook corrige `max_clients` al reactivar). Umbral del banner puente a Teams (`TeamsBridgeBanner`) ajustado a 80 (~80% del techo).

**Tarea diferida — revisión de copy IVA al constituir EVAapp SpA (F0-f / D5 del dueño):** SILENCIO total sobre IVA en TODO el copy de precios (pricing, landing, register, mails) hasta que el dueño constituya **EVAapp SpA** (en proceso, jun-2026). Ningún "+ IVA" ni "IVA incluido". Al constituirse la SpA, revisar todo el copy de precios para definir el tratamiento del IVA — ver `docs/operations/MANUAL_TASKS.md` MT-38 (revisión de copy legal al constituir la SpA).

**Migración MRR (única migración del plan, aditiva):** `CREATE OR REPLACE` de los 3 RPCs de MRR del admin (`get_platform_mrr_12_months`, `get_platform_revenue_by_cycle`, `get_platform_revenue_by_tier`) — corrige bug pre-existente (`scale=64990` desactualizado y `growth` ausente del CASE) → CASE final: starter 19990 · pro 29990 · elite 44990 · growth 84990 · scale 190000. + RPC nuevo `get_legacy_tier_counts()` (observabilidad de extinción del grandfather) + UPDATE elite→100. **AUTORADA, pendiente de aplicar en el GATE** (mismo branch/sesión del gate Movida; aditiva/idempotente/forward-only).

---

### Estado 2026-06-12 — Enterprise ARCHIVADO comercialmente (estrategia teams-first, F1-F4)
**Hecho:** visibilidad enterprise ejecutada. Crons `org-health-alert` + `payment-reminder` retirados de schedule en `vercel.json` (handlers vivos, sin disparo automático). Copy legal swapeado a "planes empresariales a medida" (la landing NO se tocó — es scope del plan 02). Precios enterprise googleables neutralizados + noindex. Proxy: `/org/*` en dominio principal → `/login`; el flujo de alumno `/e` sigue vivo por diseño; `/enterprise` se sigue sirviendo con noindex hasta el redirect 308 → `/pricing` (post-plan 02). Redirect 308 del subdominio `enterprise.eva-app.cl` pendiente de config en Vercel — paso manual. Motor enterprise intacto (infra compartida: workspace engine, org.service, JWT hook); única puerta activa: `/admin/orgs`. Cero impacto en teams ni en el gate de Movida. Ver `docs/plans/estrategia/01-PLAN-archivado-enterprise.md`.

**Siguiente: Plan 02 landing Teams-first** (`docs/plans/estrategia/02-PLAN-landing-teams-ui.md`) — nueva sección Teams en la landing pública + CTA "Para equipos". Luego plan 03 (módulos add-on de pago) y plan 04 (consolidación ciclos trimestral/anual).

---

### Estado 2026-06-12 (tarde) — Follow-up de PERFORMANCE: RESUELTO (cierra la raíz del incidente E2E)
**Hecho + en PROD (`master`, pusheado) + mergeado a `feat/movida-platform` (`fb210e8`):** el plan de optimización de Supabase. La causa raíz del incidente (queries `workout_logs limit=8000/3000` del progreso del alumno + detalle de cliente del coach) está atacada: **8 RPCs de agregación `SECURITY DEFINER`** (paridad bit-a-bit validada en tx-rollback), **índices covering** + FK nutrición, **historial del detalle de cliente acotado a 548d** (mata el full-scan ilimitado), **historial del alumno 90/180d**, **cap del streak a 730d**, **War Room sin N+1** (RPC `get_clients_streaks_by_ids`), `unstable_cache`→`React.cache`, `SELECT *` podados en catálogos. Mobile cableado completo; web PRs+volumen+historial. typecheck web+mobile + vitest 262 verdes. Smoke manual del dueño OK (+ fix de fotos check-in en overview con `unoptimized` + borrado del heatmap de actividad estilo GitHub). **Diferido opcional:** cablear las series 1RM web a RPC (mejora marginal de CPU) + Fase 5 (borrar JS muerto reemplazado). **Esto desbloquea correr el GATE E2E de forma más segura** (el dashboard del alumno ya no satura el Micro).

### Estado 2026-06-12 — GATE Planes 2+3: DB sellada, E2E diferido
**Hecho y en PROD** (commit `0d6c335`, branch `feat/movida-platform`): las **7 migraciones `20260611*` aplicadas** (exercises polimórfico + team catalog, workout_blocks/logs polimórficos, clients cardio, movement_assessment, body_composition, nutrition_exchanges) vía protocolo directo-en-LIVE (tx-rollback + snapshot `_bak_*` + apply, sin branch por drift). Seed intercambios (9 grupos + 40 foods). **Advisors 0 críticos**, **suites SQL 6/6 PASS**, `database.types.ts` oficial regenerado, typecheck + vitest 682 + build verdes. F0 orgs ya `active`.
**⚠️ INCIDENTE E2E (2do, mismo patrón que 2026-06-10):** la fase Playwright (`--project=separation --workers=1`, ~70 specs + server SSR) **saturó el Micro** → statement timeouts → "Unhealthy". Corte inmediato + restart del dueño → **recuperado y verificado sano** (data intacta, usuarios reales 200). Detalle en director Movida §9. **E2E DIFERIDO**: próxima sesión con compute Small 1-2h (o validación manual de módulos para la demo). NO rehacer contra el Micro. Reset de password de las 8 personas e2e a `Evatest-Gate-2026` (`.env.local`).
**FOLLOW-UP de performance (raíz del incidente, deuda PRE-existente, NO de estos planes):** el dashboard de **progreso del alumno** dispara queries `workout_logs ... limit=8000/3000` (historial de ~1 año, tabla de 7.335 filas) → cada pantalla del alumno es cara de servir, agrava la saturación. **Atacar en `main`** (afecta a TODOS los usuarios reales, aislado de las features de Movida): mapear todas las queries `limit=8000/3000` de `workout_logs` + optimizar (paginación / agregación en DB / RPC / materialized view). NO es el builder — es el progreso del alumno (`/c`) y el detalle de cliente del coach.


### Estado actual (2026-06-09 tarde) — Plan 1 Cimientos casi cerrado
**Hecho + en prod + testeado:** team pool completo (tablas/RLS/governance/consent Ley 21.719/gestión de miembros/CEO panel/app alumno `/t`), **SEPARACIÓN TOTAL de los 3 flujos** (nav-como-módulos `coach-nav.ts`, scoping 3-vías por workspace activo en todas las superficies, paridad de guards /e+/t, workspaces `coach_team`/`student_team`), **marca COMPLETA del team** (paridad white-label con organizations, editable por owner/co-gestor en Mi Equipo), **8 personas E2E permanentes** en prod (`docs/e2e-personas.md`, seed idempotente `pnpm seed:e2e-personas`) y **batería separation** (6 suites E2E ~58 casos + invariantes SQL INV8-14 + unit). Commits hasta `d08eea8`+ en `feat/movida-platform`.
**Próximo (en orden):** (1) **A.bis2** flujos de entrada al pool (resolve-invite/import/join sembrando `client_memberships` scope `team`). (2) **C Settings hub** (lo que queda: preferencias; marca team YA hecha). (3) **E awareness** (`last_edited_by` + badge). (4) **Builder áreas UI** (specced en `specs/movida-areas/`). Luego Plan 2 (entrenamiento polimórfico + cardio).

## Prioridad #1 — "Movida powered by EVA"

Construir los módulos/ajustes que Movida necesita para adoptar EVA como plataforma única. Branch **`feat/movida-platform`**.

- **Director:** [docs/plans/movida/00-DIRECTOR.md](../plans/movida/00-DIRECTOR.md) (decisiones, roles, research, milestones, bitácora).
- **Planes:** [01 Cimientos](../plans/movida/01-PLAN-cimientos.md) · [02 Entrenamiento](../plans/movida/02-PLAN-entrenamiento.md) · [03 Evaluación + Nutrición](../plans/movida/03-PLAN-evaluacion-nutricion.md).

### Decisiones LOCKED
Concepto pool = **`team`** (NO `workspace` — colisión). Alumno de pool = scope `team` en `client_memberships` + marca del team vía `/t/[team_slug]`. Legal = postura completa (Movida responsable / EVA encargado + consentimiento bloqueante + log de accesos). Módulos OFF + el pool manda. Aditivo sobre LIVE.

### Secuencia
1. **Plan 1 — Cimientos** (primero): team pool + identidad alumno + RLS por-tabla + guards de app + consentimiento + toggles + Settings + áreas custom + awareness.
2. **Plan 2 — Entrenamiento**: ejercicios polimórficos + cardio TrainingPeaks-lite.
3. **Plan 3 — Evaluación + Nutrición**: screening de movimiento + composición dual BIA/ISAK + nutrición intercambios + PDF branded.
> **Excepción de valor:** intercalar nutrición-intercambios + PDF branded apenas Cimientos exponga pool+toggles (paralelo a Plan 2), por riesgo de churn de Fran a Avena.

### Acciones bloqueantes ANTES de codear Plan 1
- [ ] Specs SDD: `specs/movida-team/` (identidad alumno + RLS + consentimiento), `specs/coach-modules-settings/`, `specs/workout-custom-areas/`.
- [ ] Migración `teams`/`team_members`/`clients.team_id` + `client_memberships` scope `team` + RLS por-tabla + helper `is_team_member()` + tests `team-isolation` + `get_advisors` — **en un branch de Supabase Pro** (create→apply→seed→test→advisors→merge→**delete mismo día**); ver Director §3.
- [ ] Pedir a Ani: export de ~300 alumnos · confirmar responsable del tratamiento (DPA) · valores kcal/macro por grupo de intercambio · fichas ISAK + reportes bioimpedancia · hoja del screening del kine. (kg/lb resuelto: ambos, default kg.)

### Disciplina de testing (OBLIGATORIA desde 2026-06-09 — lección del smoke con 5 bugs)
Cada ola, ANTES de reportar: `pnpm typecheck` + `pnpm build` + `pnpm test` (vitest) + suites SQL
(`tests/team/*.sql` tx-rollback + `identity-consistency.sql` read-only) + **E2E Playwright del flujo
tocado** (`npx playwright test tests/team/team-flows.spec.ts --workers=1` con credenciales `E2E_POOL_*`
por env, contra dev server). Toda feature de UI nueva trae su spec E2E del happy path EN LA MISMA tanda.
NUNCA reportar "verde" sin haber corrido la UI real: DB+build verdes NO garantizan el flujo (los 5 bugs
del smoke pasaron typecheck+build+RLS). Reglas E2E (research 2026): sin `networkidle` (RSC streaming);
`waitForURL` excluyendo la página de login del patrón; error overlay = `[data-nextjs-dialog]` en shadow
DOM (no `nextjs-portal`); asserts bidireccionales en aislamiento (A aparece Y B no aparece); workers=1
contra Supabase remota.

## Reglas clave
- **Supabase Pro (1 mes, hasta ~2026-07-09): validar en branch efímero → merge a prod en verde → borrar branch el mismo día** (branch cobra por hora; créditos/Spend Cap NO lo cubren). Sigue: aditivo/expand-contract, migrations idempotentes/forward-only, snapshot pre-merge, data sintética + RLS tests + `get_advisors` en verde, **jamás destructivo sobre data de clientes**. Al expirar: volver a aditivo-en-LIVE.
- Cálculo puro en `packages/calc/`; i18n keys es/en en el mismo commit; reglas mobile (`h-dvh`, safe-area) en módulos nuevos; kill-switch de operador + drift-guard de `database.types.ts` en CI.
- RLS **+ guards de app** (no solo RLS); gating de módulos server-side; datos de salud en Storage privado.
- SDD por feature; `pnpm typecheck`/`test`/`build` antes de cada commit; actualizar la **bitácora** del Director cada sesión.

## Nota menores
Contexto futuro (colegios/Kingston) implica consentimiento parental verificable; no habilitar el pool para menores hasta implementarlo.
