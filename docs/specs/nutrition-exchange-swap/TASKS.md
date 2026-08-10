# TASKS — T2.5 Intercambio: sheet de dos bloques + swipe

Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) · `[!]` bloqueado (se anota por que).

## Fase 0 — Especificacion

- [x] Auditoria contra HEAD y LIVE (2026-08-10). Numeros que reordenan la tanda: **882 items / 36 alumnos**; solo **15** con reemplazo del coach; **832 (94%)** con grupo usable; **817** que solo tendrian el bloque grupo; **50 (5,7%)** quedarian fijos
- [x] Verificado que `exchange_portion_grams` **no sirve** como criterio de equivalencia. Recalculado sobre la poblacion entera (696 alimentos del grupo C): mediana **16,7%**, p90 **69%**, **64%** diverge mas de 10%. *(La primera version citaba 121/91/182/182 g y un maximo de 73%: esos numeros no reproducian.)*
- [x] Verificado que `exchangeFoods` del Today **no sirve** como fuente: viaja solo con targets de porciones y los tiene **1 de 38** alumnos
- [x] Verificado el tamano de los grupos (C=716, P=606, LAC=405, **SP=52**) ⇒ **buscador y paginado obligatorios**; solo **2 de 2.526** clasificados no tienen kcal usable
- [x] Verificado que `canSubstitute` esta en `true` en **4 de 38** versiones vigentes, que **32 de 38** no permiten registro libre, y que **ningun camino lo lee ya desde T2.4**
- [x] Verificado que no hacen falta dependencias nuevas: `framer-motion ^12.38.0` en la raiz (web) y `gesture-handler ~2.28` + `reanimated ~4.1` en mobile
- [x] Decisiones del owner D1-D3 (`canSubstitute` no gatea · candado derivado con copy honesto · sheet antes que swipe)
- [x] SPEC / PLAN / TASKS escritos
- [x] **Revision adversarial del plan ANTES de codigo** (protocolo T2.4) — 8 bloqueantes
- [x] Los 8 bloqueantes re-verificados a mano contra LIVE (B1 con probe + rollback: `42725 function is not unique`)
- [x] Correcciones incorporadas a SPEC y PLAN
- [x] **D4 del owner: ocultar.** Retirada la pill "Puede sustituir" de quick-edit web y RN. El checkbox del builder **ya no existia** (poda de la ola 3, web y RN): la revision lo daba por vivo
- [ ] Commit de la fase 0 con `pnpm docs:check` verde

## F0 — Equivalencia del grupo + contrato

- [x] `origin: 'coach' | 'group'` en el schema de opcion, con **`schemaVersion` intacto en 1** y `.default('coach')` para la ventana F0→F2
- [x] `describeSubstitutionDelta` (pin 3): "mismas kcal" (<5%) / "+2 g proteina" / "−15 kcal"
- [x] Clave de idempotencia del grupo con namespace **`gf-{foodId}`** + test de no-colision entre namespaces
- [x] `queuedAhead` en la clave, para el ciclo A→B→A sin red (bloqueante B5)
- [x] La equivalencia NO cambia: el grupo usa `computeSubstitutionEquivalence` con los mismos topes
- [x] Golden tests del delta y de las claves
- [x] Gates: **37/37** del archivo · `pnpm typecheck` **exit 0** · `tsc` mobile **exit 0**

## F1 — Guard del grupo (riesgo ALTO, commit propio, DB en LIVE)

- [x] Migracion escrita: `supabase/migrations/20260810121500_nutrition_v2_substitution_group_guard.sql` (**`record_nutrition_intake_v2` NO se toca**)
- [x] Membresia por **overlay + legacy con `is_excluded`** en un helper propio `private.nutrition_v2_exchange_group_ids`, reusable por F2; y **predicado de visibilidad**
- [x] El item debe ser de una version `published`/`superseded` de un plan activo
- [x] **tx-rollback con los 10 casos: 10/10 correctos** (`1:OK 2:42501 3:42501 4:42501 5:OK 6:42501 7:OK 8:42501 9:42501 10:42501`)
- [x] Rollback del probe verificado: el helper no quedo, el guard conserva su `md5` `ead3e493…`, 0 exclusiones
- [x] **APLICADA a LIVE** con el OK del owner, registrada como `20260810161604` (el archivo local se renombro para igualarla)
- [x] Matriz re-corrida contra las funciones YA aplicadas: **10/10**
- [x] Advisors: ninguna de las dos funciones nuevas aparece (el helper no es ejecutable por `authenticated`; el guard vive en `private`)
- [x] `pg_get_functiondef` identico antes/despues: `get_nutrition_today_v2` `732f641a…`, `record_nutrition_intake_v2` `1171f2fd…`, `correct_nutrition_intake_v2` `82b14064…`, `get_nutrition_substitution_options_v2` `00f1c119…`
- [x] Sin residuos del probe: 0 exclusiones, 38 filas de sustitucion
- [x] Rollback documentado (re-aplicar `20260809230833` + `drop` del helper)

