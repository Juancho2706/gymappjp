import Link from 'next/link'

export function EnterpriseAuthFooter() {
  return (
    <div className="mt-6 space-y-3 text-center">
      {/* MFA + isolation note */}
      <div className="flex items-center justify-center gap-1.5">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] font-medium text-zinc-600 whitespace-nowrap">Acceso restringido a administradores de organización</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {/* Coach redirect — subtle */}
      <p className="text-xs text-zinc-600">
        ¿Eres coach individual?{' '}
        <Link
          href="/login"
          className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        >
          Ingresar en eva-app.cl/login
        </Link>
      </p>
    </div>
  )
}
