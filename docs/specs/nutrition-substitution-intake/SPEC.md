# SPEC — T2.4 Sustituciones FULL: registrar un reemplazo autorizado

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) — Ola 2, tarea T2.4.
- **Antecedente coach:** [nutrition-substitutions](../nutrition-substitutions/SPEC.md) (F-02, la mitad que ya existe: el coach define reemplazos y el alumno los VE).
- **Rama de trabajo:** `rnmobiledenuevo` (igualada a `master` en `a02805ab`). Web a prod = merge a master con OK del owner.
- **Alcance:** web (desktop + responsive/PWA) **y** React Native Android. Cero dependencias nativas nuevas.
- **Auditoria de estado real:** 2026-08-09, contra HEAD **y contra LIVE** (queries read-only).
- **Revision adversarial:** 2026-08-09, 5 bloqueantes + 13 reparos. Todos incorporados; el detalle de cada correccion esta al pie.

## Por que existe esta SPEC

El enunciado de T2.4 en el TASKS del programa dice "validado contra las substitutions del item **o membership de grupo**". La auditoria en LIVE encontro que:

1. `nutrition_prescription_items_v2.substitution_group_id` tiene **0 filas pobladas**. El "grupo" de ese enunciado no existe como dato; el unico agrupamiento real son los grupos de intercambio (porciones).
2. Las 21 sustituciones vivas tienen **`quantity` NULL**, y con `quantity` NULL el freeze congela los macros de **una porcion del sustituto**, no del item prescrito. Consecuencia visible hoy en produccion: el item "Lomo liso 120 g · 240 kcal" ofrece la pill "Posta de vacuno cocida · **17 kcal**". Especificar "registrar el reemplazo tal como esta congelado" habria metido ese error en la adherencia del alumno.

Esta SPEC reemplaza el enunciado y deja el estado verificado por escrito.

## Objetivo

Que el alumno pueda **registrar un reemplazo que su coach autorizo**, en un gesto, sin depender del permiso de registro libre, y que ese registro quede identificado como **sustitucion** en los read models y cuente como el item prescrito para la adherencia.

## Estado real hoy (verificado 2026-08-09)

### Lo que ya existe y funciona

| Pieza | Donde | Que hace |
|---|---|---|
| Tabla | `supabase/migrations/20260721150000_nutrition_item_substitutions_v2.sql` | reemplazos por item, RLS espejo de los items (`can_read_version` / `can_edit_version`), grants a nivel tabla |
| Contrato de lectura | `packages/nutrition-v2/read-models.ts:85-142` | `NutritionItemSubstitutionReadSchema`, `mapNutritionItemSubstitutionRow`, `NUTRITION_ITEM_SUBSTITUTION_SELECT` |
| Lectura alumno web | `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:199+` | select directo RLS-scoped por `version_id`, agrupado con `groupSubstitutionsByPrescriptionItem` (`nutrition-today.logic.ts:342-352`) |
| Lectura alumno RN | `apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:456-490` | el MISMO select, best-effort (error ⇒ mapa vacio ⇒ no se pinta la linea) |
| Pill "Puedes reemplazar por" | `TodayExperience.tsx:942-972` (web) · `index.tsx:2129-2158` (RN) | nombre + kcal del snapshot congelado |
| Enum de origen | `packages/nutrition-v2/contracts.ts:18-25` y `migrations/20260714190000:216` | `'substitution'` **ya es un valor valido** en el contrato Zod y en el `check` de `intake_source_v2` |
| Read model expone el origen | `migrations/20260714210000_nutrition_v2_today_plan_read_models.sql:95` | `'source', coalesce(e.intake_source_v2, e.source)` |

### El puente T1.6 que hay que reemplazar

`TodayExperience.tsx:395-405` (web) y `index.tsx:1062-1076` (RN): el tap en la pill **no registra**. Abre el registro LIBRE con la busqueda precargada con el nombre del sustituto y, si `canRegisterFreely` es false, muestra un explicativo. El resultado:

