/**
 * @eva/profile-analytics — analitica PURA del perfil de alumno (fuerza, tonelaje, PR, composicion
 * corporal, calendario de actividad, estado unificado y triage banner).
 *
 * Fuente de verdad unica reutilizada por web (@eva/web) y mobile (apps/mobile). TypeScript puro:
 * sin React / Next / Supabase / React Native / date-fns. Extraido en E3-08/E3-09 desde
 * apps/web/src/app/coach/clients/[clientId]/{profileTrainingAnalytics,profileOverviewUtils,
 * profileBodyCompositionUtils,clientStatusUtils,getProfileTopAlert}.ts y la copia RN
 * apps/mobile/lib/profile-analytics.ts.
 *
 * FORMA CANONICA = PLANA (WorkoutLogRow[]): el data layer RN y las RPC entregan filas planas.
 * La web mantiene LOCALES sus wrappers de shape anidado (workout_blocks[].workout_logs[]) y sus
 * helpers date-fns (formatTrainingAgeLabel, buildProfileActivityCalendarData, etc.) para NO alterar
 * los numeros que el coach ya ve; comparte con este package el kernel puro (epley, ranking, mappers
 * RPC, IMC, regresion, energia, imbalance) + deriveClientStatus + getProfileTopAlert.
 *
 * DELTAS documentados (gana WEB salvo ortografia):
 *  - getProfileTopAlert: input permisivo (created_at ?? date), diffDays date-fns-free (equivalente a
 *    date-fns differenceInDays para diffs positivos). Copy = web (incl. "(hoy / plan activo)") con
 *    tildes correctas (la web tenia "ultimo/critica/ultima" sin tilde; aqui van con tilde).
 *  - buildProfileActivityCalendar / longestActivityStreak / formatTrainingAgeLabel /
 *    checkInRegularityPercentAsOf: reimplementacion date-fns-free (parseYmd @12:00) — mismos buckets
 *    y etiquetas que la copia RN. formatTrainingAgeLabel usa diffMonths calendario (no dia-del-mes),
 *    igual que la copia RN; la web conserva su version date-fns local (differenceInMonths) que puede
 *    diferir <=1 mes en el borde del mes — no se toca el numero de la web.
 */

export * from './types'
export * from './strength'
export * from './body-composition'
export * from './overview'
export * from './client-status'
export * from './top-alert'
