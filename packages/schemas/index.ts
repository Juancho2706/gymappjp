// SAFE FOR MOBILE (web + @eva/mobile)
// Claves canónicas de marca (white-label v2): FONT_KEY_TUPLE/FontKey, LOADER_VARIANT_TUPLE/LoaderVariant.
export * from './brand'
// LoginSchema, ForgotPasswordSchema, ResetPasswordSchema, ChangePasswordSchema
export * from './auth'
// Identificador público de coach y contrato del gate de acceso mobile.
export * from './coach-identifier'
// passwordRejectionMessage: traducción de errores GoTrue al cambiar contraseña (HIBP/weak/same)
export * from './auth-errors'
// CheckInSchema, QuickWeightSchema, UpsertHabitsSchema
export * from './client'
// Nutrition tracking schemas
export * from './nutrition'
// BrandSettingsSchema, SupportMessageSchema, RegisterCoachFreeSchema
// NOTE: AdminCreateCoachSchema has z.coerce; avoid on mobile, use RegisterCoachFreeSchema instead.
export * from './coach'
// Workout logging schemas
export * from './workout'
// Bridge mobile: notificación transaccional posterior a una asignación ya persistida.
export * from './program-assignment-notification'

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

// Onboarding v2: persona del coach y su copy (port 1.1.1 solo para `formatWhatsappInvite`).
export * from './persona'
