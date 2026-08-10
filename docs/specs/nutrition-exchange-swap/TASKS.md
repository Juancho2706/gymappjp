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
- [ ] **D4 del owner**: destino del checkbox "Puede sustituir" del builder (bloquea F4, no F0-F3)
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
- [ ] **APLICAR a LIVE** — pendiente a proposito: no se toca produccion con el owner ausente
- [ ] Advisors despues, sin clases nuevas
- [ ] `pg_get_functiondef` de `get_nutrition_today_v2` y de `record_nutrition_intake_v2` identicos antes/despues
- [x] Rollback documentado (re-aplicar `20260809230833` + `drop` del helper)

## F2 — La RPC de opciones aprende el grupo (DB en LIVE)

- [ ] **`drop function ... (uuid, date)` + `create` de la firma nueva + re-emitir grants**, en una transaccion. NO `create or replace`: crea sobrecarga y deja la llamada de 2 args ambigua (`42725`, reproducido)
- [ ] Verificar despues que **solo existe una** firma y que la llamada de 2 args sigue andando
- [ ] Argumentos nuevos con default: `p_group_query`, `p_group_limit` (**clampeado server-side**), `p_group_food_id`, `p_prescription_item_id`
- [ ] `group`, `groupOptions` (membresia H6, visibilidad H7, excluye el propio food y los autorizados, orden por cercania de porcion) y `groupTotal`
- [ ] Busqueda server-side con el normalizador del catalogo, **escapando `%` y `_`**
- [ ] `item_json` solo para la pagina devuelta; ordenar/paginar con join directo a `foods` + overrides
- [ ] **EXPLAIN con el grupo mas grande (C, 716)**; el indice `foods_exchange_group_id_idx` ya existe, verificar que se use
- [ ] Protocolo completo: snapshot → EXPLAIN → tx-rollback con JWT reales → aplicar → advisors
- [ ] Rollback documentado (drop de la firma nueva + re-aplicar `20260809222811`)

## F3 — Boundary: aceptar opciones del grupo

- [ ] `groupFoodId?` como alternativa a `substitutionId`, **exactamente uno** (validado en el schema)
- [ ] La opcion del grupo se valida con **`p_group_food_id`**, no contra la respuesta paginada (falsos 42501 en buscador y "ver mas")
- [ ] `resolveAttempt` sondea con `gf-` y **salta tambien las entries `corrected`**, no solo `voided`
- [ ] Tests: food del grupo OK · food ajeno ⇒ error tipado · **privado ajeno** ⇒ error tipado · **excluido por el coach** ⇒ error tipado · **hallado por buscador fuera del top-20** ⇒ OK · los dos ids ⇒ invalido · ninguno ⇒ invalido · **deshacer + re-elegir la misma opcion** ⇒ clave nueva · rama correccion intacta

## F4 — Sheet web

- [ ] "⇄ N equivalentes" en la fila, en lugar de las pills
- [ ] Sheet con los dos bloques, delta por opcion, buscador con debounce y paginado
- [ ] Header del bloque grupo **sin** "1 porcion" (es equivalencia calorica)
- [ ] Candado: sin ⇄ y copy honesto (**no** "tu coach lo fijo")
- [ ] Segun **D4**: ocultar el checkbox "Puede sustituir" del builder y su pill en quick-edit
- [ ] Gates: lint de los tocados · typecheck · tokens

## F5 — Sheet RN + señal offline

- [ ] Paridad exacta con el sheet web
- [ ] **Fila optimista con chip "En cola"** al encolar sin red (reparo heredado de T2.4)
- [ ] **Bump del `attempt` por gesto encolado** + test del ciclo A→B→A offline
- [ ] Gates: `tsc` mobile · tests mobile tocados

## F6 — Swipe (web + RN)

- [ ] Web con `framer-motion` (`drag="x"`), RN con gesture-handler + reanimated. Cero deps nuevas
- [ ] Primera opcion **aplicable de un tap**; si exige confirmacion, abre el sheet en vez de escribir
- [ ] Toast con deshacer 6 s · swipe repetido cicla
- [ ] Respeta `prefers-reduced-motion`

## F7 — QA y cierre

- [ ] Preview web y device, cada caso verificado en DB
- [ ] **Regresion explicita de T2.4** despues de F2: sustitucion autorizada desde una app sin OTA
- [ ] Acta con evidencia
- [ ] Programa padre y `docs/status/CURRENT.md` actualizados

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-08-10 | Fase 0 (SPEC/PLAN/TASKS) | `f710e0ee` | `pnpm docs:check` | Auditoria LIVE incluida; D1-D3 del owner; el orden del mockup se invierte con evidencia |
| 2026-08-10 | Fase 0 (correcciones de la revision) | `d82057b2` | `pnpm docs:check` | 8 bloqueantes incorporados, todos re-verificados contra LIVE. B1 habria roto T2.4 en produccion al aplicar F2. H2 recalculado sobre la poblacion entera. Queda D4 del owner |
| 2026-08-10 | F0 (contrato + delta + claves) | `a6c1634e` | 37/37 del archivo · typecheck web y mobile exit 0 | Sin tocar la equivalencia de T2.4. `origin` con default y `schemaVersion` en 1 para no romper las apps sin OTA |
| 2026-08-10 | F1 (guard del grupo, **escrita y validada, NO aplicada**) | (este commit) | matriz 10/10 en tx revertida | Se frena antes de tocar LIVE: es la fase que amplia autorizacion de escritura para 36 alumnos reales y no hay UI que la consuma todavia |