- exige un permiso que **nada tiene que ver** con la sustitucion;
- el alumno vuelve a elegir el alimento a mano (puede elegir otro);
- la entry queda `source = 'offplan'` **sin `prescription_item_id`** ⇒ el item prescrito sigue apareciendo como no consumido, la franja nunca se completa, y el dia suma doble si ademas toca "Lo comi".

### Los cinco hallazgos que fijan el diseno

**H1 — `substitution_group_id` esta muerto.** 0 filas en LIVE. El enunciado original apuntaba a un dato inexistente. Los grupos de intercambio SI son un agrupamiento real (1.598 de 1.711 items prescritos de versiones vivas tienen su food clasificado con `exchange_group_id` **y** `exchange_portion_grams`), pero su unica UI es el sheet de T2.5. **Decision owner D4: fuera de T2.4.**

**H2 — el snapshot congelado del reemplazo no sirve como cantidad.** `draft-builder.ts:1565-1593` (y su gemelo `apps/mobile/lib/nutrition-v2-builder.ts:1551-1579`): cuando `sub.quantity` es NULL, `refQty = food.servingSize`, o sea la porcion del **sustituto**, sin relacion con lo prescrito. En LIVE eso es el **100%** de las filas (21/21). El comentario de la tabla ("null = misma porcion que el prescrito") describe una intencion que el codigo no implementa.

**H3 — el guard de permisos ya deja pasar el REGISTRO, pero NO la correccion.** `private.nutrition_v2_assert_intake_permission` (`migrations/20260728130000:176-249`) solo exige `canRegisterFreely` cuando `p_prescription_item_id is null` **y** `p_source = 'offplan'`: un registro con `prescription_item_id` + `source = 'substitution'` ya queda exento hoy. **Pero** `correct_nutrition_intake_v2` (`:601-610`) llama al guard con `p_check_quantity = (p_quantity is distinct from v_original.quantity)`, y el check (b) (`:225-237`) compara contra la cantidad **prescrita** del item, ciego a la unidad. Una sustitucion-correccion SIEMPRE cambia la cantidad (otro alimento, a veces otra unidad: 130 g de leche frente a "1 un" de yogurt = 12.900% de delta) ⇒ `nutrition_v2_permission_denied:quantity_adjustment`. En LIVE, **3 de las 6 versiones publicadas** con reemplazos tienen `canAdjustPrescribedQuantity = false`, **incluida la unica que ademas tiene `canRegisterFreely = false`** — justo el caso que esta tanda viene a resolver. El fix va en F2 (ver "Autorizacion").

**H4 — el estado "sustituido" no necesita tocar `get_nutrition_today_v2`.** El read model ya emite `source` desde `intake_source_v2`. Escribir `'substitution'` lo hace visible en Today y en el historial **sin una sola linea de la RPC sagrada**. Y como la entry lleva `prescription_item_id`, `isPrescriptionConsumed` (`nutrition-today.logic.ts:64-66`), el medidor de franja, el bulk-mark y los totales del dia la cuentan **solos**.

**H5 — la validacion server-side no existe en ninguna capa.** `record_nutrition_intake_v2` valida que el `prescription_item_id` pertenezca a un plan del alumno (`migrations/20260728130000:390-400`), pero **no** valida ninguna relacion entre el `food_id` enviado y el item. Hoy `authenticated` tiene EXECUTE directo sobre la RPC (verificado en LIVE), asi que un guard puesto solo en la server action web o en la route movil es cosmetico. **El guard tiene que estar en SQL.**

### Datos LIVE (2026-08-09, read-only)

