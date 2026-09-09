---
status: draft
owner: product-engineering
last_verified: "2026-09-08"
canonical: false
---

# TASKS — Porciones a la chilena (Nutrición V2)

`[ ]` pendiente · `[x]` hecha. Nada se marca verde sin ejecución real; cada ola cierra con su línea de «Gates» y la
salida pegada. El modelo de cada tarea va entre corchetes. Arquitectura y archivos exactos: [PLAN](PLAN.md); valores,
SQL y tablas copiables: [DATA](DATA.md); decisiones y evidencia: [SPEC](SPEC.md).

**Orden obligado: dato antes que código** (W0 antes que todo), **motor antes que superficie** (W1 antes de W2/W3/W4),
**dry-run aprobado antes de escribir equivalencias**, **y el set chileno nace apagado**: el seed de W0 escribe los 13
grupos con `deleted_at = now()` y recién W6.8 los enciende, en la misma ventana del deploy que lleva a producción el
filtro de visibilidad (W1.4/W1.5/W1.6) y el conteo del picker (W1.9). Sin eso, entre W0 y W6 los 106 coaches verían 22 filas
mezcladas —`xg_select` (`20260611093001:167-173`) deja leer todo `is_system` a cualquier `authenticated` y
`findExchangeGroupsForScope` (`apps/web/src/infrastructure/db/exchanges.repository.ts:89-104`) no tiene condición de
set— y con «0 equivalencias» en el conteo web (`portions-groups.actions.ts:64-84`). El único filtro que ya está vivo hoy
y ordena ese hueco es `deleted_at is null`, presente tanto en la policy como en el repo.

