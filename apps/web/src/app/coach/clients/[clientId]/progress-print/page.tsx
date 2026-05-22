import { notFound } from 'next/navigation'
import Image from 'next/image'
import { getClientProfileData } from '../_actions/client-detail.actions'

interface Props {
    params: Promise<{ clientId: string }>
}

export default async function ProgressPrintPage({ params }: Props) {
    const { clientId } = await params
    let data
    try {
        data = await getClientProfileData(clientId)
    } catch {
        notFound()
    }

    const { client, checkIns } = data
    const clientName = (client as { full_name?: string | null })?.full_name ?? 'Cliente'

    const sorted = [...(checkIns ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const firstWeight = sorted.at(-1)?.weight ?? null
    const lastWeight = sorted[0]?.weight ?? null
    const totalDelta = firstWeight != null && lastWeight != null ? lastWeight - firstWeight : null

    return (
        <html lang="es">
            <head>
                <meta charSet="utf-8" />
                <title>{`Progreso — ${clientName}`}</title>
                <style>{`
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: system-ui, sans-serif; color: #111; background: #fff; padding: 32px; }
                    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
                    .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
                    .summary { display: flex; gap: 24px; margin-bottom: 32px; }
                    .stat { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px 20px; }
                    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
                    .stat-value { font-size: 20px; font-weight: 700; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { text-align: left; border-bottom: 2px solid #111; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
                    td { padding: 8px 12px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }
                    tr:last-child td { border-bottom: none; }
                    .photo { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; }
                    .no-photo { width: 64px; height: 64px; background: #f0f0f0; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
                    .delta-pos { color: #ef4444; }
                    .delta-neg { color: #10b981; }
                    @media print {
                        body { padding: 16px; }
                        @page { margin: 16mm; }
                    }
                `}</style>
            </head>
            <body>
                <h1>{clientName}</h1>
                <p className="meta">
                    Informe de progreso · {new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>

                <div className="summary">
                    <div className="stat">
                        <p className="stat-label">Check-ins totales</p>
                        <p className="stat-value">{sorted.length}</p>
                    </div>
                    {firstWeight != null && (
                        <div className="stat">
                            <p className="stat-label">Peso inicial</p>
                            <p className="stat-value">{firstWeight} kg</p>
                        </div>
                    )}
                    {lastWeight != null && (
                        <div className="stat">
                            <p className="stat-label">Peso actual</p>
                            <p className="stat-value">{lastWeight} kg</p>
                        </div>
                    )}
                    {totalDelta != null && (
                        <div className="stat">
                            <p className="stat-label">Cambio total</p>
                            <p className={`stat-value ${totalDelta > 0 ? 'delta-pos' : 'delta-neg'}`}>
                                {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(1)} kg
                            </p>
                        </div>
                    )}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Foto</th>
                            <th>Fecha</th>
                            <th>Peso</th>
                            <th>Energía</th>
                            <th>Δ Peso</th>
                            <th>Notas</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((ci, idx) => {
                            const next = sorted[idx + 1]
                            const delta = ci.weight != null && next?.weight != null
                                ? ci.weight - next.weight
                                : null
                            const photo = (ci as { front_photo_url?: string | null }).front_photo_url

                            return (
                                <tr key={ci.id}>
                                    <td>
                                        {photo ? (
                                            <Image src={photo} alt="Check-in" width={64} height={64} className="photo" />
                                        ) : (
                                            <div className="no-photo">Sin foto</div>
                                        )}
                                    </td>
                                    <td>
                                        {new Date(ci.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td>{ci.weight != null ? `${ci.weight} kg` : '—'}</td>
                                    <td>{ci.energy_level != null ? `${ci.energy_level}/10` : '—'}</td>
                                    <td>
                                        {delta != null ? (
                                            <span className={delta > 0.05 ? 'delta-pos' : delta < -0.05 ? 'delta-neg' : ''}>
                                                {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td style={{ maxWidth: 200, fontSize: 11, color: '#555' }}>
                                        {(ci as { notes?: string | null }).notes?.slice(0, 100) ?? ''}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                <script dangerouslySetInnerHTML={{ __html: 'window.onload = function() { window.print(); }' }} />
            </body>
        </html>
    )
}
