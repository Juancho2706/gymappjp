# Ola 4B — Decisiones del owner (2026-07-21)

Decisiones vinculantes tomadas por el owner al abrir la ola 4B (nutrición del coach y
catálogos). Cualquier cambio posterior requiere nueva decisión escrita aquí.

| # | Tema | Decisión | Efecto en la ola |
|---|------|----------|------------------|
| 1 | Nutrición V1 (web y RN) | **AL OLVIDO — V2 es lo único que queda.** Ni web/PWA ni RN deben usar V1; no se porta, no se pule, no es "segunda línea". | El tab coach RN pasa a abrir el hub V2 (hoy huérfano). Las superficies V1 RN (`(tabs)/nutricion.tsx` shell, `nutrition-builder.tsx`) quedan fuera del alcance de paridad: solo rollback técnico tras el flag, sin trabajo nuevo. Las unidades propuestas sobre el shell V1 (fixes de `FoodsTab`/`FoodForm`/`RecipesTab` V1) se descartan. |
| 2 | Hub V2 RN como cockpit del coach | **SÍ** — `app/coach/nutrition-v2/index.tsx` es el destino del tab; se cablea el swap espejo del web. | Unidades 4B-SWAP y 4B-HUB. |
| 3 | Recetas | **FUERA de RN** — "si no hay recetas en la web responsive V2, no se ponen (o se quitan)". La biblioteca viva de recetas web vive dentro del hub V1 (`nutrition-plans`), que muere con la decisión 1; el hub V2 no tiene tab de recetas. | Sin unidad de recetas en 4B. El `RecipesTab` RN muere junto con el shell V1. Pendiente WEB (rama de web, no esta ola): decidir el destino de la biblioteca de recetas al deprecar físicamente el hub V1, y borrar el residuo muerto `/coach/recipes` (solo redirige). |
| 4 | RN-extras del coach sin contraparte web (editar alimento propio desde el catálogo; otros que aparezcan) | **RETIRAR/GATEAR ESTRICTO** — mismo filtro que 4A: sin contraparte web = fuera, salvo excepción escrita por ítem. | Aplica al re-especificar el catálogo V2 (`FoodCatalogBrowser`) y a cualquier extra detectado en las waves. |
| 5 | Orden de ejecución | **P0 quick-wins primero** (archivos disjuntos), luego SWAP → HUB secuencial. | Wave 4B.1 = macros de meal-groups (bug de datos visibles), scope org del buscador de alimentos, notas+permisos read-only del quick-edit. |

Regla recordada del plan (§Entrada): toda divergencia nueva necesita excepción escrita ANTES
de codificarse.
