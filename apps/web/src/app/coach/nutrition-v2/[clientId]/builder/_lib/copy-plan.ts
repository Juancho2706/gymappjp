/**
 * Re-export historico: el plan de copia (T2.6 F2) vive en `@eva/nutrition-v2`
 * (`editor-copy-plan.ts`) desde T3.3b — el editor RN copia dias con las MISMAS reglas y un
 * paquete no puede importar de `apps/web`. Los importadores del wizard no cambian.
 */

export {
  NEXT_DAYS_QUICK_PICKS,
  copyPlanWarning,
  nextDaysFrom,
  planCopy,
  targetsForNextDays,
  type CopyDestination,
  type CopyMode,
  type CopyPlan,
  type CopyPlanEntry,
} from '@eva/nutrition-v2'
