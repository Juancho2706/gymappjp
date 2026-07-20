/**
 * qa-seed-team-movida.mjs
 * ---------------------------------------------------------------------------
 * QA VISUAL — pobla el team existente "Movida (test)"
 *   team_id  = d0d0d0d0-0000-0000-0000-000000000001  (slug movida-test)
 *   owner    = josefit (coach_id 503412d0-77cc-4c7e-b1c2-dec81fb00ce6)
 *
 * Autorizado por el CEO (2026-07-04) para verificar con datos las pantallas
 * rediseñadas de Equipo / Composición corporal / Aprender.
 *
 * QUÉ SIEMBRA (--up):
 *   - 3 coaches-miembro sintéticos (auth user + fila `coaches` + `team_members`)
 *       · Ana Torres  — Co-gestor (can_manage=true)
 *       · Bruno Salas — Miembro
 *       · Carla Méndez — Miembro
 *   - 9 alumnos de pool (clients.team_id = movida, org_id null) repartidos entre
 *     los coaches-miembro + josefit, con estados variados:
 *       · con programa activo · programa vencido (riesgo) · sin programa
 *
 * REVERSIBLE (--down): borra SOLO lo sembrado, por manifest
 *   (scripts/qa-seed-team-movida.json) + barrido defensivo por tag de email
 *   `%.qateam@evatest.cl` (alumnos/coaches) y `invite_code LIKE 'QATEAM-%'`.
 *
 * GUARDRAILS (invariantes que el --down NUNCA viola):
 *   - NUNCA toca el team ni su fila; NUNCA borra el team_member preexistente de
 *     josefit (9f2518c3-...); NUNCA toca los 2 alumnos de pool preexistentes
 *     (Carolina juanetherchile@gmail.com / Diana juanchotacorta@gmail.com).
 *   - NUNCA toca cuentas @evatest.cl permanentes (el tag es el infijo
 *     ".qateam@evatest.cl", que esas cuentas NO tienen).
 *   - clients.team_id/coach_id son service-role-only -> usa SUPABASE_SERVICE_ROLE_KEY.
 *
 * IDEMPOTENTE: re-correr --up reusa filas existentes por tag y las recrea.
 *
 * Uso:
 *   node scripts/qa-seed-team-movida.mjs         # --up
 *   node scripts/qa-seed-team-movida.mjs --down   # revertir
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, 'qa-seed-team-movida.json')

const TEAM_ID = 'd0d0d0d0-0000-0000-0000-000000000001'
const OWNER_COACH_ID = '503412d0-77cc-4c7e-b1c2-dec81fb00ce6' // josefit
const EMAIL_TAG = '.qateam@evatest.cl' // infijo único; NUNCA presente en cuentas permanentes
const INVITE_PREFIX = 'QATEAM-'
// Fila protegida: team_member preexistente de josefit — el --down JAMÁS la borra.
const PROTECTED_TEAM_MEMBER_IDS = new Set(['9f2518c3-eaf2-4383-b855-7aa6fe864069'])
const PROTECTED_CLIENT_IDS = new Set([
  'f02e4d72-9c0a-4ba7-b1d9-4f9fc8dda008', // Carolina (pool preexistente)
  'd01efa48-c3e7-4476-a403-e9f55912352b', // Diana (pool preexistente)
])

// ── env ────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const PASSWORD = env.E2E_PERSONAS_PASSWORD
if (!PASSWORD || PASSWORD.length < 8) {
  throw new Error('Falta E2E_PERSONAS_PASSWORD (mínimo 8 caracteres) en .env.local.')
}

const DAY = 86_400_000
const NOW = Date.now()
const ymdAgo = (daysAgo) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(NOW - daysAgo * DAY))

// ── auth helpers (idénticos al patrón de seed-josefit-design-qa) ─────────────
async function getOrCreateAuthUser(email) {
  const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (!error) return data.user.id
  for (let page = 1; page <= 50; page++) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    const hit = (list?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (!list || list.users.length < 200) break
  }
  throw new Error(`auth user create/find failed for ${email}: ${error.message}`)
}
async function deleteAuthUser(id) {
  try { await sb.auth.admin.deleteUser(id) } catch { /* best-effort */ }
}
// Barrido defensivo: TODOS los auth users cuyo email lleva el tag (.qateam@evatest.cl).
async function listTaggedAuthUsers() {
  const out = []
  for (let page = 1; page <= 50; page++) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    for (const u of list?.users ?? []) {
      if (u.email && u.email.toLowerCase().endsWith(EMAIL_TAG)) out.push({ id: u.id, email: u.email })
    }
    if (!list || list.users.length < 200) break
  }
  return out
}

