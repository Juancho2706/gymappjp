import { NextRequest, NextResponse } from 'next/server'
import { deleteCoachAction } from '../_actions/coach-actions'

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const coachId = searchParams.get('coachId')
    if (!coachId) {
        return NextResponse.json({ error: 'coachId required' }, { status: 400 })
    }
    const result = await deleteCoachAction(coachId)
    return NextResponse.json(result)
}
