# NEXT STEPS — Prioridades actuales

> Leer al inicio de cada sesión (referenciado en `CLAUDE.md`). Última actualización: 2026-06-08 (sesión de revisión multi-lente).

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

## Reglas clave
- **Supabase Pro (1 mes, hasta ~2026-07-09): validar en branch efímero → merge a prod en verde → borrar branch el mismo día** (branch cobra por hora; créditos/Spend Cap NO lo cubren). Sigue: aditivo/expand-contract, migrations idempotentes/forward-only, snapshot pre-merge, data sintética + RLS tests + `get_advisors` en verde, **jamás destructivo sobre data de clientes**. Al expirar: volver a aditivo-en-LIVE.
- Cálculo puro en `packages/calc/`; i18n keys es/en en el mismo commit; reglas mobile (`h-dvh`, safe-area) en módulos nuevos; kill-switch de operador + drift-guard de `database.types.ts` en CI.
- RLS **+ guards de app** (no solo RLS); gating de módulos server-side; datos de salud en Storage privado.
- SDD por feature; `pnpm typecheck`/`test`/`build` antes de cada commit; actualizar la **bitácora** del Director cada sesión.

## Nota menores
Contexto futuro (colegios/Kingston) implica consentimiento parental verificable; no habilitar el pool para menores hasta implementarlo.
