import { NextRequest, NextResponse } from 'next/server'
import { updateClientAction } from '../_actions/client-actions'

export async function POST(req: NextRequest) {
    const formData = await req.formData()
    const result = await updateClientAction({}, formData)
    return NextResponse.json(result)
}
