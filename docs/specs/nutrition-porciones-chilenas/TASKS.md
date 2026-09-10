---
status: done
owner: product-engineering
last_verified: "2026-09-10"
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
- [x] W0.9 [owner] OK del informe del dry-run (artifact
      https://claude.ai/code/artifact/8494a516-51ef-4b2f-a21f-37dcb2d06330, publicado 2026-09-09 con las preguntas Q1–Q5:
      12 alimentos sin catálogo · 3 excepciones de carnes · 7 macros dudosas + 14 representantes de marca · apply · dónde vive
      la rama). **Respuesta del owner, 2026-09-09 ~17:40Z, textual: «Q1 a, Q2 a, Q3 a, Q4 a, Q5 a ultracode on y que bueno
      que caches cosas que estaban mal asi que eso lets GO»** ⇒ alta de Congrio, Plateada, Pepino dulce, Pan amasado y Mote de
      trigo con macros del INTA + `skip` de los otros 7 · las 3 excepciones se aceptan · dudosos y marcas quedan marcados ·
      apply hoy · la rama sigue en el worktree sin push.
- [x] W0.10 [jefe] Aplicar por MCP en LIVE: 120000 → 120500 (inertes: solo columnas con default e índice parcial) →
      seed **apagado** (13 filas con `deleted_at` no nulo), más `get_advisors` (security + performance). **Criterio**:
      `count(*) from exchange_groups where is_system and deleted_at is null` sigue en **22 − 13 = 9** (nada cambia para
      los 106 coaches); `count(*) where portion_system='cl' and is_system` = 13; 0 advisors nuevos; registrar **archivo**
      y **versión LIVE** de cada migración (pueden diferir). **El criterio «= 22» se verifica en W6.8, no acá.**
- [x] W0.11 [jefe] **Ejecutado 2026-09-09 ~18:30Z en dos corridas** (`NUTRITION_PORTIONS_CL_CONFIRM=yes` + `--apply` por
      `jiti`): corrida 1 ⇒ 153 curadas + 2.341 derivadas insertadas, 0 con dueño tocadas, pero las 5 altas §5.3 fallaron
      («invalid input syntax for type integer»: `foods.calories/protein_g/carbs_g/fats_g` son INTEGER) y el guard «CB > 0,40»
      marcó 2 (eran los curados con `control_exception`); fix del script (redondeo al insertar + el guard excluye y lista las
      excepciones) ⇒ corrida 2 idempotente: 5 `foods` creados (Congrio 73/17/1/1 · Plateada 134/20/1/6 · Pepino dulce
      28/0/6/0 · Pan amasado 429/7/53/21 · Mote de trigo 131/4/30/0, `eva`/`CL`/`per_100`) + 5 curadas, 153 saltadas por
      conflicto, guards 0/0. Total **2.499** filas globales del set chileno. Las macros de las 5 altas se transcribieron del
      INTA 1999 (págs. 70, 64, 54, 44, 44) por dos lectores Opus independientes con adjudicador (workflow
      `porciones-cl-inta-macros`; PDF renderizado con PyMuPDF en `D:\tmp\pdf_pages`).
      Diseño original de la tarea: `--apply` del script + genéricos curados (se puede correr con los grupos apagados: `exchange_group_foods`
      referencia el `exchange_group_id`, no la visibilidad, y el script corre con service-role). **Criterio**: assert
      «0 filas con `coach_id` u `org_id` no nulo modificadas»; las 19 filas propias de coaches siguen con su `updated_at`
      anterior; ninguna de las filas escritas es visible para un coach mientras el set siga apagado (chequeo: el picker
      web de una cuenta de prueba sigue mostrando las 9 filas de siempre).
- [x] W0.12 **Corridas en LIVE 2026-09-09 (post-apply)**: Q1 13 sembrados / 13 con `deleted_at` / 0 vivos · Q2 0 códigos
      duplicados · Q3 112 coaches en `cl` / 0 en `smae` · Q4 equivalencias por grupo (total / con medida casera): LD 77/7 ·
      LS 109/8 · LE 211/12 · CB 299/16 · CA 302/14 · LGS 83/8 · VG 105/16 · VL 12/12 · FR 216/16 · PCT 707/28 · AG 317/10 ·
      AZ 10/10 · SCP 51/1 = **2.499** (2.341 derivadas + 158 curadas) · Q5 PCT: Arroz Blanco (cocido) 130 g «¾ taza», Arroz
      Integral (cocido) 120 g, Marraqueta 50 g «½ unidad», Hallulla 50 g, Pan blanco de molde 60 g «2½ rebanadas», Papa cocida
      150 g «1 unidad regular», Pan amasado 35 g «¼ unidad»; LD Leche descremada 200 g; CB Atún al agua 60 g, Camarones 120 g;
      FR Frambuesas 130 g · Q6 medidas caseras = la segunda cifra de Q4 (158 filas; el manual dio 8–28 por grupo, no 30–50) ·
      Q7 filas en CB con share > 0,40: **solo Huevo 0,63 y Lomo liso 0,54**, las dos con `control_exception` (UDD p. 57) ·
      Q8 0 · Q9 0 · extra: 0 grupos `cl` vivos (sigue apagado), 19 filas con dueño intactas.
      Diseño original: Verificaciones SQL post-seed, con el número al lado (patrón Q1…Q6): Q1 grupos `'cl'` sembrados = 13,
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
      `--apply` OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen) (W0.9).
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
Porotos granados, Margarina, Chancaca) con la alternativa anotada en `match_note`; (g) el control de carnes evalúa
también a los curados que recién se crean en el apply, armando el alimento sintético desde `macros_100` (sin esto
Congrio/Plateada quedaban «sin verificar» y bloqueaban); (h) `foods.calories/protein_g/carbs_g/fats_g` son INTEGER: el
JSON conserva los decimales del manual y el alta redondea; (i) el guard post-apply «0 CB con share > 0,40» excluye los
curados con `control_exception` y los lista; (j) **W1.7(b)** —la partición por sección en `EditablePortionsSection.tsx` y
`EditablePortionsCard.tsx`— se hace en **W2** junto con el rediseño del picker (W2.4/W2.7); W1 deja `comparePickerGroups`
con tests.

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

- [x] W1.1 [Opus] `portionSystem?: 'smae' | 'cl'` — **OPCIONAL, y en las DOS interfaces `ExchangeGroup`**: la del engine
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
- [x] W1.2 [Opus] `QePortionGroup` (`packages/nutrition-v2/editor-state.ts:247-258`) gana `portionSystem?: 'smae' |
      'cl'`, propagado en `catalogToPortionGroups` (`:588-600`); `collectPortionGroups` (`:549-568`) lo deja
      `undefined` **a propósito** (el snapshot no guarda el set) y se documenta en el JSDoc. **`CL_CODES`, `systemOf` e
      `isClGroup` NO se declaran acá**: viven en `packages/nutrition-v2/exchange-visibility.ts` y nacen en **W1.4**
      (DATA §6 y §7; ver la nota de W1.4). **Criterio**: `catalogToPortionGroups` propaga el campo; los grupos que salen
      de `collectPortionGroups` lo traen `undefined`; `quick-edit-state.test.ts` verde sin editarse.
