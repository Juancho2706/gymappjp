/**
 * Enterprise vs Standalone isolation + security test (runs against REMOTE Supabase).
 *
 * Creates temporary test coaches/clients, signs in as each via the anon key (so RLS applies),
 * asserts the isolation/security guarantees from the enterprise-isolation plan, then cleans up.
 *
 * Run:  node scripts/enterprise-isolation-test.mjs        (from apps/web, with .env.local present)
 *
 * Covers:
 *  - foods/exercises: standalone client sees own-coach catalog only; enterprise client sees org catalog only.
 *  - F13: a client cannot read another client's workout_session.
 *  - F15: an authenticated user cannot call the bulk_reassign_clients RPC.
 *
 * NOTE: ORG / JOSE ids are the "Gym Prueba" test org + its coach. Update if the test org changes.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : undefined }
const URL = get('NEXT_PUBLIC_SUPABASE_URL'), ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), SVC = get('SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(URL, SVC, { auth: { persistSession: false } })

const ORG = '5f07f6d6-8723-4d02-9010-180afe2a837b'   // Gym Prueba
const JOSE = '503412d0-77cc-4c7e-b1c2-dec81fb00ce6'  // Jose Fit (org coach)
const PW = 'TestPass123!'
let pass = 0, fail = 0
const ck = (n, c) => { if (c) { pass++; console.log('  OK  ', n) } else { fail++; console.log('  FAIL', n) } }
const macros = { serving_size: 100, serving_unit: 'g', calories: 1, protein_g: 1, carbs_g: 1, fats_g: 1 }
const FOODS = ['ISO_A_FOOD', 'ISO_B_FOOD', 'ISO_ORG_FOOD'], EXS = ['ISO_A_EX', 'ISO_B_EX', 'ISO_ORG_EX']

async function uid(email) {
  const { data: u } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (u?.user?.id) return u.user.id
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return data.users.find((x) => x.email === email)?.id
}
async function ensureCoach(email, name) {
  const id = await uid(email)
  const { data: code } = await admin.rpc('generate_unique_invite_code')
  await admin.from('coaches').upsert({ id, full_name: name, brand_name: name, slug: name.toLowerCase() + '-iso', invite_code: code, subscription_status: 'active', subscription_tier: 'pro' })
  return id
}
async function ensureClient(email, name, coach_id, org_id) {
  const id = await uid(email)
  await admin.from('clients').upsert({ id, full_name: name, email, coach_id, org_id, is_active: true, age_confirmed_at: new Date().toISOString() })
  return id
}
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(email + ': ' + error.message)
  return c
}

const aId = await ensureCoach('iso_coacha@test.eva', 'isocoacha')
const bId = await ensureCoach('iso_coachb@test.eva', 'isocoachb')
const caId = await ensureClient('iso_clienta@test.eva', 'ClientA', aId, null)
await ensureClient('iso_clientb@test.eva', 'ClientB', bId, null)
await ensureClient('iso_cliente@test.eva', 'ClientEnt', JOSE, ORG)

await admin.from('foods').delete().in('name', FOODS)
await admin.from('exercises').delete().in('name', EXS)
await admin.from('workout_sessions').delete().eq('client_id', caId)
await admin.from('foods').insert([{ name: 'ISO_A_FOOD', coach_id: aId, org_id: null, ...macros }, { name: 'ISO_B_FOOD', coach_id: bId, org_id: null, ...macros }, { name: 'ISO_ORG_FOOD', coach_id: null, org_id: ORG, ...macros }])
await admin.from('exercises').insert([{ name: 'ISO_A_EX', muscle_group: 'chest', coach_id: aId, org_id: null }, { name: 'ISO_B_EX', muscle_group: 'chest', coach_id: bId, org_id: null }, { name: 'ISO_ORG_EX', muscle_group: 'chest', coach_id: null, org_id: ORG }])
const { data: sess } = await admin.from('workout_sessions').insert({ client_id: caId }).select('id').single()

const ca = await signIn('iso_clienta@test.eva')
const af = ((await ca.from('foods').select('name').in('name', FOODS)).data || []).map((x) => x.name)
ck('clientA sees own-coach food', af.includes('ISO_A_FOOD'))
ck('clientA NOT sees other-coach food', !af.includes('ISO_B_FOOD'))
ck('clientA standalone NOT sees ORG food', !af.includes('ISO_ORG_FOOD'))
const ae = ((await ca.from('exercises').select('name').in('name', EXS)).data || []).map((x) => x.name)
ck('clientA sees own-coach exercise', ae.includes('ISO_A_EX'))
ck('clientA NOT sees other-coach/ORG exercise', !ae.includes('ISO_B_EX') && !ae.includes('ISO_ORG_EX'))
ck('clientA reads OWN workout_session', ((await ca.from('workout_sessions').select('id').eq('id', sess.id)).data || []).length === 1)

const cb = await signIn('iso_clientb@test.eva')
ck('clientB CANNOT read clientA workout_session (F13)', ((await cb.from('workout_sessions').select('id').eq('id', sess.id)).data || []).length === 0)

const ce = await signIn('iso_cliente@test.eva')
const ef = ((await ce.from('foods').select('name').in('name', FOODS)).data || []).map((x) => x.name)
ck('enterprise client sees ORG food, not standalone', ef.includes('ISO_ORG_FOOD') && !ef.includes('ISO_A_FOOD'))
const ee = ((await ce.from('exercises').select('name').in('name', EXS)).data || []).map((x) => x.name)
ck('enterprise client sees ORG exercise, not standalone', ee.includes('ISO_ORG_EX') && !ee.includes('ISO_A_EX'))

const rpc = await ca.rpc('bulk_reassign_clients', { p_from_coach_id: bId, p_to_coach_id: aId, p_org_id: ORG })
ck('authenticated CANNOT call bulk_reassign_clients (F15)', !!rpc.error)

// cleanup
await admin.from('foods').delete().in('name', FOODS)
await admin.from('exercises').delete().in('name', EXS)
await admin.from('workout_sessions').delete().eq('client_id', caId)
const emails = ['iso_coacha@test.eva', 'iso_coachb@test.eva', 'iso_clienta@test.eva', 'iso_clientb@test.eva', 'iso_cliente@test.eva']
const { data: all } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
const ids = all.users.filter((u) => emails.includes(u.email)).map((u) => u.id)
await admin.from('coach_client_assignments').delete().in('client_id', ids)
await admin.from('clients').delete().in('id', ids)
await admin.from('coaches').delete().in('id', ids)
for (const id of ids) await admin.auth.admin.deleteUser(id)

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
