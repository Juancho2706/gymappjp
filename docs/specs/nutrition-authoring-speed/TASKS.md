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

## F1 — Gramatica destructiva unificada (sin DB)

- [ ] `RESTORE_SLOT` en el reducer, espejo de `RESTORE_ITEM`: idempotente + indice de reinsercion
- [ ] Tests puros del reducer: borrar y restaurar deja la franja en su posicion original; restaurar
      dos veces no duplica
- [ ] Wizard (`SlotEditor.tsx:135-139`): borrar pasa a optimista + Deshacer 5-8 s
- [ ] Quick-edit (`EditableSlotCard.tsx:237-243`): muere `confirmingDelete`, mismo Deshacer
- [ ] Inventario de gestos destructivos del modulo V2 (dia, franja, item, sustitucion, plantilla) y
      su estado, pegado aca como tabla

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