## F2 — La RPC de opciones aprende el grupo (DB en LIVE)

- [x] **`drop function ... (uuid, date)` + `create` de la firma nueva + re-emitir grants**, en una transaccion. NO `create or replace`: crea sobrecarga y deja la llamada de 2 args ambigua (`42725`, reproducido)
- [x] Verificado despues: **una sola firma**, `authenticated` ejecuta, `anon` no
- [x] Argumentos nuevos con default: `p_prescription_item_id`, `p_group_query`, `p_group_limit` (**clampeado**: pedir 9999 devuelve 50), `p_group_food_id`
- [x] `group`, `groupOptions` (membresia H6, visibilidad H7, excluye el propio food y los autorizados, orden por cercania de porcion) y `groupTotal`
- [x] Busqueda server-side con el normalizador del catalogo. **No hace falta escapar `%`/`_`**: el normalizador reduce todo lo que no sea `[a-z0-9]` a espacios, asi que los comodines no sobreviven (documentado en la migracion por si eso cambia)
- [x] `item_json` solo para la pagina devuelta
- [x] Los dos helpers de membresia (por-alimento y set-based) **verificados equivalentes sobre el catalogo entero**: 2.526 = 2.526, cero divergencias en ambas direcciones
- [x] Costo medido y corregido: la primera version costaba **106 ms** (conteo por item); la aplicada, **58 ms**, con el mismo `groupTotal` exacto (601). T2.4 costaba 8 ms y devolvia 8 items sin datos de grupo
- [x] Indices verificados presentes: `egf_group_food_owner_uq`, `egf_food_id_idx`, `foods_name_search_trgm_idx`
- [x] Matriz con JWT real: 2 args OK · item abierto pagina 20 · buscador filtra total y pagina · clamp · lookup de una opcion = 1 · opcion de otro grupo = 0 · alumno ajeno 42501
- [x] **Regresion T2.4 verificada**: la llamada de 2 argumentos devuelve los reemplazos del coach con `origin: 'coach'`
- [x] `get_nutrition_today_v2` y `record_nutrition_intake_v2` byte-identicos
- [x] Aplicada como `20260810171529`. Rollback: drop de la firma nueva + `drop` del helper + re-aplicar `20260809222811`
- [x] Contrato ampliado en `packages/nutrition-v2`: `group`, `groupTotal`, `groupOptions` con defaults, y `SubstitutionGroupOptionSchema` estructuralmente compatible

## F3 — Boundary: aceptar opciones del grupo

- [x] `groupFoodId?` como alternativa a `substitutionId`, **exactamente uno** (`superRefine`)
- [x] `queuedAhead?` en el contrato. **`.optional()` y no `.default(0)`**: con default el tipo de salida lo vuelve obligatorio y forzaria a las dos superficies a mandarlo sin tener cola
- [x] La opcion del grupo se valida con **`p_group_food_id`**, no contra la respuesta paginada
- [x] `resolveAttempt` sondea con `gf-` y **salta tambien las entries `corrected`**, no solo `voided`
- [x] **14 tests nuevos** en `substitution-intake.service.test.ts` (no existia archivo de tests del servicio): opcion del grupo OK · alimento que el servidor no reconoce ⇒ `SUBSTITUTION_NOT_AUTHORIZED` (cubre fuera-del-grupo, privado ajeno y excluido: el servidor simplemente no lo devuelve) · **hallado por buscador fuera de la pagina** ⇒ OK · los dos ids ⇒ invalido · ninguno ⇒ invalido · deshacer ⇒ clave nueva · **entry `corrected` tambien quema la clave** · entry `active` NO la quema (es reintento) · `queuedAhead` corre el attempt · rama coach intacta y sin pedir lookup
- [x] El fake sirve `groupOptions` **solo** ante `p_group_food_id`: si el boundary buscara en la pagina, los tests fallarian

## F4 — Sheet web

- [x] "⇄ N equivalentes" en la fila, en lugar de las pills (`ItemExchangeTrigger`)
- [x] Sheet con los dos bloques, delta por opcion, buscador con debounce de 250 ms y paginado de 20 hasta 50
- [x] La pagina del grupo se pide **al abrir el sheet**, no con la pantalla: `loadSubstitutionGroupPageAction`
- [x] Header del bloque grupo dice "mismas calorias", **no** "1 porcion"
- [x] Candado: sin ⇄ y copy honesto (**no** "tu coach lo fijo")
- [x] El sheet vive fuera de `DialogState`: el dialogo de confirmar cantidad se abre ENCIMA y cancelar vuelve a la lista
- [x] D4 ya cerrada en su propio commit (`86f665e5`)
- [x] Gates: `pnpm lint` exit 0 · typecheck exit 0 · tokens 86/86 · boundaries 328 · 65/65 de los tests tocados