W2 ∥ W3 ∥ W4 en worktrees distintos; merge en el orden W2 → W4 → W3. Los dos wizards (`apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx` y
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PortionsGroupPicker.tsx`) **no se tocan y no se
prueban**: sus rutas están retiradas. Por lo mismo, las tres copias de `sortGroupsForPicker`
(`builder/_components/portions-state.ts:234`, `apps/mobile/lib/nutrition-v2-builder-portions.ts:253`) quedan **fuera
del tren**: el orden del picker vivo se resuelve en `comparePickerGroups` + partición en el consumidor (W1.7).

**Colisiones declaradas entre las olas paralelas** (además de `packages/nutrition-v2/editor-state.ts`, ya declarada en
PLAN §Orden): `apps/mobile/components/nutrition-v2/quick-edit/EditablePortionsSection.tsx` y
`apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/EditablePortionsCard.tsx` los tocan **W2** (picker por
secciones, fila usada, stepper) **y W3** (banner del plan legado). Para no rebasar W3 sobre archivos que W2 reescribe:
**la carcasa del banner se monta en W2** (W2.4 y W2.7, con `onPress`/`onClick` recibido por prop y oculto si no llega)
y **W3.6 solo la cablea** al conversor. Si el owner prefiere no adelantar UI de W3, la alternativa es serializar
W3 después de W2 y sumar una jornada al calendario.

**Estimación revisada (R-17): ~12 días-agente** — W0a 1 d · W0b 2 d · W1 2 d · W2 2 d · W3 2 d · W4 1 d · W5 1,5 d ·
W6 0,5 d. La curaduría de `generic-foods-cl.json` (165 filas transcritas de láminas + desambiguación de `food_id`
contra un catálogo donde «arroz» da 88 coincidencias y «queso» 195) es una jornada por sí sola, y por eso W0 se parte
en dos.

## W0a · Datos — DDL, seed y verificaciones (1 d)

- [x] W0.0 [jefe] SDD copiado a `docs/specs/nutrition-porciones-chilenas/` (`status: draft`, `canonical: false`; SPEC y TASKS
      normalizados a LF) el 2026-09-09 · `pnpm docs:check` ⇒ **OK — 20 canónicos, 257 Markdown activos**; `docs/README.md` no
      lista specs una por una, así que no pidió entrada nueva.
- [x] W0.1 [Sonnet] `supabase/migrations/20260909120000_exchange_groups_portion_system.sql`: columnas
      `exchange_groups.portion_system` (default `'smae'`) y `coaches.portion_system` (default `'cl'`), CHECKs
      idempotentes vía `pg_constraint`, `grant update (portion_system) on public.coaches to authenticated`, comentarios
      de columna. **Criterio**: dentro de `BEGIN … ROLLBACK`, `select portion_system from public.exchange_groups limit 1`
      ⇒ `'smae'`; `select portion_system from public.coaches limit 1` ⇒ `'cl'`; el `insert` de una fila con
      `portion_system = 'xx'` falla por CHECK; correr la migración dos veces no da error.
- [x] W0.2 [Sonnet] `supabase/migrations/20260909120500_exchange_groups_no_duplicate_system_code.sql`: índice único
      parcial `exchange_groups_system_code_uq`. **Criterio**: la consulta previa de códigos del sistema duplicados
      devuelve 0 filas; con el índice creado, insertar un segundo `is_system` con `code = 'C'` falla con 23505.
- [x] W0.3 [Sonnet] `supabase/migrations/_POST_DEPLOY_20260909121000_exchange_groups_cl_seed.sql`: 13 filas de DATA
      (UUID `0000e8c1-…0001..0013`, `is_system = true`, `portion_system = 'cl'`, `macros_confirmed = true`,
      `composed_of = null`, `sort_order` 210–330, `color` de la paleta) **con `deleted_at = now()`** (nacen apagadas; el
      `do update` NO las revive: nada de `deleted_at = null` acá, eso es exclusivo de W6.8),
      `on conflict (id) do update … where exchange_groups.macros_confirmed = false` y los asserts. **Sin backfill de
      `coaches`** (RESOLUCIONES-2 §A **R14-bis**, aplicado en DATA §0/§3/§3.4 y SPEC §5.2): nadie sale de `'cl'`; el
      SMAE se ofrece como «Legado» mientras `findUsedPortionSystemsForCoach` lo devuelva y desaparece solo al
      convertir (S1 literal, sin un solo write). El bloque B del `_POST_DEPLOY_` queda **eliminado**.
      **Criterio**: en tx, `count(*) where portion_system = 'cl' and is_system` = 13 y **las 13 con
      `deleted_at` no nulo**; `count(*) where is_system and deleted_at is null` sigue en **9** (el picker de los 106
      coaches no cambia); **`count(*) from public.coaches where portion_system = 'smae'` = 0** (la migración no escribe
      una sola fila de `coaches`); `raise notice 'seed cl OK'` aparece; re-correrlo no cambia ninguna fila (0
      `updated_at` nuevos).
- [x] W0.4 [Sonnet] `…_exchange_groups_cl_seed_rollback.sql` con **las dos ramas excluyentes** que fijan
      RESOLUCIONES-2 §B **R-01** y DATA §3.4. La bisagra es una sola pregunta: *¿algún target o borrador ya referencia
      un grupo `'cl'`?* **El archivo NO toca `coaches.portion_system`** (nadie fue backfilleado: R14-bis) y **nunca**
      pone `deleted_at` sobre un grupo ya prescrito.
      **Rama (a) — nadie los usa** ⇒ `update public.exchange_groups set deleted_at = now(), updated_at = now() where
      is_system and portion_system = 'cl' and deleted_at is null`: vuelve al estado «apagado» en que nacieron (W0.3), el
      set desaparece del picker y volver a encenderlo es el `update` de W6.8.
      **Rama (b) — hay targets o borradores chilenos** ⇒ **`raise exception`** con el conteo, y el rollback es **de
      código**: revertir el deploy y las dos OTAs. Apagar ahí rompe producción — `xg_select` exige `deleted_at is null`
      (`20260611093001:166-173`) y `resolveExchangeGroupsForDraft` (`plan-persistence.ts:369-382`) falla cerrado con
      `EXCHANGE_GROUP_NOT_FOUND` (`:376-381`) ⇒ todo borrador con un target chileno queda **impublicable** y el coach ni
      siquiera puede quitar el grupo, porque tampoco está en el picker. Sin el filtro desplegado los 22 grupos se ven
      mezclados: feo, no roto. `exchange_group_foods` **no se borra en ningún caso** (filas inertes si el grupo no se
      ofrece; borrarlas obliga a re-correr el dry-run y el OK del owner).
      **Criterio**: aplicado en tx **después del seed y del encendido de W6.8**, con 0 targets chilenos ⇒
      `count(*) where portion_system='cl' and deleted_at is null` = 0, `raise notice 'rollback cl OK'`, y los asserts
      finales «9 SMAE vivos» y «0 `cl` vivos»; con ≥ 1 target chileno ⇒ **aborta** y no cambia ninguna fila; **delta de
      `public.coaches` = 0 filas** en las dos ramas; **ningún** `delete` sobre `exchange_groups` ni sobre
      `exchange_group_foods`; aplicado sin el encendido es un no-op limpio (0 filas afectadas).
- [x] W0.5 [Sonnet] `supabase/tests/exchange_groups_portion_system_rollback.sql` (mismo basename que la migración +
      `_rollback`, patrón de `supabase/tests/nutrition_v2_household_units_rollback.sql`): casos A) columna y CHECK
      existen · B) el índice único rechaza códigos repetidos · C) un coach `authenticated` puede actualizar su
      `portion_system` y no el de otro · D) `xg_select` deja leer los 13 a un `authenticated` cualquiera **una vez
      encendidos** (dentro de la tx: `update … set deleted_at = null`, que es lo que hará W6.8) y **no** los deja ver
      mientras estén apagados (el caso se afirma en los dos sentidos) · E) un coach
      NO puede escribir un grupo `is_system`. **Criterio**: los 5 casos verdes dentro de `BEGIN … ROLLBACK`.
- [x] W0.6 [jefe] Tx de validación en LIVE por MCP `execute_sql`: `BEGIN` + W0.1 + W0.2 + los **seis** `EXPLAIN`
      (1 picker del coach · 2 `code = 'PCT'` · 3 `exchange_group_foods` por grupo · 4 conteo de coaches con targets SMAE (dimensiona el aviso; **no mueve a nadie**) · 5 índice
      único parcial · **6 `findUsedPortionSystemsForCoach` en su forma por-request** —
      `select distinct g.portion_system from nutrition_slot_exchange_targets_v2 t join nutrition_plan_versions_v2 v on
      v.id = t.version_id join nutrition_plans_v2 p on p.id = v.plan_id join exchange_groups g on
      g.id = t.exchange_group_id where p.coach_id = $1 limit 2`, el join de cuatro tablas que corre en **cada apertura
      del picker** en las dos superficies) + `ROLLBACK`. **Criterio**: el conteo de coaches con targets SMAE da **9** y queda pegado acá **solo para dimensionar el aviso —
      no se mueve a nadie de set** (R14-bis: no hay backfill); el picker
      resuelve por Seq Scan sobre ~22 filas (no se justifica índice nuevo); el EXPLAIN 6 se corre con el `coach_id` del
      coach con más targets vivos y su plan queda pegado acá — **índice: ninguno por defecto (D-3)**; solo si ese plan
      muestra un **seq scan relevante** sobre `nutrition_slot_exchange_targets_v2` se agrega `(version_id,
      exchange_group_id)` en una **migración aparte** con su tarea propia en W1 (nada de índices preventivos); salida de
      los seis pegada acá.
## W0b · Datos — script, curaduría, dry-run y apply (2 d)

- [x] W0.7 [Opus] `scripts/nutrition-portions-cl/derive-cl-equivalences.mjs` con `--dry-run` y `--apply`: deriva gramos
      con `suggestPortionGrams` **forzando el macro clave por grupo**, descarta `null` y > 5.000 g, redondea con
      `roundPortionGrams`, y escribe `scripts/output/cl-equivalences-<fecha>.md`. **Dos ejes se parten por grasa, no
      uno** (RESOLUCIONES-2 §A R16): el lácteo y **el de carnes**. Para carnes, `fatEnergyShare(food)` = kcal desde
      grasa / kcal totales: **`share ≤ 0,40` ⇒ `CB`** · **`share > 0,40` ⇒ `CA`** · **`share == null` ⇒ descartar**.
      Fundamento del umbral: `CB` = 2 g × 9 / 65 kcal ≈ 28 % y `CA` = 8 × 9 / 120 = 60 %. Sin este corte, las 603 filas
      de `P` caerían enteras en `CB` y una longaniza de ~80 g se le mostraría al alumno como «1 porción de Carnes bajas
      en grasa» (65 kcal · 2 g de grasa) cuando son ~250 kcal y ~22 g: es el dato falso que este tren viene a evitar.
      **Además, el universo derivado excluye todo `food_id` presente en `generic-foods-cl.json`** (RESOLUCIONES-2 §B
      R-13): los curados se cargan primero y mandan; sin esa exclusión el mismo alimento quedaría en dos grupos con dos
      gramajes (el `on conflict` no protege, porque son grupos distintos) — es el caso del yogurt natural (47 % de kcal
      desde grasa ⇒ `LE` por dato, `LS` por manual: **manda el curado**, sin allowlist por nombre).
      **Criterio**: el dry-run no abre ninguna transacción de escritura; el informe trae conteo por grupo, distribución
      de gramos, top 20 sospechosos, la auditoría de filas SMAE con > 20 % de desvío, **la distribución de
      `fatEnergyShare` en el eje carnes** y **qué filas curadas vienen de INTA y no de UDD** (R-15); verificación
      obligatoria antes del `--apply`: **los ~15 genéricos de carnes del JSON curado caen 15/15 en el grupo que dice el
      manual**; `--apply` usa `on conflict … do nothing`. **La consulta que resuelve los 13 grupos destino NO filtra
      `deleted_at is null`** (están apagados hasta W6.8): se resuelven por `portion_system = 'cl' and is_system`, y el
      script aborta si encuentra menos de 13. Sin fallbacks literales de env.
- [x] W0.8 [Sonnet] `scripts/nutrition-portions-cl/generic-foods-cl.json`: 30–50 genéricos por grupo con `group_slug`,
      `food_name`, `portion_grams`, `portion_label` y la página del manual. **Criterio**: incluye como mínimo marraqueta
      y hallulla ½ unidad 50 g, pan molde 2½ rebanadas 60 g, arroz cocido ¾ taza 130 g, papa cocida 1 unidad 150 g,
      leche descremada 1 taza 200 cc, aceite 1 cucharadita 5 cc, legumbres cocidas ¾ taza; ningún `portion_label` supera
      40 caracteres (CHECK `egf_portion_label_len`); donde INTA y UDD difieren manda UDD y se anota INTA.
      Además: (a) **coherencia label↔gramos por grupo** (R-14) — dentro de `LGS`, «¾ taza» es **un solo gramaje: 130 g**
      para poroto, garbanzo y lenteja cocidos (BRIEF §4 y OUTLINE §5.3); si un alimento pide otro gramaje, cambia la
      medida casera, no el número; (b) **la palta va a `AG`, 30 g = 2 cucharadas** (RESOLUCIONES-2 §B R-16): el grupo
      INTA «ricos en lípidos» de 175 kcal **no existe** en el set UDD y **no se crea un grupo 14**; queda anotado en el
      JSON y en SPEC «Fuera de alcance»; (c) las 23 filas de `CA` y `LGS` salen de INTA pp. 28 y 30 porque el escaneo
      UDD salta de p. 57 a p. 61 y de p. 73 a p. 77 (R-15): se aceptan para W0 —los encabezados imprimen los mismos
      macros— y queda el ítem de backlog «verificar `CA` y `LGS` contra las láminas UDD si aparece el escaneo completo».
- [ ] W0.9 [owner] OK del informe del dry-run (artifact
      https://claude.ai/code/artifact/8494a516-51ef-4b2f-a21f-37dcb2d06330, publicado 2026-09-09 con las preguntas Q1–Q5:
      12 alimentos sin catálogo · 3 excepciones de carnes · 7 macros dudosas + 14 representantes de marca · apply · dónde vive
      la rama). **Criterio**: respuesta explícita del owner citada acá con fecha; sin eso no se corre `--apply`.
- [x] W0.10 [jefe] Aplicar por MCP en LIVE: 120000 → 120500 (inertes: solo columnas con default e índice parcial) →
      seed **apagado** (13 filas con `deleted_at` no nulo), más `get_advisors` (security + performance). **Criterio**:
      `count(*) from exchange_groups where is_system and deleted_at is null` sigue en **22 − 13 = 9** (nada cambia para
      los 106 coaches); `count(*) where portion_system='cl' and is_system` = 13; 0 advisors nuevos; registrar **archivo**
      y **versión LIVE** de cada migración (pueden diferir). **El criterio «= 22» se verifica en W6.8, no acá.**
- [ ] W0.11 [jefe] `--apply` del script + genéricos curados (se puede correr con los grupos apagados: `exchange_group_foods`
      referencia el `exchange_group_id`, no la visibilidad, y el script corre con service-role). **Criterio**: assert
      «0 filas con `coach_id` u `org_id` no nulo modificadas»; las 19 filas propias de coaches siguen con su `updated_at`
      anterior; ninguna de las filas escritas es visible para un coach mientras el set siga apagado (chequeo: el picker
      web de una cuenta de prueba sigue mostrando las 9 filas de siempre).
- [ ] W0.12 [Sonnet] Verificaciones SQL post-seed, con el número al lado (patrón Q1…Q6): Q1 grupos `'cl'` sembrados = 13,
      **todos con `deleted_at` no nulo** (vivos = 0 hasta W6.8) ·
      Q2 códigos del sistema duplicados = 0 · Q3 coaches en `'cl'` = **106** y en `'smae'` = **0** (R14-bis: nadie se movió; los 9 con targets SMAE se cuentan aparte, por sus targets, no por la columna) · Q4 equivalencias nuevas por
      grupo (esperado > 0 en los 12 derivables; `VL` puede ir en 0 + los curados) · Q5 muestra de 10 gramos por grupo
      (PCT arroz cocido ≈ 130 g, no ≈ 20 g) · Q6 filas con `portion_label` no numérico ≥ 30 por grupo curado ·
      **Q7 `0 filas en `CB` cuyo alimento tenga `fatEnergyShare > 0,40`** (el control del corte de carnes de R16) ·
      **Q8 `0 `food_id` derivado que también esté en `generic-foods-cl.json`** (el control de la exclusión de curados,
      R-13) · **Q9 `0 alimentos con filas en dos grupos del set chileno** (una fila por `food_id` por eje).
      **Criterio**: las nueve consultas con su resultado pegado acá.
- [x] W0.13 Gates W0a (2026-09-09, jefe, salida real en [TEST_STATUS](../../testing/TEST_STATUS.md)): tx-rollback con los
      seis EXPLAIN ✔ · `supabase/tests/exchange_groups_portion_system_rollback.sql` **A–G OK** en LIVE con ROLLBACK ✔ ·
      Q1–Q3 ✔ (Q4–Q9 recién tras el `--apply`) · `node --check` del script ✔ · `pnpm docs:check` OK (el SDD ya vive en
      `docs/specs/nutrition-porciones-chilenas/` desde W0.0, así que sí verificó el tren). W0b: dry-run ✔ (cero escrituras),
      `--apply` pendiente del OK del owner (W0.9).
- [x] W0.14 [Fable] Juicio de W0 sobre el diff real: 7 archivos, **0 BLOQUEA** al cierre (el refutador de W0.7 levantó 2,
      corregidos en una ronda: control del corte de carnes sobre el universo curado COMPLETO —no sobre «los que resolvieron»—
      y dedupe ARL+G antes de contar); MEJORA aplicadas por el jefe: ruta del SDD y runner `jiti` en la cabecera del script,
      más las decisiones (a)–(f) del registro de abajo. Detalle y evidencia: «Registro W0a + W0b».

### Registro W0a + W0b (dry-run) — 2026-09-09, jefe Fable, worktree `porciones-chilenas` (rama local, sin push)

**Archivos nuevos (7)**, escritos por workers Sonnet/Opus y refutados uno a uno por un revisor Opus: las 2 migraciones, el
`_POST_DEPLOY_` y su rollback (byte-idénticos a DATA §1–§3.4), `supabase/tests/exchange_groups_portion_system_rollback.sql`
(casos A–E de DATA §10.1 + F/G de los criterios C/D de W0.5; **corrige `coaches.org_id` → `active_org_id`**, columna que
DATA citaba y no existe), `scripts/nutrition-portions-cl/derive-cl-equivalences.mjs` y `generic-foods-cl.json` (165 filas
del manual + por fila `food_id`/`aliases`/`control_exception`/`match_note`/`needs_owner`/`macros_dudosos`, y `skip` +
`skip_reason` para omitir a propósito).

**LIVE (`jikjeokundmaafuytdcx`), en este orden:**

1. **W0.6 tx-rollback** por MCP: verificación previa 0 códigos duplicados · 120000 y 120500 dos pasadas sin error · defaults
   `smae`/`cl` · CHECK 23514 con `xx` · 23505 con `C` y, tras encender el set dentro de la tx, con `FR` · seed 13 apagados +
   9 SMAE vivos, re-run con 0 `updated_at` movidos · encendido simulado = 22 vivos · rollback rama (a) ⇒ 9 vivos.
   EXPLAIN (analyze, buffers): E1 picker `josefit` Seq Scan 23 filas **0,05 ms** · E2 `code = 'PCT'` Seq Scan 0,02 ms ·
   E3 `exchange_group_foods` por grupo Index Scan `egf_group_food_owner_uq` (PCT vacío 1,2 ms frío; C con 706 filas Bitmap
   0,4 ms) · E5 índice parcial: Seq Scan (27 filas; el planner no lo necesita y está bien) · **E6
   `findUsedPortionSystemsForCoach`** en la forma `exists` sobre `exchange_groups` (DATA §7.1): **11,6 ms** frío para
   `josefit` (140 targets vivos), 0,9 ms para `joaquinamr7` (0 targets), hashed SubPlans con
   `nutrition_plan_versions_v2_effective_idx` + `nstet_version_id_idx`, **sin seq scan sobre
   `nutrition_slot_exchange_targets_v2`** ⇒ **D-3: ningún índice nuevo**; la forma join de este mismo W0.6
   (targets → versions → plans → groups, `limit 2`) da **0,3 ms** ⇒ **W1.3 implementa la forma join** (una por rama V2/V1,
   unidas), no el `exists` por grupo. Audiencia del Legado: V2 ventana estrecha **9** · V1 **1** · unión **9** · cualquier
   versión 9 (ventana estrecha = amplia: no hay nada que decidir antes de W1).
2. **W0.10 aplicado**: `apply_migration` ⇒ versiones LIVE **`20260909163802`** (archivo `20260909120000`) y
   **`20260909163812`** (archivo `20260909120500`); seed por `execute_sql` en tx explícita a las 16:40Z (`seed cl OK`).
   Verificación posterior: 2 columnas `text not null` con default, 2 CHECKs, índice `exchange_groups_system_code_uq`,
   `authenticated:UPDATE` sobre `coaches.portion_system`. `get_advisors` security + performance ⇒ **0 hallazgos nuevos**
   (solo `multiple_permissive_policies` preexistentes de `xg_service`).
3. **W0.5 en LIVE** con ROLLBACK ⇒ **«W0.5 SMOKE OK: casos A-G sin excepcion»**.
4. **W0.12 Q1–Q3**: Q1 = 13 sembrados / 13 con `deleted_at` / 0 vivos · sistema vivo = 9 · Q2 = 0 duplicados · Q3 = **112**
   coaches en `cl` / 0 en `smae` (este TASKS decía 106: al 09-09 hay 112 coaches). Q4–Q9 recién tras el `--apply`.

**W0b dry-run** (`pnpm exec jiti scripts/nutrition-portions-cl/derive-cl-equivalences.mjs --dry-run`; **`tsx` NO está en el
lockfile, `jiti` sí** —dependencia transitiva— y por eso el script y DATA §4.7 se corren con `jiti`; cero escrituras; informe en
`scripts/output/cl-equivalences-20260909.md`): universo **2.507 = conteo exacto** · a insertar **2.341 derivadas + 153 curadas**
· curados **153/165** resueltos (137 genéricos, 14 representantes de marca, 2 alias), **0 ambiguos**, **12 sin alimento en el
catálogo** (Leche saborizada descremada sin azúcar, Congrio, Plateada, Chícharo, Pepino dulce, Pan amasado, Mote de trigo,
Aceite de maíz, Aceite de soya, Margarina diet, Miel de palma, Dulce de camote) · control de carnes **28/30** (0 mal
clasificados · 3 excepciones declaradas: Lomo liso 54 % y Huevo entero 63 % en `CB` por UDD p. 57, Jamón 34 % en `CA` por
INTA p. 28 · 2 sin resolver = Congrio y Plateada) · **0 filas en `CB` con share > 0,40** · auditoría SMAE (R7)
**954/2.507 (38 %) divergen > 20 %** (LAC 71 %, V 63 %, F 61 %, LEG 0 %) · 7 snacks «sabor queso» excluidos del insert ·
64 curados difieren > 15 % del derivado (manda el manual). **`--apply` BLOQUEADO** hasta resolver las 12 filas (W0.9).

**Decisiones del jefe durante W0 (rastro en el código):** (a) la resolución prefiere el **genérico** (`brand is null`): las
marcas homónimas se ignoran y solo dos genéricos homónimos cuentan como ambigüedad —sin esto el primer dry-run daba 36 ambiguos
y 93 sin match—; (b) «misma etiqueta con gramajes distintos» es **informativo, no bloquea** (el manual da 1 taza = 50 g de
zanahoria y 100 g de brócoli; R-14 solo fijó las legumbres cocidas de `LGS`); (c) `control_exception` por fila para que el
manual mande sobre el % de kcal desde grasa **con la página escrita**; (d) `skip: true` + `skip_reason` por fila para omitir a
propósito un alimento inexistente sin bloquear el apply; (e) `keywordSuspect` en el eje lácteo **excluye** del insert (antes
solo listaba); (f) **trampa del seed SMAE de junio**: sus `foods` («Pan marraqueta», «Pan hallulla», «Arroz cocido»,
«Aceite de oliva»… sin marca) llevan macros = ref del grupo (70 kcal por 50 g de marraqueta): los curadores los esquivaron
eligiendo genéricos con macros reales; quedan **7 `macros_dudosos`** (Quesillo, Queso fresco, Queso chédar, Poroto cocido,
Porotos granados, Margarina, Chancaca) con la alternativa anotada en `match_note`.

## W1 · Motor y visibilidad (2 d)

Dónde vive cada pieza (RESOLUCIONES-2 §A R13/R14, contra el código de `f93378c3`): **la visibilidad NO se aplica en
`findExchangeGroupsForScope`** (`apps/web/src/infrastructure/db/exchanges.repository.ts:89-104`). Esa función es el
catálogo de **autorización/escritura**: sus dos únicos callers le pasan el resultado *literalmente* a
`findExchangeGroupConflict` (`nutrition-exchanges.service.ts:188` y `:193`, y el update en `:215` y `:221`), y
`findExchangeGroupConflict` (`:137-152`) es **pura** — «ver ambos sets» no es una propiedad suya sino del caller. Si se
filtra ahí, un coach `'cl'` sin historial SMAE puede crear un grupo propio con `code = 'C'`, `'LAC'`, `'LEG'`, `'FR'` o
`'PCT'` (el índice `exchange_groups_system_code_uq` no lo atrapa: es parcial `where is_system`), y después `findByCode`
(`packages/nutrition-engine/exchange-calc.ts:37-41`) lo deja de sombra. **Tampoco va en `getExchangeGroupsForCoach`**
(`nutrition-exchanges.service.ts:92-98`): esa función es el gate de **cinco** caminos, entre ellos
`apps/web/src/app/api/mobile/nutrition/exchanges/group-foods/route.ts:75-82` (verificado en `f93378c3`), que responde
**404 `GROUP_NOT_FOUND`** si el grupo no vuelve en la lista — filtrar ahí le rompería al coach la lectura de un grupo
que su propio plan usa. La visibilidad vive **solo en los bordes de presentación** (R13, OUTLINE §3, DATA §7.3): (a) el
loader del picker web (`QuickEditProvider` / `portions-groups.actions.ts`), (b) la respuesta de la ruta móvil viva
(`apps/web/src/app/api/mobile/nutrition-v2/exchange-groups/route.ts:111-117`, **marcando, no filtrando**: el cliente
particiona) y (c) el sheet RN sobre la lista ya mergeada (R17).

- [ ] W1.1 [Opus] `portionSystem?: 'smae' | 'cl'` — **OPCIONAL, y en las DOS interfaces `ExchangeGroup`**: la del engine
      (`packages/nutrition-engine/exchange-types.ts`) **y** la de dominio web
      (`apps/web/src/domain/nutrition/exchange.types.ts:8-29`, la que importa `exchanges.repository.ts:3-10` y usan ~20
      archivos web: bundle del alumno V1, PDF de intercambios, builder V1, actions de grupos y de listas). Si solo se
      declara en una, dejan de ser estructuralmente compatibles y W1.5 no compila. Más `GROUP_COLUMNS` en los **dos**
      repos: web (`exchanges.repository.ts:32`) y RN (`apps/mobile/lib/nutrition-exchanges.coach.ts:85-86`), y los
      mapeadores `exchanges.repository.ts:55-70`, `nutrition-exchanges.coach.ts:65-83` y
      `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts:27-50` (`toGroup`).
      **`NutritionExchangeGroupReadSchema` (`packages/nutrition-v2/read-models.ts:238-254`) NO se toca**: es el espejo
      del contrato A4 (`read-models.ts:666`) y su test `read-models.test.ts:333-336` (`const engineDict:
      ExchangeGroup[] = dict`) tiene que seguir compilando sin editarse — `reconstructExchangeGroups` no podría
      completar el campo porque el snapshot congelado no guarda el set.
      **Criterio**: `pnpm typecheck` y tsc mobile verdes sin `any`; **sin editar los tests existentes de `editor-state`
      / `_quick-edit`, y sin tocar los ~42 fixtures que construyen `ExchangeGroup`** (no cambian porque el campo es
      opcional); los grupos reconstruidos de snapshots (sin la columna) caen a «no legado», nunca se esconden.
- [ ] W1.2 [Opus] `QePortionGroup` (`packages/nutrition-v2/editor-state.ts:247-258`) gana `portionSystem?: 'smae' |
      'cl'`, propagado en `catalogToPortionGroups` (`:588-600`); `collectPortionGroups` (`:549-568`) lo deja
      `undefined` **a propósito** (el snapshot no guarda el set) y se documenta en el JSDoc. **`CL_CODES`, `systemOf` e
      `isClGroup` NO se declaran acá**: viven en `packages/nutrition-v2/exchange-visibility.ts` y nacen en **W1.4**
      (DATA §6 y §7; ver la nota de W1.4). **Criterio**: `catalogToPortionGroups` propaga el campo; los grupos que salen
      de `collectPortionGroups` lo traen `undefined`; `quick-edit-state.test.ts` verde sin editarse.
- [ ] W1.3 [Opus] **Productor 1**: `findUsedPortionSystemsForCoach(db, coachId): Promise<PortionSystem[]>` en
      `apps/web/src/infrastructure/db/exchanges.repository.ts` — mismo join del conteo de W0.6
      (`nutrition_slot_exchange_targets_v2` → `nutrition_plan_versions_v2` → `nutrition_plans_v2` → `exchange_groups`)
      **más la rama V1** `meal_exchange_targets` (sigue viva: `PlanBuilder.tsx`, `exchange.actions.ts`,
      `api/mobile/nutrition/exchanges/targets`), con `select distinct portion_system` y `limit 2`. **Nombre canónico
      único en todo el SDD** (R14 + OUTLINE §13 + D-6: no hay alias ni variantes, tampoco como «reemplaza a…»). Es el
      productor del input `usedSystems`, que hoy aparece tres veces en el SDD y **siempre como parámetro**, sin nadie
      que lo calcule. **Criterio**: el EXPLAIN 6 de W0.6 está
      pegado y su plan es el que el índice (si se creó) predice; devuelve `[]` para un coach sin targets y a lo sumo dos
      elementos; test del repo con doble de `db`. **Evidencia W0.6 (09-09): la forma `exists` sobre `exchange_groups`
      cuesta 11,6 ms frío y la forma join (targets → versions → plans → groups, `limit 2`, una por rama V2/V1 unidas) 0,3 ms
      ⇒ implementar la join.**
- [ ] W1.4 [Opus] `packages/nutrition-v2/exchange-visibility.ts` con `visibleExchangeGroupsForCoach({ groups,
      coachSystem, usedSystems })` (unión, no exclusión) + tests. **En este archivo, y en esta ola, nacen también los
      tres helpers que DATA §7 exporta desde acá** (X-07; W3 los importa, no los redefine): `CL_CODES`,
      `systemOf(group, coachSystem)` = `group.portionSystem ?? (CL_CODES.has(group.groupCode) ? 'cl' : coachSystem)`
      —**el ausente cae al set del coach, nunca a `'smae'`**, o un grupo chileno ya prescrito por un coach `'cl'` se
      pintaría «Legado (SMAE)» dentro de la sección colapsada—, **`isClGroup(group, coachSystem)`** (dos parámetros,
      firma de DATA §6) = `systemOf(group, coachSystem) === 'cl'`, y **`compareVisibleGroups`** (propio antes que
      legado; dentro del propio, `sortOrder` asc; empate ⇒ `code`; DATA §7 caso 10). **Criterio**: casos «coach `cl` sin
      historial ⇒ solo `cl` + sus custom», «coach `smae` con targets vivos ⇒ ambos, los `cl` sin marca y los `smae` con
      `legacy: true`», «coach `cl` con targets SMAE ⇒ ve el legado», «convertidos todos ⇒ el legado desaparece sin
      ningún write», «grupos custom (`coach_id`/`team_id` no nulo) **nunca** se filtran por set»; más los de los helpers — grupo del
      catálogo con `portionSystem: 'cl'` ⇒ `'cl'`; grupo del plan sin dato y `groupCode = 'PCT'` ⇒ `'cl'` por
      `CL_CODES`; grupo del plan sin dato y `groupCode = 'C'` con coach `'cl'` ⇒ `'cl'` (**no** legado) y con coach
      `'smae'` ⇒ `'smae'`; `compareVisibleGroups` ordena propio → legado y `sortOrder` asc dentro de cada bloque.
- [ ] W1.5 [Opus] **Productor 2 + aplicación web en el BORDE DE PRESENTACIÓN**: el loader del picker web
      —`QuickEditProvider` y `apps/web/src/app/coach/nutrition-v2/_actions/portions-groups.actions.ts`— lee
      `coaches.portion_system` por `coachId` (una columna), llama a `findUsedPortionSystemsForCoach` y aplica
      `visibleExchangeGroupsForCoach` **en TypeScript**, nunca dentro del `.or()`.
      **`getExchangeGroupsForCoach` (`nutrition-exchanges.service.ts:92-98`) NO se toca** (R13, OUTLINE §3, DATA §7.3):
      alimenta cinco caminos, entre ellos `api/mobile/nutrition/exchanges/group-foods/route.ts:75-82`, que devolvería
      **404 `GROUP_NOT_FOUND`** para un grupo que el plan del coach usa.
      **Fail-open obligatorio**: si falla cualquiera de las dos lecturas, se devuelve **todo el catálogo sin
      marcar legado** — jamás esconder (el catálogo ya es best-effort: `QuickEditMode.tsx:641-647` se traga el error, y
      esconder grupos que el coach usa rompería su plan). **Criterio**: `getExchangeGroupsForCoach`,
      `findExchangeGroupsForScope`, `findExchangeGroupsByIdsForTenant` y `resolveExchangeGroupsForDraft` quedan **sin
      tocar** (grep en el diff); `findExchangeGroupConflict` sigue recibiendo el catálogo **sin filtrar** (ambos sets);
      `group-foods/route.ts` sigue respondiendo 200 para un grupo SMAE de un coach `'cl'`; test que simula el error de
      cada lectura y verifica que el catálogo vuelve completo y sin `legacy`.
- [ ] W1.6 [Opus] **Ruta móvil viva**: `apps/web/src/app/api/mobile/nutrition-v2/exchange-groups/route.ts` pasa de
      `jsonNoStore({ groups, foodCounts })` (`:117`) a **`jsonNoStore({ groups, foodCounts, portionSystem,
      legacySystems })`** (nombres canónicos de R14(3), OUTLINE §13 y DATA §7.1.1), con cada grupo trayendo
      **`portionSystem?: 'smae' | 'cl'`**. **`legacy` NO viaja por fila**: se deriva **en el cliente** con
      `systemOf(group, portionSystem)` (W1.4), que es la única forma de que un grupo del **plan** —sin la columna— no
      quede marcado legado por falta de dato (R18); si el servidor mandara `legacy: boolean` estaría afirmando «legado»
      para grupos del plan de los que no sabe nada. `portionSystem` es el set del coach (`'cl'` en este tren) y
      `legacySystems` es `findUsedPortionSystemsForCoach(...)` menos el propio (`[]` si no usa nada). El mapeador RN
      `apps/mobile/lib/nutrition-v2-exchange-groups.api.ts` propaga `portionSystem` por grupo (`toGroup` en `:31-48`) y
      `NutritionV2ExchangeGroupsResult` (`:53-56`) gana `portionSystem?` y `legacySystems?`, **opcionales igual que
      `foodCounts?`**, por el binario RN viejo. **Criterio**: caso nuevo en
      `tests/mobile-nutrition-exchange-groups-api.test.ts` — respuesta con `portionSystem`, `legacySystems` y
      `groups[].portionSystem` parsea; respuesta **sin las tres llaves** también (fail-open del cliente: sin
      `portionSystem` no se marca nada como legado); ninguna fila de `groups` trae `legacy`.
      **`apps/mobile/lib/nutrition-exchanges.coach.ts` (`fetchCoachExchangeGroups`) NO entra en esta tarea** (R-05):
      grep en `apps/mobile` da **cero consumidores** — su única aparición fuera de su definición es un comentario en
      `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:354`, el wizard retirado. Va al backlog «retirar junto
      con el wizard RN»; lo único que sí se toca de ese archivo es su `GROUP_COLUMNS` (W1.1), para que el tipo cierre.
- [ ] W1.7 [Opus] Orden y secciones del picker **sin tocar `mergePortionGroupChoices`** (`editor-state.ts:641-650`,
      «plan primero, catálogo después», fijado por `quick-edit-state.test.ts:578`): (a) comparador nuevo
      `comparePickerGroups` en `editor-state.ts`, sobre `QePortionGroup` + `legacy` + `sortOrder?` + `groupCode` — hay
      **dos** comparadores y no se mezclan: `compareCatalogGroups` (`:571-575`, sobre `ExchangeGroup`) queda **sin
      cambios**; (b) la **partición por sección se hace en el consumidor, sobre la lista ya mergeada**: RN
      `EditablePortionsSection.tsx` (el `groups.map` de `:273`) y web `EditablePortionsCard.tsx` (el `groups.map` de
      `:285`) parten en «Sistema chileno» / «Propios» / «Legado (SMAE)» con `visibleExchangeGroupsForCoach` +
      `comparePickerGroups` antes de renderizar, sin confiar en el orden de entrada. **Criterio**: tests nuevos de
      `comparePickerGroups` en el paquete (set del coach primero, propios después, legado al final) y
      `quick-edit-state.test.ts:578-590` **verde sin editarse**. Las tres copias de `sortGroupsForPicker` viven en los
      wizards retirados: **no se tocan**.
- [ ] W1.8 [Sonnet] `SYSTEM_EXCHANGE_CODES` (`packages/nutrition-v2/read-models.ts:638-649`) + los 13 códigos.
      **Criterio**: `reconstructExchangeGroups` devuelve `isSystem: true` para un snapshot con `code = 'PCT'`.
- [ ] W1.9 [Sonnet] Conteo del picker web por `getExchangeListCounts` en
      `apps/web/src/app/coach/nutrition-v2/_actions/portions-groups.actions.ts:65-84`. **Criterio**: un grupo chileno con
      equivalencias en `exchange_group_foods` deja de mostrar «0 equivalencias» (test del action o verificación manual
      con captura).
- [ ] W1.10 [Sonnet] `GROUP_REFS` de `scripts/nutrition-portions/heuristics.ts:113-124` + los 13 (R5) **y la unión
      cerrada `ExchangeGroupCode` de `heuristics.ts:52`** (`'C' | 'P' | … | 'LEG'`, usada además en `:72,78,79,80`): sin
      ampliarla el archivo no compila (R-09). **Criterio**: `verifyGroupRefs` no aborta con `missing_in_fixture` y
      `tsc` del script pasa (correr solo la verificación, **no** el clasificador).
- [ ] W1.11 [Sonnet] `apps/web/src/lib/database.types.ts` a mano: `portion_system` en Row/Insert/Update de
      `exchange_groups` y `coaches`. **Criterio**: `pnpm typecheck` verde; el diff toca solo esas dos tablas (nada de
      regen completo).
- [ ] W1.12 [Opus] Caso nuevo en `apps/web/src/services/nutrition-exchanges/nutrition-exchanges.groups.test.ts`
      atacando **`createExchangeGroup` y `updateExchangeGroup`** (no la función pura, que pasaría igual): un coach
      `'cl'` **sin** targets SMAE —o sea, uno que ya no ve el set legado en su picker— **no** puede crear ni renombrar
      un grupo propio con `code` `C`, `LAC`, `LEG`, `FR` ni `PCT`. **Criterio**: el test se pone rojo si alguien mueve
      el filtro de visibilidad dentro de `findExchangeGroupsForScope` (que es la regresión exacta de B-01).
- [ ] W1.13 Gates W1 (<fecha>): `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine` ⇒ `<n>` archivos
      / `<n>` tests · vitest de `apps/web/src/services/nutrition-exchanges` y `tests/mobile-nutrition-exchange-groups-api.test.ts`
      · `pnpm typecheck` · tsc mobile · eslint por archivo · `pnpm check:nutrition-v2-boundaries` `<n>` archivos OK.
      **Invariante de conteo (números reales verificados en `f93378c3`, ninguno usa `.each`)**: `editor-state.day-errors.test.ts`
      **16** · `quick-edit-state.test.ts` **58** · `quick-edit-state.meta.test.ts` **22** · `quick-edit-publish-guards.test.ts`
      **7** ⇒ **16 + 87 = 103** existentes, más los casos nuevos de cada ola. El «16 + 106 = 122» que circulaba es falso:
      quien vea 103 no rompió nada.
- [ ] W1.14 [Fable] Juicio de W1: `<…>`.

## W2 · Picker, bump, tap-to-edit y Legumbres (2 d)

- [ ] W2.1 [Opus A] `packages/nutrition-v2/editor-state.ts`: acción `BUMP_PORTION_TARGET { variantKey, slotKey,
      exchangeGroupId, by? }` + `findPortionTargetByGroup` + `portionsAfterBump` + export de `formatPortionsEsCl`.
      **Criterio**: casos nuevos en `…/_quick-edit/quick-edit-state.test.ts` — suma 0,5 al target del grupo; no-op si el
      grupo no está; satura en 99; `ADD_PORTION_TARGET` sobre un grupo presente **sigue** siendo no-op (el test de
      `editor-state.ts:1948` no se borra).
- [ ] W2.2 [Opus A] `qeGroupRefPerPortion(group, groups)` + `qeGroupRefLabel(ref)` en el paquete, sobre
      `macrosForTargets` (`packages/nutrition-engine/exchange-calc.ts:85-100`). **Criterio**: archivo nuevo
      `packages/nutrition-v2/editor-state.portions-ref.test.ts` — LEG con dict completo ⇒ P+C (no 0), dict vacío ⇒ `ref`
      crudo, base ausente ⇒ `ref` crudo, grupo simple ⇒ su propio ref.
- [ ] W2.3 [Sonnet] Copys en `packages/nutrition-v2/nutrition-portions-copy.ts`: `builder.{setChile,setLegacy,
      legacyBadge,groupUsedBump,groupBumped,groupBumpedUndo,groupAtMax,stepperEditHint}` con los textos de la tabla
      «Copys propuestos» del mockup. **Criterio**: `builder.groupUsed` se conserva para el estado en el tope; las
      cantidades llegan pre-formateadas en es-CL.
- [ ] W2.4 [Opus A · RN] `EditablePortionsSection.tsx`: fila usada sin `disabled` ni `opacity-50` (salvo tope 99),
      subtítulo `groupUsedBump`, secciones «Sistema chileno» / «Propios» / «Legado (SMAE)» colapsable con
      `accessibilityState`, chip `legacyBadge` en filas legado. La partición se hace **acá**, sobre la lista que ya
      devolvió `mergePortionGroupChoices` (el `groups.map` de `:273`), con `comparePickerGroups` de W1.7 — no se toca el
      merge. Incluye la **carcasa del banner del plan legado** (colisión declarada arriba): se renderiza solo si llega
      `onConvertPress`, que W3.6 cablea. **Criterio**: QA en device (W2.11) + `accessibilityLabel` que dice qué va a
      pasar, no solo el estado; sin `onConvertPress` el banner no se monta (nada visible antes de W3).
- [ ] W2.5 [Opus A · RN] `QuickEditMode.tsx`: `BUMP_PORTION_TARGET` al elegir un grupo ya usado, resalte 1,2 s con
      `Animated` (`useNativeDriver: false`, respeta `useReducedMotion`) y toast con `id` estable y acción «Deshacer» que
      restaura el valor previo capturado. **Criterio**: dos taps seguidos ⇒ **un** toast actualizado; «Deshacer» tras dos
      bumps vuelve al valor inicial de la interacción.
- [ ] W2.6 [Opus A · RN] Stepper con `TextInput` siempre montado (`decimal-pad`, `inputAccessoryViewID`,
      `selectTextOnFocus`, valor crudo mientras se tipea, formateo en `onBlur`) y error
      `portion.<key>.portions` bajo la fila con `accessibilityLiveRegion="polite"`. **Criterio**: el árbol no cambia por
      foco (patrón `QuantityStepper.tsx:11-13`); «1,3» muestra el error y no rompe el estado.
- [ ] W2.7 [Opus B · web] `EditablePortionsCard.tsx`: mismo comportamiento (bump, `ring-2 ring-primary/60`,
      `scrollIntoView`, toast con `action` de `sonner`, secciones por set) y `QE_COPY.portionsPickerHint`
      (`microcopy.ts:125`) reescrito porque hoy afirma que los usados «aparecen desactivados». Igual que en RN, la
      partición por sección va en el consumidor (el `groups.map` de `:285`) sobre la lista ya mergeada, y la carcasa del
      banner legado se monta acá con `onConvertClick` opcional (W3.6 la cablea). **Criterio**: RTL nuevo
      `EditablePortionsCard.test.tsx` — (a) la fila usada no está `disabled` y su subtítulo dice la cantidad, (b) el
      click despacha `BUMP_PORTION_TARGET` y cierra el sheet, (c) `StepperField` con `1,3` marca `invalid`, (d) con
      grupos de los dos sets se dibujan las secciones en el orden Sistema chileno → Propios → Legado y el orden de
      entrada del merge no las altera.
- [ ] W2.8 [Opus B] D5 en las etiquetas «1 porción ≈» del coach (RN y web) con `qeGroupRefPerPortion`. **Criterio**:
      Legumbres SMAE deja de decir «0 kcal» y el caso queda cubierto por `portions-qa.test.ts` (la etiqueta usa los
      `ref_*` **congelados** aunque cambie el catálogo vivo).
- [ ] W2.9 [Opus B] R11: misma corrección en la cabecera de los dos `PortionEquivalencesSheet` del alumno (web
      `:154-157`, RN `:165`). **Criterio**: con un plan que prescribe LEG, la cabecera muestra 125 kcal · 15 C · 9 P.
- [ ] W2.10 [Sonnet] PostHog `nutrition_portion_group_bumped { surface }` en web y RN, con el enum en el paquete
      compartido. **Criterio**: cero kcal, gramos, nombres de alimentos o ids en el payload (Ley 21.719).
- [ ] W2.11 [owner] QA en device de los puntos 1–4 y 10 del checklist final.
- [ ] W2.12 Gates W2 (<fecha>): vitest paquete + `_quick-edit` + RTL nuevo · `pnpm typecheck` · tsc mobile · eslint por
      archivo (web y `--config eslint.mobile.config.mjs`) · `pnpm check:tokens`.
- [ ] W2.13 [Fable] Juicio de W2 (A y B por separado): `<…>`.

## W3 · Conversión SMAE → chileno (2 d)

- [ ] W3.1 [Opus] `packages/nutrition-v2/exchange-conversion.ts`: `CL_CONVERSION_MAP` (los 9 orígenes de DATA),
      `round05`, `convertPortionsToCl(draft, { dairyChoiceBySlot })` ⇒ `{ draft, diff }` con delta de macros por día vía
      `dayTotalsByVariant`. **Depende de W1.4**: la primera línea es `catalog.filter((g) => isClGroup(g, coachSystem))`, con `isClGroup`,
      `systemOf` y `CL_CODES` **importados de `packages/nutrition-v2/exchange-visibility.ts`** (DATA §6 los importa así)
      — **no** se redefinen acá, y la firma es de **dos** parámetros. El campo que leen es
      `QePortionGroup.portionSystem?` (W1.2).
      **Criterio**: archivo de tests con tabla — `2 C ⇒ 1 PCT`, `3 P ⇒ 2 CB`, `1 F ⇒ 1 FR`,
      `7,5 V ⇒ 6 VG`, `5,5 LAC ⇒ 7,5 LD` (y `LS`/`LE` con su factor), `1 LEG ⇒ 0,5 LGS`, `1 SP ⇒ 1 SCP`, piso 0,5 y
      tope 99.
- [ ] W3.2 [Opus] Colapso `ARL` + `G` → `AG` **antes** del payload. **Criterio**: test que arma una franja con ambos y
      verifica **un** solo target destino con la suma; el test falla si se emiten dos (violaría
      `unique (meal_slot_id, exchange_group_id)`).
- [ ] W3.3 [Opus] Propuesta de reemplazo de grupos custom con match único (±5 kcal, ±1 g). **Criterio**: el grupo
      «Carbohidratos 140/30» de `nutricionista-pame-cid` matchea `PCT`; el «Proteinapro» de `josefit` no matchea nada y
      queda intacto; ningún custom se soft-borra.
- [ ] W3.4 [Opus] `REPLACE_PORTION_GROUPS` en `editor-state.ts` para aplicar el resultado al borrador en un solo
      dispatch, **materializando cada destino en la posición de su primer origen**: `map` sobre la lista original de
      `slot.portionTargets` reemplazando in situ, con `ARL` + `G` colapsados sobre la posición del primero de los dos y
      el segundo descartado (nada de `[...convertidos, ...intactos]`, que empuja lo convertido al principio de la franja
      justo en la pantalla que prometía mostrar el antes y el después). **Criterio**: el orden de `slot.portionTargets`
      es idéntico antes y después **salvo por el colapso**, y la nota se conserva concatenada cuando dos orígenes caen
      en el mismo destino; test propio que arma una franja intercalando targets convertibles y no convertibles (custom
      sin match) y compara la secuencia de `key`. Ojo: `QePortionTarget` (`editor-state.ts:228-239`) **no tiene**
      `orderIndex` — el orden es la posición del array; `orderIndex` solo existe en el read model del alumno
      (`read-models.ts:277`), así que no hay nada que «conservar» a ese nivel.
- [ ] W3.5 [Opus] `PortionConversionSheet.tsx` (RN, `Sheet nativeModal snapPoints={['85%']}`) y
      `PortionConversionDialog.tsx` (web, `QeBottomSheet size="lg"`) con el preview del mockup M2: fila origen → destino
      con kcal antes/después, marca «Revisar», selector de lácteo por franja, total del día y los dos botones.
      **Criterio**: nada se escribe hasta «Convertir borrador»; publicar sigue siendo un paso aparte.
- [ ] W3.6 [Opus] **Cablear** el banner del plan legado (RN y web) —la carcasa la montó W2.4/W2.7— con «Ver conversión»
      (abre el sheet/diálogo de W3.5) y «Ahora no». **Criterio**: «Ahora no» lo esconde 30 días **por plan** (clave
      local por `planId`: `AsyncStorage` en RN, `localStorage` en web; no sobrevive al cambio de dispositivo y se acepta
      así, sin columna nueva) y no se muestra a coaches sin targets SMAE; el diff de W3 sobre
      `EditablePortionsSection.tsx` y `EditablePortionsCard.tsx` se limita a pasar el handler (sin rebase encima de lo
      que W2 reescribió).
- [ ] W3.7 [Sonnet] Copys `convert.*` y PostHog `nutrition_portion_conversion_previewed { slots, rows_review }` /
      `…_applied { slots }`. **Criterio**: sin cifras de kcal ni nombres.
- [ ] W3.8 [owner] QA en device del punto 5 del checklist final.
- [ ] W3.9 Gates W3 (<fecha>): vitest paquete + engine (tabla completa) · RTL del diálogo · `pnpm typecheck` · tsc
      mobile · eslint por archivo · `pnpm check:tokens`.
- [ ] W3.10 [Fable] Juicio de W3: `<…>`.

## W4 · Metas por día (1 d)

- [ ] W4.1 [Opus] `SET_TARGET` y `STEP_TARGET` con `scope?: 'day' | 'all'` en `packages/nutrition-v2/editor-state.ts`;
      `scope: 'all'` escribe en el base y en los días que heredaban (`qeTargetsEqual` evaluado **antes** del cambio).
      **Criterio**: `packages/nutrition-v2/editor-state.day-targets.test.ts` (archivo nuevo) — (1) sin `scope`,
      comportamiento actual; (2) base y martes vacíos ⇒ ambos con la meta; (3) no pisa un día con metas propias; (4)
      desde un día que hereda escribe también la base.
- [ ] W4.2 [Opus] Helpers `qeTargetsEqual`, `qeDaysMissingTargets`, `qeTargetsGapBar` y acción `APPLY_BASE_TARGETS`.
      **Criterio**: `qeTargetsGapBar` es `null` si **ningún** día tiene meta y si **todos** la tienen; nombra 1/2/3 días
      con `joinDayLabels`; `APPLY_BASE_TARGETS` es idempotente (segundo dispatch ⇒ misma referencia).
- [ ] W4.3 [Opus] Switch «Solo el {día}» en `TargetsEditorCard` RN y web, con el default de la tabla del PLAN y
      `role="switch"` / `accessibilityRole="switch"`. **RN tiene dos hosts, pero el switch va en UNO solo** (X-08; manda SPEC §7.5 por evidencia, y satisface lo que
      R-07 pedía: declarar el comportamiento del segundo). El switch vive en la **hoja del header**
      (`QuickEditMode.tsx:2383-2402`, `TargetsEditorCard` en `:2392`, que despacha `SET_TARGET` con `activeVariant.key`
      en `:2398`). La **card del lienzo** (`QuickEditMode.tsx:2011-2020`, despacha con `variant.key` en `:2018`) se
      pinta **solo con `editorMode === false`** —o sea nunca dentro del editor único, que es donde vive esta feature—,
      así que queda **byte-idéntica y SIN switch**. Web ya tiene declarados sus dos hosts (el Popover y la card
      `md:hidden`) y se comporta igual.
      **Criterio**: oculto en el base y en planes de un solo día; apagarlo estando ON copia las metas del base sobre el
      día con «Deshacer»; **el host del lienzo sigue despachando `SET_TARGET` sin `scope`** — su diff es cero y su
      comportamiento actual no cambia (grep en el diff: `QuickEditMode.tsx:2011-2020` intacto).
- [ ] W4.4 [Opus] Aviso no bloqueante: `dayNotice` en `PublishBar` RN y `noticeMessage`/`noticeAction` en la web
      (ámbar, `role="status"`), con acción «Ir a Base» = `APPLY_BASE_TARGETS` + `jumpToDay('default')` y botón primario
      «Publicar igual». **Criterio**: caso nuevo en `quick-edit-publish-guards.test.ts` — un plan con metas parciales
      **sigue** publicando (`validation.ok === true`); los 16 tests de `editor-state.day-errors.test.ts` no se editan.
- [ ] W4.5 [Sonnet] Punto ámbar de los días sin meta en `DayAnchorRow` (RN) y en cápsula + rail (web), sin pasar por
      `showErrors`; «sin meta» en la cinta cuando el día activo no tiene objetivo. **Criterio**: el punto usa el mismo
      estilo que `attentionKeys`, no uno nuevo.
- [ ] W4.6 [Sonnet] Copys `EDITOR_COPY.targets.{onlyThisDay,onlyThisDayOff,onlyThisDayOn}` y
      `EDITOR_COPY.publish.{partialTargets,anyway,goToBase}` + PostHog `nutrition_targets_scope { scope, from }`.
      **Criterio**: idénticos en RN y web; el título del sheet deja de decir «Metas del día» cuando escribe en todos.
- [ ] W4.7 [owner] QA en device de los puntos 6 y 7 del checklist final; además, arreglar el plan real de
      `nutricionista-pame-cid` con «Ir a Base» (es el único plan afectado en LIVE).
- [ ] W4.8 Gates W4 (<fecha>): vitest paquete (incluye `editor-state.day-targets.test.ts`) + reducer web ·
      `pnpm typecheck` · tsc mobile · eslint por archivo · `pnpm check:tokens`.
- [ ] W4.9 [Fable] Juicio de W4: `<…>`.

## W5 · Equivalencias del alumno (1,5 d)

- [ ] W5.1 [Opus] `supabase/migrations/20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql`: parche por
      texto sobre `pg_get_functiondef` con los dos empalmes, `isGeneric` = `f.brand is null`, `imagePath`/`imageVersion`
      por `left join lateral` a `food_media` **después** del cap de 60, y el orden
      **`owner_rank, is_generic desc, portion_label_present desc, name, id`** —**dentro del `row_number()`**, o sea antes
      del tope de 60, **y repetido igual en el `jsonb_agg`** (RESOLUCIONES-2 §C.2 y `db-datos:B1`): un genérico **con**
      medida casera va antes que un genérico sin ella, y la fila del coach sigue ganando por `owner_rank = 0`.
      Las llaves nuevas son **cuatro**: `imagePath`, `imageVersion`, `imageLicense` e `isGeneric` (OUTLINE §13 +
      SPEC §9.4 + DATA §8.2/§8.4/§10.3). La `version` **sí** viaja (RESOLUCIONES-2 §B R-02: `foodMediaThumbnailUrl` la
      exige para cache-busting) y `imageLicense` (`fm.license`) entra por el **mismo `left join lateral`** porque el pie
      de atribución tiene que ser **condicional** (hay fotos `cc_by_sa` de OFF y fotos propias; un pie fijo declara una
      licencia falsa en las dos direcciones — `seguridad:S-08`). **No** viaja el objeto media, ni `attribution`, ni la
      `category`. Con las cuatro, el payload del Today queda en **~149 kB (+29 %)** sobre las 116 kB de hoy (SPEC §9.1).
      **Criterio**: assert de 1 hit por ancla; los canarios existentes (`cl.coach_id from public.clients cl`
      ≥ 3, `public.exchange_group_foods egf`) más `position('isGeneric' in v_def) > 0`,
      `position('imageLicense' in v_def) > 0` y `position('food_media fm' in v_def) > 0`; **prohibido** el copy-body
      (revertiría B1).
- [ ] W5.2 [Sonnet] `supabase/tests/nutrition_today_v2_exchange_foods_media_generic_rollback.sql`: casos A) el bloque
      emite las **4** llaves nuevas (`imagePath`, `imageVersion`, `imageLicense`, `isGeneric`) · B) el genérico ordena antes que la marca y,
      entre dos genéricos, el que tiene `portion_label` va primero · C) la fila del coach gana por
      `owner_rank = 0` · D) un alimento privado de otro coach sigue sin aparecer. **Criterio**: 4/4 verdes en
      `BEGIN … ROLLBACK` sobre LIVE.
