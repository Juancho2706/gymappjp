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
export * from './bulk-mark'
export * from './quick-edit'
export * from './catalog'
export * from './food-category'
export * from './favorites'
export * from './share'
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
