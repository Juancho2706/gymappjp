/**
 * Ejecutor V3 (QA8) — LOADER DE RUTA del ejecutor: SOLO el fondo del splash (radial de marca vía
 * `--exec-brand = var(--theme-primary)`, resuelta fresca en `:root` por el layout `/c`).
 *
 * Sin logo ni texto: cuando se llega por el MORPH, el overlay del `WorkoutLaunchProvider` (layout /c,
 * sobrevive al swap) ya muestra logo + "Preparando tu sesión" ENCIMA de este cover — duplicarlo aquí
 * era la "imagen estática" que reportó el CEO. En cargas duras (URL directa, refresh) este fondo es
 * una cortina de marca calma hasta que el splash SSR pinta. Jamás los loaders genéricos del shell
 * (causa de la cadena de loaders del QA7).
 */
export default function LoadingWorkoutExecution() {
    return <div className="exec-route-cover" role="status" aria-busy="true" aria-label="Preparando tu sesión" />
}
