import { getGastos } from './_data/gastos.queries'
import { GastosClient } from './GastosClient'
import { Wallet } from 'lucide-react'

export const metadata = { title: 'Personal' }

export default async function PersonalPage() {
    const gastos = await getGastos()

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[--admin-border] bg-[--admin-bg-surface]">
                    <Wallet className="h-4 w-4 text-[--admin-accent]" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Personal</h1>
                    <p className="text-xs text-[--admin-text-3]">Registro de gastos. Uso privado — no afecta la plataforma.</p>
                </div>
            </div>

            <GastosClient gastos={gastos} />
        </div>
    )
}
