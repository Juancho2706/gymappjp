'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Palette, Building2, CreditCard, Check, ExternalLink } from 'lucide-react'
import { useDemoState, useDemoActions } from '../../_providers/DemoStateProvider'
import { MOVIDA_BRAND, movidaInvoices } from '../../_mock'

const PRESET_COLORS = ['#0D9488', '#2563EB', '#7C3AED', '#DC2626', '#EA580C', '#0891B2', '#059669', '#9333EA']

export default function SettingsPage() {
    const { org } = useDemoState()
    const actions = useDemoActions()
    const [selectedColor, setSelectedColor] = useState(org.primary_color ?? '#0D9488')
    const [showPaymentModal, setShowPaymentModal] = useState(false)

    function handleColorChange(color: string) {
        setSelectedColor(color)
        actions.updateOrgBranding(color)
    }

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold">Configuración</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Marca, organización y facturación</p>
            </div>

            {/* Branding section */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-teal-500" />
                    <h2 className="text-sm font-semibold">White-label · Marca Movida</h2>
                </div>

                {/* Logo preview */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2">Logo actual</p>
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-border bg-zinc-950 px-6 py-3">
                            <Image src="/logomovida.png" alt="Movida" width={120} height={40} className="h-10 w-auto object-contain" />
                        </div>
                        <div className="rounded-xl border border-border bg-background px-6 py-3">
                            <Image src="/logomovida.png" alt="Movida" width={120} height={40} className="h-10 w-auto object-contain" />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Vista en modo oscuro y claro</p>
                </div>

                {/* Color picker */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2">Color primario de marca</p>
                    <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map(color => (
                            <button
                                key={color}
                                onClick={() => handleColorChange(color)}
                                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 relative"
                                style={{
                                    backgroundColor: color,
                                    borderColor: selectedColor === color ? 'white' : 'transparent',
                                    boxShadow: selectedColor === color ? `0 0 0 2px ${color}` : 'none',
                                }}
                            >
                                {selectedColor === color && <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto" />}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: selectedColor }} />
                        <span className="text-xs font-mono text-muted-foreground">{selectedColor}</span>
                        <span className="text-[10px] text-muted-foreground">— color aplicado en app de alumnos</span>
                    </div>
                </div>

                {/* Live preview */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2">Preview en vivo (botón en app alumno)</p>
                    <button
                        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all"
                        style={{ backgroundColor: selectedColor }}
                    >
                        Iniciar entrenamiento
                    </button>
                </div>

                <div>
                    <p className="text-xs text-muted-foreground mb-1">Mensaje de bienvenida</p>
                    <div className="rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                        {MOVIDA_BRAND.welcomeMessage}
                    </div>
                </div>
            </section>

            {/* Org info */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-violet-500" />
                    <h2 className="text-sm font-semibold">Datos de la organización</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Nombre</p>
                        <p className="font-medium">{MOVIDA_BRAND.legalName}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">RUT</p>
                        <p className="font-medium">{MOVIDA_BRAND.rut}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Dirección</p>
                        <p className="font-medium">{MOVIDA_BRAND.address}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Teléfono</p>
                        <p className="font-medium">{MOVIDA_BRAND.phone}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Email</p>
                        <p className="font-medium">{MOVIDA_BRAND.email}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Dominio</p>
                        <p className="font-medium">{MOVIDA_BRAND.domain}</p>
                    </div>
                </div>
            </section>

            {/* Billing */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-500" />
                        <h2 className="text-sm font-semibold">Facturación</h2>
                    </div>
                    <button
                        onClick={() => setShowPaymentModal(true)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/5"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Generar link de pago
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Plan</p>
                        <p className="font-medium">Enterprise · 12 seats</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Monto mensual</p>
                        <p className="font-medium">$149.990 + IVA</p>
                    </div>
                </div>

                <div>
                    <p className="text-xs text-muted-foreground mb-2">Historial de pagos</p>
                    <div className="space-y-1.5">
                        {movidaInvoices.map(inv => (
                            <div key={inv.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                                <div>
                                    <p className="text-xs font-medium">{inv.month}</p>
                                    <p className="text-[10px] text-muted-foreground">{inv.method}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-medium">${inv.amount_clp.toLocaleString('es-CL')}</p>
                                    <span className={`text-[10px] font-medium ${inv.status === 'paid' ? 'text-emerald-500' : inv.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}>
                                        {inv.status === 'paid' ? '✓ Pagado' : inv.status === 'pending' ? 'Pendiente' : 'Vencido'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Payment modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
                        <h3 className="font-semibold">Link de pago generado</h3>
                        <p className="text-sm text-muted-foreground">
                            EVA envía un link de pago por MercadoPago o Webpay a <strong>contacto@movida.cl</strong> para el próximo ciclo.
                        </p>
                        <div className="rounded-lg bg-muted p-3 text-xs font-mono text-muted-foreground">
                            https://mpago.la/demo-movida-jun-2026 <span className="text-amber-400">[DEMO]</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Demo no contractual — este link no es real.</p>
                        <button
                            onClick={() => setShowPaymentModal(false)}
                            className="w-full rounded-lg py-2 text-sm font-medium text-white"
                            style={{ backgroundColor: '#0D9488' }}
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
