/**
 * Shim: la derivación por-tipo del resumen post-entreno (fuerza + cardio + movilidad/roller,
 * mapa muscular, PRs) vive ahora en `@eva/workout-engine` para compartirla con el
 * `WorkoutSummaryOverlay` de mobile sin drift. Re-exporta la superficie original; los tests
 * hermanos (`session-summary.test.ts`) siguen importando desde `./session-summary`.
 */
export {
    summarizeSessionByKind,
    type SummaryExercise,
    type SummaryBlock,
    type SummaryLogLike,
    type StrengthExerciseRow,
    type CardioItem,
    type MobilityItem,
    type SessionSummaryByKind,
} from '@eva/workout-engine'