- [x] W1.3 [Opus] **Productor 1**: `findUsedPortionSystemsForCoach(db, coachId): Promise<PortionSystem[]>` en
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
- [x] W1.4 [Opus] `packages/nutrition-v2/exchange-visibility.ts` con `visibleExchangeGroupsForCoach({ groups,
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
- [x] W1.5 [Opus] **(implementado como MARCA, no filtra — decisión (k) del juicio W1.14)** Productor 2 + aplicación web en el BORDE DE PRESENTACIÓN: el loader del picker web
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
- [x] W1.6 [Opus] **Ruta móvil viva**: `apps/web/src/app/api/mobile/nutrition-v2/exchange-groups/route.ts` pasa de
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
- [x] W1.7 [Opus] **(a) hecho en W1: `comparePickerGroups` + 7 tests; (b) la partición en los dos consumidores se hace en W2.4/W2.7 junto con el rediseño del picker (decisión (j))** — Orden y secciones del picker **sin tocar `mergePortionGroupChoices`** (`editor-state.ts:641-650`,
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
- [x] W1.8 [Sonnet→Opus] `SYSTEM_EXCHANGE_CODES` (`packages/nutrition-v2/read-models.ts:638-649`) + los 13 códigos.
      **Criterio**: `reconstructExchangeGroups` devuelve `isSystem: true` para un snapshot con `code = 'PCT'`.
- [x] W1.9 [Sonnet→Opus] **(hecho por `countExchangeListRowsByGroup`, la función de la que `getExchangeListCounts` es un wrapper de una línea: mismo dato de `exchange_group_foods`, con `truncated`)** Conteo del picker web por `getExchangeListCounts` en
      `apps/web/src/app/coach/nutrition-v2/_actions/portions-groups.actions.ts:65-84`. **Criterio**: un grupo chileno con
      equivalencias en `exchange_group_foods` deja de mostrar «0 equivalencias» (test del action o verificación manual
      con captura).
- [x] W1.10 [Sonnet→Opus] `GROUP_REFS` de `scripts/nutrition-portions/heuristics.ts:113-124` + los 13 (R5) **y la unión
      cerrada `ExchangeGroupCode` de `heuristics.ts:52`** (`'C' | 'P' | … | 'LEG'`, usada además en `:72,78,79,80`): sin
      ampliarla el archivo no compila (R-09). **Criterio**: `verifyGroupRefs` no aborta con `missing_in_fixture` y
      `tsc` del script pasa (correr solo la verificación, **no** el clasificador).
- [x] W1.11 [Sonnet→Opus] `apps/web/src/lib/database.types.ts` a mano: `portion_system` en Row/Insert/Update de
      `exchange_groups` y `coaches`. **Criterio**: `pnpm typecheck` verde; el diff toca solo esas dos tablas (nada de
      regen completo).
- [x] W1.12 [Opus] Caso nuevo en `apps/web/src/services/nutrition-exchanges/nutrition-exchanges.groups.test.ts`
      atacando **`createExchangeGroup` y `updateExchangeGroup`** (no la función pura, que pasaría igual): un coach
      `'cl'` **sin** targets SMAE —o sea, uno que ya no ve el set legado en su picker— **no** puede crear ni renombrar
      un grupo propio con `code` `C`, `LAC`, `LEG`, `FR` ni `PCT`. **Criterio**: el test se pone rojo si alguien mueve
      el filtro de visibilidad dentro de `findExchangeGroupsForScope` (que es la regresión exacta de B-01).
- [x] W1.13 Gates W1 (2026-09-09, jefe, salida real en [TEST_STATUS](../../testing/TEST_STATUS.md)): `pnpm exec vitest run
      packages/nutrition-v2 packages/nutrition-engine apps/web/src/services/nutrition-exchanges apps/web/src/infrastructure/db
      apps/web/src/app/api/mobile/nutrition-v2/exchange-groups apps/web/src/app/coach/nutrition-v2/_actions
      tests/mobile-nutrition-exchange-groups-api.test.ts tests/mobile-nutrition-v2-duplicate-group.test.ts tests/nutrition-portions
      "apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit"` ⇒ **90 archivos / 1.446 tests verdes** · `pnpm typecheck` ⇒
      verde · `pnpm --filter @eva/mobile exec tsc --noEmit` ⇒ verde · eslint por archivo (web y `--config eslint.mobile.config.mjs`)
      ⇒ sin hallazgos (corrido por cada worker y su refutador) · `pnpm check:nutrition-v2-boundaries` ⇒ **454 archivos OK**.
      Invariante de conteo: `quick-edit-state.test.ts` 58 · `editor-state.day-errors.test.ts` 16 · `.meta` 22 · `publish-guards` 7
      siguen verdes sin editarse. Tests nuevos: `exchange-visibility.test.ts` 18 · `editor-state.picker-compare.test.ts` 7 ·
      `read-models.test.ts` +1 · `exchanges.repository.portion-systems.test.ts` 11 · `portions-groups.actions.test.ts` 15 ·
      `nutrition-exchanges.groups.test.ts` +11 (W1.12) · `tests/mobile-nutrition-exchange-groups-api.test.ts` +7 · `route.test.ts`
      +3; `tests/nutrition-portions/heuristics.test.ts` actualizado (fixture de 9 → 22 grupos).
      **Invariante de conteo (números reales verificados en `f93378c3`, ninguno usa `.each`)**: `editor-state.day-errors.test.ts`
      **16** · `quick-edit-state.test.ts` **58** · `quick-edit-state.meta.test.ts` **22** · `quick-edit-publish-guards.test.ts`
      **7** ⇒ **16 + 87 = 103** existentes, más los casos nuevos de cada ola. El «16 + 106 = 122» que circulaba es falso:
      quien vea 103 no rompió nada.
- [x] W1.14 [Fable] Juicio de W1 (2026-09-09): 4 workers Opus (V visibilidad ∥ T tipos → P productores + loader ∥ R ruta
      móvil + RN) con un refutador Opus por worker (0 BLOQUEA en la primera ronda; dos MEJORA elevadas a corrección por el jefe) y
      una ronda de fixes con refutadores (0 BLOQUEA; T corrigió además el fixture stale de `tests/nutrition-portions/heuristics.test.ts`).
      **Decisiones del jefe:** **(k)** el loader web `portions-groups.actions.ts` MARCA y no filtra (devuelve el catálogo completo
      con `portionSystem?` por fila + `portionSystem`, `legacySystems`, `degraded`): alimenta seis superficies, entre ellas
      `FoodCatalogBrowser → ClassifyFoodFlow`, que resuelve ids ya asignados; la partición vive en el consumidor del picker
      (`EditablePortionsCard.tsx`, W2.7), espejo de la ruta móvil y de RN — DATA §7.3 corregido. **(l)** piso defensivo en
      `visibleExchangeGroupsForCoach`: si el input trae grupos del sistema y el resultado no deja ninguno, devuelve todo sin
      `legacy` (entre W0 y W6.8 los 13 chilenos están apagados y un coach `cl` sin SMAE vería un picker vacío) — casos 17/18 del
      test. **(m)** `portionSystem` sin `| null` en todo el motor (DATA §7 corregido) y `findUsedPortionSystemsForCoach` en forma
      JOIN (V2 ∪ V1, dedupe, ≤ 2 elementos) por la evidencia E6 de W0.6. **(n)** DATA §7.2 filas 3 y 8 contradecían el código de
      §7: corregidas. **(o)** `SYSTEM_EXCHANGE_CODES` con 22 códigos no colisiona con los 5 custom vivos (PRO, CER, LDC, ARG,
      CHO; verificado en LIVE). **(p)** `classify-foods.mjs` (no se corre en este tren) reporta `missing_in_db` de los 13 chilenos
      hasta el encendido de W6.8: queda anotado en W6.8. **MEJORA pendientes (backlog):** el cliente RN podría descartar el set
      propio de `legacySystems` (hoy lo garantiza el servidor); el degradado del loader web es silencioso (la ruta móvil sí deja
      `errorCode: 'VISIBILITY_DEGRADED'` en el log); un `null` de `findCoachPortionSystem` no se marca como degradado.

## W2 · Picker, bump, tap-to-edit y Legumbres (2 d)

- [x] W2.1 [Opus A] `packages/nutrition-v2/editor-state.ts`: acción `BUMP_PORTION_TARGET { variantKey, slotKey,
      exchangeGroupId, by? }` + `findPortionTargetByGroup` + `portionsAfterBump` + export de `formatPortionsEsCl`.
      **Criterio**: casos nuevos — suma 0,5 al target del grupo; no-op si el grupo no está; satura en 99 (no-op
      **numérico**: «99,0» no ensucia el borrador); `ADD_PORTION_TARGET` sobre un grupo presente **sigue** siendo no-op.
      **Cerrado 09-09**: los casos viven en `packages/nutrition-v2/editor-state.portions-bump.test.ts` (15) y no en
      `_quick-edit/quick-edit-state.test.ts` (decisión (v): el reducer vive en el paquete y los 58 congelados no se tocan).
      Gate: `pnpm exec vitest run packages/nutrition-v2` ⇒ 48 archivos / 849 tests.
- [x] W2.2 [Opus A] `qeGroupRefPerPortion(group, groups)` + `qeGroupRefPerPortionFromDict(group, dict)` +
      `qeGroupRefLabel(ref, { confirmed })` + `formatMacroEsCl` en el paquete, sobre `macrosForTargets`. **Cerrado 09-09**:
      `packages/nutrition-v2/editor-state.portions-ref.test.ts` (LEG ⇒ 125/15/9/3, dict vacío ⇒ `ref` crudo, base ausente ⇒
      `ref` crudo, simple ⇒ su ref, paridad exacta con la variante `FromDict`).
- [x] W2.3 [Sonnet→Opus] Copys en `packages/nutrition-v2/nutrition-portions-copy.ts`: `builder.{setChile,setLegacy,setOwn,
      legacyBadge,groupUsedBump,groupBumped,groupBumpedUndo,groupAtMax,stepperEditHint,portionsInputAria}` en tuteo
      (SPEC §16.1). **Cerrado 09-09**: `groupUsed` intacto; `setLegacy(n?, surface)` pluraliza «1 plan / N planes», sin `n`
      dice «Legado (SMAE) · Toca para ver» (web «Clic para ver»); `groupAtMax(franja)` = «Ya está en {franja} con 99 · es el
      máximo» (99 = `PORTION_MAX` formateado; texto del worker aprobado por el jefe, **OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen)**, decisión (u)).
- [x] W2.4 [Opus A · RN] `EditablePortionsSection.tsx`: fila usada sin `disabled` ni `opacity-50` (salvo tope 99),
      subtítulo `groupUsedBump`, secciones «Sistema chileno» / «Propios» / «Legado (SMAE)» colapsable y **sticky**
      (`stickyHeaderIndices`), chip `legacyBadge`. Partición en el consumidor sobre la lista mergeada
      (`mergePortionGroupChoices` byte-idéntico) con `comparePickerGroups` + **overlay del catálogo vivo
      `applyCatalogMetaToPickerGroups` (remate W2, decisión (s))**: un grupo SMAE ya prescrito cae en «Legado» y el orden
      sale por `sortOrder` (PCT, CB…), sin catálogo nada cambia (R18). Carcasa del banner solo con `onConvertPress`
      (queda POR FRANJA: W3.6 la levanta a nivel plan, decisión (x)). **Cerrado 09-09**; QA en device ⇒ W2.11.
- [x] W2.5 [Opus A · RN] `QuickEditMode.tsx`: `BUMP_PORTION_TARGET` al elegir un grupo ya usado, resalte 1,2 s con
      `Animated` (`useNativeDriver: false`, respeta `useReducedMotion`), toast con `id` estable y «Deshacer» que restaura
      el valor capturado; **remate**: si la fila queda fuera de vista, scroll con el mismo gesto de `jumpToDay` (SPEC §7.4).
      **Cerrado 09-09** (dos taps ⇒ un toast; Deshacer vuelve al valor inicial de la interacción; baseline expira a los 4 s).
- [x] W2.6 [Opus A · RN] Stepper con `TextInput` siempre montado (`decimal-pad`, `inputAccessoryViewID`,
      `selectTextOnFocus`, valor crudo mientras se tipea, formateo en `onBlur`) y error `portion.<key>.portions` bajo la
      fila con `accessibilityLiveRegion="polite"`. **Cerrado 09-09** (el árbol no cambia por foco; «1,3» muestra el error).
- [x] W2.7 [Opus B · web] `EditablePortionsCard.tsx`: bump + `ring-2 ring-primary/60` + `scrollIntoView` + toast de
      `sonner` con `action`, secciones Sistema chileno → Propios → Legado (`setOwn`, `setLegacy(undefined, 'web')`,
      `aria-labelledby`), `portionsPickerHint` reescrito, carcasa del banner con `onConvertClick` (por franja: W3.6 la
      levanta a `QuickEditPlanView`), `isSystem`/`sortOrder`/`portionSystem` **reales** del catálogo vía
      `applyCatalogMetaToPickerGroups` (`SYSTEM_EXCHANGE_CODES` solo como fallback sin catálogo, decisión (w)).
      **Cerrado 09-09**: RTL `EditablePortionsCard.test.tsx` 16 casos (a–d + SMAE prescrito ⇒ Legado, propio «C» ⇒ Propios,
      orden por `sortOrder`, sin catálogo sin títulos, porciones ilegibles); `pnpm exec vitest run "…/_quick-edit"` ⇒ 6/128.
      **Corrección 09-09 (jefe):** la carcasa del banner y la prop `onConvertClick` que dejó esta tarea **se retiraron en
      W3.6** —con su test «con `onConvertClick` se monta»—: la card se monta una vez POR FRANJA y el aviso es por PLAN
      (SPEC §7.2 y §8.3, mockup M2). El diff neto de W2.7 sobre el banner es cero; todo lo demás de W2.7 sigue en pie.
- [x] W2.8 [Opus B] D5 en las etiquetas «1 porción ≈» del coach (RN y web) con `qeGroupRefPerPortionFromDict` (dict
      memoizado por apertura). **Cerrado 09-09**: Legumbres SMAE deja de decir «0 kcal»; cubierto por
      `editor-state.portions-ref.test.ts` (la etiqueta usa los `ref_*` congelados del snapshot, no el catálogo vivo).
- [x] W2.9 [Opus B] R11: misma corrección en la cabecera de los dos `PortionEquivalencesSheet` del alumno. **Cerrado
      09-09**: test web nuevo `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/PortionEquivalencesSheet.test.tsx`
      (3 casos: plan que solo prescribe LEG ⇒ «≈ 125 kcal · P 9 g · C 15 g · G 3 g», fallback al ref crudo, simple intacto).
- [x] W2.10 [Sonnet→Opus] PostHog `nutrition_portion_group_bumped` en web y RN con el **único** constructor del paquete
      (`packages/nutrition-v2/portions-analytics.ts`: `PORTIONS_EVENT_GROUP_BUMPED`, `portionGroupBumpedPayload(surface,
      props)`). **Corrección de texto (decisión (q))**: el shape es el de DATA §11 —fuente única, fix S-07—
      `{ surface, group_code, portion_system, from, undone }`, no `{ surface }`. **Cerrado 09-09**: cero kcal, gramos,
      nombres de alimentos o ids (test exhaustivo en `editor-state.portions-bump.test.ts`).
- [x] W2.11 [owner] QA en device de los puntos 1–4 y 10 del checklist final. **PASÓ 10-09** (veredicto en el checklist).
- [x] W2.12 Gates W2 (09-09, sobre `564a2d2c` + remate): `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine
      "apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit" "apps/web/src/app/c/[coach_slug]/nutrition-v2"
      tests/mobile-nutrition-v2-portions.test.ts tests/nutrition-portions apps/web/src/app/coach/nutrition-v2/_actions` ⇒
      **92 archivos / 1.578 tests verdes** · `pnpm typecheck` ⇒ exit 0 · `pnpm --filter @eva/mobile exec tsc --noEmit` ⇒
      exit 0 · eslint por archivo (web y `--config eslint.mobile.config.mjs`) sin hallazgos (workers) ·
      `pnpm check:tokens` ⇒ OK (86 + 5) · `pnpm check:nutrition-v2-boundaries` ⇒ 460 archivos OK. Los 103 tests congelados
      del editor (58 + 22 + 7 + 16) sin editar y verdes.
- [x] W2.13 [Fable] Juicio de W2 (A y B por separado), 09-09: workflow `wf_1cbd5814-89d` (paquete → RN ∥ web → 3
      refutadores Opus, 2 rondas por lane, 18 agentes) + remate `wf_717c9069-8ab` (8 agentes, 1 BLOQUEA real cazado:
      `setSystemGroupIds` huérfano ⇒ TS2304). Decisiones del jefe:
      (q) **DATA §11 manda** sobre el texto abreviado de TASKS W2.10: 5 props, un solo constructor en el paquete.
      (r) **Tres particiones en las dos superficies** (SPEC §7.1:277 + W2.7 d): «Propios» solo se dibuja si hay propios.
      (s) **Overlay de metadatos en el consumidor** (`applyCatalogMetaToPickerGroups`): `collectPortionGroups` sigue sin
      inventar set (R18) y el merge no se toca (R17); el catálogo vivo pega `portionSystem`/`sortOrder`/`isSystem` por id.
      (t) **`setLegacy()` sin conteo de planes** en RN y web: el loader de W1 no devuelve el conteo y pedirlo sería alcance
      nuevo; fila añadida a SPEC §16.1 («Legado (SMAE) · Toca/Clic para ver»).
      (u) `groupAtMax` sin fila en §16.1: texto del worker aprobado provisionalmente, OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen).
      (v) Tests del reducer en el paquete, no en `_quick-edit`.
      (w) Web usa el `isSystem` real del catálogo; la inferencia por código queda solo como fallback sin catálogo.
      (x) **Banner legado**: la carcasa de W2 vive por franja en las dos superficies; W3.6 la levanta a nivel plan
      (`QuickEditMode` RN / `QuickEditPlanView` web), carga el catálogo ANTES de decidir el banner y persiste «Ahora no»
      30 días por `planId`. MEJORA diferidas al backlog (abajo).

## W3 · Conversión SMAE → chileno (2 d)

- [x] W3.1 [Opus] `packages/nutrition-v2/exchange-conversion.ts`: `CL_CONVERSION_MAP` (los 9 orígenes de DATA §6),
      `CL_DAIRY_FACTORS`, `round05`, `convertPortionsToCl(input)` ⇒ `{ variants, diff, unresolved, dayDeltas }` con
      `isClGroup` / `CL_CODES` **importados** de `exchange-visibility.ts`. **Cerrado 09-09** con la **decisión (ad)**:
      el filtro de destinos NO es `catalog.filter((g) => isClGroup(g, coachSystem))` sino `makeIsClDestination` (manda el
      `portionSystem` explícito de la fila; `CL_CODES` solo para catálogos que no declaran set en ninguna fila) — con la
      firma del SDD los grupos propios de josefit y Pame se proponían como reemplazo de sí mismos para un coach `cl`.
      `coachSystem` no participa del filtro. Tabla en `exchange-conversion.test.ts`: casos 1–29 de DATA §6.4 + extras
      (`2 C ⇒ 1 PCT`, `3 P ⇒ 2 CB`, `1 F ⇒ 1 FR`, `7,5 V ⇒ 6 VG`, `5,5 LAC ⇒ 7,5 LD` y `LS`/`LE`, `1 LEG ⇒ 0,5 LGS`,
      `1 SP ⇒ 1 SCP`, piso 0,5, tope 99). Un target sin cantidad legible viaja intacto y nunca duplica su grupo.
- [x] W3.2 [Opus] Colapso `ARL` + `G` → `AG` **antes** del payload. **Cerrado 09-09**: un solo target destino con la
      suma, en la posición del primer origen (casos 14/15/29); dos filas al mismo grupo violarían
      `unique (meal_slot_id, exchange_group_id)`.
- [x] W3.3 [Opus] Propuesta de reemplazo de grupos custom con match único (±5 kcal, ±1 g). **Cerrado 09-09**:
      «Carbohidratos 140/30» matchea `PCT`; «Proteinapro» no matchea y queda intacto; ningún custom se soft-borra.
      **Remate**: la identidad del reemplazo aceptado es por `exchangeGroupId`, nunca por código (un propio que repite el
      código del destino dejaba el reemplazo en no-op silencioso), remate `wf_bb008643-c13` (14 agentes: paquete 1 ronda, repo 0, RN 2, web 0) con el repro del custom `FR`.
- [x] W3.4 [Opus] `REPLACE_PORTION_GROUPS` en `editor-state.ts`: materializa cada destino en la posición de su primer
      origen, conserva las notas concatenadas y los no convertibles en su lugar. **Cerrado 09-09**:
      `editor-state.replace-portion-groups.test.ts` compara la secuencia de `key` antes y después.
- [x] W3.5 [Opus] `PortionConversionSheet.tsx` (RN, `Sheet nativeModal snapPoints={['85%']}`) y
      `PortionConversionDialog.tsx` (web, `QeBottomSheet size="lg"`): filas origen → destino con kcal antes/después
      (`formatMacroEsCl` en las dos), «Revisar», selector Descremado/Semi/Entero por franja que re-corre el motor,
      reemplazos S5 con confirmación explícita, «se conserva» con su motivo, delta del día **solo de los días tocados**
      (decisión (ae)), botones Cancelar / «Convertir borrador» ⇒ `REPLACE_PORTION_GROUPS` + toast «Deshacer»
      (`RESTORE_DRAFT`). **Cerrado 09-09**: nada se escribe hasta «Convertir borrador»; publicar sigue aparte; RTL del
      diálogo web + test de tabla del banner RN.
- [x] W3.6 [Opus] Banner del plan legado (RN y web) con «Ver conversión» y «Ahora no» (30 días por `planId`:
      `AsyncStorage` / `localStorage`, sin columna nueva). **Cerrado 09-09**, UNO POR PLAN: la carcasa por franja de
      W2.4/W2.7 se retiró y el banner lo montan `QuickEditMode` (RN) / `QuickEditPlanView` (web) una sola vez (SPEC
      §7.2/§8.3, mockup M2); **guard de destinos** (`hasClDestinations`: sin un grupo `cl` vivo no se pinta, porque hasta
      W6.8 los 13 chilenos tienen `deleted_at`); y **decisión (af)**: «SMAE en uso» son grupos del SISTEMA con `smae`
      prescritos — los grupos PROPIOS nunca cuentan (nacen con `portion_system = 'smae'` por el default de W0.1) — con la
      decisión pura `draftUsesLegacySmae(variants, groups, coachSystem)` en el paquete y el repo
      `findUsedPortionSystemsForCoach` filtrando `is_system = true` (defecto de W1.3 corregido acá).
- [x] W3.7 [Sonnet→Opus] Copys `convert.*` (las once llaves nuevas ya en SPEC §16.1; el botón secundario reusa
      `groupEditor.cancel`) y PostHog `nutrition_portion_conversion_previewed` / `…_applied` con el shape COMPLETO de
      DATA §11 (eventos 2 y 3, con `surface`) construido SOLO por `portions-analytics.ts` (decisión (ag)); `previewed`
      cuenta previews (se emite una vez por apertura y solo con `diff` no vacío), no aperturas. **Cerrado 09-09**: sin
      kcal ni nombres; `portions-analytics.test.ts` afirma las llaves de los cuatro constructores.
- [x] W3.8 [owner] (**PASÓ 10-09**) QA en device del punto 5 del checklist final (incluye: el banner no aparece con solo grupos propios;
      hasta W6.8 tampoco aparece porque no hay destinos vivos; `ensureLoaded` al montar suma un request por apertura
      del editor clásico).
- [x] W3.9 Gates W3 (09-09, sobre `6e2b37cb` (checkpoint) + remate y docs (este commit)): `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine "apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit" "apps/web/src/app/c/[coach_slug]/nutrition-v2" apps/web/src/infrastructure/db apps/web/src/app/api/mobile/nutrition-v2/exchange-groups apps/web/src/app/coach/nutrition-v2/_actions tests/mobile-nutrition-v2-portions.test.ts tests/mobile-nutrition-v2-targets-switch.test.ts tests/mobile-nutrition-v2-conversion-banner.test.ts tests/mobile-nutrition-exchange-groups-api.test.ts tests/nutrition-portions` ⇒ **109 archivos / 1.843 tests verdes** (tras corregir el fixture del RTL del diálogo: el catálogo del test no traía `isSystem` y `draftUsesLegacySmae` falla cerrado) · `pnpm typecheck` ⇒ exit 0 · `pnpm --filter @eva/mobile exec tsc --noEmit` ⇒ exit 0 · `pnpm check:tokens` ⇒ OK (86 + 5) · `pnpm check:nutrition-v2-boundaries` ⇒ 471 archivos OK · eslint por archivo sin hallazgos (workers). Tests nuevos: `exchange-conversion.test.ts` (tabla 1–29 + extras, S5 por id, `draftUsesLegacySmae` 31–37), `editor-state.replace-portion-groups.test.ts`, `portions-analytics.test.ts` (12), RTL `PortionConversionDialog.test.tsx` (22), `tests/mobile-nutrition-v2-conversion-banner.test.ts` (21), repo `exchanges.repository.portion-systems.test.ts` (+4). Smoke SQL `exchange_groups_portion_system_rollback.sql` alineado (`d_sets_en_uso` solo grupos del sistema).
- [x] W3.10 [Fable] Juicio de W3, 09-09: workflow `wf_6efc8f00-3c9` (conversor → RN ∥ web → 3 refutadores, 2 rondas por
      lane, 18 agentes; los tres lanes terminaron con 1 BLOQUEA real cada uno) + remate `wf_bb008643-c13` (paquete →
      repo ∥ RN ∥ web → 4 refutadores). Commits: `6e2b37cb` (checkpoint) + remate y docs (este commit). Decisiones del jefe: (ad) `makeIsClDestination`
      manda sobre el filtro literal del SDD; (ae) paridad de presentación (kcal con `formatMacroEsCl`, delta solo de días
      tocados); (af) «SMAE en uso» = grupos del sistema (repo + helper puro), los propios jamás; (ag) eventos 2 y 3 con
      shape completo y `surface` desde el paquete. MEJORA diferidas al backlog: referencias de línea en JSDoc del
      conversor, separador `' · '` de `mergeNotes`, `origins.length === 0` con dos fuentes (inalcanzable por la
      `unique`), test RN del sheet de conversión (hoy solo el de tabla del banner).

## W4 · Metas por día (1 d)

- [x] W4.1 [Opus] `SET_TARGET` y `STEP_TARGET` con `scope?: 'day' | 'all'` en `packages/nutrition-v2/editor-state.ts`;
      `scope: 'all'` escribe en el base y en los días que heredaban (`qeTargetsEqual` evaluado **antes** del cambio).
      **Cerrado 09-09**: `editor-state.day-targets.test.ts` — sin `scope` comportamiento actual; base y martes vacíos ⇒
      ambos con la meta; no pisa un día con metas propias; desde un día que hereda escribe también la base. **Nota
      declarada (W4.9)**: el reducer recalcula «quién hereda» EN CADA dispatch con `scope: 'all'`, por eso las
      superficies NO propagan campo a campo con `'all'`: resuelven las llaves una vez con `qeSwitchOffPlan` y escriben
      `scope: 'day'`.
- [x] W4.2 [Opus] Helpers `qeTargetsEqual`, `qeDaysMissingTargets`, `qeTargetsGapBar`, `joinDayLabels` y acción
      `APPLY_BASE_TARGETS`. **Cerrado 09-09**: `qeTargetsGapBar` es `null` sin ningún día con meta y con todos; nombra
      1/2/3 días; `APPLY_BASE_TARGETS` idempotente (misma referencia). **Remate**: los dos helpers salen del mismo mapa
      día → variante servida (`servedVariantByDow`; el base cuenta solo si sirve a algún día; una variante no-default con
      `dayOfWeek === null` no cuenta) y `applyBaseTargets` RELLENA campo a campo (un día con kcal propias no se toca,
      comportamiento declarado para el QA de W4.7). **Remate 2**: `qeSwitchOffPlan(state, dayKey)` (única verdad del
      «apagar el switch», `wf_0ad946ab-3f5`, 6 agentes, 0 BLOQUEA: `qeSwitchOffPlan(state, dayKey)` ⇒ `{ mode: 'back_to_base' | 'applied_to_all', keys, writes, snapshot }` con simulación end-to-end del reducer (7 casos); RN y web sin lógica local ni `scope: 'all'` campo a campo).
- [x] W4.3 [Opus] Switch «Solo el {día}» en `TargetsEditorCard` RN y web, default por estado (base ⇒ oculto; día igual al
      base ⇒ OFF; distinto ⇒ ON; plan de un día ⇒ oculto), `role="switch"` / `accessibilityRole="switch"`; en RN solo
      en la hoja del header con `KeyboardDoneBar` dentro del `Sheet`; la card del lienzo clásico (`editorMode === false`)
      queda byte-idéntica y sin `scope`. **Cerrado 09-09** con la **decisión (y) del jefe**: apagar el switch estando ON
      NUNCA borra — base con kcal ⇒ copia el base sobre el día («{Día} vuelve a la meta de todos los días»); base SIN
      kcal (el plan de Pame) ⇒ propaga la meta del día al base y a los días que heredaban («Ahora vale para toda la
      semana»); ambos con «Deshacer» por snapshot de las variantes tocadas. En el día base (switch oculto) las dos
      superficies escriben con `scope: 'all'` («escribir la base es escribir todos», SPEC §7.5).
- [x] W4.4 [Opus] Aviso no bloqueante: `dayNotice` en `PublishBar` RN y `noticeMessage`/`noticeAction` en la web (ámbar,
      `role="status"`), «Ir a Base» = `APPLY_BASE_TARGETS` + `jumpToDay('default')`, primario «Publicar igual».
      **Cerrado 09-09**: `quick-edit-publish-guards.targets.test.ts` — un plan con metas parciales sigue publicando
      (`validation.ok === true`); los 16 de `editor-state.day-errors.test.ts` sin editar.
- [x] W4.5 [Sonnet→Opus] Punto ámbar de los días sin meta en `DayAnchorRow` (RN) y en cápsula + rail (web) con el estilo de
      `attentionKeys`, sin pasar por `showErrors`; «sin meta» en la cinta (`targets.dayNoTarget`). **Cerrado 09-09**.
- [x] W4.6 [Sonnet→Opus] Copys `EDITOR_TARGETS_COPY` (`packages/nutrition-v2/editor-copy-targets.ts`):
      `targets.{onlyThisDay,onlyThisDayOff,onlyThisDayOn,backToBase,appliedToAll,undo,dayNoTarget}` y
      `publish.{partialTargets,anyway,goToBase}`; RN y web solo reexportan. PostHog `nutrition_targets_scope
      { surface, scope, from }` (DATA §11 evento 4) desde el switch y «Ir a Base». **Cerrado 09-09** con la **decisión (z)**:
      el título de la hoja queda FIJO «Metas del día» en RN y web (mockup M4 aprobado + SPEC §7.5 «decisión del
      writer»); el criterio «deja de decir Metas del día cuando escribe en todos» queda superado — la verdad del
      alcance la dice la ayuda del switch. OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen) sobre esa decisión y sobre los copys nuevos
      (`backToBase`, `appliedToAll`; filas en SPEC §16.1).
- [x] W4.7 [owner] (**PASÓ 10-09**) QA en device de los puntos 6 y 7 del checklist final (incluido: en RN el aviso con «Deshacer» es
      INLINE dentro del sheet porque el `Toaster` raíz queda detrás del `nativeModal`; en iOS confirmar que el
      `KeyboardDoneBar` del Modal gana); además, arreglar el plan real de `nutricionista-pame-cid` con «Ir a Base» (es
      el único plan afectado en LIVE; los días con kcal propias no se tocan).
- [x] W4.8 Gates W4 (09-09, sobre `383e4a74` (checkpoint) + `20769987` (remate 1) + remate 2 y docs (este commit)): `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine "apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit" "apps/web/src/app/c/[coach_slug]/nutrition-v2" tests/mobile-nutrition-v2-portions.test.ts tests/mobile-nutrition-v2-targets-switch.test.ts tests/nutrition-portions apps/web/src/app/coach/nutrition-v2/_actions` ⇒ **96 archivos / 1.626 tests verdes** · `pnpm typecheck` ⇒ exit 0 · `pnpm --filter @eva/mobile exec tsc --noEmit` ⇒ exit 0 · `pnpm check:tokens` ⇒ OK (86 + 5) · `pnpm check:nutrition-v2-boundaries` ⇒ 464 archivos OK · eslint por archivo sin hallazgos (workers). Tests nuevos: `editor-state.day-targets.test.ts` (28), `quick-edit-publish-guards.targets.test.ts` (3), RTL `TargetsEditorCard.test.tsx` (11), `tests/mobile-nutrition-v2-targets-switch.test.ts` (5); los 103 congelados del editor sin editar.
- [x] W4.9 [Fable] Juicio de W4, 09-09: workflow `wf_1815a117-96b` (paquete → RN ∥ web → refutadores; el refutador web
      murió por el tope de 500 caracteres del schema y se refutó de cero en el remate) + remate `wf_2daaf2b5-5ba` (12
      agentes) + remate 2 `wf_0ad946ab-3f5`. Commits: `383e4a74` (checkpoint) + `20769987` (remate 1) + remate 2 y docs (este commit). Decisiones del jefe:
      (y) apagar el switch nunca borra (propaga con base vacío / copia el base con base con kcal), lógica pura en el
      paquete (`qeSwitchOffPlan`), «Deshacer» por snapshot de las variantes tocadas;
      (z) título fijo «Metas del día» (mockup + SPEC §7.5 mandan sobre TASKS W4.6), OK del owner por delegación 10-09 («el que tú recomiendes» ⇒ se mantienen);
      (aa) DATA §11 evento 4 lleva `surface`; (ab) `applyBaseTargets` solo rellena vacíos y no toca días con kcal;
      (ac) el aviso de RN es inline (toast detrás del `Sheet nativeModal`, gotcha de `WorkoutShareComposer`).
      MEJORA diferidas al backlog: `TARGET_FIELD_KEYS`/`TARGET_ROWS`/`TARGET_KEYS` (cuarta copia de la lista de campos ⇒
      exportar `QE_TARGET_FIELDS`), ayuda del switch ON con base sin kcal (`onlyThisDayOnNoBase`), la card `md:hidden`
      web titula «Metas diarias» vs «Metas del día» del popover, `partialTargets` sin concordancia de número («Solo Lunes
      y martes tiene meta»), botón «Listo» persistente del mockup vs `KeyboardDoneBar` (iOS-only).

## W5 · Equivalencias del alumno (1,5 d)

- [x] W5.1 [Opus] `supabase/migrations/20260909130000_nutrition_today_v2_exchange_foods_media_generic.sql`: parche por
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
      **Hecho 10-09 (jefe):** migración byte-idéntica a DATA §8.2 (diff vacío, propio y del refutador); tx-rollback en LIVE
      con migración + smoke A/B/B1/C/D + aislamiento T1–T7 en una sola transacción ⇒ «W5 TX-ROLLBACK OK» (definición 21.119 →
      22.470 chars, 4 llaves, lateral, orden en el `row_number()` y en el agg, tenant 3, 4 canarios); **aplicada en LIVE:
      versión `20260910015432`** (`apply_migration`, nombre `nutrition_today_v2_exchange_foods_media_generic`; el archivo del
      repo conserva `20260909130000` como espejo, igual que W0a — el repo no corre `db push`); T7 verde tras el apply;
      `get_advisors` security/performance sin hallazgos nuevos. Remate del refutador: canarios `'media'`/`'category'` con
      comillas SQL (el desnudo lo satisfacía `public.food_media fm`), nota de ROLLBACK en dos pasos (re-aplicar
      `20260804091000` sola no revierte el empalme 1), comentario «cuatro llaves». La migración no es idempotente a
      propósito (re-aplicarla falla en el assert de unicidad del ancla).
- [x] W5.2 [Sonnet→Opus] `supabase/tests/nutrition_today_v2_exchange_foods_media_generic_rollback.sql` (A/B/B1/C/D verdes en LIVE con ROLLBACK 10-09; B con seed `f5000000` y nombres en orden alfabético inverso, C/D sobre la vista temporal `w5_block_rows`; umbral B1 ≥ 20 de los 26 genéricos con medida de PCT): casos A) el bloque
      emite las **4** llaves nuevas (`imagePath`, `imageVersion`, `imageLicense`, `isGeneric`) · B) el genérico ordena antes que la marca y,
      entre dos genéricos, el que tiene `portion_label` va primero · C) la fila del coach gana por
      `owner_rank = 0` · D) un alimento privado de otro coach sigue sin aparecer. **Criterio**: 4/4 verdes en
      `BEGIN … ROLLBACK` sobre LIVE.
- [x] W5.3 [Sonnet→Opus] `tests/team/exchange-lists-isolation.sql` extendido con la foto (T7, regresión B1; T1–T7 verdes en LIVE 10-09 antes y después del apply). **Criterio**: el
      test falla si el lateral de `food_media` se escribe sin el filtro de tenant del bloque.
- [x] W5.4 [Opus] (5 casos nuevos en `read-models.test.ts`, versión intacta = 1) Read model: `isGeneric`, `imagePath`, `imageVersion` e **`imageLicense`** (las cuatro,
      **opcionales**, `imageLicense` además `nullable`) en
      `NutritionExchangeFoodReadSchema` (`packages/nutrition-v2/read-models.ts:292-305`) + corregir el JSDoc que todavía
      dice que la fuente son las columnas `foods.exchange_*`. **Criterio**: casos en `read-models.test.ts` — payload con
      las llaves parsea y payload **sin** ellas también (binario RN viejo); `NUTRITION_READ_MODEL_SCHEMA_VERSION` no
      cambia.
- [x] W5.5 [Opus] `packages/nutrition-v2/exchange-foods-origin.ts` con `splitExchangeFoodsByOrigin` (+ `photoCreditNeeded` y `photoSourceLabel`, con los seis valores del CHECK de licencia fijados en el test). **Criterio**: test
      propio — genérico por flag, genérico por `brand == null`, marca, y **orden de entrada preservado**.
- [x] W5.6 [Opus] (paridad byte a byte web↔RN en `tests/mobile-nutrition-v2-food-media.test.ts`, test del raíz: el caso salió de `apps/web` porque era el primer import cruzado web→mobile y entraba al programa TS de la web) **Helper de URL desde `imagePath` + `imageVersion`** (R-02; el RPC emite el `object_path` y la
      `version`, no el objeto media): `foodMediaThumbnailUrlFromPath({ objectPath, version })` en
      `apps/mobile/lib/nutrition-v2-food-media.ts` y su gemelo en `apps/web/src/lib/food-image.ts`. El
      `foodMediaThumbnailUrl` existente (`nutrition-v2-food-media.ts:43-58`) **no se puede reutilizar tal cual**: exige
      `{ objectPath, bucket, version }` y el `bucket` no viaja, así que el helper nuevo lo fija en `food-media` y
      reencodea el path segmento a segmento igual que el original. **Criterio**: test de la URL construida en los dos
      lados —`${base}/storage/v1/object/public/food-media/<path encodeado>?v=<version>`—, `null` si falta la base o el
      path, y **paridad byte a byte** con lo que devuelve `foodMediaThumbnailUrl` para el mismo media.
- [x] W5.7 [Opus] (RTL: 3 casos W2.9 intactos + 8 nuevos, incluido «cambiar de tab no re-emite el evento») Sheet web: dos secciones con encabezado, miniatura **36 px** (misma medida que RN: el kit ofrece
      36/48/64 y **no existe 40**, R-11; `next/image unoptimized` + fallback, patrón `NutritionFoodRow.tsx:56-93`),
      medida casera en negrita y gramos en mono. **Criterio**: el buscador filtra **dentro** de cada sección y no dibuja
      el encabezado de una sección vacía.
- [x] W5.8 [Opus] (sin test que monte el sheet en RN: refutado leyendo + eslint mobile + tsc) Sheet RN: `FoodThumbnail size="sm"` (36 px), mismas secciones, y se borra el comentario `:243-247`
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
- [x] W5.9 [Sonnet→Opus] (claves `student.{sheetGenericsTitle,sheetBrandsTitle,photoCredit}` + quinta `student.sheetPhotoSource` por fila; evento con exactamente `surface/set/has_generic/rows_bucket`, DATA §11 corregido) Pie «Fotos: Open Food Facts (CC BY-SA)» **condicional**: se pinta solo si alguna fila **visible**
      trae `imageLicense` `cc_by_sa` o `cc_by` (D-9; con el buscador activo se recalcula sobre lo visible), y la fila
      con foto nombra su fuente en el `accessibilityLabel`/tooltip derivándola de la misma llave. Copys
      `student.{sheetGenericsTitle,sheetBrandsTitle,photoCredit}` + PostHog
      `nutrition_equivalences_opened { set, has_generic, rows_bucket }`.
      **Criterio**: un grupo servido solo con fotos `eva_owned`/`eva_illustration`/`supplier_authorized` **no** dibuja el
      pie de OFF; la atribución aparece una sola vez al pie, no por fila; el evento no lleva nombres ni cifras.
- [x] W5.10 [jefe] Medir el payload del Today de un alumno real con 7 grupos, antes y después. **Criterio**: queda por
      debajo de los 750 kB de `apps/mobile/lib/nutrition-v2-cache.ts:6`; el número se pega acá.
      **Medido en LIVE** (alumno `f28ed987-cc99-4e94-bcc8-e4b7c1eafc02`, `get_nutrition_today_v2(client, current_date,
      'America/Santiago')` en tx con claims `sub = client` y ROLLBACK): **antes (09-09) 93.907 B** — 360 filas de
      `exchangeFoods` (80.957 B), 7 llaves por fila; **después (10-09, RPC `20260910015432`) 132.878 B** — 360 filas
      (119.928 B), 11 llaves, 283 genéricos, 313 con foto, 91 con licencia `cc_by*`, 6 grupos ese día. **+41 %**, 5,6× por
      debajo del tope de 750 kB (el SPEC §9.1 estimaba +29 % sobre 532 filas; el path pesa más que la estimación).
- [x] W5.11 [owner] QA en device de los puntos 8 y 9 del checklist final. **PASÓ 10-09** (veredicto en el checklist).
- [x] W5.12 Gates W5 (2026-09-10): `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine
      "apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit" "apps/web/src/app/c/[coach_slug]/nutrition-v2"
      apps/web/src/lib/food-image.test.ts apps/web/src/infrastructure/db apps/web/src/app/api/mobile/nutrition-v2/exchange-groups
      apps/web/src/app/coach/nutrition-v2/_actions tests/mobile-nutrition-v2-portions.test.ts
      tests/mobile-nutrition-v2-targets-switch.test.ts tests/mobile-nutrition-v2-conversion-banner.test.ts
      tests/mobile-nutrition-v2-food-media.test.ts tests/mobile-nutrition-exchange-groups-api.test.ts tests/nutrition-portions`
      ⇒ **112 archivos / 1.897 tests verdes** · SQL W5.2 + W5.3 por MCP con ROLLBACK ⇒ verdes (ver W5.1) · `pnpm typecheck`
      ⇒ exit 0 **tras corregir un fixture de W3** (`PortionConversionDialog.test.tsx:146` `targets: {}` ⇒ TS2739; el
      typecheck estaba rojo en `973d5981` y ningún gate lo había vuelto a correr desde el remate de W3) · `pnpm --filter
      @eva/mobile exec tsc --noEmit` ⇒ exit 0 · `pnpm check:tokens` ⇒ OK (86 + 5) · `pnpm check:nutrition-v2-boundaries` ⇒
      473 archivos OK · eslint por archivo (workers y refutadores) sin hallazgos · `pnpm docs:check` ⇒ ver W6.1.
- [x] W5.13 [Fable] Juicio de W5 (10-09): workflow `wf_e00aa8ba-68c` (4 escritores Opus + 4 refutadores; un BLOQUEA real,
      en web: el evento se emitía por cambio de tab) + remate `wf_a144b79c-97f` (3 lanes + 3 refutadores, 0 rondas). Los
      19 archivos tocados calzan con las listas de los lanes. Decisiones del jefe: **(ah)** nombre del smoke: manda TASKS
      (`…_media_generic_rollback.sql`), DATA §10.3 alineado; **(ai)** copys: `student.{sheetGenericsTitle,sheetBrandsTitle,
      photoCredit}` + quinta clave `student.sheetPhotoSource` (por fila, `accessibilityLabel`/tooltip) — SPEC §9.3, §16.1 y
      el glosario alineados; **(aj)** evento 5 = exactamente cuatro llaves (`has_photos`/`searched` del borrador quedan
      fuera; DATA §11 corregido), `set` con `systemOf({ groupCode }, 'smae')` en las dos superficies (un grupo propio cuenta
      como `smae`: límite conocido), guard de una emisión por FRANJA (cambiar de tab no re-emite), medición sobre el target
      resuelto y la lista sin buscador; **(ak)** canarios `'media'`/`'category'` con comillas SQL, umbral B1 = 20 (26 medidos
      en PCT), nota de rollback en dos pasos — migración y DATA §8.2 siguen byte-idénticos; **(al)** el test de paridad de la
      URL vive en `tests/` (raíz), nunca un import de `apps/mobile` dentro de `apps/web`; **(am)** el chip «Valores
      referenciales» en RN depende solo de `macrosConfirmed`, como la web (el set chileno no lo muestra porque el seed lo
      sembró confirmado, R8, no por un gate de código); **(an)** `version` nula ⇒ `?v=0` en los dos helpers; `isGeneric`
      cae a `brand == null` solo cuando la llave no viene (RPC viejo o cache pre-W5). MEJORA diferidas en «Backlog heredado».

## W6 · Cierre (0,5 d)

- [x] W6.1 [Fable] SDD final en `docs/specs/nutrition-porciones-chilenas/{SPEC,PLAN,TASKS,DATA}.md` con `status` y
      `last_verified` al día. **Criterio**: `pnpm docs:check` OK (sin enlaces relativos rotos entre los cuatro archivos).
      **Hecho 10-09**: los cuatro en `status: active` (pasan a `done` con el QA del owner en device y el encendido W6.8) y
      `last_verified: "2026-09-10"`; SPEC §9.1 con el payload medido, §9.3/§16.1/glosario con las claves `student.sheet*`;
      DATA §8.2 byte-idéntico a la migración, §10.3 con el nombre real y el umbral 20, §11 con el evento 5 de cuatro llaves.
      `pnpm docs:check` ⇒ OK — 20 canónicos, 257 Markdown activos.
- [x] W6.2 [Fable] `docs/status/CURRENT.md`: mudar prosa vieja a `docs/archive/current-historial-2026-09.md` **y luego**
      agregar la entrada del tren + editar la fila «Nutrition V2». **Criterio**: el archivo queda bajo 16.384 bytes
      (hoy 16.106) y `docs:check` lo confirma en su línea de salida.
      **Hecho 10-09**: las prioridades 1–4 (cuatro trenes ya cerrados con QA del owner verde) se mudaron tal cual al historial
      bajo «Corte del 2026-09-10» y quedaron como una sola línea con punteros; el tren entra como prioridad 1 (4 líneas) y la
      fila «Nutrition V2» apunta al SDD. `docs:check` ⇒ **CURRENT.md 14,5 KB** (tope 16 KB).
- [x] W6.3 [Fable] `docs/status/MOBILE_PARITY.md`: blockquote nuevo arriba de todo (primera entrada sobre el sheet de
      equivalencias del alumno). **Criterio**: cada línea empieza con `>` y el tren anterior queda inmediatamente debajo.
      **Hecho 10-09**: blockquote «2026-09-10 (tren «Porciones a la chilena» … EN CÓDIGO, sin push)» sobre el de «Cantidades
      honestas» del 06-09; se actualiza con deploy/OTA cuando el owner dé el OK.
- [x] W6.4 [Fable] `docs/testing/TEST_STATUS.md`: sección del tren con la salida real consolidada. **Criterio**: sin
      logs largos; fecha, comando, resultado y bloqueador pendiente. **Hecho 10-09**: cabecera «W0–W6» con el consolidado
      (gates por wave, tres migraciones en LIVE, bloqueador = OK del owner) + bullets W5 y W6.5.
- [x] W6.5 [Fable] Suite completa **una vez** (`pnpm test`) con la CPU libre + `pnpm lint` + `pnpm typecheck` + tsc
      mobile + `pnpm check:tokens` + `pnpm check:nutrition-v2-boundaries` + `pnpm docs:check`. **Criterio**: salida real
      pegada; ningún test nuevo en rojo.
      **Hecho 10-09 (sobre `eccabe68` + docs de W6)**: `pnpm test` ⇒ **760 archivos | 2 skipped · 10.275 tests | 4 skipped,
      0 fallos** (116,6 s) · `pnpm lint` ⇒ exit 0 (0 errores, 565 warnings preexistentes) · `pnpm typecheck` ⇒ exit 0 · tsc
      mobile ⇒ exit 0 · `check:tokens` ⇒ OK (86 + 5) · `check:nutrition-v2-boundaries` ⇒ 473 OK · `docs:check` ⇒ OK (CURRENT
      14,5 KB). Salida completa en [TEST_STATUS](../../testing/TEST_STATUS.md) § «Porciones a la chilena».
- [x] W6.6 [owner] OK explícito para push a `rnmobiledenuevo` = `master`, deploy, aplicación de migraciones, OTA y
      **encendido del set chileno** (W6.8).
      **Criterio**: la frase del owner citada con fecha y hora.
      **Owner, 2026-09-10 02:18Z (09-09 23:18 Chile), respondiendo al informe del artifact 8494a516: «Q1 a, Q2 a, Q3 a,
      Q4 a»** = Q1 push + deploy + OTA android/ios ahora · Q2 encendido apenas deploy READY + dos OTAs · Q3 banner y
      mensajes listos por el jefe, los manda el owner · Q4 las 10 MEJORA quedan en el backlog.
- [x] W6.7 [Fable] Deploy Vercel READY + OTA 1.1.2 android/ios desde `.github/workflows/mobile-ota.yml` con `message`
      descriptivo. **Criterio**: ids de deploy y de ambas OTAs (con su `run`) registrados en W6.10.
      **Hecho 10-09**: push fast-forward `f93378c3` → `95a1d39a` a `origin/rnmobiledenuevo` y `origin/master` (02:20Z, 15
      commits); deploy **`dpl_xuHL7Mrs7Rxqf9WEky7sRSELVX98` READY 02:22Z** (target production, `www.eva-app.cl`, home 200 /
      `/api/health` 200); CI master `34429043071` verde (`quality`, `hygiene`, `unit` ×3; `nutrition-smoke` rojo preexistente,
      `e2e` skipped por diseño); OTA 1.1.2 canal `production` **android grupo `9e844b15-bf9a-4e05-b192-2c565e64e593`** (run
      `34429335195`, publicada 02:27:52Z) / **ios grupo `8de637b3-1d45-42f7-b7af-9267de3301da`** (run `34429337419`, 02:27:44Z),
      mensaje «Porciones a la chilena W0-W6 (master 95a1d39a): …».
- [x] W6.8 [jefe] **Encendido del set chileno** por MCP, recién con el deploy READY y **las dos OTAs publicadas** (las
      **dos** puertas de **presentación** ya filtran —el loader del picker web (`portions-groups.actions.ts` /
      `QuickEditProvider`) y la ruta móvil `nutrition-v2/exchange-groups`, que **marca** con `portionSystem` +
      `legacySystems`— y el cliente RN ya deriva `legacy` con `systemOf`; `getExchangeGroupsForCoach` y
      `findExchangeGroupsForScope` siguen **sin** filtrar a propósito, por R13/B-01): `update public.exchange_groups set deleted_at = null,
      updated_at = now() where is_system and portion_system = 'cl' and deleted_at is not null;` (13 filas). **Criterio**:
      `count(*) from exchange_groups where is_system and deleted_at is null` = **22 vivos** (el «= 22» que antes vivía
      en W0.10); el índice único parcial `exchange_groups_system_code_uq` no se queja (0 códigos duplicados ya con las 13
      vivas); un coach `'cl'` de prueba ve 13 filas y **ninguna** con «0 equivalencias»; un coach `'smae'` de prueba ve
      su set + la sección Legado. Si algo sale mal, el apagado es la misma sentencia con `deleted_at = now()` (W0.4). Tras el
      encendido, `node --import tsx scripts/nutrition-portions/classify-foods.mjs` (dry-run) vuelve a salir con exit 0: hasta ahí
      `verifyGroupRefs` reporta los 13 chilenos como `missing_in_db` (decisión (p) de W1.14). Y el piso defensivo (l) deja de
      dispararse.
      **Hecho 10-09 02:29:01Z** (con deploy READY + las dos OTAs de W6.7): `update public.exchange_groups set deleted_at = null,
      updated_at = now() where is_system and portion_system = 'cl' and deleted_at is not null` ⇒ **22 vivos** (13 `cl` + 9
      `smae`), **0 códigos duplicados** (el índice parcial no se quejó), **0 chilenos sin equivalencias** (de 10 en `AZ` a 707 en
      `PCT`), 13 con `macros_confirmed`, 116 coaches en `cl` / 0 en `smae`. La verificación por superficie (coach `cl` ve 13 filas;
      coach `smae` ve su set + Legado) queda en el QA en device del owner (checklist 1–2). Apagado de emergencia: la misma
      sentencia con `deleted_at = now()`. Post-check: `node <raíz>/node_modules/jiti/lib/jiti-cli.mjs
      scripts/nutrition-portions/classify-foods.mjs` (dry-run, 02:30Z) ⇒ **exit 0** (3.857 clasificados, 807 sin clasificar,
      dataset en `tmp/` ignorado): `verifyGroupRefs` ya no reporta `missing_in_db`.
- [x] W6.9 [Fable] `pnpm qa:prod:suave` al cierre. **Criterio**: 9/9 o los fallos explicados; run id pegado.
      **Hecho 10-09**: por `workflow_dispatch` de `ci.yml` desde `master` (el job `e2e` solo corre así; local sin vars `E2E_*`):
      run **`34429709228`**, job `e2e` `102723329034` ⇒ **9 passed (47,9 s)**, 1 worker, 02:35:09–02:37:41Z, contra
      `www.eva-app.cl` con el set chileno ya encendido; el resto del CI (`quality`, `hygiene`, `unit` ×3) también verde.
- [x] W6.10 [Fable] Completar «Registro de cierres» y el checklist de QA en device con el veredicto del owner.
      **Hecho 10-09 ~03:40Z**: veredicto del owner «el qa ya paso» sobre los 10 puntos, en Android y web PWA, después de los
      dos fixes post-cierre (`653bd760`, deploy `dpl_HRR31wrwhpyXQJ6UCsUfugTNyqK6`). El SDD pasa a `status: done` en los
      cuatro archivos.
- [ ] W6.11 [owner] Avisos: banner in-app a **los coaches con porciones SMAE vivas** (9 por V2 al 08-09; **sumar los de
      V1** con la query de W0.6, que recorre las dos generaciones — la lista de destinatarios se cierra con ese número,
      no con el 9 de STATS), mensaje a `nutricionista-pame-cid`, a `dudu` y a
      `josefit` (textos en [PLAN](PLAN.md) §Docs y cierre). **Criterio**: enviado y anotado acá con fecha; nada de push
      masivo.
      **Estado 10-09 (owner «Q3 a»)**: textos listos por el jefe en `D:\tmp\plan-porciones-chilenas\AVISOS-W6.11.md` (banner
      para `/admin/novedades` con título y cuerpo, mensaje a Pame —versión larga en `RESPUESTA-PAME.md`— y mensaje a `dudu` /
      `josefit`), todos tomados del PLAN. Los manda el owner después del encendido (ya hecho, W6.8); al mandarlos se anota acá
      la fecha.

## Decisiones del owner 10-09 (tras el reporte de W0–W4 + W3)

- **1 = a**: seguir con W5 + W6 ahora y dejar el informe final; push/deploy/OTA/encendido solo con OK explícito posterior.
- **2 = «el que tú recomiendes»** ⇒ el jefe mantiene los copys provisionales: `builder.groupAtMax` («Ya está en {franja} con 99 · es el máximo»), título fijo «Metas del día» (decisión (z)), `targets.backToBase(día)` («{Día} vuelve a la meta de todos los días») y `targets.appliedToAll` («Ahora vale para toda la semana»). Quedan como aprobados por delegación en SPEC §16.1.

## Checklist de QA en device (se completa al cierre)

> **Veredicto del owner, 2026-09-10 ~03:40Z: «el qa ya paso»** — los 10 puntos en Android (1.1.2 + OTA `9e844b15`) y web
> PWA, con la cuenta `josefit` (Legado, conversión, metas), un coach nuevo (`pruebajhon`) y un alumno QA. Los dos hallazgos
> del QA (picker sin secciones por `PGRST201`; «Adherencia 78 %» en coach nuevo) se corrigieron en `653bd760` antes del
> veredicto (ver «Fixes post-cierre»). El hallazgo de marca cruzada tras logout es de otro frente (backlog, memoria
> `project_bug_marca_cruzada_logout_rn_20260910`).

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

### 2026-09-10 — el picker muestra los 22 grupos mezclados, sin «Legado» (reporte del owner en el QA en device)

**Síntoma:** web con los grupos SMAE bajo el encabezado «Sistema chileno»; Android con la lista plana, sin encabezados ni
chip «Legado (SMAE)», SMAE primero. Le pasaba a todos los coaches, incluido uno recién registrado. La OTA y el deploy
estaban bien: el resto de W2–W5 se veía.

**Causa (confirmada contra PostgREST con la clave pública):** `findUsedPortionSystemsV2`
(`apps/web/src/infrastructure/db/exchanges.repository.ts`) embebía `nutrition_plans_v2!inner(current_published_version_id)`
desde `nutrition_plan_versions_v2`, y entre esas dos tablas hay **dos FKs** (`nutrition_plan_versions_v2_plan_id_fkey` y la
inversa `nutrition_plans_v2_current_version_fkey`). PostgREST responde **300 `PGRST201`**, la promesa rechaza, el loader web
(`.catch(() => undefined)`) y la ruta móvil (`visibility: null`) entran en modo degradado y `visibleExchangeGroupsForCoach`
con `usedSystems` undefined pinta los dos sets con `legacy: false`. Los tests no lo vieron porque mockean supabase-js.

**Fix:** pista de FK en el embed (`nutrition_plans_v2!nutrition_plan_versions_v2_plan_id_fkey!inner(...)`; verificado 200 con
los mismos filtros) + aserción del texto del select en `exchanges.repository.portion-systems.test.ts`. Solo web (la ruta RN
vive en el server): **sin OTA**. Gotcha 19 del tren: todo embed entre tablas con FK bidireccional lleva pista, y hace falta un
smoke real contra PostgREST en el gate (backlog).

### 2026-09-10 — «Adherencia 78 % · +2 pts» en el dashboard de un coach nuevo con 0 alumnos (reporte del owner)

**Causa:** el pulse del dashboard incluye a propósito al alumno de ejemplo del onboarding v2 (`is_demo`, con datos sembrados)
para que las listas del día 1 tengan contenido, y los KPIs agregados del hero (`avgAdherence`, `avgNutrition`, deltas) y el
snapshot diario lo promediaban también. «Activos» sí lo excluía, de ahí el 0 / 78 %.

**Fix:** `DirectoryPulseRow.isDemo` (opcional; el select del pulse suma `is_demo`) + `excludeDemoClientsFromPulse` en
`services/dashboard.service.ts`, aplicado a los promedios y deltas de `dashboard.queries.ts` (las listas siguen con el demo
etiquetado) y a `avg_adherence` del cron de snapshots (`kpi-snapshot.queries.ts`). Test `dashboard.service.demo.test.ts`.
Hoy un coach sin alumnos reales ve «0 %» sin tendencia; el «—» en el hero (web + RN) va con la OTA del bug de marca cruzada.

## Registro de cierres

| Fecha | Tanda | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-09-09 | W0 · datos (W0a + W0b) | worktree `porciones-chilenas`, sin push (`02db17b7` + commit del apply) | tx-rollback + smoke A–G + Q1–Q9 + dry-run ×3 + apply ×2 | 120000/120500 en LIVE (`20260909163802` / `20260909163812`), seed apagado, **2.499 equivalencias + 5 foods en LIVE**; OK del owner citado en W0.9 |
| 2026-09-09 | W1 · motor y visibilidad | worktree `porciones-chilenas`, sin push | vitest 90/1.446 · typecheck · tsc mobile · boundaries 454 · eslint por archivo | 4 workers + 4 refutadores + ronda de fixes; decisiones (k)–(p) en W1.14 |
| 2026-09-09 | W2 · picker, bump, tap-to-edit, Legumbres | worktree `porciones-chilenas`, sin push (`564a2d2c` + remate) | vitest 92/1.578 · typecheck · tsc mobile · tokens · boundaries 460 · eslint por archivo | 18 + 8 agentes (2 rondas por lane + remate del overlay); decisiones (q)–(x) en W2.13; QA device W2.11 pendiente |
| 2026-09-09 | W3 · conversión SMAE → chileno | worktree `porciones-chilenas`, sin push (`6e2b37cb` (checkpoint) + remate y docs (este commit)) | vitest paquete + engine + `_quick-edit` + repo + tests RN · typecheck · tsc mobile · tokens · boundaries · eslint por archivo | 18 + remate; decisiones (ad)–(ag) en W3.10; QA device W3.8 pendiente; corrige el `legacySystems` de W1.3 (solo grupos del sistema) |
| 2026-09-09 | W4 · metas por día | worktree `porciones-chilenas`, sin push (`383e4a74` (checkpoint) + `20769987` (remate 1) + remate 2 y docs (este commit)) | vitest paquete + `_quick-edit` + tests RN · typecheck · tsc mobile · tokens · boundaries · eslint por archivo | 10 + 12 + remate 2 agentes; decisiones (y)–(ac) en W4.9; QA device W4.7 pendiente (aviso inline RN, KeyboardDoneBar iOS, plan de Pame con «Ir a Base») |
| 2026-09-10 | W5 · equivalencias del alumno | worktree `porciones-chilenas`, sin push (`a4fe68b4` (checkpoint) + remate y docs (este commit)) | vitest 112/1.897 · typecheck (fixture W3 corregido) · tsc mobile · tokens · boundaries 473 · eslint por archivo · SQL W5.2 + W5.3 tx-rollback en LIVE | **RPC `get_nutrition_today_v2` parcheado en LIVE: versión `20260910015432`** (21.119 → 22.470 chars); Today 93.907 → 132.878 B (W5.10); 10 + 6 agentes; decisiones (ah)–(an) en W5.13; QA device W5.11 pendiente |
| 2026-09-10 | W6 · cierre (W6.1–W6.9) — **EN PRODUCCIÓN 02:29Z** | `64c5cc0b` (docs W6.1–W6.5) + `95a1d39a` (OK del owner W6.6) + docs de cierre (este commit); `master` = `rnmobiledenuevo` = `95a1d39a` + docs | suite completa (vitest 760/10.275 · lint 0 errores · typecheck · tsc mobile · tokens · boundaries 473 · docs:check) · CI master `34429043071` · E2E `prod-suave` 9/9 (run `34429709228`) | OK del owner 02:18Z («Q1 a, Q2 a, Q3 a, Q4 a»); deploy `dpl_xuHL7Mrs7Rxqf9WEky7sRSELVX98` READY 02:22Z; OTA 1.1.2 android `9e844b15` (run 34429335195) / ios `8de637b3` (run 34429337419); **set chileno encendido 02:29:01Z ⇒ 22 vivos**; `classify-foods` dry-run exit 0; **QA del owner en device VERDE 10-09 ~03:40Z ⇒ SDD `done`** (tras los fixes post-cierre `653bd760`, deploy `dpl_HRR31wrwhpyXQJ6UCsUfugTNyqK6`); queda W6.11 (avisos: textos listos en el artifact 6be4db5d, los manda el owner) |

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

- **MEJORA diferidas de W2 (refutadores 09-09).** (1) `nutrition-portions-copy.ts` importa `editor-state`
  (`PORTION_MAX` + `formatPortionsEsCl`) y lo consumen ~15 pantallas del alumno: mover las dos constantes a un módulo hoja.
  (2) `Toast.tsx` no expone `onDismiss`: la baseline del «Deshacer» sobrevive a un swipe del toast (expira a los 4 s).
  (3) `handleBumpPortion` (RN) se recrea por tecleo; web recalcula `portionsAfterBump` solo para el texto del toast.
  (4) `EditablePortionsCard.tsx` reconstruye `usedSystems` en vez de recibirlo del provider. (5) Copy suelto preexistente
  «Quitar porciones de …» (`builder.removePortionsAria`). (6) `apps/mobile/lib/nutrition-v2-portions.ts:49 formatPortionsCl`
  sigue vivo (PortionChip, PortionDayCoverageRow): unificar con `formatPortionsEsCl`. (7) Mockup «con 1 porción» vs
  §16.1 «con {n}» ⇒ regenerar (D-8). (8) Para W3: en quick-edit clásico el catálogo entra solo al abrir el picker
  (primera apertura sin encabezados y alfabética, luego se reordena) ⇒ precargar al montar; RN `EditablePortionsSection.tsx`
  pinta «Legado» con `sectioned === false`; web titula «Sistema chileno» sin catálogo (RN no).

- **MEJORA diferidas de W5 (refutadores 10-09).** (1) RN `PortionEquivalencesSheet.tsx`: `groupHasGeneric` se memoiza sobre
  `[foods, groupFoods, sections]` y mientras el alumno teclea vuelve a partir las 60 filas por tecla; la web usa
  `useMemo(() => split(groupFoods)…, [groupFoods])` — copiar ese idioma. (2) El reset del guard del evento es `!open || !target`
  en las dos superficies: si `orderedTargets` queda vacío un render por una revalidación, la misma apertura emite dos veces;
  endurecer a `!open` solo. (3) RN duplica a mano el `paddingHorizontal: 20` del `Sheet` (`SHEET_SIDE_PADDING`) para el
  encabezado sticky: exportar la constante desde `Sheet.tsx`. (4) `foodMediaThumbnailUrl` (RN) no trimea el path y
  `foodImageUrl` (web) sí: para `' off/a.jpg'` divergen; teórico (el path viene de la DB), pero vale un caso de test o trimear
  en RN. (5) Ningún test monta el sheet RN (pie condicional, guard y encabezados se refutaron leyendo). (6) La migración no
  es idempotente: re-aplicarla falla con «el ancla … no aparece exactamente una vez», mensaje que sugiere corrupción; un
  `if position(v_agg_new in v_src) > 0 then raise notice 'ya aplicada'` lo haría legible. (7) Web: el encabezado sticky lleva
  `-mx-4`; mirar en el QA de device (punto 8) que no se coma el borde del panel. (8) La nota de rollback cita «jsonb_agg en
  la posición 11247»: es el ORDER del agg (11245); cosmético. (9) El `alt` de la miniatura web compone `${name} · ${fuente}`
  en el componente: único separador de UI fuera del paquete (`student.sheetPhotoAlt(name)` lo cerraría). (10) SPEC §9.1
  estimaba +29 % de payload y el medido fue +41 % (el `object_path` pesa más que la estimación): sigue 5,6× bajo el tope.

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
