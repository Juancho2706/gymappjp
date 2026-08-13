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

## F2 — Copy semana (sin DB)

- [ ] Modulo puro: quick-select relativo "proximos 1 / 2 / 4" desde el dia origen + modo
      `replace | append` + conteo previo por destino
- [ ] Tests: bordes de fin de semana, dia base fuera de los relativos, destinos ocupados en los dos
      modos, conteo de franjas sumadas
- [ ] UI en `DayPlanStrip` (menu del dia) y `CopySlotMenu` (menu de la franja), consumiendo el mismo
      modulo — cero logica duplicada
- [ ] El aviso previo dice la verdad exacta en ambos modos, con el conteo real

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
- [ ] Verificacion en DB de los tres caminos de precedencia (alumno / coach / catalogo)

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