| Metrica | Valor |
|---|---|
| Filas en `nutrition_item_substitutions_v2` | 21 |
| Versiones distintas | 9 (6 published / 3 superseded) |
| Alumnos alcanzados | **5** (los 2 que tienen versiones superseded estan dentro de esos 5) |
| Items distintos con reemplazo | 21 (⇒ 1 reemplazo por item; el cap de 8 nunca se uso) |
| Filas con `food_id` | 21/21 (cero `custom_name` puro, cero recetas) |
| Filas con `quantity` NULL | **21/21** |
| Versiones publicadas con `canAdjustPrescribedQuantity = false` | **3 de 6** (una de ellas tambien con `canRegisterFreely = false`) |
| Entries con `intake_source_v2 = 'substitution'` | **0** (nadie escribio nunca por este camino) |
| Indice `..._prescribed_once_idx` | **no aplicado** (sigue en `_PENDING_AUDIT_`) |

Superficie chica y limpia: cero datos que migrar, cero comportamiento previo que preservar.

## Decisiones del owner (2026-08-09)

| # | Decision | Consecuencia |
|---|---|---|
| **D1** | **Equivalencia calorica calculada en el servidor** cuando la fila trae `quantity` NULL: la cantidad del sustituto es la que iguala las **kcal congeladas del item prescrito**, con los macros **vigentes** del sustituto (catalogo + override del coach, T2.1), redondeada. El alumno la ve antes de confirmar. | Ademas arregla la pill: deja de decir "17 kcal" y pasa a decir la cantidad equivalente real |
| **D2** | **`canSubstitute` NO gatea el camino autorizado.** La fila que el coach creo para ese item ES la autorizacion. | La feature funciona el dia 1 para los 5 alumnos que ya tienen reemplazos (el permiso es `false` por defecto: gatearlo la dejaria apagada para todos). `canSubstitute` queda reservado para el bloque "cualquiera de mi grupo" de T2.5 |
| **D3** | Sustituir sobre un item **ya registrado** = **correccion automatica** (`correct_nutrition_intake_v2`, razon automatica), no un registro adicional. | Un solo registro activo por item, historial append-only intacto, y el swipe de T2.5 hereda el comportamiento. Obliga al fix de H3 |
| **D4** | El camino "**cualquiera de mi grupo**" se especifica aca pero **se implementa en T2.5** junto al sheet, su unica UI. | T2.4 = superficie chica (21 filas) y review adversarial acotado |

## Diseno

### Lo que se escribe

Una entry de intake normal, con tres diferencias respecto de "Lo comi":

| Campo | Valor |
|---|---|
| `prescription_item_id` | el item prescrito que se esta sustituyendo (**no** null: de aca sale toda la adherencia) |
| `intake_source_v2` | `'substitution'` |
| `capture_method_v2` | `'prescription'` (el gesto nace de la fila prescrita, no de una busqueda) |
| `food_id` / `custom_name` | los del **reemplazo autorizado**, resueltos en el servidor desde la fila (nunca los que mande el cliente) |
| `meal_slot` | el `slot_code` del propio item (no hay movimiento de franja) |
| `quantity` / `unit` / `snapshot` | resultado de la equivalencia (ver abajo) |

### Equivalencia (D1)

Entrada: el item prescrito (`quantity`, `unit`, `snapshot_calories` congelados) y el sustituto con sus macros **vigentes** override-merged.

