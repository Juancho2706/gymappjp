# SPEC — T2.5 Intercambio: sheet de dos bloques + swipe

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) — Ola 2, tarea T2.5.
- **Antecedente directo:** [nutrition-substitution-intake](../nutrition-substitution-intake/SPEC.md) (T2.4, en produccion desde 2026-08-10). Esta tanda **consume** su action, su equivalencia y su guard.
- **Diseno:** catalogo de pantallas del rediseno, seccion **"Alumno · 02 — Intercambio: swipe rapido, sheet completo"**.
- **Rama de trabajo:** `rnmobiledenuevo` (igualada a `master` en `ce8c80cb`).
- **Alcance:** web (PWA) **y** React Native Android. Cero dependencias nuevas.
- **Auditoria de estado real:** 2026-08-10, contra HEAD **y contra LIVE** (queries read-only).
- **Revision adversarial:** 2026-08-10, 8 bloqueantes. Todos verificados a mano contra LIVE e incorporados aca (ver "Correcciones de la revision").

## Por que existe esta SPEC

Porque los numeros dan vuelta el orden del mockup. El diseno pone el **swipe** primero y el **sheet** despues, pero en la base:

| | |
|---|---|
| Items prescritos vigentes | **882**, en **36 alumnos** |
| Items con reemplazo autorizado del coach (lo que T2.4 desbloqueo) | **15** |
| Items con grupo de intercambio usable | **832 (94%)** |
| Items que solo tendrian el bloque "grupo" | **817** |
| Alumnos alcanzados por el bloque "grupo" | **los 36** |

**El swipe vale el 2% y el bloque "grupo" del sheet el 98%.** T2.4 le dio flexibilidad a 15 items; T2.5 se la da a 832. Por eso esta SPEC invierte el orden del mockup sin cambiarle el diseno.

## Objetivo

Que el alumno pueda cambiar un alimento prescrito por **cualquier equivalente de su grupo**, no solo por los que el coach cargo a mano, con la cantidad calculada y el cambio visible para el coach. Y que el gesto sea barato: swipe para el caso comun, sheet para elegir.

## Estado real hoy (verificado 2026-08-10)

### Lo que T2.4 dejo listo y esta tanda reusa

| Pieza | Donde | Que aporta a T2.5 |
|---|---|---|
| Equivalencia calorica pura | `packages/nutrition-v2/substitution-intake.ts` | la formula, los topes de plausibilidad y el redondeo, ya probados en produccion |
| Clave de idempotencia por intencion | idem | `attempt` derivado del read model + el salto de claves quemadas |
| Boundary compartido | `apps/web/src/services/nutrition-v2/substitution-intake.service.ts` | resuelve, decide `record` vs `correct` y arma el payload; lo usan web y movil |
| Action y route | `intake.actions.ts` · `api/mobile/nutrition-v2/intake/route.ts` | el gesto ya escribe |
| RPC de opciones | `get_nutrition_substitution_options_v2` (`20260809222811`) | devuelve por item los reemplazos con macros vigentes |
| Guard SQL | `private.nutrition_v2_assert_substitution_authorized` (`20260809230833`) | impide mentir la etiqueta `'substitution'` |
| Estado "sustituido" | `source` del read model | el chip ⇄ y "sustituyo a X" ya se pintan en web y RN |

### Los cinco hallazgos que fijan el diseno

**H1 — el bloque "grupo" es la tanda; el swipe es el adorno.** Los numeros de arriba. Consecuencia de orden: primero el sheet con su bloque grupo y su guard, despues el gesto.

**H2 — `exchange_portion_grams` NO sirve como criterio de equivalencia.** Es el criterio "natural" del sistema de intercambios (1 porcion de un grupo ≈ 1 porcion de otro alimento del mismo grupo) y por eso era el candidato obvio. Medido contra datos reales, no se sostiene.

Poblacion completa: item de 100 g de "Arroz blanco (crudo)" contra los **696** alimentos del grupo C con kcal, porcion de intercambio y unidad de masa. Divergencia entre las dos formulas:

| Metrica | Valor |
|---|---|
| Mediana | **16,7%** |
| p90 | **69,0%** |
| Divergen mas de 10% | **444 de 696 (64%)** |
| Divergen mas de 25% | **227 de 696 (33%)** |

Ejemplos concretos (mismos 100 g de arroz, 365 kcal):