- [ ] W5.3 [Sonnet] `tests/team/exchange-lists-isolation.sql` extendido con la foto (regresión B1). **Criterio**: el
      test falla si el lateral de `food_media` se escribe sin el filtro de tenant del bloque.
- [ ] W5.4 [Opus] Read model: `isGeneric`, `imagePath`, `imageVersion` e **`imageLicense`** (las cuatro,
      **opcionales**, `imageLicense` además `nullable`) en
      `NutritionExchangeFoodReadSchema` (`packages/nutrition-v2/read-models.ts:292-305`) + corregir el JSDoc que todavía
      dice que la fuente son las columnas `foods.exchange_*`. **Criterio**: casos en `read-models.test.ts` — payload con
      las llaves parsea y payload **sin** ellas también (binario RN viejo); `NUTRITION_READ_MODEL_SCHEMA_VERSION` no
      cambia.
- [ ] W5.5 [Opus] `packages/nutrition-v2/exchange-foods-origin.ts` con `splitExchangeFoodsByOrigin`. **Criterio**: test
      propio — genérico por flag, genérico por `brand == null`, marca, y **orden de entrada preservado**.
- [ ] W5.6 [Opus] **Helper de URL desde `imagePath` + `imageVersion`** (R-02; el RPC emite el `object_path` y la
      `version`, no el objeto media): `foodMediaThumbnailUrlFromPath({ objectPath, version })` en
      `apps/mobile/lib/nutrition-v2-food-media.ts` y su gemelo en `apps/web/src/lib/food-image.ts`. El
      `foodMediaThumbnailUrl` existente (`nutrition-v2-food-media.ts:43-58`) **no se puede reutilizar tal cual**: exige
      `{ objectPath, bucket, version }` y el `bucket` no viaja, así que el helper nuevo lo fija en `food-media` y
      reencodea el path segmento a segmento igual que el original. **Criterio**: test de la URL construida en los dos
      lados —`${base}/storage/v1/object/public/food-media/<path encodeado>?v=<version>`—, `null` si falta la base o el
      path, y **paridad byte a byte** con lo que devuelve `foodMediaThumbnailUrl` para el mismo media.
