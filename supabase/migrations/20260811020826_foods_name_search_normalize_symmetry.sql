-- EVA Nutrition — H1 del QA de T2.5: el buscador no encuentra nombres con parentesis.
--
-- SINTOMA. Buscar "arroz blanco (cocido)" (el nombre EXACTO del alimento) devolvia 0
-- resultados, y "arroz blanco cocido" tambien. No es un bug de la feature de intercambio:
-- es una asimetria entre los dos lados de la MISMA comparacion.
--
-- CAUSA. `private.food_catalog_v2_normalize_text` (que normaliza el QUERY) reduce todo lo
-- que no sea [a-z0-9] a espacios, mientras que `foods.name_search` se generaba solo con
-- `immutable_unaccent(lower(name))`, conservando parentesis, comas y guiones. El `like`
-- comparaba "arroz blanco cocido" contra "arroz blanco (cocido)" — nunca calzaba. El
-- sintoma existe en CUALQUIER buscador que use ese par, no solo en el sheet de T2.5.
--
-- FIX. La columna generada pasa a usar exactamente la misma normalizacion que el query.
-- Medido en LIVE antes de aplicar (tx-rollback): 620 de 4.649 filas cambian de valor y la
-- asimetria `name_search <> normalize(name)` queda en 0/4.649.
--
-- PG 17 permite `SET EXPRESSION` sin dropear la columna: se preservan grants, indices
-- (`foods_name_search_idx` btree y `foods_name_search_trgm_idx` gin_trgm) y politicas. La
-- tabla se reescribe (6 MB) y los indices se reconstruyen en la misma sentencia.
--
-- CONSECUENCIA EN EL CLIENTE. Los `ilike('name_search', …)` de la web que normalizaban a
-- mano (solo tildes + minusculas) pasan a usar `normalizeFoodSearchText` de
-- `@eva/nutrition-engine`, que es el espejo TS de esta expresion. El movil ya lo usaba.
-- Efecto colateral bienvenido: los comodines `%` y `_` del `like` no sobreviven a la
-- normalizacion, asi que el escapado manual de `%` deja de ser necesario.
--
-- LIMITE CONOCIDO Y ACEPTADO. Un unico alimento global con nombre CJK
-- (`e2b87758-55cc-4c3f-b7a5-8b2b5b1c9412`) queda con `name_search` vacio. Ya era
-- inbuscable por la via V2 (el normalizador del query tambien vacia el termino y el minimo
-- son 2 caracteres); ahora tampoco lo encuentra el `ilike` de V1. 1 fila de 4.649.
--
-- ROLLBACK (una pasada, no destructivo — la columna es derivada):
--   alter table public.foods
--     alter column name_search
--     set expression as (public.immutable_unaccent(lower(name)));

alter table public.foods
  alter column name_search
  set expression as (
    trim(regexp_replace(public.immutable_unaccent(lower(name)), '[^a-z0-9]+', ' ', 'g'))
  );

comment on column public.foods.name_search is
  'Nombre normalizado para busqueda: unaccent + minusculas + todo lo que no sea [a-z0-9] colapsado a un espacio. Espejo exacto de private.food_catalog_v2_normalize_text y de normalizeFoodSearchText (@eva/nutrition-engine). Si cambia uno, cambian los tres.';
