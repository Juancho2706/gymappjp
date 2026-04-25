import { NextRequest, NextResponse } from 'next/server'
import { deleteClientAction } from '../_actions/client-actions'

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')
    if (!clientId) {
        return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }
    const result = await deleteClientAction(clientId)
    return NextResponse.json(result)
}
