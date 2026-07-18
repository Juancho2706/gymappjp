/**
 * Flujos de datos de la biblioteca de programas — duplicar / asignar / sincronizar.
 *
 * Port 1:1 de la lógica que vivía en `app/coach/(tabs)/builder.tsx` (INTACTA: el
 * re-skin DS no cambió comportamiento, sólo relocalizó la capa de datos fuera de
 * la presentación). `passthroughBlockColumns` preserva `section_template_id` +
 * columnas polimórficas al copiar/asignar/sincronizar bloques.
 */
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { getCoachOrgContext } from '../../../lib/org'
import { passthroughBlockColumns } from '../../../lib/plan-builder/serialize'
import { sortedPlans, type ProgramBlock, type ProgramItem, type ProgramPlan } from './program-model'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function sortedBlocksOf(plan: ProgramPlan): ProgramBlock[] {
  return [...(plan.workout_blocks ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
}

function programInsertFromTemplate(program: ProgramItem, input: {
  coachId: string
  orgId: string | null
  name: string
  clientId: string | null
  isActive: boolean
  sourceTemplateId: string | null
  startDate: string | null
  endDate: string | null
  weeks?: number
}) {
  return {
    coach_id: input.coachId,
    created_by_coach_id: input.coachId,
    client_id: input.clientId,
    org_id: input.orgId,
    name: input.name,
    weeks_to_repeat: input.weeks ?? program.weeks_to_repeat ?? 1,
    start_date: input.startDate,
    end_date: input.endDate,
    duration_type: program.duration_type ?? 'weeks',
    duration_days: program.duration_days ?? null,
    program_structure_type: program.program_structure_type ?? 'weekly',
    cycle_length: program.cycle_length ?? null,
    start_date_flexible: input.clientId ? false : (program.start_date_flexible ?? true),
    program_notes: program.program_notes ?? null,
    ab_mode: program.ab_mode ?? false,
    program_phases: program.program_phases ?? [],
    source_template_id: input.sourceTemplateId,
    is_active: input.isActive,
  }
}

function blockInsertFromSource(block: ProgramBlock, planId: string) {
  return {
    // Passthrough: preserva section_template_id + campos polimorficos de la fila original
    // (copiar/asignar/sincronizar no los debe destruir). Las columnas conocidas de abajo
    // sobrescriben el spread, asi que el resultado para fuerza es identico al legacy.
    ...passthroughBlockColumns(block as unknown as Record<string, unknown>),
    plan_id: planId,
    exercise_id: block.exercise_id,
    order_index: block.order_index ?? 0,
    sets: block.sets ?? 3,
    reps: block.reps || '8-10',
    target_weight_kg: block.target_weight_kg ?? null,
    tempo: block.tempo ?? null,
    rir: block.rir ?? null,
    rest_time: block.rest_time ?? null,
    notes: block.notes ?? null,
    superset_group: block.superset_group ?? null,
    progression_type: block.progression_type ?? null,
    progression_value: block.progression_value ?? null,
    progression_mode: block.progression_mode ?? 'weekly_linear',
    section: ['warmup', 'main', 'cooldown'].includes(String(block.section)) ? block.section : 'main',
    is_override: false,
  }
}

// P-F1: merge de bloques para Sync template→alumno (port 1:1 de workout.service.mergeBlocksForSync):
// conserva el bloque del alumno si está marcado override; si no, toma el de la plantilla; si la
// plantilla no tiene ese índice, conserva el del alumno.
function mergeBlocksForSync(clientBlocks: ProgramBlock[] | null | undefined, templateBlocks: ProgramBlock[] | null | undefined): ProgramBlock[] {
  const C = [...(clientBlocks ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const T = [...(templateBlocks ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const maxL = Math.max(C.length, T.length)
  const out: ProgramBlock[] = []
  for (let j = 0; j < maxL; j += 1) {
    const c = C[j]
    const t = T[j]
    if (c?.is_override) out.push(c)
    else if (t) out.push({ ...t, is_override: false })
    else if (c) out.push(c)
  }
  return out
}

function blockInsertMerged(block: ProgramBlock, planId: string, orderIndex: number) {
  return { ...blockInsertFromSource(block, planId), order_index: orderIndex, is_override: !!block.is_override }
}

export async function syncProgramFromTemplate(program: ProgramItem): Promise<{ ok: boolean; error?: string }> {
  const coach = await getCoachProfile()
  if (!coach) return { ok: false, error: 'Coach no encontrado.' }
  if (!program.client_id) return { ok: false, error: 'Solo los programas de alumno se sincronizan.' }
  if (!program.source_template_id) return { ok: false, error: 'Este programa no tiene plantilla base vinculada.' }

  // `workout_blocks ( * )` para el passthrough: preserva section_template_id + campos
  // polimorficos al re-insertar los bloques sincronizados desde la plantilla.
  const tplSelect = `id, workout_plans ( id, day_of_week, title, group_name, week_variant, workout_blocks ( * ) )`
  const { data: tpl, error: tErr } = await supabase
    .from('workout_programs')
    .select(tplSelect)
    .eq('id', program.source_template_id)
    .eq('coach_id', coach.id)
    .is('client_id', null)
    .maybeSingle()
  if (tErr || !tpl) return { ok: false, error: 'La plantilla base no existe o ya no está disponible.' }

  const tplPlans = ((tpl as any).workout_plans ?? []) as ProgramPlan[]
  const clientPlans = sortedPlans(program)
  const oldPlanIds = clientPlans.map((p) => p.id)
  if (oldPlanIds.length) {
    await supabase.from('workout_blocks').delete().in('plan_id', oldPlanIds)
    await supabase.from('workout_plans').delete().in('id', oldPlanIds)
  }

  let syncedDays = 0
  for (const cp of clientPlans) {
    const tp = tplPlans.find(
      (p) => p.day_of_week === cp.day_of_week && String(p.week_variant || 'A') === String(cp.week_variant || 'A')
    )
    const merged = mergeBlocksForSync(cp.workout_blocks, tp?.workout_blocks)
    if (!merged.length) continue
    const { data: newPlan, error: pErr } = await supabase
      .from('workout_plans')
      .insert({
        coach_id: coach.id,
        program_id: program.id,
        client_id: program.client_id,
        day_of_week: cp.day_of_week,
        title: cp.title,
        group_name: cp.group_name ?? null,
        assigned_date: cp.assigned_date ?? null,
        week_variant: cp.week_variant ?? 'A',
      })
      .select('id')
      .single()
    if (pErr || !newPlan) return { ok: false, error: pErr?.message ?? 'No se pudo sincronizar un día.' }
    const blocks = merged.map((b, i) => blockInsertMerged(b, (newPlan as { id: string }).id, i))
    const { error: bErr } = await supabase.from('workout_blocks').insert(blocks)
    if (bErr) return { ok: false, error: bErr.message }
    syncedDays += 1
  }
  if (syncedDays === 0) return { ok: false, error: 'No hay días con ejercicios para sincronizar.' }
  return { ok: true }
}

async function copyPlansAndBlocks(source: ProgramItem, newProgramId: string, coachId: string, clientId: string | null, assignedDate: string | null): Promise<{ ok: boolean; error?: string }> {
  for (const plan of sortedPlans(source)) {
    const { data: newPlan, error: planError } = await supabase
      .from('workout_plans')
      .insert({
        coach_id: coachId,
        program_id: newProgramId,
        client_id: clientId,
        day_of_week: plan.day_of_week,
        title: plan.title,
        group_name: plan.group_name ?? null,
        assigned_date: assignedDate,
        week_variant: plan.week_variant ?? 'A',
      })
      .select('id')
      .single()
    if (planError || !newPlan) return { ok: false, error: planError?.message ?? 'No se pudo copiar un dia.' }

    const blocks = sortedBlocksOf(plan).map((block) => blockInsertFromSource(block, newPlan.id))
    if (blocks.length) {
      const { error } = await supabase.from('workout_blocks').insert(blocks)
      if (error) return { ok: false, error: error.message }
    }
  }
  return { ok: true }
}

export async function duplicateProgramAsTemplate(program: ProgramItem, name: string): Promise<{ ok: boolean; error?: string }> {
  const coach = await getCoachProfile()
  if (!coach) return { ok: false, error: 'Coach no encontrado.' }
  const { orgId } = await getCoachOrgContext()

  const { data: existing } = await supabase
    .from('workout_programs')
    .select('id')
    .eq('coach_id', coach.id)
    .eq('name', name)
    .is('client_id', null)
    .maybeSingle()
  if (existing) return { ok: false, error: `Ya tienes una plantilla llamada "${name}".` }

  const insert = programInsertFromTemplate(program, {
    coachId: coach.id,
    orgId,
    name,
    clientId: null,
    isActive: false,
    sourceTemplateId: null,
    startDate: null,
    endDate: null,
  })

  const { data: newProgram, error } = await supabase.from('workout_programs').insert(insert as any).select('id').single()
  if (error || !newProgram) return { ok: false, error: error?.message ?? 'No se pudo crear la copia.' }
  const copied = await copyPlansAndBlocks(program, newProgram.id, coach.id, null, null)
  if (!copied.ok) {
    await supabase.from('workout_programs').delete().eq('id', newProgram.id)
    return copied
  }
  return { ok: true }
}

export async function assignTemplateToClients(template: ProgramItem, clientIds: string[], options: { durationWeeks: number }): Promise<{ ok: boolean; error?: string }> {
  const coach = await getCoachProfile()
  if (!coach) return { ok: false, error: 'Coach no encontrado.' }
  const { orgId } = await getCoachOrgContext()
  const start = todayIso()
  const end = addDays(start, options.durationWeeks * 7)

  for (const clientId of clientIds) {
    const insert = programInsertFromTemplate(template, {
      coachId: coach.id,
      orgId,
      name: template.name,
      clientId,
      isActive: false,
      sourceTemplateId: template.id,
      startDate: start,
      endDate: end,
      weeks: options.durationWeeks,
    })
    const { data: newProgram, error } = await supabase.from('workout_programs').insert(insert as any).select('id').single()
    if (error || !newProgram) return { ok: false, error: error?.message ?? 'No se pudo asignar el programa.' }

    const copied = await copyPlansAndBlocks(template, newProgram.id, coach.id, clientId, start)
    if (!copied.ok) {
      await supabase.from('workout_programs').delete().eq('id', newProgram.id)
      return copied
    }

    const { error: deactivateError } = await supabase
      .from('workout_programs')
      .update({ is_active: false })
      .eq('coach_id', coach.id)
      .eq('client_id', clientId)
      .eq('is_active', true)
    if (deactivateError) {
      await supabase.from('workout_programs').delete().eq('id', newProgram.id)
      return { ok: false, error: deactivateError.message }
    }

    const { error: activateError } = await supabase.from('workout_programs').update({ is_active: true }).eq('id', newProgram.id)
    if (activateError) {
      await supabase.from('workout_programs').delete().eq('id', newProgram.id)
      return { ok: false, error: activateError.message }
    }
  }
  return { ok: true }
}
