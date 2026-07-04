# Informe QA visual — Equipo / Composición corporal / Aprender (C3)

> Rama: `feat/redesign-eva-design-system`. App: `apps/web`.
> Tarea: `specs/deuda-rediseno/TASKS.md` C3 + `docs/audits/fase-l-wl2/informe-deuda-tecnica.md` ítem 3.
> Fecha: 2026-07-04. Seed contra **PROD** autorizado por el CEO. **Reversible** (documentada abajo).
> Resultado: las 3 pantallas rediseñadas renderizan con datos **fielmente al EVA DS** en light+dark a 1440+390. **0 fixes de presentación** necesarios (sin cambios de código de producto).

---

## 1. Qué se sembró (PROD — team "Movida (test)")

Script nuevo: `scripts/qa-seed-team-movida.mjs` (+ manifest `scripts/qa-seed-team-movida.json`).
Patrón calcado de `scripts/seed-josefit-design-qa.mjs` (service-role, idempotente, `--down`).
Team reusado: **`d0d0d0d0-0000-0000-0000-000000000001`** (slug `movida-test`, owner josefit `503412d0-…`).

### Coaches-miembro (3 nuevos) — `coaches` + `team_members`
| Nombre | Rol | coach_id | team_member_id | tag |
|---|---|---|---|---|
| Ana Torres | Co-gestor (`can_manage=true`) | `42c52d31-e04e-4364-a26e-1d94cf4923e5` | `ea7b9423-1428-4329-af0d-de489ba66e6e` | `coach-ana.qateam@evatest.cl` / invite `QATEAM-ANA` |
| Bruno Salas | Miembro | `19ef4191-2d80-4af7-928c-8680e15f430f` | `dc4a47ea-f028-4cf1-baef-75e916018147` | `coach-bruno.qateam@evatest.cl` / invite `QATEAM-BRUNO` |
| Carla Méndez | Miembro | `afbbaa7d-c6d2-46c3-8dc9-54a9649b426f` | `2de45a12-bd8a-45d5-bec4-19e997f4d6e5` | `coach-carla.qateam@evatest.cl` / invite `QATEAM-CARLA` |

`subscription_status='team_managed'` (fuera de billing standalone). Con josefit (owner) → **4 coaches activos**.

### Alumnos de pool (9 nuevos) — `clients.team_id = movida`, `org_id null`
| Alumno | coach asignado | estado | client_id |
|---|---|---|---|
| Sofía Reyes | Ana | programa activo | `4afa0825-c313-48f4-aaa2-8997513a9583` |
| Matías Rojas | Ana | programa activo | `299d2acf-39df-4e80-b2c9-ec8c95c984f2` |
| Isidora Vega | Ana | sin programa | `a5c90aac-0d6b-45c0-8d06-dec50f1c1359` |
| Benjamín Silva | Bruno | programa activo | `4dac8b5b-9cad-45af-8460-4a2efb2a3666` |
| Antonia Muñoz | Bruno | programa vencido | `d3378b72-8ce2-4037-a0ae-69efcdd311a5` |
| Joaquín Castro | Bruno | sin programa | `95417719-faeb-4d09-8d26-78dbb329d0de` |
| Emilia Fuentes | Carla | programa activo | `ce695675-3754-423b-8494-76b2e4a2823a` |
| Vicente Morales | Carla | programa vencido | `b5efc427-e585-4cf7-b295-ef135e393112` |
| Florencia Díaz | josefit | programa activo | `fff7728b-915a-453a-8f34-0f1c896511f6` |

Emails todos `pool-*.qateam@evatest.cl`. Estado dado por `workout_programs` (activo = end_date futuro; vencido = end_date pasado; sin programa = ninguno).

**Verificación post-seed (SQL):** `team_members` activos = **4**; pool total (incl. preexistentes) = **11**; `studentsByCoach` = Ana 3 · Bruno 3 · Carla 2 · Jose Fit 3.

### Guardrails respetados (NO tocado)
- Team `movida-test` y su fila: intactos.
- `team_member` preexistente de josefit `9f2518c3-eaf2-4383-b855-7aa6fe864069`: intacto.
- 2 alumnos de pool preexistentes: **Carolina** `f02e4d72-…` / **Diana** `d01efa48-…`: intactos.
- Cuentas `@evatest.cl` permanentes: el tag es el infijo **`.qateam@evatest.cl`** (que esas cuentas NO tienen). `Demo Alumno Josefit` (`josefit-alumno-demo@evatest.cl`) NO matchea el tag.

**Bodycomp: sin seed** (Demo Alumno Josefit ya tiene 3 BIA + 2 ISAK — suficiente para la serie). **Aprender: sin seed** (839 ejercicios globales).

---

## 2. Capturas (light+dark × 1440+390)

Carpeta: `D:/tmp/eva-qa-screens/fase-l-wl2/` — **20 PNG, 0 fallos/redirects** (`report.json`).
Tooling: `mint.mjs` (sesión SSR minteada de coach josefit + alumno Demo) + `capture.mjs`
(flip de `workspace_preferences` service-role entre `coach_team` y `coach_standalone`, restaurado a `coach_standalone` al cerrar).

