# TASKS — T2.6 Velocidad de autoria del coach

Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) ·
`[!]` bloqueado (se anota por que).

## F0 — Documentos y decisiones

- [x] Auditoria contra HEAD con archivo:linea (2026-08-12). Dos desvios del enunciado encontrados y
      documentados en SPEC: el confirm de borrado vive en quick-edit (no en el wizard) y el wizard
      borra franjas sin confirm **ni undo**; `visibleNotes` ya viaja en el draft y solo falta la UI
- [x] Decisiones del dueño: **D1** tabla nueva `coach_food_last_qty` · **D2** anexar suma franjas
      sin pisar, con aviso previo
- [x] SPEC / PLAN / TASKS (este commit)

## F1 — Gramatica destructiva unificada (sin DB) — **CERRADA 2026-08-12 (`cfb5a8f5`)**

- [x] `RESTORE_SLOT` en el reducer, espejo de `RESTORE_ITEM`: idempotente + indice de reinsercion
      (helper `insertSlotAt`, gemelo de `insertItemAt`)
- [x] Tests puros del reducer: vuelve a su indice original y COMPLETA; doble Deshacer no duplica;
      indice fuera de rango se acota
- [x] Wizard (`SlotEditor.tsx`): borrar pasa a optimista + Deshacer 8 s, con la franja y su indice
      capturados ANTES del dispatch
- [x] Quick-edit (`EditableSlotCard.tsx`): muere `confirmingDelete` y su aviso rojo inline; ya tenia
      undo, le sobraba el confirm encima. Ventana unificada en `UNDO_TOAST_MS` (era 5 s)
- [x] Inventario de gestos destructivos del modulo V2 (2026-08-13), franja e item ya verificados:
      **dia (wizard)** = optimista + Deshacer 5 s en toast que reinserta variante y porciones
      (`PlanBuilderClient.handleRemoveVariant`) ✓ · **dia (quick-edit)** = optimista + Deshacer
      5 s (`RESTORE_VARIANT`) ✓ · **plantilla** = borrado real optimista + Deshacer que re-crea
      con el draft cacheado ANTES de borrar (`PlanTemplatesLibrary`) ✓ · **sustitucion** = chip
      removible sin undo ACEPTADO: perdida maxima un chip, recuperar = re-agregar del picker (dos
      taps); meterle snackbar seria mas ruido que riesgo

## F2 — Copy semana (sin DB) — **menu del DIA cerrado 2026-08-12 (`e03043a3`)**

- [x] Modulo puro `_lib/copy-plan.ts`: quick-select relativo "proximos 1 / 2 / 4" (da la vuelta a la
      semana; el dia base devuelve vacio porque no tiene lugar en ella) + modo `replace | append` +
      plan por destino (creado / reemplazado / anexado / afuera por tope) + `copyPlanWarning`
- [x] Tests (16): vuelta de semana, tope de 6 dias, dia base, cupo agotado, dias repetidos,
      duplicados por nombre normalizado, y que el aviso nombre distinto pisar y sumar
- [x] `APPEND_VARIANT_SLOTS_TO` en el reducer + 3 tests: suma sin tocar lo del destino, anexar dos
      veces duplica con claves distintas (`keySeed` del llamador), no-ops defensivos
- [x] UI del menu del DIA (`DayPlanStrip`): toggle Reemplazar/Sumar, chips "proximos N", y el aviso
      previo servido por el modulo (antes lo armaba la UI a ojo y solo sabia contar reemplazos)
- [x] Deshacer del modo `append`: saca exactamente las franjas sumadas y sus porciones, sin tocar lo
      que el dia ya tenia
- [x] **Menu de la FRANJA (`CopySlotMenu`) — decision del dueño: opcion A** (2026-08-13, del
      artifact con las 3 salidas): la franja gana los chips "proximos 1/2/4" en la fila de
      Atajos, que MARCAN el multi-select igual que los presets (no copian directo); la fusion por
      nombre queda intacta y NO hay toggle Reemplazar/Sumar. Helper puro `targetsForNextDays` en
      `copy-plan.ts` (+3 tests: solo marca dias que existen como variante, vuelta de semana, base
      sin "proximos"). El reducer no se toco.
- [x] QA en preview de los dos modos (2026-08-13): quick-select desde Lunes resuelve Ma / Ma,Mi / Ma,Mi,Ju,Vi; el aviso de Sumar dice "Se suman franjas a 2 dias que ya tenian contenido. Quedan franjas repetidas: POLLO"; tras confirmar, Ma y Mi pasan de 2.037 a 4.073 kcal y el origen queda intacto; el Deshacer del modo Sumar devuelve Mi de 8.146 a 4.073 sin tocar otros dias
- [ ] Responsive/PWA (390 px): PENDIENTE — el resize del navegador no llego a aplicar al viewport en esta sesion, asi que NO esta verificado

## F3 — DDL `coach_food_last_qty` (LIVE)

- [ ] EXPLAIN + tx-rollback con JWT reales ANTES de aplicar
- [ ] Migracion aditiva: tabla + unique `(coach_id, food_id, client_id)` **nulls not distinct** +
      check de rango + RLS `to authenticated` + grants por columna
- [ ] Advisors de Supabase DESPUES, sin hallazgos nuevos
- [ ] Regen de `database.types.ts` para la tabla nueva (sin arrastrar el regen completo, que es
      deuda propia del programa padre)

