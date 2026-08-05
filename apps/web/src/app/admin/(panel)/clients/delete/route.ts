import { NextRequest, NextResponse } from 'next/server'
import { deleteClientAction } from '../_actions/client-actions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')
    if (!clientId || !UUID.test(clientId)) {
        return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }
    const result = await deleteClientAction(clientId)
    return NextResponse.json(result)
}
