import Link from 'next/link'
import { ShieldX } from 'lucide-react'

export default function OrgNotFound() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
            <ShieldX className="w-10 h-10 text-muted-foreground" />
            <div>
                <h1 className="text-lg font-bold">Organización no encontrada</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    No tienes acceso o esta organización no existe.
                    <br />
                    Contacta a tu administrador si crees que es un error.
                </p>
            </div>
            <Link
                href="/coach/dashboard"
                className="text-sm text-violet-500 hover:underline"
            >
                Volver al panel
            </Link>
        </div>
    )
}
