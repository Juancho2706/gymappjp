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
- [x] ⚠️→✅ **El sheet ABRE y funciona** — confirmado por el owner mirando la pantalla (2026-08-10). El bloqueo era **de la herramienta, no del producto**: la extension del navegador no consigue `document_idle` en esa pagina por el flood de prefetch a todas las rutas del alumno que se dispara al hidratar. 🔴 **Consecuencia para quien siga: el QA web por navegacion automatizada NO es viable en esta pantalla**; hay que pilotearlo con el owner o verificar por base de datos
- [x] **Web** — guion completo el 2026-08-10 (noche), cada caso verificado en `nutrition_intake_entries` y contra la formula del RPC replicada en SQL (detalle en el acta de abajo). Dos casos NO reproducibles con el escenario de hoy, anotados abajo
- [x] **Regresion T2.4 en el preview**: sustitucion autorizada (Espinaca 715 g, exige confirmar cantidad) registrada desde el bloque "Autorizados por tu coach" con clave `…-a3` — el bump de `attempt` tras 3 intentos previos anulados, sin colision de idempotencia
- [x] **Device** — guion completo el 2026-08-10 (noche), device fisico (Xiaomi 2406APNFAG) via adb + build debug + Metro con `EXPO_PUBLIC_API_URL` al preview, sesion de Catalina logueada por el owner. Acta abajo
- [x] Cada caso (web y device) verificado leyendo `nutrition_intake_entries`, no por pantalla
- [x] Acta con evidencia (abajo)
- [x] Programa padre y `docs/status/CURRENT.md` actualizados

### Acta del QA device — 2026-08-10 (noche), Xiaomi fisico, debug build + Metro→preview

Setup: la release instalada (vc81, apunta a PROD) se respaldo y se reemplazo por la build debug cargando el bundle T2.5 de Metro con `EXPO_PUBLIC_API_URL` al preview; gestos por `adb input`, evidencia por screenshot + DB. Al final se desinstalo la debug; la release era **split APK de Play** y el backup base-only no reinstala (`INSTALL_FAILED_MISSING_SPLIT`) ⇒ el owner reinstala desde Play.

| Caso | Resultado | Evidencia |
|---|---|---|
| Paridad del read model | ✅ | Hoy identico a web/DB: Sopa/Avena registradas, sustitucion vigente, conteos 705/705/603 y el hero recalculado |
| Sheet dos bloques | ✅ | "Cambiar Pechuga…": Autorizados (Espinaca 715 g "confirma la cantidad") + Grupo con "Buscar en 602". El alimento CONSUMIDO queda excluido de la lista y el conteo se ajusta solo (603 con Pechuga libre → 602 con Espinaca puesta) |
| Buscador | ✅ | "arroz blanco" en el grupo PROTEINAS → **"Sin resultados para 'arroz blanco'"** (empty state honesto); "atun" → lista filtrada con deltas |
| Elegir del grupo | ✅ | Lata De Atun 100 g → entry activa `substitution`, **`corrects_entry_id`→Gohan** (revision 3): corrige sin duplicar por `/api/mobile`. La fila cambio AL INSTANTE (RN ya era optimista) |
| Retirar registro | ✅ | Modal con chips de motivo (paridad web) → entry `voided` + reason; la fila volvio a "Pechuga · Lo comi" |
| **Modo avion (F5, el reparo de T2.4)** | ✅ | Avion ON: el sheet degrada honesto (coach visible sin red, grupo "No pudimos cargar los equivalentes"); confirmar Espinaca 715 g → **fila con chip "En cola"**, entry preview "Espinaca · Sin sincronizar · 715 g" visible, y chip global "1 pendiente" |
| Drenado sin duplicar | ✅ | Avion OFF + pull-to-refresh → la cola drena en el proximo `load()`: **UNA** entry activa `-a4`, cero duplicados; chips desaparecen; Verduras salto a 7,5/7,5 (+2,4) porque la Espinaca cuenta al grupo V — coherencia server |
| **Attempt cross-superficie** | ✅ | La misma sub del coach quedo `-a3` en el QA web y `-a4` en el device: el bump sobrevive el cruce de superficies sin colision |
| Swipe fisico | ✅ | Drag real hacia la izquierda sobre la fila (gesture-handler) → abre el sheet; el scroll vertical no se lo come |

