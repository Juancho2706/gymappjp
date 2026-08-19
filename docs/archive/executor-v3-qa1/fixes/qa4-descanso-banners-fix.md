# QA4 — Descanso flotante + snackbar serie + banners con X

Unidad `qa4-descanso-banners`. Rama `fix/executor-v3-qa1`. Sin commits. Motor de descanso INTOCABLE
(solo capa de presentacion). V2/legacy byte-identico. Dark-only. Espejo RN completo.

## Hallazgo 1 — Pildora de descanso pegada ("DESCANSO ¡A entrenar! 0:00")

La pildora del descanso existe SOLO mientras el alumno descansa. Antes, en V3 al llegar a 0 el
interstitial COLAPSABA a la barra compacta y esa barra PERSISTIA para siempre mostrando "0:00".

Fix (misma capa UI, web + RN): al llegar a 0 se muestra "¡A entrenar!" ~1.5s y el descanso se
AUTO-DESCARTA con salida suave. "Saltar"/cerrar la ronda = descarte inmediato (ya cableado). El motor
de tiempo/alarma (`RestTimer` countdown / `useRestTimerEngine`) NO se toca: solo se retira la presentacion
via el `onClose`/`close` existente (el provider desmonta y el AnimatePresence anima la salida).

- Web `RestTimer.tsx`: nuevo estado `leaving`. Reemplazado el efecto "done→minimize (barra pegada)" por
  "done→`leaving` a los 1.5s (700ms reduced-motion)→`onClose()` tras la animacion (~320ms)". Se resetea
  `leaving` al re-disparar un descanso. El interstitial y la barra compacta se renderizan condicionados a
  `!leaving` dentro de su `AnimatePresence` para que dispare el `exit` (fade/slide) antes de desmontar.
- Web `v3/RestInterstitialV3.tsx`: nueva prop `leaving`; el `motion.div` raiz pasa a render condicional
  (`{!leaving && ...}` con `key`) para que su `exit` (opacity/scale) reproduzca.
- RN `timers/RestTimerHost.tsx`: efecto que al `engine.done` llama `engine.close()` a los 1.5s. El
  `AnimatePresence` (moti) de `TimerProvider` ya anima la salida de la barra y del interstitial (ambos
  tienen `exit`). `useRestTimerEngine` NO tocado.

## Hallazgo 2 — Snackbar "Serie registrada — Deshacer"

Eliminada en modo V3 (el alumno corrige despues con el lapiz o desde la tarjeta ya hecha). V2 la conserva
byte-identica. La logica de `reopenSignal` (web) y los botones "Deshacer" de cada card (RN) NO se tocan.

- Web `WorkoutExecutionClient.tsx`: el `toast('Serie registrada', { action: Deshacer })` ahora se gatea
  por `!execV3Active` (antes solo `strength`). `reopenSignal` intacto.
- RN `v3/ExecutorV3.tsx`: removido el `toast.success('Serie registrada')` (archivo es V3-only; V2 vive en
  `ExecutorV2.tsx`, intacto). Import `toast` retirado (quedaba sin uso; `setToastDark` se mantiene).

## Hallazgo 3 — Banners "Editando registros del {dia}" / "Recuperando: {dia}" con X

Agregada X para descartar (estado LOCAL por sesion; solo visual — NO cambia la semantica de guardado:
`targetDate` sigue guardando en esa fecha, `recoverDate` sigue siendo el pendiente de la semana).
Estilo de la X: 16px, tono atenuado (#8f8f9c en la franja neutra; ink oscuro sobre el ambar solido),
hover/press aclara.

- Web `WorkoutExecutionClient.tsx`: estados `editBannerDismissed` / `recoverBannerDismissed`; los dos
  banners se gatean por `&& !…Dismissed` y llevan un boton X.
- RN `ExecutorV3.tsx`: estado `bannerDismissed`; el `RecoveryBanner` se gatea y recibe `onDismiss`.
- RN `RecoveryBanner.tsx`: nueva prop opcional `onDismiss` → renderiza `DismissButton` (X). Solo V3 la
  pasa; `ExecutorV2.tsx` la omite → banner V2 byte-identico (sin X).

## Verificacion
- `pnpm --filter web exec tsc --noEmit` → 0 errores.
- `pnpm --filter @eva/mobile exec tsc --noEmit` → 0 errores.

## Notas
- No se cableo un dismiss extra por "cambio de paso con descanso activo aun contando": el bug reportado
  (pildora pegada en 0:00) queda cubierto por el auto-descarte; el avance real de serie ya corta el
  descanso via `cancelRest`/remonta uno nuevo. Wirear el descarte por swipe de paso exigiria tocar el
  acoplamiento de tiempos start-rest/auto-avance (riesgo sobre el motor) — no se hizo por disciplina de
  alcance.