## F5 — Sheet RN + señal offline

- [x] Paridad con el sheet web: dos bloques, buscador, paginado, mismo copy y mismo candado
- [x] **Fila optimista con chip "En cola"** al encolar sin red — el reparo heredado de T2.4
- [x] `preview` en el ITEM de la cola, **no en el payload**: datos locales que nunca se envian; sin el, el overlay sigue sin pintar nada (colas viejas)
- [x] **Bump del `attempt` por gesto encolado** (`queuedAhead`) + test del ciclo A→B→A offline
- [x] 🔴 El test de T2.4 pillo una regresion: deduplicar por opcion sola perdia en silencio el "deshacer + volver a registrar" con `attempt` refrescado. Ahora dedupe exige **misma opcion Y mismo intento**
- [x] Gates: `tsc` mobile exit 0 · `pnpm lint` exit 0 · **151/151** de los 5 archivos tocados

## F6 — Swipe (web + RN)

- [x] Web con `framer-motion` (`drag="x"`), RN con gesture-handler + reanimated. Cero deps nuevas
- [x] Eleccion en `packages/`: `swipeApplicableOptions` + `swipeOptionAt`, con 8 tests. Las dos superficies eligen igual por construccion
- [x] Salta las opciones que exigen confirmar y la ya registrada
- [x] 🔴 **Correccion a la SPEC**: el swipe NO aplica opciones del GRUPO. Su "primer resultado" lo elige el algoritmo entre cientos y el alumno nunca lo vio; aplicarlo a ciegas registraria algo que no decidio. Un item sin reemplazos del coach **abre el sheet** al deslizar
- [x] Toast con deshacer 6 s (heredado de T2.4) · swipe repetido cicla en redondo
- [x] Respeta `prefers-reduced-motion` (web) y "reducir movimiento" (RN): el resorte se apaga, **el gesto no**
- [x] RN: `activeOffsetX`/`failOffsetY` para que el scroll vertical gane
- [x] Gates: lint 0 · typecheck web y mobile 0 · tokens 86/86 · boundaries · **184/184**

## F7 — QA y cierre

**Escenario ya montado** (no hace falta sembrar nada). Catalina (`ba265b0b`), dia de hoy: **21 items**, todos con grupo. Sopa PREMIUM y Avena en **grupo C con 705 equivalentes**, Pechuga de Pollo en **grupo P con 601-602**. Coach options: la mayoria en 0, una Avena con 1, y las Pechugas con 1 o 2 — o sea que conviven en la misma pantalla el item que **solo** tiene grupo (el 98% del caso real) y el que tiene los dos bloques.

