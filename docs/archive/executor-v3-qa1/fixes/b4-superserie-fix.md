# Fix B4 — Superserie (hero activo + "Sigue sin detenerte")

Unidad: b4-superserie. Rama fix/executor-v3-qa1. tsc web y mobile: 0 errores tras los cambios.

## Requerimiento CEO (2026-07-22) — cumplido

1. **Miembro ACTIVO = ejercicio solo.** Web y RN: el activo ahora muestra badge de letra + "Ahora",
   nombre grande, chip tipo·músculo, **media 150px + chips glass** (componente compartido), prescripción,
   fila **"Anterior" 1-tap** y la **captura HERO** (web `heroV3`, RN `ActiveSetRow heroMode`), sólo la
   serie de la RONDA actual. El guardado por-miembro y el orden de ronda no se tocaron.
2. **No activos colapsados.** Tarjeta compacta: mini-media 60px + badge letra 30px + nombre + rx + estado.
3. **Aviso "¡Sigue sin detenerte!"** overlay efímero (fondo `rgba(8,8,12,.72)`, texto de marca 28-32px/900
   con glow + nombre del siguiente), auto-dismiss ~1,4 s, `pointer-events:none`. Se dispara SOLO cuando
   queda miembro en la MISMA ronda (`nextInRound`/`nextMemberId != null`) envolviendo `onLogged`/`onCommitSet`
   (payload byte-idéntico). NO aparece al cerrar la ronda. Contrae/expande: web animación de altura
   (`grid-template-rows 0fr→1fr`, curva `cubic-bezier(.4,0,.2,1)`, se re-reproduce por `key=block.id`);
   RN `CARD_LAYOUT`/`LinearTransition` ya presente. Reduced-motion: sin contracción, aviso como fade.

## Extracción (refactor puro, motor intacto)

- **Web:** nuevo `v3/ExecMediaCard.tsx` (media 150px + chips glass + sheet de nota). `ExerciseStepV3` y
  `SupersetStepV3` (miembro activo) lo consumen. `ExerciseStepV3` conserva su set-list/pie/estado.
- **RN:** nuevo `v3/ExecMediaV3.tsx` (media + shimmer + `GlassChip` + `ExecMediaInnerV3` + sheet de nota).
  `ExerciseScreenV3` y `SupersetScreenV3` (activo) lo consumen; se removieron las funciones y estado ya
  extraídos de `ExerciseScreenV3` (imports limpiados).

## Deltas informe 07 cerrados

- D1 (web): flecha "Sin descanso" animada — `@keyframes exec-v3-ss-arrow`/`-arrowline` 1.6s (reduced-motion off).
- D2 (web): dot de ronda activo late — `@keyframes exec-v3-ss-beat` 1.4s.
- D3: reflow — web animación de altura del cuerpo activo; RN `LinearTransition`.
- D5 (web): mini-media 56→**60px**.
- D6 (RN): badge de letra 26→**30px**, fontSize 13→**15**.
- D7 (RN): tarjeta no-activa `#1a1a22`→**`#17171f`** (paridad web).
- D8 (RN): tinta sobre acento = `exec.accentText` (regla white-label; ya correcto, se conserva).
- D10: estado "Hecho" unificado — **ícono Check** en web (antes texto) y RN.
- D11: botón técnica/sustitución se mantiene; web `exec-v3-extech` reestilizado a **chip glass**
  (`rgba(8,8,12,.6)` + borde `rgba(255,255,255,.16)`); RN chips ya glass.

## White-label

Texto del aviso y glow usan `var(--exec-brand)` (web) / `exec.accent` + `exec.accentText` (RN). Sin
`#072100`/`#062100` hardcodeado. Ejecutor dark-only, zonas FC intactas.

## Notas / paridad

- RN antes renderizaba `SetRow` inline para el miembro HECHO de la ronda; web nunca lo hizo. Para paridad,
  el miembro hecho ahora es tarjeta compacta tappable (`onOpenSet`); el `SetRow` de resiliencia sólo se
  monta si hay `syncError` (se conserva el retry). No cambia guardado/cola.
- La media grande + hero crecen la pantalla del activo; validar scroll en device QA.

## Pendiente

- Device QA (CEO): scroll con media 150px + hero, animación de expansión real, aviso en superserie viva.
- Contexto: worktree compartido con workers en paralelo (sustitución/técnica) tocando `WorkoutExecutionClient`
  y `ExerciseStepV3`; el merge quedó limpio (tsc 0) al cierre de esta unidad.
