// ─── SAFE FOR MOBILE (web + @eva/mobile) ────────────────────────────────────
// LoginSchema, ForgotPasswordSchema, ResetPasswordSchema, ChangePasswordSchema
export * from './auth'
// CheckInSchema, QuickWeightSchema, UpsertHabitsSchema
export * from './client'
// Nutrition tracking schemas
export * from './nutrition'
// BrandSettingsSchema, SupportMessageSchema, RegisterCoachFreeSchema
// NOTE: AdminCreateCoachSchema has z.coerce — avoid on mobile, use RegisterCoachFreeSchema instead
export * from './coach'
// Workout logging schemas
export * from './workout'

// ─── SERVER-ONLY (web / Next.js server actions only) ─────────────────────────
// OrgCreateCoachSchema, OrgInviteSchema, etc. — reference org_id / coach_id from DB
export * from './org'