1. Si la fila de sustitucion trae `quantity` **no nula** ⇒ esa cantidad, con `unit` de la fila; si la fila trae `unit` NULL (la tabla lo permite, `20260721150000:38-39`) ⇒ la unidad natural del sustituto.
2. Si `quantity` es NULL ⇒ `cantidad = kcal_prescritas / kcal_por_unidad_del_sustituto`, con la unidad natural del sustituto (`g`/`ml` si su base lo permite, si no su `serving_unit`).
3. Redondeo: multiplos de **5** para `g`/`ml`, de **0,5** para unidades contadas. Piso: nunca 0 (si el redondeo da 0, queda el escalon minimo).
4. **Tope de plausibilidad (hallazgo de la revision).** Con datos reales de LIVE, "Pechuga 100 g / 165 kcal → Espinaca (23 kcal/100 g)" da **~715 g de espinaca**. Si la cantidad equivalente supera **3×** la porcion de referencia del sustituto, el resultado es `computed: 'needs-confirmation'`: la opcion se ofrece igual, pero **no se registra de un tap** — abre el stepper con la cantidad calculada y el alumno confirma. El factor 3 es el unico numero magico de esta SPEC y esta aislado en una constante.
5. Casos borde que **degradan sin inventar**: sustituto sin kcal vigentes (o kcal 0 — existe al menos un caso real en LIVE), item sin `snapshot_calories`, o unidad no convertible ⇒ `computed: 'unavailable'`. La opcion se ofrece, exige confirmar la cantidad, y el stepper se prellena con **la porcion del sustituto en su propia unidad** (nunca con la cantidad del item: "300 g de Nescafe" o "1 un de leche" son basura).
6. Los macros del snapshot congelado de la entry se calculan **para esa cantidad**, respetando `macrosBasis` (NUT-001) con los mismos helpers de escala que ya usa el intake (`packages/nutrition-v2/catalog.ts` + `food-overrides.ts` para la base y el merge; `intake-units.ts` para el factor de unidad).

La formula vive en **un solo lugar**: `packages/nutrition-v2/substitution-intake.ts` (puro, con golden tests), consumido por la server action web, la route movil y las dos UIs. Los numeros que el alumno ve y los que se escriben son los mismos por construccion, no por disciplina.

### Autorizacion (server, no negociable)

Dos capas, ninguna en la UI:

- **Capa SQL (la real).**
  1. `record_nutrition_intake_v2` gana un guard: si `p_source = 'substitution'`, exige que exista una fila de `nutrition_item_substitutions_v2` para ese `prescription_item_id` cuyo `food_id` (o `custom_name`) coincida con lo que se esta escribiendo. Si no, `nutrition_v2_substitution_not_authorized` con `errcode 42501`. Corre **tambien** en la delegacion desde `correct_` (la marca `eva.nutrition_v2_delegated_correction` salta el guard de registro libre, no este) y **tambien** para el coach escribiendo sobre su alumno: la etiqueta `'substitution'` significa lo mismo la escriba quien la escriba; un coach que quiere otro alimento edita el plan.
  2. `correct_nutrition_intake_v2` deja de aplicar el check de cantidad cuando `p_source = 'substitution'` (H3). Cambiar de alimento autorizado no es "ajustar la cantidad prescrita", y el tope en % compara contra la cantidad de **otro** alimento, en otra unidad. El resto del guard (mover de franja) queda intacto.
  Ambas por `create or replace` con la MISMA firma; rollback = re-aplicar `20260728130000`.
- **Capa boundary (copy honesto + resolucion).** La server action web y la route movil resuelven la fila autorizada y arman el payload; el cliente manda `{ prescriptionItemId, substitutionId, attempt, quantity? }` y nada mas. Nunca manda `foodId` ni macros. El `quantity` del cliente se honra solo dentro de `canAdjustPrescribedQuantity` + `quantityAdjustmentPercent`, medido **contra la cantidad equivalente calculada**, no contra la prescrita del otro alimento.

**Que NO cubre el guard (sinceridad explicita).** Un alumno con su JWT puede seguir llamando `record_` por PostgREST con `source = 'prescription'` y un `food_id` arbitrario contra un item suyo: `record_` nunca valido food-vs-item y esta SPEC no cambia eso (es el modelo de confianza S2 declarado en `20260728130000:46-50`). Lo que el guard garantiza es que **la etiqueta `'substitution'` no se puede mentir**, que es la promesa de T2.4. Del mismo modo, con un food autorizado la cantidad y los macros siguen siendo declarados por quien llama a la RPC: el criterio 3 vale para el camino por el boundary, no para una llamada directa.

### Lectura de opciones