// ── definiciones ─────────────────────────────────────────────────────────────
const COACHES = [
  { key: 'ana',   name: 'Ana Torres',   brand: 'Ana Torres · Nutrición',  specialty: 'Nutrióloga',        can_manage: true },
  { key: 'bruno', name: 'Bruno Salas',  brand: 'Bruno Salas · Fuerza',    specialty: 'Preparador físico', can_manage: false },
  { key: 'carla', name: 'Carla Méndez', brand: 'Carla Méndez · Kinesio',  specialty: 'Kinesióloga',       can_manage: false },
]
const coachEmail = (key) => `coach-${key}${EMAIL_TAG}`
const coachSlug = (key) => `qateam-${key}-movida`
const coachInvite = (key) => `${INVITE_PREFIX}${key.toUpperCase()}`

// coachRef: 'ana' | 'bruno' | 'carla' | 'jose'  (jose = owner josefit)
// program: null (sin programa) | { name, expired? }
const POOL = [
  { key: 'sofia',     name: 'Sofía Reyes',     phone: '+56962220001', coachRef: 'ana',   program: { name: 'Hipertrofia Full Body' } },
  { key: 'matias',    name: 'Matías Rojas',    phone: '+56962220002', coachRef: 'ana',   program: { name: 'Fuerza 5x5' } },
  { key: 'isidora',   name: 'Isidora Vega',    phone: '+56962220003', coachRef: 'ana',   program: null },
  { key: 'benjamin',  name: 'Benjamín Silva',  phone: '+56962220004', coachRef: 'bruno', program: { name: 'Recomposición Corporal' } },
  { key: 'antonia',   name: 'Antonia Muñoz',   phone: '+56962220005', coachRef: 'bruno', program: { name: 'Definición Verano', expired: true } },
  { key: 'joaquin',   name: 'Joaquín Castro',  phone: '+56962220006', coachRef: 'bruno', program: null },
  { key: 'emilia',    name: 'Emilia Fuentes',  phone: '+56962220007', coachRef: 'carla', program: { name: 'Glúteos & Piernas' } },
  { key: 'vicente',   name: 'Vicente Morales', phone: '+56962220008', coachRef: 'carla', program: { name: 'Volumen Limpio', expired: true } },
  { key: 'florencia', name: 'Florencia Díaz',  phone: '+56962220009', coachRef: 'jose',  program: { name: 'Full Body 3x Semana' } },
]
const poolEmail = (key) => `pool-${key}${EMAIL_TAG}`

// ── wipe de hijos de un alumno (idempotencia + reversa) ──────────────────────
async function wipeClientChildren(clientId) {
  const { data: dls } = await sb.from('daily_nutrition_logs').select('id').eq('client_id', clientId)
  const dlIds = (dls ?? []).map((r) => r.id)
  if (dlIds.length) await sb.from('nutrition_meal_logs').delete().in('daily_log_id', dlIds)
  await sb.from('daily_nutrition_logs').delete().eq('client_id', clientId)
  const { data: nps } = await sb.from('nutrition_plans').select('id').eq('client_id', clientId)
  const npIds = (nps ?? []).map((r) => r.id)
  if (npIds.length) await sb.from('nutrition_meals').delete().in('plan_id', npIds)
  await sb.from('nutrition_plans').delete().eq('client_id', clientId)
  await sb.from('workout_logs').delete().eq('client_id', clientId)
  const { data: pls } = await sb.from('workout_plans').select('id').eq('client_id', clientId)
  const plIds = (pls ?? []).map((r) => r.id)
  if (plIds.length) await sb.from('workout_blocks').delete().in('plan_id', plIds)
  await sb.from('workout_plans').delete().eq('client_id', clientId)
  await sb.from('workout_programs').delete().eq('client_id', clientId)
  await sb.from('check_ins').delete().eq('client_id', clientId)
}

