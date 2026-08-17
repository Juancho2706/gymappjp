export * from './design'
export * from './aura'
// NOTE: './conversion' is deliberately NOT re-exported here. It is driver-only code
// (V1->V2 migration script) never invoked at app runtime, and it uses APIs with weak
// Hermes support (String.prototype.normalize). Keeping it out of this barrel prevents
// Metro from bundling dead conversion logic into the RN app. The driver imports it via
// the '@eva/nutrition-v2/conversion' subpath export (see package.json).
export * from './read-models'
export * from './day-variants'
export * from './plan-dow-strip'
export * from './week-view'
export * from './intake-normalize'
export * from './intake-units'
export * from './substitution-intake'
export * from './swipe-hint'
// Tab Alimentos del hub coach. Vivian en `apps/web/.../nutrition-v2/_lib` hasta T2.3 F6.0: son
// puros y RN los necesita para la paridad del tab, y `apps/mobile` no puede importar de `apps/web`.
export * from './food-catalog-mode'
export * from './custom-food-macros'
export * from './edited-foods'
export * from './exchange-lists'
export * from './plan-templates'
export * from './bulk-mark'
export * from './quick-edit'
export * from './catalog'
export * from './food-overrides'
export * from './food-category'
export * from './favorites'
export * from './share'
// Microcopy canonico de porciones + la gramatica de clasificar un alimento en un grupo. Vivian
// duplicado (web/RN) y en `apps/web/.../nutrition-v2/_lib` respectivamente: son puros y las dos
// superficies necesitan LA MISMA tabla, no dos copias que driftan sin que nadie lo note.
export * from './nutrition-portions-copy'
export * from './food-classification'
// R1 (T3.x editor unico): la gramatica del editor — reducer superset + hidratacion +
// proyeccion + validacion — extraida VERBATIM del quick-edit web para que web y RN (T3.3)
// consuman UNA sola copia. `editor-food`/`editor-portions` son las piezas puras del wizard
// que la gramatica necesita (el wizard web las re-exporta desde sus rutas historicas).
export * from './editor-food'
export * from './editor-portions'
export * from './editor-copy-presets'
export * from './editor-copy-plan'
export * from './editor-state'
// T3.v Cabina: reparto porcentual P/C/G del "MacroSpark" — UNA sola fuente para web y RN
// (prohibido recalcular porcentajes en componentes, ver PLAN §1).
export * from './macro-spark'
export {
  NUTRITION_V2_PERMISSION_DENIED,
  NUTRITION_V2_PERMISSION_DENIED_CODE,
  NUTRITION_V2_PERMISSION_RULES,
  NutritionIntakeVoidSchema,
  isNutritionV2PermissionDenied,
  type NutritionIntakeVoid,
  type NutritionV2PermissionRule,
  NutritionActorRoleSchema,
  NutritionCaptureMethodSchema,
  NutritionDaySnapshotSchema,
  NutritionDayVariantSchema,
  NutritionEntryStatusSchema,
  NutritionExchangeTargetSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeSourceSchema,
  NutritionIntakeUnitSchema,
  NutritionMacrosBasisSchema,
  NutritionItemSubstitutionSchema,
  NutritionLegacyHistoryItemSchema,
  NutritionMacroTargetsSchema,
  NutritionMealSlotSchema,
  NutritionPlanDraftSchema,
  NutritionPlanStatusSchema,
  NutritionPrescriptionItemSchema,
  NutritionStrategySchema,
  NutritionStudentPermissionsSchema,
  buildNutritionIdempotencyKey,
  buildNutritionPortionIntakeKey,
  nutritionPortionOperationId,
  type NutritionDaySnapshot,
  type NutritionEntryStatus,
  type NutritionExchangeTarget,
  type NutritionItemSubstitution,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionLegacyHistoryItem,
  type NutritionMacroTargets,
  type NutritionPlanDraft,
  type NutritionPlanStatus,
  type NutritionStudentPermissions,
} from './contracts'