- [ ] W5.7 [Opus] Sheet web: dos secciones con encabezado, miniatura **36 px** (misma medida que RN: el kit ofrece
      36/48/64 y **no existe 40**, R-11; `next/image unoptimized` + fallback, patrón `NutritionFoodRow.tsx:56-93`),
      medida casera en negrita y gramos en mono. **Criterio**: el buscador filtra **dentro** de cada sección y no dibuja
      el encabezado de una sección vacía.
- [ ] W5.8 [Opus] Sheet RN: `FoodThumbnail size="sm"` (36 px), mismas secciones, y se borra el comentario `:243-247`
      que dice que la foto no llega. **Fallback sin foto = el `GroupDot` del grupo, que es lo que el sheet ya hace hoy**
      (R-10 + **D-2**): el «ícono de categoría derivado del nombre» no existe —`FoodThumbnail` toma `fallbackCategory`,
      una categoría del catálogo, y el read model del sheet **no** trae `category`, porque el RPC emite exactamente
      **cuatro llaves** (`imagePath`, `imageVersion`, `imageLicense`, `isGeneric`) y **`category` NO es una de ellas**
      (D-9)—, así que no se inventa una derivación por nombre ni se agrega una quinta llave.
      **`recyclingKey` se saca** (R-18): no es prop de `FoodThumbnail` (`NutritionV2Kit.tsx:457-463` acepta `src, alt,
      size, fallbackEmoji, fallbackCategory` y ya fija `cachePolicy`, `contentFit` y `transition` adentro), y sin
      virtualización no aporta; agregarlo sería tocar el kit compartido que usan `FoodRow`, `add-food-v2`,
      `FoodDetailSheet` y `foods.tsx`. **Criterio**: `expo-image` con `cachePolicy="memory-disk"` (ya interno); ninguna
      fila queda sin marca visual cuando no hay foto; si el QA muestra jank, cortar a 30 filas + «Ver más» (no
      virtualizar).
