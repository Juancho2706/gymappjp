import { NextResponse } from 'next/server'

// El slug (y el invite_code) son INMUTABLES: se fijan una sola vez al crear el coach.
// Este endpoint solía permitir cambiar el slug desde la app mobile; quedó deshabilitado
// por la política de inmutabilidad. Responde 410 Gone para builds antiguos que lo invoquen.
export async function POST() {
    return NextResponse.json(
        { error: 'La URL del coach es fija y no se puede cambiar.', code: 'SLUG_IMMUTABLE' },
        { status: 410 }
    )
}
