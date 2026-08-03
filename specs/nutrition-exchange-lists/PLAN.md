# PLAN — Listas de equivalencia propias del coach (F2)

## Orden de ejecucion

1. **DB — tabla `exchange_group_foods`** (`supabase/migrations/2026080410xxxx_exchange_group_foods.sql`):
   tabla + `unique nulls not distinct (exchange_group_id, food_id, coach_id, org_id)` (PG 17.6 en LIVE) +
   check de ownership exclusivo + RLS espejo de `foods` + grants (`GRANT UPDATE` column-level) + indices de lectura +
   trigger `private.nutrition_v2_set_updated_at`. Aditiva, forward-only, `BEGIN/ROLLBACK` en LIVE antes de aplicar.
2. **DB — backfill** (migracion aparte, idempotente): las 2.525 clasificaciones vivas de `foods.exchange_*` a filas
   sin dueno (`source = 'catalog'`). Dry-run + reporte por grupo ANTES de escribir.
3. **DB — read-model**: parche de `public.get_nutrition_today_v2` sobre el bloque `exchangeFoods` con la tecnica ya
   probada (`pg_get_functiondef` + `replace()` exactos + asserts que fallan en voz alta). Fuente = union de la tabla
   y el legacy `foods.exchange_*`, precedencia coach > org > tabla-global > legacy, `is_excluded` retira.
4. **Contratos** (`packages/schemas/nutrition-exchanges.ts`): schema de la fila de lista
   (`UpsertExchangeGroupFoodSchema`, `RemoveExchangeGroupFoodSchema`), `suggestPortionGrams()` (regla de tres sobre el
   macro dominante del grupo) y `formatPortionSentence()` (la frase que ve el alumno). Puros, sin Next/Supabase:
   los reusan web, RN y la API movil.
5. **Repository** (`apps/web/src/infrastructure/db/exchange-group-foods.repository.ts`): listar por grupo con
   precedencia resuelta en memoria, upsert de fila propia, exclusion, borrado de la fila propia (volver al catalogo),
   copia masiva reescalada para "Duplicar y ajustar".
6. **Service** (`apps/web/src/services/nutrition-exchanges/exchange-lists.service.ts`): visibilidad del grupo,
   visibilidad del alimento, resolucion del dueno segun workspace (coach standalone vs enterprise), reescalado.
7. **Server actions** + **API movil** (`/api/mobile/nutrition/exchanges/group-foods`): mismo contrato para las dos
   superficies; RN nunca escribe Supabase directo.
8. **Doble escritura** en los caminos que hoy tocan `foods.exchange_*` para que nada nazca invisible.
9. **UI web**: sheet "¿Que cuenta como 1 porcion?" (buscador sobre todo el catalogo + sugerencia + preview),
   "Duplicar y ajustar" con copia de lista, y seccion "Porciones" en `/coach/foods`.
10. **Tests**: schemas puros, repository, service, actions, API, aislamiento por tenant con roles reales
    (`tests/team/exchange-lists-isolation.sql`), y regresion del read-model.

## Riesgos y como se cubren

| Riesgo | Cobertura |
|---|---|
| Perder clasificaciones nuevas escritas por un camino no migrado | El read-model lee **union** con `foods.exchange_*`; ademas doble escritura en todos los caminos conocidos |
| Fuga cross-tenant (repetir B1) | Filtro de tenant **dentro** del `SECURITY DEFINER` + test de aislamiento con roles reales |
| Duplicados en la lista del alumno | `distinct on (grupo, alimento)` con orden de precedencia explicito |
| Reventar el payload del Today (Micro) | Cap por grupo se mantiene en 60 tras resolver precedencia |
| Copiar 715 filas al duplicar un grupo desde el navegador | Copia en el servidor, en una sola sentencia `insert ... select`, con tope duro y reporte |
| Migracion que pisa parches previos de la funcion | `pg_get_functiondef` + reemplazos exactos + asserts (patron `20260803194000`) |

## Punto de no retorno

Ninguno en F2: la tabla es aditiva, el read-model conserva la rama legacy y el rollback es re-aplicar el bloque
`exchangeFoods` anterior. El retiro de `foods.exchange_*` es F5 y exige GO aparte.