Las opciones con macros vigentes viajan por una RPC nueva `get_nutrition_substitution_options_v2(p_client_id, p_local_date)` (SECURITY DEFINER, scope `private.nutrition_v2_can_read_client`, reusa `private.food_catalog_v2_item_json(food_id, coach_id)`).

Aclaracion de la revision: **no** es porque el alumno no pueda leer los overrides — la policy `cfo_select_client_coach` de `coach_food_overrides` se lo permite (verificado en LIVE). La RPC existe por tres razones distintas: (a) un round-trip en vez de tres selects + N+1 sobre `foods`, (b) el merge override queda en **un** lugar (el mismo `food_catalog_v2_item_json` que usa el coach), y (c) la resolucion de version del dia es logica de servidor que ninguna de las dos UIs deberia reimplementar. No agrega privilegio: devuelve exactamente lo que la RLS del alumno ya permitiria leer.

**Version del dia (correccion de la revision).** La RPC resuelve la version igual que `private.nutrition_v2_effective_permissions` (`20260728130000:74-92`): **primero `nutrition_day_snapshots_v2.version_id` del dia**, y solo si el dia todavia no tiene snapshot, el selector determinista. Motivo: `nutrition_v2_ensure_day_snapshot` devuelve el snapshot existente sin recalcular, asi que si el coach re-publica intradia, el selector puro entregaria `prescription_item_id`s de una version que Today no esta mostrando ⇒ pills sin opciones o escrituras contra items invisibles.

Es **solo lectura**, no congela snapshot y **no toca `get_nutrition_today_v2`**.

### Idempotencia por intencion

```
subst-{localDate}-{prescriptionItemId}-{substitutionId}-a{attempt}
```

- **`attempt` se deriva del read model que el cliente ya tiene en pantalla**: la cantidad de entries de hoy para ese `prescriptionItemId` **en cualquier estado** (activa, corregida o retirada). Es determinista, identico en web y RN, y no exige que el cliente lleve un contador propio.
- Doble tap sin refetch ⇒ mismo `attempt` ⇒ misma clave ⇒ el short-circuit de la RPC devuelve el id previo (una sola entry).
- **Deshacer y volver a registrar** ⇒ la entry retirada sigue contando ⇒ `attempt` sube ⇒ clave nueva. Sin esto, el short-circuit de `record_` (`:348-354`, que **no filtra `entry_status`**) devolveria el id de la entry ya retirada y el item quedaria inconsumible el resto del dia.
- **Ciclo A → B → A** ⇒ cada paso ve una entry mas ⇒ tres claves distintas. Sin esto, la tercera reusaria la clave de la primera y `correct_` terminaria haciendo que una entry se corrija a si misma en ciclo.
- **Sin `deviceId`** (excepcion declarada a `buildNutritionIdempotencyKey`, `contracts.ts:378-391`): la intencion es la misma la toque el alumno donde la toque, y con `deviceId` dos dispositivos escribirian dos veces.
- El `attempt` viaja en el payload (es la unica forma de que el retry de la cola offline reuse exactamente la misma clave).

Carrera conocida y aceptada: dos dispositivos desincronizados pueden escribir dos entries; el boundary re-chequea antes de decidir record-vs-correct, pero sin el indice `prescribed_once` (que sigue pendiente por decision de producto ajena) no hay garantia dura. Anotado, no resuelto aca.

### Estado "sustituido" en read models y adherencia (H4)

- **Read models:** `source === 'substitution'` viaja solo. Cero cambios en las RPC de lectura.
- **UI:** la fila del item muestra el nombre del reemplazo con el prescrito tachado + chip semantico "Sustituido" (paleta semantica fija, nunca rojo — regla del programa).
- **Adherencia:** automatica por `prescription_item_id`. `isPrescriptionConsumed`, `consumedEntryForItem`, el medidor de franja, el bulk-mark y los totales del dia ya la cuentan. **No** se toca `computeNutritionAdherence` de `@eva/nutrition-engine`: ese motor es de nutricion **V1** (sus consumidores son superficies V1 — `WeeklyRecapCard.tsx`, `streak.ts`, `dashboard.service.ts`, `dashboard.queries.ts`, `heroComplianceBundle.ts`, `recap.queries.ts`, `api/mobile/nutrition/recap/route.ts` — todas sobre `daily_nutrition_logs`), no participa de V2. El handoff decia lo contrario; queda corregido.