| Sustituto (grupo C) | Por porciones | Por calorias | Diferencia |
|---|---|---|---|
| PAN con ROMERO | 160 g | 70 g | **129%** |
| Pan Rallado Clasico | 105 g | 365 g | **71%** |
| Quinoa Cracker con Maiz Morado | 145 g | 95 g | 53% |
| All-Bran (fibra) | 105 g | 135 g | 29% |
| Andale Tortillas | 158 g | 135 g | 17% |

Si una porcion de intercambio significara lo mismo dentro del grupo, ambas columnas coincidirian en todos los casos. Coinciden en un tercio. Asi que **el bloque grupo usa la MISMA equivalencia calorica de T2.4**, con sus topes de plausibilidad ya probados. La inconsistencia del catalogo queda anotada como deuda **aparte**: afecta al sistema de porciones, no a esta tanda, y arreglarla es un trabajo de datos, no de producto.

> Nota de correccion: la primera version de esta SPEC citaba 121/91/182/182 g en la columna "Por calorias" y un maximo de 73%. Esos numeros no reproducen contra LIVE; los de arriba si (recalculados sobre la poblacion entera). La conclusion no cambia — se refuerza.

**H3 — la lista de equivalencias del Today no sirve como fuente.** `exchangeFoods` y `exchangeGroups` viajan en `get_nutrition_today_v2` **solo si el plan tiene targets de porciones**, y en LIVE **1 de 38** alumnos los tiene. Para los otros 37 el bloque grupo se quedaria vacio. La fuente tiene que ser la RPC de opciones de T2.4, ampliada.

**H4 — el guard de T2.4 rechaza el bloque grupo por diseno.** `nutrition_v2_assert_substitution_authorized` exige una fila en `nutrition_item_substitutions_v2`; un alimento del grupo no la tiene. Sin extender el guard, el sheet ofreceria opciones que el servidor devuelve con 42501. **El guard hay que extenderlo, y eso vuelve a tocar el hot-path del intake.**

**H5 — `canSubstitute` ya esta muerto, desde T2.4.** Esta en `true` en **4 de 38** versiones vigentes. Era el gate previsto para este bloque (decision D2 de T2.4), pero **ningun camino lo lee hoy**: ni `nutrition_v2_assert_intake_permission` ni el guard de sustituciones (verificado leyendo las funciones en LIVE). O sea que T2.4 ya dejo el toggle sin efecto; T2.5 solo agranda el area afectada. Gatearlo ahora, ademas, dejaria la feature apagada para 34 alumnos, y **32 de 38** versiones no permiten registro libre: para esos alumnos el intercambio es la unica flexibilidad que tienen. Consecuencia: ver **D4**.

**H6 — la membresia del grupo NO es la columna `foods.exchange_group_id`.** El sistema ya tiene un resolver (`20260804091000_nutrition_v2_exchange_foods_from_lists.sql`) que la define como union de `exchange_group_foods` — con `coach_id` / `org_id` / **`is_excluded`** — mas la columna legacy, filtrada por tenant. Hoy los dos conjuntos coinciden exacto (2.526 filas, 0 solo-legacy y 0 solo-overlay, 19 filas coach-scoped, 0 exclusiones), asi que usar la semantica correcta **no cambia ningun dato** — pero habilita el unico veto honesto que el coach tiene sobre un alimento del grupo, y evita que sus agregados queden invisibles. T2.5 usa la misma semantica que el resolver, no la columna cruda.

**H7 — el grupo contiene alimentos PRIVADOS de otros coaches.** 19 filas (C:10, P:3, LAC:2, F/G/V/LEG:1). La RLS de `foods` los esconde, pero `private.food_catalog_v2_item_json` es SECURITY DEFINER y **no chequea visibilidad** (`where f.id = p_food_id`, verificado en LIVE). Servir `groupOptions` por ahi filtraria nombre, marca y macros de foods ajenos: un leak que hoy no existe. El predicado de visibilidad es obligatorio, y **el mismo** en la RPC y en el guard, para que el servidor no acepte lo que la UI no puede ofrecer.

### Tamano de los grupos (por que el buscador no es opcional)

| Grupo | Total | Con kcal usable | Privados de coach |
|---|---|---|---|
| Carbohidratos/Cereales (C) | 716 | 715 | 10 |
| Proteinas (P) | 606 | 606 | 3 |
| Lacteo (LAC) | 405 | 405 | 2 |
| Frutas (F) | 227 | 226 | 1 |
| Alimento rico en lipidos (ARL) | 201 | 201 | 0 |
| Grasa de cocina (G) | 118 | 118 | 1 |
| Verduras (V) | 112 | 112 | 1 |
| Legumbres (LEG) | 89 | 89 | 1 |
| Scoop proteina (SP) | 52 | 52 | 0 |

