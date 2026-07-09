/**
 * Shim: la derivación por-tipo del resumen post-entreno (fuerza + cardio + movilidad/roller,
 * mapa muscular, PRs) vive ahora en `@eva/workout-engine` para compartirla con el
 * `WorkoutSummaryOverlay` de mobile sin drift. Re-exporta la superficie original; los tests
 * hermanos (`session-summary.test.ts`) siguen importando desde `./session-summary`.
 * Los formateadores de duración (fix de lectura "0:40" del CEO, commit 15bc0564 de master)
 * también viajaron al package en el merge — mobile y web comparten la misma fuente.
 */
export {
    summarizeSessionByKind,
    formatSessionDuration,
    formatClockDuration,
    type SummaryExercise,
    type SummaryBlock,
    type SummaryLogLike,
    type StrengthExerciseRow,
    type CardioItem,
    type MobilityItem,
    type SessionSummaryByKind,
} from '@eva/workout-engine'
