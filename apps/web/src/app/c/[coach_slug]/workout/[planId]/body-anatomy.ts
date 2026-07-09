/**
 * Shim: la silueta anatómica vendoreada (paths SVG frente + espalda) vive ahora en
 * `@eva/workout-engine` para compartirla con el `MuscleMapSvg` de mobile (react-native-svg)
 * sin duplicar los paths. Re-exporta la superficie original.
 */
export {
    BODY_VIEWBOX,
    BODY_HALF_WIDTH,
    BODY_SHAPES,
    type BodyShape,
    type BodySide,
} from '@eva/workout-engine'