## F4 — Porcion pegajosa punta a punta

- [ ] Lectura con precedencia resuelta en SQL (`client_id nulls last`), repository → service →
      action, sin service-role
- [ ] Escritura en el commit del campo (blur), `on conflict do update`, best-effort: si falla, no se
      le dice nada al coach y nunca bloquea guardar
- [ ] `ADD_ITEM` precarga la cantidad y la unidad recordadas; sin memoria, cae al `servingSize` del
      catalogo (comportamiento actual intacto)
- [x] Verificacion en DB (2026-08-13): al fijar 137 g se escriben las DOS memorias (de la alumna y general del coach); al volver a agregar el alimento precarga 137 en vez del 100 del catalogo
- [x] Tercer camino verificado (2026-08-13, tx-rollback en LIVE con claims del coach real): con la
      fila de la alumna en 150 y la general en 137, la RPC devuelve 150 para la alumna (su fila
      gana) y **137 para un alumno DISTINTO** (cae a la memoria general). Rollback verificado:
      las dos filas quedaron en 137.

## F5 — Notas visibles en el wizard

- [x] Campo "Notas para tu alumno" en el paso del plan (`PlanStep`), espejo del quick-edit: mismo
      copy, mismo tope 8000 (`VISIBLE_NOTES_MAX` local al builder — no importa de `_quick-edit`
      por el boundary) y validacion en `validateStep` con el mismo mensaje. Accion nueva
      `SET_VISIBLE_NOTES` en el reducer (editar deja la clave PRESENTE: un RESTORE posterior
      respeta lo escrito, incluso el vaciado).
- [x] "Rehacer" y las notas (deuda PR #174): el carry-over ya estaba resuelto por
      `rehydrateBuilderState` + `assembleDraft` (auditoria F0) y tiene tests; lo nuevo es la
      REGRESION del camino editado: rehidratar → editar → publicar emite lo editado, y vaciar
      publica `null` sin revivir las notas del plan (2 tests nuevos en `draft-builder.test.ts`).

## F6 — Paridad RN y cierre

- [x] Paridad RN aplicada (2026-08-13): **F1** `RESTORE_SLOT` + "Quitar franja" optimista con
      Deshacer 8 s en el builder RN (`UndoSnackbar` reusado) y quick-edit RN sin el confirm que
      tenia ENCIMA del undo (ventana unificada 5 s → 8 s) · **F5** `SET_VISIBLE_NOTES` +
      validacion + campo en el paso "El plan" del builder RN. Lo que NO cruza en esta tanda
      (F2 copy semana y F4 porcion pegajosa) quedo DECLARADO con su inventario en
      `docs/status/MOBILE_PARITY.md` (entrada 2026-08-13).
- [ ] QA en device fisico Android (el dueño la corre)
- [ ] OTA android `--platform android` propuesto al dueño — 🔴 BLOQUEADO mientras iOS 1.1.0(53)
      este en App Review (canal compartido); proponerlo al salir el veredicto

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|-------|------|--------|-------|-------|
| 2026-08-12 | F0 | (este commit) | docs:check | Auditoria + D1/D2 + los tres documentos. El enunciado del programa padre quedo corregido en la SPEC: la pieza destructiva es agregar undo de franja, no borrar un confirm. |
| 2026-08-12 | F1 | cfb5a8f5 | tsc web ✓ · eslint 3 archivos limpio ✓ · vitest builder 87/87 (2 nuevos) ✓ · vitest quick-edit 77/77 ✓ · boundaries 335 ✓ | El wizard borraba la franja entera sin confirm NI undo; quick-edit tenia undo pero ademas confirmaba. Los dos convergen: la accion ocurre y hay Deshacer de 8 s que restituye en el indice original. QA en navegador: pendiente. |
| 2026-08-12 | F2 (dia) | e03043a3 | tsc web ✓ · eslint 5 archivos limpio ✓ · vitest 119/119 (16 nuevos de copy-plan + 3 de APPEND) ✓ · boundaries 337 ✓ | Quick-select "proximos 1/2/4" + modo Sumar en el menu del dia, con el aviso previo servido por el modulo puro. Queda el menu de la FRANJA, que no es el mismo gesto: ahi la copia ya empareja por nombre. QA en navegador: pendiente. |
| 2026-08-13 | F3 + F4 + QA preview | c7f4e3e1 · faeb8b01 · 81fcd6b5 · 55380334 | tx-rollback ✓ · advisors sin hallazgos propios ✓ · EXPLAIN Index Scan 0,079 ms ✓ · tsc web ✓ · eslint ✓ · vitest 106/106 ✓ · boundaries 340 ✓ · QA en preview con evidencia en DB ✓ | El QA en preview cazo DOS bugs que los gates verdes no veian, los dos escondidos por el `catch` mudo del best-effort: (1) el upsert de PostgREST daba 403 porque arma el DO UPDATE SET con TODAS las columnas del payload, incluidas las que a proposito no tienen grant de UPDATE ⇒ la escritura paso a RPC guardada; (2) la accion usaba el limitador `coach-write`, el mismo de publicar, y se disparaba en cada blur ⇒ paso al laxo y solo viaja si la cantidad CAMBIO. Pendiente: responsive 390 px y el tercer camino de precedencia. |