- [x] Preview desplegado: `gymappjp-git-rnmobiledenuevo-juancho2706s-projects.vercel.app`
- [x] 🐞🔴 **Bug 3, el peor**: el swipe web dejaba el **hilo principal ocupado para siempre**. `dragTransition={{ bounceStiffness: 0, bounceDamping: 0 }}` (mi forma de apagar el rebote con "reducir movimiento") es un resorte sin fuerza ni amortiguacion: **no converge nunca** y framer-motion sigue animando. Con tres filas, la pagina no volvia a estar idle — screenshots en blanco, `getBoundingClientRect` en ceros, navegador sin responder. Fix: `dragElastic={0}`, que es lo que de verdad quita el rebote (`fc1c779b`). El equivalente RN (`withTiming(0, {duration: 0})`) si converge y no tenia el problema
- [x] 🐞🔴 **Bug 2, el que tapaba al 1**: el read model del dia **no parseaba**. Los ids de `exchange_groups` estan sembrados a mano (`0000e8c0-…-000000000001`) y **no cumplen el RFC**; `z.uuid()` los rechaza. Como el dia se parsea de una sola vez, ese unico id tumbaba el objeto entero y `fetchSubstitutionOptionsByItem` degradaba a `{}` **sin loguear nada** — ni en el servidor ni en la consola. Ni el ⇄ ni el swipe aparecian en ninguna fila. Fix: `z.guid()` (`6ad8f294`). Reproducido local contra el payload exacto de LIVE, antes y despues
- [x] 🐞 **Bug 1, cazado a los dos minutos de abrir el preview**: las filas de Sopa PREMIUM y Avena no mostraban el control ⇄ pese a tener 705 equivalentes. El filtro del servidor web (`page.tsx`) seguia siendo el de T2.4 (`options.length > 0`); el mismo filtro lo corregi en RN durante F5 y me lo salte en web, asi que **la feature era invisible para el 98% de los items**. Arreglado en `6888599f`. Verificado por grep que no queda ningun otro filtro viejo (los demas son de sustitucion de EJERCICIOS, otro dominio)
- [x] **Verificado en el preview**: el control ⇄ aparece en las 3 filas con equivalentes y los conteos coinciden **exactos** con la RPC (Sopa 705, Avena 705, Pechuga 602); el swipe monta en esas 3 filas (3 contenedores arrastrables, 3 fondos "Cambiar", 3 disparadores para lector de pantalla)
- [ ] ⚠️ **BLOQUEADO, no verificado: abrir el sheet.** Al abrirlo, la extension del navegador deja de poder inyectar scripts ("page still loading, waited for document_idle"). **No se pudo determinar si es un cuelgue real del producto o un artefacto de la herramienta**: los logs de runtime muestran, justo despues de hidratar, una rafaga de prefetch a TODAS las rutas del alumno (`/dashboard`, `/check-in`, `/movimiento`, `/exercises`, `/nutrition`, `/bodycomp`, `/workout-history`…), que es el flood de prefetch ya conocido del repo y que explicaria que la pagina nunca quede idle para la extension. **Un humano tiene que abrir el sheet y mirar** antes de dar F7 por cerrada
- [ ] **Web** — guion: el ⇄ cuenta bien · sheet con los dos bloques · buscador filtra y cambia el total · "ver mas" hasta 50 y despues manda a buscar · elegir del grupo registra con la cantidad que mostro · deshacer · **volver a elegir la MISMA opcion** (el bug de T2.4) · A→B→A corrige sin duplicar · swipe sobre un item con reemplazo del coach aplica y cicla · swipe sobre un item **solo con grupo** ABRE el sheet · candado sin ⇄
- [ ] **Regresion T2.4 en el preview**: una sustitucion autorizada normal sigue funcionando
- [ ] **Device** (cuando vuelva el owner) — lo mismo + **modo avion**: la fila aparece con "En cola" y al volver la red drena sin duplicar
- [ ] Cada caso verificado leyendo `nutrition_intake_entries`, no por pantalla
- [ ] Acta con evidencia
- [ ] Programa padre y `docs/status/CURRENT.md` actualizados

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-08-10 | Fase 0 (SPEC/PLAN/TASKS) | `f710e0ee` | `pnpm docs:check` | Auditoria LIVE incluida; D1-D3 del owner; el orden del mockup se invierte con evidencia |
| 2026-08-10 | Fase 0 (correcciones de la revision) | `d82057b2` | `pnpm docs:check` | 8 bloqueantes incorporados, todos re-verificados contra LIVE. B1 habria roto T2.4 en produccion al aplicar F2. H2 recalculado sobre la poblacion entera. Queda D4 del owner |
| 2026-08-10 | F0 (contrato + delta + claves) | `a6c1634e` | 37/37 del archivo · typecheck web y mobile exit 0 | Sin tocar la equivalencia de T2.4. `origin` con default y `schemaVersion` en 1 para no romper las apps sin OTA |
| 2026-08-10 | F1 (guard del grupo, escrita y validada) | `0f7e8433` | matriz 10/10 en tx revertida | Commiteada sin aplicar, a la espera del owner |
| 2026-08-10 | F1 **aplicada a LIVE** + D4 | `86f665e5` | matriz 10/10 sobre lo aplicado · advisors sin clases nuevas · typecheck web y mobile exit 0 · 28/28 de quick-edit | `20260810161604` en LIVE; hot-path byte-identico. D4: se retira la pill de quick-edit en las dos superficies |
| 2026-08-10 | F6 (swipe web + RN) | (este commit) | lint 0 · typecheck web y mobile 0 · tokens · boundaries · 184/184 | El swipe no aplica opciones del grupo: abre el sheet. Correccion a la SPEC, anotada |
| 2026-08-10 | F5 (sheet RN + señal offline) | `a5996c0f` | tsc mobile 0 · lint 0 · 151/151 | Cierra el reparo abierto de T2.4: encolar sin red ya pinta la fila con "En cola" |
| 2026-08-10 | F4 (sheet web) | `5747d7ce` | lint 0 · typecheck 0 · tokens 86/86 · boundaries 328 · 65/65 | Las pills mueren; la pagina del grupo se pide al abrir el sheet |
| 2026-08-10 | F3 (boundary) | `7fb6ccbc` | 51/51 de los dos archivos · typecheck web y mobile exit 0 · `pnpm lint` exit 0 | El lookup dedicado evita el falso 42501 del buscador; `corrected` pasa a quemar clave |
| 2026-08-10 | F2 **aplicada a LIVE** | `f0d83b1d` | matriz con JWT real · regresion T2.4 verde · 37/37 del paquete · typecheck web y mobile exit 0 | `20260810171529`. `drop`+`create` porque `create or replace` habria roto T2.4. Costo 8 ms → 58 ms (la primera version daba 106 y se corrigio) |
