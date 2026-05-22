import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug, getOrgInvoices } from '../_data/org.queries'
import { OrgSettingsForm } from './_components/OrgSettingsForm'
import { OrgInvoiceList } from './_components/OrgInvoiceList'

export const metadata: Metadata = { title: 'Configuración' }

interface Props {
    params: Promise<{ slug: string }>
}

export default async function OrgSettingsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = org.myRole === 'org_owner' || org.myRole === 'org_admin'
    const invoices = await getOrgInvoices(org.id)

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold">Configuración</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Administra los datos de la organización</p>
            </div>

            {/* Org info */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <h2 className="text-sm font-semibold mb-3">Información</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Slug</p>
                        <p className="font-mono text-xs bg-muted px-2 py-1 rounded mt-0.5">{org.slug}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Plan</p>
                        <p className="font-medium capitalize">{org.plan}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Estado</p>
                        <p className={`font-medium capitalize ${org.status === 'active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {org.status}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Seats</p>
                        <p className="font-medium">{org.seats_included}</p>
                    </div>
                </div>
                {org.trial_ends_at && (
                    <p className="text-[11px] text-amber-500 mt-2">
                        Trial hasta: {new Date(org.trial_ends_at).toLocaleDateString('es-CL')}
                    </p>
                )}
            </div>

            {/* Editable settings — admins only */}
            {isAdmin ? (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold mb-3">Branding</h2>
                    <OrgSettingsForm orgSlug={slug} defaultName={org.name} defaultColor={org.primary_color ?? ''} currentLogoUrl={org.logo_url} />
                </div>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                    Solo admins pueden editar la configuración.
                </p>
            )}

            {/* Billing info + invoices */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div>
                    <h2 className="text-sm font-semibold mb-1">Billing</h2>
                    <p className="text-sm text-muted-foreground">
                        Facturación gestionada manualmente. Contacta a{' '}
                        <a href="mailto:contacto@eva-app.cl" className="text-violet-500 hover:underline">
                            contacto@eva-app.cl
                        </a>{' '}
                        para cambios de plan o seats.
                    </p>
                </div>
                {invoices.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Historial de facturas</p>
                        <OrgInvoiceList invoices={invoices} />
                    </div>
                )}
            </div>
        </div>
    )
}
