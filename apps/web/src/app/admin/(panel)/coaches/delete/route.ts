import { NextRequest, NextResponse } from 'next/server'
import { deleteCoachAction } from '../_actions/coach-actions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const coachId = searchParams.get('coachId')
    if (!coachId || !UUID.test(coachId)) {
        return NextResponse.json({ error: 'coachId required' }, { status: 400 })
    }
    const result = await deleteCoachAction(coachId)
    return NextResponse.json(result)
}
