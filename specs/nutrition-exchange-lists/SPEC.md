# SPEC — Listas de equivalencia propias del coach (F2)

Fecha: 2026-08-03 · Origen: plan maestro de Nutricion F2-F5 (decisiones CEO del 2026-08-03) · Precedente: `specs/nutrition-custom-portions` (F1, en prod desde `d1ffbf27`).

## Problema

`foods.exchange_group_id` + `foods.exchange_portion_grams` + `foods.exchange_portion_label` son **columnas de la fila del alimento**. Consecuencias medidas en LIVE el 2026-08-03:

- Hay **una sola verdad global** por alimento: 2.525 clasificaciones sobre 4.648 alimentos, y solo 18 las escribio un coach.
- El coach **no puede tocar el arroz del catalogo** (`foods_update_own` exige `coach_id = auth.uid()`), asi que la unica manera de discrepar con los gramos del catalogo es duplicar el alimento — exactamente lo que produjo los 104 duplicados limpiados en julio.
- Dos coaches **no pueden discrepar**: si uno dice "1 porcion de arroz = 30 g" y otro 40 g, el segundo pisa al primero para todos los alumnos de la plataforma.
- El coach **no puede sacar** un alimento de la lista que ve su alumno.

Hoy (F1, P-B) solo puede clasificar **sus propios** alimentos. Es un piso, no la feature.

## Alcance

### AD-1 (decidida) — tabla `exchange_group_foods`

Grupo x alimento x gramos x medida casera x **dueno**. El catalogo global son filas sin dueno; el coach **escribe encima**; la lectura resuelve por precedencia.

- **DESCARTADO**: clonar filas de `foods` por coach (reintroduce los duplicados de julio).
- Ownership espejo de `foods`: `coach_id` / `org_id`, nunca los dos a la vez. `exchange_groups` usa `team_id`, pero el read-model del alumno solo conoce `coach_id`/`org_id` (ver `20260803194000`), asi que la lista se llavea igual que `foods`.
- **Exclusion**: `is_excluded` permite que el coach **saque** un alimento global de su lista sin tocar el catalogo. Sin esto "mi lista" no es mia.

### Precedencia de lectura (una fila gana por grupo x alimento)

1. fila del **coach del alumno**
2. fila de la **org del alumno**
3. fila **global** de `exchange_group_foods`
4. **legacy**: `foods.exchange_*` (cinturon de transicion — ver Transicion)

Una fila ganadora con `is_excluded = true` retira el alimento de la lista.

### Superficies

1. **Sheet "¿Que cuenta como 1 porcion?"** (web, dentro de la gestion de un grupo):
   - Busca en **TODO el catalogo visible** (global + propios + org), no solo en los propios. Hoy la unica forma de clasificar es sobre alimentos propios.
   - **Sugiere los gramos** desde los macros del alimento y los `ref_*` del grupo: si el grupo son 20 g de CHO y la avena trae 60 g/100 g ⇒ sugerir 33 g. La sugerencia es un punto de partida editable, nunca un valor impuesto.
   - **Preview de la frase exacta** que vera el alumno (`1 porcion = 33 g de Avena (≈ 3 cdas)`) antes de guardar.
2. **Duplicar grupo** pasa a **copiar y reescalar la lista completa** por regla de tres sobre el macro dominante del grupo. Hoy F1 duplica solo los macros ⇒ el grupo nace vacio.
3. **Seccion "Porciones" en `/coach/foods`**: gestion fuera del plan de un alumno concreto. Hoy la unica entrada esta enterrada en el builder de un alumno.

### Fuera de alcance

Editar grupos del sistema (el camino sigue siendo duplicar) · clonar alimentos del catalogo por coach · grupos compuestos · plantillas SMAE/INTA precargadas · retiro fisico de las columnas `foods.exchange_*` (eso es F5) · paridad RN (eso es F4).

## Gating

Sin gate comercial nuevo: hereda el permiso de nutricion (decision CEO 3). Nota de realidad: `canUseNutrition` es **false en Free y Starter** (`packages/tiers/index.ts`), es decir nutricion es Pro+ hoy; bajarla a Free es una decision de negocio separada y abierta.

## Transicion (por que el read-model lee dos fuentes)

El backfill copia las 2.525 clasificaciones vivas a filas sin dueno, pero mientras existan caminos de escritura que toquen `foods.exchange_*` (alta rapida del builder, alta RN, curacion) una lectura que ignore esas columnas **perderia clasificaciones nuevas en silencio** — el mismo modo de falla de B4. Por eso el read-model consume `exchange_group_foods` **union** `foods.exchange_*`, con la tabla ganando siempre. F5 retira la rama legacy cuando no queden escritores.

Los caminos de escritura existentes (`setFoodExchangeEquivalenceAction`, alta web, alta RN, API mobile) pasan a **doble escritura**: siguen poblando `foods.exchange_*` (compatibilidad con V1 vivo y con el sheet V1 del alumno) y ademas escriben la fila propia en `exchange_group_foods`.

## Seguridad

- RLS espejo de `foods`: global legible por todos; fila de coach legible por el coach y por **sus** alumnos; fila de org legible por miembros activos y por alumnos de la org. Escritura solo sobre filas propias (`coach_id = auth.uid()`) o de la org con `is_org_admin_member`.
- `GRANT UPDATE` **column-level** explicito sobre las unicas columnas editables (`portion_grams`, `portion_label`, `is_excluded`) — AGENTS.md.
- El read-model es `SECURITY DEFINER`: el filtro de tenant viaja **dentro** de la consulta (leccion B1 del 2026-08-03), no se delega a RLS.
- La escritura desde RN pasa **siempre** por API movil (leccion NUT-005).

## Criterio de aceptacion

- Un coach abre `/coach/foods → Porciones`, elige "Cereales", busca "arroz" (alimento **global**), pone 30 g y guarda: su alumno ve 30 g; el alumno de otro coach sigue viendo los gramos del catalogo.
- El mismo coach excluye "Quinoa" del grupo: desaparece de la lista de su alumno y sigue en la de los demas.
- Duplicar "Cereales" produce un grupo propio con los **715** alimentos reescalados por regla de tres.
- El sheet sugiere gramos coherentes con los macros y muestra la frase del alumno antes de guardar.
- Cero filas cruzadas: el test de aislamiento por tenant pasa con roles reales, no con `service_role`.
- Gates verdes: `pnpm test`, `pnpm --filter @eva/web exec tsc --noEmit`, `pnpm lint`, `pnpm check:nutrition-v2-boundaries`, `pnpm check:tokens`.

> Superada en 2026-09-05 (`docs/specs/retiro-starter-y-enterprise`): starter salió del catálogo y `canUseNutrition` es true en Free desde pricing v3.
