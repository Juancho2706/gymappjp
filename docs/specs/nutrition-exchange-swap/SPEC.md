# SPEC — T2.5 Intercambio: sheet de dos bloques + swipe

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) — Ola 2, tarea T2.5.
- **Antecedente directo:** [nutrition-substitution-intake](../nutrition-substitution-intake/SPEC.md) (T2.4, en produccion desde 2026-08-10). Esta tanda **consume** su action, su equivalencia y su guard.
- **Diseno:** catalogo de pantallas del rediseno, seccion **"Alumno · 02 — Intercambio: swipe rapido, sheet completo"**.
- **Rama de trabajo:** `rnmobiledenuevo` (igualada a `master` en `ce8c80cb`).
- **Alcance:** web (PWA) **y** React Native Android. Cero dependencias nuevas.
- **Auditoria de estado real:** 2026-08-10, contra HEAD **y contra LIVE** (queries read-only).

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

**H2 — `exchange_portion_grams` NO sirve como criterio de equivalencia.** Es el criterio "natural" del sistema de intercambios (1 porcion de un grupo ≈ 1 porcion de otro alimento del mismo grupo) y por eso era el candidato obvio. Medido contra datos reales, no se sostiene. Para un item de 100 g de "Arroz blanco (crudo)", las dos formulas dan:

| Sustituto (mismo grupo C) | Por porciones | Por calorias | Diferencia |
|---|---|---|---|
| Penne al Pomodoro | 105 g | 121 g | 15% |
| Cereales y Leche | 116 g | 91 g | 27% |
| All-Bran (fibra) | 105 g | 182 g | **73%** |
| Andale Tortillas | 158 g | 182 g | 15% |

Si una porcion de intercambio significara lo mismo dentro del grupo, ambas columnas coincidirian. No lo hacen, asi que **el bloque grupo usa la MISMA equivalencia calorica de T2.4**, con sus topes de plausibilidad ya probados. La inconsistencia del catalogo queda anotada como deuda **aparte**: afecta al sistema de porciones, no a esta tanda, y arreglarla es un trabajo de datos, no de producto.

**H3 — la lista de equivalencias del Today no sirve como fuente.** `exchangeFoods` y `exchangeGroups` viajan en `get_nutrition_today_v2` **solo si el plan tiene targets de porciones**, y en LIVE **1 de 38** alumnos los tiene. Para los otros 37 el bloque grupo se quedaria vacio. La fuente tiene que ser la RPC de opciones de T2.4, ampliada.

**H4 — el guard de T2.4 rechaza el bloque grupo por diseno.** `nutrition_v2_assert_substitution_authorized` exige una fila en `nutrition_item_substitutions_v2`; un alimento del grupo no la tiene. Sin extender el guard, el sheet ofreceria opciones que el servidor devuelve con 42501. **El guard hay que extenderlo, y eso vuelve a tocar el hot-path del intake.**

**H5 — `canSubstitute` quedaria muerto.** Esta en `true` en **4 de 38** versiones vigentes. Era el gate previsto para este bloque (decision D2 de T2.4), pero gatearlo dejaria la feature apagada para 34 alumnos. Ademas **32 de 38** versiones no permiten registro libre: para esos alumnos el intercambio es la unica flexibilidad que tienen.

### Tamano de los grupos (por que el buscador no es opcional)

| Grupo | Alimentos ofrecibles |
|---|---|
| Carbohidratos/Cereales | 715 |
| Proteinas | 606 |
| Lacteo | 405 |
| Frutas | 226 |
| Resto (ARL, G, V, LEG, SP) | 89–201 |

**El 100% de los alimentos clasificados tiene calorias usables**, asi que todos son candidatos legitimos de la equivalencia calorica. Pero un sheet con 715 filas es inusable: el bloque grupo **nace paginado y con buscador**, no como lista completa.

## Decisiones del owner (2026-08-10)

