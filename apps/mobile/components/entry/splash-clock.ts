/**
 * Reloj del arranque, aislado en un helper con nombre.
 *
 * Existe por `react-hooks/purity`: leer `Date.now()` en fase de render esta prohibido —con
 * razon, en general—, pero las semillas de un `useRef` / `useSharedValue` son estables DE
 * HECHO (esos hooks solo consumen su argumento en el primer render). La regla no puede
 * saberlo; cruzando el limite de modulo la lectura queda declarada como lo que es: una
 * marca de tiempo deliberada y de un solo uso, no un calculo de render.
 *
 * (Vivia en `splash-sweep.ts`; sobrevivio al retiro de la coreografia «Glide» porque el
 * gate lo usa para su t0 con independencia de cualquier animacion.)
 */
export function splashClockNow(): number {
  return Date.now()
}