- [ ] W5.9 [Sonnet] Pie «Fotos: Open Food Facts (CC BY-SA)» **condicional**: se pinta solo si alguna fila **visible**
      trae `imageLicense` `cc_by_sa` o `cc_by` (D-9; con el buscador activo se recalcula sobre lo visible), y la fila
      con foto nombra su fuente en el `accessibilityLabel`/tooltip derivándola de la misma llave. Copys
      `student.{sheetGenericsTitle,sheetBrandsTitle,photoCredit}` + PostHog
      `nutrition_equivalences_opened { set, has_generic, rows_bucket }`.
      **Criterio**: un grupo servido solo con fotos `eva_owned`/`eva_illustration`/`supplier_authorized` **no** dibuja el
      pie de OFF; la atribución aparece una sola vez al pie, no por fila; el evento no lleva nombres ni cifras.
- [ ] W5.10 [jefe] Medir el payload del Today de un alumno real con 7 grupos, antes y después. **Criterio**: queda por
      debajo de los 750 kB de `apps/mobile/lib/nutrition-v2-cache.ts:6`; el número se pega acá.
- [ ] W5.11 [owner] QA en device de los puntos 8 y 9 del checklist final.
- [ ] W5.12 Gates W5 (<fecha>): vitest paquete + `apps/web/src/app/c/[coach_slug]/nutrition-v2` +
      `tests/mobile-nutrition-v2-portions.test.ts` · SQL W5.2 y W5.3 por MCP con ROLLBACK · `pnpm typecheck` · tsc
      mobile · eslint por archivo · `pnpm check:nutrition-v2-boundaries`.