// ── DOWN ─────────────────────────────────────────────────────────────────────
async function down() {
  // 1) IDs del manifest (fuente de verdad).
  let coachIds = []
  let clientIds = []
  let teamMemberIds = []
  if (existsSync(MANIFEST_PATH)) {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    coachIds = (m.coaches ?? []).map((c) => c.coachId).filter(Boolean)
    clientIds = (m.pool ?? []).map((c) => c.clientId).filter(Boolean)
    teamMemberIds = (m.coaches ?? []).map((c) => c.teamMemberId).filter(Boolean)
  }

  // 2) Barrido defensivo por tag (captura orfandades de corridas parciales).
  const tagged = await listTaggedAuthUsers()
  const taggedIds = new Set(tagged.map((t) => t.id))
  // Coaches taggeados por invite_code (por si el auth user se borró pero quedó la fila).
  const { data: strayCoaches } = await sb
    .from('coaches')
    .select('id')
    .like('invite_code', `${INVITE_PREFIX}%`)
  for (const r of strayCoaches ?? []) taggedIds.add(r.id)
  // Alumnos de pool taggeados por email dentro del team (defensa extra).
  const { data: strayPool } = await sb
    .from('clients')
    .select('id,email')
    .eq('team_id', TEAM_ID)
    .like('email', `%${EMAIL_TAG}`)
  for (const r of strayPool ?? []) taggedIds.add(r.id)

  const allIds = new Set([...coachIds, ...clientIds, ...taggedIds])
  // GUARDRAIL DURO: jamás el owner ni los alumnos preexistentes.
  allIds.delete(OWNER_COACH_ID)
  for (const pid of PROTECTED_CLIENT_IDS) allIds.delete(pid)

  let removedClients = 0
  let removedCoaches = 0
  let removedMembers = 0

  // 2a) team_members: SOLO ids del manifest (nunca la fila protegida de josefit).
  for (const tmId of teamMemberIds) {
    if (PROTECTED_TEAM_MEMBER_IDS.has(tmId)) continue
    await sb.from('team_members').delete().eq('id', tmId).eq('team_id', TEAM_ID).neq('coach_id', OWNER_COACH_ID)
  }
  // 2b) team_members defensivos: los que apunten a coaches taggeados (nunca josefit).
  for (const cid of allIds) {
    if (cid === OWNER_COACH_ID) continue
    const { data: del } = await sb
      .from('team_members')
      .delete()
      .eq('team_id', TEAM_ID)
      .eq('coach_id', cid)
      .neq('coach_id', OWNER_COACH_ID)
      .select('id')
    removedMembers += (del ?? []).filter((r) => !PROTECTED_TEAM_MEMBER_IDS.has(r.id)).length
  }

  // 2c) para cada id: intentar como alumno (hijos+client) y como coach (fila coaches),
  //     luego borrar el auth user. Idempotente y seguro (los protegidos ya se sacaron).
  for (const id of allIds) {
    // ¿es un client de pool del team con tag? -> wipe + delete
    const { data: cli } = await sb
      .from('clients')
      .select('id,team_id,email')
      .eq('id', id)
      .maybeSingle()
    if (cli && cli.team_id === TEAM_ID && (cli.email ?? '').toLowerCase().endsWith(EMAIL_TAG)) {
      await wipeClientChildren(id)
      const { data: d } = await sb.from('clients').delete().eq('id', id).eq('team_id', TEAM_ID).select('id')
      removedClients += (d ?? []).length
    }
    // ¿es un coach QATEAM? -> delete fila coaches (nunca josefit)
    if (id !== OWNER_COACH_ID) {
      const { data: co } = await sb
        .from('coaches')
        .select('id,invite_code')
        .eq('id', id)
        .maybeSingle()
      if (co && (co.invite_code ?? '').startsWith(INVITE_PREFIX)) {
        const { data: d } = await sb.from('coaches').delete().eq('id', id).like('invite_code', `${INVITE_PREFIX}%`).select('id')
        removedCoaches += (d ?? []).length
      }
    }
    // auth user (solo los que existen y llevan el tag / están en manifest)
    if (taggedIds.has(id) || coachIds.includes(id) || clientIds.includes(id)) {
      await deleteAuthUser(id)
    }
  }

  console.log(`DOWN complete — clients:${removedClients} coaches:${removedCoaches} team_members:${removedMembers} (owner + Carolina/Diana intactos).`)
}

