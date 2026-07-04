# Deuda del rediseño EVA DS — TASKS (chores)

**Status:** COMPLETADO 2026-07-04
**Owner:** TBD
**Last updated:** 2026-07-04
**Tipo:** Chores (no feature → sin SPEC/PLAN; SDD no exige specs para bugfix/chore)
**Informe fuente:** `docs/audits/fase-l-wl2/informe-deuda-tecnica.md` (ítems 2 y 3)
**Rama:** `feat/redesign-eva-design-system`

Tres chores independientes, ejecutables en cualquier orden. Ningún cambio de DB
salvo seed sintético **reversible** (C3). Gates de repo: `pnpm typecheck` + Vitest
por tanda; Playwright/E2E y cualquier SQL contra PROD **solo con OK explícito del
CEO**.

---

## C1 — Borrar `LogoUploadForm.tsx` (dead code)

- [x] **C1.1 — Verificar que es dead code**
  - Scope: `grep -r "LogoUploadForm" apps/web/src` debe devolver **solo** la línea
    de definición (`apps/web/src/app/coach/settings/LogoUploadForm.tsx:30`).
    Ningún `import` ni `dynamic(() => import(...))`.
  - Verification: 0 importadores confirmados.
- [x] **C1.2 — Confirmar que la server action conserva caller**
  - Scope: `updateLogoAction` (de `_actions/settings.actions.ts`) debe seguir
    siendo consumida por `apps/web/src/app/coach/settings/BrandSettingsForm.tsx`
    (el uploader de logo **vivo**). Borrar `LogoUploadForm.tsx` NO deja huérfana la
    action.
  - Verification: `BrandSettingsForm.tsx` sigue importando/usando `updateLogoAction`.
- [x] **C1.3 — Confirmar el `data-tour-id="brand-logo"`**
  - Scope: `LogoUploadForm.tsx:102` tiene `data-tour-id="brand-logo"`. Verificar
    que el tour (`_components/BrandSettingsTour.tsx`) apunta al elemento que **sí**
    se renderiza (el de `BrandSettingsForm`), no a este muerto. (Casi con certeza
    ya apunta al vivo; si no, el tour estaría roto en prod.)
  - Verification: el tour no queda apuntando a un id inexistente tras el borrado.
- [x] **C1.4 — Borrar el archivo**
  - Scope: eliminar `apps/web/src/app/coach/settings/LogoUploadForm.tsx` (185 líneas).
  - Verification: `pnpm typecheck` + `pnpm lint` verdes.

---

## C2 — Registro paso 2 "Elegí tu plan": selector como RADIO-CARDS

**Decisión CEO (bakeada):** el selector de planes del paso 2 del registro pasa a
**radio-cards** — tarjetas apiladas, precio + features visibles, tap-target
completo. **Solo cambia la presentación**; no se toca la lógica de selección ni de
add-ons.

- [x] **C2.1 — Ubicar el bloque actual**
  - Scope: `apps/web/src/app/(auth)/register/page.tsx`, `step === 2` (~línea 455).
    El bloque de planes vive en `<section>` con `tierOptions.map(...)` (~464-529):
    hoy son `<button type="button" onClick={() => setTier(key)}>` en `grid gap-2`
    (ya apiladas) que muestran label, badge de nutrición, "Hasta N alumnos · ciclo"
    y precio.
  - Verification: bloque localizado.
- [x] **C2.2 — Convertir a radio-cards (presentación)**
  - Scope: reemplazar la presentación de cada opción por una **radio-card**:
    - Semántica de radio: cada tarjeta es una opción de un `role="radiogroup"`
      (input radio nativo oculto o `role="radio"` + `aria-checked`), navegable por
      teclado (flechas/`Space`). Mantener el `onClick={() => setTier(key)}` /
      `setTier` como única fuente de selección — **no cambiar la lógica**.
    - **Tap-target completo:** toda la tarjeta es clickeable (ya lo es como
      `<button>`; preservarlo). Alto/padding cómodo para touch.
    - **Precio + features visibles:** mostrar precio (ya presente: `displayPrice`
      / "$0 · Sin tarjeta") y una **lista corta de features** por plan (usar los
      datos ya disponibles: `getTierCapabilities(key)`, `option.maxClients`,
      `getTierNutritionSummary(key)`, `getTierBillingCycleSummary(key)`; no crear
      nuevas fuentes de verdad de features/precios).
    - Preservar los badges "Gratis para siempre" / "Más popular" (pro destacado,
      paridad con `/pricing`) y el estado seleccionado
      (`border-sport-500 bg-sport-100 shadow-[var(--glow-sport)]`).
  - Tokens EVA + dark mode: reusar los tokens ya usados en el bloque
    (`--sport-*`, `--success-*`, `--warning-*`, `text-text-*`, `rounded-card`,
    `rounded-pill`). No introducir `100vh`/`h-screen` fuera de `md:`.
  - Verification: `pnpm typecheck` + `pnpm lint`; selección de plan y el bloque de
    "Frecuencia de pago" (`allowedCycleOptions`, ~532) siguen funcionando idéntico.
- [x] **C2.3 — No tocar la lógica de selección/add-ons**
  - Scope: `setTier`, `setBillingCycle`, `getDefaultBillingCycleForTier`, add-ons y
    el submit del registro quedan **intactos**. El cambio es solo de marcado/estilo.
  - Verification: flujo de registro completo (plan free y pago) sin regresión.

---

## C3 — QA visual: Equipo / Composición corporal / Aprender

*Ejecutado 2026-07-04 — 20 capturas, 0 fixes necesarios, informe `docs/audits/fase-l-wl2/informe-qa-visual-team-bodycomp-aprender.md`, seed revertido.*

