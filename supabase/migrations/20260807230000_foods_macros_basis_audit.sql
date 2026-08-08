-- ============================================================================
-- EVA Nutricion — T2.1 F4 (previo): auditoria de `public.foods.macros_basis`
-- Spec: docs/specs/nutrition-food-overrides/SPEC.md · Tarea: TASKS.md F4.2
-- ----------------------------------------------------------------------------
-- PROBLEMA. `20260728120000` backfilleo `macros_basis = 'per_serving'` a TODA
-- fila con `exchange_group_id`, asumiendo que el seed de intercambios cargaba
-- macros por porcion. Falso para la mayoria: casi todas traen los macros del
-- catalogo (por 100 g/ml) y usan `serving_size` para describir la PORCION DE
-- INTERCAMBIO. La etiqueta quedo mintiendo.
--
-- Mientras el codigo asumia per_100 en todas partes, la mentira era inocua. Al
-- encender el respeto de la base (F1.2 + F4.2) deja de serlo: cada fila mal
-- etiquetada se congelaria con el factor equivocado.
--
-- Solo importan las filas con `serving_size <> 100`: con 100, per_100 y
-- per_serving dan EL MISMO factor en las dos ramas de
-- `private.nutrition_v2_entry_factor`, asi que la etiqueta no cambia un numero.
-- Son 60 filas.
--
-- CRITERIO DE CLASIFICACION (no es olfato):
--   1. Cota fisica dura — ningun alimento supera 9 kcal/g (grasa pura). Si
--      `calories > 9 * serving_size` con unidad g/ml, los macros NO PUEDEN ser
--      de esa porcion: son por 100 g. Caso limite y evidente: "Aceite vegetal",
--      884 kcal y 100 g de grasa con `serving_size = 5`.
--   2. Contraste con el valor real por 100 g del alimento (leche descremada 34
--      kcal, avena cocida 71, atun al agua 116, salmon enlatado 138…): coinciden
--      con la fila ⇒ la fila es por 100.
--   3. Quedan 10 filas donde los macros SI describen la porcion (clara de huevo
--      50 g = 26 kcal, huevo duro 1 un = 77, arepa 1 un = 240, vienesa 1 un =
--      91): esas conservan `per_serving` y son las unicas que cambian de numero
--      cuando F4.2 encienda el interruptor.
--
-- Esta migracion NO toca macros, ni snapshots, ni historial: solo la ETIQUETA
-- de la base. Con el codigo actual (que ignora la base) su efecto observable es
-- CERO; su valor es dejar el dato listo para F4.
-- ============================================================================

update public.foods f
set macros_basis = 'per_100'
where f.macros_basis = 'per_serving'
  and f.serving_size is distinct from 100
  and f.id not in (
    -- Las 10 filas cuyos macros SI son por porcion (verificadas una a una).
    '0ad2bb28-e5d6-402e-b9ae-d70d8581f3c8', -- Arepa (1 un = 240 kcal)
    '07167d6c-4ecb-4045-97ac-8912b5308822', -- Arepa frita (1 un = 240 kcal)
    'd54db916-b6f2-42ac-ae1f-c9d150c478e6', -- Clara huevo (50 g = 26 kcal)
    '0ed3d526-4ced-4c6a-a588-168c622f724c', -- granola vivo (50 g = 215 kcal)
    '7fd9bdc4-403c-4040-9d98-99edef982f3b', -- Huevo duro (1 un = 77 kcal)
    '3baab183-161b-4d7d-a73a-c8d5b7c04bca', -- Pan hallulla (1 porcion = 70 kcal)
    '5faeab94-f95e-45de-8717-36ea41fc4ad9', -- Pan marraqueta (1 porcion = 70 kcal)
    '3633814b-d40c-48c1-a684-c21466122071', -- Posta de vacuno cocida (30 g = 55 kcal)
    'f7ddbfd3-add5-44ee-978a-6ffc18e0cf24', -- Queso Chanco (25 g = 80 kcal)
    'f309b1b5-d7e3-402b-97eb-56ca4783a14c'  -- Vienesa Tradicional (1 un = 91 kcal)
  );

-- ============================================================================
-- PENDIENTE PARA EL OWNER (no se toca aca — es criterio nutricional, no de
-- ingenieria): "Pan hallulla" y "Pan marraqueta" declaran 70 kcal y 15 g de
-- carbohidrato, que es una PORCION DE INTERCAMBIO de cereales de manual, pero
-- con `serving_size = 50 g`. Cincuenta gramos de marraqueta son ~145 kcal, no
-- 70: los gramos de la porcion estan inflados (deberian rondar los 25 g). La
-- base queda bien etiquetada; el gramaje sigue sospechoso.
--
-- ROLLBACK (referencia de operacion):
--   update public.foods set macros_basis = 'per_serving'
--   where exchange_group_id is not null and serving_size is distinct from 100;
-- ============================================================================
