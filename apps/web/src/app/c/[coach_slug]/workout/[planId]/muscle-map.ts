/**
 * Shim: la lógica pura del mapa muscular vive ahora en `@eva/workout-engine`
 * (extraída en la paridad RN para compartirla con mobile sin drift). Este archivo
 * re-exporta la superficie original para no tocar los imports relativos de web
 * (`./muscle-map`) ni los tests hermanos.
 */
export {
    MUSCLE_REGIONS,
    normalizeMuscle,
    muscleGroupToRegion,
    muscleGroupsToRegionIntensity,
    type MuscleRegion,
} from '@eva/workout-engine'
