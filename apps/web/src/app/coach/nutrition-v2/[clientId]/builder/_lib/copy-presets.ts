/**
 * Re-export historico: los presets de copia (BD3) viven en `@eva/nutrition-v2`
 * (`editor-copy-presets.ts`) desde T3.3b — el editor RN necesita la MISMA logica y un paquete
 * no puede importar de `apps/web`. Los importadores del wizard no cambian.
 */

export {
  COPY_PRESETS,
  daysForCopyPreset,
  replacedDaysOf,
  targetsForCopyPreset,
  type CopyPreset,
  type CopyPresetDay,
  type CopyPresetId,
  type CopyPresetTarget,
} from '@eva/nutrition-v2'
