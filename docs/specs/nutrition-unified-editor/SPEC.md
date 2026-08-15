# SPEC — T3.1 Editor unico de nutricion (convergencia wizard + quick-edit)

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) — Ola 3, tareas T3.1 (esta SPEC), T3.2 (web) y T3.3 (RN Android).
- **Antecedentes directos:** [nutrition-authoring-speed](../nutrition-authoring-speed/SPEC.md) (T2.6, cerrada 2026-08-13) y [nutrition-student-reskin](../nutrition-student-reskin/SPEC.md) (T2.7, cerrada 2026-08-15).
- **Rama de trabajo:** `rnmobiledenuevo`.
- **Alcance:** web desktop + responsive/PWA (T3.2) y despues RN Android (T3.3). iOS solo via OTA post-aprobacion de Apple. Cero dependencias nuevas.
- **Auditoria de estado real:** 2026-08-15 contra HEAD `71a829d5` (lecturas de codigo citadas con archivo:linea).
- **Decisiones del dueño:** D1 y D2 (2026-08-15, mas abajo). Heredada del programa: D3 sin kill-switch.

## Por que existe esta SPEC

El coach tiene hoy DOS editores de plan con gramaticas de edicion distintas — el builder-wizard
(crear/rehacer, por pasos) y el quick-edit (editar in-place desde la ficha) — y cada uno esta
duplicado en web y RN. Resultado: **cuatro reducers, dos gramaticas, un solo dominio**, y cada
feature nueva se paga hasta cuatro veces. T2.6 lo dejo en acta: F2 (copy semana) y F4 (porcion
pegajosa) quedaron declaradas sin portar a RN en `MOBILE_PARITY`. El editor unico no es un
re-skin: mata esa deuda estructural convergiendo primero la UI web sobre una sola gramatica y
unificando al final los reducers testeados en `packages/nutrition-v2`.

## Estado real hoy (auditoria 2026-08-15)

### Cuatro reducers, dos gramaticas

| Superficie | Archivo | LOC | Acciones |
|---|---|---|---|
| Wizard web | `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder.ts` | 1.850 | 32 |
| Wizard RN | `apps/mobile/lib/nutrition-v2-builder.ts` | 1.876 | 29 (sin `MOVE_ITEM`, `RESTORE_ITEM`, `APPEND_VARIANT_SLOTS_TO`) |
| Quick-edit web | `apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/quick-edit-state.ts` | 1.805 | 31 |
| Quick-edit RN | `apps/mobile/lib/nutrition-v2-quick-edit.ts` | 1.609 | subconjunto del web, con cruces propios |

Divergencias que definen el trabajo (matriz completa accion-por-accion en [TASKS](TASKS.md)):

- **Solo wizard:** pasos (`NEXT_STEP`/`PREV_STEP`/`SET_STEP`), metadatos del plan
  (`SET_PLAN_NAME`/`SET_STRATEGY`/`SET_PERMISSION`/`SET_EFFECTIVE_FROM`), variantes avanzadas
  (`ADD_VARIANTS` multiple, `DUPLICATE_VARIANT_AS`, `SET_VARIANT_TARGETS`/`_MODE`), sustituciones
  por item (`ADD/REMOVE_ITEM_SUBSTITUTION`).
- **Solo quick-edit web:** porciones prescritas (`ADD/SET/STEP/REMOVE/RESTORE_PORTION_TARGET`,
  `APPLY_BASE_PORTIONS`), steppers (`STEP_ITEM_QUANTITY`/`STEP_TARGET`), `SWAP_ITEM_FOOD`,
  alta separada `ADD_CATALOG_ITEM`/`ADD_CUSTOM_ITEM`.
- **Cruces incoherentes:** `APPLY_FOOD_OVERRIDE` existe en wizard web+RN y en quick-edit RN, pero
  NO en quick-edit web; `MOVE_ITEM` solo existe en web (wizard y quick-edit).
- **Lo unico compartido hoy** vive en `packages/nutrition-v2/quick-edit.ts`: `readModelToDraft`
  (:121), `countDraftChanges` (:301) y los codigos de error (:322). Los reducers NO se comparten.

