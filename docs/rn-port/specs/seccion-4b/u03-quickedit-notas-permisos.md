# 4B-03 — Quick-edit RN: notas del plan + pills de permisos (read-only)

Archivos RN: `apps/mobile/components/nutrition-v2/quick-edit/QuickEditMode.tsx` (+ microcopy si
aplica). Disjunto de las demás unidades de la wave.
Referencia web: `QuickEditPlanView.tsx:123-159` (visibleNotes, protocolNotes, 3 pills de
permisos, hint).

## Hallazgo

El quick-edit web muestra, en modo lectura, las notas visibles del plan (`visibleNotes`), las
notas de protocolo (`protocolNotes`) y 3 pills con los permisos del alumno, además del hint.
RN (`QuickEditMode.tsx:559-566`) solo muestra `Info` + `readonlyHint`: faltan ambas notas y las
pills. Los datos ya vienen en el read-model RN (sin cambios de API).

## Cierre

1. Renderizar `visibleNotes` y `protocolNotes` con la misma jerarquía/orden/copys que
   `QuickEditPlanView.tsx:123-159` (overlines y tonos espejo, tokens del kit RN).
2. Las 3 pills de permisos con los mismos labels/condiciones que el web.
3. Sin tocar la lógica de edición, publish bar, porciones ni reemplazos (F-02 sigue diferido).

## Comprobación objetiva

Plan con notas visibles + protocolo + permisos mixtos: captura web móvil vs RN del bloque
read-only del quick-edit — mismas notas, mismas pills, mismo orden.

## Cierre (2026-07-21)

Aplicado en `QuickEditMode.tsx`: la card final de solo-lectura (antes solo `Info` +
`readonlyHint`) ahora reproduce `QuickEditPlanView.tsx:123-159` con la misma jerarquía y
orden:

1. Encabezado `LockKeyhole` (muted) + título "Notas y permisos"
   (`font-display text-base font-semibold text-text-strong`).
2. `planModel.visibleNotes` con fallback "Sin indicaciones visibles."
   (`text-sm leading-6 text-text-body`); `RN Text` conserva saltos de línea, sin equivalente
   de `whitespace-pre-wrap`.
3. `planModel.protocolNotes` solo si existe (`text-xs leading-5 text-text-muted`).
4. Las 3 pills en el mismo orden y condiciones que el web
   (`canRegisterFreely` → "Registro libre", `canAdjustPrescribedQuantity` → "Ajusta
   cantidades", `canSubstitute` → "Puede sustituir"); activa
   `border-primary/30 bg-primary/10 text-primary`, inactiva
   `border-border-subtle bg-surface-sunken text-text-muted`, `rounded-pill` y `text-[11px]`.
5. Hint `Info` (muted, 14px) + `readonlyHint`.

Copys nuevos centralizados en `microcopy.ts` (`QUICK_EDIT_COPY`): `notesPermissionsTitle`,
`notesEmpty`, `permRegisterFreely`, `permAdjustQuantity`, `permSubstitute`. Datos tomados
directo del `planModel` (`NutritionPlanReadModel` ya expone `visibleNotes`, `protocolNotes`
y `permissions`) — sin cambios de API, lógica de edición, publish bar, porciones ni
reemplazos. Iconos muteados vía `theme.textSecondary` (espejo del `text-muted` web).

Hallazgo: la ruta real de la referencia web es
`apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/QuickEditPlanView.tsx` (sub-dir
`_quick-edit`, no `_components`).

## Actualizacion (2026-07-26) — visibleNotes ahora EDITABLES

Las notas visibles (`visible_notes`) dejaron de ser read-only en el quick-edit (web y RN, en
paridad): `TextInput` multiline en la card "Notas y permisos", accion `SET_VISIBLE_NOTES` en el
reducer, contador de cambios normalizado (trim / '' → null), tope 8000 del contrato y publish
SIN el pisado server/cliente de la nota base (solo `protocol_notes` sigue en carry-over;
`private_notes` sigue null). Motivo: no existia NINGUNA superficie para editar la nota (el
builder "Rehacer" la resetea a null) y los coaches quedaban atrapados con la nota migrada de
V1. `readonlyHint` ahora dice "estrategia o los permisos"; `notesEmpty` fue reemplazado por
`notesLabel` + `notesPlaceholder`. Los permisos y `protocolNotes` siguen read-only. Tests:
`tests/mobile-nutrition-v2-quick-edit-notes.test.ts` (RN) y
`quick-edit-state.test.ts` / `quick-edit.actions.test.ts` (web).