Solo **2 de 2.526** alimentos clasificados no tienen calorias usables (uno en C, uno en F); esos dos quedan fuera del bloque grupo. Todo el resto es candidato legitimo de la equivalencia calorica. Pero un sheet con 715 filas es inusable: el bloque grupo **nace paginado y con buscador**, no como lista completa. Los conteos de privados bajan segun el coach una vez aplicado el filtro de visibilidad de H7.

## Decisiones del owner (2026-08-10)

| # | Decision | Consecuencia |
|---|---|---|
| **D1** | **`canSubstitute` NO gatea el bloque grupo.** Cambiar dentro del grupo es equivalencia nutricional, no libertad extra. | Los 36 alumnos lo tienen el dia 1. `canSubstitute` queda oficialmente muerto como permiso: se documenta y no se lee en ningun camino |
| **D2** | **Item fijo = derivado**: sin reemplazos del coach **y** sin grupo usable. Son **50 items (5,7%)**. | Cero migracion y cero trabajo de coach. **El copy NO puede decir "tu coach fijo este alimento"** — no lo fijo: no hay equivalentes cargados. El microcopy del mockup se corrige en consecuencia |
| **D3** | **Sheet primero, swipe despues**, en la misma tanda. | Si algo se corta, se corta el 2%. El guard SQL entra con el sheet, no con el gesto |
| **D4** | **PENDIENTE del owner** (no bloquea F0–F3; se necesita antes de F4). El checkbox **"Puede sustituir alimentos"** del builder y su pill en quick-edit siguen vivos y no controlan nada — ya desde T2.4 (H5). Un coach que lo apaga cree que impidio sustituciones. | Recomendacion: **ocultar el checkbox y la pill**, dejando el campo en el contrato sin lectura, y documentar que el veto real por alimento es `exchange_group_foods.is_excluded` (H6). Alternativa: reetiquetarlo. **Hasta que el owner decida, no se toca la UI del coach** |

## Diseno

### El sheet (F2–F4)

Abre con **tap en "⇄ N equivalentes"** de la fila. Titulo `Cambiar {item} · {cantidad}` + pill con las kcal del item. Dos bloques:

1. **`AUTORIZADOS POR TU COACH`** — las filas de `nutrition_item_substitutions_v2`, las mismas de T2.4. Si no hay, el bloque no se pinta.
2. **`GRUPO {NOMBRE} · MISMAS CALORIAS`** — alimentos del mismo grupo que el food del item, con la membresia de H6 y el filtro de visibilidad de H7, **paginados** y con **buscador server-side**. Excluye el propio alimento del item y los que ya estan en el bloque de arriba. El header **no** dice "1 porcion": el bloque es equivalencia calorica, no de porciones (H2).

Cada opcion muestra **nombre**, **cantidad equivalente** y **delta** ("mismas kcal", "+2 g proteina"), calculados con el modulo puro de T2.4. Accion: **"Usar"**. El umbral del delta es uno solo: diferencia calorica **menor al 5%** ⇒ "mismas kcal".

**Orden del bloque:** por construccion todas las opciones igualan las kcal del item, asi que "cercania calorica" no puede ser el criterio. El orden es por **cercania de porcion**: cuan lejos queda la cantidad equivalente de la porcion de referencia del sustituto — primero lo que se come en una cantidad natural, ultimo lo que exige 900 g de avena.

### El swipe (F6)

Deslizar la fila hacia la izquierda aplica **la primera opcion aplicable**: el primer autorizado, y si no hay, el primer resultado del grupo. **Salta las opciones que exigen confirmacion** (`needs-confirmation` / `unavailable`, criterio 11 de T2.4): esas necesitan el stepper y no pueden aplicarse de un tap. Si ninguna opcion es aplicable de un tap, el swipe **abre el sheet** en lugar de escribir. Cross-fade del nombre, toast con **deshacer 6 s**, y el swipe repetido **cicla** entre las aplicables. Web con `framer-motion` (ya en la raiz, `^12.38.0`); RN con `react-native-gesture-handler` + `reanimated` (ya instalados). **Cero dependencias nuevas en las dos superficies.**

### Idempotencia de una opcion del grupo

La clave de T2.4 es `subst-{fecha}-{itemId}-{substitutionId}-a{attempt}` y **exige** un `substitutionId`; una opcion del grupo no tiene fila, asi que no tiene id. Sin definir esto explicitamente se repite el bug que el QA de T2.4 cazo (clave reusada ⇒ item inconsumible). Reglas:

