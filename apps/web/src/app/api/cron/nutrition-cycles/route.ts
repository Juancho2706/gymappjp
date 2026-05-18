import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago } from '@/lib/date-utils'
import { runNutritionCyclesAutomation } from '@/lib/nutrition-cycle-automation'

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${expected}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = createServiceRoleClient()
    const { iso } = getTodayInSantiago()
    const result = await runNutritionCyclesAutomation(supabase, iso)
    return NextResponse.json({ ok: true, date: iso, ...result })
  } catch (e) {
    console.error('[cron/nutrition-cycles]', e)
    return NextResponse.json({ ok: false, error: 'Cron failed' }, { status: 500 })
  }
}

