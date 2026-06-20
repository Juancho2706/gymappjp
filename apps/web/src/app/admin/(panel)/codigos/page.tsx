import { getCouponsForAdmin, type AdminCouponRow } from './_data/codigos.queries'
import { CouponMintForm } from './_components/CouponMintForm'
import { DeactivateButton } from './_components/DeactivateButton'

// Datos service-role siempre frescos (no cachear el catálogo de cupones).
export const dynamic = 'force-dynamic'

function discountLabel(c: AdminCouponRow): string {
    const val = c.discountType === 'percent' ? `${c.percentValue ?? 0}%` : `$${(c.amountOffClp ?? 0).toLocaleString('es-CL')}`
    const dur =
        c.duration === 'forever' ? 'de por vida' : c.duration === 'once' ? '1 ciclo' : `${c.durationInCycles ?? '?'} ciclos`
    return `${val} · ${c.fixedClpTarget} · ${dur}`
}

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[--admin-text-3]'
const td = 'px-3 py-2 text-sm text-[--admin-text-2]'

export default async function CodigosPage() {
    const coupons = await getCouponsForAdmin()

    return (
        <div className="space-y-6 p-4 md:p-6">
            <div>
                <h1 className="text-lg font-semibold text-[--admin-text-1]">Códigos de descuento</h1>
                <p className="text-xs text-[--admin-text-3]">
                    Cupones para coaches. El descuento se aplica server-side en el cobro (drift-safe). Reversa = desactivar
                    (vigentes honran su término).
                </p>
            </div>

            <CouponMintForm />

            <div className="overflow-x-auto rounded-lg border border-[--admin-border]">
                <table className="w-full border-collapse">
                    <thead className="bg-[--admin-bg-elevated]">
                        <tr>
                            <th className={th}>Código</th>
                            <th className={th}>Descuento</th>
                            <th className={th}>Canjes</th>
                            <th className={th}>Por cuenta</th>
                            <th className={th}>Estado</th>
                            <th className={th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {coupons.length === 0 && (
                            <tr>
                                <td className={td} colSpan={6}>
                                    Aún no hay códigos. Crea el primero arriba.
                                </td>
                            </tr>
                        )}
                        {coupons.map((c) => (
                            <tr key={c.codeId} className="border-t border-[--admin-border]">
                                <td className={`${td} font-mono text-[--admin-text-1]`}>
                                    {c.codeDisplay ?? c.codeNormalized}
                                    {c.firstTimeOnly && <span className="ml-2 text-[10px] text-[--admin-text-3]">1ª vez</span>}
                                    {c.restrictedToCoachId && <span className="ml-2 text-[10px] text-[--admin-text-3]">partner</span>}
                                </td>
                                <td className={td}>{discountLabel(c)}</td>
                                <td className={td}>
                                    {c.redeemedCount}
                                    {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                                </td>
                                <td className={td}>{c.perAccountLimit}</td>
                                <td className={td}>
                                    {c.active ? (
                                        <span className="text-emerald-500">activo</span>
                                    ) : (
                                        <span className="text-[--admin-text-3]">inactivo</span>
                                    )}
                                </td>
                                <td className={`${td} text-right`}>{c.active && <DeactivateButton codeId={c.codeId} />}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
