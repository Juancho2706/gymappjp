/**
 * @eva/cardio — dominio PURO de cardio (FCmax, zonas de frecuencia cardiaca y pace).
 *
 * Fuente de verdad unica reutilizada por web (@eva/web) y mobile (apps/mobile). TypeScript puro:
 * sin React / Next / Supabase / React Native. Extraido desde apps/web/src/domain/cardio en E0-F2
 * (specs/rn-mobile-parity-redesign) para que web y mobile compartan el calculo de zonas cardio y
 * las conversiones de pace sin drift. `hrRangeForZone` (zones) es la funcion que el ejecutor de
 * rutina usa para derivar los bpm de un bloque cardio — se comparte aca, nunca se duplica.
 */

export * from './types'
export * from './zones'
export * from './pace'
