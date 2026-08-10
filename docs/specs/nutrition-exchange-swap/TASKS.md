# TASKS — T2.5 Intercambio: sheet de dos bloques + swipe

Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) · `[!]` bloqueado (se anota por que).

## Fase 0 — Especificacion

- [x] Auditoria contra HEAD y LIVE (2026-08-10). Numeros que reordenan la tanda: **882 items / 36 alumnos**; solo **15** con reemplazo del coach; **832 (94%)** con grupo usable; **817** que solo tendrian el bloque grupo; **50 (5,7%)** quedarian fijos
- [x] Verificado que `exchange_portion_grams` **no sirve** como criterio de equivalencia: para 100 g de arroz, porciones vs calorias dan 105/121, 116/91, 105/182 y 158/182 g (hasta **73%** de diferencia)
- [x] Verificado que `exchangeFoods` del Today **no sirve** como fuente: viaja solo con targets de porciones y los tiene **1 de 38** alumnos
- [x] Verificado el tamano de los grupos (C=715, P=606, LAC=405) ⇒ **buscador y paginado obligatorios**, y que el **100%** de los clasificados tiene kcal usable
- [x] Verificado que `canSubstitute` esta en `true` en **4 de 38** versiones vigentes, y que **32 de 38** no permiten registro libre
- [x] Verificado que no hacen falta dependencias nuevas: `framer-motion ^12.38.0` en la raiz (web) y `gesture-handler ~2.28` + `reanimated ~4.1` en mobile
- [x] Decisiones del owner D1-D3 (`canSubstitute` no gatea · candado derivado con copy honesto · sheet antes que swipe)
- [x] SPEC / PLAN / TASKS escritos
- [ ] **Revision adversarial del plan ANTES de codigo** (protocolo T2.4)
- [ ] Correcciones de la revision incorporadas
- [ ] Commit de la fase 0 con `pnpm docs:check` verde

## F0 — Equivalencia del grupo + contrato

- [ ] `origin: 'coach' | 'group'` en el schema de opcion
- [ ] `describeSubstitutionDelta` (pin 3): "mismas kcal ±4%" / "+2 g proteina" / "−15 kcal"
- [ ] La equivalencia NO cambia: el grupo usa `computeSubstitutionEquivalence` con los mismos topes
- [ ] Golden tests del delta, con pares reales del grupo C
- [ ] Gates: tests del archivo · `pnpm typecheck`

## F1 — Guard del grupo (riesgo ALTO, commit propio, DB en LIVE)

- [ ] `create or replace private.nutrition_v2_assert_substitution_authorized`, misma firma, delta unico (**`record_nutrition_intake_v2` NO se toca**)
- [ ] Snapshot previo por `md5` de las tres funciones
- [ ] tx-rollback con JWT reales de los **7** casos del PLAN antes de aplicar
- [ ] Advisors despues, sin clases nuevas
- [ ] `pg_get_functiondef` de `get_nutrition_today_v2` y de `record_nutrition_intake_v2` identicos antes/despues
- [ ] Rollback documentado (re-aplicar `20260809230833`)

## F2 — La RPC de opciones aprende el grupo (DB en LIVE)

- [ ] Argumentos nuevos **con default** (`p_group_query`, `p_group_limit`) ⇒ los clientes de T2.4 siguen funcionando sin tocarlos
- [ ] `group`, `groupOptions` (excluye el propio food y los autorizados, orden por cercania calorica) y `groupTotal`
- [ ] Busqueda server-side con el normalizador del catalogo
- [ ] **EXPLAIN con el grupo mas grande (C, 715)**; si falta indice sobre `exchange_group_id`, agregarlo ANTES
- [ ] Protocolo completo: snapshot → EXPLAIN → tx-rollback con JWT reales → aplicar → advisors

## F3 — Boundary: aceptar opciones del grupo

- [ ] `groupFoodId?` como alternativa a `substitutionId`, **exactamente uno** (validado en el schema)
- [ ] La opcion del grupo se valida contra la respuesta de la RPC, nunca contra lo que manda el cliente
- [ ] Tests: food del grupo OK · food ajeno al grupo ⇒ error tipado · los dos ids ⇒ invalido · ninguno ⇒ invalido · rama correccion intacta

## F4 — Sheet web

- [ ] "⇄ N equivalentes" en la fila, en lugar de las pills
- [ ] Sheet con los dos bloques, delta por opcion, buscador con debounce y paginado
- [ ] Candado: sin ⇄ y copy honesto (**no** "tu coach lo fijo")
- [ ] Gates: lint de los tocados · typecheck · tokens

## F5 — Sheet RN + señal offline

- [ ] Paridad exacta con el sheet web
- [ ] **Fila optimista con chip "En cola"** al encolar sin red (reparo heredado de T2.4)
- [ ] Gates: `tsc` mobile · tests mobile tocados

## F6 — Swipe (web + RN)

- [ ] Web con `framer-motion` (`drag="x"`), RN con gesture-handler + reanimated. Cero deps nuevas
- [ ] Primera opcion · toast con deshacer 6 s · swipe repetido cicla
- [ ] Respeta `prefers-reduced-motion`

## F7 — QA y cierre

- [ ] Preview web y device, cada caso verificado en DB
- [ ] Acta con evidencia
- [ ] Programa padre y `docs/status/CURRENT.md` actualizados

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-08-10 | Fase 0 (SPEC/PLAN/TASKS) | (este commit) | `pnpm docs:check` | Auditoria LIVE incluida; D1-D3 del owner; el orden del mockup se invierte con evidencia |
