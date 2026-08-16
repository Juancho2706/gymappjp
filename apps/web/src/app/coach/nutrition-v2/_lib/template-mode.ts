/**
 * MODO PLANTILLA del builder V2 — id de relleno del alumno.
 *
 * El builder de PLANTILLAS (`/coach/nutrition-v2/plantillas/builder`) monta el MISMO wizard que
 * el builder de un alumno, pero sin alumno: una plantilla es material reutilizable del coach.
 * El wizard entero —y `assembleAndValidateDraft`, via `NutritionPlanDraftSchema.clientId`—
 * exige igualmente un uuid, asi que se usa el uuid NIL como relleno.
 *
 * Por que un relleno y no un `clientId` nulo: volverlo nulo obligaria a re-firmar toda la
 * cadena interna del wizard (ConstructionStep -> SlotEditor -> ItemRow -> FreeFoodFields) y el
 * contrato del draft, que es compartido con RN y el endpoint movil. El relleno es el cambio
 * chico Y el seguro:
 *
 *  · NUNCA se persiste: `stripDraftIdentity` (@eva/nutrition-v2) construye el draft de la
 *    plantilla campo por campo y `clientId` no esta entre ellos, asi que jamas llega a la base.
 *  · NUNCA autoriza: `authorizeCoach` ignora el clientId (el techo es la sesion del coach + la
 *    RLS). Las dos acciones que si dependian de un alumno real —catalogo de alimentos y grupos
 *    de porciones— tienen su variante coach-scoped, que es la que usa este modo.
 *
 * Vive en un modulo PURO (sin React) a proposito: lo importan las pages (server components), el
 * editor, el wizard y los tests, y ninguno deberia arrastrar a los otros.
 *
 * RETIRO DEL PAR VIEJO (2026-08-16): se mudo FUERA de `[clientId]/builder/` porque el editor de
 * plantillas lo necesita y esa carpeta muere con el wizard.
 */
export const TEMPLATE_MODE_CLIENT_ID = '00000000-0000-0000-0000-000000000000'