| Pantalla | Ruta | Sesión / workspace | Archivos |
|---|---|---|---|
| **Equipo** | `/coach/team` | coach josefit · **coach_team** | `{light,dark}-{d1440,m390}__team.png` |
| **Composición (coach)** | `/coach/clients/bb2dd8bd-…/bodycomp` | coach josefit · **coach_standalone** | `{…}__bodycomp-coach.png` |
| **Composición (alumno)** | `/c/josefit/bodycomp` | alumno Demo | `{…}__bodycomp-alumno.png` |
| **Aprender** | `/c/josefit/exercises` | alumno Demo | `{…}__aprender.png` |
| **Aprender (búsqueda)** | `/c/josefit/exercises?q=press` | alumno Demo | `{…}__aprender-q.png` |

> Nota de captura: en 390 el bottom-nav flotante (fixed) se superpone a contenido inferior en algunas tomas — es artefacto de la captura full-page, **no** defecto de la página.

---

## 3. Juicio visual vs EVA DS

Revisión de tokens (`--sport/--surface/--text`), radios (`rounded-card/-control/-pill`), dark sin colores rotos y overflow móvil (390). **Ninguna de las 3 pantallas presentó drift de tokens, overflow horizontal del body, `100vh` fuera de `md:`, ni contraste roto en dark.** No se aplicaron fixes de código (no había defectos obvios de presentación).

**Equipo (`/coach/team`)** — VERDE. Desktop `CoachTeamDesktop`: KPIs (11 alumnos · 4/30 coaches · módulos), rail maestro-detalle con roles tonalizados (Owner=sport / Co-gestor=aqua / Miembro=neutral), matriz de permisos, código de invitación. Móvil: hero, anillo de cupos, brand studio, lista de miembros. Light y dark correctos. El brand del header/nav resuelve al color del **team activo** (azul sport) — correcto (theme-aware por workspace).

**Composición corporal** — VERDE. Coach (`BodyCompositionTabB6b`) y alumno: tabs Bioimpedancia/Antropometría, tarjetas de última medición, gráfico de evolución con tooltip, historial con borrar. El acento violeta en el contexto coach standalone / app del alumno es el **brand de josefit** vía `--sport` (mismo token que resalta el nav) — consistente, no hardcode. Dark correcto.

**Aprender (`/c/[coach_slug]/exercises`)** — VERDE. Chips de músculo con scroll horizontal, card destacada con video, grid de biblioteca (839), paginación "Ver más (813 restantes)"; `?q=press` filtra a 82 restantes. Badges de músculo bien tokenizados (`text-sport-300` sobre `bg-black/40`, theme-aware, `ClientExerciseCatalog.tsx:137`) — legibles en light y dark.

---

## 4. Hallazgos

Todos son **observaciones menores** — reportadas, **no arregladas** (ninguna es un defecto obvio de presentación; requieren criterio de diseño o son data real).

| # | Pantalla | Hallazgo | Verdict | Archivo:línea |
|---|---|---|---|---|
| H1 | Equipo | KPI **"Módulos activos = 0"**: el team `movida-test` tiene `enabled_modules = {}` (data real). No es defecto; si el CEO quiere el KPI poblado, togglear módulos del team en `/admin/teams`. | Reportado (data real) | `apps/web/src/app/coach/team/_components/CoachTeamDesktop.tsx:103,109` |
| H2 | Composición (móvil 390) | El grid de métricas es 3-col en 390 → labels/valores largos **envuelven a 2 líneas** ("Metabolismo basal", "1785 kcal"). Compacto pero legible; posible polish futuro (2-col en pantallas muy angostas). | Reportado (polish) | `apps/web/src/app/coach/clients/[clientId]/bodycomp/_components/BodyCompositionTabB6b.tsx` (grid de métricas) |
| H3 | Equipo (móvil) | Nombres de miembro truncan en 390 ("Ana Torres…") porque el seed usó `brand_name` largo ("Ana Torres · Nutrición"). Es **artefacto del dato de seed**, no de la UI (el `truncate` es intencional). | Reportado (dato de seed) | — |

**Fixes grandes:** ninguno. Las 3 pantallas están listas visualmente con datos.

---

## 5. Reversa exacta

El seed **NO se revierte** al cerrar QA (decisión CEO: quiere mirar las pantallas con datos). Cuando se quiera limpiar PROD:

```bash
cd D:/Proyectos/Antigravity/gymappjp
node scripts/qa-seed-team-movida.mjs --down
```

Qué borra el `--down` (por manifest `scripts/qa-seed-team-movida.json` + barrido defensivo por tag):
- 9 alumnos de pool `pool-*.qateam@evatest.cl` (hijos + fila `clients` + auth user).
- 3 filas `team_members` sembradas (por id de manifest; **nunca** la de josefit `9f2518c3-…`).
- 3 filas `coaches` `QATEAM-*` (invite_code prefijo `QATEAM-`) + sus auth users.

Invariantes garantizadas por el `--down` (guardrails en el script): NUNCA toca el team ni su fila, NUNCA el `team_member` de josefit, NUNCA Carolina/Diana ni ninguna cuenta `@evatest.cl` sin el infijo `.qateam@evatest.cl`, NUNCA el owner `503412d0`.

`workspace_preferences` de josefit quedó restaurado a `coach_standalone` (su valor original) por `capture.mjs`.

Artefactos de tooling (fuera del repo, borrables): `D:/tmp/eva-qa-screens/fase-l-wl2/` (capturas, cookies minteadas, `mint.mjs`, `capture.mjs`).
