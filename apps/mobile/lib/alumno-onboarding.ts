import { supabase } from './supabase'

// Student intake/onboarding — mirrors web `c/[coach_slug]/onboarding`.
// Writes client_intake (client_id = auth.uid()) + marks clients.onboarding_completed.

export const GOAL_OPTIONS = [
  'Perder grasa',
  'Aumentar masa muscular',
  'Recomposición corporal',
  'Mantenimiento general',
  'Rendimiento deportivo',
] as const

export const EXPERIENCE_OPTIONS = ['Principiante', 'Intermedio', 'Avanzado'] as const
export const AVAILABILITY_OPTIONS = ['2 días', '3 días', '4 días', '5 días', '6 días'] as const

export interface IntakeInput {
  weightKg: number
  heightCm: number
  goals: string
  experienceLevel: string
  availability: string
  injuries?: string | null
  medicalConditions?: string | null
}

/** True when the student already completed onboarding (skip the intake gate). */
export async function getOnboardingStatus(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return true // not logged as student → don't gate
  const { data } = await supabase.from('clients').select('onboarding_completed').eq('id', user.id).maybeSingle()
  // If the row isn't a client (e.g. coach session) data is null → don't gate.
  if (!data) return true
  return Boolean((data as { onboarding_completed?: boolean }).onboarding_completed)
}

export async function submitIntake(input: IntakeInput): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) return { ok: false, error: 'Indicá un peso válido.' }
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) return { ok: false, error: 'Indicá una altura válida.' }
  if (!input.goals || !input.experienceLevel || !input.availability) return { ok: false, error: 'Completá los campos obligatorios.' }

  const { error: intakeErr } = await supabase.from('client_intake').insert({
    client_id: user.id,
    weight_kg: input.weightKg,
    height_cm: input.heightCm,
    goals: input.goals,
    experience_level: input.experienceLevel,
    availability: input.availability,
    injuries: input.injuries?.trim() || null,
    medical_conditions: input.medicalConditions?.trim() || null,
  })
  // 23505 = ya existe intake (idempotente) → seguimos a marcar completado.
  if (intakeErr && intakeErr.code !== '23505') return { ok: false, error: 'No se pudo guardar tu información.' }

  const { error: clientErr } = await supabase
    .from('clients')
    .update({ onboarding_completed: true, age_confirmed_at: new Date().toISOString() })
    .eq('id', user.id)
  if (clientErr) return { ok: false, error: 'No se pudo actualizar tu estado.' }

  return { ok: true }
}