### UI minima de T2.4

- **Pill (web + RN):** deja de mostrar la kcal de una porcion arbitraria y muestra **la cantidad equivalente + sus kcal** ("Posta de vacuno cocida · 130 g · 240 kcal"). Tap = registrar (un gesto), con confirmacion ligera y **deshacer**.
- **Sin permiso de registro libre:** ya no aparece ningun explicativo. El camino funciona igual (D2).
- **Item ya registrado:** el tap sustituye por correccion (D3) y la UI lo dice ("Cambiamos tu registro por el reemplazo").
- **`needs-confirmation` / `unavailable`:** no registran de un tap; abren el stepper prellenado segun las reglas 4 y 5, con el motivo dicho en una linea.
- El sheet de dos bloques, el swipe y el candado de items fijos son **T2.5** y consumen esta misma action.

## No-objetivos

- No se implementa el camino "cualquiera de mi grupo de intercambio" (D4 ⇒ T2.5).
- No se recrea ni se modifica `get_nutrition_today_v2` / `get_nutrition_plan_read_v2`.
- No se cambia el modelo de confianza S2 (self-report) del snapshot de macros: sigue siendo la deuda declarada en `20260728130000:46-50`.
- No se cierra el hueco pre-existente de `source = 'prescription'` con food arbitrario (ver "Que NO cubre el guard").
- No se aplica el indice `_PENDING_AUDIT_nutrition_v2_prescribed_intent_once` (decision de producto abierta, ajena a esta tanda).
- No se toca el editor coach de reemplazos (web ya lo tiene; RN sigue diferido).
- No se migran los 21 snapshots congelados con la base vieja: la equivalencia se calcula con macros vigentes, asi que el dato viejo deja de leerse para decidir cantidades.

## Criterios de aceptacion

1. Un alumno con `canRegisterFreely = false` **puede** registrar un reemplazo autorizado, en un tap, en web y en RN.
2. La entry queda con `prescription_item_id` del item, `intake_source_v2 = 'substitution'`, en la franja del item, y el item aparece **consumido** en Today (medidor de franja y bulk-mark coherentes).
3. La cantidad escrita por el boundary es la equivalencia redondeada y **es identica** al numero que la UI mostro antes de confirmar.
4. Llamar `record_nutrition_intake_v2` **directo por PostgREST** con `source = 'substitution'` y un `food_id` no autorizado devuelve `42501`, con JWT reales de alumno **y** de coach del pool.
5. Dos taps seguidos en la misma pill producen **una** entry; el segundo devuelve el mismo id.
6. Sustituir sobre un item ya registrado deja **un** registro activo (el sustituto) y el original en `corrected`, con el historial mostrando ambos — **incluyendo el caso `canAdjustPrescribedQuantity = false`** (3 de 6 versiones reales) y el caso con `quantityAdjustmentPercent` seteado.
7. **Deshacer y volver a registrar** el mismo reemplazo crea una entry nueva (no devuelve la retirada).
8. **Ciclo A → B → A** deja exactamente una entry activa (la ultima) y una cadena de correcciones sin ciclos.
9. `get_nutrition_today_v2` queda byte-identica (`pg_get_functiondef` antes/despues).
10. Un plan sin reemplazos se comporta exactamente igual que hoy (cero filas nuevas, cero llamadas nuevas).
11. La opcion `needs-confirmation` (equivalencia > 3× la porcion del sustituto) **no** registra de un tap, y la `unavailable` prellena con la porcion del sustituto en su unidad.
12. La fila consumida por sustitucion muestra el chip "Sustituido" y el prescrito tachado, en web y en RN; deshacer esta disponible en ambas.
13. `student_nutrition_intake` con `method: 'substitution'` se emite en web **y** en RN.

