// El reducer + hook del builder viven en @eva/plan-builder (fuente de verdad única
// web+mobile, E5-01/E5-02). Este archivo solo re-exporta lo que consume el builder mobile
// para no tocar los imports existentes (`./reducer`). El fork local 1:1 quedó eliminado
// (cero drift con web). El passthrough `_raw` de serialize.ts se preserva vía el tipo
// BuilderBlock del paquete (que incluye `_raw`).
export { usePlanBuilder, builderReducer, DAYS_OF_WEEK } from '@eva/plan-builder'
export type { BuilderAction } from '@eva/plan-builder'