### Lo que YA converge y NO se toca: la publicacion

Ambos caminos publican por el mismo pipeline canonico: `persistAndPublishDraft`
(`_actions/plan-persistence.ts:586`) → RPC `persist_and_publish_nutrition_plan_v2` (:651).
El quick-edit lo envuelve con `quickEditPublishAction` (`_actions/quick-edit.actions.ts:144`):
guard optimista CAS (`baseVersionId`), `idempotencyKey`, delta-gate Pro (solo gatea features Pro
NUEVAS), carry-over server-side de `protocol_notes`, y codigos tipados accionables
(`STALE_BASE`/`EMPTY_DAY`/`UPGRADE_REQUIRED`/...). El wizard publica via `publishPlanAction`
(`builder/_actions/builder.actions.ts:51`). El editor unico consume este contrato tal cual.

### Entradas hoy

- **Editar:** ficha `[clientId]` → CTA primaria "Editar plan" monta el quick-edit in-place (misma
  ruta, estado cliente `editing=true`); el menu "..." ofrece "Rehacer con el asistente" → wizard
  (`_quick-edit/QuickEditEntry.tsx:3-8`).
- **Crear:** puerta unica `builder?from=template:<id>|plan:<id>` (AD-3/F3): el `+` del Centro V2 y
  todo enlace profundo terminan en esa URL (`builder/page.tsx`, doc del `searchParams`).
- **Plantillas:** `nutrition-plans/new` y `[templateId]/edit` cabalgan el builder via
  `TemplateModeContext` / `_lib/template-mode.ts`.

## Decisiones del dueño (2026-08-15)

**D1 — Un solo editor para crear Y editar.** El wizard por pasos muere en el retiro del par viejo.
La puerta `?from=template:|plan:` se conserva apuntando al editor unico: crear = editor con draft
vacio o hidratado del origen. Coherente con el retiro que el programa ya preveia.

**D2 — Las plantillas migran en tanda propia (T3.2b), despues del corte de planes.** T3.2 corta
solo planes-por-alumno; `nutrition-plans/new`/`edit` siguen en el wizard hasta T3.2b. Regla dura:
**el retiro del par viejo espera a que plantillas migre** — el wizard no se borra mientras sea el
unico autor de plantillas.

**D3 (heredada del programa) — Sin kill-switch.** Corte directo; rollback = revert/redeploy; el
par viejo no se borra hasta 2 semanas estable en prod.

## Alcance

### Producto (T3.2, web)

La forma objetivo ya esta decidida en el PLAN padre (linea T3.2):

- **Desktop:** paleta lateral persistente (picker de alimentos + favoritos + "Mis alimentos"),
  drag para reordenar, cabecera con metas/permisos/vigencia/notas siempre visible, copiar
  dia/semana desde el canvas.
- **Responsive/PWA:** paleta como sheet, totales + CTA Publicar fijos abajo, UNA sola solucion de
  capsula para dia/variante (hoy wizard y quick-edit resuelven distinto la misma navegacion).
- **Sin pasos:** el plan se edita como documento vivo; crear y editar son el mismo lienzo (D1).
- **Gramatica destructiva T2.6/F1 en todo:** accion optimista + Deshacer 5-8 s, cero confirms.
- **Superset real:** todo lo que hoy puede el par web (las 31+32 acciones) tiene equivalente o
  muerte explicita en la matriz de TASKS. Incluye porciones prescritas, sustituciones por item,
  overrides de macros, variantes avanzadas, porcion pegajosa, copy semana con quick-select y
  notas visibles.

### Arquitectura (orden impuesto por el programa)

1. **UI converge primero:** el editor unico web nace sobre el reducer del quick-edit web
   EXTENDIDO con las acciones wizard-only que le faltan (metadatos del plan, variantes avanzadas,
   sustituciones, override). Es el reducer con la gramatica mas moderna (undo T2.6, porciones).
2. **Reducers al final:** con el editor estable, la gramatica superset se extrae a
   `packages/nutrition-v2` como modulo puro con tests golden de paridad contra los reducers
   actuales; web la consume primero, RN (T3.3) despues. Recien ahi muere la cuadruplicacion.
