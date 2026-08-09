# SPEC — T2.3 Hub de Alimentos: una sola casa

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) — Ola 2, tarea T2.3.
- **Rama de trabajo:** `rnmobiledenuevo` (decision owner 2026-08-06). Web a prod = merge a master con OK del owner.
- **Alcance:** web (desktop + responsive/PWA). React Native queda fuera y se anota como seguimiento.
- **Auditoria de estado real:** 2026-08-09, contra HEAD. Todo lo de abajo esta verificado con archivo:linea en esta rama.

## Por que existe esta SPEC

El enunciado de T2.3 en el TASKS del programa esta **desactualizado**: describe retiros de rutas que ya no existen y omite trabajo huerfano de T2.2. Especificar sobre ese texto habria producido codigo para un repo imaginario. Esta SPEC reemplaza el enunciado y deja el estado verificado por escrito.

## Objetivo

Que el coach tenga **una sola casa** para el catalogo de alimentos: buscar, ver, **crear**, **clasificar en grupos de intercambio** y **ver lo que el mismo edito**, todo dentro del tab Alimentos del centro de nutricion. Hoy esas acciones viven en una ruta aparte que el hub no reemplaza.

## Estado real hoy (verificado 2026-08-09)

### Lo que ya existe

El hub `/coach/nutrition-v2` tiene 4 tabs (`_components/NutritionHubTabs.tsx:12-17`):

| Tab | Componente | Que hace |
|---|---|---|
| Alumnos | `HubRoster` | roster con triage por riesgo |
| Plantillas | `PlanTemplatesLibrary` | biblioteca de plantillas |
| **Alimentos** | **`FoodCatalogBrowser`** | **solo lectura**: buscar (min 2 chars, debounce 400ms), paginar, abrir `FoodDetailSheet` |
| Curacion | `CurationQueue` | cola de curacion |

### El hueco

`/coach/foods` sigue siendo una ruta propia y **es la unica que permite escribir**. Su `page.tsx` es un server component que carga `exchangeGroups` + primera pagina de alimentos y monta:

- `_components/AddFoodSheet.tsx` — **crear alimento**
- `_components/ClassifyFoodSheet.tsx` — **clasificar en grupos de intercambio**
- `_components/ExchangeListEntrySheet.tsx` y `_components/ExchangePortionsSection.tsx` — porciones de las listas de intercambio
- `_components/FoodBrowser.tsx` — navegador propio (duplica al del tab)
- `_actions/exchange-lists.actions.ts`, `_actions/food-equivalence.actions.ts`, `_data/foods.queries.ts`

O sea: el hub muestra el catalogo, `/coach/foods` lo edita. El coach necesita saber que existen dos lugares y cual sirve para que.

### Entradas a `/coach/foods` que hay que respetar

- `app/coach/nutrition-plans/_components/nutrition-onboarding-shared.ts:25` — la guia de onboarding manda ahi.
- `app/coach/nutrition-plans/_actions/nutrition-coach.actions.ts:649,673,997` — tres `revalidatePath('/coach/foods')`.

### Dos hallazgos que cambian el alcance escrito

**H1 — Las rutas que T2.3 mandaba retirar ya no existen.** `git ls-files` no devuelve ningun `page.tsx` bajo `app/coach/meal-groups/` ni `app/coach/recipes/`. De `meal-groups` solo sobreviven `_actions/` y `_data/`, y sus **unicos consumidores son V1** (`nutrition-plans/_components/FoodLibrary.tsx`, `NutritionHub.tsx`, `PlanBuilder/PlanBuilder.tsx`, `PlanBuilder/FoodSearchDrawer.tsx`). Las recetas viven enteras dentro de V1 (`nutrition-plans/_components/recipes/*`) mas `api/recipes/search/route.ts`.

Regla vigente del owner: **V1 no se borra, solo se migra la gente**. Por lo tanto el tercer bullet de T2.3 deja de ser "retirar" y pasa a ser **verificar y documentar**. Borrar esos `_actions`/`_data` romperia V1, que sigue sirviendo alumnos.

**H2 — T2.2 dejo huerfano el filtro "Editados por mi".** No existe en el codigo: `grep -rn "Editados por" apps/web/src apps/mobile` no devuelve nada. Es parte del enunciado de T2.2 (`nutrition-flows-redesign/TASKS.md:57`) que no llego a implementarse. Su superficie natural es el tab Alimentos, o sea **esta tarea**. Si no se recoge aca, el coach nunca puede ver de un vistazo que alimentos corrigio, y la feature de overrides queda a mitad de camino.

## Alcance

### Entra

1. **Crear alimento desde el tab.** `AddFoodSheet` disponible en el tab Alimentos, con el mismo contrato server que hoy.
2. **Clasificar desde el tab.** `ClassifyFoodSheet` idem, incluyendo porciones de listas de intercambio.
3. **Formulario UNICO de grupo.** Hoy la clasificacion y las porciones de intercambio se editan por piezas separadas; el tab expone una sola gramatica de grupo.
4. **Filtro "Editados por mi"** en el tab (rescate de T2.2): muestra solo alimentos con override del coach.
5. **`/coach/foods` redirige al tab y la carpeta se borra en la misma tanda** (decision D2). Lo que se mude (actions de equivalencias e intercambio) tiene que estar vivo en el hub antes del borrado.
6. **Verificacion documentada** de `meal-groups` y `recipes`: quien los importa hoy, y por que NO se borran.

### No entra

