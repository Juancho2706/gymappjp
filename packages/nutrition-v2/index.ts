export * from './design'
export * from './aura'
// NOTE: './conversion' is deliberately NOT re-exported here. It is driver-only code
// (V1->V2 migration script) never invoked at app runtime, and it uses APIs with weak
// Hermes support (String.prototype.normalize). Keeping it out of this barrel prevents
// Metro from bundling dead conversion logic into the RN app. The driver imports it via
// the '@eva/nutrition-v2/conversion' subpath export (see package.json).
export * from './read-models'
export * from './quick-edit'
export * from './catalog'
export * from './rollout'
export * from './food-category'
export * from './favorites'
export * from './share'
export {
  NutritionActorRoleSchema,
  NutritionCaptureMethodSchema,
  NutritionDaySnapshotSchema,
  NutritionDayVariantSchema,
  NutritionEntryStatusSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeSourceSchema,
  NutritionLegacyHistoryItemSchema,
  NutritionMacroTargetsSchema,
  NutritionMealSlotSchema,
  NutritionPlanDraftSchema,
  NutritionPlanStatusSchema,
  NutritionPrescriptionItemSchema,
  NutritionStrategySchema,
  NutritionStudentPermissionsSchema,
  buildNutritionIdempotencyKey,
  type NutritionDaySnapshot,
  type NutritionEntryStatus,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionLegacyHistoryItem,
  type NutritionMacroTargets,
  type NutritionPlanDraft,
  type NutritionPlanStatus,
  type NutritionStudentPermissions,
} from './contracts'