**Observaciones (no bloquean, anotadas):**
- El drenado de la cola corre en el proximo `load()` (focus/refresh/registro), NO hay listener de reconexion: con red de vuelta, el "En cola" persiste hasta que el alumno vuelve a la pantalla o refresca. Es el diseño de T2.4; si molesta, un `NetInfo.addEventListener` que dispare `flushNutritionV2MutationQueue` es una tanda chica.
- La entry preview encolada se pinta bajo "Fuera del plan" (no tiene franja asignada en el preview local); la fila del item ya lleva el chip "En cola", asi que la señal principal esta — cosmetico.

### Acta del QA web — 2026-08-10 (noche), preview `gymappjp-git-rnmobiledenuevo`, sesion de Catalina

Metodo: la extension de navegador NO logra `document_idle` en esta pantalla (flood de prefetch, ya documentado), asi que todo se piloteo con `javascript_tool` sobre el DOM y **cada efecto se verifico leyendo `nutrition_intake_entries`**. La tab estuvo en background todo el QA (ver hallazgo H2).

| Caso | Resultado | Evidencia |
|---|---|---|
| ⇄ cuenta bien | ✅ | Sopa 705 · Avena 705 · Pechuga 602; el **705** y el **77 filtrado** reproducidos EXACTOS replicando la formula del RPC en SQL (716 crudos − propio − subs del coach − 2 sin kcal/propiedad). Tras retirar la Espinaca, el conteo de Pechuga paso solo a **603** (coach 1 + grupo 602): consistente |
| Sheet dos bloques | ✅ | Pechuga: "Autorizados por tu coach" (Espinaca 715 g, "confirma la cantidad") + "Grupo Proteinas (bajo grasa)". Sopa (solo grupo): un solo bloque |
| Buscador filtra y cambia el total | ✅ | "arroz": placeholder pasa de "Buscar en 705" a "Buscar en 77"; lista filtrada. "arroz blanco": 5, cuadra 1:1 con la DB |
| "Ver mas" | ✅ | 20 → 40 → 50 (tope) y aparece "Hay 705 en total. Usa el buscador para encontrar el tuyo" |
| Elegir del grupo registra la cantidad mostrada | ✅ | Arroz Blanco (cocido) "20 g" → entry `substitution` activa, `quantity=20 g`, clave `subst-…-gf-<foodId>-a0` |
| Deshacer (Retirar registro) | ✅ | Entry → `voided` con `correction_reason` "Lo registré por error". El toast de deshacer de 6 s no se alcanzo a capturar con la herramienta (expira entre llamadas); el camino generico de retiro quedo verde |
| **Volver a elegir la MISMA opcion** (bug T2.4) | ✅ | Nueva entry activa con clave `…-a1`; la `-a0` anulada intacta. Sin choque, sin duplicado |
| A→B→A corrige sin duplicar | ✅ | Cadena completa en DB: A(`-a1`, corrected) ← B(Integral, corrected, `corrects_entry_id`→A) ← A′(activa, `revision 3`, clave `-a2`). **Un solo activo** en todo momento |
| Swipe sobre item **solo con grupo** ABRE el sheet | ✅ | El boton sr-only comparte el `onSwipe` del gesto (mismo codigo por construccion); sobre la fila de Sopa abrio el sheet con 705 |
| Swipe con reemplazo del coach **aplica y cicla** | ⚠️ no reproducible hoy | La UNICA sub del coach de hoy (Espinaca 715 g) **exige confirmar cantidad** ⇒ `swipeApplicableOptions` la salta A PROPOSITO y el gesto abre el sheet (verificado que eso hace). El camino "aplica a ciegas" queda cubierto por los tests de `packages` (184/184) y por el propio diseño: solo 15 items en toda la base tienen subs aplicables |
| Candado sin ⇄ | ⚠️ no reproducible hoy | Los 21 items del dia tienen grupo ⇒ ninguno con total 0. El candado es derivado (total 0 → sin trigger); sin item que lo gatille no hay que verificar en esta pantalla |
| Gesto de arrastre real (visual) | 👁️ owner | El drag de framer-motion no se puede simular con fidelidad desde el DOM; el sr-only ejercita el mismo handler. Pedida verificacion visual de 1 minuto |

