# QA4 — Movilidad / Roller / Cardio + tipados (unidad qa4-movilidad-roller-tipados)

Rama `fix/executor-v3-qa1`. NO commits. tsc web y `@eva/mobile` en verde (0 errores).

## Hallazgo 1 — Movilidad: auto-llenado del hold
- **Web**: `LogSetForm.tsx` — nueva prop aditiva `holdPrefill { holdSec, leftSec, rightSec, nonce }` +
  efecto uncontrolled en `TypedLogSetRow` que vuelca los segundos en `holdRef` / `holdLeftRef` /
  `holdRightRef` al cambiar `nonce` (mismo patrón que `typedPrefill`/`suggestedAvgHr`; NO toca submit/Zod).
  `MobilityStepV3.tsx` — al completar el hold (`onDone`) o al tocar "Listo este lado"/"Listo", registra lo
  sostenido (`heldSecondsNow`: completado ⇒ objetivo; detenido antes ⇒ transcurrido) y lo empuja a la fila
  activa. El alumno sólo revisa y da al check.
- **"Sostén" removido** del centro del anillo (web + RN `MobilityScreenV3`): el centro queda con el número
  (+ affordance de tap); el estado vive en la pastilla de lado y el "luego: …" de abajo.
- **RN**: ya volcaba lo cronometrado vía `holdSeedValues`/`seedValues` (ya cumplía); sólo se removió "Sostén".

## Hallazgo 2 — Anillos: icono Play/Pause invisible
- **Web**: el glifo suelto pegado abajo (`.exec-v3-hold-icon` `position:absolute; bottom:14px`) se movió
  DENTRO de la columna central (`.exec-v3-holdtxt`), justo bajo el número, 18px color `#b7b7c2`. Aplica a
  `MobilityStepV3` (hold) y a los dos anillos de `CardioStepV3` (continuo + intervalo). CSS actualizado a
  `display:flex; margin-top:6px` + `svg { 18px }`. Texto "TOCAR PARA INICIAR" conservado.
- Sólo esos 2 archivos usan `.exec-v3-hold-icon` (sin colateral). `RestInterstitialV3` (descanso) NO usa esa
  clase ni tiene el glifo — fuera de alcance de esta unidad.
- **RN**: los anillos de movilidad/cardio no son tappables in-ring (el tap vive en el JuicyButton/PauseButton
  de abajo) → el affordance ya es visible; ya cumplía.

## Hallazgo 3 — Roller
- **(a/b)** Se quitó el "−1" chico de abajo. Fila de DOS botones (cada uno `flex-1`, GOTCHA: jamás dos w-full):
  "+1 pasada" héroe (juicy, 92px web / 72px RN) + "−1 pasada" DESTRUCTIVO rojo (`var(--zone-z5)` #f87171,
  juicy-ghost: borde 2px rojo 55%, fondo rojo 14%, texto rojo, sombra dura roja, se hunde al presionar).
  CSS web: `.exec-v3-rollbtns` + `.exec-v3-minusred`; `.exec-v3-plusbtn` pasó de `width:100%` a `flex:1`.
- **(c)** El número gigante es editable como los tiles de fuerza: **tap = teclado** (reusa
  `useWorkoutKeypad` con un solo campo "Pasadas" apuntando a un input oculto; listener nativo `input` →
  estado), **mantener = rueda**. La rueda reusa la mecánica existente vía un componente HERMANO aditivo
  `SingleWheelPicker` (web + RN) en `DualWheelPicker.tsx` — la rueda dual queda intacta. Gate por puntero
  grueso (igual que fuerza); desktop usa +1/−1 y la fila.
- **(d)** Avisito descartable la primera vez ("Tocá el número para escribirlo · mantené para la rueda") con
  X, carril propio: web `localStorage eva:roller-hint-v1`; RN `AsyncStorage eva:roller-hint-v1`.
- **RN**: `RollerScreenV3` — gesto nativo `onPress`(keypad Modal `TypedKeypad` mode=integer) / `onLongPress`
  (SingleWheelPicker). Commit `buildTypedPayload('roller', …)` INTACTO.

## Hallazgo 4 — Sin RPE/RIR en tipados (cardio/movilidad/roller) en V3
- **Web**: `LogSetForm.tsx` `TypedLogSetRow` — la escala RPE post-registro se oculta con `!v3` (los 3 tipos
  V3 pasan `v3`). Fuerza intacta; V2 tipado conserva su RPE. (Movilidad/roller ya no tenían RIR; el keypad
  tipado nunca ofreció esfuerzo.)
- **RN**: `CardioScreenV3` — se quitó el cableado `onRpeUpdate` a las `SetRow` logueadas (única vía de RPE en
  cardio). Movilidad y roller ya no pasaban `onRpeUpdate` → ya cumplían.

## Motor intocable
Sin cambios en payloads/keys/Zod/submit/cola/drafts. Todas las props nuevas son aditivas default-legacy
(uncontrolled prefill). V2 byte-idéntico. Espejo RN completo.

## Nota de merge (para el jefe)
`DualWheelPicker.tsx` (web + RN) es compartido con fuerza: sólo se AÑADIÓ un export hermano
`SingleWheelPicker` reutilizando el `WheelColumn` local; la función `DualWheelPicker` no se tocó. Si otro
worker editó el mismo archivo en paralelo, el conflicto es trivial (adición al final).
