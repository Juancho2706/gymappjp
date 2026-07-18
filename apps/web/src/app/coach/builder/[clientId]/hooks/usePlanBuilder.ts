'use client'

// El reducer + hook del builder viven en @eva/plan-builder (fuente de verdad única
// web+mobile, extraída en E5-01). Este archivo solo marca el boundary 'use client' de
// Next y re-exporta el hook/const que consumen los componentes del builder web.
export { usePlanBuilder, builderReducer, DAYS_OF_WEEK } from '@eva/plan-builder'
export type { BuilderAction } from '@eva/plan-builder'
