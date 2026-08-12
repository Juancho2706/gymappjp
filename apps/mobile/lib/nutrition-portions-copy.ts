/**
 * Wrapper RN del microcopy canonico de porciones, que vive en
 * `packages/nutrition-v2/nutrition-portions-copy.ts` (una sola tabla para web y RN).
 *
 * Existe por dos razones: no reescribir los ~15 imports de `@/lib/nutrition-portions-copy` de la
 * app, y aplicar los UNICOS dos textos que divergen de verdad en nativo. Divergir es la excepcion
 * y se justifica por INTERACCION, nunca por gusto: si el texto tiene que cambiar para todos,
 * cambia en la tabla canonica.
 */

import { PORTIONS_COPY as CANONICAL } from '@eva/nutrition-v2'

export const PORTIONS_COPY = {
  ...CANONICAL,
  builder: {
    ...CANONICAL.builder,
    // El punto de entrada para clasificar NO es el mismo: en web es el tab "Mis alimentos" del
    // hub, en nativo es la pantalla Porciones (`app/coach/nutrition-v2/portions.tsx`). Mandar al
    // coach a una pantalla que su telefono no tiene es peor que no dar pista.
    groupFoodsEmptyHint: 'Clasifica alimentos en este grupo desde Porciones.',
  },
  student: {
    ...CANONICAL.student,
    // En web el reintento es texto dentro del mismo mensaje; en nativo el snackbar tiene su
    // propia accion (`student.retry`), asi que el mensaje NO puede terminar en "Reintentar" o el
    // alumno lee la palabra dos veces.
    markFailed: 'No se pudo marcar la porción.',
  },
} as const