// ── UP ───────────────────────────────────────────────────────────────────────
async function up() {
  const manifest = {
    team_id: TEAM_ID,
    owner_coach_id: OWNER_COACH_ID,
    seededAt: new Date().toISOString(),
    emailTag: EMAIL_TAG,
    invitePrefix: INVITE_PREFIX,
    note: 'QA seed team Movida. Reverse: node scripts/qa-seed-team-movida.mjs --down',
    coaches: [],
    pool: [],
  }
  const coachIdByRef = { jose: OWNER_COACH_ID }

  // ── coaches-miembro + team_members ──
  for (const c of COACHES) {
    const email = coachEmail(c.key)
    const coachId = await getOrCreateAuthUser(email)
    coachIdByRef[c.key] = coachId

    // upsert coaches (idempotente por id)
    const { error: coErr } = await sb.from('coaches').upsert(
      {
        id: coachId,
        full_name: c.name,
        brand_name: c.brand,
        slug: coachSlug(c.key),
        invite_code: coachInvite(c.key),
        subscription_status: 'team_managed', // fuera de billing standalone
        subscription_tier: 'starter',
      },
      { onConflict: 'id' }
    )
    if (coErr) throw new Error(`coach upsert ${c.key}: ${coErr.message}`)

    // team_members (idempotente: busca existente por team+coach)
    const { data: existing } = await sb
      .from('team_members')
      .select('id')
      .eq('team_id', TEAM_ID)
      .eq('coach_id', coachId)
      .maybeSingle()
    let teamMemberId = existing?.id ?? null
    if (teamMemberId) {
      await sb
        .from('team_members')
        .update({ status: 'active', can_manage: c.can_manage, display_role: c.specialty, deleted_at: null })
        .eq('id', teamMemberId)
    } else {
      const { data: tm, error: tmErr } = await sb
        .from('team_members')
        .insert({ team_id: TEAM_ID, coach_id: coachId, status: 'active', can_manage: c.can_manage, display_role: c.specialty })
        .select('id')
        .single()
      if (tmErr) throw new Error(`team_member ${c.key}: ${tmErr.message}`)
      teamMemberId = tm.id
    }

    manifest.coaches.push({ key: c.key, coachId, teamMemberId, email, name: c.name, can_manage: c.can_manage, specialty: c.specialty })
    console.log(`  coach ${c.name.padEnd(16)} ${c.can_manage ? '[Co-gestor]' : '[Miembro]  '} coachId=${coachId}`)
  }

  // ── alumnos de pool ──
  for (const p of POOL) {
    const email = poolEmail(p.key)
    const assignedCoach = coachIdByRef[p.coachRef]
    if (!assignedCoach) throw new Error(`pool ${p.key}: coachRef ${p.coachRef} no resuelto`)

    // buscar existente por email dentro del team
    const { data: found } = await sb
      .from('clients')
      .select('id')
      .eq('team_id', TEAM_ID)
      .eq('email', email)
      .maybeSingle()
    let clientId = found?.id ?? null
    if (clientId) {
      await wipeClientChildren(clientId)
      await sb
        .from('clients')
        .update({ full_name: p.name, phone: p.phone, coach_id: assignedCoach, is_active: true, is_archived: false })
        .eq('id', clientId)
    } else {
      const authUserId = await getOrCreateAuthUser(email)
      const { data, error } = await sb
        .from('clients')
        .insert({
          id: authUserId,
          coach_id: assignedCoach,
          full_name: p.name,
          email,
          phone: p.phone,
          org_id: null,
          team_id: TEAM_ID,
          is_active: true,
          is_archived: false,
          onboarding_completed: true,
          force_password_change: false,
          use_coach_brand_colors: true,
        })
        .select('id')
        .single()
      if (error) throw new Error(`pool client insert ${p.key}: ${error.message}`)
      clientId = data.id
    }

    // programa opcional (estado)
    let programId = null
    let state = 'sin programa'
    if (p.program) {
      const startDate = ymdAgo(21)
      const endDate = p.program.expired ? ymdAgo(4) : ymdAgo(-42) // vencido vs futuro
      const { data: prog, error: pErr } = await sb
        .from('workout_programs')
        .insert({
          client_id: clientId,
          coach_id: assignedCoach,
          name: p.program.name,
          weeks_to_repeat: 8,
          start_date: startDate,
          end_date: endDate,
          is_active: true,
          duration_type: 'weeks',
          program_structure_type: 'weekly',
          created_by_coach_id: assignedCoach,
          last_edited_by_coach_id: assignedCoach,
        })
        .select('id')
        .single()
      if (pErr) throw new Error(`pool program ${p.key}: ${pErr.message}`)
      programId = prog.id
      state = p.program.expired ? 'programa vencido' : 'programa activo'
    }

    manifest.pool.push({ key: p.key, clientId, email, name: p.name, coachRef: p.coachRef, coachId: assignedCoach, programId, state })
    console.log(`  pool  ${p.name.padEnd(16)} -> ${p.coachRef.padEnd(6)} [${state}] clientId=${clientId}`)
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  console.log(`\nUP complete — ${manifest.coaches.length} coaches + ${manifest.pool.length} pool alumnos. Manifest: ${MANIFEST_PATH}`)
}

const mode = process.argv.includes('--down') ? 'down' : 'up'
;(mode === 'down' ? down() : up()).catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