**Hallazgos nuevos (no bloquean el cierre, decidir si se arreglan en T2.5):**

1. 🐞 **H1 — El buscador no encuentra nombres con parentesis**: `food_catalog_v2_normalize_text` le quita los parentesis al QUERY pero `foods.name_search` los conserva. "arroz blanco (cocido)" (el nombre EXACTO del alimento) normaliza a `arroz blanco cocido` y da **0 resultados**; "arroz blanco cocido" tambien 0. Reproducido en SQL: `name_search like '%arroz blanco cocido%'` → 0 filas. Fix natural: normalizar `name_search` con la misma funcion (backfill de catalogo, no es de esta feature; el mismo sintoma existe en cualquier buscador que use ese par).
2. 🐞→✅ **H2 — La UI espera al server: cada gesto tarda segundos en verse (CONFIRMADO por el owner con la pantalla a la vista, y ARREGLADO)**. El QA automatizado lo vio primero con la tab en background (ahi el throttling de Chrome lo empeora hasta "un paso atras permanente"); el owner despues lo confirmo usandolo a mano: "Lo comi", retirar y sustituir registran bien en el server (verificado por DB: sus tres gestos de las 20:07-20:08 quedaron todos) pero la fila no cambia hasta que vuelve el `router.refresh()` — medido: ~1,4-1,7 s solo el re-render del RSC + la server action antes. **Fix: capa optimista con `useOptimistic` sobre el read model** (patron que las porciones ya usaban): el gesto se pinta al instante, el refresh trae la verdad y una accion fallida revierte sola. Cubre "Lo comi" (item y franja completa), registro libre, retirar, editar cantidad, sustituir (sheet y swipe) y los deshacer. Reducer + builders **puros y testeados** en `nutrition-today.logic.ts`. Gates: 60/60 del archivo · typecheck exit 0 · lint 0 errores · tokens 86/86 · boundaries 331. RN no lo necesita: su cola offline ya pinta optimista desde F5.

3. ❓ **D5 (decision del owner, pregunta suya del QA): como se entera el alumno de que puede deslizar.** La SPEC lo deja EXPLICITAMENTE como atajo: el camino descubrible es el control visible "⇄ N equivalentes" y el swipe "es mas rapido que apuntarle al control chico" — ninguna pista de descubrimiento esta estipulada. Opciones si se quiere enseñar: (a) micro-animacion one-shot la primera vez que el dia tiene filas intercambiables (la fila se asoma ~24 px mostrando el fondo "Cambiar" y vuelve, respetando reduced-motion), (b) una linea de copy en el sheet ("tip: tambien puedes deslizar la fila"), (c) nada — el ⇄ ya cubre el 100% de la funcionalidad. Sin decidir, no se implementa nada.

**Estado de los datos**: al cierre del QA automatizado el dia de Catalina quedo IGUAL al baseline (Espinaca activa sobre Pechuga · Avena activa · Sopa sin registro activo). Todo el rastro del QA quedo como entries `voided`/`corrected`, que es el diseño (nunca delete). El owner despues siguio probando a mano (Sopa "Lo comi" · Gohan Teriyaki · porcion de Verduras, 20:07-20:08) — todos llegaron bien a la tabla.

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-08-10 | **F7 QA web + device — T2.5 CERRADA en QA** | (este commit) | Cada caso verificado en DB · docs:check | Queda SOLO la decision del owner: merge a master + OTA android. Fix H2 (`5139b29e`, UI optimista web) incluido y pusheado al preview. H1 (buscador vs parentesis) y D5 (pista del swipe) quedan como decisiones abiertas |
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
