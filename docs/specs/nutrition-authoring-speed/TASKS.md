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
- [ ] Inventario de gestos destructivos del modulo V2 (dia, plantilla, sustitucion) y su estado —
      franja e item ya verificados en esta fase

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
- [ ] **Menu de la FRANJA (`CopySlotMenu`): pendiente.** Ojo, no es el mismo gesto:
      `COPY_SLOT_TO_VARIANTS` ya empareja por NOMBRE (reemplaza la franja homonima del destino o la
      agrega al final), asi que "reemplazar vs sumar" ahi significa otra cosa que en el dia y
      necesita decision del dueño antes de tocarlo
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
- [ ] Falta verificar el tercer camino: memoria del coach cayendo sobre un alumno DISTINTO

## F5 — Notas visibles en el wizard

- [ ] Campo en el paso del plan, espejo del de quick-edit (mismo limite y copy)
- [ ] "Rehacer" deja de resetear `visible_notes` (deuda PR #174), con test de regresion

## F6 — Paridad RN y cierre

- [ ] Paridad RN de lo que aplique al builder movil; lo que no cruce, declarado en
      `docs/status/MOBILE_PARITY.md`
- [ ] QA en device fisico Android (el dueño la corre)
- [ ] OTA android `--platform android` propuesto al dueño

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|-------|------|--------|-------|-------|
| 2026-08-12 | F0 | (este commit) | docs:check | Auditoria + D1/D2 + los tres documentos. El enunciado del programa padre quedo corregido en la SPEC: la pieza destructiva es agregar undo de franja, no borrar un confirm. |
| 2026-08-12 | F1 | cfb5a8f5 | tsc web ✓ · eslint 3 archivos limpio ✓ · vitest builder 87/87 (2 nuevos) ✓ · vitest quick-edit 77/77 ✓ · boundaries 335 ✓ | El wizard borraba la franja entera sin confirm NI undo; quick-edit tenia undo pero ademas confirmaba. Los dos convergen: la accion ocurre y hay Deshacer de 8 s que restituye en el indice original. QA en navegador: pendiente. |
| 2026-08-12 | F2 (dia) | e03043a3 | tsc web ✓ · eslint 5 archivos limpio ✓ · vitest 119/119 (16 nuevos de copy-plan + 3 de APPEND) ✓ · boundaries 337 ✓ | Quick-select "proximos 1/2/4" + modo Sumar en el menu del dia, con el aviso previo servido por el modulo puro. Queda el menu de la FRANJA, que no es el mismo gesto: ahi la copia ya empareja por nombre. QA en navegador: pendiente. |
| 2026-08-13 | F3 + F4 + QA preview | c7f4e3e1 · faeb8b01 · 81fcd6b5 · 55380334 | tx-rollback ✓ · advisors sin hallazgos propios ✓ · EXPLAIN Index Scan 0,079 ms ✓ · tsc web ✓ · eslint ✓ · vitest 106/106 ✓ · boundaries 340 ✓ · QA en preview con evidencia en DB ✓ | El QA en preview cazo DOS bugs que los gates verdes no veian, los dos escondidos por el `catch` mudo del best-effort: (1) el upsert de PostgREST daba 403 porque arma el DO UPDATE SET con TODAS las columnas del payload, incluidas las que a proposito no tienen grant de UPDATE ⇒ la escritura paso a RPC guardada; (2) la accion usaba el limitador `coach-write`, el mismo de publicar, y se disparaba en cada blur ⇒ paso al laxo y solo viaja si la cantidad CAMBIO. Pendiente: responsive 390 px y el tercer camino de precedencia. |
