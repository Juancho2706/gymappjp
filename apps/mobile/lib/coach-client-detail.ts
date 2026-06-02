import { supabase } from './supabase'

// Coach-side client detail data. Reads via Supabase (RLS: coach sees own clients).
// Mutations (update/archive) also via Supabase under the coach's session — RLS
// must permit a coach to manage own clients. Payments go through the mobile API.

export interface CoachClientDetail {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean | null
  is_archived: boolean | null
  goal_weight_kg: number | null
  subscription_start_date: string | null
  created_at: string
}

export interface CheckInEntry {
  date: string
  weight: number | null
  energy_level: number | null
}

export interface PaymentEntry {
  id: string
  amount: number
  payment_date: string
  service_description: string | null
  status: string | null
  period_months: number | null
}

export interface ActiveProgramInfo {
  id: string
  name: string
  planCount: number
}

export async function getCoachClientDetail(clientId: string): Promise<{
  client: CoachClientDetail | null
  checkIns: CheckInEntry[]
  payments: PaymentEntry[]
  activeProgram: ActiveProgramInfo | null
}> {
  const [clientRes, checkInRes, paymentRes, programRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, email, phone, is_active, is_archived, goal_weight_kg, subscription_start_date, created_at')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('check_ins')
      .select('date, weight, energy_level')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .limit(30),
    supabase
      .from('client_payments')
      .select('id, amount, payment_date, service_description, status, period_months')
      .eq('client_id', clientId)
      .order('payment_date', { ascending: false })
      .limit(20),
    supabase
      .from('workout_programs')
      .select('id, name, workout_plans ( id )')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  const program = programRes.data
    ? {
        id: (programRes.data as { id: string }).id,
        name: (programRes.data as { name: string }).name,
        planCount: ((programRes.data as { workout_plans?: unknown[] }).workout_plans ?? []).length,
      }
    : null

  return {
    client: (clientRes.data as CoachClientDetail | null) ?? null,
    checkIns: (checkInRes.data as CheckInEntry[] | null) ?? [],
    payments: (paymentRes.data as PaymentEntry[] | null) ?? [],
    activeProgram: program,
  }
}

export async function updateCoachClient(
  clientId: string,
  fields: { full_name?: string; phone?: string | null; goal_weight_kg?: number | null; subscription_start_date?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('clients').update(fields).eq('id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function setCoachClientArchived(clientId: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('clients').update({ is_archived: archived }).eq('id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