- [ ] W5.13 [Fable] Juicio de W5: `<…>`.

## W6 · Cierre (0,5 d)

- [ ] W6.1 [Fable] SDD final en `docs/specs/nutrition-porciones-chilenas/{SPEC,PLAN,TASKS,DATA}.md` con `status` y
      `last_verified` al día. **Criterio**: `pnpm docs:check` OK (sin enlaces relativos rotos entre los cuatro archivos).
- [ ] W6.2 [Fable] `docs/status/CURRENT.md`: mudar prosa vieja a `docs/archive/current-historial-2026-09.md` **y luego**
      agregar la entrada del tren + editar la fila «Nutrition V2». **Criterio**: el archivo queda bajo 16.384 bytes
      (hoy 16.106) y `docs:check` lo confirma en su línea de salida.
- [ ] W6.3 [Fable] `docs/status/MOBILE_PARITY.md`: blockquote nuevo arriba de todo (primera entrada sobre el sheet de
      equivalencias del alumno). **Criterio**: cada línea empieza con `>` y el tren anterior queda inmediatamente debajo.
- [ ] W6.4 [Fable] `docs/testing/TEST_STATUS.md`: sección del tren con la salida real consolidada. **Criterio**: sin
      logs largos; fecha, comando, resultado y bloqueador pendiente.
