# QA5 — Unidad "Pasos + anillos" (fix)

Dueño: MobilityStepV3, CardioStepV3, RollerStepV3 (web) + espejos RN (MobilityScreenV3,
CardioScreenV3, RollerScreenV3) + ExerciseStepV3/ExerciseScreenV3 (solo hallazgo 4) + timing.ts (RN) +
bloques CSS en globals.css. Motor de guardado INTOCADO; dark-only; white-label respetado.

## Hallazgo 1 — labels dentro del anillo tocaban el trazo
- Web `globals.css`:
  - `.exec-v3-holdlbl` (movilidad "Tocar para iniciar" / cardio "Restante" / "Restante en fase"):
    11px→10px, tracking .16em→.12em, + `max-width:130px; text-align:center; line-height:1.25` para
    garantizar ≥10px de aire al trazo en los 3 anillos (movilidad 214, cardio 196, intervalo 224).
  - `.exec-v3-phaselbl` (CALENTAMIENTO/TRABAJO/…): 14px→12px, tracking .2em→.12em, + max-width/center.
- RN `CardioScreenV3` IntervalHero: fase 15px/3→12px/1.4 + `numberOfLines maxWidth textAlign`;
  "Restante en fase" tracking 1.5→1.2 + numberOfLines/maxWidth. Movilidad RN ya era solo-número.

## Hallazgo 2 — TRABAJO/RECUPERA pegados al tiempo
- Web `globals.css`: `.exec-v3-cchip .exec-v3-cm` era span inline → cv y cl fluían en una línea
  ("1:30TRABAJO"). Se le puso `display:flex; flex-direction:column` (número arriba, palabra abajo) +
  `.exec-v3-cl margin-top 2px→3px`. RN ya apilaba (View=column); label marginTop 2→4 por paridad.

## Hallazgo 3 — botón "Reiniciar" lateral del anillo
- Web: nuevo `.exec-v3-ringrow` (relativa, centra el anillo) + `.exec-v3-restart` (chip glass 32px,
  RotateCcw 16px, anclado a la derecha). Añadido en MobilityStepV3 (onClick `countdown.restart`),
  CardioStepV3 ContinuousFace (`countdown.restart`) e IntervalFace (`runner.restart`). Usa el reset ya
  existente del hook — NO toca el guardado.
- RN: chip equivalente (`RingRestart` en CardioScreenV3, inline en MobilityScreenV3). Movilidad
  `countdown.restart(holdSec)`, cardio countdown `countdown.restart(durationSec)`, intervalo
  `runner.restart`. Se AÑADIÓ `restart()` a `useIntervalRunner` en `timing.ts` (RN no lo tenía; el web sí).
- Nota: en cardio por distancia (sin countdown) NO hay anillo ni restart, igual que web (paridad).

## Hallazgo 4 — fila "Anterior" fantasma con puros guiones
- Web `ExerciseStepV3` y RN `ExerciseScreenV3`: la fila ahora exige `bestPrev.weight_kg != null ||
  bestPrev.reps_done != null`; si la sesión previa no registró nada, la fila no se renderiza.
- FUERA DE MI UNIDAD: SupersetStepV3/SupersetScreenV3 tienen la misma fila "Anterior" con el mismo
  patrón `{m.bestPrev && ...}` — recomendado aplicar el mismo guard ahí (otro worker/unidad superserie).

## Hallazgo 5 — botones roller mismo tamaño, icono-only
- Web `RollerStepV3` + `globals.css`: "+" y "−" ahora icono-only (Plus/Minus 24px, strokeWidth 3),
  ambos `flex-1` y MISMA altura 72px (plusbtn 92→72, minusred 64→72, radios igualados a 22). GOTCHA
  respetado (nunca dos w-full). "+" sigue juicy marca; "−" juicy-ghost rojo z5.
- RN `RollerScreenV3`: "+" JuicyButton icono-only (Plus 24, label=""), "−" Pressable rojo icono-only
  (Minus 24), ambos altura 72 (footprint 77 con la sombra dura de 5px). Se quitaron los textos.

## tsc
- `pnpm --filter web exec tsc --noEmit` → 0 (verde).
- `pnpm --filter @eva/mobile exec tsc --noEmit` → 5 errores, TODOS en `components/VideoPlayer.tsx`
  (WebView ref typing), archivo de OTRO worker en paralelo (unidad media). Ninguno en mis archivos v3.
