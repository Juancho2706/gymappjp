/**
 * Re-export del microcopy canonico de porciones, que desde ahora vive en
 * `packages/nutrition-v2/nutrition-portions-copy.ts` (una sola tabla para web y RN).
 *
 * El archivo sobrevive en su ruta vieja por dos razones: no reescribir los ~20 imports de
 * `@/lib/nutrition-portions-copy` que ya existen en la app, y dejar listo el lugar donde web
 * pondria un override si algun dia una interaccion propia lo justifica (hoy no hay ninguno: la
 * tabla canonica ya tiene los textos web).
 */

export { PORTIONS_COPY } from '@eva/nutrition-v2'
