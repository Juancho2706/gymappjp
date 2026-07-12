# Fix log — directory-row-cards (verificacion adversarial)

## P1 (dato) — fallback a item en "ultima sesion"
- `apps/mobile/components/coach/directory/DirRowCard.tsx:53`
  - Antes: `const lastWorkout = pulse?.lastWorkoutDate ?? item.lastWorkoutDate`
  - Ahora:  `const lastWorkout = pulse?.lastWorkoutDate`
  - Web fuente: `apps/web/src/app/coach/clients/DirRowCard.tsx:75` `const last = pulse?.lastWorkoutDate` (sin fallback).
  - Efecto: con pulse ausente pero `item.lastWorkoutDate` seteado, RN mostraba "Hace Xd" + dot verde/amarillo; ahora `lastWorkout=undefined` -> `li={label:'—', dot:DANGER}` (L54), paridad con web (`daysSince=null` -> `lastDot(999)` DANGER).

## P2 (dead-code, misma divergencia) — grid ClientCard
- `apps/mobile/components/coach/ClientCard.tsx:53`
  - Antes: `const ll = lastLog(pulse?.lastWorkoutDate ?? client.lastWorkoutDate)`
  - Ahora:  `const ll = lastLog(pulse?.lastWorkoutDate)`
  - Web fuente: `apps/web/src/components/coach/ClientCardV2.tsx:176` `lastLogMeta(pulse?.lastWorkoutDate)` (sin fallback).
  - Fix minimo y fiel al web aunque el grid sea dead-code; elimina el mismo drift.

## No tocado
- `item`/`client` siguen usados (nombre, inicial, attentionScore, statusMeta) -> sin unused.
- Ningun otro archivo modificado.

GATE: `npx tsc --noEmit` (apps/mobile) EXIT 0.
