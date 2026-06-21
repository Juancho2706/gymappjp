// SAFE FOR MOBILE (web + @eva/mobile)
// Claves canónicas de marca (white-label v2): FONT_KEY_TUPLE/FontKey, LOADER_VARIANT_TUPLE/LoaderVariant.
export * from './brand'
// LoginSchema, ForgotPasswordSchema, ResetPasswordSchema, ChangePasswordSchema
export * from './auth'
// CheckInSchema, QuickWeightSchema, UpsertHabitsSchema
export * from './client'
// Nutrition tracking schemas
export * from './nutrition'
// BrandSettingsSchema, SupportMessageSchema, RegisterCoachFreeSchema
// NOTE: AdminCreateCoachSchema has z.coerce; avoid on mobile, use RegisterCoachFreeSchema instead.
export * from './coach'
// Workout logging schemas
export * from './workout'

// SERVER-ONLY (web / Next.js server actions only)
// OrgCreateCoachSchema, OrgInviteSchema, etc. reference org_id / coach_id from DB.
export * from './org'
// CreateCouponAdminSchema, RedeemCouponSchema, RevokeRedemptionSchema (códigos de descuento).
export * from './coupon'
// Team (pool) member management schemas.
export * from './team'
// Modulos movida (specs/movida-*): screening de movimiento, composicion corporal,
// nutricion por intercambios. Tambien accesibles por subpath (@eva/schemas/bodycomp).
export * from './screening'
export * from './bodycomp'
export * from './nutrition-exchanges'