| # | Decision | Consecuencia |
|---|---|---|
| **D1** | **`canSubstitute` NO gatea el bloque grupo.** Cambiar dentro del grupo es equivalencia nutricional, no libertad extra. | Los 36 alumnos lo tienen el dia 1. `canSubstitute` queda oficialmente muerto como permiso: se documenta y no se lee en ningun camino |
| **D2** | **Item fijo = derivado**: sin reemplazos del coach **y** sin grupo usable. Son **50 items (5,7%)**. | Cero migracion y cero trabajo de coach. **El copy NO puede decir "tu coach fijo este alimento"** — no lo fijo: no hay equivalentes cargados. El microcopy del mockup se corrige en consecuencia |
| **D3** | **Sheet primero, swipe despues**, en la misma tanda. | Si algo se corta, se corta el 2%. El guard SQL entra con el sheet, no con el gesto |

## Diseno

### El sheet (F2–F4)

Abre con **tap en "⇄ N equivalentes"** de la fila. Titulo `Cambiar {item} · {cantidad}` + pill con las kcal del item. Dos bloques:

1. **`AUTORIZADOS POR TU COACH`** — las filas de `nutrition_item_substitutions_v2`, las mismas de T2.4. Si no hay, el bloque no se pinta.
2. **`GRUPO {NOMBRE} · 1 PORCION`** — alimentos del mismo `exchange_group_id` que el food del item, **paginados** y con **buscador server-side**. Excluye el propio alimento del item y los que ya estan en el bloque de arriba.

Cada opcion muestra **nombre**, **cantidad equivalente** y **delta** ("mismas kcal ±4%", "+2 g proteina"), calculados con el modulo puro de T2.4. Accion: **"Usar"**.

### El swipe (F5)

Deslizar la fila hacia la izquierda aplica **el primer autorizado**; si el item no tiene autorizados, **el primer resultado del grupo** ordenado por cercania calorica. Cross-fade del nombre, toast con **deshacer 6 s**, y el swipe repetido **cicla** entre las opciones. Web con `framer-motion` (ya en la raiz, `^12.38.0`); RN con `react-native-gesture-handler` + `reanimated` (ya instalados). **Cero dependencias nuevas en las dos superficies.**

### El candado (D2)

Item sin reemplazos y sin grupo usable ⇒ **sin afordancia ⇄** y, si el alumno abre el sheet por otro camino, una linea honesta: *"Este alimento no tiene equivalentes cargados"*. **No** se le atribuye al coach una decision que no tomo.

### La senal al encolar (reparo heredado de T2.4)

Hoy, sin red, el gesto se acepta y **la pantalla no cambia** hasta que la cola drena (~2 min). Se resuelve pintando la fila optimista con el chip **"En cola"**, igual que el camino de "Lo comi". Ahora es posible porque el sheet **ya sabe** el nombre y los macros de la opcion elegida — que era justamente lo que faltaba en T2.4 para no inventar datos.

### Autorizacion (F1)

`private.nutrition_v2_assert_substitution_authorized` se extiende: ademas de la fila autorizada, acepta que el `food_id` escrito **comparta `exchange_group_id`** con el food del item prescrito (y que ambos tengan grupo). Sigue siendo un `create or replace` de `record_nutrition_intake_v2` con la MISMA firma y base verbatim; rollback = re-aplicar `20260809230833`.

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
7. El swipe aplica la primera opcion, el toast ofrece deshacer 6 s y el swipe repetido cicla sin duplicar registros.
8. Sin red, el gesto pinta la fila con **"En cola"** y al volver la conexion drena sin duplicar.
9. `get_nutrition_today_v2` queda byte-identica.
10. Un item sin grupo y sin reemplazos se comporta exactamente como hoy.

## Riesgos

| Riesgo | Cobertura |
|---|---|
| Extender el guard afloja la autorizacion de TODO el intake | El delta acepta solo "mismo grupo del item"; matriz con JWT reales incluyendo food de otro grupo, food sin grupo e item sin grupo |
| El sheet trae 715 filas y muere | Paginado + buscador server-side desde el primer commit, no como mejora posterior |
| La equivalencia calorica da absurdos en grupos dispares | Los topes de T2.4 ya lo cubren y estan probados en produccion; el bloque grupo los hereda sin excepcion |
| Deriva web/RN | Formula y contrato en `packages/nutrition-v2`; las dos superficies consumen el mismo boundary, igual que T2.4 |