- [ ] W6.5 [Fable] Suite completa **una vez** (`pnpm test`) con la CPU libre + `pnpm lint` + `pnpm typecheck` + tsc
      mobile + `pnpm check:tokens` + `pnpm check:nutrition-v2-boundaries` + `pnpm docs:check`. **Criterio**: salida real
      pegada; ningún test nuevo en rojo.
- [ ] W6.6 [owner] OK explícito para push a `rnmobiledenuevo` = `master`, deploy, aplicación de migraciones, OTA y
      **encendido del set chileno** (W6.8).
      **Criterio**: la frase del owner citada con fecha y hora.
- [ ] W6.7 [Fable] Deploy Vercel READY + OTA 1.1.2 android/ios desde `.github/workflows/mobile-ota.yml` con `message`
      descriptivo. **Criterio**: ids de deploy y de ambas OTAs (con su `run`) registrados en W6.10.
- [ ] W6.8 [jefe] **Encendido del set chileno** por MCP, recién con el deploy READY y **las dos OTAs publicadas** (las
      **dos** puertas de **presentación** ya filtran —el loader del picker web (`portions-groups.actions.ts` /
      `QuickEditProvider`) y la ruta móvil `nutrition-v2/exchange-groups`, que **marca** con `portionSystem` +
      `legacySystems`— y el cliente RN ya deriva `legacy` con `systemOf`; `getExchangeGroupsForCoach` y
      `findExchangeGroupsForScope` siguen **sin** filtrar a propósito, por R13/B-01): `update public.exchange_groups set deleted_at = null,
      updated_at = now() where is_system and portion_system = 'cl' and deleted_at is not null;` (13 filas). **Criterio**:
      `count(*) from exchange_groups where is_system and deleted_at is null` = **22 vivos** (el «= 22» que antes vivía
      en W0.10); el índice único parcial `exchange_groups_system_code_uq` no se queja (0 códigos duplicados ya con las 13
      vivas); un coach `'cl'` de prueba ve 13 filas y **ninguna** con «0 equivalencias»; un coach `'smae'` de prueba ve
      su set + la sección Legado. Si algo sale mal, el apagado es la misma sentencia con `deleted_at = now()` (W0.4).
- [ ] W6.9 [Fable] `pnpm qa:prod:suave` al cierre. **Criterio**: 9/9 o los fallos explicados; run id pegado.
- [ ] W6.10 [Fable] Completar «Registro de cierres» y el checklist de QA en device con el veredicto del owner.
- [ ] W6.11 [owner] Avisos: banner in-app a **los coaches con porciones SMAE vivas** (9 por V2 al 08-09; **sumar los de
      V1** con la query de W0.6, que recorre las dos generaciones — la lista de destinatarios se cierra con ese número,
      no con el 9 de STATS), mensaje a `nutricionista-pame-cid`, a `dudu` y a
      `josefit` (textos en [PLAN](PLAN.md) §Docs y cierre). **Criterio**: enviado y anotado acá con fecha; nada de push
      masivo.

## Checklist de QA en device (se completa al cierre)

1. Coach nuevo (sin porciones SMAE): el sheet «Agregar grupo» muestra los 13 chilenos con «Sistema chileno · INTA 1999 ·
   UDD 2019», sin chip «Valores referenciales», y **no** aparece la sección Legado.
2. Coach con planes SMAE: arriba el set chileno y abajo «Legado (SMAE) · Lo usás en {n} planes» colapsado; al desplegar,
   las 9 filas viejas con chip «Legado (SMAE)» y Legumbres mostrando 125 kcal · 15 C · 9 P (no 0).
3. Tocar un grupo ya usado: cierra el sheet, la fila queda resaltada ~1,2 s y el toast dice «ahora 1,5 porciones» con
   «Deshacer»; tocarlo dos veces seguidas deja un solo toast y un solo Deshacer que vuelve al valor inicial.
4. Tocar el número del stepper abre el teclado decimal, permite escribir «2,5», el botón «Listo» lo cierra y al salir
   queda formateado; «1,3» muestra el error bajo la fila y no rompe el plan.
