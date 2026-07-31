/**
 * Guard PURO de "respuesta o plan B" para callbacks nativos que pueden no llegar nunca (QA5).
 *
 * Origen: en MIUI/HyperOS el callback de `measureInWindow` a veces NO dispara (el optimizador de vistas
 * del ROM colapsa el nodo, o el frame se descarta). Cualquier navegación colgada de ese callback queda
 * MUERTA: el alumno toca la tarjeta del día y no pasa nada. La regla es que la medición sea un LUJO
 * (de dónde nace la animación) y jamás un requisito para navegar.
 *
 * Vive en `lib/` —sin `react-native` ni Reanimated— para poder testearse con timers falsos; los
 * consumidores nativos (p.ej. `measureMorphOriginSafe` en `session-morph.tsx`) sólo lo cablean.
 */

/**
 * Envuelve `cb` de modo que se llame EXACTAMENTE UNA VEZ:
 *  · con el valor real, si el resolver que devolvemos se invoca dentro de `timeoutMs`;
 *  · con `fallback`, si nadie lo invocó al vencer la ventana.
 * Una respuesta TARDÍA (después del fallback) se ignora — así una medición que llega a destiempo no
 * dispara la navegación por segunda vez.
 *
 * El reloj arranca al crear el guard, así que hay que crearlo justo antes de pedir la medición.
 */
export function resolveOrFallback<T>(cb: (value: T) => void, fallback: T, timeoutMs: number): (value: T) => void {
  let fired = false
  const fire = (value: T) => {
    if (fired) return
    fired = true
    clearTimeout(timer)
    cb(value)
  }
  const timer = setTimeout(() => fire(fallback), timeoutMs)
  return fire
}