3. **T3.3 RN Android:** misma gramatica sobre los reducers compartidos; android-first, iOS via
   OTA cuando Apple apruebe.

## Fuera de alcance

- Plantillas en T3.2 (D2: tanda propia T3.2b).
- T3.4 plantillas auto-escaladas, T3.5 registro por texto, T3.6 presupuesto semanal, T3.7 offline.
- Cambios de schema, del RPC de publish, del read model del alumno o del freeze.
- Nutricion V1 (deprecada 2026-08-12), enterprise (cuarentena), builds nativas iOS.
- El area del alumno: esta ola es 100% coach.

## Invariantes

Heredados del programa, mas los propios:

- Publish intacto: CAS (`STALE_BASE`), idempotencia, drafts y codigos tipados con copy accionable
  (leccion del owner 2026-08-05: jamas colapsar fallos con mensaje util a `UNKNOWN`).
- La UI nunca autoriza: delta-gate Pro y entitlements server-side, fail-closed; `hasNutritionPro`
  en cliente solo gobierna afordancia (candado/upsell), como hoy (`QuickEditEntry.tsx`).
- `visible_notes` editables viajan en el draft; `privateNotes` SIEMPRE null (NUT-007).
- NUT-008 fail-closed: si la lectura de reemplazos fallo, Publicar se bloquea (publicar con el
  mapa vacio los borraria).
- "Rehacer"/re-hidratar jamas resetea `visible_notes` (deuda PR #174, ya saldada — no regresar).
- Clean Architecture (`_data → services`), sin Redux/Zustand/SWR/React Query.
- Gotcha css-interop vigente en RN: `Pressable` jamas con style-funcion (mato Fuentes y share de
  Records en prod, 2026-08-15).
- Safe areas, dark mode y white-label en toda superficie nueva.

## Riesgos

1. **Pieza mayor en superficie critica sin kill-switch.** Mitigado por D3 (par viejo accesible 2
   semanas, rollback = revert) y por la regla del owner: verificar LOCAL (harness + Playwright
   headless, patron `dev-harness/nutrition-tabs`) ANTES de preview.
2. **Resucitar bugs ya matados** (tabs muertos H13/re-renders de `usePortionMarks`, T2.7). El
   editor reusa los fixes de identidad y el harness existente como regresion.
3. **Ventana de divergencia web↔RN** entre T3.2 y T3.3: el gap se declara explicito en
   `MOBILE_PARITY.md` en el mismo commit del corte, no despues.
4. **Drag reorden en tactil** es terreno minado: fallback siempre presente de mover por menu
   (`MOVE_ITEM` ya existe en ambos reducers web).
5. **El reducer extendido engorda antes de la extraccion** y la extraccion "se posterga". Por eso
   la extraccion (R1) es tanda obligatoria de la ola con gate propio, no un despues-se-ve.

## Criterios de aceptacion

- Un coach crea un plan desde cero, desde plantilla (`?from=template:`) y desde copia
  (`?from=plan:`) sin pisar el wizard; y edita el plan vigente sin quick-edit, con la union de
  capacidades de ambos.
- La matriz de acciones de TASKS queda completa: cada accion de las dos gramaticas web tiene
  equivalente en el editor unico o decision explicita de muerte con motivo.
- Publicar devuelve los mismos codigos tipados con el mismo copy accionable; `STALE_BASE` abre el
  mismo flujo de rebase/recarga que hoy.
- Cero confirms; todo gesto destructivo ofrece Deshacer y restituye en el indice original.
- Reducers unificados en `packages/nutrition-v2` con tests golden de paridad ANTES de que RN los
  consuma; al cierre de la ola no queda ninguna de las cuatro copias vivas.
- Gates reales por tanda: `pnpm lint`, `typecheck`, `test`, `build`, `check:tokens`,
  `check:nutrition-v2-boundaries`, `pnpm --filter @eva/mobile exec tsc --noEmit`, `docs:check`;
  harness local verde antes de cualquier preview; `MOBILE_PARITY.md` al dia en cada corte.