5. Conversión: el banner ofrece convertir, el preview muestra franja por franja con kcal antes/después, el lácteo trae
   el selector Descremado/Semi/Entero (descremado por defecto, marcado «Revisar») y nada cambia hasta «Convertir
   borrador»; publicar sigue siendo un paso aparte.
6. Metas desde un día cuando el base está vacío: el switch «Solo el martes» nace **apagado**, el texto dice que se
   guarda en todos los días, y al guardar la meta aparece en todos los chips.
7. Publicar con metas parciales: la barra muestra el aviso ámbar con «Ir a Base», el botón dice «Publicar igual» y
   **deja publicar**; los chips de los días sin meta traen el punto ámbar.
8. Alumno: el sheet de equivalencias abre con «Genéricos · INTA · UDD» arriba (medida casera en negrita, gramos abajo,
   foto de 36 px o el `GroupDot` del grupo cuando no hay foto) y «Marcas y productos» después; dentro de los genéricos,
   los que traen medida casera van primero; el buscador filtra dentro de cada sección.
9. Alumno sin conexión: el Today cacheado sigue abriendo con las fotos; volver online no duplica filas.
10. Tema oscuro y white-label: con un coach de marca distinta, el picker, el toast, el resalte, el aviso ámbar y el
    sheet del alumno respetan el color de marca y los tokens; nada queda hardcodeado ni ilegible.

## Fixes post-cierre

_(vacía: se llena si aparece un reporte después del cierre, con `### <fecha> — <síntoma> (reporte de <slug>)`)_

## Registro de cierres

| Fecha | Tanda | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-09-09 | W0 · datos (W0a + W0b dry-run) | worktree `porciones-chilenas`, sin push | tx-rollback + smoke A–G + Q1–Q3 + dry-run | 120000/120500 en LIVE (`20260909163802` / `20260909163812`), seed apagado; `--apply` espera el OK del owner (W0.9) |
| | W1 · motor | | | |
| | W2 · picker | | | |
| | W3 · conversión | | | |
| | W4 · metas | | | |
| | W5 · equivalencias | | | |
| | W6 · cierre | | | |

## Backlog heredado

- **Auditoría de gramos SMAE por `macros_basis`.** El script de julio que produjo las 2.507 filas ignora
  `macros_basis` (`scripts/nutrition-portions/heuristics.ts:233-247`); el dry-run de W0.7 deja el número de filas con
  > 20 % de desvío, pero **no se corrigen** en este tren. **Número real (dry-run 09-09): 954/2.507 (38 %) — LAC 71 %,
  V 63 %, F 61 %, ARL 57 %, G 41 %, SP 27 %, C 23 %, P 20 %, LEG 0 %.**
- **`foods` del seed SMAE de junio con macros = ref del grupo.** `_POST_DEPLOY_20260611093002` creó ~41 alimentos globales
  («Pan marraqueta» 70 kcal por 50 g, «Pan hallulla», «Arroz cocido» 80 g = 70 kcal, «Aceite de oliva», «Porotos cocidos»
  125/9/15/3…) cuyas macros son las del grupo SMAE, no las del alimento. Los curados del set chileno los esquivan (W0b), pero
  siguen en el catálogo y en el sheet de equivalencias SMAE: candidatos a corrección de macros o a retiro.
- **12 genéricos del manual sin alimento en el catálogo** (Leche saborizada descremada sin azúcar, Congrio, Plateada,
  Chícharo, Pepino dulce, Pan amasado, Mote de trigo, Aceite de maíz, Aceite de soya, Margarina diet, Miel de palma, Dulce
  de camote): alta con `macros_100` + `category` en el JSON o `skip` con motivo; decisión del owner en W0.9.
- **Retirar el sheet V1 del alumno y el `student-bundle`.** `apps/mobile/components/alumno/nutrition/ExchangeEquivalencesSheet.tsx`,
  `useStudentExchanges` (`apps/mobile/lib/nutrition-exchanges.queries.ts:114`) y
  `apps/web/src/app/api/mobile/nutrition/exchanges/student-bundle/route.ts` están vivos y sin consumidor V2.
- **Retirar `fetchCoachExchangeGroups` junto con el wizard RN** (R-05). `apps/mobile/lib/nutrition-exchanges.coach.ts:92-101`
  no tiene ningún consumidor: su única aparición fuera de su definición es un comentario en
  `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:354`. Por eso queda **fuera de W1.6** (filtrarlo sería medio
  día de trabajo y de QA sobre código muerto); en W1.1 solo se le toca `GROUP_COLUMNS` para que el tipo cierre.
- **Verificar `CA` y `LGS` contra las láminas UDD** (R-15). Las 23 filas curadas de esos dos grupos salen de INTA
  pp. 28 y 30 porque el escaneo UDD salta de p. 57 a p. 61 y de p. 73 a p. 77; se aceptan para W0 y el informe del
  dry-run marca cuáles son. Si aparece el escaneo completo, se revisan sin bloquear nada.
- **Crear grupo propio en la web** (R12/Q4): el picker web no tiene esa puerta desde que se retiró el wizard; RN sí
  (`EditablePortionsSection.tsx:335-350`). Con el set chileno la necesidad baja, pero sigue siendo una asimetría.
- **Verificar la Tabla N.º 5 contra la edición UDD 2021** (R9/Q5) si el owner consigue el PDF; el set se fijó con el
  manual 2019 y no bloquea nada.
- **2.253 `foods` sin clasificar en ningún grupo**: fuera de alcance de este tren; el clasificador no se corre.
- **Vocabulario «Objetivos propios» del builder retirado**: el builder legado llamaba así a lo que acá es «Solo el
  {día}»; no se toca, queda anotado para cuando se borre el wizard.

## Decisiones del jefe post-críticos

Las «Preguntas del fixer» quedaron cerradas por el jefe el 09-09 (RESOLUCIONES-2 §D). Cada una con su respuesta, en una
línea:

- **Alineación con PLAN §W6 — hecho.** [PLAN](PLAN.md) §W6 ya escribe la secuencia real: migraciones `20260909120000` /
  `20260909120500` + seed **apagado** + `--apply` **en W0** → push → deploy READY → **OTA android/ios** → **encendido en
  W6.8** (`deleted_at = null`, criterio «= 22 vivos») → `pnpm qa:prod:suave`. TASKS y PLAN dicen lo mismo.
- **Los tres puntos de [DATA](DATA.md) — verificados y ya corregidos.** (a) §3: el seed nace con `deleted_at = now()` en
  las 13 filas y el `do update` **no** toca `deleted_at` (nunca revive; el encendido es exclusivo de W6.8). (b) §4.4:
  `loadClGroups()` resuelve los 13 destinos por `portion_system = 'cl' and is_system` **sin** filtrar
  `deleted_at is null` y **aborta si encuentra menos de 13**. (c) §6: `convertPortionsToCl` materializa cada destino en
  la posición de su **primer origen** dentro de la franja (nada de `[...converted, ...kept]`), con `ARL`+`G` colapsados
  en esa posición y la nota concatenada por `mergeNotes` — justo lo que exige W3.4.
- **Colisión W2 ∥ W3 (D-5) — confirmado.** La carcasa del banner legado la monta **W2** (W2.4/W2.7), **W3.6 solo la
  enchufa**, y el jefe mergea en el orden **W2 → W4 → W3**. No se serializa W3 después de W2.
- **Fallback del sheet sin foto (D-2) — `GroupDot` del grupo.** El RPC **no** emite `category`: nada de una quinta llave
  ni de una tarea nueva en W5.1.
- **Miniatura del sheet (D-4) — 36 px en RN y en web.** El kit ofrece 36/48/64 y no se agrega un 40; W5.7 y W5.8 quedan
  parejos y no hace falta declarar nada extra en SPEC §16.
- **Los dos puntos de PLAN — corregidos.** §Contratos 5 dice **16 + 87 = 103** (contados en `f93378c3`, sin `.each`), y
  §W4 cita la migración real del day snapshot,
  `supabase/migrations/20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql` (verificada en el repo; el
  `…_nutrition_v2_day_snapshot.sql` que citaba la versión vieja **no existe**).
- **Índice para `findUsedPortionSystemsForCoach` (D-3) — ninguno por defecto.** Solo si el EXPLAIN 6 de W0.6 muestra un
  **seq scan relevante** sobre `nutrition_slot_exchange_targets_v2` se agrega `(version_id, exchange_group_id)` en una
  **migración aparte**, con su tarea propia en W1. Nada de índices preventivos ni de umbral en milisegundos.

### Ronda de remate (contradicciones de `critics/consistencia.md`, 2026-09-09) — cerradas

- **X-08 · El host del lienzo RN queda sin switch (D-1) — sí.** `QuickEditMode.tsx:2011-2020` se pinta solo con
  `editorMode === false`, así que dentro del editor único no se renderiza: queda **byte-idéntico** y **sigue
  despachando `SET_TARGET` sin `scope`**. Declararlo así es lo que R-07 pedía; no hay paridad que agregar en el
  quick-edit clásico.
- **X-06 · `imageLicense` (D-9) — confirmado.** Son **cuatro** llaves (`imagePath`, `imageVersion`, `imageLicense`,
  `isGeneric`) y el payload queda en **~149 kB (+29 %)**. Está aplicado en W5.1/W5.2/W5.4/W5.8/W5.9 y en OUTLINE §13,
  SPEC §9.1/§9.4 y DATA §8.2/§8.4/§10.3: no se saca de ningún lado.
- **X-05 · Rama (b) del rollback — cerrada.** `raise exception` + rollback de código, como dice DATA §3.4. No queda
  pregunta abierta; se deja escrito para que nadie reponga la redacción vieja.
- **X-09 · Fila de Legumbres y mockup (D-8) — aplicado.** SPEC §7.2 ya dice «Legumbres 1 → Legumbres secas **0,5** ·
  Revisar **125 → 85**» con el pie «620 → 555 kcal», y `context/mockups-v1.html` se regenera con esos copys **en tuteo**
  y **en la misma URL**.
- **X-01…X-04, X-07, X-10 — aplicadas en SPEC, PLAN y DATA** en sus propias secciones; nada pendiente en este archivo.

**Lo que NO se decide acá**: las preguntas al owner (macros_confirmed, aviso que no bloquea, lácteo por default, crear
grupo propio en web, UDD 2019 vs 2021) viven en **SPEC §15 Q1–Q5** y siguen abiertas.
