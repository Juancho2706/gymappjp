/**
 * @eva/workout-engine — motor PURO de ejecución de entreno del alumno.
 *
 * Fuente de verdad única reutilizada por web (@eva/web) y mobile (apps/mobile). TypeScript puro:
 * sin React / Next / Supabase / React Native. Extraído desde apps/web en E0-F1
 * (specs/rn-mobile-parity-redesign) para que web y mobile compartan la lógica de ejecución sin
 * drift: reconciliación/optimismo de logs, teclado tipado, modelo de pasos, agrupación de bloques,
 * áreas y cálculo de intervalos.
 *
 * Nota de tipos de frontera: `WorkoutArea` (workout-areas) e `IntervalConfig` (workout-interval)
 * son espejos exactos de `@/domain/workout/types` de web — se re-declaran acá para que el paquete
 * quede self-contained (mismo criterio que @eva/nutrition-engine). `WorkoutOfflineLog`
 * (session-logs.reconcile) es la forma canónica de la serie encolada; web
 * `lib/workout-offline-queue.ts` la re-exporta desde acá.
 */

export * from './session-logs.reconcile'
export * from './session-logs.optimistic'
export * from './typed-keypad'
export * from './keypad-logic'
export * from './workout-exercise-type'
export * from './workout-stepper'
export * from './workout-block-grouping'
export * from './superset-rounds'
export * from './workout-areas'
export * from './workout-interval'
export * from './session-summary'
export * from './muscle-map'
export * from './body-anatomy'
export * from './workout-save-reconcile'
export * from './motion-tokens'
export * from './celebration'
export * from './cardio-progress'
export * from './pr-detect'