1. La opcion del grupo ocupa el slot con el **namespace `gf-{foodId}`** ⇒ `subst-{fecha}-{itemId}-gf-{foodId}-a{attempt}`. Namespace disjunto del de las filas autorizadas: el mismo alimento elegido por un bloque o por el otro son **intenciones distintas** y no cruzan historiales.
2. `resolveAttempt` sondea con ese mismo componente, y **salta las claves cuya entry no esta viva** — `voided` **y `corrected`** (los tres estados posibles son `active`, `corrected`, `voided`). Hoy solo salta `voided`, y por eso un ciclo A→B→A puede caer sobre una entry ya corregida y encadenar la correccion sobre si misma.
3. Sin red, el `attempt` no puede salir solo del read model (no hay refetch): se le **suma la cantidad de gestos ya encolados** para ese item. Si no, el tercer gesto de un ciclo A→B→A offline reusa la clave del primero.

### La cantidad, en el camino del grupo

`record_nutrition_intake_v2` no valida cantidad en este camino (`p_check_quantity = false`) y `correct_` exime a `'substitution'`; el snapshot de macros lo manda el cliente. Es el modelo de confianza **S2 preexistente** de T2.4, declarado en `20260809230833`. Lo que cambia es la superficie: de 15 filas curadas a ~832 items × ~700 alimentos. No se cierra en esta tanda, pero se acota lo barato: el delta del guard exige que el item pertenezca a una version **`published` o `superseded` de un plan activo**, para que un item historico no sea vector de escritura.

### El candado (D2)

Item sin reemplazos y sin grupo usable ⇒ **sin afordancia ⇄** y, si el alumno abre el sheet por otro camino, una linea honesta: *"Este alimento no tiene equivalentes cargados"*. **No** se le atribuye al coach una decision que no tomo.

### La senal al encolar (reparo heredado de T2.4)

Hoy, sin red, el gesto se acepta y **la pantalla no cambia** hasta que la cola drena (~2 min). Se resuelve pintando la fila optimista con el chip **"En cola"**, igual que el camino de "Lo comi". Ahora es posible porque el sheet **ya sabe** el nombre y los macros de la opcion elegida — que era justamente lo que faltaba en T2.4 para no inventar datos.

### Autorizacion (F1)

`private.nutrition_v2_assert_substitution_authorized` se extiende: ademas de la fila autorizada, acepta que el `food_id` escrito **comparta grupo** con el food del item prescrito. "Compartir grupo" se evalua con la membresia de H6 (overlay + legacy, `is_excluded` respetado, tenant filtrado) y con el predicado de visibilidad de H7 — el mismo que usa la RPC, para que el guard no acepte lo que el sheet no ofrece. Ademas el item debe pertenecer a una version publicada o superseded de un plan activo.

`record_nutrition_intake_v2` **no se toca**: el guard vive en la funcion auxiliar, que ya se llama desde ahi (incluso en el camino delegado). Rollback = re-aplicar `20260809230833`.

## No-objetivos

- No se arregla la inconsistencia de `exchange_portion_grams` del catalogo (deuda propia, afecta al sistema de porciones).
- No se toca `get_nutrition_today_v2`.
- No se implementa el check primario ni la muerte del boton "Lo comi" (pin 3 de la pantalla 01): eso es el re-skin de **T2.7**.
- No se agrega un flag explicito de "item fijo" (D2).
- No se lee `canSubstitute` en ningun camino nuevo (D1).

## Criterios de aceptacion