**Decisiones (bakeadas):** reusar el team **"Movida (test)"** existente
(`team_id d0d0d0d0-0000-0000-0000-000000000001`, slug `movida-test`) con seed
**REVERSIBLE**; el `--down` borra **solo** lo sembrado y **jamás** el team legacy
ni sus 2 alumnos de pool preexistentes. Bodycomp ya tiene data (Demo Alumno);
Aprender no necesita seed (839 ejercicios globales). Flujo:
seed → capturas light/dark 1440+390 con mint-session → lista de fixes como tareas
nuevas.

> **Guardrail de scoping:** `clients.team_id` / `clients.coach_id` son
> **service-role-only** (column grants). El seed usa `SUPABASE_SERVICE_ROLE_KEY`.

- [x] **C3.1 — Script de seed de Equipo (reversible)**
  - Scope: crear `scripts/seed-josefit-team-qa.mjs` (+ manifest
    `scripts/seed-josefit-team-qa.json`, con `--down`), reutilizando la estructura
    y guardrails de `scripts/seed-josefit-design-qa.mjs`:
    - Crear **2-3 coaches-miembros** sintéticos (auth user + fila `coaches`, email
      `@josefit-teamqa.cl`) y sus `team_members` (status `active`, uno con
      `can_manage=true`) contra `team_id d0d0d0d0-0000-0000-0000-000000000001`.
    - Crear **8-10 alumnos de pool** (`team_id` = ese team, `org_id null`),
      repartidos entre los coaches-miembros (`clients.coach_id`) para poblar
      `studentsByCoach` (`team.queries.ts:80-83`).
    - Guardrail estricto: tocar **solo** emails `@josefit-teamqa.cl` y ese
      `team_id`; `--down` borra miembros + pool + auth users por manifest, y
      **nunca** borra el team ni los 2 alumnos de pool preexistentes.
  - Verification: `node scripts/seed-josefit-team-qa.mjs` puebla el team; `--down`
    lo revierte dejando el team legacy y sus 2 alumnos intactos. **Ejecución contra
    PROD solo con OK del CEO.**
- [ ] **C3.2 — (Opcional) Densificar bodycomp** *(no ejecutado — opcional, no bloqueante; ya había 3 BIA + 2 ISAK suficientes)*
  - Scope: opcionalmente densificar BIA de "Demo Alumno Josefit" (~5-6 BIA) para
    una curva de tendencia más vistosa, con mini-seed reversible dentro del
    guardrail existente. **No bloqueante** (ya hay 3 BIA + 2 ISAK).
  - Verification: reversible; opcional.
- [x] **C3.3 — Capturas light/dark × 1440/390 (mint-session)**
  - Scope: con el mecanismo mint-session existente, activar el workspace correcto y
    capturar cada ruta en **light y dark** a **1440 y 390** (4 capturas/ruta):
    - **Equipo** `/coach/team` — requiere **activar el workspace "Movida (test) -
      Equipo" en `/workspace/select`** (josefit es multi-workspace; sin la
      preferencia, `pickPreferredWorkspace` devuelve `null` y el guard de
      `team/page.tsx:24` redirige a `/coach/dashboard`). Desktop 1440 →
      `CoachTeamDesktop`; mobile 390 → section `md:hidden`.
    - **Composición corporal** `/coach/clients/{demoAlumnoId}/bodycomp` (coach) +
      `/c/josefit/bodycomp` (alumno, login como "Demo Alumno Josefit").
    - **Aprender** `/c/josefit/exercises` (catálogo global; probar `?q=` y chips de
      músculo). No requiere seed.
  - Verification: set completo de capturas (light/dark × 1440/390) por ruta.
- [x] **C3.4 — Redactar lista de fixes como tareas nuevas** *(0 hallazgos — nada que listar)*
  - Scope: de las capturas, producir una **lista de fixes** con **archivo:línea**
    por cada uno (drift de tokens `--sport-*`/`--text-*`/`--surface-*`, contraste
    dark, overflow horizontal, `h-dvh`/`100vh` fuera de `md:`, radios EVA). Cada
    fix se levanta como **tarea nueva** (no se arregla ciego en este chore).
  - Verification: lista de fixes accionable con archivo:línea.
- [x] **C3.5 — Limpiar PROD al cerrar QA**
  - Scope: `node scripts/seed-josefit-team-qa.mjs --down` (y el bodycomp opcional
    si se sembró) para dejar PROD limpio.
  - Verification: team legacy y sus 2 alumnos preexistentes intactos; sin filas
    `@josefit-teamqa.cl` residuales.

---

## Universal Definition of Done

- [x] `pnpm typecheck` verde por chore tocado
- [x] `pnpm lint` verde (C1, C2)
- [x] Vitest de dominio tocado si aplica (C1/C2 no tocan lógica testeable nueva)
- [x] Mobile viewport usa `dvh`, no `vh`/`h-screen` (C2)
- [x] Dark mode verificado cuando cambia UI (C2, y en las capturas de C3)
- [x] Seeds de C3 son reversibles (`--down`) y respetan el guardrail (solo
  `@josefit-teamqa.cl` + `team_id d0d0d0d0-…0001`; nunca el team legacy ni sus 2
  alumnos)
- [x] Cualquier ejecución de seed/SQL contra PROD y Playwright/E2E: **solo con OK
  explícito del CEO**
- [x] Docs actualizados si cambian rutas/flujos (no se esperan cambios de ruta)

## Notes

- C1 y C2 no tocan DB. C3 solo agrega data sintética reversible (nunca borra data
  legacy).
- C2 es **solo presentación**: la lógica de selección de plan/add-ons no se toca.
- Para `/coach/team` el paso obligatorio es activar el workspace del team en
  `/workspace/select` — documentarlo en el runbook de QA.