- Tocar V1 (`nutrition-plans`, recetas, `meal-groups/_actions`, `_data`). Se mira, no se borra.
- React Native: `apps/mobile/app/coach/nutrition-v2/foods.tsx` queda igual. Paridad = seguimiento propio.
- Cambios de schema. Esta tarea no toca Supabase.
- El editor unico de planes (T3.1-T3.3).

## Invariantes

Heredados del programa padre, mas los propios:

1. **Validacion server siempre.** Crear y clasificar ya pasan por sus actions; mover la UI no puede saltarse ni un guard. La UI nunca autoriza.
2. **`get_nutrition_today_v2` es sagrado** y no se toca aca.
3. **Overrides no reescriben planes publicados.** El filtro "Editados por mi" es de LECTURA: no propaga nada, no republica.
4. **V1 intacta.** Ningun import de V1 puede quedar colgado.
5. **Sin funciones perdidas.** Todo lo que hoy se puede hacer en `/coach/foods` se tiene que poder hacer en el tab ANTES de redirigir. El redirect es el ultimo paso, no el primero.
6. **Alimentos individuales siempre con macros** (regla owner 2026-08-05): el formulario de creacion no puede permitir guardar un alimento sin kcal/P/C/G.

## Criterios de aceptacion

1. Desde `/coach/nutrition-v2` tab Alimentos, el coach crea un alimento nuevo y lo ve en el listado sin cambiar de ruta.
2. Desde el mismo tab, clasifica un alimento en un grupo de intercambio y define sus porciones, con un solo formulario.
3. El filtro "Editados por mi" muestra exactamente los alimentos con override del coach activo, y ninguno mas.
4. `/coach/foods` responde con redirect al tab. La guia de onboarding y los tres `revalidatePath` siguen funcionando.
5. `grep` de importadores de `app/coach/foods/_components` fuera de esa carpeta devuelve cero antes de retirar la UI.
6. V1 sigue compilando y funcionando: `nutrition-plans` no pierde ningun import.
7. Gates verdes: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:nutrition-v2-boundaries`, `pnpm docs:check`.
8. QA responsive real: el tab con sheets de crear/clasificar se usa en ancho de telefono sin que el teclado tape los campos (mismo problema ya visto en RN, ver `nutrition-flows-redesign`).

## Decisiones del owner (2026-08-09) — TOMADAS

| # | Pregunta | Decision |
|---|----------|----------|
| D1 | El filtro "Editados por mi", huerfano de T2.2, se recoge en T2.3? | **SI.** Entra en el alcance de esta tarea (F1). |
| D2 | `/coach/foods` redirige o se borra? | **Redirect Y BORRADO en la misma tanda.** El owner eligio el corte directo por sobre la recomendacion de dejar la carpeta dos semanas. Consecuencia asumida: el rollback deja de ser una linea y pasa a ser un revert del commit entero, y **F5 crece** (ver mas abajo). |
| D3 | `meal-groups` y `recipes` se retiran? | **NO.** Solo viven dentro de V1 y V1 no se borra. El bullet se cierra como verificado y documentado. |

### Lo que D2 arrastra (verificado 2026-08-09, antes de cerrar la sesion)

Borrar la carpeta en la misma tanda no es borrar: **hay piezas que se mudan**, y una que puede chocar con un gate.

1. **`_actions/food-equivalence.actions.ts` y `_actions/exchange-lists.actions.ts` se MUDAN, no se borran.** `ClassifyFoodSheet.tsx:23` importa `setFoodExchangeEquivalenceAction` desde `../_actions/food-equivalence.actions`. Si la carpeta muere, esos actions tienen que vivir en el hub antes.
2. **Los sheets importan actions de V1.** `AddFoodSheet.tsx:12` usa `saveCustomFood` de `nutrition-plans/_actions/nutrition-coach.actions`, y `ClassifyFoodSheet.tsx:21` usa `searchCoachFoodLibrary` de `nutrition-plans/_actions/food-library.actions`. Al mudar los sheets dentro del arbol V2, esos imports cruzan de V2 a V1 y **pueden violar `pnpm check:nutrition-v2-boundaries`**. Hay que correr el gate ANTES de mover, no despues: si falla, la mudanza necesita una capa propia y eso es media fase extra.
3. **`FoodBrowser` muere con la carpeta.** Antes de borrarlo hay que comparar funcion por funcion contra `FoodCatalogBrowser` (el del tab): si `FoodBrowser` lista o pagina algo que el tab no hace, se pierde funcion — y el invariante 5 lo prohibe.
4. **Los tres `revalidatePath('/coach/foods')`** (`nutrition-coach.actions.ts:649,673,997`) quedan apuntando a una ruta inexistente. Es inofensivo (no lanza, es no-op), y sacarlos obliga a tocar V1. Se dejan y se anota como deuda menor.

## Riesgos

- **Duplicacion de navegador.** El tab usa `FoodCatalogBrowser` y `/coach/foods` usa `FoodBrowser`. Mover sheets sin unificar el listado deja dos navegadores; unificarlos de golpe es una tanda mas grande. La PLAN los separa a proposito.
- **`exchangeGroups` se carga en el server component de `/coach/foods`.** El hub es server component tambien, asi que el dato se puede cargar igual, pero hay que evitar cargarlo en las 4 tabs cuando solo Alimentos lo usa.
- **Regresion silenciosa de onboarding.** Si el redirect se hace antes de que el tab tenga crear/clasificar, la guia de onboarding manda al coach a una pantalla que no puede hacer lo que promete.