1. Un alumno con un item cuyo food tiene grupo ve **"⇄ N equivalentes"** en la fila y puede abrir el sheet, **sin importar `canSubstitute` ni `canRegisterFreely`**.
2. El bloque grupo lista alimentos del **mismo** `exchange_group_id`, paginado, y el buscador filtra server-side.
3. Elegir una opcion del grupo **escribe** con `source = 'substitution'` y `prescription_item_id` del item; el item queda consumido.
4. Llamar `record_nutrition_intake_v2` directo por PostgREST con un food de **otro** grupo y sin fila autorizada devuelve **42501**.
5. La cantidad escrita es la equivalencia calorica redondeada, **identica** al numero que mostro el sheet.
6. Un item sin reemplazos y sin grupo **no** muestra ⇄, y el copy no le atribuye la decision al coach.
7. El swipe aplica la primera opcion **aplicable de un tap**, salta las que exigen confirmacion, el toast ofrece deshacer 6 s y el swipe repetido cicla sin duplicar registros.
8. Sin red, el gesto pinta la fila con **"En cola"** y al volver la conexion drena sin duplicar.
9. `get_nutrition_today_v2` queda byte-identica.
10. Un item sin grupo y sin reemplazos se comporta exactamente como hoy.
11. **Los clientes de T2.4 ya desplegados siguen funcionando durante y despues del deploy**: la llamada de 2 argumentos a `get_nutrition_substitution_options_v2` no puede quedar ambigua, y `schemaVersion` sigue en **1**.
12. **Deshacer y volver a elegir la MISMA opcion del grupo** deja el item consumible (el bug de T2.4, en el camino nuevo).
13. Un ciclo **A→B→A encolado sin red** drena en tres claves distintas y deja una sola entry viva, con la cadena de correcciones intacta.
14. `groupOptions` **nunca** incluye un alimento privado de otro coach; y llamar `record_` con uno de esos devuelve **42501**.
15. Un alimento **excluido por el coach** (`is_excluded`) no se ofrece **ni se acepta**.

## Riesgos

| Riesgo | Cobertura |
|---|---|
| Extender el guard afloja la autorizacion de TODO el intake | El delta acepta solo "mismo grupo del item"; matriz con JWT reales incluyendo food de otro grupo, food sin grupo e item sin grupo |
| El sheet trae 715 filas y muere | Paginado + buscador server-side desde el primer commit, no como mejora posterior |
| La equivalencia calorica da absurdos en grupos dispares | Los topes de T2.4 ya lo cubren y estan probados en produccion; el bloque grupo los hereda sin excepcion |
| Deriva web/RN | Formula y contrato en `packages/nutrition-v2`; las dos superficies consumen el mismo boundary, igual que T2.4 |
| **Cambiar la firma de la RPC rompe T2.4 en produccion** | `create or replace` con argumentos nuevos **no reemplaza: crea una sobrecarga**, y la llamada de 2 args queda ambigua (`42725`, reproducido en LIVE con rollback). La migracion hace `drop` + `create` + re-emite los grants, en una transaccion |
| Leak de alimentos privados de otros coaches | Predicado de visibilidad en la RPC **y** en el guard; criterio de aceptacion 14 |
| Clave de idempotencia reusada en el camino del grupo | Namespace `gf-`, salto de claves no-vivas y bump del `attempt` por gesto encolado; criterios 12 y 13 |

## Correcciones de la revision adversarial (2026-08-10)

Ocho bloqueantes, todos re-verificados a mano contra LIVE antes de aceptarlos:

| # | Que decia | Verificacion propia | Donde se corrigio |
|---|---|---|---|
| B1 | `create or replace` con args nuevos crea sobrecarga y rompe T2.4 | **Confirmado**: en LIVE existe solo la firma de 2 args; probe con rollback dio `42725 :: function is not unique` | PLAN F2 (drop + create + grants) |
| B2 | La membresia real es el overlay, no la columna | **Confirmado**: 2.526 filas en cada lado, 0 divergencias, 19 coach-scoped, `is_excluded` disponible | H6, PLAN F1/F2 |
| B3 | Se filtrarian foods privados de otros coaches | **Confirmado**: 19 privados en grupos; `food_catalog_v2_item_json` no chequea visibilidad | H7, criterio 14 |
| B4 | La clave del grupo no estaba definida | **Confirmado** por construccion | Seccion "Idempotencia", criterio 12 |
| B5 | El ciclo offline reusa claves quemadas | **Confirmado**: los estados son `active`/`corrected`/`voided` y hoy solo se salta `voided` | Idempotencia puntos 2 y 3, criterio 13 |
| B6 | El swipe podia aplicar de un tap algo que exige stepper | **Confirmado** contra el criterio 11 de T2.4 | Seccion "El swipe", criterio 7 |
| B7 | Validar contra la respuesta paginada da falsos 42501 | **Confirmado**: buscador y "ver mas" caen fuera del top-20 | PLAN F3 (`p_group_food_id`) |
| B8 | El toggle del coach queda mintiendo | **Confirmado**: checkbox real en el builder; y ya no se lee **desde T2.4** | H5 y **D4** (decision del owner) |

Reparos aceptados: los numeros de H2 no reproducian (corregidos con la poblacion entera), SP=52 y 2 alimentos sin kcal (tabla corregida), `schemaVersion` se queda en 1, el indice `foods_exchange_group_id_idx` ya existe, el header del bloque no dice "1 porcion", el orden se define por cercania de porcion y `p_group_query` escapa `%` y `_`.