## Riesgos y como se cubren

| Riesgo | Cobertura |
|---|---|
| Guard solo en el boundary ⇒ bypass por PostgREST | Guard en SQL (H5) + criterio 4 con JWT reales |
| `create or replace` de `record_` y `correct_` toca el hot-path de TODO el intake | Base copiada verbatim de la definicion viva; unico delta el bloque nuevo; tx-rollback con JWT reales **antes**; advisors despues; rollback documentado = re-aplicar `20260728130000` |
| El fix de H3 afloja el tope de cantidad | El aflojamiento es **solo** para `source = 'substitution'`; para el resto del intake el check queda intacto, y el boundary sigue aplicando el tope contra la cantidad equivalente |
| Equivalencia mal calculada mueve la adherencia | Formula pura con golden tests (incluye los pares reales de LIVE, el caso espinaca y el caso kcal 0) + criterio 3 |
| Duplicado / entry inconsumible por doble tap, undo o ciclo | `attempt` derivado del read model + criterios 5, 7 y 8 |
| Override del coach cambia entre el render y el tap | El boundary recalcula al escribir; si el resultado difiere del que el cliente mostro, **no** falla: escribe el recalculado y la UI lo refleja al refetch. El criterio 3 se verifica en la misma pasada (render → tap sin cambios intermedios) |
| Deriva web/RN | Formula y contrato en `packages/nutrition-v2`; ambos bordes consumen el mismo modulo |

## QA

- Matriz SQL con JWT reales (alumno propio, alumno ajeno, coach del pool, coach ajeno, anon) sobre las dos RPC nuevas y las dos modificadas.
- Preview web con la alumna de QA (`canRegisterFreely = false` **y** `canAdjustPrescribedQuantity = false`, que es la combinacion real en LIVE): registrar · doble tap · sustituir sobre item ya registrado · deshacer y re-registrar · ciclo A→B→A · opcion `needs-confirmation`.
- Device fisico Android: mismo guion + modo avion (la cola offline tiene que reintentar con la MISMA clave).
- Verificacion en DB de cada caso (no se declara verde por pantalla).

## Correcciones aplicadas tras la revision adversarial (2026-08-09)

| # | Que decia | Que dice ahora |
|---|---|---|
| B1 | D3 sin mencionar el guard de cantidad | H3 documenta el bloqueo real (3 de 6 versiones publicadas) y F2 incluye el fix en `correct_` |
| B2 | `attempt` sin definir | `attempt` = entries de hoy del item en cualquier estado; cubre undo y ciclo A→B→A; sin `deviceId`; viaja en el payload |
| B3 | "el alumno no puede leer los overrides" (falso) | La RPC se justifica por round-trip, merge unico y resolucion de version |
| B4 | Version por selector determinista | Version del **snapshot del dia** primero, selector como fallback |
| B5 | Equivalencia sin cota; `unavailable` prellenado con la cantidad del item | Tope de 3× ⇒ `needs-confirmation`; `unavailable` prellena con la porcion del sustituto |
| R1/R2 | Criterio 4 sonaba a seguridad total | Seccion "Que NO cubre el guard" |
| R5 | "5 publicados + 2 superseded" | 5 alumnos en total (los 2 estan dentro) |
| R6 | 2 consumidores de `computeNutritionAdherence` | 7 superficies, todas V1 |
| R7 | `intake-units.ts` "respeta macrosBasis" | La base vive en `catalog.ts`/`food-overrides.ts`; `intake-units.ts` aporta el factor de unidad |
| R8 | Guard sin decir si aplica al coach | Aplica tambien al coach |
| R9 | `quantity` no nula asumia `unit` no nula | Fallback a la unidad natural del sustituto |
| R11/R12 | Promesas sin criterio | Criterios 7, 8, 11, 12 y 13 |
