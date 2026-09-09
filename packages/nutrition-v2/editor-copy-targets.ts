/**
 * Copys de METAS POR DIA del editor unico (tren «Porciones a la chilena», W4.6) — PURO, sin React.
 *
 * FUENTE UNICA: la tabla de copys aprobados de SPEC §16.1, en TUTEO chileno neutro (el artifact
 * de mockups venia en voseo y el editor es 100 % tuteo: R-04). Web y RN consumen ESTE modulo y
 * lo re-exportan en su `EDITOR_COPY`; ninguna superficie escribe el texto suelto, o el switch
 * dice una cosa en el telefono y otra en el navegador sin que nadie lo note.
 *
 * Un solo texto cambia entre superficies y esta declarado como DOS llaves, no como un `if`:
 * `goToBase` («Ir a Base», RN) y `goToBaseWeb` («Abrir metas del base»).
 */

/** Copys del switch «Solo el {dia}» y del aviso de metas parciales de la barra de publicar. */
export const EDITOR_TARGETS_COPY = {
  targets: {
    /** Rotulo del switch. `dia` llega en MINUSCULA («martes»): va dentro de la frase. */
    onlyThisDay: (dia: string): string => `Solo el ${dia}`,
    /** Ayuda con el switch APAGADO: dice donde se guarda, que es lo que el caso Pame no sabia. */
    onlyThisDayOff: 'Apagado: se guarda en «Todos los días» y vale para toda la semana.',
    /**
     * Ayuda con el switch ENCENDIDO. `kcal` llega YA formateado con `formatMacroEsCl`
     * (2040 → «2.040»); el copy pone la unidad, asi que no uses `formatNutritionCalories`.
     */
    onlyThisDayOn: (dia: string, kcal: string): string =>
      `Encendido: el ${dia} usa esta meta; los demás días siguen con ${kcal} kcal.`,
  },
  publish: {
    /**
     * Aviso ambar de la `PublishBar`. Las dos listas de dias llegan ya armadas con
     * `joinDayLabels` (ver `qeTargetsGapBar`, que es el unico que deberia llamar a este copy).
     */
    partialTargets: (conMeta: string, sinMeta: string): string =>
      `Solo ${conMeta} tiene meta. ${sinMeta} quedan sin objetivo.`,
    /** Boton primario mientras el aviso esta visible: publicar con metas parciales SIGUE permitido. */
    anyway: 'Publicar igual',
    /** Accion del aviso en RN. */
    goToBase: 'Ir a Base',
    /** La misma accion en web, donde «Base» solo no se entiende fuera de la cinta de dias. */
    goToBaseWeb: 'Abrir metas del base',
  },
} as const
