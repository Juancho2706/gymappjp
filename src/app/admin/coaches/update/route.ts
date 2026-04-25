import { NextRequest, NextResponse } from 'next/server'
import { updateCoachAction } from '../_actions/coach-actions'

export async function POST(req: NextRequest) {
    const formData = await req.formData()
    const result = await updateCoachAction({}, formData)
    return NextResponse.json(result)
}
