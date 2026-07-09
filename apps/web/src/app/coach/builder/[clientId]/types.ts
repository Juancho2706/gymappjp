// Los tipos del estado del builder viven en @eva/plan-builder (fuente de verdad única
// web+mobile, extraída en E5-01). Se re-exportan acá para no romper los imports
// existentes de `../types` / `./types` en el módulo del builder web.
export type { BuilderSection, BuilderBlock, ProgramPhase, DayState } from '@eva/plan-builder'

import type { HrZoneRange } from '@eva/cardio'

/** Contexto del módulo `cardio` resuelto server-side (RSC) para chips/plantillas del builder. */
export interface BuilderCardioContext {
    /** Módulo cardio ON para el contexto del alumno (team manda; OFF ⇒ sin chips ni plantillas). */
    enabled: boolean
    /** Zonas personalizadas del alumno (null sin perfil ⇒ chips solo "Z4" + CTA). */
    zones: HrZoneRange[] | null
}
